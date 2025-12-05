/**
 * FFmpeg Render Server V2 - 정규화 최적화 버전
 * 
 * 변경점:
 * 1. 정규화 단계에서 -preset ultrafast 사용 (기존 유지)
 * 2. 정규화를 순차 실행으로 변경 (CPU 경쟁 방지)
 * 3. 최종 렌더링에서 -preset ultrafast 사용 (veryfast → ultrafast)
 * 4. 성능 측정 로그 추가
 * 
 * 기존 필터 구조 100% 유지 - 자막, 헤더, 푸터 검증됨
 */

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

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================
// 땅콩이 스타일 설정 (기존과 동일)
// =====================
const PEANUT_STYLE = {
  video_height_percent: 65,
  header: {
    font_size: 68,
    color: "0xFFD700",
    border_color: "0x333333",
    border_width: 5,
    y_percent: 4,
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
    y_percent: 94,
  },
  subtitle: {
    font_size: 46,
    color: "0xFFE66D",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 74,
  },
  subtitle_english: {
    font_size: 28,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 79,
  },
  subtitle_interviewer: {
    font_size: 46,
    color: "0x87CEEB",
    border_color: "0x333333",
    border_width: 4,
    y_percent: 74,
  },
  subtitle_interviewer_english: {
    font_size: 28,
    color: "0xFFFAF0",
    border_color: "0x333333",
    border_width: 3,
    y_percent: 79,
  },
};

// =====================
// 헬퍼 함수들 (기존과 동일)
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
  res.json({ status: "ok", ffmpeg: true, version: "v2-optimized", timestamp: new Date().toISOString() });
});

