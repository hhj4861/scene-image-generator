import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News Video Generator",
  description: "Convert news images to videos using Runway Gen-3",

  props: {
    // Runway API
    runway_api_key: {
      type: "string",
      label: "Runway API Key",
      description: "Get from https://runway.ml/",
      secret: true,
    },

    // 입력 데이터
    images_json: {
      type: "string",
      label: "Images JSON",
      description: "Use: {{JSON.stringify(steps.News_Image_Generator.$return_value.images)}}",
    },
    scenes_json: {
      type: "string",
      label: "Scenes JSON",
      description: "Use: {{JSON.stringify(steps.News_Script_Generator.$return_value.scenes)}}",
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

    // 비디오 설정
    motion_style: {
      type: "string",
      label: "Motion Style",
      options: [
        { label: "Subtle/Professional", value: "subtle" },
        { label: "Dynamic/Energetic", value: "dynamic" },
        { label: "Dramatic/Cinematic", value: "dramatic" },
        { label: "Minimal/Clean", value: "minimal" },
      ],
      default: "subtle",
    },
  },

  async run({ $ }) {
    const images = typeof this.images_json === 'string' ? JSON.parse(this.images_json) : this.images_json;
    const scenes = typeof this.scenes_json === 'string' ? JSON.parse(this.scenes_json) : this.scenes_json;

    // 성공한 이미지만 필터링
    const validImages = images.filter(img => img.url);

    if (validImages.length === 0) {
      throw new Error("No valid images to convert to video");
    }

    $.export("status", `Converting ${validImages.length} images to videos...`);

    const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";

    // 모션 스타일 프리셋
    const motionPrompts = {
      subtle: "subtle camera movement, gentle zoom, professional broadcast quality, smooth transition, minimal motion",
      dynamic: "dynamic camera movement, energetic zoom, bold transitions, news broadcast energy",
      dramatic: "dramatic slow zoom, cinematic lighting shifts, intense atmosphere, powerful movement",
      minimal: "very subtle motion, almost static, clean professional look, slight parallax effect",
    };

    const motionPrompt = motionPrompts[this.motion_style];

    // Google Cloud Storage 설정
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    const generatedVideos = [];

    for (let i = 0; i < validImages.length; i++) {
      const image = validImages[i];
      const scene = scenes.find(s => s.index === image.scene_index) || scenes[image.index];

      $.export(`video_${i + 1}_status`, "Generating...");

      // 장면에 맞는 모션 프롬프트 생성
      let sceneMotionPrompt = motionPrompt;

      if (scene) {
        if (scene.type === "intro") {
          sceneMotionPrompt = "dramatic zoom in, energy building, news intro style, professional broadcast";
        } else if (scene.type === "outro") {
          sceneMotionPrompt = "slow zoom out, fade feeling, professional ending, broadcast quality";
        } else if (scene.mood) {
          // 뉴스 무드에 따른 모션 조정
          if (scene.mood.includes("urgent") || scene.mood.includes("breaking")) {
            sceneMotionPrompt = "quick camera movement, urgent energy, breaking news feel";
          } else if (scene.mood.includes("positive") || scene.mood.includes("bullish")) {
            sceneMotionPrompt = "upward movement, optimistic feel, bright energy";
          } else if (scene.mood.includes("negative") || scene.mood.includes("bearish")) {
            sceneMotionPrompt = "downward subtle movement, serious tone, dramatic lighting";
          }
        }
      }

      try {
        // Runway API 호출
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
            promptText: sceneMotionPrompt,
            duration: Math.min(10, image.duration || 10), // Runway는 최대 10초
            ratio: "768:1280", // 세로 영상
          },
        });

        const taskId = createResponse.id;
        $.export(`video_${i + 1}_task_id`, taskId);

        // 완료 대기
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 60; // 5분

        while (!videoUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));

          const statusResponse = await axios($, {
            method: "GET",
            url: `${RUNWAY_API_URL}/tasks/${taskId}`,
            headers: {
              "Authorization": `Bearer ${this.runway_api_key}`,
              "X-Runway-Version": "2024-11-06",
            },
          });

          if (statusResponse.status === "SUCCEEDED") {
            videoUrl = statusResponse.output?.[0];
          } else if (statusResponse.status === "FAILED") {
            throw new Error(`Runway task failed: ${statusResponse.failure || 'Unknown'}`);
          }

          attempts++;
        }

        if (!videoUrl) {
          throw new Error(`Timeout waiting for video (task: ${taskId})`);
        }

        // 비디오 다운로드
        const videoResponse = await axios($, {
          method: "GET",
          url: videoUrl,
          responseType: "arraybuffer",
        });

        const videoBuffer = Buffer.from(videoResponse);

        // GCS에 업로드
        const filename = `video_${String(i + 1).padStart(2, '0')}_${image.type}.mp4`;
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

        const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedVideos.push({
          index: i,
          scene_index: image.scene_index,
          type: image.type,
          filename: filename,
          url: publicUrl,
          start: image.start,
          end: image.end,
          duration: image.duration,
          source_image: image.url,
          motion_prompt: sceneMotionPrompt,
          news_title: image.news_title,
        });

        $.export(`video_${i + 1}_status`, "Complete");
        $.export(`video_${i + 1}_url`, publicUrl);

      } catch (error) {
        $.export(`video_${i + 1}_error`, error.message);

        generatedVideos.push({
          index: i,
          scene_index: image.scene_index,
          type: image.type,
          filename: null,
          url: null,
          start: image.start,
          end: image.end,
          duration: image.duration,
          source_image: image.url,
          error: error.message,
        });
      }

      // Rate limiting
      if (i < validImages.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 메타데이터 저장
    const successfulVideos = generatedVideos.filter(v => v.url);

    const metadata = {
      generated_at: new Date().toISOString(),
      folder_name: this.folder_name,
      motion_style: this.motion_style,
      total_images: validImages.length,
      successful_videos: successfulVideos.length,
      failed_videos: generatedVideos.length - successfulVideos.length,
      videos: generatedVideos,
    };

    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(metadata, null, 2));
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

    $.export("$summary", `Generated ${successfulVideos.length}/${validImages.length} videos`);

    return {
      success: successfulVideos.length > 0,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      motion_style: this.motion_style,
      total_images: validImages.length,
      videos_generated: successfulVideos.length,
      videos_failed: generatedVideos.length - successfulVideos.length,
      total_duration: successfulVideos.reduce((sum, v) => sum + (v.duration || 0), 0),
      videos: generatedVideos,
    };
  },
});
