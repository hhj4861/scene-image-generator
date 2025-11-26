import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Creatomate Render",
  description: "Combine videos, audio, and subtitles into final shorts video using Creatomate",

  props: {
    // 입력 데이터
    videos: {
      type: "string",
      label: "Videos JSON",
      description: "JSON array of video objects with url, start, end fields",
    },
    audio_url: {
      type: "string",
      label: "Audio URL",
      description: "URL of the narration audio file",
    },
    subtitles: {
      type: "string",
      label: "Subtitles JSON",
      description: "JSON array of subtitle objects with start, end, text fields",
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
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name for storing final video",
    },
  },

  async run({ steps, $ }) {
    const videos = typeof this.videos === 'string' ? JSON.parse(this.videos) : this.videos;
    const subtitles = typeof this.subtitles === 'string' ? JSON.parse(this.subtitles) : this.subtitles;

    $.export("status", "Rendering final video with Creatomate...");

    // 디버깅: 입력 데이터 확인
    $.export("debug_videos_count", videos?.length || 0);
    $.export("debug_first_video", JSON.stringify(videos?.[0] || {}).substring(0, 200));

    // 비디오 배열 검증
    if (!videos || videos.length === 0) {
      throw new Error("No videos provided. Videos array is empty.");
    }

    // 1. 영상 elements 생성
    const videoElements = videos.map((video, index) => {
      // 이전 영상들의 총 길이 계산
      const timeOffset = videos.slice(0, index).reduce((sum, v) => {
        const dur = v.duration || (Number(v.end) - Number(v.start)) || 5;
        return sum + dur;
      }, 0);

      // duration 계산 (기본값 5초)
      const videoDuration = video.duration || (Number(video.end) - Number(video.start)) || 5;

      return {
        type: "video",
        source: video.url,
        time: timeOffset,
        duration: videoDuration,
      };
    });

    // 총 영상 길이 계산
    const totalDuration = videos.reduce((sum, v) => {
      const dur = v.duration || (Number(v.end) - Number(v.start)) || 5;
      return sum + dur;
    }, 0);

    // duration 검증
    if (totalDuration <= 0) {
      $.export("debug_videos_raw", JSON.stringify(videos).substring(0, 500));
      throw new Error(`Invalid total duration: ${totalDuration}. Check video start/end/duration values.`);
    }

    $.export("debug_total_duration", totalDuration);

    // 2. 오디오 element 생성
    const audioElement = {
      type: "audio",
      source: this.audio_url,
      time: 0,
      duration: totalDuration,
    };

    // 3. 자막 elements 생성
    const subtitleElements = subtitles.map((sub) => ({
      type: "text",
      text: sub.text,
      time: sub.start,
      duration: sub.end - sub.start,
      width: "90%",
      height: "auto",
      x: "50%",
      y: "85%",
      x_anchor: "50%",
      y_anchor: "50%",
      font_family: this.subtitle_font_family,
      font_size: this.subtitle_font_size.replace(/\s+/g, ''),  // Remove spaces (e.g., "5 vw" -> "5vw")
      font_weight: "700",
      fill_color: this.subtitle_color,
      background_color: this.subtitle_background_color,
      background_x_padding: "3%",
      background_y_padding: "2%",
      background_border_radius: "5%",
      text_align: "center",
    }));

    // 4. Creatomate 렌더링 요청
    const renderRequest = {
      output_format: "mp4",
      source: {
        output_format: "mp4",
        width: this.video_width,
        height: this.video_height,
        frame_rate: 30,
        duration: totalDuration,
        elements: [
          ...videoElements,
          audioElement,
          ...subtitleElements,
        ],
      },
    };

    $.export("render_request", JSON.stringify(renderRequest).substring(0, 500) + "...");

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

    // 5. 렌더링 완료 대기 (polling)
    let renderUrl = null;
    let attempts = 0;
    const maxAttempts = 120; // 최대 10분 대기

    while (!renderUrl && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기

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
        throw new Error(`Creatomate render failed: ${statusResponse.error_message || 'Unknown error'}`);
      }

      attempts++;
      $.export("render_status", `Attempt ${attempts}: ${statusResponse.status}`);
    }

    if (!renderUrl) {
      throw new Error(`Timeout waiting for render (render_id: ${renderId})`);
    }

    // 6. 렌더링된 영상 다운로드
    const videoResponse = await axios($, {
      method: "GET",
      url: renderUrl,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    const filename = "final_shorts.mp4";

    // 7. GCS 업로드
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });
    const objectName = `${this.folder_name}/${filename}`;

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

    $.export("$summary", `Final shorts video rendered: ${filename}`);

    return {
      success: true,
      filename: filename,
      url: finalVideoUrl,
      creatomate_url: renderUrl,
      bucket: this.gcs_bucket_name,
      folder_name: this.folder_name,
      total_duration: totalDuration,
      video_count: videos.length,
      subtitle_count: subtitles.length,
    };
  },
});
