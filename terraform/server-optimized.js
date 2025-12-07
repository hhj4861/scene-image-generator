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

const storage = new Storage();
const TEMP_DIR = "/tmp/ffmpeg-render";

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================
// 폰트 경로 설정 (OS별 분기)
// =====================
const getFontPath = () => {
    if (process.platform === "darwin") {
        // macOS
        if (fs.existsSync("/System/Library/Fonts/Supplemental/AppleGothic.ttf")) {
            return "/System/Library/Fonts/Supplemental/AppleGothic.ttf";
        }
        return "/System/Library/Fonts/AppleSDGothicNeo.ttc"; // Fallback (might need face index)
    }
    // Linux (VM)
    return "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf";
};

const FONT_PATH = getFontPath();

// =====================
// 땅콩이 스타일 설정 (레이아웃 수정)
// =====================
const PEANUT_STYLE = {
    video_height_percent: 65,
    header: {
        font_size: 68,
        color: "0xFFD700",
        border_color: "0x333333",
        border_width: 5,
        y_percent: 15, // 4% -> 15% (Safe zone)
        max_chars_per_line: 14,
    },
    header_english: {
        font_size: 32,
        color: "0xFFFAF0",
        border_color: "0x333333",
        border_width: 3,
        y_offset: 70,
    },
    footer: {
        font_size: 52,
        color: "0xFF6B6B",
        border_color: "0x000000",
        border_width: 4,
        y_percent: 85, // 94% -> 85% (Safe zone)
    },
    subtitle: {
        font_size: 46,
        color: "0xFFE66D",
        border_color: "0x333333",
        border_width: 4,
        y_percent: 65, // 74% -> 65% (Moved up slightly)
    },
    subtitle_english: {
        font_size: 28,
        color: "0xFFFAF0",
        border_color: "0x333333",
        border_width: 3,
        y_percent: 70, // 79% -> 70%
    },
    subtitle_interviewer: {
        font_size: 46,
        color: "0x87CEEB",
        border_color: "0x333333",
        border_width: 4,
        y_percent: 65,
    },
    subtitle_interviewer_english: {
        font_size: 28,
        color: "0xFFFAF0",
        border_color: "0x333333",
        border_width: 3,
        y_percent: 70,
    },
};

// =====================
// 헬퍼 함수들 (동일)
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

const escapeText = (text, keepEmoji = false) => {
    const cleanText = keepEmoji ? text?.trim() || "" : removeEmojis(text);
    return cleanText
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "'\\''")
        .replace(/:/g, "\\:")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
};

const cleanSubtitleText = (text) => {
    if (!text) return "";
    let cleaned = text.replace(/콩파민[!！]?/g, "").trim();
    cleaned = cleaned.replace(/\s+/g, " ");
    cleaned = cleaned.replace(/\.{2,}\s*/g, "... ");
    return cleaned;
};

const splitSubtitleLines = (text, maxCharsPerLine) => {
    const cleaned = cleanSubtitleText(text);
    if (!cleaned) return [];
    if (cleaned.length <= maxCharsPerLine) return [cleaned];

    const neededLines = Math.ceil(cleaned.length / maxCharsPerLine);
    const targetCharsPerLine = Math.ceil(cleaned.length / neededLines);
    const lines = [];
    let remaining = cleaned;

    for (let i = 0; i < neededLines && remaining.length > 0; i++) {
        if (remaining.length <= targetCharsPerLine || i === neededLines - 1) {
            lines.push(remaining.trim());
            break;
        }
        let splitIdx = remaining.lastIndexOf(" ", targetCharsPerLine);
        if (splitIdx === -1 || splitIdx < targetCharsPerLine * 0.5) {
            splitIdx = remaining.indexOf(" ", targetCharsPerLine);
        }
        if (splitIdx === -1) splitIdx = targetCharsPerLine;
        lines.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
    }
    return lines.filter((l) => l.length > 0);
};

const splitHeaderLines = (text, maxChars = 12) => {
    if (!text) return [];
    const cleaned = removeEmojis(text).trim();
    if (cleaned.length <= maxChars) return [cleaned];

    const mid = Math.ceil(cleaned.length / 2);
    let splitIdx = cleaned.lastIndexOf(" ", mid);
    if (splitIdx === -1 || splitIdx < 4) splitIdx = cleaned.indexOf(" ", mid);
    if (splitIdx === -1) splitIdx = mid;

    const line1 = cleaned.substring(0, splitIdx).trim();
    const line2 = cleaned.substring(splitIdx).trim();
    return line2 ? [line1, line2] : [line1];
};

