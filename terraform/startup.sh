#!/bin/bash
set -e

echo "=========================================="
echo "FFmpeg Render Server Setup Starting..."
echo "=========================================="

# 시스템 업데이트
apt-get update && apt-get upgrade -y

# FFmpeg 설치
echo "Installing FFmpeg..."
apt-get install -y ffmpeg

# 한글 폰트 + 이모지 폰트 설치
echo "Installing Korean fonts and Emoji fonts..."
apt-get install -y fonts-noto-cjk fonts-nanum fonts-noto-color-emoji

# Node.js 20 LTS 설치
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2 설치 (프로세스 매니저)
npm install -g pm2

# 작업 디렉토리 생성
mkdir -p /opt/ffmpeg-api
cd /opt/ffmpeg-api

# package.json 생성
cat > package.json << 'EOF'
{
  "name": "ffmpeg-render-api",
  "version": "2.0.0",
  "description": "FFmpeg Render API for Pipedream Puppy",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@google-cloud/storage": "^7.7.0",
    "axios": "^1.6.0",
    "uuid": "^9.0.0"
  }
}
EOF

# 의존성 설치
npm install

# API 서버 코드 생성
cat > server.js << 'SERVEREOF'
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
// 땅콩이 스타일 설정 (기존)
// =====================
const PEANUT_STYLE = {
  video_height_percent: 65,
  header: {
    font_size: 80,
    color: "0xFFF8DC",
    border_color: "0x5D4E37",
    border_width: 4,
    y_percent: 5,
    max_chars_per_line: 12,
  },
  footer: {
    font_size: 75,
    color: "0xF4A460",
    border_color: "0x4A3C2A",
    border_width: 4,
    y_percent: 87,
  },
  subtitle: {
    font_size: 48,
    color: "0xFFE66D",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 75,
  },
  subtitle_english: {
    font_size: 36,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 80,
  },
  subtitle_interviewer: {
    font_size: 48,
    color: "0x87CEEB",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 75,
  },
  subtitle_interviewer_english: {
    font_size: 36,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 80,
  },
};