app.get("/version", async (req, res) => {
  try {
    const { stdout } = await execAsync("ffmpeg -version | head -1");
    res.json({ version: stdout.trim(), server_version: "v2-optimized" });
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
// 땅콩이 렌더링 API (최적화 버전)
// =====================
app.post("/render/puppy", async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TEMP_DIR, jobId);
  const startTime = Date.now();
  const timings = {};

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

    console.log(`[${jobId}] 🚀 Starting V2 render: ${videos.length} videos`);
    console.log(`[${jobId}] Output: ${output_bucket}/${output_path}`);

    const SUBTITLE_WIDTH_PERCENT = 70;
    const availableWidth = Math.round(width * SUBTITLE_WIDTH_PERCENT / 100);
    const KOR_CHAR_WIDTH = 50;
    const ENG_CHAR_WIDTH = 20;
    const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);
    const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);

    // =====================
    // 1. 영상 다운로드 (병렬)
    // =====================
    console.log(`[${jobId}] [1/5] Downloading ${videos.length} videos...`);
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
    timings.download = ((Date.now() - downloadStart) / 1000).toFixed(2);
    console.log(`[${jobId}] ✅ Download: ${timings.download}s`);

    const totalDuration = downloadedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`[${jobId}] Total duration: ${totalDuration.toFixed(2)}s`);

    // =====================
    // 2. 자막 데이터 생성
    // =====================
    const subtitles = [];
    let currentTime = 0;

    for (const { duration, video, index } of downloadedVideos) {
      const sceneNum = video.index || (index + 1);
      const narration = video.dialogue?.script || video.dialogue?.interviewer || video.dialogue?.["땅콩"] || video.narration || "";
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
          spoken_language: video.spoken_language || "korean",
        });
      }

      currentTime += duration;
    }

    // =====================
    // 3. 영상 정규화 (★★★ 순차 실행으로 CPU 경쟁 방지 ★★★)
    // =====================
    console.log(`[${jobId}] [2/5] Normalizing videos (sequential)...`);
    const normalizeStart = Date.now();
    const videoHeight = Math.round(height * PEANUT_STYLE.video_height_percent / 100);
    const normalizedVideos = [];

    for (const { index, filePath } of downloadedVideos) {
      const normalizedPath = path.join(jobDir, `normalized_${index}.mp4`);
      await execAsync(`ffmpeg -y -i "${filePath}" \
        -vf "scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
        -c:v libx264 -preset ultrafast -crf 23 -threads 2 \
        -c:a aac -b:a 128k -ar 44100 -ac 2 \
        -r 30 \
        "${normalizedPath}"`, { maxBuffer: 1024 * 1024 * 50 });
      normalizedVideos.push({ index, normalizedPath });
      console.log(`[${jobId}]   - Video ${index + 1}/${downloadedVideos.length} normalized`);
    }

    normalizedVideos.sort((a, b) => a.index - b.index);
    timings.normalize = ((Date.now() - normalizeStart) / 1000).toFixed(2);
    console.log(`[${jobId}] ✅ Normalize: ${timings.normalize}s`);

    // =====================
    // 4. 영상 연결
    // =====================
    console.log(`[${jobId}] [3/5] Concatenating videos...`);
    const concatStart = Date.now();
    const concatListPath = path.join(jobDir, "concat.txt");
    const concatContent = normalizedVideos.map(v => `file '${v.normalizedPath}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const concatenatedPath = path.join(jobDir, "concatenated.mp4");
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`, { maxBuffer: 1024 * 1024 * 50 });
    timings.concat = ((Date.now() - concatStart) / 1000).toFixed(2);
    console.log(`[${jobId}] ✅ Concat: ${timings.concat}s`);

    // =====================
    // 5. BGM 다운로드 (선택)
    // =====================
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

    // =====================
    // 6. 필터 생성 (기존 로직 100% 유지)
    // =====================
    console.log(`[${jobId}] [4/5] Building filter complex...`);
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

    // 상단 타이틀 필터
    const titleLinesKorean = splitHeaderLines(header_text || "", PEANUT_STYLE.header.max_chars_per_line);
    const titleLineHeight = PEANUT_STYLE.header.font_size + 10;
    let headerFilters = "";
    let lastKoreanLineY = headerY;

    if (titleLinesKorean.length > 0) {
      titleLinesKorean.forEach((line, idx) => {
        const escapedLine = escapeText(line);
        const lineY = headerY + (idx * titleLineHeight);
        lastKoreanLineY = lineY;
        headerFilters += `drawtext=text='${escapedLine}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY},`;
      });
    }

    if (header_text_english) {
      const englishY = lastKoreanLineY + PEANUT_STYLE.header_english.y_offset;
      const escapedEnglish = escapeText(header_text_english);
      headerFilters += `drawtext=text='${escapedEnglish}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${PEANUT_STYLE.header_english.font_size}:fontcolor=${PEANUT_STYLE.header_english.color}:borderw=${PEANUT_STYLE.header_english.border_width}:bordercolor=${PEANUT_STYLE.header_english.border_color}:x=(w-text_w)/2:y=${englishY},`;
    }

    const escapedChannel = escapeText(footer_text || "땅콩이네", false);

    // BGM 처리
    let bgmInput = "";
    let bgmFilter = "";
    let audioMap = "-map 1:a";

    if (bgmPath) {
      bgmInput = `-i "${bgmPath}"`;
      bgmFilter = `;[1:a]volume=1[va];[2:a]volume=${bgm_volume},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
      audioMap = `-map "[aout]"`;
    }

    const filterComplex = `
      color=black:s=${width}x${height}:d=${totalDuration}[bg];
      [1:v]scale=${width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
      [bg][video]overlay=0:${videoY}[combined];
      [combined]${headerFilters}drawtext=text='${escapedChannel}':fontfile=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf:fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}${subtitleFilters}[out]${bgmFilter}
    `.replace(/\n/g, "").replace(/\s+/g, " ").trim();

    // =====================
    // 7. 최종 렌더링 (★★★ ultrafast 프리셋 ★★★)
    // =====================
    console.log(`[${jobId}] [5/5] Running final render (ultrafast)...`);
    const renderStart = Date.now();
    const outputFilePath = path.join(jobDir, "final_output.mp4");

    const ffmpegCmd = `ffmpeg -y \
      -f lavfi -i "color=black:s=${width}x${height}:d=${totalDuration}" \
      -i "${concatenatedPath}" ${bgmInput} \
      -filter_complex "${filterComplex}" \
      -map "[out]" ${audioMap} \
      -c:v libx264 -preset ultrafast -crf 23 -threads 0 \
      -c:a aac -b:a 128k \
      -shortest \
      "${outputFilePath}"`;

    await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 100 });
    timings.render = ((Date.now() - renderStart) / 1000).toFixed(2);
    console.log(`[${jobId}] ✅ Render: ${timings.render}s`);

    // =====================
    // 8. GCS 업로드
    // =====================
    console.log(`[${jobId}] Uploading to GCS...`);
    const uploadStart = Date.now();
    const bucket = storage.bucket(output_bucket);
    await bucket.upload(outputFilePath, {
      destination: output_path,
      metadata: { contentType: "video/mp4" },
    });

    const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;
    timings.upload = ((Date.now() - uploadStart) / 1000).toFixed(2);
    console.log(`[${jobId}] ✅ Upload: ${timings.upload}s`);

    // 정리
    fs.rmSync(jobDir, { recursive: true, force: true });

    timings.total = ((Date.now() - startTime) / 1000).toFixed(2);
    const ratio = (parseFloat(timings.total) / totalDuration).toFixed(2);
    console.log(`[${jobId}] 🎉 COMPLETE: ${timings.total}s (${ratio}x realtime)`);
    console.log(`[${jobId}] 📊 Breakdown: Download=${timings.download}s, Normalize=${timings.normalize}s, Concat=${timings.concat}s, Render=${timings.render}s, Upload=${timings.upload}s`);

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
        has_header_english: !!header_text_english,
        has_footer: !!footer_text,
        has_subtitles: subtitle_enabled,
        has_english_subtitles: subtitle_english_enabled,
        subtitle_count: subtitles.length,
      },
      performance: {
        total_seconds: parseFloat(timings.total),
        download_seconds: parseFloat(timings.download),
        normalize_seconds: parseFloat(timings.normalize),
        concat_seconds: parseFloat(timings.concat),
        render_seconds: parseFloat(timings.render),
        upload_seconds: parseFloat(timings.upload),
        ratio: ratio + "x",
        video_duration_seconds: totalDuration,
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

// 기본 렌더링 API (기존과 동일)
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

    const concatListPath = path.join(jobDir, "concat.txt");
    const concatContent = downloadedFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const outputPath = path.join(jobDir, "output.mp4");
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`);

    const bucket = storage.bucket(output_bucket);
    await bucket.upload(outputPath, {
      destination: output_path,
      metadata: { contentType: "video/mp4" },
    });

    const publicUrl = `https://storage.googleapis.com/${output_bucket}/${output_path}`;

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
  console.log(`🚀 FFmpeg Render API V2 (Optimized) running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /version - FFmpeg version`);
  console.log(`  GET  /fonts - Available Korean fonts`);
  console.log(`  POST /render - Basic video concatenation`);
  console.log(`  POST /render/puppy - Puppy style render (OPTIMIZED)`);
});

