import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Hedra Lip Sync Video Generator",
  description: "Generate lip-synced talking videos from images using Hedra API",

  props: {
    // Hedra API 설정
    hedra_api_key: {
      type: "string",
      label: "Hedra API Key",
      description: "Hedra API Key (https://www.hedra.com/api-profile)",
      secret: true,
    },

    // 입력 데이터 (이미지 생성기 출력)
    scenes_json: {
      type: "string",
      label: "Scenes JSON",
      description: "JSON array of narration scenes with image_url, narration text, etc. Use: {{JSON.stringify(steps.previous_step.$return_value.narration_scenes)}}",
    },

    // 음성 설정
    voice_id: {
      type: "string",
      label: "Voice ID",
      description: "Hedra voice ID for TTS. Leave empty for default.",
      optional: true,
    },

    // 비디오 설정
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts/Vertical)", value: "9:16" },
        { label: "16:9 (Landscape)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
      ],
      default: "9:16",
    },

    resolution: {
      type: "string",
      label: "Resolution",
      options: [
        { label: "540p (Fast)", value: "540p" },
        { label: "720p (HD)", value: "720p" },
      ],
      default: "720p",
    },

    // GCS 업로드 설정
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
  },

  async run({ steps, $ }) {
    const HEDRA_BASE_URL = "https://api.hedra.com/web-app/public";

    const scenes = typeof this.scenes_json === "string"
      ? JSON.parse(this.scenes_json)
      : this.scenes_json;

    if (!scenes || scenes.length === 0) {
      throw new Error("No narration scenes provided");
    }

    $.export("input_scenes", `Processing ${scenes.length} narration scenes`);

    // =====================
    // Hedra API 헬퍼 함수들
    // =====================

    // 1. 사용 가능한 모델 조회
    const getModels = async () => {
      const response = await axios($, {
        method: "GET",
        url: `${HEDRA_BASE_URL}/models`,
        headers: {
          "x-api-key": this.hedra_api_key,
        },
      });
      return response;
    };

    // 2. 이미지 업로드
    const uploadImage = async (imageUrl, filename) => {
      // Step A: Asset 생성
      const assetResponse = await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets`,
        headers: {
          "x-api-key": this.hedra_api_key,
          "Content-Type": "application/json",
        },
        data: {
          name: filename,
          type: "image",
        },
      });

      const assetId = assetResponse.id;

      // 이미지 다운로드
      const imageResponse = await axios($, {
        method: "GET",
        url: imageUrl,
        responseType: "arraybuffer",
      });

      // Step B: 파일 업로드
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", Buffer.from(imageResponse), {
        filename: filename,
        contentType: "image/png",
      });

      await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets/${assetId}/upload`,
        headers: {
          "x-api-key": this.hedra_api_key,
          ...formData.getHeaders(),
        },
        data: formData,
      });

      return assetId;
    };

    // 3. 오디오 업로드 (외부 TTS 사용 시)
    const uploadAudio = async (audioBuffer, filename) => {
      // Step A: Asset 생성
      const assetResponse = await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets`,
        headers: {
          "x-api-key": this.hedra_api_key,
          "Content-Type": "application/json",
        },
        data: {
          name: filename,
          type: "audio",
        },
      });

      const assetId = assetResponse.id;

      // Step B: 파일 업로드
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", audioBuffer, {
        filename: filename,
        contentType: "audio/mpeg",
      });

      await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets/${assetId}/upload`,
        headers: {
          "x-api-key": this.hedra_api_key,
          ...formData.getHeaders(),
        },
        data: formData,
      });

      return assetId;
    };

    // 4. 비디오 생성 요청
    const generateVideo = async (modelId, imageAssetId, text, audioAssetId = null) => {
      const requestData = {
        type: "video",
        ai_model_id: modelId,
        start_keyframe_id: imageAssetId,
        generated_video_inputs: {
          text_prompt: text,
          resolution: this.resolution,
          aspect_ratio: this.aspect_ratio,
        },
      };

      // TTS 모드 vs 외부 오디오 모드
      if (audioAssetId) {
        requestData.audio_id = audioAssetId;
      } else {
        // Hedra 내장 TTS 사용
        requestData.generated_video_inputs.text = text;
        if (this.voice_id) {
          requestData.generated_video_inputs.voice_id = this.voice_id;
        }
      }

      const response = await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/generations`,
        headers: {
          "x-api-key": this.hedra_api_key,
          "Content-Type": "application/json",
        },
        data: requestData,
      });

      return response.id;
    };

    // 5. 생성 상태 폴링
    const pollGenerationStatus = async (generationId, maxAttempts = 120) => {
      let attempts = 0;

      while (attempts < maxAttempts) {
        const response = await axios($, {
          method: "GET",
          url: `${HEDRA_BASE_URL}/generations/${generationId}/status`,
          headers: {
            "x-api-key": this.hedra_api_key,
          },
        });

        if (response.status === "complete") {
          return {
            success: true,
            url: response.url || response.download_url,
            assetId: response.asset_id,
          };
        }

        if (response.status === "error") {
          return {
            success: false,
            error: response.error_message || "Generation failed",
          };
        }

        // 5초 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        if (attempts % 12 === 0) {
          $.export(`polling_${generationId}`, `Waiting... (${attempts * 5}s)`);
        }
      }

      return {
        success: false,
        error: `Timeout after ${maxAttempts * 5}s`,
      };
    };

    // =====================
    // 메인 처리 로직
    // =====================

    // 모델 정보 조회
    let modelId;
    try {
      const models = await getModels();
      // 첫 번째 사용 가능한 모델 선택 (보통 character-3)
      modelId = models[0]?.id || "character-3";
      $.export("hedra_model", modelId);
    } catch (e) {
      modelId = "character-3"; // 기본값
      $.export("hedra_model_fallback", "Using default model: character-3");
    }

    const generatedVideos = [];
    const stats = { success: 0, failed: 0 };

    // GCS 업로드 준비
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });

    // 각 씬 처리
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneIndex = scene.index || i + 1;

      $.export(`scene_${sceneIndex}_start`, `Processing scene ${sceneIndex}: ${scene.narration?.substring(0, 50)}...`);

      try {
        // 1. 이미지 업로드
        const imageAssetId = await uploadImage(
          scene.url || scene.image_url,
          `scene_${sceneIndex}_image.png`
        );
        $.export(`scene_${sceneIndex}_image`, `Image uploaded: ${imageAssetId}`);

        // 2. 비디오 생성 요청 (Hedra 내장 TTS 사용)
        const generationId = await generateVideo(
          modelId,
          imageAssetId,
          scene.narration || scene.text || ""
        );
        $.export(`scene_${sceneIndex}_generation`, `Generation started: ${generationId}`);

        // 3. 완료 대기
        const result = await pollGenerationStatus(generationId);

        if (!result.success) {
          throw new Error(result.error);
        }

        $.export(`scene_${sceneIndex}_complete`, `Video ready: ${result.url}`);

        // 4. 비디오 다운로드
        const videoResponse = await axios($, {
          method: "GET",
          url: result.url,
          responseType: "arraybuffer",
        });

        const videoBuffer = Buffer.from(videoResponse);
        const filename = `hedra_${String(sceneIndex).padStart(3, "0")}_${scene.start || 0}-${scene.end || 0}.mp4`;

        // 5. GCS 업로드
        const objectName = `${this.folder_name}/${filename}`;

        const bufferStream = new Readable();
        bufferStream.push(videoBuffer);
        bufferStream.push(null);

        await storage.objects.insert({
          bucket: this.gcs_bucket_name,
          name: objectName,
          media: {
            mimeType: "video/mp4",
            body: bufferStream,
          },
          requestBody: {
            name: objectName,
            contentType: "video/mp4",
          },
        });

        const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedVideos.push({
          index: sceneIndex,
          filename: filename,
          url: gcsUrl,
          start: scene.start || 0,
          end: scene.end || 0,
          duration: (scene.end || 0) - (scene.start || 0),
          narration: scene.narration,
          hedra_generation_id: generationId,
          source: "hedra",
        });

        stats.success++;
        $.export(`scene_${sceneIndex}_done`, `Uploaded: ${filename}`);

      } catch (error) {
        stats.failed++;
        $.export(`scene_${sceneIndex}_error`, error.message);
        console.error(`Scene ${sceneIndex} failed:`, error.message);
      }

      // Rate limit 방지
      if (i < scenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    $.export("$summary", `Hedra: Generated ${stats.success}/${scenes.length} lip-sync videos`);

    return {
      success: true,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      hedra_model: modelId,
      stats: stats,
      total_videos: generatedVideos.length,
      videos: generatedVideos,
    };
  },
});
