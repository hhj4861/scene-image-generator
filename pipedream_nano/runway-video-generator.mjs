import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Runway Video Generator",
  description: "Generate videos from images using Runway Gen-3 Alpha API",

  props: {
    // 입력 데이터
    images: {
      type: "string",
      label: "Images JSON",
      description: "JSON array of image objects with url, start, end, prompt fields",
    },
    default_prompt: {
      type: "string",
      label: "Default Prompt Text",
      description: "Default motion prompt for video generation (e.g., 'gentle camera movement, soft animation')",
      default: "subtle gentle movement, soft breathing animation, cinematic camera slowly zooming in",
    },

    // API 설정
    runway_api_key: {
      type: "string",
      label: "Runway API Key",
      secret: true,
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
      description: "GCS folder name for storing videos",
    },

    // 영상 설정
    video_duration: {
      type: "integer",
      label: "Video Duration (seconds)",
      default: 5,
      description: "Duration of each video clip (5 or 10 seconds)",
    },
  },

  async run({ steps, $ }) {
    const images = typeof this.images === 'string' ? JSON.parse(this.images) : this.images;

    const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";
    const generatedVideos = [];

    $.export("status", `Generating ${images.length} video clips with Runway...`);

    // 각 이미지에 대해 영상 생성
    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      try {
        // 1. 영상 생성 작업 시작
        const createResponse = await axios($, {
          method: "POST",
          url: `${RUNWAY_API_URL}/image_to_video`,
          headers: {
            "Authorization": `Bearer ${this.runway_api_key}`,
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
          },
          data: {
            model: "gen3a_turbo",
            promptImage: image.url,
            promptText: image.prompt || this.default_prompt,
            duration: this.video_duration,
            ratio: "768:1280", // 쇼츠용 세로 비율
          },
        });

        const taskId = createResponse.id;
        $.export(`task_${i}`, `Started task: ${taskId}`);

        // 2. 작업 완료 대기 (polling)
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 60; // 최대 5분 대기

        while (!videoUrl && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기

          const statusResponse = await axios($, {
            method: "GET",
            url: `${RUNWAY_API_URL}/tasks/${taskId}`,
            headers: {
              "Authorization": `Bearer ${this.runway_api_key}`,
              "X-Runway-Version": "2024-11-06",
            },
          });

          if (statusResponse.status === "SUCCEEDED") {
            videoUrl = statusResponse.output[0];
          } else if (statusResponse.status === "FAILED") {
            throw new Error(`Runway task failed: ${statusResponse.failure || 'Unknown error'}`);
          }

          attempts++;
        }

        if (!videoUrl) {
          throw new Error(`Timeout waiting for video generation (task: ${taskId})`);
        }

        // 3. 영상 다운로드
        const videoResponse = await axios($, {
          method: "GET",
          url: videoUrl,
          responseType: "arraybuffer",
        });

        const videoBuffer = Buffer.from(videoResponse);
        const filename = `video_${String(i + 1).padStart(3, '0')}_${image.start}-${image.end}.mp4`;

        // 4. GCS 업로드
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

        const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedVideos.push({
          index: i,
          filename: filename,
          url: gcsUrl,
          start: image.start,
          end: image.end,
          duration: image.end - image.start,
        });

        $.export(`video_${i}`, `Generated: ${filename}`);

      } catch (error) {
        console.error(`Video ${i + 1} failed:`, error.message);
        $.export(`error_${i}`, error.message);
      }

      // Rate limit delay
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    $.export("$summary", `Generated ${generatedVideos.length}/${images.length} video clips`);

    return {
      success: true,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      total_videos: generatedVideos.length,
      videos: generatedVideos,
    };
  },
});
