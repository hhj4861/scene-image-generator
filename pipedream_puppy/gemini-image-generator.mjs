import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Image Generator",
  description: "Imagen 4로 캐릭터별 이미지 병렬 생성 (상세 프롬프트 기반 일관성 유지)",

  props: {
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
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
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts)", value: "9:16" },
        { label: "16:9 (Landscape)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
      ],
      default: "9:16",
    },
  },

  async run({ $ }) {
    const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`;

    // =====================
    // 1. 입력 파싱
    // =====================
    const scriptOutput = typeof this.script_generator_output === "string"
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    // 디버깅: 입력값 구조 확인
    $.export("debug_input_type", typeof this.script_generator_output);
    $.export("debug_input_keys", Object.keys(scriptOutput || {}));
    $.export("debug_has_image_generation", !!scriptOutput.image_generation);

    // Script Generator 출력값에서 scenes 찾기
    // 1. image_generation.scenes (정상 경로)
    // 2. scriptOutput.scenes (직접 전달된 경우 - 호환성)
    const scenes = scriptOutput.image_generation?.scenes || scriptOutput.scenes || [];
    const folderName = scriptOutput.folder_name;
    const overallStyle = scriptOutput.image_generation?.overall_style || scriptOutput.overall_style || "photorealistic";
    const characters = scriptOutput.characters || {};
    const characterPrompts = scriptOutput.image_generation?.character_prompts || scriptOutput.character_prompts || {};

    if (!scenes.length) {
      // 더 자세한 에러 메시지
      throw new Error(`No scenes found. Input keys: ${Object.keys(scriptOutput || {}).join(", ")}. image_generation exists: ${!!scriptOutput.image_generation}. Direct scenes exists: ${!!scriptOutput.scenes}`);
    }

    $.export("input", { scenes: scenes.length, folder: folderName, characters: Object.keys(characters) });
    $.export("character_prompts", characterPrompts);

    // =====================
    // 2. GCS 준비
    // =====================
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

    // =====================
    // 3. 스타일 프롬프트 설정
    // =====================
    const styleConfig = {
      photorealistic: {
        prefix: "photorealistic, ultra realistic, 8k, professional photography",
        suffix: "DSLR quality, natural lighting, sharp focus, highly detailed",
      },
      cartoon: {
        prefix: "3D cartoon style, Pixar-like animation, cute character design",
        suffix: "vibrant colors, smooth textures, appealing character",
      },
      anime: {
        prefix: "anime style, Japanese animation, cute kawaii aesthetic",
        suffix: "clean lines, expressive eyes, soft shading",
      },
    };
    const { prefix: stylePrefix, suffix: styleSuffix } = styleConfig[overallStyle] || styleConfig.photorealistic;

    // ★ 주인공(main) 캐릭터 프롬프트 (상세 분석 결과)
    const mainPrompt = characterPrompts.main || characters.main?.image_prompt || "cute adorable puppy";

    // =====================
    // 4. 모든 이미지 병렬 생성 (상세 프롬프트 기반)
    // =====================
    $.export("status", `Generating ${scenes.length} images...`);

    const imagePromises = scenes.map(async (scene) => {
      const sceneDetails = scene.scene_details || {};
      const characterAppearance = scene.character_appearance || {};
      const sceneEnvironment = scene.scene_environment || {};

      // ★ 새로운 detailed_image_prompt가 있으면 우선 사용
      const detailedPrompt = scene.detailed_image_prompt;

      // 환경 정보
      const locationInfo = sceneEnvironment.location === "outdoor" || sceneDetails.location === "outdoor"
        ? `outdoor setting, ${sceneEnvironment.weather || sceneDetails.weather || "sunny"} weather`
        : "indoor setting";
      const backgroundInfo = sceneEnvironment.background || sceneDetails.background || "";
      const lightingInfo = sceneEnvironment.lighting || sceneDetails.lighting ? `${sceneEnvironment.lighting || sceneDetails.lighting} lighting` : "";
      const moodInfo = sceneEnvironment.mood || sceneDetails.mood ? `${sceneEnvironment.mood || sceneDetails.mood} atmosphere` : "";

      // speaker에 따라 캐릭터 프롬프트 선택
      const speaker = scene.speaker || "main";
      const speakerPrompt = characterPrompts[speaker] || characters[speaker]?.image_prompt || mainPrompt;

      // ★ 인터뷰 질문인지 확인 (강아지가 듣는 표정)
      const isInterviewQuestion = scene.scene_type === "interview_question" || speaker === "interviewer";

      let finalPrompt;

      // ★ detailed_image_prompt가 있으면 그대로 사용 (스크립트 생성기에서 이미 조합됨)
      if (detailedPrompt) {
        finalPrompt = `${stylePrefix}, ${detailedPrompt}, ${styleSuffix}`;
      } else if (isInterviewQuestion) {
        // ★ 인터뷰 질문: 강아지가 듣는 표정으로 생성
        finalPrompt = `IMPORTANT: Generate EXACTLY this character - ${mainPrompt}. Single character alone, curious listening expression, head slightly tilted, ears perked up, attentive, ${backgroundInfo}, ${locationInfo}, ${lightingInfo}, ${moodInfo}. ${stylePrefix}, ${styleSuffix}. CRITICAL: Must match the character description exactly - same breed, fur color, accessories.`;
      } else if (speaker === "main") {
        // ★ 주인공만 등장 - 상세 프롬프트 사용
        finalPrompt = `IMPORTANT: Generate EXACTLY this character - ${mainPrompt}. Single character alone, ${scene.emotion || "happy"} expression, ${backgroundInfo}, ${locationInfo}, ${lightingInfo}, ${moodInfo}. ${stylePrefix}, ${styleSuffix}. CRITICAL: Must match the character description exactly - same breed, fur color, accessories.`;
      } else {
        // ★ 조연이 말하는 씬 - 조연 + 주인공 함께 등장
        finalPrompt = `IMPORTANT: Generate EXACTLY these characters - Character 1: ${speakerPrompt}. Character 2: ${mainPrompt}. Both characters together, ${scene.emotion || "happy"} expression, ${backgroundInfo}, ${locationInfo}, ${lightingInfo}, ${moodInfo}. ${stylePrefix}, ${styleSuffix}. CRITICAL: Must match both character descriptions exactly.`;
      }

      // 프롬프트 정리
      finalPrompt = finalPrompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();

      // 이미지 생성 함수 (에러 시 null 반환)
      const generateImage = async (prompt) => {
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
                personGeneration: "allow_adult",
              },
            },
            timeout: 180000,
          });
          return response.predictions?.[0]?.bytesBase64Encoded || null;
        } catch (e) {
          // 에러 시 null 반환 (fallback 시도를 위해)
          $.export(`error_${scene.index}_attempt`, e.response?.data?.error?.message || e.message);
          return null;
        }
      };

      // 1차 시도: 원래 프롬프트
      let base64 = await generateImage(finalPrompt);
      let usedPrompt = finalPrompt;

      // 2차 시도: 사람 캐릭터 실패 시 (null 반환 또는 에러) 강아지만 등장하는 프롬프트로 재시도
      if (!base64 && speaker !== "main") {
        const fallbackPrompt = `IMPORTANT: Generate EXACTLY this character - ${mainPrompt}. Single character alone, ${scene.emotion || "happy"} expression, listening attentively, ${backgroundInfo}, ${locationInfo}, ${lightingInfo}, ${moodInfo}. ${stylePrefix}, ${styleSuffix}. CRITICAL: Must match the character description exactly - same breed, fur color, accessories.`;
        base64 = await generateImage(fallbackPrompt);
        usedPrompt = fallbackPrompt;
        if (base64) {
          $.export(`fallback_${scene.index}`, "Used main character fallback");
        }
      }

      if (base64) {
        return {
          success: true,
          index: scene.index,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          base64: base64,
          prompt: usedPrompt,
          narration: scene.narration,
          speaker: scene.speaker,
          voice_type: scene.voice_type,
          scene_type: scene.scene_type,
          emotion: scene.emotion,
          scene_details: sceneDetails,
          // ★ 새로운 필드들
          character_appearance: characterAppearance,
          scene_environment: sceneEnvironment,
          is_interview_question: isInterviewQuestion,
        };
      }
      return { success: false, index: scene.index, error: "No prediction after retry" }
    });

    const results = await Promise.all(imagePromises);
    const successResults = results.filter(r => r.success).sort((a, b) => a.index - b.index);
    const failedResults = results.filter(r => !r.success);

    $.export("generated", successResults.length);
    if (failedResults.length) {
      $.export("failed", failedResults.map(f => ({ index: f.index, error: f.error })));
    }

    // =====================
    // 6. GCS 병렬 업로드
    // =====================
    $.export("status", "Uploading to GCS...");

    const uploadPromises = successResults.map(async (img) => {
      const filename = `scene_${String(img.index).padStart(3, "0")}.png`;
      const objectName = `${folderName}/${filename}`;
      const imageBuffer = Buffer.from(img.base64, "base64");

      const bufferStream = new Readable();
      bufferStream.push(imageBuffer);
      bufferStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: objectName,
        media: { mimeType: "image/png", body: bufferStream },
        requestBody: { name: objectName, contentType: "image/png" },
      });

      return {
        index: img.index,
        filename,
        url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`,
        start: img.start,
        end: img.end,
        duration: img.duration,
        image_prompt: img.prompt,
        narration: img.narration,
        speaker: img.speaker,
        voice_type: img.voice_type,
        scene_type: img.scene_type,
        emotion: img.emotion,
        scene_details: img.scene_details,
        // ★ 새로운 필드들
        character_appearance: img.character_appearance,
        scene_environment: img.scene_environment,
        is_interview_question: img.is_interview_question,
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    uploadedFiles.sort((a, b) => a.index - b.index);

    // =====================
    // 6. 결과 반환
    // =====================
    $.export("$summary", `Generated ${uploadedFiles.length} images (${this.imagen_model})`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      imagen_model: this.imagen_model,
      character_prompts: characterPrompts,
      characters: characters,
      total_duration_seconds: scriptOutput.total_duration_seconds,
      total_scenes: uploadedFiles.length,
      scenes: uploadedFiles,
    };
  },
});
