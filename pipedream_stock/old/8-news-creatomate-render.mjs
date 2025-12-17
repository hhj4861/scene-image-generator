import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News Creatomate Render",
  description: "Render final news shorts video with videos, audio, subtitles, and BGM",

  props: {
    // Creatomate API
    creatomate_api_key: {
      type: "string",
      label: "Creatomate API Key",
      description: "Get from https://creatomate.com/",
      secret: true,
    },

    // 입력 데이터
    videos_json: {
      type: "string",
      label: "Videos JSON",
      description: "Use: {{JSON.stringify(steps.News_Video_Generator.$return_value.videos)}}",
    },
    audio_url: {
      type: "string",
      label: "Narration Audio URL",
      description: "Use: {{steps.News_TTS.$return_value.audio_url}}",
    },
    subtitles_json: {
      type: "string",
      label: "Subtitles JSON",
      description: "Use: {{JSON.stringify(steps.News_Whisper_Subtitles.$return_value.subtitles)}}",
    },
    bgm_url: {
      type: "string",
      label: "BGM URL",
      description: "Use: {{steps.News_BGM_Generator.$return_value.bgm_url}}",
      optional: true,
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "Use: {{steps.News_Script_Generator.$return_value.folder_name}}",
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
    bgm_volume: {
      type: "string",
      label: "BGM Volume",
      default: "20%",
    },

    // 자막 스타일
    subtitle_style: {
      type: "string",
      label: "Subtitle Style",
      options: [
        { label: "News Ticker (Bottom)", value: "ticker" },
        { label: "Center Bold", value: "center" },
        { label: "Lower Third", value: "lower_third" },
      ],
      default: "center",
    },
    subtitle_font_size: {
      type: "string",
      label: "Subtitle Font Size",
      default: "5vw",
    },
  },

  async run({ $ }) {
    const videos = typeof this.videos_json === 'string' ? JSON.parse(this.videos_json) : this.videos_json;
    const subtitles = typeof this.subtitles_json === 'string' ? JSON.parse(this.subtitles_json) : this.subtitles_json;

    // folder_name 검증
    let folderName = this.folder_name;
    if (!folderName || folderName === 'undefined') {
      if (videos && videos.length > 0 && videos[0].url) {
        const urlMatch = videos[0].url.match(/storage\.googleapis\.com\/[^/]+\/([^/]+)\//);
        if (urlMatch) folderName = urlMatch[1];
      }
      if (!folderName) {
        folderName = `news_render_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`;
      }
    }

    $.export("folder_name_used", folderName);
    $.export("status", "Rendering final news video with Creatomate...");

    // 유효한 비디오만 필터링
    const validVideos = (videos || []).filter(v => v.url);
    if (validVideos.length === 0) {
      throw new Error("No valid videos to render");
    }

    $.export("video_count", validVideos.length);

    // 1. 비디오 elements 생성
    const videoElements = validVideos.map((video, index) => {
      const timeOffset = validVideos.slice(0, index).reduce((sum, v) => sum + (v.duration || 10), 0);
      const videoDuration = video.duration || 10;

      return {
        type: "video",
        source: video.url,
        time: timeOffset,
        duration: videoDuration,
        fit: "cover",
      };
    });

    // 총 영상 길이
    const totalDuration = validVideos.reduce((sum, v) => sum + (v.duration || 10), 0);
    $.export("total_duration", totalDuration);

    // 2. 나레이션 오디오
    const audioElement = {
      type: "audio",
      source: this.audio_url,
      time: 0,
      duration: totalDuration,
      volume: "100%",
    };

    // 3. BGM (선택사항)
    let bgmElement = null;
    if (this.bgm_url) {
      bgmElement = {
        type: "audio",
        source: this.bgm_url,
        time: 0,
        duration: totalDuration,
        volume: this.bgm_volume || "20%",
      };
    }

    // 4. 자막 스타일 설정
    const subtitleStyles = {
      ticker: {
        y: "92%",
        y_anchor: "50%",
        background_color: "rgba(0,0,0,0.8)",
        font_weight: "500",
      },
      center: {
        y: "50%",
        y_anchor: "50%",
        background_color: "rgba(0,0,0,0.7)",
        font_weight: "700",
      },
      lower_third: {
        y: "80%",
        y_anchor: "50%",
        background_color: "rgba(0,51,102,0.9)",
        font_weight: "600",
      },
    };

    const styleConfig = subtitleStyles[this.subtitle_style] || subtitleStyles.center;

    // font_size 검증
    let fontSizeValue = this.subtitle_font_size.replace(/\s+/g, '');
    if (fontSizeValue.endsWith('%')) {
      const numValue = parseFloat(fontSizeValue);
      fontSizeValue = `${numValue}vw`;
    }

    // 5. 자막 elements 생성
    const subtitleElements = (subtitles || []).map((sub) => ({
      type: "text",
      text: sub.text,
      time: sub.start,
      duration: sub.end - sub.start,
      width: "90%",
      height: "auto",
      x: "50%",
      y: styleConfig.y,
      x_anchor: "50%",
      y_anchor: styleConfig.y_anchor,
      font_family: "Noto Sans",
      font_size: fontSizeValue,
      font_weight: styleConfig.font_weight,
      fill_color: "#FFFFFF",
      background_color: styleConfig.background_color,
      background_x_padding: "3%",
      background_y_padding: "2%",
      background_border_radius: "5%",
      text_align: "center",
    }));

    // 6. Creatomate 렌더링 요청
    const allElements = [
      ...videoElements,
      audioElement,
      ...(bgmElement ? [bgmElement] : []),
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

    $.export("render_request_preview", JSON.stringify(renderRequest).substring(0, 500) + "...");

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

    // 7. 렌더링 완료 대기
    let renderUrl = null;
    let attempts = 0;
    const maxAttempts = 120; // 10분

    while (!renderUrl && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));

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
        throw new Error(`Creatomate render failed: ${statusResponse.error_message || 'Unknown'}`);
      }

      attempts++;
      if (attempts % 6 === 0) {
        $.export("render_progress", `Waiting... (${attempts * 5}s)`);
      }
    }

    if (!renderUrl) {
      throw new Error(`Render timeout (render_id: ${renderId})`);
    }

    // 8. 렌더링된 영상 다운로드
    const videoResponse = await axios($, {
      method: "GET",
      url: renderUrl,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    const filename = "news_shorts_final.mp4";

    // 9. GCS 업로드
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });
    const objectName = `${folderName}/${filename}`;

    const bufferStream = new Readable();
    bufferStream.push(videoBuffer);
    bufferStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: {
        mimeType: 'video/mp4',
        body: bufferStream,
      },
      requestBody: {
        name: objectName,
        contentType: 'video/mp4',
      },
    });

    const finalVideoUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Rendered news shorts: ${filename} (${totalDuration}s)`);

    return {
      success: true,
      filename: filename,
      url: finalVideoUrl,
      creatomate_url: renderUrl,
      bucket: this.gcs_bucket_name,
      folder_name: folderName,
      total_duration: totalDuration,
      video_count: validVideos.length,
      subtitle_count: subtitleElements.length,
      has_bgm: !!bgmElement,
    };
  },
});