// =====================
// 보리 스타일 설정 (새로운 레이아웃)
// 상단: 질문(한글+영어), 중앙: 영상 60%, 하단: 답변(한글+영어), 맨아래: 채널명
// =====================
const BORI_STYLE = {
  video_height_percent: 60,
  // 상단 질문 영역
  question: {
    font_size: 52,
    color: "0xFFFFFF",
    border_color: "0x000000",
    border_width: 4,
    y_percent: 3,
    max_chars_per_line: 18,
  },
  question_english: {
    font_size: 28,
    color: "0xDDDDDD",
    border_color: "0x000000",
    border_width: 2,
    y_percent: 7,
    max_chars_per_line: 40,
  },
  // 하단 답변 영역
  answer: {
    font_size: 48,
    color: "0xFFE66D",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 76,
    max_chars_per_line: 18,
  },
  answer_english: {
    font_size: 26,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 2,
    y_percent: 81,
    max_chars_per_line: 42,
  },
  // 채널명
  channel: {
    font_size: 60,
    color: "0xFF6B6B",
    border_color: "0x000000",
    border_width: 3,
    y_percent: 90,
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

const escapeText = (text) => {
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
// 통합 렌더링 API (동적 레이아웃)
// - question 필드 있음 → 상단: 질문(씬마다), 하단: 답변
// - question 필드 없음 → 상단: 타이틀(고정), 하단: 나레이션
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
      channel_name = "땅콩이네",
      width = 1080,
      height = 1920,
      output_bucket,
      output_path,
      folder_name,
    } = req.body;

    if (!videos || !videos.length) {
      return res.status(400).json({ error: "No videos provided" });
    }

    // 레이아웃 모드 자동 감지: question 필드가 있으면 QA 모드
    const hasQuestionField = videos.some(v => v.question);
    const layoutMode = hasQuestionField ? "qa" : "story";
    const STYLE = hasQuestionField ? BORI_STYLE : PEANUT_STYLE;

    console.log(`[${jobId}] Starting render: ${videos.length} videos, mode: ${layoutMode}`);
    console.log(`[${jobId}] Output: ${output_bucket}/${output_path}`);

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

    // 2. 씬별 텍스트 데이터 생성
    const sceneTexts = [];
    let currentTime = 0;

    for (const { duration, video, index } of downloadedVideos) {
      const isPerformance = video.is_performance && !video.narration && !video.answer;

      if (layoutMode === "qa") {
        // QA 모드: question → 상단, answer → 하단
        sceneTexts.push({
          start: currentTime + 0.2,
          end: currentTime + duration - 0.2,
          top_text: video.question || "",
          top_text_english: video.question_english || "",
          bottom_text: video.answer || video.narration || "",
          bottom_text_english: video.answer_english || video.narration_english || "",
          is_performance: isPerformance,
        });
      } else {
        // Story 모드: header_text → 상단(고정은 별도처리), narration → 하단
        const narration = video.dialogue?.script || video.dialogue?.["땅콩"] || video.narration || "";
        const narrationEnglish = video.dialogue?.script_english || video.narration_english || "";

        if (narration && !isPerformance) {
          sceneTexts.push({
            start: currentTime + 0.2,
            end: currentTime + duration - 0.2,
            top_text: null, // Story 모드에서는 상단 고정
            bottom_text: narration,
            bottom_text_english: narrationEnglish,
            is_performance: false,
          });
        }
      }

      currentTime += duration;
    }

    // 3. 영상 정규화 (BORI_STYLE 레이아웃 통일)
    console.log(`[${jobId}] Normalizing videos...`);
    const videoHeight = Math.round(height * BORI_STYLE.video_height_percent / 100);

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

    // 6. 필터 생성 (동적 레이아웃)
    console.log(`[${jobId}] Building filter complex (${layoutMode} mode)...`);
    const videoY = Math.round((height - videoHeight) / 2);

    let textFilters = "";
    const escapedChannel = escapeText(channel_name);

    if (layoutMode === "qa") {
      // QA 모드: 상단 질문(씬마다), 하단 답변(씬마다)
      const questionY = Math.round(height * BORI_STYLE.question.y_percent / 100);
      const questionEngY = Math.round(height * BORI_STYLE.question_english.y_percent / 100);
      const answerY = Math.round(height * BORI_STYLE.answer.y_percent / 100);
      const answerEngY = Math.round(height * BORI_STYLE.answer_english.y_percent / 100);
      const channelY = Math.round(height * BORI_STYLE.channel.y_percent / 100);

      sceneTexts.forEach((scene) => {
        if (scene.is_performance) return;

        // 상단: 질문 (한글)
        if (scene.top_text) {
          const qLines = splitSubtitleLines(scene.top_text, BORI_STYLE.question.max_chars_per_line);
          const qLineHeight = BORI_STYLE.question.font_size + 6;
          qLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = questionY + (idx * qLineHeight);
            textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.question.font_size}:fontcolor=${BORI_STYLE.question.color}:borderw=${BORI_STYLE.question.border_width}:bordercolor=${BORI_STYLE.question.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
          });
        }

        // 상단: 질문 (영어)
        if (scene.top_text_english) {
          const qEngLines = splitEnglishSubtitleLines(scene.top_text_english, BORI_STYLE.question_english.max_chars_per_line);
          const qEngLineHeight = BORI_STYLE.question_english.font_size + 4;
          const qKorLineCount = scene.top_text ? splitSubtitleLines(scene.top_text, BORI_STYLE.question.max_chars_per_line).length : 0;
          const qEngStartY = questionEngY + (qKorLineCount > 1 ? (qKorLineCount - 1) * (BORI_STYLE.question.font_size + 6) : 0);

          qEngLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = qEngStartY + (idx * qEngLineHeight);
            textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothic.ttf:fontsize=${BORI_STYLE.question_english.font_size}:fontcolor=${BORI_STYLE.question_english.color}:borderw=${BORI_STYLE.question_english.border_width}:bordercolor=${BORI_STYLE.question_english.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
          });
        }

        // 하단: 답변 (한글)
        if (scene.bottom_text) {
          const aLines = splitSubtitleLines(scene.bottom_text, BORI_STYLE.answer.max_chars_per_line);
          const aLineHeight = BORI_STYLE.answer.font_size + 6;
          aLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = answerY + (idx * aLineHeight);
            textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.answer.font_size}:fontcolor=${BORI_STYLE.answer.color}:borderw=${BORI_STYLE.answer.border_width}:bordercolor=${BORI_STYLE.answer.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
          });
        }

        // 하단: 답변 (영어)
        if (scene.bottom_text_english) {
          const aEngLines = splitEnglishSubtitleLines(scene.bottom_text_english, BORI_STYLE.answer_english.max_chars_per_line);
          const aEngLineHeight = BORI_STYLE.answer_english.font_size + 4;
          const aKorLineCount = scene.bottom_text ? splitSubtitleLines(scene.bottom_text, BORI_STYLE.answer.max_chars_per_line).length : 0;
          const aEngStartY = answerEngY + (aKorLineCount > 1 ? (aKorLineCount - 1) * (BORI_STYLE.answer.font_size + 6) : 0);

          aEngLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = aEngStartY + (idx * aEngLineHeight);
            textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothic.ttf:fontsize=${BORI_STYLE.answer_english.font_size}:fontcolor=${BORI_STYLE.answer_english.color}:borderw=${BORI_STYLE.answer_english.border_width}:bordercolor=${BORI_STYLE.answer_english.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
          });
        }
      });

      // 채널명 (항상 표시)
      const channelFilter = `drawtext=text='${escapedChannel}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.channel.font_size}:fontcolor=${BORI_STYLE.channel.color}:borderw=${BORI_STYLE.channel.border_width}:bordercolor=${BORI_STYLE.channel.border_color}:x=(w-text_w)/2:y=${channelY}`;

      // 최종 필터 조합
      var baseFilters = channelFilter;

    } else {
      // Story 모드: 상단 타이틀(고정), 하단 나레이션(씬마다) - BORI_STYLE 사용
      const questionY = Math.round(height * BORI_STYLE.question.y_percent / 100);
      const answerY = Math.round(height * BORI_STYLE.answer.y_percent / 100);
      const channelY = Math.round(height * BORI_STYLE.channel.y_percent / 100);

      // 상단 타이틀 (고정)
      let headerFilters = "";
      if (header_text) {
        const titleLines = splitSubtitleLines(header_text, BORI_STYLE.question.max_chars_per_line);
        const titleLineHeight = BORI_STYLE.question.font_size + 6;
        titleLines.forEach((line, idx) => {
          const escapedLine = escapeText(line);
          const lineY = questionY + (idx * titleLineHeight);
          headerFilters += `drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.question.font_size}:fontcolor=${BORI_STYLE.question.color}:borderw=${BORI_STYLE.question.border_width}:bordercolor=${BORI_STYLE.question.border_color}:x=(w-text_w)/2:y=${lineY},`;
        });
      }

      // 하단 나레이션 (씬마다)
      sceneTexts.forEach((scene) => {
        if (scene.bottom_text) {
          const subLines = splitSubtitleLines(scene.bottom_text, BORI_STYLE.answer.max_chars_per_line);
          const lineHeight = BORI_STYLE.answer.font_size + 6;
          subLines.forEach((line, idx) => {
            const escapedLine = escapeText(line);
            const lineY = answerY + (idx * lineHeight);
            textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.answer.font_size}:fontcolor=${BORI_STYLE.answer.color}:borderw=${BORI_STYLE.answer.border_width}:bordercolor=${BORI_STYLE.answer.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
          });
        }
      });

      // 채널명
      var baseFilters = `${headerFilters}drawtext=text='${escapedChannel}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.channel.font_size}:fontcolor=${BORI_STYLE.channel.color}:borderw=${BORI_STYLE.channel.border_width}:bordercolor=${BORI_STYLE.channel.border_color}:x=(w-text_w)/2:y=${channelY}`;
    }

    // BGM 처리
    let bgmInput = "";
    let bgmFilter = "";
    let audioMap = "-map 1:a";

    if (bgmPath) {
      bgmInput = `-i "${bgmPath}"`;
      bgmFilter = `;[1:a]volume=1[va];[2:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
      audioMap = `-map "[aout]"`;
    }

    // 최종 필터
    const filterComplex = `
      color=black:s=${width}x${height}:d=${totalDuration}[bg];
      [1:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
      [bg][video]overlay=0:${videoY}[combined];
      [combined]${baseFilters}${textFilters}[out]${bgmFilter}
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

    console.log(`[${jobId}] Render complete: ${publicUrl}`);

    res.json({
      success: true,
      job_id: jobId,
      url: publicUrl,
      folder_name: folder_name,
      total_duration: totalDuration,
      layout_mode: layoutMode,
      stats: {
        video_count: videos.length,
        has_bgm: !!bgm_url,
        scene_text_count: sceneTexts.length,
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

// =====================
// Ken Burns 렌더링 API
// 이미지 → Ken Burns 효과 영상 → 자막 합성
// =====================
const KEN_BURNS_EFFECTS = {
  zoom_in_center: {
    name: "Zoom In (Center)",
    filter: (frames) => `zoompan=z='min(zoom+0.002,1.3)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`
  },
  zoom_out_center: {
    name: "Zoom Out (Center)",
    filter: (frames) => `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.002))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`
  },
  pan_down_zoom: {
    name: "Pan Down + Zoom",
    filter: (frames) => `zoompan=z='min(zoom+0.001,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='min(ih*0.6,y+2)':s=1080x1920:fps=30`
  },
  pan_left_right: {
    name: "Pan Left to Right",
    filter: (frames) => `zoompan=z='1.1':d=${frames}:x='min(iw*0.3,x+3)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`
  },
  zoom_face: {
    name: "Zoom to Face (Top 1/3)",
    filter: (frames) => `zoompan=z='min(zoom+0.002,1.4)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/3-(ih/zoom/2)':s=1080x1920:fps=30`
  }
};

app.post("/render/ken-burns", async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TEMP_DIR, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    const {
      scenes,
      bgm_url,
      bgm_volume = 0.2,
      channel_name = "땅콩이네",
      width = 1080,
      height = 1920,
      output_bucket,
      output_path,
      folder_name,
    } = req.body;

    if (!scenes || !scenes.length) {
      return res.status(400).json({ error: "No scenes provided" });
    }

    console.log(`[${jobId}] Starting Ken Burns render: ${scenes.length} scenes`);
    console.log(`[${jobId}] Output: ${output_bucket}/${output_path}`);

    // 1. 이미지 다운로드 및 Ken Burns 영상 생성 (병렬)
    console.log(`[${jobId}] Processing ${scenes.length} images with Ken Burns effect...`);
    const sortedScenes = [...scenes].sort((a, b) => a.index - b.index);
    const effectKeys = Object.keys(KEN_BURNS_EFFECTS);

    const processPromises = sortedScenes.map(async (scene, i) => {
      const imagePath = path.join(jobDir, `image_${i}.jpg`);
      const videoPath = path.join(jobDir, `scene_${i}.mp4`);

      // 이미지 다운로드
      const response = await axios({
        method: "GET",
        url: scene.image_url,
        responseType: "arraybuffer",
        timeout: 60000,
      });
      fs.writeFileSync(imagePath, Buffer.from(response.data));

      // Ken Burns 효과 선택
      const effectKey = scene.effect || effectKeys[i % effectKeys.length];
      const effect = KEN_BURNS_EFFECTS[effectKey] || KEN_BURNS_EFFECTS.zoom_in_center;
      const duration = scene.duration || 6;
      const frames = duration * 30;

      // Ken Burns 영상 생성
      const kenBurnsFilter = effect.filter(frames);
      await execAsync(`ffmpeg -y -loop 1 -i "${imagePath}" \
        -vf "scale=4000:-1,${kenBurnsFilter}" \
        -t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p \
        "${videoPath}"`, { maxBuffer: 1024 * 1024 * 100 });

      return {
        index: i,
        videoPath,
        duration,
        scene,
        effect: effectKey
      };
    });

    const processedScenes = await Promise.all(processPromises);
    processedScenes.sort((a, b) => a.index - b.index);

    const totalDuration = processedScenes.reduce((sum, s) => sum + s.duration, 0);
    console.log(`[${jobId}] Total duration: ${totalDuration.toFixed(2)}s`);

    // 2. 씬별 자막 데이터 생성
    const sceneTexts = [];
    let currentTime = 0;

    for (const { duration, scene, index } of processedScenes) {
      sceneTexts.push({
        start: currentTime + 0.2,
        end: currentTime + duration - 0.2,
        question: scene.question || "",
        question_english: scene.question_english || "",
        answer: scene.answer || "",
        answer_english: scene.answer_english || "",
        scene_index: scene.index || (index + 1),
      });
      currentTime += duration;
    }

    // 3. 영상 정규화 (세로 비율 맞춤)
    console.log(`[${jobId}] Normalizing videos...`);
    const videoHeight = Math.round(height * BORI_STYLE.video_height_percent / 100);

    const normalizePromises = processedScenes.map(async ({ index, videoPath }) => {
      const normalizedPath = path.join(jobDir, `normalized_${index}.mp4`);
      await execAsync(`ffmpeg -y -i "${videoPath}" \
        -vf "scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
        -c:v libx264 -preset fast -crf 18 \
        -an \
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

    // 6. 필터 생성 (Bori 스타일 자막)
    console.log(`[${jobId}] Building Ken Burns filter complex...`);
    const videoY = Math.round((height - videoHeight) / 2);

    const questionY = Math.round(height * BORI_STYLE.question.y_percent / 100);
    const questionEngY = Math.round(height * BORI_STYLE.question_english.y_percent / 100);
    const answerY = Math.round(height * BORI_STYLE.answer.y_percent / 100);
    const answerEngY = Math.round(height * BORI_STYLE.answer_english.y_percent / 100);
    const channelY = Math.round(height * BORI_STYLE.channel.y_percent / 100);

    let textFilters = "";

    sceneTexts.forEach((scene) => {
      // 상단: 질문 (한글)
      if (scene.question) {
        const qLines = splitSubtitleLines(scene.question, BORI_STYLE.question.max_chars_per_line);
        const qLineHeight = BORI_STYLE.question.font_size + 6;
        qLines.forEach((line, idx) => {
          const escapedLine = escapeText(line);
          const lineY = questionY + (idx * qLineHeight);
          textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.question.font_size}:fontcolor=${BORI_STYLE.question.color}:borderw=${BORI_STYLE.question.border_width}:bordercolor=${BORI_STYLE.question.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
        });
      }

      // 상단: 질문 (영어)
      if (scene.question_english) {
        const qEngLines = splitEnglishSubtitleLines(scene.question_english, BORI_STYLE.question_english.max_chars_per_line);
        const qEngLineHeight = BORI_STYLE.question_english.font_size + 4;
        const qKorLineCount = scene.question ? splitSubtitleLines(scene.question, BORI_STYLE.question.max_chars_per_line).length : 0;
        const qEngStartY = questionEngY + (qKorLineCount > 1 ? (qKorLineCount - 1) * (BORI_STYLE.question.font_size + 6) : 0);

        qEngLines.forEach((line, idx) => {
          const escapedLine = escapeText(line);
          const lineY = qEngStartY + (idx * qEngLineHeight);
          textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothic.ttf:fontsize=${BORI_STYLE.question_english.font_size}:fontcolor=${BORI_STYLE.question_english.color}:borderw=${BORI_STYLE.question_english.border_width}:bordercolor=${BORI_STYLE.question_english.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
        });
      }

      // 하단: 답변 (한글)
      if (scene.answer) {
        const aLines = splitSubtitleLines(scene.answer, BORI_STYLE.answer.max_chars_per_line);
        const aLineHeight = BORI_STYLE.answer.font_size + 6;
        aLines.forEach((line, idx) => {
          const escapedLine = escapeText(line);
          const lineY = answerY + (idx * aLineHeight);
          textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.answer.font_size}:fontcolor=${BORI_STYLE.answer.color}:borderw=${BORI_STYLE.answer.border_width}:bordercolor=${BORI_STYLE.answer.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
        });
      }

      // 하단: 답변 (영어)
      if (scene.answer_english) {
        const aEngLines = splitEnglishSubtitleLines(scene.answer_english, BORI_STYLE.answer_english.max_chars_per_line);
        const aEngLineHeight = BORI_STYLE.answer_english.font_size + 4;
        const aKorLineCount = scene.answer ? splitSubtitleLines(scene.answer, BORI_STYLE.answer.max_chars_per_line).length : 0;
        const aEngStartY = answerEngY + (aKorLineCount > 1 ? (aKorLineCount - 1) * (BORI_STYLE.answer.font_size + 6) : 0);

        aEngLines.forEach((line, idx) => {
          const escapedLine = escapeText(line);
          const lineY = aEngStartY + (idx * aEngLineHeight);
          textFilters += `,drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothic.ttf:fontsize=${BORI_STYLE.answer_english.font_size}:fontcolor=${BORI_STYLE.answer_english.color}:borderw=${BORI_STYLE.answer_english.border_width}:bordercolor=${BORI_STYLE.answer_english.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${scene.start},${scene.end})'`;
        });
      }
    });

    // 채널명 (항상 표시)
    const escapedChannel = escapeText(channel_name);
    const channelFilter = `drawtext=text='${escapedChannel}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${BORI_STYLE.channel.font_size}:fontcolor=${BORI_STYLE.channel.color}:borderw=${BORI_STYLE.channel.border_width}:bordercolor=${BORI_STYLE.channel.border_color}:x=(w-text_w)/2:y=${channelY}`;

    // BGM 처리
    let bgmInput = "";
    let bgmFilter = "";
    let audioMap = "";

    if (bgmPath) {
      bgmInput = `-i "${bgmPath}"`;
      bgmFilter = `;[2:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[aout]`;
      audioMap = `-map "[aout]"`;
    }

    // 최종 필터
    const filterComplex = `
      color=black:s=${width}x${height}:d=${totalDuration}[bg];
      [1:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
      [bg][video]overlay=0:${videoY}[combined];
      [combined]${channelFilter}${textFilters}[out]${bgmFilter}
    `.replace(/\n/g, "").replace(/\s+/g, " ").trim();

    // 7. 최종 렌더링
    console.log(`[${jobId}] Running final FFmpeg render (Ken Burns)...`);
    const outputFilePath = path.join(jobDir, "final_output.mp4");

    const ffmpegCmd = bgmPath
      ? `ffmpeg -y -f lavfi -i "color=black:s=${width}x${height}:d=${totalDuration}" -i "${concatenatedPath}" ${bgmInput} -filter_complex "${filterComplex}" -map "[out]" ${audioMap} -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -shortest "${outputFilePath}"`
      : `ffmpeg -y -f lavfi -i "color=black:s=${width}x${height}:d=${totalDuration}" -i "${concatenatedPath}" -filter_complex "${filterComplex}" -map "[out]" -c:v libx264 -preset slow -crf 18 "${outputFilePath}"`;

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

    console.log(`[${jobId}] Ken Burns render complete: ${publicUrl}`);

    res.json({
      success: true,
      job_id: jobId,
      url: publicUrl,
      folder_name: folder_name,
      total_duration: totalDuration,
      render_style: "ken_burns",
      stats: {
        scene_count: scenes.length,
        has_bgm: !!bgm_url,
        effects_used: processedScenes.map(s => s.effect),
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
  console.log(`  POST /render/puppy - Video render (auto-detect: story/QA mode)`);
  console.log(`  POST /render/ken-burns - Ken Burns (image -> video + subtitles)`);
});
SERVEREOF

# PM2로 서버 시작
pm2 start server.js --name ffmpeg-api
pm2 save
pm2 startup systemd -u root --hp /root

echo "=========================================="
echo "FFmpeg Render Server Setup Complete!"
echo "API available at http://$(curl -s ifconfig.me):3000"
echo "=========================================="
