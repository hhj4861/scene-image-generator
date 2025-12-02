import { axios } from "@pipedream/platform";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default defineComponent({
  name: "Puppy FFmpeg Render",
  description: "FFmpeg로 최종 영상 합성 - 땅콩이 템플릿 (상단 타이틀 + 하단 채널명 + 자막)",

  props: {
    video_generator_output: {
      type: "string",
      label: "Video Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}",
    },
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
      optional: true,
    },
    topic_generator_output: {
      type: "string",
      label: "Topic Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Topic_Generator.$return_value)}}",
      optional: true,
    },
    tts_generator_output: {
      type: "string",
      label: "TTS Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_ElevenLabs_TTS.$return_value)}}",
      optional: true,
    },
    bgm_url: {
      type: "string",
      label: "BGM URL",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM Volume (0.0-1.0)",
      default: "0.2",
    },
    header_text: {
      type: "string",
      label: "Header Text (상단 제목)",
      description: "에피소드 타이틀 (예: 비트박스 천재견 땅콩의 반전)",
      optional: true,
    },
    footer_text: {
      type: "string",
      label: "Footer Text (하단 채널명)",
      description: "채널/시리즈명 (예: 땅콩이네)",
      default: "땅콩이네",
      optional: true,
    },
    subtitle_enabled: {
      type: "boolean",
      label: "Enable Subtitles",
      default: true,
    },
    subtitle_english_enabled: {
      type: "boolean",
      label: "Enable English Subtitles",
      description: "한글 자막 아래 영어 자막 표시",
      default: false,
    },
    video_width: {
      type: "integer",
      label: "Video Width",
      default: 1080,
    },
    video_height: {
      type: "integer",
      label: "Video Height",
      default: 1920,
    },
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
    },
  },

  async run({ $ }) {
    // =====================
    // 1. 입력 파싱
    // =====================
    const videoOutput = typeof this.video_generator_output === "string"
      ? JSON.parse(this.video_generator_output) : this.video_generator_output;
    const scriptOutput = this.script_generator_output
      ? (typeof this.script_generator_output === "string"
          ? JSON.parse(this.script_generator_output) : this.script_generator_output)
      : null;
    const topicOutput = this.topic_generator_output
      ? (typeof this.topic_generator_output === "string"
          ? JSON.parse(this.topic_generator_output) : this.topic_generator_output)
      : null;
    const ttsOutput = this.tts_generator_output
      ? (typeof this.tts_generator_output === "string"
          ? JSON.parse(this.tts_generator_output) : this.tts_generator_output)
      : null;

    const videos = videoOutput.videos || [];
    const folderName = videoOutput.folder_name || scriptOutput?.folder_name || `render_${Date.now()}`;

    if (!videos.length) throw new Error("No videos provided");

    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

    $.export("input", { videos: sortedVideos.length, folder: folderName });

    // =====================
    // 2. 땅콩이 스타일 설정
    // =====================
    // 땅콩이 스타일 설정 (노란색 계열, 편안한 분위기)
    const PEANUT_STYLE = {
      width: this.video_width,
      height: this.video_height,
      video_height_percent: 65,  // 영상 영역 65%

      // 상단 타이틀 (밝은 크림/아이보리, 큰 폰트, 2줄 가능)
      header: {
        font_size: 80,
        color: "0xFFF8DC",       // 콘실크 - 밝은 크림색
        border_color: "0x5D4E37", // 다크 브라운 외곽선
        border_width: 4,
        y_percent: 5,
        max_chars_per_line: 12,
      },
      // 하단 채널명 (따뜻한 골든/머스타드, 큰 폰트)
      footer: {
        font_size: 75,
        color: "0xF4A460",       // 샌디브라운 - 따뜻한 주황빛 노랑
        border_color: "0x4A3C2A", // 다크 브라운 외곽선
        border_width: 4,
        y_percent: 87,           // 영상 바로 아래 (자막에 가려지지 않게)
      },
      // 한글 자막 (부드러운 노란색, 영상 하단부)
      subtitle: {
        font_size: 48,
        color: "0xFFE66D",       // 부드러운 노랑 (눈 편안)
        border_color: "0x333333", // 진한 회색 외곽선
        border_width: 4,
        y_percent: 75,
      },
      subtitle_english: {
        font_size: 36,           // 36pt (화면에 맞게)
        color: "0xFFFAF0",       // 플로랄화이트
        border_color: "0x333333",
        border_width: 3,
        y_percent: 80,
      },
      subtitle_interviewer: {
        font_size: 48,
        color: "0x87CEEB",       // 스카이블루 (눈 편안)
        border_color: "0x333333",
        border_width: 4,
        y_percent: 75,
      },
      subtitle_interviewer_english: {
        font_size: 36,           // 36pt (화면에 맞게)
        color: "0xFFFAF0",       // 플로랄화이트
        border_color: "0x333333",
        border_width: 3,
        y_percent: 80,
      },
    };

    // =====================
    // 3. 헬퍼 함수들
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

    // 자막 텍스트 정리 (동적 줄바꿈 - 영상 폭의 70% 기준)
    // 영상 폭 1080px, 앞뒤 15% 제외 = 70% 사용 = 756px
    // 한글 폰트 48pt 기준 약 50px/글자, 영문 폰트 36pt 기준 약 20px/글자
    const SUBTITLE_WIDTH_PERCENT = 70;  // 영상 폭의 70% 사용
    const availableWidth = Math.round(this.video_width * SUBTITLE_WIDTH_PERCENT / 100);
    const KOR_CHAR_WIDTH = 50;  // 한글 48pt 기준 글자당 약 50px
    const ENG_CHAR_WIDTH = 20;  // 영문 36pt 기준 글자당 약 20px
    const MAX_CHARS_PER_LINE = Math.floor(availableWidth / KOR_CHAR_WIDTH);      // 동적 계산
    const MAX_CHARS_PER_LINE_ENG = Math.floor(availableWidth / ENG_CHAR_WIDTH);  // 동적 계산

    const cleanSubtitleText = (text) => {
      if (!text) return "";
      let cleaned = text.replace(/콩파민[!！]?/g, "").trim();
      cleaned = cleaned.replace(/\s+/g, " ");
      cleaned = cleaned.replace(/\.{2,}\s*/g, "... ");
      return cleaned;
    };

    // 자막 줄 나누기 (텍스트 길이에 따라 자동으로 줄 수 결정)
    const splitSubtitleLines = (text) => {
      const cleaned = cleanSubtitleText(text);
      if (!cleaned) return [];

      // 한 줄에 들어가면 그대로 반환
      if (cleaned.length <= MAX_CHARS_PER_LINE) {
        return [cleaned];
      }

      // 필요한 줄 수 계산 (올림)
      const neededLines = Math.ceil(cleaned.length / MAX_CHARS_PER_LINE);
      const targetCharsPerLine = Math.ceil(cleaned.length / neededLines);

      const lines = [];
      let remaining = cleaned;

      for (let i = 0; i < neededLines && remaining.length > 0; i++) {
        if (remaining.length <= targetCharsPerLine || i === neededLines - 1) {
          // 마지막 줄이거나 남은 텍스트가 목표 길이 이하면 전부 추가
          lines.push(remaining.trim());
          break;
        }

        // 목표 길이 근처에서 공백 찾기
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

      return lines.filter(l => l.length > 0);
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

    // 영문 자막 줄 나누기 (텍스트 길이에 따라 자동으로 줄 수 결정)
    const splitEnglishSubtitleLines = (text) => {
      if (!text) return [];
      const cleaned = text.trim();

      if (cleaned.length <= MAX_CHARS_PER_LINE_ENG) {
        return [cleaned];
      }

      // 필요한 줄 수 계산 (올림)
      const neededLines = Math.ceil(cleaned.length / MAX_CHARS_PER_LINE_ENG);
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

      return lines.filter(l => l.length > 0);
    };

    // =====================
    // 4. 영상 다운로드 및 길이 확인
    // =====================
    $.export("status", "Downloading videos...");

    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    const tempDir = path.join(os.tmpdir(), `ffmpeg_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const downloadedVideos = [];
    const videoDurations = [];

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i];
      const videoPath = path.join(tempDir, `video_${i}.mp4`);

      // 영상 다운로드
      const response = await axios($, {
        method: "GET",
        url: video.url,
        responseType: "arraybuffer",
      });
      fs.writeFileSync(videoPath, Buffer.from(response));
      downloadedVideos.push(videoPath);

      // 영상 길이 확인
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
        );
        videoDurations.push(parseFloat(stdout.trim()));
      } catch {
        videoDurations.push(video.duration || 6);
      }
    }

    const totalDuration = videoDurations.reduce((a, b) => a + b, 0);
    $.export("total_duration", totalDuration);

    // =====================
    // 5. 자막 데이터 생성
    // =====================
    const subtitles = [];
    let currentTime = 0;

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i];
      const duration = videoDurations[i];
      const sceneNum = video.index || (i + 1);

      // script 필드 우선 사용 (자막-음성 싱크 맞춤)
      const narration = video.dialogue?.script || video.dialogue?.interviewer || video.dialogue?.["땅콩"] || video.narration || "";
      const narrationEnglish = video.dialogue?.script_english || video.narration_english || "";
      const isInterviewQuestion = video.is_interview_question || video.scene_type === "interview_question";
      const isPerformance = video.is_performance && !narration;

      if (narration && !isPerformance && this.subtitle_enabled) {
        subtitles.push({
          start: currentTime + 0.3,
          end: currentTime + duration - 0.3,
          text: narration,
          text_english: narrationEnglish,
          speaker: isInterviewQuestion ? "interviewer" : "main",
          scene_index: sceneNum,
        });
      }

      currentTime += duration;
    }

    // =====================
    // 6. FFmpeg 합성
    // =====================
    $.export("status", "Rendering with FFmpeg...");

    const videoHeight = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.video_height_percent / 100);
    const videoY = Math.round((PEANUT_STYLE.height - videoHeight) / 2);

    // Step 1: 영상 정규화
    const normalizedVideos = [];
    for (let i = 0; i < downloadedVideos.length; i++) {
      const normalizedPath = path.join(tempDir, `normalized_${i}.mp4`);
      await execAsync(`ffmpeg -y -i "${downloadedVideos[i]}" \
        -vf "scale=1080:${videoHeight}:force_original_aspect_ratio=decrease,pad=1080:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
        -c:v libx264 -preset fast -crf 18 \
        -c:a aac -b:a 192k -ar 44100 -ac 2 \
        -r 30 \
        "${normalizedPath}"`);
      normalizedVideos.push(normalizedPath);
    }

    // Step 2: 영상 연결
    const concatListPath = path.join(tempDir, "concat_list.txt");
    const concatContent = normalizedVideos.map(v => `file '${v}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const concatenatedPath = path.join(tempDir, "concatenated.mp4");
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}"`);

    // Step 3: 텍스트 오버레이
    const headerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.header.y_percent / 100);
    const footerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.footer.y_percent / 100);

    // 자막 필터 생성 (텍스트 길이에 따라 동적 줄바꿈)
    let subtitleFilters = "";
    subtitles.forEach((sub) => {
      const isInterviewer = sub.speaker === "interviewer";
      const subStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer : PEANUT_STYLE.subtitle;
      const subEngStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer_english : PEANUT_STYLE.subtitle_english;
      const baseSubY = Math.round(PEANUT_STYLE.height * subStyle.y_percent / 100);
      const baseEngY = Math.round(PEANUT_STYLE.height * subEngStyle.y_percent / 100);
      const lineHeight = subStyle.font_size + 8;
      const engLineHeight = subEngStyle.font_size + 5;

      // 한글 자막 (텍스트 길이에 따라 자동 줄바꿈)
      const korLines = splitSubtitleLines(sub.text || "");
      if (korLines.length > 0) {
        // 여러 줄일 때 위치 조정 (위로 올림)
        const korStartY = korLines.length > 1 ? baseSubY - ((korLines.length - 1) * lineHeight / 2) : baseSubY;

        korLines.forEach((line, idx) => {
          let escapedLine = escapeText(line);
          if (idx === 0 && isInterviewer) {
            escapedLine = `Q\\: ${escapedLine}`;
          }
          const lineY = korStartY + (idx * lineHeight);
          subtitleFilters += `,drawtext=text='${escapedLine}':fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${sub.start},${sub.end})'`;
        });
      }

      // 영어 자막 (길면 2줄 처리)
      if (this.subtitle_english_enabled && sub.text_english) {
        const engLines = splitEnglishSubtitleLines(sub.text_english);
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

    // 상단 타이틀 (2줄 처리)
    const headerText = this.header_text || topicOutput?.topic || scriptOutput?.title?.korean || "";
    const footerText = this.footer_text || "땅콩이네";
    const titleLines = splitHeaderLines(headerText, PEANUT_STYLE.header.max_chars_per_line || 12);
    const titleLineHeight = PEANUT_STYLE.header.font_size + 10;
    let headerFilters = "";
    if (titleLines.length > 0) {
      titleLines.forEach((line, idx) => {
        const escapedLine = escapeText(line);
        const lineY = headerY + (idx * titleLineHeight);
        headerFilters += `drawtext=text='${escapedLine}':fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY},`;
      });
    }
    const escapedChannel = escapeText(footerText);

    // BGM 처리
    let bgmInput = "";
    let bgmFilter = "";
    let audioMap = "-map 1:a";

    if (this.bgm_url) {
      const bgmPath = path.join(tempDir, "bgm.mp3");
      const bgmResponse = await axios($, {
        method: "GET",
        url: this.bgm_url,
        responseType: "arraybuffer",
      });
      fs.writeFileSync(bgmPath, Buffer.from(bgmResponse));

      bgmInput = `-i "${bgmPath}"`;
      const bgmVol = parseFloat(this.bgm_volume) || 0.2;
      bgmFilter = `;[1:a]volume=1[va];[2:a]volume=${bgmVol},afade=t=out:st=${totalDuration - 2}:d=2[ba];[va][ba]amix=inputs=2:duration=first[aout]`;
      audioMap = "-map \"[aout]\"";
    }

    // 최종 필터
    const filterComplex = `
      color=black:s=${PEANUT_STYLE.width}x${PEANUT_STYLE.height}:d=${totalDuration}[bg];
      [1:v]scale=${PEANUT_STYLE.width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${PEANUT_STYLE.width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
      [bg][video]overlay=0:${videoY}[combined];
      [combined]${headerFilters}drawtext=text='${escapedChannel}':fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}${subtitleFilters}[out]${bgmFilter}
    `.replace(/\n/g, "").replace(/\s+/g, " ").trim();

    const outputPath = path.join(tempDir, "final_output.mp4");
    await execAsync(`ffmpeg -y \
      -f lavfi -i "color=black:s=${PEANUT_STYLE.width}x${PEANUT_STYLE.height}:d=${totalDuration}" \
      -i "${concatenatedPath}" ${bgmInput} \
      -filter_complex "${filterComplex}" \
      -map "[out]" ${audioMap} \
      -c:v libx264 -preset slow -crf 18 \
      -c:a aac -b:a 192k \
      -shortest \
      "${outputPath}"`);

    // =====================
    // 7. GCS 업로드
    // =====================
    $.export("status", "Uploading to GCS...");

    const videoBuffer = fs.readFileSync(outputPath);

    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });
    const objectName = `${folderName}/final_shorts.mp4`;

    const stream = new Readable();
    stream.push(videoBuffer);
    stream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: { mimeType: "video/mp4", body: stream },
      requestBody: { name: objectName, contentType: "video/mp4" },
    });

    const finalUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    // 임시 파일 정리
    fs.rmSync(tempDir, { recursive: true, force: true });

    $.export("$summary", `Rendered ${totalDuration.toFixed(1)}s video with ${sortedVideos.length} clips (FFmpeg)`);

    return {
      success: true,
      url: finalUrl,
      folder_name: folderName,
      total_duration: totalDuration,
      render_engine: "ffmpeg",
      stats: {
        video_count: sortedVideos.length,
        has_bgm: !!this.bgm_url,
        has_header: !!headerText,
        has_footer: !!footerText,
        has_subtitles: this.subtitle_enabled,
        has_english_subtitles: this.subtitle_english_enabled,
        subtitle_count: subtitles.length,
      },
    };
  },
});
