import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Hedra Lip Sync Generator",
  description: "이미지 + 오디오 → 입이 움직이는 영상 생성 (Hedra Character-3 API)",

  props: {
    // Hedra API 설정
    hedra_api_key: {
      type: "string",
      label: "Hedra API Key",
      secret: true,
    },

    // 입력: 이미지 URL
    image_url: {
      type: "string",
      label: "Image URL",
      description: "캐릭터 이미지 URL (GCS 또는 공개 URL)",
    },

    // 입력: 오디오 URL (TTS 결과물)
    audio_url: {
      type: "string",
      label: "Audio URL",
      description: "TTS 오디오 URL (mp3)",
    },

    // 영상 설정
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      default: "9:16",
      options: [
        { label: "9:16 (Shorts/Reels)", value: "9:16" },
        { label: "16:9 (YouTube)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
      ],
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

    // 옵션
    folder_name: {
      type: "string",
      label: "Output Folder Name",
      optional: true,
    },
  },

  async run({ $ }) {
    const HEDRA_API_BASE = "https://api.hedra.com/web-app/public";
    const folderName = this.folder_name || `hedra_${Date.now()}`;

    const headers = {
      "X-API-Key": this.hedra_api_key,
      "Content-Type": "application/json",
    };

    $.export("status", "Starting Hedra Lip Sync generation...");

    // =====================
    // 1. 모델 목록 조회 (video 타입)
    // =====================
    $.export("step", "1. Fetching available models...");

    const modelsResponse = await axios($, {
      method: "GET",
      url: `${HEDRA_API_BASE}/models`,
      headers,
    });

    const videoModels = modelsResponse.filter(m => m.type === "video" || m.type === "character");
    $.export("available_models", videoModels.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
    })));

    // Character-3 모델 찾기
    const characterModel = videoModels.find(m =>
      m.name?.toLowerCase().includes("character") ||
      m.type === "character"
    ) || videoModels[0];

    if (!characterModel) {
      throw new Error("No video/character model available");
    }

    $.export("selected_model", {
      id: characterModel.id,
      name: characterModel.name,
    });

    // =====================
    // 2. 이미지 에셋 생성 및 업로드
    // =====================
    $.export("step", "2. Creating image asset...");

    // 2a. 이미지 에셋 생성
    const imageAssetResponse = await axios($, {
      method: "POST",
      url: `${HEDRA_API_BASE}/assets`,
      headers,
      data: {
        name: `image_${Date.now()}.jpg`,
        type: "image",
      },
    });

    const imageAssetId = imageAssetResponse.id;
    $.export("image_asset_id", imageAssetId);

    // 2b. 이미지 다운로드
    const imageResponse = await axios($, {
      method: "GET",
      url: this.image_url,
      responseType: "arraybuffer",
    });

    // 2c. 이미지 업로드 (multipart/form-data)
    const FormData = (await import("form-data")).default;
    const imageFormData = new FormData();
    imageFormData.append("file", Buffer.from(imageResponse), {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    await axios($, {
      method: "POST",
      url: `${HEDRA_API_BASE}/assets/${imageAssetId}/upload`,
      headers: {
        "X-API-Key": this.hedra_api_key,
        ...imageFormData.getHeaders(),
      },
      data: imageFormData,
    });

    $.export("image_uploaded", true);

    // =====================
    // 3. 오디오 에셋 생성 및 업로드
    // =====================
    $.export("step", "3. Creating audio asset...");

    // 3a. 오디오 에셋 생성
    const audioAssetResponse = await axios($, {
      method: "POST",
      url: `${HEDRA_API_BASE}/assets`,
      headers,
      data: {
        name: `audio_${Date.now()}.mp3`,
        type: "audio",
      },
    });

    const audioAssetId = audioAssetResponse.id;
    $.export("audio_asset_id", audioAssetId);

    // 3b. 오디오 다운로드
    const audioResponse = await axios($, {
      method: "GET",
      url: this.audio_url,
      responseType: "arraybuffer",
    });

    // 3c. 오디오 업로드
    const audioFormData = new FormData();
    audioFormData.append("file", Buffer.from(audioResponse), {
      filename: "audio.mp3",
      contentType: "audio/mpeg",
    });

    await axios($, {
      method: "POST",
      url: `${HEDRA_API_BASE}/assets/${audioAssetId}/upload`,
      headers: {
        "X-API-Key": this.hedra_api_key,
        ...audioFormData.getHeaders(),
      },
      data: audioFormData,
    });

    $.export("audio_uploaded", true);

    // =====================
    // 4. 영상 생성 요청
    // =====================
    $.export("step", "4. Requesting video generation...");

    const generationResponse = await axios($, {
      method: "POST",
      url: `${HEDRA_API_BASE}/generations`,
      headers,
      data: {
        type: "video",
        ai_model_id: characterModel.id,
        start_keyframe_id: imageAssetId,
        audio_id: audioAssetId,
        generated_video_inputs: {
          aspect_ratio: this.aspect_ratio,
        },
      },
    });

    const generationId = generationResponse.id;
    const assetId = generationResponse.asset_id;

    $.export("generation_id", generationId);
    $.export("output_asset_id", assetId);

    // =====================
    // 5. 생성 완료 대기 (Polling)
    // =====================
    $.export("step", "5. Waiting for generation to complete...");

    const maxAttempts = 120; // 최대 10분 대기 (5초 간격)
    let attempts = 0;
    let status = "pending";
    let resultUrl = null;

    while (attempts < maxAttempts && !["complete", "error"].includes(status)) {
      await new Promise(r => setTimeout(r, 5000)); // 5초 대기

      const statusResponse = await axios($, {
        method: "GET",
        url: `${HEDRA_API_BASE}/generations/${generationId}/status`,
        headers,
      });

      status = statusResponse.status;
      const progress = statusResponse.progress || 0;

      $.export("progress", `${Math.round(progress * 100)}% - ${status}`);

      if (status === "complete") {
        resultUrl = statusResponse.url;
        break;
      }

      if (status === "error") {
        throw new Error(`Generation failed: ${statusResponse.error_message || "Unknown error"}`);
      }

      attempts++;
    }

    if (!resultUrl) {
      throw new Error("Generation timed out after 10 minutes");
    }

    $.export("hedra_video_url", resultUrl);

    // =====================
    // 6. GCS에 결과 업로드 (선택)
    // =====================
    $.export("step", "6. Uploading to GCS...");

    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

    // Hedra 결과 다운로드
    const videoResponse = await axios($, {
      method: "GET",
      url: resultUrl,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    const filename = `lipsync_${Date.now()}.mp4`;
    const objectName = `${folderName}/${filename}`;

    // GCS 업로드
    const bufferStream = new Readable({ read() {} });
    bufferStream.push(videoBuffer);
    bufferStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: { mimeType: "video/mp4", body: bufferStream },
      requestBody: { name: objectName, contentType: "video/mp4" },
    });

    const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Lip sync video generated successfully`);

    return {
      success: true,
      folder_name: folderName,
      hedra_url: resultUrl,
      gcs_url: gcsUrl,
      generation_id: generationId,
      model_used: characterModel.name,
      aspect_ratio: this.aspect_ratio,
    };
  },
});
