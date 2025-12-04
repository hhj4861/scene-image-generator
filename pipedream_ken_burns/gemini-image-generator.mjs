import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Image Generator",
  description: "Puppy Script Generator 결과 기반 Imagen 4로 씬별 이미지 생성",

  props: {
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
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
    // 1. 입력 파싱 (Script Generator 또는 Image Generator 출력 모두 지원)
    // =====================
    const scriptData = typeof this.script_generator_output === "string"
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    const folderName = scriptData.folder_name;

    // ★★★ 입력 형식 자동 감지 ★★★
    // puppy-script-generator 출력: script.script_segments 에 씬 정보
    // puppy-image-generator 출력: scenes 에 씬 정보
    const isFromScriptGenerator = !!(scriptData.script?.script_segments);
    const isFromImageGenerator = !!(scriptData.scenes && scriptData.character_prompts);

    let characters, scriptSegments, contentType, contentTypeConfig, scriptFormat, bgmInfo, overallStyle, consistencyInfo;

    if (isFromScriptGenerator) {
      // puppy-script-generator 출력 형식
      characters = scriptData.characters || {};
      const script = scriptData.script || {};
      scriptSegments = script.script_segments || [];
      contentType = scriptData.content_type || "satire";
      contentTypeConfig = scriptData.content_type_config || {};
      scriptFormat = scriptData.topic_info?.script_format || "interview";
      bgmInfo = scriptData.bgm || {};
      overallStyle = script.overall_style || "photorealistic";
      // ★★★ 일관성 정보 추출 ★★★
      consistencyInfo = scriptData.consistency || {};
    } else if (isFromImageGenerator) {
      // puppy-image-generator 출력 형식 (scenes 배열 사용)
      // character_details에서 캐릭터 정보 추출
      characters = {};
      const charDetails = scriptData.character_details || {};
      for (const [key, detail] of Object.entries(charDetails)) {
        characters[key] = {
          name: detail.name,
          image_prompt: detail.base_prompt,
          species: detail.species,
          breed: detail.breed,
          fur_color: detail.fur_color,
          fur_texture: detail.fur_texture,
          eye_color: detail.eye_color,
          clothing: detail.outfit,
          accessories: detail.accessories,
          distinctive_features: detail.distinctive_features,
          personality: detail.personality,
        };
      }

      // scenes 배열을 script_segments 형식으로 변환
      scriptSegments = (scriptData.scenes || []).map((scene) => ({
        segment_number: scene.segment_number || scene.index,
        index: scene.index,
        start_time: scene.start,
        end_time: scene.end,
        duration: scene.duration,
        narration: scene.narration,
        narration_english: scene.narration_english,
        speaker: scene.speaker,
        character_name: scene.character_name,
        voice_type: scene.voice_type,
        emotion: scene.emotion,
        emotion_transition: scene.emotion_transition,
        scene_type: scene.scene_type,
        has_narration: scene.has_narration,
        image_prompt: scene.image_prompt || scene.detailed_image_prompt,
        scene_details: scene.scene_details || scene.scene_environment,
        video_prompt: scene.video_prompt,
        action_cues: scene.action_cues,
        is_performance: scene.is_performance,
        performance_type: scene.performance_type,
        performance_phase: scene.performance_phase,
        audio_details: scene.audio_details,
      }));

      contentType = scriptData.content_type || "satire";
      contentTypeConfig = {};
      scriptFormat = scriptData.script_format || "interview";
      bgmInfo = {};
      overallStyle = scriptData.overall_style || "photorealistic";
      consistencyInfo = {};
    } else {
      throw new Error(`Unknown input format. Keys: ${Object.keys(scriptData).join(", ")}`);
    }

    $.export("input_info", {
      folder_name: folderName,
      segments_count: scriptSegments.length,
      characters_count: Object.keys(characters).length,
      content_type: contentType,
      script_format: scriptFormat,
      input_source: isFromScriptGenerator ? "script_generator" : "image_generator",
    });

    if (!scriptSegments.length) {
      throw new Error(`No script segments found. Keys: ${Object.keys(scriptData).join(", ")}`);
    }

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
    // 3. 스타일 설정
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

    // =====================
    // 4. 콘텐츠 타입별 무드 설정
    // =====================
    const contentTypeMood = {
      satire: { mood: "dramatic, news-like, satirical", lighting: "studio interview lighting, professional" },
      comic: { mood: "funny, exaggerated expressions, comedic", lighting: "bright playful lighting" },
      emotional: { mood: "warm, touching, emotional", lighting: "soft golden hour lighting, cinematic" },
      daily: { mood: "cozy, casual, everyday life", lighting: "natural daylight, comfortable" },
      mukbang: { mood: "appetizing, happy eating, delicious", lighting: "food photography lighting, appetizing" },
      healing: { mood: "peaceful, calm, relaxing", lighting: "soft warm ambient lighting, dreamy" },
      drama: { mood: "dramatic, story-driven, cinematic", lighting: "cinematic dramatic lighting" },
      performance: {
        mood: "energetic, confident, performer vibe, stage presence, cool swagger",
        lighting: "concert stage lighting, spotlight, colorful dynamic lights, neon glow",
      },
      random: { mood: "varied, natural", lighting: "natural lighting" },
    };
    const currentMood = contentTypeMood[contentType] || contentTypeMood.satire;

    // =====================
    // 5. 퍼포먼스 씬 타입별 이미지 프롬프트 + 악세서리
    // =====================
    const performanceImagePrompts = {
      beatbox: {
        start: "doing beatbox, mouth rhythmically opening, cool confident expression, stage lighting with neon lights, energetic pose",
        break: "pausing beatbox, looking at camera with confident smirk, dramatic stage lighting, about to say something",
        resume: "continuing beatbox performance, mouth moving to beat, head bobbing, body grooving, colorful stage lights",
        accessories: "wearing cool black sunglasses, gold chain necklace, backwards snapback cap",
      },
      singing: {
        start: "singing into microphone, emotional expression, spotlight shining, eyes slightly closed feeling the music",
        break: "pausing singing, looking at camera with passionate expression, microphone in paw, dramatic spotlight",
        resume: "singing with emotion, swaying gently, eyes closed feeling the music, soft spotlight",
        accessories: "holding wireless microphone, wearing sparkly stage outfit, small earpiece",
      },
      dance: {
        start: "dancing energetically, dynamic pose, disco lights, paws in the air",
        break: "freeze pose in dance, looking at camera with excited expression, colorful disco lights",
        resume: "dancing with full energy, spinning move, rainbow stage lights, happy expression",
        accessories: "wearing trendy sunglasses, colorful LED sneakers, sporty headband",
      },
      rap: {
        start: "rapping with swagger, hand gestures, hip-hop style, cool pose with mic",
        break: "pausing rap, confident pose, looking at camera with swag, hip-hop style lighting",
        resume: "continuing rap performance, hand gestures, head nodding to beat, cool expression",
        accessories: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, holding microphone",
      },
      hiphop: {
        start: "hip-hop style performance, swagger pose, head nodding to beat, cool confident expression",
        break: "pausing performance, confident pose, looking at camera with swag, dramatic lighting",
        resume: "continuing hip-hop performance, body grooving, head nodding, cool expression",
        accessories: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, baggy clothes",
      },
      instrument: {
        start: "playing instrument passionately, focused expression, stage lighting",
        break: "pausing performance, looking at camera proudly, instrument visible, dramatic lighting",
        resume: "playing instrument with passion, body moving with melody, spotlight",
        accessories: "wearing round stylish glasses, bow tie, formal vest",
      },
      kpop: {
        start: "K-pop dance performance, synchronized move, polished expression, colorful stage lights",
        break: "freeze pose, looking at camera with idol smile, camera ready pose",
        resume: "continuing K-pop performance, dynamic choreography, energetic expression",
        accessories: "wearing stylish outfit, small accessories, polished look, idol-style fashion",
      },
    };

    // =====================
    // 5-1. 일관된 배경 설정 (script-generator의 consistency 정보 우선 사용)
    // =====================
    // ★★★ script-generator에서 전달된 일관성 정보 사용 ★★★
    const consistentBackground = consistencyInfo.consistent_background
      || scriptSegments[0]?.scene_details?.background
      || "clean professional studio background with soft gradient";

    const consistentLighting = consistencyInfo.consistent_lighting
      || scriptSegments[0]?.scene_details?.lighting
      || currentMood.lighting;

    // 퍼포먼스용 일관된 스테이지 배경
    const performanceStageBackground = consistencyInfo.performance_stage_background
      || "dark concert stage with purple and blue neon lights, colorful spotlights from above, subtle smoke effects at the bottom";

    // 주인공 캐릭터 프롬프트 (script-generator에서 분석된 것 사용)
    const mainCharacter = characters.main || {};
    const mainPrompt = consistencyInfo.main_character_prompt
      || mainCharacter.image_prompt
      || "cute adorable puppy";

    // 실제 강아지 강조 문구
    const realDogEmphasis = consistencyInfo.real_dog_emphasis
      || "Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. NOT a stuffed animal. NOT a person in dog mask. Real fur. Real animal.";

    // 텍스트 제거 문구
    const noTextEmphasis = consistencyInfo.no_text_emphasis
      || "No text anywhere. No signs. No banners. No posters. No letters. No words. No writing. No Korean text. No watermarks. Clean background without any text elements.";

    // =====================
    // 5-2. 퍼포먼스 타입 전역 감지 (script-generator의 consistency 정보 우선 사용)
    // =====================
    // ★★★ script-generator에서 전달된 퍼포먼스 정보 사용 ★★★
    const hasPerformanceScenes = consistencyInfo.has_performance
      || scriptSegments.some(seg =>
        ["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)
      );

    // 전역 퍼포먼스 타입
    const globalPerformanceType = consistencyInfo.performance_type
      || scriptSegments.find(seg => seg.performance_type)?.performance_type
      || bgmInfo.primary_performance_type
      || "beatbox";

    // ★★★ 퍼포먼스 악세서리 (script-generator에서 전달된 것 사용) ★★★
    const globalPerformanceAccessories = consistencyInfo.performance_accessories
      || (hasPerformanceScenes
        ? (performanceImagePrompts[globalPerformanceType]?.accessories || performanceImagePrompts.beatbox.accessories)
        : "");

    $.export("consistency_used", {
      background: consistentBackground,
      lighting: consistentLighting,
      main_prompt: mainPrompt,
      has_performance: hasPerformanceScenes,
      performance_type: globalPerformanceType,
      accessories: globalPerformanceAccessories,
    });

    // =====================
    // 6. 씬별 이미지 생성
    // =====================
    $.export("status", `Generating ${scriptSegments.length} images...`);

    const imagePromises = scriptSegments.map(async (seg, idx) => {
      const speaker = seg.speaker || "main";
      const mainCharacter = characters.main || {};
      const speakerCharacter = characters[speaker] || {};
      const isInterviewQuestion = seg.scene_type === "interview_question";
      const isInterviewerSpeaking = isInterviewQuestion && speaker === "interviewer";

      // ★★★ 화면에 등장하는 캐릭터 결정 (수정됨) ★★★
      // 1. interviewer가 질문 (speaker=interviewer) → 다음 씬의 응답자(interviewee) 표시
      // 2. main이 직접 질문 (speaker=main) → main 캐릭터 표시
      // 3. sub1, sub2, sub3 씬 → 해당 캐릭터 이미지가 있으면 그 캐릭터 사용
      // 4. 조연 이미지가 없으면 → 주인공 사용 (기존 동작)

      let visualCharacterKey = speaker;

      if (isInterviewerSpeaking) {
        // 인터뷰어가 질문할 때: 다음 씬의 응답자(interviewee) 찾기
        const nextSeg = scriptSegments[idx + 1];
        if (nextSeg && nextSeg.scene_type === "interview_answer") {
          visualCharacterKey = nextSeg.speaker || "main";
        } else {
          // characters_in_scene에서 찾기 (등록된 캐릭터 중 interviewer가 아닌 것)
          const charsInScene = seg.scene_details?.characters_in_scene || [];
          // ★★★ 동적으로 등록된 캐릭터 이름 가져오기 (interviewer 제외) ★★★
          const registeredCharNames = Object.values(characters)
            .filter(c => c.role !== "interviewer")
            .map(c => c.name);
          const visibleChar = charsInScene.find(charName => registeredCharNames.includes(charName));
          if (visibleChar) {
            const foundKey = Object.entries(characters).find(([k, v]) => v.name === visibleChar)?.[0];
            if (foundKey) visualCharacterKey = foundKey;
          }
        }
      }

      const visualCharacter = characters[visualCharacterKey] || mainCharacter;
      const hasSubCharacterImage = visualCharacterKey.startsWith("sub") && visualCharacter.image_url;

      // ★★★ 실제 이미지 프롬프트 결정 ★★★
      // 화면에 보이는 캐릭터의 분석된 프롬프트 사용
      const visualPrompt = hasSubCharacterImage
        ? (visualCharacter.image_prompt || seg.image_prompt || mainPrompt)
        : (visualCharacter.image_prompt || mainPrompt);

      // 퍼포먼스 씬 감지
      const isPerformanceStart = seg.scene_type === "performance_start";
      const isPerformanceBreak = seg.scene_type === "performance_break";
      const isPerformanceResume = seg.scene_type === "performance_resume";
      const isAnyPerformance = isPerformanceStart || isPerformanceBreak || isPerformanceResume;

      // 퍼포먼스 타입
      const performanceType = seg.performance_type || bgmInfo.primary_performance_type || "beatbox";
      const performancePhase = isPerformanceStart ? "start" : isPerformanceBreak ? "break" : isPerformanceResume ? "resume" : null;

      // 씬 환경 정보 (★★★ 일관된 배경 사용 ★★★)
      const sceneDetails = seg.scene_details || {};
      const sceneMood = sceneDetails.mood || currentMood.mood;

      // ★★★ 캐릭터 외형 정보 - 조연 이미지 있으면 조연 사용, 없으면 주인공 ★★★
      const characterAppearance = {
        base: visualPrompt,
        outfit: visualCharacter.clothing || "",
        accessories: visualCharacter.accessories || [],
        fur_color: visualCharacter.fur_color || "",
        // 조연인지 주인공인지 구분
        isSubCharacter: hasSubCharacterImage,
        characterType: visualCharacter.character_type || "animal",
      };

      // 이미지 프롬프트 생성
      const generateImagePrompt = () => {
        let prompt = characterAppearance.base;

        // ★★★ 조연 캐릭터인 경우 seg.image_prompt 그대로 사용 가능 ★★★
        const isSubCharacter = characterAppearance.isSubCharacter;
        const isAnimal = characterAppearance.characterType === "animal";

        // ★★★ 퍼포먼스 악세서리는 주인공(동물)에게만 적용 ★★★
        if (hasPerformanceScenes && globalPerformanceAccessories && !isSubCharacter) {
          prompt += `, ${globalPerformanceAccessories}`;
        }

        // 퍼포먼스 씬일 때 특별 프롬프트 (주인공만)
        if (isAnyPerformance && performancePhase && !isSubCharacter) {
          const perfPrompts = performanceImagePrompts[globalPerformanceType] || performanceImagePrompts.beatbox;
          const perfPrompt = perfPrompts[performancePhase] || perfPrompts.start;

          prompt += `, ${perfPrompt}`;
          prompt += `. ${performanceStageBackground}`;
        } else if (isInterviewerSpeaking) {
          // 인터뷰어가 질문: interviewee 캐릭터가 듣는 표정
          if (characterAppearance.outfit && !hasPerformanceScenes) {
            prompt += `, wearing ${characterAppearance.outfit}`;
          }
          if (characterAppearance.accessories?.length > 0 && !hasPerformanceScenes) {
            prompt += `, with ${characterAppearance.accessories.join(", ")}`;
          }
          prompt += `, curious listening expression, head slightly tilted, ears perked up, attentive`;
          if (hasPerformanceScenes) {
            prompt += `. ${performanceStageBackground}`;
          } else {
            prompt += `. ${consistentBackground}`;
            prompt += `. ${consistentLighting}`;
          }
        } else if (hasSubCharacterImage) {
          // ★★★ 조연 캐릭터가 말하는 씬: seg.image_prompt 활용 ★★★
          // 조연의 의상/악세서리 추가
          if (characterAppearance.outfit) {
            prompt += `, wearing ${characterAppearance.outfit}`;
          }
          if (characterAppearance.accessories?.length > 0) {
            prompt += `, with ${characterAppearance.accessories.join(", ")}`;
          }
          const emotion = seg.emotion || "happy";
          prompt += `. ${emotion} expression`;
          // 배경은 seg.scene_details에서 가져오거나 일관된 배경 사용
          const segBackground = seg.scene_details?.background || consistentBackground;
          prompt += `. ${segBackground}`;
          prompt += `. ${consistentLighting}`;
        } else {
          // 일반 씬 (주인공, 비퍼포먼스)
          if (characterAppearance.outfit && !hasPerformanceScenes) {
            prompt += `, wearing ${characterAppearance.outfit}`;
          }
          if (characterAppearance.accessories?.length > 0 && !hasPerformanceScenes) {
            prompt += `, with ${characterAppearance.accessories.join(", ")}`;
          }
          const emotion = seg.emotion || "happy";
          prompt += `. ${emotion} expression`;
          if (hasPerformanceScenes) {
            prompt += `. ${performanceStageBackground}`;
          } else {
            prompt += `. ${consistentBackground}`;
            prompt += `. ${consistentLighting}`;
          }
        }

        // 무드 추가
        prompt += `. ${sceneMood}`;

        // 품질 설정
        prompt += `. ${stylePrefix}, ${styleSuffix}`;

        // ★★★ 캐릭터 타입에 따른 강조 문구 ★★★
        if (isAnimal) {
          // 동물 캐릭터: 실제 동물 강조
          prompt += `. ${realDogEmphasis}`;
        } else {
          // 사람 캐릭터: 실제 사람 강조
          prompt += `. Real person. Natural human appearance. NOT a cartoon. NOT an illustration. Realistic human.`;
        }

        // ★★★ 텍스트 완전 제거 (한글 깨짐 방지) ★★★
        prompt += `. ${noTextEmphasis}. Single character alone.`;

        return prompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
      };

      const finalPrompt = generateImagePrompt();

      // 이미지 생성 함수
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
          $.export(`error_scene_${idx + 1}`, e.response?.data?.error?.message || e.message);
          return null;
        }
      };

      // 이미지 생성 시도
      let base64 = await generateImage(finalPrompt);

      // 실패 시 간단한 프롬프트로 재시도
      if (!base64) {
        // ★★★ 조연/주인공에 따라 다른 fallback 프롬프트 ★★★
        const isSubCharacter = characterAppearance.isSubCharacter;
        const isAnimal = characterAppearance.characterType === "animal";
        const fallbackBase = isSubCharacter ? visualPrompt : mainPrompt;
        const fallbackAccessories = (isAnyPerformance && globalPerformanceAccessories && !isSubCharacter)
          ? `, ${globalPerformanceAccessories}`
          : "";
        const characterEmphasis = isAnimal
          ? realDogEmphasis
          : "Real person. Natural human appearance. Realistic human.";
        const fallbackPrompt = `${fallbackBase}${fallbackAccessories}, ${seg.emotion || "happy"} expression, clean simple background, ${stylePrefix}, ${styleSuffix}. ${characterEmphasis}. ${noTextEmphasis}`;
        base64 = await generateImage(fallbackPrompt);
        if (base64) {
          $.export(`fallback_scene_${idx + 1}`, `Used simplified fallback prompt for ${isSubCharacter ? "sub character" : "main character"}`);
        }
      }

      if (base64) {
        return {
          success: true,
          index: idx + 1,
          segment_number: seg.segment_number || idx + 1,
          start_time: seg.start_time || 0,
          end_time: seg.end_time || 0,
          duration: seg.duration,
          base64: base64,
          prompt: finalPrompt,
          narration: seg.narration || "",
          narration_english: seg.narration_english || "",
          speaker: speaker,
          character_name: seg.character_name,
          voice_type: seg.voice_type,
          scene_type: seg.scene_type,
          emotion: seg.emotion,
          has_narration: seg.has_narration,
          is_interview_question: isInterviewQuestion,
          is_performance: isAnyPerformance,
          performance_type: isAnyPerformance ? performanceType : null,
          performance_phase: performancePhase,
          audio_details: seg.audio_details,
          scene_details: sceneDetails,
        };
      }

      return { success: false, index: idx + 1, error: "Image generation failed" };
    });

    const results = await Promise.all(imagePromises);
    const successResults = results.filter(r => r.success).sort((a, b) => a.index - b.index);
    const failedResults = results.filter(r => !r.success);

    $.export("generated", successResults.length);
    if (failedResults.length) {
      $.export("failed", failedResults.map(f => ({ index: f.index, error: f.error })));
    }

    // =====================
    // 7. GCS 업로드
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

      // base64 제거하고 URL 추가
      const { base64, ...rest } = img;
      return {
        ...rest,
        filename,
        url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`,
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    uploadedFiles.sort((a, b) => a.index - b.index);

    // =====================
    // 8. 결과 반환
    // =====================
    const totalDuration = uploadedFiles.reduce((sum, s) => sum + (s.duration || 0), 0);

    $.export("$summary", `Generated ${uploadedFiles.length} images (${this.imagen_model}), ${totalDuration}s total`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      imagen_model: this.imagen_model,
      total_scenes: uploadedFiles.length,
      total_duration_seconds: totalDuration,

      // 콘텐츠 타입 정보
      content_type: contentType,
      content_type_config: contentTypeConfig,
      script_format: scriptFormat,

      // 캐릭터 정보
      characters: characters,

      // BGM 정보 (퍼포먼스용)
      bgm: bgmInfo,

      // 씬별 이미지 정보
      scenes: uploadedFiles,

      // 원본 스크립트 참조
      script_reference: {
        title: scriptData.title,
        topic: scriptData.topic_info?.topic,
      },
    };
  },
});
