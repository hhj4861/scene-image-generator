import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News Image Generator",
  description: "Generate images for each news scene using Gemini Imagen",

  props: {
    // Gemini API
    gemini_api_key: {
      type: "string",
      label: "Google AI (Gemini) API Key",
      description: "Get from https://aistudio.google.com/apikey",
      secret: true,
    },

    // 입력 데이터
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

    // 이미지 설정
    image_model: {
      type: "string",
      label: "Image Model",
      options: [
        { label: "Imagen 3 (Best Quality)", value: "imagen-3.0-generate-002" },
        { label: "Imagen 3 Fast", value: "imagen-3.0-fast-generate-001" },
      ],
      default: "imagen-3.0-generate-002",
    },
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
  },

  async run({ $ }) {
    const scenes = typeof this.scenes_json === 'string' ? JSON.parse(this.scenes_json) : this.scenes_json;

    if (!scenes || scenes.length === 0) {
      throw new Error("No scenes provided");
    }

    $.export("status", `Generating ${scenes.length} images...`);

    const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const generatedImages = [];

    // Google Cloud Storage 설정
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      $.export(`image_${i + 1}_status`, "Generating...");

      // 뉴스 스타일에 맞게 프롬프트 강화
      const enhancedPrompt = `${scene.image_prompt}

IMPORTANT STYLE REQUIREMENTS:
- Professional news broadcast quality
- Clean, modern design
- High contrast for mobile viewing
- No text overlays (will be added later)
- Vertical composition optimized for mobile
- Dramatic lighting for impact
- Stock market/financial theme elements where appropriate`;

      try {
        // Gemini Imagen API 호출
        const response = await axios($, {
          method: "POST",
          url: `${GEMINI_BASE_URL}/models/${this.image_model}:predict`,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.gemini_api_key,
          },
          data: {
            instances: [{ prompt: enhancedPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: this.aspect_ratio,
              personGeneration: "allow_adult",
              safetySetting: "block_medium_and_above",
            },
          },
        });

        // 이미지 데이터 추출
        const predictions = response.predictions || [];
        if (predictions.length === 0 || !predictions[0].bytesBase64Encoded) {
          throw new Error("No image generated");
        }

        const imageBase64 = predictions[0].bytesBase64Encoded;
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        // GCS에 업로드
        const filename = `scene_${String(i + 1).padStart(2, '0')}_${scene.type}.png`;
        const objectName = `${this.folder_name}/${filename}`;

        const bufferStream = new Readable();
        bufferStream.push(imageBuffer);
        bufferStream.push(null);

        await storage.objects.insert({
          bucket: this.gcs_bucket_name,
          name: objectName,
          media: {
            mimeType: 'image/png',
            body: bufferStream,
          },
          requestBody: {
            name: objectName,
            contentType: 'image/png',
          },
        });

        const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedImages.push({
          index: i,
          scene_index: scene.index,
          type: scene.type,
          filename: filename,
          url: publicUrl,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          prompt: scene.image_prompt,
          news_title: scene.news_title,
        });

        $.export(`image_${i + 1}_status`, "Complete");
        $.export(`image_${i + 1}_url`, publicUrl);

      } catch (error) {
        $.export(`image_${i + 1}_error`, error.message);

        // 실패한 장면 기록
        generatedImages.push({
          index: i,
          scene_index: scene.index,
          type: scene.type,
          filename: null,
          url: null,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          error: error.message,
        });
      }

      // Rate limiting (Gemini API)
      if (i < scenes.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 메타데이터 저장
    const successfulImages = generatedImages.filter(img => img.url);

    const metadata = {
      generated_at: new Date().toISOString(),
      folder_name: this.folder_name,
      model: this.image_model,
      aspect_ratio: this.aspect_ratio,
      total_scenes: scenes.length,
      successful_images: successfulImages.length,
      failed_images: generatedImages.length - successfulImages.length,
      images: generatedImages,
    };

    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(metadata, null, 2));
    metadataStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: `${this.folder_name}/image_metadata.json`,
      media: {
        mimeType: 'application/json',
        body: metadataStream,
      },
      requestBody: {
        name: `${this.folder_name}/image_metadata.json`,
        contentType: 'application/json',
      },
    });

    $.export("$summary", `Generated ${successfulImages.length}/${scenes.length} images`);

    return {
      success: successfulImages.length > 0,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      model: this.image_model,
      total_scenes: scenes.length,
      images_generated: successfulImages.length,
      images_failed: generatedImages.length - successfulImages.length,
      images: generatedImages,
    };
  },
});
