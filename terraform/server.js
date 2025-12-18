/**
 * FFmpeg Render Server - 성능 최적화 버전
 * 
 * 변경점:
 * 1. 정규화 단계 제거 → filter_complex에서 직접 scale
 * 2. 단일 FFmpeg 명령으로 통합 (인코딩 1회)
 * 3. ultrafast 프리셋 사용
 */

const express = require("express");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const execAsync = promisify(exec);
const app = express();
app.use(express.json({ limit: "100mb" }));

// GCS Storage 초기화 - VM 기본 인증 (metadata service) 사용
console.log("[GCS] Using default credentials (VM metadata)");
const storage = new Storage();
const TEMP_DIR = "/tmp/ffmpeg-render";

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================
// 폰트 경로 설정 - 헤더/푸터용 + 자막용 분리
// =====================
const findFonts = () => {
    // 헤더/푸터용 폰트 (NanumSquareRound Bold - 둥글고 부드러운 고딕체)
    const headerFontCandidates = [
        "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf", // ExtraBold - 가장 굵음
        "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",  // Bold - 둥근 고딕
        "/usr/share/fonts/truetype/nanum/NanumSquareEB.ttf",      // ExtraBold
        "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",       // Bold
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ];

    // 자막용 폰트 (NanumSquareRound - 둥글고 부드러운 고딕체)
    const subtitleFontCandidates = [
        "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",  // Bold - 둥근 고딕
        "/usr/share/fonts/truetype/nanum/NanumSquareRoundR.ttf",  // Regular - 둥근 고딕
        "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ];

    let headerFont = null;
    let subtitleFont = null;

    for (const p of headerFontCandidates) {
        if (fs.existsSync(p)) {
            headerFont = p;
            console.log(`[FONT] Header font: ${p}`);
            break;
        }
    }

    for (const p of subtitleFontCandidates) {
        if (fs.existsSync(p)) {
            subtitleFont = p;
            console.log(`[FONT] Subtitle font: ${p}`);
            break;
        }
    }

    // 폴백
    const fallback = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    return {
        header: headerFont || fallback,
        subtitle: subtitleFont || fallback
    };
};

// font_settings를 PEANUT_STYLE과 병합하는 함수
function getMergedStyle(fontSettings) {
    if (!fontSettings) return PEANUT_STYLE;
    const merged = JSON.parse(JSON.stringify(PEANUT_STYLE));
    if (fontSettings.header_korean) {
        if (fontSettings.header_korean.size) merged.header.font_size = fontSettings.header_korean.size;
        if (fontSettings.header_korean.max_chars_per_line) merged.header.max_chars_per_line = fontSettings.header_korean.max_chars_per_line;
    }
    if (fontSettings.header_english) {
        if (fontSettings.header_english.size) {
        merged.header_english.font_size = fontSettings.header_english.size;
        }
        if (fontSettings.header_english.y_offset !== undefined) {
            merged.header_english.y_offset = fontSettings.header_english.y_offset;
        }
    }
    if (fontSettings.subtitle_korean) {
        if (fontSettings.subtitle_korean.size) {
            merged.subtitle.font_size = fontSettings.subtitle_korean.size;
            merged.subtitle_interviewer.font_size = fontSettings.subtitle_korean.size;
        }
        if (fontSettings.subtitle_korean.max_lines) merged.subtitle.max_lines = fontSettings.subtitle_korean.max_lines;
    }
    if (fontSettings.subtitle_english) {
        if (fontSettings.subtitle_english.size) {
        merged.subtitle_english.font_size = fontSettings.subtitle_english.size;
        merged.subtitle_interviewer_english.font_size = fontSettings.subtitle_english.size;
        }
        if (fontSettings.subtitle_english.max_lines) {
            merged.subtitle_english.max_lines = fontSettings.subtitle_english.max_lines;
            merged.subtitle_interviewer_english.max_lines = fontSettings.subtitle_english.max_lines;
        }
    }
    if (fontSettings.footer_korean && fontSettings.footer_korean.size) {
        merged.footer.font_size = fontSettings.footer_korean.size;
    }
    if (fontSettings.footer_english) {
        if (fontSettings.footer_english.size) {
        merged.footer_english.font_size = fontSettings.footer_english.size;
        }
        if (fontSettings.footer_english.y_offset !== undefined) {
            merged.footer_english.y_offset = fontSettings.footer_english.y_offset;
        }
    }
    console.log('[FONT_SETTINGS] Applied:', JSON.stringify({h:merged.header.font_size,he:merged.header_english.font_size,he_y:merged.header_english.y_offset,s:merged.subtitle.font_size,se:merged.subtitle_english.font_size,f:merged.footer.font_size,fe:merged.footer_english.font_size,fe_y:merged.footer_english.y_offset,h_max:merged.header.max_chars_per_line}));
    return merged;
}


const FONTS = findFonts();
const FONT_PATH = FONTS.header;  // 기존 코드 호환용
const SUBTITLE_FONT_PATH = FONTS.subtitle;
console.log(`[FONT] Header: ${FONT_PATH}`);
console.log(`[FONT] Subtitle: ${SUBTITLE_FONT_PATH}`);

// =====================
// 땅콩이 스타일 설정 (img_4.png 보리와냥이 스타일)
// =====================
// 레이아웃 구조 (1920 기준):
// - 상단 여백: 50px (2.6%)
// - 헤더 한글: ~140px (2줄)
// - 헤더 영문: ~40px
// - 헤더-영상 간격: 30px
// - 영상 시작: ~310px (16%)
// - 영상 높이: 55% (1056px)
// - 영상 끝: ~1366px (71%)
// - 영상-채널명 간격: 100px
// - 채널명: 1466px (76%)
// - 하단 여백: 충분
const PEANUT_STYLE = {
    video_height_percent: 55, // 영상 높이 55% (1056px) - Crop 45%
    video_y_percent: 22.7, // 영상 시작 위치 (435px) - 영문-영상 간격 29px
    video_full_width: false, // 가로 fit 모드 (상하 잘림 방지, 좌우 검은 여백)
    header: {
        font_size: 16, // 헤더 폰트 (64에서 축소)
        color: "0xF5DEB3", // 베이지/골드색
        border_color: "0x000000",
        border_width: 8, // 두꺼운 검정 테두리 (5 → 8)
        shadow_x: 4, // 그림자 X 오프셋
        shadow_y: 4, // 그림자 Y 오프셋
        shadow_color: "0x000000@0.7", // 그림자 색상 (반투명 검정)
        y_percent: 6, // 상단 115px 여백
        max_chars_per_line: 14,
    },
    header_english: {
        font_size: 10, // 영문 폰트 크기
        color: "0xAAAAAA", // 연한 회색
        border_color: "0x222222",
        border_width: 5, // 볼드 효과 (4 → 5)
        shadow_x: 3,
        shadow_y: 3,
        shadow_color: "0x000000@0.5",
        y_offset: 115, // 한글-영문 간격 115px
    },
    footer: {
        font_size: 72, // 푸터 한글 폰트
        color: "0x8B7355", // 진하고 흐릿한 베이지
        border_color: "0x000000",
        border_width: 8, // 두꺼운 검정 테두리 (5 → 8)
        shadow_x: 4,
        shadow_y: 4,
        shadow_color: "0x000000@0.7",
        y_percent: 80.7, // 푸터 위치 (영상끝+58px)
    },
    footer_english: {
        font_size: 28, // 영문 푸터 표시
        color: "0xAAAAAA", // 연한 회색
        border_color: "0x333333",
        border_width: 3, // (2 → 3)
        shadow_x: 2,
        shadow_y: 2,
        shadow_color: "0x000000@0.5",
        y_offset: 80, // 한글-영문 간격
    },
    subtitle: {
        font_size: 30, // 자막 크기 감소 (42 → 30)
        color: "0xFFFFFF", // 흰색
        border_color: "0x000000",
        border_width: 4, // 테두리도 비례 축소 (6 → 4)
        shadow_x: 2,
        shadow_y: 2,
        shadow_color: "0x000000@0.8",
        y_percent: 55,
    },
    subtitle_english: {
        font_size: 15, // 영문 자막 크기 (24 → 15)
        color: "0xFFFFFF", // 흰색
        border_color: "0x000000",
        border_width: 2, // 테두리도 비례 축소 (3 → 2)
        shadow_x: 2,
        shadow_y: 2,
        shadow_color: "0x000000@0.6",
        y_percent: 58, // 한글 자막 바로 아래 (65 → 58)
    },
    subtitle_interviewer: {
        font_size: 30, // 인터뷰어 자막도 동일하게 (46 → 30)
        color: "0xFFFFFF",
        border_color: "0x000000",
        border_width: 4, // 테두리 비례 축소 (6 → 4)
        shadow_x: 2,
        shadow_y: 3,
        shadow_color: "0x000000@0.8",
        y_percent: 62,
    },
    subtitle_interviewer_english: {
        font_size: 15, // 영문 인터뷰어 자막도 동일하게 (28 → 15)
        color: "0xFFFFFF",
        border_color: "0x000000",
        border_width: 2, // 테두리 비례 축소 (3 → 2)
        shadow_x: 2,
        shadow_y: 2,
        shadow_color: "0x000000@0.6",
        y_percent: 65,
    },
};

// =====================
// 쇼핑 쇼츠 스타일 설정
// =====================
const SHOPPING_STYLE = {
    video_height_percent: 70, // 제품이 더 잘 보이게 화면 비율 키움
    header: {
        font_size: 60,
        color: "0xFFFFFF",
        border_color: "0xFF0000", // 강렬한 빨간색 테두리로 주목도 상승
        border_width: 5,
        y_percent: 12,
        max_chars_per_line: 12,
    },
    header_english: {
        font_size: 30,
        color: "0xFFFFFF",
        border_color: "0x000000",
        border_width: 3,
        y_offset: 70,
    },
    footer: {
        font_size: 55,
        color: "0xFFFF00", // 노란색으로 구매 유도
        border_color: "0x000000",
        border_width: 4,
        y_percent: 88,
    },
    subtitle: {
        font_size: 50,
        color: "0xFFFFFF",
        border_color: "0x000000",
        border_width: 4,
        y_percent: 75, // 하단에 배치
    },
    subtitle_english: {
        font_size: 28,
        color: "0xCCCCCC",
        border_color: "0x000000",
        border_width: 2,
        y_percent: 80,
    },
};

// =====================
// 헬퍼 함수들
// =====================
const removeEmojis = (text) => {
    if (!text) return "";
    return text
        .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
        .replace(/[\u{2600}-\u{26FF}]/gu, "")
        .replace(/[\u{2700}-\u{27BF}]/gu, "")
        .trim();
};

const MAX_CHARS_PER_LINE_ENG = 25; // 영어 자막 줄바꿈 기준

// 텍스트 이스케이프 함수 (FFmpeg drawtext용)
const escapeText = (text, keepEmoji = false) => {
    const cleanText = keepEmoji ? text?.trim() || "" : removeEmojis(text);
    // FFmpeg drawtext 특수문자 이스케이프
    return cleanText
        .replace(/\$/g, "달러")       // $ → 달러 (FFmpeg에서 $가 누락되는 문제 해결)
        .replace(/\|/g, " - ")        // | → 하이픈으로 대체 (FFmpeg 필터 구분자 충돌 방지)
        .replace(/%/g, "퍼센트")      // % → 퍼센트 (FFmpeg drawtext에서 %는 특수문자, shell 이스케이프 문제)
        .replace(/'/g, "\u2019")      // 작은따옴표 → 유니코드
        .replace(/"/g, "\u201D")      // 큰따옴표 → 유니코드
        .replace(/\\/g, "\\\\")       // 백슬래시
        .replace(/:/g, "\\:")         // 콜론
        .replace(/\[/g, "\\[")        // 대괄호
        .replace(/\]/g, "\\]")
        .replace(/,/g, "\\,")         // 콤마
        .replace(/;/g, "\\;");        // 세미콜론
};

const cleanSubtitleText = (text) => {
    if (!text) return "";
    let cleaned = text.replace(/콩파민[!！]?/g, "").trim();
    cleaned = cleaned.replace(/[ \t]+/g, " ");  // Preserve newlines, only collapse spaces
    cleaned = cleaned.replace(/\.{2,}\s*/g, "... ");
    return cleaned;
};

// =====================
// 동적 폰트 크기 계산 (자막이 화면에 맞도록)
// =====================
const calculateDynamicFontSize = (text, baseFontSize, screenWidth, maxLines = 3) => {
    if (!text) return { fontSize: baseFontSize, needsReduction: false };

    const cleaned = cleanSubtitleText(text);
    const textLength = cleaned.length;

    // 기본 설정: 한글 기준 폰트 크기 대비 글자 너비 비율 (약 0.6~0.8)
    const charWidthRatio = 0.7;
    const availableWidth = screenWidth * 0.85; // 화면의 85% 사용

    // 한 줄에 들어갈 수 있는 글자 수
    const charsPerLine = Math.floor(availableWidth / (baseFontSize * charWidthRatio));
    const neededLines = Math.ceil(textLength / charsPerLine);

    // 최대 줄 수를 초과하면 폰트 크기 축소
    if (neededLines > maxLines) {
        // 필요한 축소 비율 계산
        const reductionRatio = Math.sqrt(maxLines / neededLines);
        const newFontSize = Math.max(Math.floor(baseFontSize * reductionRatio), 24); // 최소 24px
        return { fontSize: newFontSize, needsReduction: true, originalLines: neededLines };
    }

    return { fontSize: baseFontSize, needsReduction: false };
};

const splitSubtitleLines = (text, maxCharsPerLine) => {
    const cleaned = cleanSubtitleText(text);
    if (!cleaned) return [];
    
    // ★★★ 먼저 명시적 개행(\n)으로 분할 ★★★
    const explicitLines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const allLines = [];
    for (const line of explicitLines) {
        // 각 줄이 maxCharsPerLine 이하면 그대로 추가
        if (line.length <= maxCharsPerLine) {
            allLines.push(line);
            continue;
        }
        
        // 긴 줄은 추가 분할
        const MAX_LINES = 3;
        const neededLines = Math.min(Math.ceil(line.length / maxCharsPerLine), MAX_LINES);
        const targetCharsPerLine = Math.ceil(line.length / neededLines);
        let remaining = line;

        for (let i = 0; i < neededLines && remaining.length > 0; i++) {
            if (remaining.length <= targetCharsPerLine || i === neededLines - 1) {
                allLines.push(remaining.trim());
                break;
            }
            
            let splitIdx = remaining.lastIndexOf(" ", targetCharsPerLine);
            if (splitIdx === -1 || splitIdx < targetCharsPerLine * 0.3) {
                const commaIdx = remaining.lastIndexOf(",", targetCharsPerLine);
                const periodIdx = remaining.lastIndexOf(".", targetCharsPerLine);
                splitIdx = Math.max(commaIdx, periodIdx);
                if (splitIdx === -1 || splitIdx < targetCharsPerLine * 0.3) {
                    splitIdx = targetCharsPerLine;
                } else {
                    splitIdx += 1;
                }
            }
            
            allLines.push(remaining.substring(0, splitIdx).trim());
            remaining = remaining.substring(splitIdx).trim();
        }
    }
    
    return allLines.filter((l) => l.length > 0);
};

const splitHeaderLines = (text, maxChars = 12) => {
    if (!text) return [];
    const cleaned = removeEmojis(text).trim();
    if (cleaned.length <= maxChars) return [cleaned];

    // N글자마다 줄바꿈 (공백 기준)
    const lines = [];
    let remaining = cleaned;
    while (remaining.length > 0) {
        if (remaining.length <= maxChars) {
            lines.push(remaining.trim());
            break;
        }
        let splitIdx = remaining.lastIndexOf(" ", maxChars);
        if (splitIdx === -1 || splitIdx < maxChars / 2) splitIdx = maxChars;
        lines.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
    }
    return lines;
};

const splitEnglishSubtitleLines = (text, maxCharsPerLine) => {
    if (!text) return [];
    const cleaned = text.trim();
    
    // ★★★ 먼저 명시적 개행(\n)으로 분할 ★★★
    const explicitLines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const allLines = [];
    for (const line of explicitLines) {
        if (line.length <= maxCharsPerLine) {
            allLines.push(line);
            continue;
        }
        
        const neededLines = Math.ceil(line.length / maxCharsPerLine);
        const targetCharsPerLine = Math.ceil(line.length / neededLines);
        let remaining = line;

        for (let i = 0; i < neededLines && remaining.length > 0; i++) {
            if (remaining.length <= targetCharsPerLine || i === neededLines - 1) {
                allLines.push(remaining.trim());
                break;
            }
            let splitIdx = remaining.lastIndexOf(" ", targetCharsPerLine);
            if (splitIdx === -1 || splitIdx < targetCharsPerLine * 0.5) {
                splitIdx = remaining.indexOf(" ", targetCharsPerLine);
            }
            if (splitIdx === -1) splitIdx = targetCharsPerLine;
            allLines.push(remaining.substring(0, splitIdx).trim());
            remaining = remaining.substring(splitIdx).trim();
        }
    }
    return allLines.filter((l) => l.length > 0);
};

// =====================
// YouTube 오디오 추출 API (yt-dlp + ffmpeg)
// =====================
app.post("/extract-audio", async (req, res) => {
    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    const startTime = Date.now();

    try {
        fs.mkdirSync(jobDir, { recursive: true });

        const {
            youtube_url,
            format = "mp3",
            quality = "128",
            output_bucket = "shorts-audio-storage-mcp-test-457809",
        } = req.body;

        if (!youtube_url) {
            return res.status(400).json({ error: "youtube_url is required" });
        }

        // YouTube Video ID 추출
        const videoIdMatch = youtube_url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : jobId;

        console.log(`[${jobId}] 🎵 Extracting audio from: ${youtube_url}`);
        console.log(`[${jobId}] Video ID: ${videoId}, Format: ${format}, Quality: ${quality}k`);

        const audioFilePath = path.join(jobDir, `audio.${format}`);

        // yt-dlp로 오디오 추출
        const ytdlpCmd = `yt-dlp -x --audio-format ${format} --audio-quality ${quality}k -o "${audioFilePath}" "${youtube_url}"`;
        console.log(`[${jobId}] Running: ${ytdlpCmd}`);

        const ytdlpStart = Date.now();
        await execAsync(ytdlpCmd, { timeout: 300000 });
        const ytdlpTime = ((Date.now() - ytdlpStart) / 1000).toFixed(2);
        console.log(`[${jobId}] yt-dlp completed: ${ytdlpTime}s`);

        // 실제 파일 경로 찾기 (yt-dlp가 확장자를 변경할 수 있음)
        const files = fs.readdirSync(jobDir);
        const audioFile = files.find(f => f.startsWith("audio."));
        if (!audioFile) {
            throw new Error("Audio file not found after extraction");
        }
        const actualAudioPath = path.join(jobDir, audioFile);

        // 오디오 길이 측정
        let durationSeconds = 0;
        try {
            const { stdout } = await execAsync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${actualAudioPath}"`
            );
            durationSeconds = parseFloat(stdout.trim());
        } catch (e) {
            console.log(`[${jobId}] Warning: Could not get duration: ${e.message}`);
        }

        console.log(`[${jobId}] Audio duration: ${durationSeconds.toFixed(2)}s`);

        // GCS 업로드
        const outputPath = `youtube-audio/${videoId}_${Date.now()}.${format}`;
        const bucket = storage.bucket(output_bucket);

        await bucket.upload(actualAudioPath, {
            destination: outputPath,
            metadata: { contentType: `audio/${format === "mp3" ? "mpeg" : format}` },
        });

        const audioUrl = `https://storage.googleapis.com/${output_bucket}/${outputPath}`;

        // 정리
        fs.rmSync(jobDir, { recursive: true, force: true });

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[${jobId}] ✅ Audio extraction complete: ${totalTime}s`);

        res.json({
            success: true,
            job_id: jobId,
            video_id: videoId,
            audio_url: audioUrl,
            duration_seconds: durationSeconds,
            format: format,
            quality: quality,
            performance: {
                total_time_seconds: parseFloat(totalTime),
                ytdlp_time_seconds: parseFloat(ytdlpTime),
            },
        });

    } catch (error) {
        console.error(`[${jobId}] ❌ Error:`, error.message);
        if (fs.existsSync(jobDir)) {
            fs.rmSync(jobDir, { recursive: true, force: true });
        }
        res.status(500).json({ error: error.message, job_id: jobId });
    }
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", ffmpeg: true, optimized: true, timestamp: new Date().toISOString() });
});

app.get("/version", async (req, res) => {
    try {
        const { stdout } = await execAsync("ffmpeg -version | head -1");
        res.json({ version: stdout.trim(), optimized: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/fonts", async (req, res) => {
    try {
        const { stdout } = await execAsync("fc-list :lang=ko | head -10");
        res.json({ fonts: stdout.trim().split("\n") });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// 쇼핑 쇼츠 렌더링 API
// =====================
app.post("/render/shop", async (req, res) => {
    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    const startTime = Date.now();

    try {
        fs.mkdirSync(jobDir, { recursive: true });

        const {
            videos,
            bgm_url,
            bgm_volume = 0.2,
            title_text,     // header_text 대응
            sub_title_text, // header_text_english 대응
            cta_text,       // footer_text 대응
            subtitle_enabled = true,
            subtitle_english_enabled = false,
            width = 1080,
            height = 1920,
            output_bucket,
            output_path,
            folder_name,
            font_settings,
        } = req.body;

        // 매핑: 클라이언트 용어 -> 내부 변수
        const header_text = title_text;
        const header_text_english = sub_title_text;
        const footer_text = cta_text || "지금 바로 구매하기 👉";

        if (!videos || !videos.length) {
            return res.status(400).json({ error: "No videos provided" });
        }

        console.log(`[${jobId}] 🚀 Starting SHOPPING render: ${videos.length} videos`);

        // 스타일 선택: SHOPPING_STYLE
        const CURRENT_STYLE = SHOPPING_STYLE;

        const SUBTITLE_WIDTH_PERCENT = 80;
        const availableWidth = Math.round(width * SUBTITLE_WIDTH_PERCENT / 100);
        const KOR_CHAR_WIDTH = 50;
        const ENG_CHAR_WIDTH = 20;
        const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);
        const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);

        // =====================
        // 1. 영상 다운로드 및 길이 측정
        // =====================
        console.log(`[${jobId}] [1/4] Downloading ${videos.length} videos...`);
        const downloadStart = Date.now();

        const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

        const downloadPromises = sortedVideos.map(async (video, i) => {
            const filePath = path.join(jobDir, `input_${i}.mp4`);
            const response = await axios({
                method: "GET",
                url: video.url,
                responseType: "arraybuffer",
                timeout: 120000,
            });
            fs.writeFileSync(filePath, Buffer.from(response.data));

            let duration = video.duration || 5;
            try {
                const { stdout } = await execAsync(
                    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
                );
                duration = parseFloat(stdout.trim());
            } catch { }

            return { index: i, filePath, duration, video };
        });

        const downloadedVideos = await Promise.all(downloadPromises);
        downloadedVideos.sort((a, b) => a.index - b.index);

        const downloadTime = ((Date.now() - downloadStart) / 1000).toFixed(2);
        const totalDuration = downloadedVideos.reduce((sum, v) => sum + v.duration, 0);

        // =====================
        // 2. 자막 데이터 생성
        // =====================
        console.log(`[${jobId}] [2/4] Preparing subtitles...`);
        const subtitles = [];
        let currentTime = 0;

        for (const { duration, video, index } of downloadedVideos) {
            const sceneNum = video.index || (index + 1);
            // 쇼핑숏츠는 narration 필드를 주로 사용
            const narration = video.narration || video.description || "";
            const narrationEnglish = video.transcription || ""; // 영어 자막이 있다면

            if (narration && subtitle_enabled) {
                const subStart = currentTime + 0.2;
                const subEnd = currentTime + duration - 0.2;
                subtitles.push({
                    start: subStart,
                    end: subEnd,
                    text: narration,
                    text_english: narrationEnglish,
                    scene_index: sceneNum,
                });
            }
            currentTime += duration;
        }

        // =====================
        // 3. BGM 다운로드
        // =====================
        let bgmPath = null;
        if (bgm_url) {
            bgmPath = path.join(jobDir, "bgm.mp3");
            const bgmResponse = await axios({
                method: "GET",
                url: bgm_url,
                responseType: "arraybuffer",
                timeout: 60000,
            });
            fs.writeFileSync(bgmPath, Buffer.from(bgmResponse.data));
        }

        // =====================
        // 4. FFmpeg 렌더링
        // =====================
        console.log(`[${jobId}] [4/4] Running SHOPPING FFmpeg render...`);
        const renderStart = Date.now();

        const videoHeight = Math.round(height * CURRENT_STYLE.video_height_percent / 100);
        const videoY = Math.round((height - videoHeight) / 2);
        const headerY = Math.round(height * CURRENT_STYLE.header.y_percent / 100);
        const footerY = Math.round(height * CURRENT_STYLE.footer.y_percent / 100);

        const inputFiles = downloadedVideos.map(v => `-i "${v.filePath}"`).join(" ");
        const numVideos = downloadedVideos.length;

        let videoScaleFilters = "";
        let concatInputs = "";
        let audioConcatInputs = "";

        for (let i = 0; i < numVideos; i++) {
            // 쇼핑 영상은 꽉 차게 보여주는게 좋으므로 force_original_aspect_ratio=increase 후 crop도 고려할 수 있으나
            // 일단 안전하게 decrease + pad 유지
            videoScaleFilters += `[${i}:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}];`;
            concatInputs += `[v${i}]`;
            audioConcatInputs += `[${i}:a]`;
        }

        const concatFilter = `${concatInputs}concat=n=${numVideos}:v=1:a=0[concatv];${audioConcatInputs}concat=n=${numVideos}:v=0:a=1[concata];`;
        const bgFilter = `color=black:s=${width}x${height}:d=${totalDuration}[bg];[bg][concatv]overlay=0:${videoY}[combined];`;

        const drawFilters = [];

        // 1. 헤더 (상품명/강조)
        const titleLines = splitHeaderLines(header_text || "", CURRENT_STYLE.header.max_chars_per_line);
        const titleLineHeight = CURRENT_STYLE.header.font_size + 10;
        let lastHeaderY = headerY;

        titleLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = headerY + (idx * titleLineHeight);
            lastHeaderY = lineY;
            drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${FONT_PATH}:fontsize=${CURRENT_STYLE.header.font_size}:fontcolor=${CURRENT_STYLE.header.color}:borderw=${CURRENT_STYLE.header.border_width}:bordercolor=${CURRENT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY}`);
        });

        // 영문 서브 헤더
        if (header_text_english) {
            const englishY = lastHeaderY + CURRENT_STYLE.header_english.y_offset;
            const escapedEnglish = escapeText(header_text_english);
            drawFilters.push(`drawtext=text='${escapedEnglish}':fontfile=${FONT_PATH}:fontsize=${CURRENT_STYLE.header_english.font_size}:fontcolor=${CURRENT_STYLE.header_english.color}:borderw=${CURRENT_STYLE.header_english.border_width}:bordercolor=${CURRENT_STYLE.header_english.border_color}:x=(w-text_w)/2:y=${englishY}`);
        }

        // 2. 자막
        subtitles.forEach((sub) => {
            const subStyle = CURRENT_STYLE.subtitle;
            const subEngStyle = CURRENT_STYLE.subtitle_english;
            const baseSubY = Math.round(height * subStyle.y_percent / 100);
            const lineHeight = subStyle.font_size + 8;

            const maxLines = subStyle.max_lines || 5;
            // max_lines가 1이면 줄바꿈 없이 한 줄로 표시
            let korLines;
            if (maxLines === 1) {
                korLines = [removeEmojis(sub.text || "").trim()];
            } else {
                korLines = splitSubtitleLines(sub.text || "", MAX_CHARS_PER_LINE);
            }
            console.log(`[DEBUG_SUB] Original: "${sub.text}"`);
            console.log(`[DEBUG_SUB] Split into ${korLines.length} lines:`, korLines);
            if (korLines.length > 0) {
                const korStartY = baseSubY;
                korLines.forEach((line, idx) => {
                    const escapedLine = escapeText(line);
                    console.log(`[DEBUG_SUB] Line ${idx}: "${line}" -> escaped: "${escapedLine}"`);
                    const lineY = korStartY + (idx * lineHeight);
                    drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${SUBTITLE_FONT_PATH}:fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}${enableFilter}`);
                });
            }

            if (subtitle_english_enabled && sub.text_english) {
                const engLines = splitEnglishSubtitleLines(sub.text_english, MAX_CHARS_PER_LINE_ENG);
                if (engLines.length > 0) {
                    const engStartY = baseSubY + (korLines.length * lineHeight) + 10;
                    engLines.forEach((line, idx) => {
                        const escapedLine = escapeText(line);
                        const lineY = engStartY + (idx * (subEngStyle.font_size + 5));
                        drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${SUBTITLE_FONT_PATH}:fontsize=${subEngStyle.font_size}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}:x=(w-text_w)/2:y=${lineY}${enableFilter}`);
                    });
                }
            }
        });

        // 3. CTA 푸터
        if (footer_text) {
            const escapedFooter = escapeText(footer_text, true); // 이모지 허용
            drawFilters.push(`drawtext=text='${escapedFooter}':fontfile=${FONT_PATH}:fontsize=${CURRENT_STYLE.footer.font_size}:fontcolor=${CURRENT_STYLE.footer.color}:borderw=${CURRENT_STYLE.footer.border_width}:bordercolor=${CURRENT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}`);
        }

        // 필터 결합
        const textOverlayFilters = drawFilters.length > 0 ? `[combined]${drawFilters.join(",")}[outv];` : `[combined]null[outv];`;

        // BGM
        let bgmInput = "";
        let audioFilter = "[concata]volume=1[aout]";
        if (bgmPath) {
            bgmInput = `-i "${bgmPath}"`;
            audioFilter = `[concata]volume=1[va];[${numVideos}:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
        }

        const filterComplex = `${videoScaleFilters}${concatFilter}${bgFilter}${textOverlayFilters}${audioFilter}`;
        const outputFilePath = path.join(jobDir, "final_shop_output.mp4");

        const ffmpegCmd = `ffmpeg -y ${inputFiles} ${bgmInput} -filter_complex "${filterComplex}" -map "[outv]" -map "[aout]" -c:v libx264 -preset ultrafast -crf 23 -threads 0 -c:a aac -b:a 128k -shortest "${outputFilePath}"`;

        console.log(`[${jobId}] Executing: ${ffmpegCmd}`);
        const { stderr } = await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 200 });
        if (stderr) console.log(`[${jobId}] Stderr (partial):`, stderr.slice(-500));

        const renderTime = ((Date.now() - renderStart) / 1000).toFixed(2);
        console.log(`[${jobId}] ✅ Shop Render complete: ${renderTime}s`);

        // GCS 업로드
        let publicUrl = "";
        if (!process.env.SKIP_UPLOAD) {
            const bucket = storage.bucket(output_bucket);
            await bucket.upload(outputFilePath, {
                destination: output_path,
                metadata: { contentType: "video/mp4" },
            });
            publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;
            fs.rmSync(jobDir, { recursive: true, force: true });
        }

        res.json({
            success: true,
            job_id: jobId,
            url: publicUrl,
            total_duration: totalDuration,
            render_time: renderTime
        });

    } catch (error) {
        console.error(`[${jobId}] ❌ Error:`, error.message);
        if (fs.existsSync(jobDir)) {
            fs.rmSync(jobDir, { recursive: true, force: true });
        }
        res.status(500).json({ error: error.message, job_id: jobId });
    }
});

// =====================
// 최적화된 렌더링 API
// =====================
app.post("/render/puppy", async (req, res) => {
    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    const startTime = Date.now();

    try {
        fs.mkdirSync(jobDir, { recursive: true });

        const {
            videos,
            bgm_url,
            bgm_volume = 0.15,
            bgm_volume_no_audio = 0.8,  // ★ 원본 오디오 없을 때 BGM 볼륨
            scene_audio_map = null,  // ★ 씬별 오디오 유무 [{scene_index, start_time, end_time, has_audio}]
            header_text,
            header_text_english,
            footer_text = "땅콩이네",
            footer_text_english, // 영문 푸터 추가
            subtitle_enabled = true,
            subtitle_english_enabled = false,
            timed_subtitles = null,
            subtitle_timing_mode = "timed", // "timed" or "always" // 시간대별 자막 배열 [{start_time, end_time, text_ko, text_en, color}]
            // ★★★ 비디오에 음성/자막이 이미 포함된 경우 레이아웃만 적용 ★★★
            skip_subtitle_overlay = false, // true: 자막 오버레이 건너뛰기 (비디오에 자막 포함)
            use_original_audio = false, // true: 원본 오디오 사용 (비디오에 음성 포함)
            has_audio = null, // ★ 클라이언트에서 오디오 유무 직접 지정 (true/false/null=자동감지)
            width = 1080,
            height = 1920,
            // ★★★ origin 모드: 영상이 가로 꽉 채우고 위아래만 여백 ★★★
            use_origin_size = false,
            origin_layout = null,
            video_scale_mode = "fit", // { video_area: {x, y, width, height}, header_area: {y, height}, ... }
            output_bucket,
            output_path,
            folder_name,
            font_settings,
            // ★★★ 크로스페이드 설정 ★★★
            enable_crossfade = true,
            crossfade_duration = 0.2,
        } = req.body;

        // 시간 문자열을 초로 변환 (MM:SS.ms 형식)
        console.log("[DEBUG] font_settings received:", JSON.stringify(font_settings));
        const currentStyle = getMergedStyle(font_settings);

        const parseTimeToSeconds = (timeStr) => {
            if (!timeStr) return 0;
            if (typeof timeStr === 'number') return timeStr;
            const parts = timeStr.split(':');
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseFloat(parts[1]) || 0;
            return minutes * 60 + seconds;
        };

        // 색상 맵핑
        const colorMap = {
            'white': '0xFFFFFF',
            'gold': '0xFFD700',
            'yellow': '0xFFFF00',
            'green': '0x00FF00',
            'silver': '0xC0C0C0',
            'bronze': '0xCD7F32',
            'red': '0xFF0000',
            'blue': '0x0000FF'
        };

        console.log(`[DEBUG_PAYLOAD] subtitle_english_enabled: ${subtitle_english_enabled}`);
        if (videos && videos.length > 0) {
            console.log(`[DEBUG_PAYLOAD] Video 0 narration_english: ${videos[0].dialogue?.script_english || videos[0].narration_english}`);
        }


        if (!videos || !videos.length) {
            return res.status(400).json({ error: "No videos provided" });
        }

        console.log(`[${jobId}] 🚀 Starting OPTIMIZED Puppy render: ${videos.length} videos`);
        if (skip_subtitle_overlay) console.log(`[${jobId}] ⏭️ Skipping subtitle overlay (video has embedded subtitles)`);
        if (use_original_audio) console.log(`[${jobId}] 🔊 Using original audio (video has embedded audio)`);

        // ★★★ 영상 실제 너비에 맞춰 자막 너비 동적 계산 ★★★
        const videoHeight = Math.round(height * PEANUT_STYLE.video_height_percent / 100);
        // 9:16 비율 기준 영상 실제 너비 (예: 1056px 높이 → 594px 너비)
        const actualVideoWidth = Math.round(videoHeight * 9 / 16);
        // 앞뒤 여유 10% (좌우 각 5%)
        const SUBTITLE_MARGIN_PERCENT = 10;
        const availableWidth = Math.round(actualVideoWidth * (100 - SUBTITLE_MARGIN_PERCENT) / 100);
        console.log(`[SUBTITLE] Video height: ${videoHeight}px, Actual video width: ${actualVideoWidth}px, Subtitle width: ${availableWidth}px`);

        const KOR_CHAR_WIDTH = 46; // 폰트 크기 46px 기준
        const ENG_CHAR_WIDTH = 18; // 영문 폰트 크기 28px 기준 (약 0.6배)
        const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);
        const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);
        console.log(`[SUBTITLE] Max chars per line - KOR: ${MAX_CHARS_PER_LINE}, ENG: ${MAX_CHARS_PER_LINE_ENG}`);

        // =====================
        // 1. 영상 다운로드 및 길이 측정 (병렬)
        // =====================
        console.log(`[${jobId}] [1/4] Downloading ${videos.length} videos...`);
        const downloadStart = Date.now();

        const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

        const downloadPromises = sortedVideos.map(async (video, i) => {
            const filePath = path.join(jobDir, `input_${i}.mp4`);
            const response = await axios({
                method: "GET",
                url: video.url,
                responseType: "arraybuffer",
                timeout: 120000,
            });
            fs.writeFileSync(filePath, Buffer.from(response.data));

            // 영상 길이 및 해상도 측정
            let duration = video.duration || 6;
            let srcWidth = 1080, srcHeight = 1920;
            try {
                const { stdout: durationOut } = await execAsync(
                    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
                );
                duration = parseFloat(durationOut.trim());

                const { stdout: sizeOut } = await execAsync(
                    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`
                );
                const [w, h] = sizeOut.trim().split(',').map(Number);
                if (w && h) { srcWidth = w; srcHeight = h; }
            } catch { }

            return { index: i, filePath, duration, video, srcWidth, srcHeight };
        });

        const downloadedVideos = await Promise.all(downloadPromises);
        downloadedVideos.sort((a, b) => a.index - b.index);

        const downloadTime = ((Date.now() - downloadStart) / 1000).toFixed(2);
        console.log(`[${jobId}] ✅ Download complete: ${downloadTime}s`);

        // 총 duration 계산
        const totalDuration = downloadedVideos.reduce((sum, v) => sum + v.duration, 0);
        console.log(`[${jobId}] Total duration: ${totalDuration.toFixed(2)}s`);

        // =====================
        // 2. 자막 데이터 생성
        // =====================
        console.log(`[${jobId}] [2/4] Preparing subtitles...`);
        console.log(`[${jobId}] [DEBUG] timed_subtitles received:`, JSON.stringify(timed_subtitles ? timed_subtitles.slice(0, 2) : null));
        const subtitles = [];

        // ★★★ timed_subtitles가 제공되면 시간대별 자막 사용 ★★★
        if (timed_subtitles && Array.isArray(timed_subtitles) && timed_subtitles.length > 0) {
            console.log(`[${jobId}] Using timed_subtitles: ${timed_subtitles.length} entries`);
            for (const sub of timed_subtitles) {
                const startSec = parseTimeToSeconds(sub.start_time);
                const endSec = parseTimeToSeconds(sub.end_time);
                const textKo = sub.text_ko || sub.text || "";
                const textEn = sub.text_en || sub.text_english || "";
                const color = colorMap[sub.color] || sub.color || '0xFFFFFF';

                subtitles.push({
                    start: startSec,
                    end: endSec,
                    text: textKo,
                    text_english: textEn,
                    color: color,
                    speaker: sub.speaker || "main",
                    position: sub.position || "center",  // ★ 위치 정보 추가 (center/right)
                    y_offset: sub.y_offset,      // ★ Y 위치 오프셋
                    font_size: sub.font_size,    // ★ 폰트 크기
                    max_chars: sub.max_chars,    // ★ 줄당 최대 글자
                });
                console.log(`[DEBUG_SUB] Timed: ${startSec.toFixed(2)}-${endSec.toFixed(2)} "${textKo.substring(0, 15)}..." pos=${sub.position || 'center'}`);
            }
        } else {
            // 기존 방식: narration 필드에서 자막 생성
            let currentTime = 0;
            for (const { duration, video, index } of downloadedVideos) {
                const sceneNum = video.index || (index + 1);
                const narration = video.dialogue?.script || video.dialogue?.interviewer || video.narration || "";
                const narrationKorean = video.narration_korean || narration;
                const narrationEnglish = video.dialogue?.script_english || video.narration_english || "";
                const isInterviewQuestion = video.is_interview_question || video.scene_type === "interview_question";
                const isPerformance = video.is_performance && !narration;

                // ★★★ 비디오별 timed_subtitles 지원 ★★★
                if (video.timed_subtitles && Array.isArray(video.timed_subtitles) && video.timed_subtitles.length > 0) {
                    console.log(`[DEBUG_SUB] Video ${sceneNum}: Using timed_subtitles (${video.timed_subtitles.length} entries)`);
                    for (const sub of video.timed_subtitles) {
                        const startSec = currentTime + (parseFloat(sub.start) || 0);
                        const endSec = currentTime + (parseFloat(sub.end) || 0);
                        const textKo = sub.korean || sub.text_ko || sub.text || "";
                        const textEn = sub.english || sub.text_en || sub.text_english || "";
                        
                        subtitles.push({
                            start: startSec,
                            end: endSec,
                            text: textKo,
                            text_english: textEn,
                            speaker: isInterviewQuestion ? "interviewer" : (video.speaker || "main"),
                            scene_index: sceneNum,
                        });
                    }
                } else if (narration && !isPerformance && subtitle_enabled) {
                    const subStart = currentTime + 0.3;
                    const subEnd = currentTime + duration - 0.3;

                    subtitles.push({
                        start: subStart,
                        end: subEnd,
                        text: narrationKorean,
                        text_english: narrationEnglish,
                        speaker: isInterviewQuestion ? "interviewer" : (video.speaker || "main"),
                        scene_index: sceneNum,
                    });
                }
                currentTime += duration;
            }
        }

        // =====================
        // 3. BGM 다운로드 (선택)
        // =====================
        let bgmPath = null;
        if (bgm_url) {
            console.log(`[${jobId}] [3/4] Downloading BGM...`);
            bgmPath = path.join(jobDir, "bgm.mp3");
            const bgmResponse = await axios({
                method: "GET",
                url: bgm_url,
                responseType: "arraybuffer",
                timeout: 60000,
            });
            fs.writeFileSync(bgmPath, Buffer.from(bgmResponse.data));
        } else {
            console.log(`[${jobId}] [3/4] No BGM, skipping...`);
        }

        // =====================
        // 4. ★★★ 단일 FFmpeg 명령으로 모든 처리 (최적화 핵심) ★★★
        // =====================
        console.log(`[${jobId}] [4/4] Running OPTIMIZED FFmpeg render...`);
        const renderStart = Date.now();

        // ★★★ origin_layout이 제공되면 커스텀 레이아웃 사용 ★★★
        let videoWidthFinal, videoHeightFinal, videoX, videoY, headerY, footerY;

        if (use_origin_size && origin_layout) {
            console.log(`[${jobId}] 🎯 Using ORIGIN layout: video ${origin_layout.video_area.width}x${origin_layout.video_area.height} at (${origin_layout.video_area.x}, ${origin_layout.video_area.y})`);
            videoWidthFinal = origin_layout.video_area.width;
            videoHeightFinal = origin_layout.video_area.height;
            videoX = origin_layout.video_area.x;
            videoY = origin_layout.video_area.y;
            headerY = origin_layout.header_area?.y || 30;
            footerY = origin_layout.footer_area?.y || (height - 80);
        } else {
            // 기존 PEANUT_STYLE 사용
            videoWidthFinal = width; // 가로 전체
            videoHeightFinal = Math.round(height * PEANUT_STYLE.video_height_percent / 100);
            videoX = 0;
            videoY = PEANUT_STYLE.video_y_percent
                ? Math.round(height * PEANUT_STYLE.video_y_percent / 100)
                : Math.round((height - videoHeightFinal) / 2);
            headerY = Math.round(height * PEANUT_STYLE.header.y_percent / 100);
            footerY = Math.round(height * PEANUT_STYLE.footer.y_percent / 100);
        }

        // 입력 파일 목록
        const inputFiles = downloadedVideos.map(v => `-i "${v.filePath}"`).join(" ");
        const numVideos = downloadedVideos.length;

        // 비디오 scale + setpts
        let videoScaleFilters = "";
        let concatInputs = "";
        let audioConcatInputs = "";
        
        // ★★★ 각 비디오별 오디오 유무 확인 (scene_audio_map 또는 ffprobe) ★★★
        const videoAudioStatus = [];
        const videoDurations = downloadedVideos.map(v => v.duration || 8);
        
        for (let i = 0; i < downloadedVideos.length; i++) {
            const v = downloadedVideos[i];
            // 1. scene_audio_map에서 해당 씬의 오디오 유무 확인
            if (scene_audio_map && Array.isArray(scene_audio_map)) {
                const sceneInfo = scene_audio_map.find(s => s.scene_index === (i + 1));
                if (sceneInfo) {
                    videoAudioStatus.push(sceneInfo.has_audio);
                    console.log(`[${jobId}] 🔊 Video ${i}: has_audio from scene_audio_map = ${sceneInfo.has_audio}`);
                    continue;
                }
            }
            // 2. 자동 감지: ffprobe로 오디오 스트림 확인
            try {
                const probeCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${v.filePath}"`;
                const probeResult = execSync(probeCmd, { encoding: 'utf8' }).trim();
                const hasVideoAudio = probeResult.length > 0;
                videoAudioStatus.push(hasVideoAudio);
                console.log(`[${jobId}] 🔊 Video ${i}: has_audio from ffprobe = ${hasVideoAudio}`);
            } catch (e) {
                videoAudioStatus.push(false);
                console.log(`[${jobId}] 🔊 Video ${i}: has_audio = false (ffprobe failed)`);
            }
        }
        
        // 오디오가 있는 비디오가 하나라도 있으면 hasAudio = true
        const hasAudio = videoAudioStatus.some(v => v);
        console.log(`[${jobId}] 🔊 Overall hasAudio: ${hasAudio}, per-video: [${videoAudioStatus.join(', ')}]`);

        for (let i = 0; i < numVideos; i++) {
            // ★★★ video_scale_mode: "fit" (검은여백) or "fill" (crop) ★★★
            if (use_origin_size && origin_layout) {
                console.log(`[DEBUG] video_scale_mode=${video_scale_mode}, videoSize=${videoWidthFinal}x${videoHeightFinal}`);
                if (video_scale_mode === "fill") {
                    // fill 모드: 영역을 꽉 채우고 넘치는 부분 crop
                    videoScaleFilters += `[${i}:v]scale=-2:${videoHeightFinal},crop=${videoWidthFinal}:${videoHeightFinal}:(iw-${videoWidthFinal})/2:0,setsar=1[v${i}];`;
                } else {
                    // fit 모드 (기본): 비율 유지, 검은 여백
                    videoScaleFilters += `[${i}:v]scale=${videoWidthFinal}:${videoHeightFinal}:force_original_aspect_ratio=decrease,pad=${videoWidthFinal}:${videoHeightFinal}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}];`;
                }
            } else if (PEANUT_STYLE.video_full_width) {
                videoScaleFilters += `[${i}:v]scale=${videoWidthFinal}:${videoHeightFinal}:force_original_aspect_ratio=decrease,pad=${videoWidthFinal}:${videoHeightFinal}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}];`;
            } else {
                videoScaleFilters += `[${i}:v]scale=${videoWidthFinal}:${videoHeightFinal}:force_original_aspect_ratio=decrease,pad=${videoWidthFinal}:${videoHeightFinal}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}];`;
            }
            concatInputs += `[v${i}]`;
            
            // ★★★ 비디오별 오디오 처리: 오디오 없으면 anullsrc로 무음 생성 ★★★
            // ★★★ enable_crossfade: 각 오디오에 페이드 인/아웃 적용으로 끊김 방지 ★★★
            if (hasAudio) {
                const fadeDur = enable_crossfade ? (crossfade_duration || 0.2) : 0;
                const videoDur = videoDurations[i];

                if (videoAudioStatus[i]) {
                    // 오디오 있는 비디오
                    if (fadeDur > 0 && numVideos > 1) {
                        // 페이드 인/아웃 적용 (첫 번째는 페이드인만, 마지막은 페이드아웃만)
                        const fadeInFilter = (i > 0) ? `afade=t=in:st=0:d=${fadeDur}` : "";
                        const fadeOutFilter = (i < numVideos - 1) ? `afade=t=out:st=${Math.max(0, videoDur - fadeDur)}:d=${fadeDur}` : "";
                        const fadeFilters = [fadeInFilter, fadeOutFilter].filter(f => f).join(",");

                        if (fadeFilters) {
                            videoScaleFilters += `[${i}:a]${fadeFilters}[a_fade${i}];`;
                            audioConcatInputs += `[a_fade${i}]`;
                        } else {
                            audioConcatInputs += `[${i}:a]`;
                        }
                    } else {
                        audioConcatInputs += `[${i}:a]`;
                    }
                } else {
                    // 오디오 없는 비디오: anullsrc로 무음 생성
                    const silentDuration = videoDurations[i];
                    videoScaleFilters += `anullsrc=channel_layout=stereo:sample_rate=48000:d=${silentDuration}[silent_a${i}];`;
                    audioConcatInputs += `[silent_a${i}]`;
                    console.log(`[${jobId}] 🔇 Video ${i}: Generated ${silentDuration}s silent audio`);
                }
            }
        }

        if (enable_crossfade) {
            console.log(`[${jobId}] 🔀 Crossfade enabled: ${crossfade_duration}s`);
        }

        // ★★★ 비디오 concat (오디오 유무에 따라 처리) ★★★
        let concatFilter;
        if (hasAudio) {
            // 하나라도 오디오가 있으면: 모든 오디오 concat (무음 포함)
            concatFilter = `${concatInputs}concat=n=${numVideos}:v=1:a=0[concatv];${audioConcatInputs}concat=n=${numVideos}:v=0:a=1[concata];`;
        } else if (bgm_url) {
            // 모든 비디오에 오디오 없고 BGM 있으면: 비디오만 concat
            concatFilter = `${concatInputs}concat=n=${numVideos}:v=1:a=0[concatv];`;
            console.log(`[${jobId}] No audio in any video, will use BGM as audio source`);
        } else {
            // 오디오도 없고 BGM도 없으면: 무음 오디오 생성
            concatFilter = `${concatInputs}concat=n=${numVideos}:v=1:a=0[concatv];anullsrc=channel_layout=stereo:sample_rate=48000:d=${totalDuration}[concata];`;
        }

        // 배경 생성 및 비디오 오버레이 (origin 모드에서는 videoX 사용)
        const bgFilter = `color=black:s=${width}x${height}:d=${totalDuration}[bg];[bg][concatv]overlay=${videoX}:${videoY}[combined];`;

        // =====================
        // 텍스트 필터 배열 생성 (콤마 문제 해결)
        // =====================
        const drawFilters = [];

        // 1. 헤더 필터 (그림자 효과 포함)
        const titleLinesKorean = splitHeaderLines(header_text || "", currentStyle.header.max_chars_per_line);
        const titleLineHeight = currentStyle.header.font_size + 10;
        let lastKoreanLineY = headerY;

        if (titleLinesKorean.length > 0) {
            titleLinesKorean.forEach((line, idx) => {
                const escapedLine = escapeText(line);
                const lineY = headerY + (idx * titleLineHeight);
                lastKoreanLineY = lineY;
                const shadowOpts = currentStyle.header.shadow_x ? `:shadowcolor=${currentStyle.header.shadow_color}:shadowx=${currentStyle.header.shadow_x}:shadowy=${currentStyle.header.shadow_y}` : '';
                drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${FONT_PATH}:fontsize=${currentStyle.header.font_size}:fontcolor=${currentStyle.header.color}:borderw=${currentStyle.header.border_width}:bordercolor=${currentStyle.header.border_color}${shadowOpts}:x=(w-text_w)/2:y=${lineY}`);
            });
        }

        if (header_text_english) {
            const englishY = lastKoreanLineY + currentStyle.header_english.y_offset;
            const escapedEnglish = escapeText(header_text_english);
            const shadowOpts = currentStyle.header_english.shadow_x ? `:shadowcolor=${currentStyle.header_english.shadow_color}:shadowx=${currentStyle.header_english.shadow_x}:shadowy=${currentStyle.header_english.shadow_y}` : '';
            drawFilters.push(`drawtext=text='${escapedEnglish}':fontfile=${FONT_PATH}:fontsize=${currentStyle.header_english.font_size}:fontcolor=${currentStyle.header_english.color}:borderw=${currentStyle.header_english.border_width}:bordercolor=${currentStyle.header_english.border_color}${shadowOpts}:x=(w-text_w)/2:y=${englishY}`);
        }

        // 2. 자막 필터 (skip_subtitle_overlay가 true면 건너뛰기)
        // ★★★ 영상 영역 하단 계산 (자막 위치 기준점) ★★★
        const videoBottom = videoY + videoHeightFinal;
        const subtitleBottomMargin = 20; // 영상 하단에서 자막까지의 여백
        const korEngGap = 15; // 한글/영어 자막 사이 여백

        // ★★★ 자막 기준 Y 위치: origin_layout.subtitle_area.y가 있으면 사용, 없으면 자동 계산 ★★★
        const subtitleBaseY = (use_origin_size && origin_layout?.subtitle_area?.y) 
            ? origin_layout.subtitle_area.y 
            : videoBottom - subtitleBottomMargin;
        console.log(`[${jobId}] Subtitle base Y: ${subtitleBaseY} (custom: ${!!origin_layout?.subtitle_area?.y})`);

        if (!skip_subtitle_overlay) {
        subtitles.forEach((sub) => {
            const isInterviewer = sub.speaker === "interviewer";
            const subStyle = isInterviewer ? currentStyle.subtitle_interviewer : currentStyle.subtitle;
            const subEngStyle = isInterviewer ? currentStyle.subtitle_interviewer_english : currentStyle.subtitle_english;

            // ★★★ 동적 폰트 크기 계산 (자막이 화면에 맞도록) ★★★
            console.log("[DEBUG] subStyle.font_size:", subStyle.font_size, "text:", sub.text?.substring(0,20));
            const korDynamicFont = calculateDynamicFontSize(sub.text, subStyle.font_size, actualVideoWidth, 5);
            const engDynamicFont = calculateDynamicFontSize(sub.text_english, subEngStyle.font_size, actualVideoWidth, 3);

            const korFontSize = korDynamicFont.fontSize;
            const engFontSize = engDynamicFont.fontSize;
            const lineHeight = korFontSize + 8;
            const engLineHeight = engFontSize + 5;

            // ★★★ 영상 실제 폭(actualVideoWidth) 기준으로 개행 ★★★
            const maxLines = subStyle.max_lines || 5;
            let korLines;
            if (maxLines === 1) {
                korLines = [removeEmojis(sub.text || "").trim()];
            } else {
                korLines = splitSubtitleLines(sub.text || "", MAX_CHARS_PER_LINE);
            }
            const engMaxLines = subEngStyle.max_lines || 3;
            // max_lines가 1이면 줄바꿈 없이 한 줄로 표시
            let engLines;
            if (engMaxLines === 1 && subtitle_english_enabled && sub.text_english) {
                engLines = [sub.text_english.trim()];
            } else {
                engLines = subtitle_english_enabled && sub.text_english
                    ? splitEnglishSubtitleLines(sub.text_english, MAX_CHARS_PER_LINE_ENG)
                    : [];
                if (engLines.length > engMaxLines) engLines = engLines.slice(0, engMaxLines);
            }
            // ★★★ 동적 자막 위치 계산: subtitleBaseY 기준 (커스텀 또는 자동) ★★★
            const engTotalHeight = engLines.length > 0 ? engLines.length * engLineHeight : 0;
            const korTotalHeight = korLines.length > 0 ? korLines.length * lineHeight : 0;

            // 영어 자막 마지막 줄이 subtitleBaseY 위치에 배치
            const engLastLineY = subtitleBaseY - engLineHeight;
            const engStartY = engLastLineY - ((engLines.length - 1) * engLineHeight);

            // 한글 자막은 영어 자막 위에 + 여백
            const enableFilter = subtitle_timing_mode === "always" ? "" : `:enable='between(t\\,${sub.start}\\,${sub.end})'`;
            const korLastLineY = engLines.length > 0
                ? engStartY - korEngGap - lineHeight
                : subtitleBaseY - lineHeight;
            const korStartY = korLastLineY - ((korLines.length - 1) * lineHeight);

            // 자막별 색상 지원 (timed_subtitles에서 제공된 경우)
            const subtitleColor = sub.color || subStyle.color;

            // ★★★ 자막 위치 계산 (center/right/left) ★★★
            const subtitlePosition = sub.position || "center";
            let xPosition = "(w-text_w)/2";  // 기본: 중앙
            let yPositionOverride = null;  // null이면 기본 자막 위치 사용
            
            // ★★★ 프로필 카드 커스텀 설정 ★★★
            const profileCardYOffset = sub.y_offset;  // Y 오프셋 (undefined면 기본값 사용)
            const profileCardFontSize = sub.font_size || null;  // null이면 기본 폰트 크기
            const profileCardMaxChars = sub.max_chars || 10;  // 줄당 최대 글자 (기본 10)
            const profileCardRightMargin = sub.right_margin || 30;  // 오른쪽 여백 (기본 30px)
            
            console.log(`[DEBUG_PROFILE] sub.y_offset=${sub.y_offset}, profileCardYOffset=${profileCardYOffset}, right_margin=${profileCardRightMargin}, text="${(sub.text || "").substring(0,10)}"`);
            
            if (subtitlePosition === "right") {
                xPosition = `w-text_w-${profileCardRightMargin}`;  // 오른쪽 정렬 (커스텀 여백)
                // 프로필 카드: y_offset이 있으면 절대 위치 사용, 없으면 videoY + 100
                yPositionOverride = profileCardYOffset !== undefined ? profileCardYOffset : (videoY + 100);
            } else if (subtitlePosition === "left") {
                xPosition = `${profileCardRightMargin}`;  // 왼쪽 정렬 (좌측 여백)
                yPositionOverride = profileCardYOffset !== undefined ? profileCardYOffset : (videoY + 100);
            }
            
            // 프로필 카드용 폰트 크기 적용
            const effectiveKorFontSize = profileCardFontSize || korFontSize;
            const effectiveEngFontSize = profileCardFontSize ? Math.round(profileCardFontSize * 0.6) : engFontSize;
            
            console.log(`[DEBUG_SUB] Position: ${subtitlePosition}, X: ${xPosition}, Y: ${yPositionOverride}, FontSize: ${effectiveKorFontSize}`);

            // ★★★ 프로필 카드 (right/left)는 y 위치를 오버라이드 ★★★
            const finalKorStartY = yPositionOverride !== null ? yPositionOverride : korStartY;
            const finalEngStartY = yPositionOverride !== null ? yPositionOverride + (korLines.length * lineHeight) + 10 : engStartY;
            
            // ★★★ 프로필 카드는 max_chars로 줄바꿈 ★★★
            const effectiveMaxChars = (subtitlePosition === "right" || subtitlePosition === "left") 
                ? profileCardMaxChars 
                : currentStyle.subtitle.max_chars_per_line;
            const profileKorLines = splitSubtitleLines(sub.text || "", effectiveMaxChars);
            const profileEngLines = splitSubtitleLines(sub.text_english || "", Math.round(effectiveMaxChars * 1.5));
            
            // 프로필 카드용 라인 높이
            const effectiveLineHeight = (effectiveKorFontSize || korFontSize) + 8;
            const effectiveEngLineHeight = (effectiveEngFontSize || engFontSize) + 6;
            
            // 한글 자막 렌더링 (그림자 효과 포함)
            const renderKorLines = (subtitlePosition === "right" || subtitlePosition === "left") ? profileKorLines : korLines;
            console.log(`[DEBUG_SUB] korLines count: ${renderKorLines.length}, subtitle_enabled: ${subtitle_enabled}`);
            if (renderKorLines.length > 0 && subtitle_enabled) {
                const korShadowOpts = subStyle.shadow_x ? `:shadowcolor=${subStyle.shadow_color}:shadowx=${subStyle.shadow_x}:shadowy=${subStyle.shadow_y}` : '';
                renderKorLines.forEach((line, idx) => {
                    let escapedLine = escapeText(line);
                    if (idx === 0 && isInterviewer) escapedLine = `Q\\: ${escapedLine}`;
                    const lineY = finalKorStartY + (idx * effectiveLineHeight);
                    console.log(`[DEBUG_SUB] Adding Korean line ${idx}: "${escapedLine}" at Y=${lineY}, position=${subtitlePosition}`);
                    drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${SUBTITLE_FONT_PATH}:fontsize=${effectiveKorFontSize}:fontcolor=${subtitleColor}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}${korShadowOpts}:x=${xPosition}:y=${lineY}${enableFilter}`);
                });
            }

            // 영어 자막 렌더링 (그림자 효과 포함)
            const renderEngLines = (subtitlePosition === "right" || subtitlePosition === "left") ? profileEngLines : engLines;
            if (renderEngLines.length > 0 && subtitle_english_enabled) {
                const engShadowOpts = subEngStyle.shadow_x ? `:shadowcolor=${subEngStyle.shadow_color}:shadowx=${subEngStyle.shadow_x}:shadowy=${subEngStyle.shadow_y}` : '';
                renderEngLines.forEach((line, idx) => {
                    let escapedLine = escapeText(line);
                    if (idx === 0 && isInterviewer) escapedLine = `Q\\: ${escapedLine}`;
                    const lineY = finalEngStartY + (idx * effectiveEngLineHeight);
                    drawFilters.push(`drawtext=text='${escapedLine}':fontfile=${SUBTITLE_FONT_PATH}:fontsize=${effectiveEngFontSize}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}${engShadowOpts}:x=${xPosition}:y=${lineY}${enableFilter}`);
                });
            }
        });
        } // end if (!skip_subtitle_overlay)

        // 3. 푸터 필터 (하단, 그림자 효과 포함)
        const escapedChannel = escapeText(footer_text || "땅콩이네", false);
        const footerShadowOpts = currentStyle.footer.shadow_x ? `:shadowcolor=${currentStyle.footer.shadow_color}:shadowx=${currentStyle.footer.shadow_x}:shadowy=${currentStyle.footer.shadow_y}` : '';
        drawFilters.push(`drawtext=text='${escapedChannel}':fontfile=${FONT_PATH}:fontsize=${currentStyle.footer.font_size}:fontcolor=${currentStyle.footer.color}:borderw=${currentStyle.footer.border_width}:bordercolor=${currentStyle.footer.border_color}${footerShadowOpts}:x=(w-text_w)/2:y=${footerY}`);

        // 4. 영문 푸터 필터 (한글 푸터 아래, 그림자 효과 포함)
        if (footer_text_english) {
            const escapedFooterEng = escapeText(footer_text_english, false);
            const footerEngY = footerY + currentStyle.footer_english.y_offset;
            const footerEngShadowOpts = currentStyle.footer_english.shadow_x ? `:shadowcolor=${currentStyle.footer_english.shadow_color}:shadowx=${currentStyle.footer_english.shadow_x}:shadowy=${currentStyle.footer_english.shadow_y}` : '';
            drawFilters.push(`drawtext=text='${escapedFooterEng}':fontfile=${FONT_PATH}:fontsize=${currentStyle.footer_english.font_size}:fontcolor=${currentStyle.footer_english.color}:borderw=${currentStyle.footer_english.border_width}:bordercolor=${currentStyle.footer_english.border_color}${footerEngShadowOpts}:x=(w-text_w)/2:y=${footerEngY}`);
        }

        // BGM 처리
        let bgmInput = "";
        let audioFilter = "[concata]volume=1[aout]";
        if (bgmPath) {
            bgmInput = `-i "${bgmPath}"`;
            const bgmInputIndex = numVideos;
            
            // ★★★ 씬별 오디오 유무에 따른 구간별 BGM 볼륨 조절 ★★★
            if (scene_audio_map && Array.isArray(scene_audio_map) && scene_audio_map.length > 0) {
                // 씬별로 다른 BGM 볼륨 적용
                // volume 필터: if(between(t,start,end),vol,if(...))
                let bgmVolumeExpr = scene_audio_map.reduce((expr, scene, idx) => {
                    const sceneVol = scene.has_audio ? bgm_volume : bgm_volume_no_audio;
                    const condition = `between(t,${scene.start_time},${scene.end_time})`;
                    
                    if (idx === 0) {
                        return `if(${condition},${sceneVol}`;
                    } else {
                        return `${expr},if(${condition},${sceneVol}`;
                    }
                }, "");
                // 마지막에 닫는 괄호와 기본값 추가
                bgmVolumeExpr += `,${bgm_volume}` + ")".repeat(scene_audio_map.length);
                
                console.log(`[${jobId}] 🎵 Scene-based BGM volume expression: ${bgmVolumeExpr}`);
                
                // 원본 오디오가 있는 씬이 하나라도 있으면 믹스, 아니면 BGM만
                const anySceneHasAudio = scene_audio_map.some(s => s.has_audio);
                
                if (anySceneHasAudio) {
                    // 원본 오디오와 BGM 믹스 (BGM은 구간별 볼륨)
                    audioFilter = `[concata]volume=1[va];[${bgmInputIndex}:a]volume='${bgmVolumeExpr}':eval=frame,afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
                    console.log(`[${jobId}] 🔊 Scene-based audio mix: original + BGM (volumes: ${scene_audio_map.map(s => `scene${s.scene_index}=${s.has_audio ? bgm_volume : bgm_volume_no_audio}`).join(', ')})`);
                } else {
                    // 모든 씬에 오디오 없음: BGM만 사용 (구간별 볼륨)
                    audioFilter = `[${bgmInputIndex}:a]volume='${bgmVolumeExpr}':eval=frame,afade=t=out:st=${totalDuration - 2}:d=2[aout]`;
                    console.log(`[${jobId}] 🔊 No original audio in any scene, BGM only with scene-based volumes`);
                }
            } else if (hasAudio) {
                // 기존 로직: 전체 오디오 있음 → BGM 낮게
                audioFilter = `[concata]volume=1[va];[${bgmInputIndex}:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
                console.log(`[${jobId}] 🔊 Audio mix: original(100%) + BGM(${bgm_volume * 100}%)`);
            } else {
                // 기존 로직: 전체 오디오 없음 → BGM만 사용
                audioFilter = `[${bgmInputIndex}:a]volume=${bgm_volume_no_audio},afade=t=out:st=${totalDuration - 2}:d=2[aout]`;
                console.log(`[${jobId}] 🔊 No original audio, using BGM only (${bgm_volume_no_audio * 100}% volume)`);
            }
        }

        // 전체 filter_complex 구성
        const textOverlayFilters = drawFilters.length > 0
            ? `[combined]${drawFilters.join(",")}[outv];`
            : `[combined]null[outv];`;

        const filterComplex = `${videoScaleFilters}${concatFilter}${bgFilter}${textOverlayFilters}${audioFilter}`;

        const outputFilePath = path.join(jobDir, "final_output.mp4");

        // ★★★ 최적화: ultrafast 프리셋 + threads 0 ★★★
        const ffmpegCmd = `ffmpeg -y ${inputFiles} ${bgmInput} -filter_complex "${filterComplex}" -map "[outv]" -map "[aout]" -c:v libx264 -preset ultrafast -crf 23 -threads 0 -c:a aac -b:a 128k -shortest "${outputFilePath}"`;

        // DEBUG: Log the full command
        console.log(`[${jobId}] FFmpeg Command Length: ${ffmpegCmd.length}`);
        console.log(`[${jobId}] FFmpeg Filter Complex:`, filterComplex);


        // FFmpeg 실행 (더 큰 버퍼)
        const { stdout, stderr } = await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 200 });
        if (stderr) {
            // 진행 상황 로그가 대부분이겠지만 오류/경고 확인용
            // 너무 길 수 있으므로 마지막 20줄만? 아니면 전체 로그 파일? 
            // 일단 전체 출력.
            console.log(`[${jobId}] FFmpeg Stderr (partial):`, stderr.slice(-1000));
        }

        const renderTime = ((Date.now() - renderStart) / 1000).toFixed(2);
        console.log(`[${jobId}] ✅ Render complete: ${renderTime}s`);


        // =====================
        // 5. GCS 업로드
        // =====================
        console.log(`[${jobId}] Uploading to GCS...`);
        const uploadStart = Date.now();

        if (!process.env.SKIP_UPLOAD) {
            const bucket = storage.bucket(output_bucket);
            await bucket.upload(outputFilePath, {
                destination: output_path,
                metadata: { contentType: "video/mp4" },
            });
        } else {
            console.log(`[${jobId}] Skipping GCS upload (SKIP_UPLOAD set)`);
        }

        const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
        const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;

        // 정리
        if (!process.env.SKIP_UPLOAD) {
            fs.rmSync(jobDir, { recursive: true, force: true });
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[${jobId}] 🎉 TOTAL TIME: ${totalTime}s (Download: ${downloadTime}s, Render: ${renderTime}s, Upload: ${uploadTime}s)`);

        res.json({
            success: true,
            job_id: jobId,
            url: publicUrl,
            folder_name: folder_name,
            font_settings,
            total_duration: totalDuration,
            stats: {
                video_count: videos.length,
                has_bgm: !!bgm_url,
                has_header: !!header_text,
                has_header_english: !!header_text_english,
                has_footer: !!footer_text,
                has_footer_english: !!footer_text_english,
                has_subtitles: subtitle_enabled && !skip_subtitle_overlay,
                has_english_subtitles: subtitle_english_enabled && !skip_subtitle_overlay,
                subtitle_count: skip_subtitle_overlay ? 0 : subtitles.length,
                skip_subtitle_overlay: skip_subtitle_overlay,
                use_original_audio: use_original_audio,
                layout_only: skip_subtitle_overlay && use_original_audio, // 레이아웃만 적용 모드
            },
            performance: {
                total_time_seconds: parseFloat(totalTime),
                download_time_seconds: parseFloat(downloadTime),
                render_time_seconds: parseFloat(renderTime),
                upload_time_seconds: parseFloat(uploadTime),
                ratio: (parseFloat(totalTime) / totalDuration).toFixed(2) + "x",
            },
        });

    } catch (error) {
        console.error(`[${jobId}] ❌ Error:`, error.message);
        if (fs.existsSync(jobDir)) {
            fs.rmSync(jobDir, { recursive: true, force: true });
        }
        res.status(500).json({ error: error.message, job_id: jobId });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 FFmpeg Render API (OPTIMIZED) running on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  GET  /health - Health check`);
    console.log(`  GET  /version - FFmpeg version`);
    console.log(`  GET  /fonts - Available Korean fonts`);
    console.log(`  POST /extract-audio - YouTube audio extraction (yt-dlp)`);
    console.log(`  POST /render/puppy - Puppy style render (OPTIMIZED)`);
    console.log(`  POST /render/shop - Shopping Shorts style render (NEW)`);
});
