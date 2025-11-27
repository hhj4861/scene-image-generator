import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Runway Video Generator",
  description: "Convert scene images to videos using Runway Gen-3 Alpha Turbo API",

  props: {
    // 입력 데이터 - Gemini Image Generator의 scenes 출력
    images: {
      type: "string",
      label: "Images JSON",
      description: "JSON array of image objects from Gemini Image Generator. Use: {{JSON.stringify(steps.Gemini_Image_Generator.$return_value.scenes)}}",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name. Use: {{steps.Gemini_Image_Generator.$return_value.folder_name}}",
    },

    // Runway API 설정
    runway_api_key: {
      type: "string",
      label: "Runway API Key",
      description: "Get your API key from https://runway.ml/",
      secret: true,
    },

    // Google Cloud 연결
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },

    // GCS 설정
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },

    // 비디오 설정
    video_duration: {
      type: "integer",
      label: "Video Duration (seconds)",
      description: "Duration per video clip (5 or 10 seconds)",
      default: 5,
      options: [
        { label: "5 seconds", value: 5 },
        { label: "10 seconds", value: 10 },
      ],
    },
    prompt_text: {
      type: "string",
      label: "Motion Prompt",
      description: "Text prompt for video motion style",
      default: "smooth camera motion, cinematic quality, consistent anime style, maintain character appearance",
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 1. 입력값 검증
    // =====================
    $.export("debug_raw_input", String(this.images).substring(0, 300));

    if (!this.images || this.images === 'undefined' || this.images === 'null' || this.images === '') {
      throw new Error(`Images JSON is required. Received: ${typeof this.images}. Connect Gemini Image Generator's scenes output.`);
    }

    let images;
    try {
      images = typeof this.images === 'string' ? JSON.parse(this.images) : this.images;
    } catch (parseError) {
      throw new Error(`Failed to parse Images JSON: ${parseError.message}. Input was: ${String(this.images).substring(0, 100)}`);
    }

    if (!Array.isArray(images)) {
      throw new Error(`Images must be an array. Received: ${typeof images}`);
    }

    if (images.length === 0) {
      throw new Error("Images array is empty. No images to convert to video.");
    }

    $.export("status", "Starting Runway Image-to-Video conversion...");
    $.export("images_count", images.length);
    $.export("folder_name", this.folder_name);

    // =====================
    // 2. Google Auth 설정
    // =====================
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    // =====================
    // 3. 일관된 seed 생성 (모든 비디오에 동일 적용)
    // =====================
    const consistentSeed = Math.floor(Math.random() * 4294967295);
    $.export("consistent_seed", consistentSeed);

    // =====================
    // 4. 각 이미지를 비디오로 변환
    // =====================
    const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
    const generatedVideos = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      $.export(`video_${i + 1}_status`, "Processing...");

      // URL 검증
      if (!image.url) {
        $.export(`video_${i + 1}_error`, "No URL found for this image");
        continue;
      }

      $.export(`video_${i + 1}_url`, image.url);

      try {
        // 4-1. Runway API 호출 (이미지 URL 직접 전달)
        $.export(`video_${i + 1}_api_start`, "Calling Runway API...");

        const requestBody = {
          model: "gen3a_turbo",
          promptImage: image.url,
          promptText: this.prompt_text,
          ratio: "768:1280",  // 세로 영상 (Shorts용)
          duration: this.video_duration,
          seed: consistentSeed,
        };

        let generateResponse;
        try {
          generateResponse = await axios($, {
            method: "POST",
            url: RUNWAY_API_URL,
            headers: {
              "Authorization": `Bearer ${this.runway_api_key}`,
              "Content-Type": "application/json",
              "X-Runway-Version": "2024-11-06",
            },
            data: requestBody,
            timeout: 60000,
          });
        } catch (apiError) {
          const apiStatus = apiError.response?.status || 'unknown';
          const apiData = apiError.response?.data ? JSON.stringify(apiError.response.data).substring(0, 300) : apiError.message;
          $.export(`video_${i + 1}_api_error`, `Status: ${apiStatus}, Response: ${apiData}`);
          throw new Error(`Runway API failed: ${apiStatus} - ${apiData}`);
        }

        const taskId = generateResponse.id;
        $.export(`video_${i + 1}_task_id`, taskId);

        // 4-2. 비디오 생성 완료 대기
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 60; // 최대 5분 대기

        while (!videoUrl && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
          attempts++;

          try {
            const statusResponse = await axios($, {
              method: "GET",
              url: `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
              headers: {
                "Authorization": `Bearer ${this.runway_api_key}`,
                "X-Runway-Version": "2024-11-06",
              },
            });

            const status = statusResponse.status;
            $.export(`video_${i + 1}_poll_status`, `${status} (attempt ${attempts})`);

            if (status === "SUCCEEDED") {
              videoUrl = statusResponse.output?.[0];
              break;
            } else if (status === "FAILED") {
              throw new Error(`Runway task failed: ${statusResponse.failure || 'Unknown error'}`);
            }
            // RUNNING, PENDING - 계속 대기
          } catch (pollError) {
            if (pollError.response?.status !== 404) {
              throw pollError;
            }
            // 404는 아직 처리 중일 수 있음
          }
        }

        if (!videoUrl) {
          throw new Error(`Timeout waiting for video (scene ${i + 1})`);
        }

        $.export(`video_${i + 1}_runway_url`, videoUrl);

        // 4-3. 비디오 다운로드
        const videoResponse = await axios($, {
          method: "GET",
          url: videoUrl,
          responseType: "arraybuffer",
        });

        const videoBuffer = Buffer.from(videoResponse);
        $.export(`video_${i + 1}_size`, `${Math.round(videoBuffer.length / 1024)} KB`);

        // 4-4. GCS에 업로드
        const videoFilename = `video_${String(i + 1).padStart(3, '0')}_${image.start}-${image.end}.mp4`;
        const objectName = `${this.folder_name}/${videoFilename}`;

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

        const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedVideos.push({
          index: i,
          filename: videoFilename,
          url: publicUrl,
          start: image.start,
          end: image.end,
          duration: this.video_duration,
          source_image: image.url,
        });

        $.export(`video_${i + 1}_status`, "Complete");

        // Rate limiting
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Video ${i + 1} failed:`, error.message);
        $.export(`video_${i + 1}_error`, error.message);

        generatedVideos.push({
          index: i,
          filename: null,
          url: null,
          start: image.start,
          end: image.end,
          duration: this.video_duration,
          source_image: image.url,
          error: error.message,
        });
      }
    }

    // =====================
    // 5. 메타데이터 저장
    // =====================
    const successfulVideos = generatedVideos.filter(v => v.url);

    const videoMetadata = {
      generated_at: new Date().toISOString(),
      folder: this.folder_name,
      runway_settings: {
        model: "gen3a_turbo",
        duration: this.video_duration,
        seed: consistentSeed,
        prompt: this.prompt_text,
      },
      total_images: images.length,
      successful_videos: successfulVideos.length,
      failed_videos: generatedVideos.length - successfulVideos.length,
      videos: generatedVideos,
    };

    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(videoMetadata, null, 2));
    metadataStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: `${this.folder_name}/video_metadata.json`,
      media: {
        mimeType: 'application/json',
        body: metadataStream,
      },
      requestBody: {
        name: `${this.folder_name}/video_metadata.json`,
        contentType: 'application/json',
      },
    });

    $.export("$summary", `Generated ${successfulVideos.length}/${images.length} videos with Runway`);

    return {
      success: successfulVideos.length > 0,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      folder_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${this.folder_name}/`,
      total_images: images.length,
      videos_generated: successfulVideos.length,
      videos_failed: generatedVideos.length - successfulVideos.length,
      video_duration: this.video_duration,
      videos: successfulVideos,
    };
  },
});
