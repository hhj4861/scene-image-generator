const express = require("express");
const { exec } = require("child_process");
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

// 임시 디렉토리 생성
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================
// 땅콩이 스타일 설정
// =====================
const PEANUT_STYLE = {
  video_height_percent: 65,
  // ★★★ 영상 위치: 상단 17.5% ~ 하단 82.5% (65% 중앙) ★★★
  // 헤더: 영상 바로 위에 배치 - 주황빛 배경 (푸터보다 연한색)
  header: {
    font_size: 68,
    color: "0xFFFFFF",         // 흰색 텍스트
    border_color: "0x333333",  // 어두운 테두리
    border_width: 4,
    y_percent: 8,              // 영상에 가깝게
    max_chars_per_line: 14,
    bg_color: "0xFF8C00",      // 다크오렌지 배경 (진한 주황)
    bg_padding: 15,
  },
  // 영어 헤더 (한글 바로 아래)
  header_english: {
    font_size: 36,
    color: "0xFFFFFF",
    border_color: "0x333333",
    border_width: 2,
    y_offset: 75, // 한글 헤더 아래 오프셋
  },
  // ★★★ 채널명: 주황/노란색 배경 + 흰색 텍스트 ★★★
  footer: {
    font_size: 56,
    color: "0xFFFFFF",         // 흰색 텍스트
    border_color: "0x333333",
    border_width: 2,
    y_percent: 93,             // 맨 아래
    bg_color: "0xFFA500",      // 오렌지 배경 (밝은 주황)
    bg_padding: 18,
  },
  // 자막 (답변) - 영상 바로 아래 (y=84%) - 노란색
  subtitle: {
    font_size: 46,
    color: "0xFFE66D",         // 밝은 노란색
    border_color: "0x333333",
    border_width: 4,
    y_percent: 84,
  },
  // 영어 자막 (답변 아래)
  subtitle_english: {
    font_size: 30,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 88,
  },
  // 인터뷰어 자막 (하늘색)
  subtitle_interviewer: {
    font_size: 46,
    color: "0x87CEEB",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 84,
  },
  subtitle_interviewer_english: {
    font_size: 30,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 88,
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

// ★★★ 이모지 지원 텍스트 이스케이프 (이모지 유지) ★★★
const escapeTextWithEmoji = (text) => {
  if (!text) return "";
  return text
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

// ★★★ 이모지 제거 텍스트 이스케이프 (자막용 - 이모지 없음) ★★★
const escapeText = (text, keepEmoji = false) => {
  if (keepEmoji) return escapeTextWithEmoji(text);
  const cleanText = removeEmojis(text);
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

// 자막 줄 나누기 (동적)
const splitSubtitleLines = (text, maxCharsPerLine) => {
  const cleaned = cleanSubtitleText(text);
  if (!cleaned) return [];

  if (cleaned.length <= maxCharsPerLine) {
    return [cleaned];
  }

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
    if (splitIdx === -1) {
      splitIdx = targetCharsPerLine;
    }

    lines.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }

  return lines.filter((l) => l.length > 0);
};

// 상단 타이틀 2줄 처리
const splitHeaderLines = (text, maxChars = 12) => {
  if (!text) return [];
  const cleaned = removeEmojis(text).trim();

  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  const mid = Math.ceil(cleaned.length / 2);
  let splitIdx = cleaned.lastIndexOf(" ", mid);
  if (splitIdx === -1 || splitIdx < 4) {
    splitIdx = cleaned.indexOf(" ", mid);
  }
  if (splitIdx === -1) {
    splitIdx = mid;
  }

  const line1 = cleaned.substring(0, splitIdx).trim();
  const line2 = cleaned.substring(splitIdx).trim();

  if (line2) {
    return [line1, line2];
  }
  return [line1];
};

// 영문 자막 줄 나누기
const splitEnglishSubtitleLines = (text, maxCharsPerLine) => {
  if (!text) return [];
  const cleaned = text.trim();

  if (cleaned.length <= maxCharsPerLine) {
    return [cleaned];
  }

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
    if (splitIdx === -1) {
      splitIdx = targetCharsPerLine;
    }

    lines.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }

  return lines.filter((l) => l.length > 0);
};

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", ffmpeg: true, timestamp: new Date().toISOString() });
});

