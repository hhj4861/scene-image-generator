import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Creatomate Render",
  description: "최종 영상 합성 - BGM + 자막 (speaker별 스타일)",

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
    // ★★★ TTS Generator 출력 추가 ★★★
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
      label: "BGM Volume",
      default: "20%",
    },
    header_text: {
      type: "string",
      label: "Header Text (상단 제목)",
      description: "에피소드 타이틀 (예: 살기위해 먹는 사료 ASMR)",
      optional: true,
    },
    footer_text: {
      type: "string",
      label: "Footer Text (하단 채널명)",
      description: "채널/시리즈명 (예: 땅콩이네)",
      default: "땅콩이네",
      optional: true,
    },
    subtitle_english_enabled: {
      type: "boolean",
      label: "Enable English Subtitles",
      description: "한글 자막 아래 영어 자막 표시",
      default: false,
    },
    creatomate_api_key: {
      type: "string",
      label: "Creatomate API Key",
      secret: true,
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
    subtitle_enabled: {
      type: "boolean",
      label: "Enable Subtitles",
      default: true,
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

    // ★★★ TTS Generator 출력 파싱 ★★★
    const ttsOutput = this.tts_generator_output
      ? (typeof this.tts_generator_output === "string"
          ? JSON.parse(this.tts_generator_output) : this.tts_generator_output)
      : null;

    // TTS 파일을 index로 빠르게 찾기 위한 맵
    const ttsMap = new Map();
    if (ttsOutput?.tts_files) {
      for (const tts of ttsOutput.tts_files) {
        if (tts.success && tts.url) {
          ttsMap.set(tts.index, tts);
        }
      }
    }

    $.export("tts_loaded", ttsMap.size);

    const videos = videoOutput.videos || [];
    const folderName = videoOutput.folder_name || scriptOutput?.folder_name || `render_${Date.now()}`;

    if (!videos.length) throw new Error("No videos provided");

    // ★ index 순 정렬 보장
    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

    $.export("input", { videos: sortedVideos.length, folder: folderName });

    // =====================
    // 2. 레이아웃 (땅콩이 스타일)
    // =====================
    // 영상이 전체 화면, 텍스트는 영상 위에 오버레이
    // 상단 타이틀: Topic Generator의 topic 사용
    const headerText = this.header_text || topicOutput?.topic || scriptOutput?.title?.korean || "";
    const hasHeader = !!headerText;
    const hasFooter = !!this.footer_text;

    // =====================
    // 3. Elements 생성
    // =====================
    let currentTime = 0;
    const elements = [];

    // 검은 배경 (영상 로딩 전)
    elements.push({
      type: "shape",
      shape: "rectangle",
      width: "100%",
      height: "100%",
      fill_color: "#000000",
      time: 0,
    });

    // 비디오 + TTS 오디오 (★ 순서대로, 전체 화면)
    for (const video of sortedVideos) {
      const duration = video.duration || 5;
      const videoIndex = video.index;

      // 비디오 (전체 화면 - cover, 음소거 - TTS로 대체)
      elements.push({
        type: "video",
        source: video.url,
        time: currentTime,
        duration,
        width: "100%",
        height: "100%",
        fit: "cover",
        volume: "0%", // ★★★ Veo 3 영상 음소거 (TTS로 대체) ★★★
      });

      // ★★★ TTS 오디오 추가 (ElevenLabs에서 생성된 음성) ★★★
      const ttsFile = ttsMap.get(videoIndex);
      if (ttsFile && ttsFile.url) {
        elements.push({
          type: "audio",
          source: ttsFile.url,
          time: currentTime,
          duration,
          volume: "100%",
        });
      }

      currentTime += duration;
    }

    const totalDuration = currentTime;

    // ★ 상단 타이틀 (땅콩이 스타일: 따뜻한 크림색 + 갈색 외곽선)
    // Topic Generator의 topic 사용
    if (hasHeader) {
      elements.push({
        type: "text",
        text: headerText,
        time: 0,
        duration: totalDuration,
        width: "90%",
        x: "50%",
        y: "7%",
        x_anchor: "50%",
        y_anchor: "50%",
        font_family: "Black Han Sans",
        font_size: "7 vw",
        font_weight: "400",
        fill_color: "#FFF8E7",
        stroke_color: "#8B4513",
        stroke_width: "1.8 vw",
        text_align: "center",
        line_height: "115%",
      });
    }

    // ★ 하단 채널명 (땅콩이 스타일: 코랄 오렌지 + 갈색 외곽선)
    if (hasFooter) {
      elements.push({
        type: "text",
        text: this.footer_text,
        time: 0,
        duration: totalDuration,
        width: "90%",
        x: "50%",
        y: "93%",
        x_anchor: "50%",
        y_anchor: "50%",
        font_family: "Black Han Sans",
        font_size: "7 vw",
        font_weight: "400",
        fill_color: "#FF7F50",
        stroke_color: "#5D3A1A",
        stroke_width: "1.8 vw",
        text_align: "center",
      });
    }

    // BGM
    if (this.bgm_url) {
      elements.push({
        type: "audio",
        source: this.bgm_url,
        time: 0,
        duration: totalDuration,
        volume: this.bgm_volume || "20%",
        audio_fade_out: "2s",
      });
    }

    // ★ 자막 (땅콩이 스타일: 따뜻한 톤, 한글/영어 이중 자막)
    // Script Generator 또는 Video Generator 출력에서 자막 데이터 가져오기
    const subtitleSegments = scriptOutput?.script?.script_segments || sortedVideos;

    if (this.subtitle_enabled && subtitleSegments?.length > 0) {
      const segments = [...subtitleSegments].sort((a, b) =>
        (a.index || a.segment_number || 0) - (b.index || b.segment_number || 0)
      );

      // 자막 타이밍 계산용
      let subtitleTime = 0;

      for (const seg of segments) {
        const koreanText = seg.narration?.trim();
        const englishText = seg.narration_english?.trim();
        // Script Generator 형식 또는 Video Generator 형식 지원
        const startTime = seg.start_time ?? seg.start ?? subtitleTime;
        const segDuration = seg.duration || ((seg.end_time || seg.end || startTime + 5) - startTime);

        // ★ 인터뷰 질문인지 확인 (인터뷰어 자막 스타일 적용)
        const isInterviewQuestion = seg.scene_type === "interview_question" ||
          seg.speaker === "interviewer" ||
          seg.is_interview_question;

        if (koreanText) {
          if (isInterviewQuestion) {
            // ★ 인터뷰어 자막 - 밝은 파란색 + 남색 외곽선 (구분)
            elements.push({
              type: "text",
              text: `Q: ${koreanText}`,
              time: startTime,
              duration: segDuration,
              width: "95%",
              x: "50%",
              y: "76%",
              x_anchor: "50%",
              y_anchor: "50%",
              font_family: "Noto Sans KR",
              font_size: "4.5 vw",
              font_weight: "600",
              fill_color: "#E0F0FF",  // 밝은 파란색
              stroke_color: "#2C3E50",  // 남색 외곽선
              stroke_width: "1.0 vw",
              text_align: "center",
              line_height: "125%",
            });
          } else {
            // 한글 자막 (메인) - 따뜻한 크림색 + 초콜릿 외곽선
            elements.push({
              type: "text",
              text: koreanText,
              time: startTime,
              duration: segDuration,
              width: "95%",
              x: "50%",
              y: "76%",
              x_anchor: "50%",
              y_anchor: "50%",
              font_family: "Noto Sans KR",
              font_size: "5 vw",
              font_weight: "700",
              fill_color: "#FFFAF0",
              stroke_color: "#4A3728",
              stroke_width: "1.2 vw",
              text_align: "center",
              line_height: "125%",
            });
          }

          // 영어 자막 (서브) - 한글 아래, 작은 크기, 회색 톤
          if (this.subtitle_english_enabled && englishText) {
            elements.push({
              type: "text",
              text: isInterviewQuestion ? `Q: ${englishText}` : englishText,
              time: startTime,
              duration: segDuration,
              width: "95%",
              x: "50%",
              y: "83%",
              x_anchor: "50%",
              y_anchor: "50%",
              font_family: "Noto Sans",
              font_size: "3.2 vw",
              font_weight: "500",
              fill_color: isInterviewQuestion ? "#B0C4DE" : "#E8E8E8",
              stroke_color: "#3D3D3D",
              stroke_width: "0.8 vw",
              text_align: "center",
            });
          }
        }

        subtitleTime += segDuration;
      }
    }

    // =====================
    // 4. Creatomate 렌더링
    // =====================
    $.export("status", "Sending to Creatomate...");

    const createResponse = await axios($, {
      method: "POST",
      url: "https://api.creatomate.com/v1/renders",
      headers: {
        "Authorization": `Bearer ${this.creatomate_api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        output_format: "mp4",
        source: {
          output_format: "mp4",
          width: this.video_width,
          height: this.video_height,
          frame_rate: 30,
          duration: totalDuration,
          elements,
        },
      },
    });

    const renderId = createResponse[0].id;

    // 폴링 (완료 대기)
    let renderUrl = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const status = await axios($, {
        method: "GET",
        url: `https://api.creatomate.com/v1/renders/${renderId}`,
        headers: { "Authorization": `Bearer ${this.creatomate_api_key}` },
      });

      if (status.status === "succeeded") {
        renderUrl = status.url;
        break;
      }
      if (status.status === "failed") {
        throw new Error(`Creatomate failed: ${status.error_message}`);
      }
    }

    if (!renderUrl) throw new Error(`Timeout (render_id: ${renderId})`);

    // =====================
    // 5. GCS 업로드
    // =====================
    $.export("status", "Uploading to GCS...");

    const videoResponse = await axios($, { method: "GET", url: renderUrl, responseType: "arraybuffer" });

    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });
    const objectName = `${folderName}/final_shorts.mp4`;

    const stream = new Readable();
    stream.push(Buffer.from(videoResponse));
    stream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: { mimeType: "video/mp4", body: stream },
      requestBody: { name: objectName, contentType: "video/mp4" },
    });

    const finalUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Rendered ${totalDuration}s video with ${sortedVideos.length} clips`);

    return {
      success: true,
      url: finalUrl,
      creatomate_url: renderUrl,
      folder_name: folderName,
      total_duration: totalDuration,
      stats: {
        video_count: sortedVideos.length,
        has_bgm: !!this.bgm_url,
        has_header: hasHeader,
        has_footer: hasFooter,
        has_subtitles: this.subtitle_enabled,
        has_english_subtitles: this.subtitle_english_enabled,
      },
    };
  },
});
