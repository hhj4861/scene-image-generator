import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Unified Video Generator (Hedra + Veo)",
  description: "Generate videos with automatic routing: narration scenes → Hedra (lip-sync), action scenes → Veo (motion)",

  props: {
    // 이미지 생성기 출력
    image_generator_output: {
      type: "string",
      label: "Image Generator Output (JSON)",
      description: "Gemini Image Generator의 출력. Use: {{JSON.stringify(steps.Gemini_Image_Generator.$return_value)}}",
    },

    // Script Generator 출력 (씬 타입 정보용)
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "Script Generator의 출력. Use: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
    },

    // Hedra API 설정
    hedra_api_key: {
      type: "string",
      label: "Hedra API Key",
      description: "Hedra API Key (https://www.hedra.com/api-profile)",
      secret: true,
    },

    hedra_voice_id: {
      type: "string",
      label: "Hedra Voice ID (Optional)",
      description: "Hedra voice ID for TTS",
      optional: true,
    },

    // Veo API 설정
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key (for Veo)",
      description: "Google AI Studio API Key",
      secret: true,
    },

    gemini_api_key_backup: {
      type: "string",
      label: "Backup Gemini API Key (Optional)",
      description: "한도 초과 시 자동 전환",
      secret: true,
      optional: true,
    },

    // Veo 설정
    motion_style: {
      type: "string",
      label: "Veo Motion Style",
      options: [
        { label: "자연스러운 움직임 (Natural)", value: "natural" },
        { label: "시네마틱 (Cinematic)", value: "cinematic" },
        { label: "다이나믹 (Dynamic)", value: "dynamic" },
        { label: "차분한 (Calm)", value: "calm" },
        { label: "귀여운/활기찬 (Cute)", value: "cute" },
      ],
      default: "cute",
    },

    content_type: {
      type: "string",
      label: "Content Type",
      options: [
        { label: "반려동물 (Pet)", value: "pet" },
        { label: "자연/풍경 (Nature)", value: "nature" },
        { label: "인물 (Portrait)", value: "portrait" },
        { label: "일반 (General)", value: "general" },
      ],
      default: "pet",
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

    video_duration: {
      type: "integer",
      label: "Veo Video Duration (seconds)",
      description: "Duration for Veo action clips (4, 6, or 8)",
      default: 5,
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
      description: "GCS folder name. Leave empty to use from Image Generator.",
      optional: true,
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 입력 데이터 파싱
    // =====================
    const imageOutput = typeof this.image_generator_output === "string"
      ? JSON.parse(this.image_generator_output)
      : this.image_generator_output;

    const scriptOutput = typeof this.script_generator_output === "string"
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    const folderName = this.folder_name || imageOutput.folder_name || scriptOutput.folder_name;

    // 이미지 씬과 스크립트 씬 정보 병합
    const imageScenes = imageOutput.scenes || [];
    const scriptScenes = scriptOutput.pipeline_data?.image_generation?.scenes || [];

    // 씬 데이터 병합 (이미지 URL + 씬 타입 + 나레이션)
    const mergedScenes = imageScenes.map((imgScene, idx) => {
      const scriptScene = scriptScenes.find(s => s.index === imgScene.index) || scriptScenes[idx] || {};
      return {
        index: imgScene.index || idx + 1,
        url: imgScene.url,
        start: imgScene.start,
        end: imgScene.end,
        duration: imgScene.duration || (imgScene.end - imgScene.start),
        image_prompt: imgScene.image_prompt || scriptScene.image_prompt,
        scene_type: scriptScene.scene_type || "narration", // 기본값: narration
        narration: scriptScene.narration || "",
      };
    });

    // 씬 타입별 분류
    const narrationScenes = mergedScenes.filter(s => s.scene_type === "narration");
    const actionScenes = mergedScenes.filter(s => s.scene_type === "action");

    $.export("scene_routing", {
      total: mergedScenes.length,
      narration_count: narrationScenes.length,
      action_count: actionScenes.length,
      narration_indices: narrationScenes.map(s => s.index),
      action_indices: actionScenes.map(s => s.index),
    });

    // GCS 업로드 준비
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });

    const allGeneratedVideos = [];
    const stats = {
      hedra: { success: 0, failed: 0 },
      veo: { success: 0, failed: 0 },
    };

    // =====================
    // Hedra API 함수들
    // =====================
    const HEDRA_BASE_URL = "https://api.hedra.com/web-app/public";

    const hedraUploadImage = async (imageUrl, filename) => {
      const assetResponse = await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets`,
        headers: { "x-api-key": this.hedra_api_key, "Content-Type": "application/json" },
        data: { name: filename, type: "image" },
      });

      const imageResponse = await axios($, {
        method: "GET",
        url: imageUrl,
        responseType: "arraybuffer",
      });

      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", Buffer.from(imageResponse), { filename, contentType: "image/png" });

      await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/assets/${assetResponse.id}/upload`,
        headers: { "x-api-key": this.hedra_api_key, ...formData.getHeaders() },
        data: formData,
      });

      return assetResponse.id;
    };

    const hedraGenerate = async (imageAssetId, text) => {
      const requestData = {
        type: "video",
        ai_model_id: "character-3",
        start_keyframe_id: imageAssetId,
        generated_video_inputs: {
          text_prompt: text,
          text: text,
          resolution: "720p",
          aspect_ratio: this.aspect_ratio,
        },
      };

      if (this.hedra_voice_id) {
        requestData.generated_video_inputs.voice_id = this.hedra_voice_id;
      }

      const response = await axios($, {
        method: "POST",
        url: `${HEDRA_BASE_URL}/generations`,
        headers: { "x-api-key": this.hedra_api_key, "Content-Type": "application/json" },
        data: requestData,
      });

      return response.id;
    };

    const hedraPollStatus = async (generationId, maxAttempts = 120) => {
      for (let i = 0; i < maxAttempts; i++) {
        const response = await axios($, {
          method: "GET",
          url: `${HEDRA_BASE_URL}/generations/${generationId}/status`,
          headers: { "x-api-key": this.hedra_api_key },
        });

        if (response.status === "complete") {
          return { success: true, url: response.url || response.download_url };
        }
        if (response.status === "error") {
          return { success: false, error: response.error_message };
        }

        await new Promise(r => setTimeout(r, 5000));
      }
      return { success: false, error: "Timeout" };
    };

    // =====================
    // Veo API 함수들
    // =====================
    const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const veoModels = ["veo-3.0-generate-preview", "veo-2.0-generate-001"];
    const apiKeys = [this.gemini_api_key, this.gemini_api_key_backup].filter(Boolean);

    const motionPresets = {
      natural: "natural subtle movement, realistic motion, smooth animation",
      cinematic: "cinematic motion, film-like movement, professional camera work",
      dynamic: "dynamic movement, energetic motion, lively animation",
      calm: "very subtle movement, peaceful animation, minimal motion",
      cute: "playful movement, bouncy animation, cheerful motion",
    };

    const contentMotion = {
      pet: "dog/cat breathing, ear twitching, tail wagging, subtle head movement, blinking eyes",
      nature: "leaves swaying, water flowing, clouds drifting",
      portrait: "subtle breathing, slight head turn, natural blink",
      general: "natural movement appropriate to scene content",
    };

    const veoGenerate = async (imageUrl, motionPrompt, sceneIndex) => {
      const imageResponse = await axios($, { method: "GET", url: imageUrl, responseType: "arraybuffer" });
      const imageBase64 = Buffer.from(imageResponse).toString("base64");
      const mimeType = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "image/jpeg" : "image/png";

      let duration = this.video_duration <= 4 ? 4 : this.video_duration <= 6 ? 6 : 8;

      for (let modelIdx = 0; modelIdx < veoModels.length; modelIdx++) {
        for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
          const modelId = veoModels[modelIdx];
          const apiKey = apiKeys[keyIdx];

          try {
            const createResponse = await axios($, {
              method: "POST",
              url: `${VEO_BASE_URL}/models/${modelId}:predictLongRunning`,
              headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
              data: {
                instances: [{
                  prompt: motionPrompt,
                  image: { bytesBase64Encoded: imageBase64, mimeType },
                }],
                parameters: { aspectRatio: this.aspect_ratio, durationSeconds: duration, personGeneration: "allow_adult" },
              },
            });

            const operationName = createResponse.name;
            if (!operationName) throw new Error("No operation name");

            // Poll for completion
            for (let i = 0; i < 72; i++) {
              await new Promise(r => setTimeout(r, 5000));
              const statusResponse = await axios($, {
                method: "GET",
                url: `${VEO_BASE_URL}/${operationName}`,
                headers: { "X-goog-api-key": apiKey },
              });

              if (statusResponse.done) {
                if (statusResponse.error) throw new Error(statusResponse.error.message);

                let videoUrl = null;
                const response = statusResponse.response;

                if (response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri) {
                  videoUrl = response.generateVideoResponse.generatedSamples[0].video.uri;
                } else if (response?.generatedVideos?.[0]?.video?.uri) {
                  videoUrl = response.generatedVideos[0].video.uri;
                } else if (response?.videos?.[0]?.gcsUri) {
                  videoUrl = response.videos[0].gcsUri;
                }

                if (videoUrl?.startsWith("gs://")) {
                  const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
                  if (gsMatch) videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
                }

                if (videoUrl) return { success: true, url: videoUrl, model: modelId, apiKey: keyIdx };
              }
            }
            throw new Error("Timeout");
          } catch (error) {
            const isQuota = error.message?.includes("quota") || error.message?.includes("rate limit") || error.response?.status === 429;
            if (!isQuota && modelIdx === veoModels.length - 1 && keyIdx === apiKeys.length - 1) {
              throw error;
            }
          }
        }
      }
      throw new Error("All Veo models/keys exhausted");
    };

    // =====================
    // 비디오 생성 처리
    // =====================

    // Helper: GCS 업로드
    const uploadToGCS = async (videoUrl, filename, headers = {}) => {
      const videoResponse = await axios($, {
        method: "GET",
        url: videoUrl,
        headers,
        responseType: "arraybuffer",
      });

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

      return `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;
    };

    // 1. Hedra로 나레이션 씬 처리
    $.export("status", `Processing ${narrationScenes.length} narration scenes with Hedra...`);

    for (const scene of narrationScenes) {
      try {
        $.export(`hedra_${scene.index}_start`, `Scene ${scene.index}: ${scene.narration?.substring(0, 40)}...`);

        const imageAssetId = await hedraUploadImage(scene.url, `scene_${scene.index}.png`);
        const generationId = await hedraGenerate(imageAssetId, scene.narration);
        const result = await hedraPollStatus(generationId);

        if (!result.success) throw new Error(result.error);

        const gcsUrl = await uploadToGCS(result.url, `video_${String(scene.index).padStart(3, "0")}_hedra.mp4`);

        allGeneratedVideos.push({
          index: scene.index,
          filename: `video_${String(scene.index).padStart(3, "0")}_hedra.mp4`,
          url: gcsUrl,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          source: "hedra",
          scene_type: "narration",
        });

        stats.hedra.success++;
        $.export(`hedra_${scene.index}_done`, `Completed`);

      } catch (error) {
        stats.hedra.failed++;
        $.export(`hedra_${scene.index}_error`, error.message);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // 2. Veo로 액션 씬 처리
    $.export("status_veo", `Processing ${actionScenes.length} action scenes with Veo...`);

    for (const scene of actionScenes) {
      try {
        const motionPrompt = `${motionPresets[this.motion_style]}, ${contentMotion[this.content_type]}, ${scene.image_prompt || ""}`;
        $.export(`veo_${scene.index}_start`, `Scene ${scene.index}: motion video`);

        const result = await veoGenerate(scene.url, motionPrompt, scene.index);

        if (!result.success) throw new Error(result.error || "Generation failed");

        // Veo URL에는 API 키 필요
        const downloadHeaders = result.url.includes("generativelanguage") ? { "X-goog-api-key": apiKeys[result.apiKey] } : {};
        const gcsUrl = await uploadToGCS(result.url, `video_${String(scene.index).padStart(3, "0")}_veo.mp4`, downloadHeaders);

        allGeneratedVideos.push({
          index: scene.index,
          filename: `video_${String(scene.index).padStart(3, "0")}_veo.mp4`,
          url: gcsUrl,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          source: "veo",
          scene_type: "action",
          veo_model: result.model,
        });

        stats.veo.success++;
        $.export(`veo_${scene.index}_done`, `Completed with ${result.model}`);

      } catch (error) {
        stats.veo.failed++;
        $.export(`veo_${scene.index}_error`, error.message);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // 결과 정렬 (인덱스 순)
    allGeneratedVideos.sort((a, b) => a.index - b.index);

    $.export("$summary", `Generated ${allGeneratedVideos.length}/${mergedScenes.length} videos (Hedra: ${stats.hedra.success}, Veo: ${stats.veo.success})`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      stats: {
        total: allGeneratedVideos.length,
        hedra: stats.hedra,
        veo: stats.veo,
      },
      scene_routing: {
        narration_count: narrationScenes.length,
        action_count: actionScenes.length,
      },
      total_videos: allGeneratedVideos.length,
      videos: allGeneratedVideos,
    };
  },
});
