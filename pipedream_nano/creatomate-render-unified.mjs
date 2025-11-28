import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Creatomate Render (Unified)",
  description: "Combine Hedra (lip-sync with audio) + Veo (motion) videos into final shorts with BGM and subtitles",

  props: {
    // 통합 비디오 생성기 출력
    video_generator_output: {
      type: "string",
      label: "Unified Video Generator Output (JSON)",
      description: "Use: {{JSON.stringify(steps.Unified_Video_Generator.$return_value)}}",
    },

    // Script Generator 출력 (자막용)
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "Use: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
      optional: true,
    },

    // Whisper 출력 (자막 타이밍용) - 선택사항
    whisper_output: {
      type: "string",
      label: "Whisper Output (JSON) - Optional",
      description: "Use: {{JSON.stringify(steps.Whisper_Transcribe.$return_value)}}",
      optional: true,
    },

    // BGM 설정
    bgm_url: {
      type: "string",
      label: "BGM URL (Optional)",
      description: "배경 음악 URL",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM Volume",
      default: "20%",
    },

    // Veo 액션 씬 오디오 설정
    action_scene_audio_url: {
      type: "string",
      label: "Action Scene Audio URL (Optional)",
      description: "Veo 액션 씬에 사용할 오디오 URL (TTS). Hedra 씬은 이미 오디오 포함.",
      optional: true,
    },

    // Creatomate 설정
    creatomate_api_key: {
      type: "string",
      label: "Creatomate API Key",
      secret: true,
    },

    // 영상 설정
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

    // 자막 스타일
    subtitle_enabled: {
      type: "boolean",
      label: "Enable Subtitles",
      default: true,
    },
    subtitle_font_size: {
      type: "string",
      label: "Subtitle Font Size",
      default: "5vw",
    },
    subtitle_font_family: {
      type: "string",
      label: "Subtitle Font Family",
      default: "Noto Sans JP",
    },
    subtitle_color: {
      type: "string",
      label: "Subtitle Color",
      default: "#FFFFFF",
    },
    subtitle_background_color: {
      type: "string",
      label: "Subtitle Background Color",
      default: "rgba(0,0,0,0.6)",
    },

    // GCS 설정
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

  async run({ steps, $ }) {
    // =====================
    // 입력 데이터 파싱
    // =====================
    const videoOutput = typeof this.video_generator_output === "string"
      ? JSON.parse(this.video_generator_output)
      : this.video_generator_output;

    const scriptOutput = this.script_generator_output
      ? (typeof this.script_generator_output === "string"
          ? JSON.parse(this.script_generator_output)
          : this.script_generator_output)
      : null;

    const whisperOutput = this.whisper_output
      ? (typeof this.whisper_output === "string"
          ? JSON.parse(this.whisper_output)
          : this.whisper_output)
      : null;

    const videos = videoOutput.videos || [];
    const folderName = videoOutput.folder_name || scriptOutput?.folder_name || `render_${Date.now()}`;

    if (!videos || videos.length === 0) {
      throw new Error("No videos provided");
    }

    $.export("input_summary", {
      video_count: videos.length,
      hedra_count: videos.filter(v => v.source === "hedra").length,
      veo_count: videos.filter(v => v.source === "veo").length,
      folder_name: folderName,
    });

    // =====================
    // 비디오 Elements 생성
    // =====================
    // 비디오는 이미 index 순으로 정렬되어 있음
    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

    let currentTime = 0;
    const videoElements = [];
    const audioElements = [];

    for (const video of sortedVideos) {
      const duration = video.duration || (video.end - video.start) || 5;

      // 비디오 element
      videoElements.push({
        type: "video",
        source: video.url,
        time: currentTime,
        duration: duration,
        fit: "cover",
      });

      // Hedra 비디오는 이미 오디오 포함 → 비디오에서 오디오 추출
      // Veo 비디오는 오디오 없음 → action_scene_audio_url 사용 (있으면)
      if (video.source === "hedra") {
        // Hedra 영상의 오디오 사용 (영상 자체에 포함)
        audioElements.push({
          type: "audio",
          source: video.url,
          time: currentTime,
          duration: duration,
          volume: "100%",
        });
      } else if (video.source === "veo" && this.action_scene_audio_url) {
        // Veo 씬에 별도 오디오 적용 (해당 구간만)
        // 주의: 전체 오디오에서 해당 구간 추출 필요
        // 여기서는 간단히 전체 오디오 볼륨을 낮춰서 배경으로 사용
      }

      currentTime += duration;
    }

    const totalDuration = currentTime;
    $.export("total_duration", totalDuration);

    // =====================
    // BGM Element 생성
    // =====================
    if (this.bgm_url) {
      audioElements.push({
        type: "audio",
        source: this.bgm_url,
        time: 0,
        duration: totalDuration,
        volume: this.bgm_volume || "20%",
        // BGM은 루프하거나 fade out
        audio_fade_out: "2 s",
      });
      $.export("bgm_added", `Volume: ${this.bgm_volume}`);
    }

    // =====================
    // 자막 Elements 생성
    // =====================
    const subtitleElements = [];

    if (this.subtitle_enabled) {
      // 자막 소스 결정: Whisper > Script segments
      let subtitles = [];

      if (whisperOutput?.segments) {
        // Whisper 타임스탬프 사용
        subtitles = whisperOutput.segments.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }));
        $.export("subtitle_source", "whisper");
      } else if (scriptOutput?.script?.script_segments) {
        // Script segments 사용
        subtitles = scriptOutput.script.script_segments.map(seg => ({
          start: seg.start_time,
          end: seg.end_time,
          text: seg.narration,
        }));
        $.export("subtitle_source", "script_segments");
      }

      // Font size 처리 (% → vw)
      let fontSizeValue = this.subtitle_font_size.replace(/\s+/g, "");
      if (fontSizeValue.endsWith("%")) {
        fontSizeValue = `${parseFloat(fontSizeValue)}vw`;
      }

      for (const sub of subtitles) {
        if (sub.text && sub.text.trim()) {
          subtitleElements.push({
            type: "text",
            text: sub.text.trim(),
            time: sub.start,
            duration: sub.end - sub.start,
            width: "90%",
            height: "auto",
            x: "50%",
            y: "85%",
            x_anchor: "50%",
            y_anchor: "50%",
            font_family: this.subtitle_font_family,
            font_size: fontSizeValue,
            font_weight: "700",
            fill_color: this.subtitle_color,
            background_color: this.subtitle_background_color,
            background_x_padding: "3%",
            background_y_padding: "2%",
            background_border_radius: "5%",
            text_align: "center",
          });
        }
      }

      $.export("subtitle_count", subtitleElements.length);
    }

    // =====================
    // Creatomate 렌더링 요청
    // =====================
    const allElements = [
      ...videoElements,
      ...audioElements,
      ...subtitleElements,
    ];

    const renderRequest = {
      output_format: "mp4",
      source: {
        output_format: "mp4",
        width: this.video_width,
        height: this.video_height,
        frame_rate: 30,
        duration: totalDuration,
        elements: allElements,
      },
    };

    $.export("render_request_preview", {
      video_elements: videoElements.length,
      audio_elements: audioElements.length,
      subtitle_elements: subtitleElements.length,
      total_duration: totalDuration,
    });

    $.export("status", "Sending to Creatomate...");

    const createResponse = await axios($, {
      method: "POST",
      url: "https://api.creatomate.com/v1/renders",
      headers: {
        "Authorization": `Bearer ${this.creatomate_api_key}`,
        "Content-Type": "application/json",
      },
      data: renderRequest,
    });

    const renderId = createResponse[0].id;
    $.export("render_id", renderId);

    // =====================
    // 렌더링 완료 대기
    // =====================
    let renderUrl = null;
    let attempts = 0;
    const maxAttempts = 120; // 최대 10분

    while (!renderUrl && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await axios($, {
        method: "GET",
        url: `https://api.creatomate.com/v1/renders/${renderId}`,
        headers: {
          "Authorization": `Bearer ${this.creatomate_api_key}`,
        },
      });

      if (statusResponse.status === "succeeded") {
        renderUrl = statusResponse.url;
      } else if (statusResponse.status === "failed") {
        throw new Error(`Creatomate failed: ${statusResponse.error_message}`);
      }

      attempts++;
      if (attempts % 6 === 0) {
        $.export(`render_progress`, `Waiting... (${attempts * 5}s)`);
      }
    }

    if (!renderUrl) {
      throw new Error(`Timeout (render_id: ${renderId})`);
    }

    // =====================
    // GCS 업로드
    // =====================
    const videoResponse = await axios($, {
      method: "GET",
      url: renderUrl,
      responseType: "arraybuffer",
    });

    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });
    const filename = "final_shorts.mp4";
    const objectName = `${folderName}/${filename}`;

    const bufferStream = new Readable();
    bufferStream.push(Buffer.from(videoResponse));
    bufferStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: { mimeType: "video/mp4", body: bufferStream },
      requestBody: { name: objectName, contentType: "video/mp4" },
    });

    const finalVideoUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Final video rendered: ${totalDuration}s, ${videos.length} clips`);

    return {
      success: true,
      filename: filename,
      url: finalVideoUrl,
      creatomate_url: renderUrl,
      bucket: this.gcs_bucket_name,
      folder_name: folderName,
      total_duration: totalDuration,
      stats: {
        video_count: videos.length,
        hedra_clips: videos.filter(v => v.source === "hedra").length,
        veo_clips: videos.filter(v => v.source === "veo").length,
        subtitle_count: subtitleElements.length,
        has_bgm: !!this.bgm_url,
      },
    };
  },
});
