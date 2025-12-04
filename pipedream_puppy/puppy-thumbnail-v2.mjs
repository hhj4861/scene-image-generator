import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Thumbnail V2",
  description: "Imagen 4로 바이럴 썸네일 이미지 생성 + GCS 업로드 (V2) - gemini-image-generator.mjs API 형식 적용",

  props: {
    viral_title_output: {
      type: "string",
      label: "Viral Title Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Viral_Title_V2.$return_value)}}",
    },
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      secret: true,
    },
    imagen_model: {
      type: "string",
      label: "Imagen Model",
      options: [
        { label: "Imagen 4 Ultra (최고 품질)", value: "imagen-4.0-ultra-generate-001" },
        { label: "Imagen 4 Standard", value: "imagen-4.0-generate-001" },
        { label: "Imagen 4 Fast (빠른 생성)", value: "imagen-4.0-fast-generate-001" },
      ],
      default: "imagen-4.0-generate-001",
    },
    google_cloud: {
      type: "app",
      app: "google_cloud",
      description: "Google Cloud 연결 (GCS 업로드용)",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
    },
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts 세로)", value: "9:16" },
        { label: "16:9 (YouTube 가로)", value: "16:9" },
        { label: "1:1 (정사각형)", value: "1:1" },
      ],
      default: "9:16",
    },
    thumbnail_style: {
      type: "string",
      label: "Thumbnail Style",
      default: "viral",
      options: [
        { label: "바이럴 (밈/임팩트)", value: "viral" },
        { label: "귀여움 (하트/반짝)", value: "cute" },
        { label: "뉴스 (속보 스타일)", value: "news" },
        { label: "드라마틱 (감동/반전)", value: "dramatic" },
      ],
    },
  },

  async run({ $ }) {
    // ★★★ Imagen API URL (gemini-image-generator.mjs와 동일) ★★★
    const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`;

    // =====================
    // 1. 입력 파싱
    // =====================
    const viralOutput = typeof this.viral_title_output === "string"
      ? JSON.parse(this.viral_title_output) : this.viral_title_output;

    const generatedTitles = viralOutput?.generated_titles || {};
    const titleInfo = viralOutput?.title_generation_info || {};
    const folderName = viralOutput?.folder_name || `thumbnail_${Date.now()}`;
    const charName = titleInfo.main_character || "땅콩";
    const headerKorean = generatedTitles.header_korean || `${charName} 레전드`;
    const originalTopic = titleInfo.original_topic || "";

    // 캐릭터 정보 추출
    const characters = viralOutput?.characters || {};
    const mainCharacter = characters.main || {};
    const mainCharacterPrompt = mainCharacter.image_prompt || "cute adorable Shiba Inu puppy, golden cream fur";

    $.export("input_info", {
      folder_name: folderName,
      character: charName,
      title: headerKorean,
      topic: originalTopic,
      imagen_model: this.imagen_model,
    });

    // =====================
    // 2. 썸네일 스타일별 프롬프트
    // =====================
    const stylePrompts = {
      viral: {
        style: "explosive viral meme style, bright neon colors, dynamic action pose",
        mood: "shocking, funny, over-the-top reaction, surprised expression",
        colors: "bright yellow, hot pink, electric blue highlights",
      },
      cute: {
        style: "kawaii adorable style, soft pastel colors, sparkles and hearts",
        mood: "heartwarming, sweet, lovable, innocent expression",
        colors: "soft pink, baby blue, cream white, golden sparkles",
      },
      news: {
        style: "breaking news broadcast style, dramatic lighting, urgent atmosphere",
        mood: "serious but satirical, newsroom feel, confident expression",
        colors: "red alert colors, white text areas, professional blue",
      },
      dramatic: {
        style: "cinematic dramatic style, emotional lighting, movie poster feel",
        mood: "intense, emotional, story-driven, contemplative expression",
        colors: "deep contrast, warm orange glow, cool shadows",
      },
    };

    const selectedStyle = stylePrompts[this.thumbnail_style] || stylePrompts.viral;

    // =====================
    // 3. 썸네일 프롬프트 생성
    // =====================
    const thumbnailPrompt = `${mainCharacterPrompt}, ${selectedStyle.mood}, ${selectedStyle.style}, ${selectedStyle.colors}, YouTube thumbnail style, eye-catching, high contrast, clean background, professional quality, 8K, photorealistic, ultra detailed. Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. Real fur. Real animal. No text. No signs. No banners. No letters. No words. No writing. Clean image without any text elements.`;

    $.export("prompt", thumbnailPrompt.substring(0, 500));

    // =====================
    // 4. Imagen API 호출 (gemini-image-generator.mjs 형식 적용)
    // =====================
    let imageBase64 = null;
    let imageUrl = null;

    // 이미지 생성 함수 (재시도 로직 포함)
    const generateImage = async (prompt, retryCount = 0) => {
      try {
        const response = await axios($, {
          method: "POST",
          url: IMAGEN_URL,
          headers: {
            "x-goog-api-key": this.gemini_api_key,
            "Content-Type": "application/json",
          },
          data: {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: this.aspect_ratio,
              personGeneration: "allow_adult", // gemini-image-generator.mjs와 동일
            },
          },
          timeout: 180000,
        });
        return response.predictions?.[0]?.bytesBase64Encoded || null;
      } catch (e) {
        const errorMsg = e.response?.data?.error?.message || e.message;
        $.export(`imagen_error_attempt_${retryCount + 1}`, errorMsg);
        return null;
      }
    };

    $.export("status", `Generating thumbnail with ${this.imagen_model}...`);

    // 1차 시도
    imageBase64 = await generateImage(thumbnailPrompt);

    // 실패 시 간단한 프롬프트로 재시도
    if (!imageBase64) {
      $.export("retry_status", "Retrying with simplified prompt...");
      const simplifiedPrompt = `${mainCharacterPrompt}, ${selectedStyle.mood}, YouTube thumbnail style, eye-catching, high contrast, professional quality, 8K, photorealistic. Real living dog. No text.`;
      imageBase64 = await generateImage(simplifiedPrompt, 1);
    }

    // 이미지 생성 실패 시
    if (!imageBase64) {
      $.export("generation_failed", true);
      return {
        ...viralOutput,
        thumbnail: null,
        thumbnail_url: null,
        thumbnail_error: "Imagen API failed after retry. Check imagen_error exports for details.",
      };
    }

    $.export("imagen_success", true);

    // =====================
    // 5. GCS 업로드 (gemini-image-generator.mjs 형식 적용)
    // =====================
    const thumbnailFileName = `${folderName}/thumbnail_${Date.now()}.png`;

    try {
      $.export("status", "Uploading to GCS...");

      const { google } = await import("googleapis");
      const { Readable } = await import("stream");

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      });
      const storage = google.storage({ version: "v1", auth });

      const imageBuffer = Buffer.from(imageBase64, "base64");
      const bufferStream = new Readable();
      bufferStream.push(imageBuffer);
      bufferStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: thumbnailFileName,
        media: { mimeType: "image/png", body: bufferStream },
        requestBody: { name: thumbnailFileName, contentType: "image/png" },
      });

      imageUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${thumbnailFileName}`;
      $.export("upload_success", true);
    } catch (uploadError) {
      $.export("upload_error", uploadError.message);
      // 업로드 실패해도 base64는 반환
    }

    $.export("$summary", `Thumbnail generated: ${headerKorean} (${this.imagen_model})`);

    // =====================
    // 6. 결과 반환
    // =====================
    return {
      ...viralOutput,
      thumbnail: {
        url: imageUrl,
        style: this.thumbnail_style,
        model: this.imagen_model,
        generated_at: new Date().toISOString(),
      },
      thumbnail_url: imageUrl,
      thumbnail_base64_preview: imageBase64 ? `data:image/png;base64,${imageBase64.substring(0, 50)}...` : null,
    };
  },
});