const splitEnglishSubtitleLines = (text, maxCharsPerLine) => {
    if (!text) return [];
    const cleaned = text.trim();
    if (cleaned.length <= maxCharsPerLine) return [cleaned];

    const neededLines = Math.ceil(cleaned.length / maxCharsPerLine);
    const targetCharsPerLine = Math.ceil(cleaned.length / neededLines);
    const lines = [];
    let remaining = cleaned;

    for (let i = 0; i < neededLines && remaining.length > 0; i++) {
        if (remaining.length <= targetCharsPerLine || i === neededLines - 1) {
            lines.push(remaining.trim());
            break;
        }
        let splitIdx = remaining.lastIndexOf(" ", targetCharsPerLine);
        if (splitIdx === -1 || splitIdx < targetCharsPerLine * 0.5) {
            splitIdx = remaining.indexOf(" ", targetCharsPerLine);
        }
        if (splitIdx === -1) splitIdx = targetCharsPerLine;
        lines.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
    }
    return lines.filter((l) => l.length > 0);
};

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
            bgm_volume = 0.2,
            header_text,
            header_text_english,
            footer_text = "땅콩이네",
            subtitle_enabled = true,
            subtitle_english_enabled = false,
            width = 1080,
            height = 1920,
            output_bucket,
            output_path,
            folder_name,
        } = req.body;

        if (!videos || !videos.length) {
            return res.status(400).json({ error: "No videos provided" });
        }

        console.log(`[${jobId}] 🚀 Starting OPTIMIZED Puppy render: ${videos.length} videos`);

        const SUBTITLE_WIDTH_PERCENT = 70;
        const availableWidth = Math.round(width * SUBTITLE_WIDTH_PERCENT / 100);
        const KOR_CHAR_WIDTH = 50;
        const ENG_CHAR_WIDTH = 20;
        const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);
        const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);

        // =====================
        // 1. 영상 다운로드 및 길이 측정 (병렬) - ★★★ 정규화 없음! ★★★
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

            // 영상 길이 측정
            let duration = video.duration || 6;
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
        console.log(`[${jobId}] ✅ Download complete: ${downloadTime}s`);

        // 총 duration 계산
        const totalDuration = downloadedVideos.reduce((sum, v) => sum + v.duration, 0);
        console.log(`[${jobId}] Total duration: ${totalDuration.toFixed(2)}s`);

        // =====================
        // 2. 자막 데이터 생성
        // =====================
        console.log(`[${jobId}] [2/4] Preparing subtitles...`);
        const subtitles = [];
        let currentTime = 0;

        for (const { duration, video, index } of downloadedVideos) {
            const sceneNum = video.index || (index + 1);
            const narration = video.dialogue?.script || video.dialogue?.interviewer || video.narration || "";
            const narrationKorean = video.narration_korean || narration;
            const narrationEnglish = video.dialogue?.script_english || video.narration_english || "";
            const isInterviewQuestion = video.is_interview_question || video.scene_type === "interview_question";
            const isPerformance = video.is_performance && !narration;

            if (narration && !isPerformance && subtitle_enabled) {
                subtitles.push({
                    start: currentTime + 0.3,
                    end: currentTime + duration - 0.3,
                    text: narrationKorean,
                    text_english: narrationEnglish,
                    speaker: isInterviewQuestion ? "interviewer" : (video.speaker || "main"),
                    scene_index: sceneNum,
                });
            }
            currentTime += duration;
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

        const videoHeight = Math.round(height * PEANUT_STYLE.video_height_percent / 100);
        const videoY = Math.round((height - videoHeight) / 2);
        const headerY = Math.round(height * PEANUT_STYLE.header.y_percent / 100);
        const footerY = Math.round(height * PEANUT_STYLE.footer.y_percent / 100);

        // 입력 파일 목록
        const inputFiles = downloadedVideos.map(v => `-i "${v.filePath}"`).join(" ");
        const numVideos = downloadedVideos.length;

        // ★★★ 핵심 최적화: filter_complex에서 scale + concat + overlay를 한 번에 ★★★
        // 각 비디오 scale + setpts
        let videoScaleFilters = "";
        let concatInputs = "";
        let audioConcatInputs = "";

        for (let i = 0; i < numVideos; i++) {
            videoScaleFilters += `[${i}:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v${i}];`;
            concatInputs += `[v${i}]`;
            audioConcatInputs += `[${i}:a]`;
        }

        // 비디오 concat
        const concatFilter = `${concatInputs}concat=n=${numVideos}:v=1:a=0[concatv];${audioConcatInputs}concat=n=${numVideos}:v=0:a=1[concata];`;

        // 배경 생성 및 비디오 오버레이
        const bgFilter = `color=black:s=${width}x${height}:d=${totalDuration}[bg];[bg][concatv]overlay=0:${videoY}[combined];`;

        // 자막 필터 생성
        let subtitleFilters = "";
        subtitles.forEach((sub) => {
            const isInterviewer = sub.speaker === "interviewer";
            const subStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer : PEANUT_STYLE.subtitle;
            const subEngStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer_english : PEANUT_STYLE.subtitle_english;
            const baseSubY = Math.round(height * subStyle.y_percent / 100);
            const baseEngY = Math.round(height * subEngStyle.y_percent / 100);
            const lineHeight = subStyle.font_size + 8;
            const engLineHeight = subEngStyle.font_size + 5;

            const korLines = splitSubtitleLines(sub.text || "", MAX_CHARS_PER_LINE);
            if (korLines.length > 0) {
                const korStartY = korLines.length > 1 ? baseSubY - ((korLines.length - 1) * lineHeight / 2) : baseSubY;
                korLines.forEach((line, idx) => {
                    let escapedLine = escapeText(line);
                    if (idx === 0 && isInterviewer) escapedLine = `Q\\: ${escapedLine}`;
                    const lineY = korStartY + (idx * lineHeight);
                    subtitleFilters += `drawtext=text='${escapedLine}':fontfile=${FONT_PATH}:fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t\\,${sub.start}\\,${sub.end})',`;
                });
            }

            if (subtitle_english_enabled && sub.text_english) {
                const engLines = splitEnglishSubtitleLines(sub.text_english, MAX_CHARS_PER_LINE_ENG);
                if (engLines.length > 0) {
                    const korLineCount = korLines.length || 1;
                    const engStartY = baseEngY + ((korLineCount - 1) * lineHeight / 2);
                    engLines.forEach((line, idx) => {
                        let escapedLine = escapeText(line);
                        if (idx === 0 && isInterviewer) escapedLine = `Q\\: ${escapedLine}`;
                        const lineY = engStartY + (idx * engLineHeight);
                        subtitleFilters += `drawtext=text='${escapedLine}':fontfile=${FONT_PATH}:fontsize=${subEngStyle.font_size}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t\\,${sub.start}\\,${sub.end})',`;
                    });
                }
            }
        });

        // 헤더 필터
        const titleLinesKorean = splitHeaderLines(header_text || "", PEANUT_STYLE.header.max_chars_per_line);
        const titleLineHeight = PEANUT_STYLE.header.font_size + 10;
        let headerFilters = "";
        let lastKoreanLineY = headerY;

        if (titleLinesKorean.length > 0) {
            titleLinesKorean.forEach((line, idx) => {
                const escapedLine = escapeText(line);
                const lineY = headerY + (idx * titleLineHeight);
                lastKoreanLineY = lineY;
                headerFilters += `drawtext=text='${escapedLine}':fontfile=${FONT_PATH}:fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY},`;
            });
        }

        if (header_text_english) {
            const englishY = lastKoreanLineY + PEANUT_STYLE.header_english.y_offset;
            const escapedEnglish = escapeText(header_text_english);
            headerFilters += `drawtext=text='${escapedEnglish}':fontfile=${FONT_PATH}:fontsize=${PEANUT_STYLE.header_english.font_size}:fontcolor=${PEANUT_STYLE.header_english.color}:borderw=${PEANUT_STYLE.header_english.border_width}:bordercolor=${PEANUT_STYLE.header_english.border_color}:x=(w-text_w)/2:y=${englishY},`;
        }

        // 푸터 필터
        const escapedChannel = escapeText(footer_text || "땅콩이네", false);
        const footerFilter = `drawtext=text='${escapedChannel}':fontfile=${FONT_PATH}:fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}`;

        // BGM 처리
        let bgmInput = "";
        let audioFilter = "[concata]volume=1[aout]";

        if (bgmPath) {
            bgmInput = `-i "${bgmPath}"`;
            const bgmInputIndex = numVideos;
            audioFilter = `[concata]volume=1[va];[${bgmInputIndex}:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
        }

        // 전체 filter_complex (한 줄로)
        const filterComplex = `${videoScaleFilters}${concatFilter}${bgFilter}[combined]${headerFilters}${subtitleFilters}${footerFilter}[outv];${audioFilter}`;

        const outputFilePath = path.join(jobDir, "final_output.mp4");

        // ★★★ 최적화: ultrafast 프리셋 + threads 0 ★★★
        const ffmpegCmd = `ffmpeg -y ${inputFiles} ${bgmInput} -filter_complex "${filterComplex}" -map "[outv]" -map "[aout]" -c:v libx264 -preset ultrafast -crf 23 -threads 0 -c:a aac -b:a 128k -shortest "${outputFilePath}"`;

        // FFmpeg 실행 (더 큰 버퍼)
        await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 200 });

        const renderTime = ((Date.now() - renderStart) / 1000).toFixed(2);
        console.log(`[${jobId}] ✅ Render complete: ${renderTime}s`);

        // =====================
        // 5. GCS 업로드
        // =====================
        console.log(`[${jobId}] Uploading to GCS...`);
        const uploadStart = Date.now();

        const bucket = storage.bucket(output_bucket);
        await bucket.upload(outputFilePath, {
            destination: output_path,
            metadata: { contentType: "video/mp4" },
        });

        const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(2);
        const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;

        // 정리
        fs.rmSync(jobDir, { recursive: true, force: true });

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[${jobId}] 🎉 TOTAL TIME: ${totalTime}s (Download: ${downloadTime}s, Render: ${renderTime}s, Upload: ${uploadTime}s)`);

        res.json({
            success: true,
            job_id: jobId,
            url: publicUrl,
            folder_name: folder_name,
            total_duration: totalDuration,
            stats: {
                video_count: videos.length,
                has_bgm: !!bgm_url,
                has_header: !!header_text,
                has_footer: !!footer_text,
                has_subtitles: subtitle_enabled,
                has_english_subtitles: subtitle_english_enabled,
                subtitle_count: subtitles.length,
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
    console.log(`  POST /render/puppy - Puppy style render (OPTIMIZED)`);
});