// FFmpeg 버전 확인
app.get("/version", async (req, res) => {
  try {
    const { stdout } = await execAsync("ffmpeg -version | head -1");
    res.json({ version: stdout.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 폰트 확인
app.get("/fonts", async (req, res) => {
  try {
    const { stdout } = await execAsync("fc-list :lang=ko | head -10");
    res.json({ fonts: stdout.trim().split("\n") });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================
// 땅콩이 렌더링 API (메인)
// =====================
app.post("/render/puppy", async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    const {
      videos,
      bgm_url,
      bgm_volume = 0.2,
      header_text,
      header_text_english, // ★★★ 영어 헤더 추가 ★★★
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

    console.log(`[${jobId}] Starting Puppy render: ${videos.length} videos`);
    console.log(`[${jobId}] Output: ${output_bucket}/${output_path}`);

    // 동적 자막 설정 계산
    const SUBTITLE_WIDTH_PERCENT = 70;
    const availableWidth = Math.round(width * SUBTITLE_WIDTH_PERCENT / 100);
    const KOR_CHAR_WIDTH = 50;
    const ENG_CHAR_WIDTH = 20;
    const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);
    const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);

    // 1. 영상 다운로드 및 길이 측정 (병렬)
    console.log(`[${jobId}] Downloading ${videos.length} videos...`);
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
      } catch {}

      return { index: i, filePath, duration, video };
    });

    const downloadedVideos = await Promise.all(downloadPromises);
    downloadedVideos.sort((a, b) => a.index - b.index);

    const totalDuration = downloadedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`[${jobId}] Total duration: ${totalDuration.toFixed(2)}s`);

    // 2. 자막 데이터 생성
    const subtitles = [];
    let currentTime = 0;

    for (const { duration, video, index } of downloadedVideos) {
      const sceneNum = video.index || (index + 1);
      // 실제 음성 대사 (TTS용)
      const narration = video.dialogue?.script || video.dialogue?.interviewer || video.dialogue?.["땅콩"] || video.narration || "";
      // ★★★ 한글 자막용 (영어 캐릭터도 한글 자막 표시) ★★★
      // narration_korean이 있으면 사용, 없으면 narration 사용 (한국어 캐릭터의 경우)
      const narrationKorean = video.narration_korean || narration;
      const narrationEnglish = video.dialogue?.script_english || video.narration_english || "";
      const isInterviewQuestion = video.is_interview_question || video.scene_type === "interview_question";
      const isPerformance = video.is_performance && !narration;

      if (narration && !isPerformance && subtitle_enabled) {
        subtitles.push({
          start: currentTime + 0.3,
          end: currentTime + duration - 0.3,
          text: narrationKorean,  // ★★★ 한글 자막 (항상 한국어)
          text_english: narrationEnglish,
          speaker: isInterviewQuestion ? "interviewer" : (video.speaker || "main"),
          scene_index: sceneNum,
          spoken_language: video.spoken_language || "korean",  // 캐릭터 언어 (디버깅용)
        });
      }

      currentTime += duration;
    }

    // 3. 영상 정규화
    console.log(`[${jobId}] Normalizing videos...`);
    const videoHeight = Math.round(height * PEANUT_STYLE.video_height_percent / 100);

    const normalizePromises = downloadedVideos.map(async ({ index, filePath }) => {
      const normalizedPath = path.join(jobDir, `normalized_${index}.mp4`);
      await execAsync(`ffmpeg -y -i "${filePath}" \
        -vf "scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
        -c:v libx264 -preset fast -crf 18 \
        -c:a aac -b:a 192k -ar 44100 -ac 2 \
        -r 30 \
        "${normalizedPath}"`, { maxBuffer: 1024 * 1024 * 50 });
      return { index, normalizedPath };
    });

    const normalizedVideos = await Promise.all(normalizePromises);
    normalizedVideos.sort((a, b) => a.index - b.index);

    // 4. 영상 연결
    console.log(`[${jobId}] Concatenating videos...`);
    const concatListPath = path.join(jobDir, "concat.txt");
    const concatContent = normalizedVideos.map(v => `file '${v.normalizedPath}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const concatenatedPath = path.join(jobDir, "concatenated.mp4");
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`, { maxBuffer: 1024 * 1024 * 50 });

    // 5. BGM 다운로드 (선택)
    let bgmPath = null;
    if (bgm_url) {
      console.log(`[${jobId}] Downloading BGM...`);
      bgmPath = path.join(jobDir, "bgm.mp3");
      const bgmResponse = await axios({
        method: "GET",
        url: bgm_url,
        responseType: "arraybuffer",
        timeout: 60000,
      });
      fs.writeFileSync(bgmPath, Buffer.from(bgmResponse.data));
    }

    // 6. 필터 생성
    console.log(`[${jobId}] Building filter complex...`);
    const videoY = Math.round((height - videoHeight) / 2);
    const headerY = Math.round(height * PEANUT_STYLE.header.y_percent / 100);
    const footerY = Math.round(height * PEANUT_STYLE.footer.y_percent / 100);

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

      // 한글 자막
      const korLines = splitSubtitleLines(sub.text || "", MAX_CHARS_PER_LINE);
      if (korLines.length > 0) {
        const korStartY = korLines.length > 1 ? baseSubY - ((korLines.length - 1) * lineHeight / 2) : baseSubY;

        korLines.forEach((line, idx) => {
          let escapedLine = escapeText(line);
          if (idx === 0 && isInterviewer) {
            escapedLine = `Q\\: ${escapedLine}`;
          }
          const lineY = korStartY + (idx * lineHeight);
          subtitleFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${sub.start},${sub.end})'`;
        });
      }

      // 영어 자막
      if (subtitle_english_enabled && sub.text_english) {
        const engLines = splitEnglishSubtitleLines(sub.text_english, MAX_CHARS_PER_LINE_ENG);
        if (engLines.length > 0) {
          const korLineCount = korLines.length || 1;
          const engStartY = baseEngY + ((korLineCount - 1) * lineHeight / 2);

          engLines.forEach((line, idx) => {
            let escapedLine = escapeText(line);
            if (idx === 0 && isInterviewer) {
              escapedLine = `Q\\: ${escapedLine}`;
            }
            const lineY = engStartY + (idx * engLineHeight);
            subtitleFilters += `,drawtext=text='${escapedLine}':fontsize=${subEngStyle.font_size}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${sub.start},${sub.end})'`;
          });
        }
      }
    });

    // ★★★ 상단 타이틀 필터 (한글 + 영어 2줄 + 배경) ★★★
    const titleLinesKorean = splitHeaderLines(header_text || "", PEANUT_STYLE.header.max_chars_per_line);
    const titleLineHeight = PEANUT_STYLE.header.font_size + 10;
    let headerFilters = "";
    let lastKoreanLineY = headerY;

    // ★★★ 헤더 배경 (주황색 박스) - 텍스트 전에 그리기 ★★★
    if (header_text && PEANUT_STYLE.header.bg_color) {
      const headerLineCount = titleLinesKorean.length || 1;
      const headerTotalHeight = headerLineCount * titleLineHeight + (header_text_english ? PEANUT_STYLE.header_english.y_offset : 0);
      const headerBgHeight = headerTotalHeight + (PEANUT_STYLE.header.bg_padding || 15) * 2;
      const headerBgY = headerY - (PEANUT_STYLE.header.bg_padding || 15);
      headerFilters += `drawbox=x=0:y=${headerBgY}:w=${width}:h=${headerBgHeight}:color=${PEANUT_STYLE.header.bg_color}:t=fill,`;
    }

    // 1. 한글 헤더 (큰 폰트)
    if (titleLinesKorean.length > 0) {
      titleLinesKorean.forEach((line, idx) => {
        const escapedLine = escapeText(line);
        const lineY = headerY + (idx * titleLineHeight);
        lastKoreanLineY = lineY;
        headerFilters += `drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY},`;
      });
    }

    // 2. 영어 헤더 (작은 폰트, 한글 아래)
    if (header_text_english) {
      const englishY = lastKoreanLineY + PEANUT_STYLE.header_english.y_offset;
      const escapedEnglish = escapeText(header_text_english);
      headerFilters += `drawtext=text='${escapedEnglish}':fontsize=${PEANUT_STYLE.header_english.font_size}:fontcolor=${PEANUT_STYLE.header_english.color}:borderw=${PEANUT_STYLE.header_english.border_width}:bordercolor=${PEANUT_STYLE.header_english.border_color}:x=(w-text_w)/2:y=${englishY},`;
    }

    // ★★★ 푸터는 이모지 유지 (keepEmoji=true) ★★★
    const escapedChannel = escapeText(footer_text || "땅콩이네", true);

    // BGM 처리
    let bgmInput = "";
    let bgmFilter = "";
    let audioMap = "-map 1:a";

    if (bgmPath) {
      bgmInput = `-i "${bgmPath}"`;
      bgmFilter = `;[1:a]volume=1[va];[2:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
      audioMap = `-map "[aout]"`;
    }

    // ★★★ 푸터 배경 (빨간색 박스) ★★★
    const footerBgHeight = PEANUT_STYLE.footer.font_size + (PEANUT_STYLE.footer.bg_padding || 20) * 2;
    const footerBgY = footerY - (PEANUT_STYLE.footer.bg_padding || 20);
    const footerBgColor = PEANUT_STYLE.footer.bg_color || "0xCC0000";
    const footerBgFilter = `drawbox=x=0:y=${footerBgY}:w=${width}:h=${footerBgHeight}:color=${footerBgColor}:t=fill,`;

    // ★★★ 푸터 이모지 지원: font= 사용 + fontconfig 활성화 ★★★
    // fontconfig가 자동으로 Noto Color Emoji로 폴백
    const filterComplex = `
      color=black:s=${width}x${height}:d=${totalDuration}[bg];
      [1:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
      [bg][video]overlay=0:${videoY}[combined];
      [combined]${headerFilters}${footerBgFilter}drawtext=text='${escapedChannel}':font='NanumGothic Bold':fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}${subtitleFilters}[out]${bgmFilter}
    `.replace(/\n/g, "").replace(/\s+/g, " ").trim();

    // 7. 최종 렌더링
    console.log(`[${jobId}] Running final FFmpeg render...`);
    const outputFilePath = path.join(jobDir, "final_output.mp4");

    const ffmpegCmd = `ffmpeg -y \
      -f lavfi -i "color=black:s=${width}x${height}:d=${totalDuration}" \
      -i "${concatenatedPath}" ${bgmInput} \
      -filter_complex "${filterComplex}" \
      -map "[out]" ${audioMap} \
      -c:v libx264 -preset slow -crf 18 \
      -c:a aac -b:a 192k \
      -shortest \
      "${outputFilePath}"`;

    await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 100 });

    // 8. GCS 업로드
    console.log(`[${jobId}] Uploading to GCS: ${output_bucket}/${output_path}`);
    const bucket = storage.bucket(output_bucket);
    await bucket.upload(outputFilePath, {
      destination: output_path,
      metadata: { contentType: "video/mp4" },
    });

    const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;

    // 9. 정리
    fs.rmSync(jobDir, { recursive: true, force: true });

    console.log(`[${jobId}] Puppy render complete: ${publicUrl}`);

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
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    res.status(500).json({ error: error.message, job_id: jobId });
  }
});

// 기본 렌더링 API (단순 연결)
app.post("/render", async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    const { videos, output_bucket, output_path } = req.body;

    if (!videos || !videos.length) {
      return res.status(400).json({ error: "No videos provided" });
    }

    console.log(`[${jobId}] Starting basic render: ${videos.length} videos`);

    // 영상 다운로드
    const downloadedFiles = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const filePath = path.join(jobDir, `input_${i}.mp4`);

      const response = await axios({
        method: "GET",
        url: video.url,
        responseType: "arraybuffer",
        timeout: 60000,
      });
      fs.writeFileSync(filePath, Buffer.from(response.data));
      downloadedFiles.push(filePath);
    }

    // 영상 합치기
    const concatListPath = path.join(jobDir, "concat.txt");
    const concatContent = downloadedFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const outputPath = path.join(jobDir, "output.mp4");
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`);

    // GCS 업로드
    const bucket = storage.bucket(output_bucket);
    await bucket.upload(outputPath, {
      destination: output_path,
      metadata: { contentType: "video/mp4" },
    });

    const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;

    // 정리
    fs.rmSync(jobDir, { recursive: true, force: true });

    res.json({
      success: true,
      job_id: jobId,
      url: publicUrl,
      video_count: videos.length,
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    res.status(500).json({ error: error.message, job_id: jobId });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`FFmpeg Render API running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /version - FFmpeg version`);
  console.log(`  GET  /fonts - Available Korean fonts`);
  console.log(`  POST /render - Basic video concatenation`);
  console.log(`  POST /render/puppy - Puppy style render (subtitles, header, footer, BGM)`);
});
