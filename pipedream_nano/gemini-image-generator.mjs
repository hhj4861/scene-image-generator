import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Gemini Image Generator",
  description: "Generate scene images using Gemini API (Imagen models) - No Vertex AI required",

  props: {
    // Script Generator 출력 (통합 입력)
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "Script Generator의 전체 출력. 사용: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
    },

    // Gemini API 설정
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google AI Studio API Key",
      secret: true,
    },

    // 모델 설정
    gemini_model: {
      type: "string",
      label: "Gemini Model (분석용)",
      options: [
        { label: "Gemini 3 Pro Preview (최신, 권장)", value: "gemini-3-pro-preview" },
        { label: "Gemini 2.5 Pro Preview", value: "gemini-2.5-pro-preview-05-06" },
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash-exp" },
        { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
      ],
      default: "gemini-3-pro-preview",
    },
    imagen_model: {
      type: "string",
      label: "Imagen Model (이미지 생성)",
      options: [
        { label: "Imagen 4 Ultra (최고 품질)", value: "imagen-4.0-ultra-generate-001" },
        { label: "Imagen 4 Standard", value: "imagen-4.0-generate-001" },
        { label: "Imagen 4 Fast (빠른 생성)", value: "imagen-4.0-fast-generate-001" },
      ],
      default: "imagen-4.0-generate-001",
    },

    // Google Cloud 연결 (GCS 업로드용)
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },

    // 설정
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts/Vertical)", value: "9:16" },
        { label: "16:9 (Landscape)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
        { label: "4:3 (Standard)", value: "4:3" },
        { label: "3:4 (Portrait)", value: "3:4" },
      ],
      default: "9:16",
    },
    // image_style: {
    //   type: "string",
    //   label: "Image Style",
    //   description: "Visual style for generated images",
    //   options: [
    //     { label: "Anime (アニメ)", value: "anime" },
    //     { label: "Photorealistic (실사)", value: "photorealistic" },
    //     { label: "Digital Art (디지털 아트)", value: "digital_art" },
    //     { label: "Watercolor (수채화)", value: "watercolor" },
    //     { label: "3D Render (3D 렌더링)", value: "3d_render" },
    //     { label: "Oil Painting (유화)", value: "oil_painting" },
    //     { label: "Cinematic (시네마틱)", value: "cinematic" },
    //   ],
    //   default: "anime",
    // },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name (from Script Generator). Leave empty to auto-generate.",
      optional: true,
    },

    // 캐릭터 참조 이미지 설정 (Script Generator에서 자동으로 전달받거나, 여기서 직접 입력)
    character_reference_url: {
      type: "string",
      label: "Character Reference Image URL (Override)",
      description: "등장인물 참조 이미지 URL. Script Generator에서 입력한 경우 자동으로 사용되며, 여기서 입력하면 덮어씁니다.",
      optional: true,
    },
    character_description: {
      type: "string",
      label: "Character Description (Override)",
      description: "참조 이미지의 캐릭터 설명. Script Generator에서 분석한 경우 자동으로 사용됩니다.",
      optional: true,
    },
    character_consistency_strength: {
      type: "string",
      label: "Character Consistency Strength",
      description: "캐릭터 일관성 강도",
      options: [
        { label: "Low (자유로운 변형)", value: "low" },
        { label: "Medium (균형)", value: "medium" },
        { label: "High (강한 일관성)", value: "high" },
      ],
      default: "high",
      optional: true,
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 0. Script Generator 출력 파싱
    // =====================
    const scriptOutput = typeof this.script_generator_output === 'string'
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    // scenes와 script_text 추출
    const scenes = scriptOutput.pipeline_data?.image_generation?.scenes || [];
    const scriptText = scriptOutput.script_text || scriptOutput.script?.full_script || "";
    const folderNameFromScript = scriptOutput.folder_name;

    // ★ 총 영상 길이 추출
    const totalDuration = scriptOutput.pipeline_data?.total_duration_seconds ||
                         scriptOutput.total_duration_seconds ||
                         scriptOutput.duration_info?.final_duration ||
                         40;

    // ★ Script Generator의 image_style_guide 전체 추출
    const imageStyleGuideRaw = scriptOutput.image_style_guide; //steps.Shorts_Script_Generator.$return_value.image_style_guide.character

    // 샘플 영상 분석 결과 (image_style_guide 내부에 있음)
    const sampleStyleGuideRaw = imageStyleGuideRaw;

    // ★ Script Generator에서 전달된 캐릭터 정보 추출 (image_style_guide.character 우선)
    const imageStyleGuideCharacter = imageStyleGuideRaw?.character || {};
    const scriptCharacterInfo = {
      // 캐릭터 이미지 URL (원본 참조용)
      imageUrl: imageStyleGuideCharacter.reference_image_url ||
                scriptOutput.input?.character_image_url ||
                scriptOutput.character_info?.reference_image_url ||
                null,
      // 캐릭터 이름
      name: imageStyleGuideCharacter.name ||
            scriptOutput.character_info?.name ||
            scriptOutput.script?.character?.name ||
            null,
      // 캐릭터 설명 (이미지 생성 프롬프트용) - 가장 중요!
      description: imageStyleGuideCharacter.prompt ||
                   imageStyleGuideCharacter.image_generation_prompt ||
                   scriptOutput.character_info?.image_generation_prompt ||
                   scriptOutput.pipeline_data?.image_generation?.character_prompt ||
                   scriptOutput.script?.character?.appearance_prompt ||
                   null,
      // 분석된 외형 정보
      appearance: imageStyleGuideCharacter.appearance ||
                  scriptOutput.character_info?.appearance ||
                  null,
      // 스타일 키워드
      styleKeywords: imageStyleGuideCharacter.style_keywords ||
                     scriptOutput.character_info?.style_keywords ||
                     [],
      // AI가 생성한 캐릭터 정보
      generated: imageStyleGuideCharacter.generated ||
                 scriptOutput.script?.character ||
                 null,
    };

    $.export("input_parsed", {
      scenes_count: scenes.length,
      script_length: scriptText.length,
      folder_name: folderNameFromScript,
      total_duration: totalDuration,
      has_style_guide: !!sampleStyleGuideRaw,
      has_character_image: !!scriptCharacterInfo.imageUrl,
      has_character_description: !!scriptCharacterInfo.description,
      character_name: scriptCharacterInfo.name,
      character_description_preview: scriptCharacterInfo.description?.substring(0, 100) || null,
    });

    // scenes 검증
    if (!scenes || scenes.length === 0) {
      throw new Error("No scenes found in Script Generator output. Check pipeline_data.image_generation.scenes");
    }

    // =====================
    // 1. 캐릭터 참조 이미지 로드 (Script Generator 우선, props로 override 가능)
    // =====================
    let characterReferenceBase64 = null;
    // 캐릭터 설명: props > Script Generator 분석 결과
    let characterReferenceDescription = this.character_description ||
                                        scriptCharacterInfo.description ||
                                        "";
    // 캐릭터 이미지 URL: props > Script Generator에서 전달된 URL
    const effectiveCharacterUrl = this.character_reference_url || scriptCharacterInfo.imageUrl;

    // 캐릭터 이름 (프롬프트에 사용)
    const characterName = scriptCharacterInfo.name || "";

    if (effectiveCharacterUrl) {
      try {
        $.export("status", `Loading character reference image from ${this.character_reference_url ? 'props (override)' : 'Script Generator'}...`);
        $.export("character_source", {
          url: effectiveCharacterUrl,
          source: this.character_reference_url ? "props_override" : "script_generator",
          name: characterName || "N/A",
          has_pre_analyzed_description: !!scriptCharacterInfo.description,
        });

        // 이미지 다운로드
        const imageResponse = await axios($, {
          method: "GET",
          url: effectiveCharacterUrl,
          responseType: "arraybuffer",
        });

        characterReferenceBase64 = Buffer.from(imageResponse).toString("base64");

        // Gemini Vision으로 캐릭터 분석 (설명이 없는 경우에만)
        // Script Generator에서 이미 분석된 경우 스킵 (효율성)
        if (!characterReferenceDescription) {
          $.export("character_analysis_status", "No pre-analyzed description, analyzing with Gemini Vision...");
          const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.gemini_model}:generateContent`;

          const visionResponse = await axios($, {
            url: GEMINI_API_URL,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.gemini_api_key,
            },
            data: {
              contents: [{
                parts: [
                  {
                    text: `Analyze this image and provide a detailed description of the main character/subject for consistent image generation.

Return a JSON object:
{
  "character_type": "human/animal/creature/object",
  "description": "detailed physical description (species, colors, features, clothing, accessories)",
  "key_features": ["distinctive feature 1", "distinctive feature 2"],
  "style_keywords": ["art style keywords for consistent generation"]
}

Return ONLY valid JSON, no markdown.`
                  },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: characterReferenceBase64
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
              },
            },
          });

          let analysisContent = visionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (analysisContent) {
            if (analysisContent.startsWith("```json")) {
              analysisContent = analysisContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (analysisContent.startsWith("```")) {
              analysisContent = analysisContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }
            const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const charAnalysis = JSON.parse(jsonMatch[0]);
              characterReferenceDescription = `${charAnalysis.description}, ${charAnalysis.key_features?.join(", ") || ""}`;
              $.export("character_analysis", charAnalysis);
            }
          }
        } else {
          // Script Generator에서 이미 분석된 경우
          $.export("character_analysis_status", "Using pre-analyzed description from Script Generator (skipped Gemini Vision)");
        }

        $.export("character_reference_loaded", {
          url: effectiveCharacterUrl,
          source: this.character_reference_url ? "props_override" : "script_generator",
          name: characterName || "N/A",
          description: characterReferenceDescription.substring(0, 100) + "...",
          consistency_strength: this.character_consistency_strength || "high",
        });
      } catch (e) {
        $.export("character_reference_error", e.message);
        characterReferenceBase64 = null;
      }
    } else {
      $.export("character_reference_status", "No character reference image provided (neither from Script Generator nor props)");
    }

    // =====================
    // 2. 샘플 영상 기반 스타일 가이드 파싱
    // =====================
    let sampleStyleGuide = null;
    if (sampleStyleGuideRaw) {
      try {
        sampleStyleGuide = typeof sampleStyleGuideRaw === 'string'
          ? JSON.parse(sampleStyleGuideRaw)
          : sampleStyleGuideRaw;
        $.export("sample_style_loaded", true);
        $.export("sample_style_summary", {
          image_style: sampleStyleGuide.image_style,
          character_type: sampleStyleGuide.character_type,
          mood: sampleStyleGuide.mood,
          reference_video: sampleStyleGuide.reference_video?.title,
        });
      } catch (e) {
        $.export("sample_style_parse_error", e.message);
        sampleStyleGuide = null;
      }
    }

    // =====================
    // 2. 스타일 매핑
    // =====================
    const styleMap = {
      anime: {
        name: "anime japanese animation",
        prefix: "anime style, japanese animation, high quality anime art, detailed anime illustration",
        suffix: "anime aesthetic, vibrant colors, clean lines, studio ghibli inspired",
      },
      photorealistic: {
        name: "photorealistic cinematic",
        prefix: "photorealistic, ultra realistic, 8k uhd, high detail photograph, cinematic lighting",
        suffix: "professional photography, realistic skin texture, natural lighting, DSLR quality",
      },
      digital_art: {
        name: "digital illustration",
        prefix: "digital art, digital illustration, artstation trending, concept art",
        suffix: "highly detailed, vibrant digital painting, professional digital artwork",
      },
      watercolor: {
        name: "watercolor soft painting",
        prefix: "watercolor painting, soft watercolor art, delicate brush strokes",
        suffix: "watercolor texture, soft edges, pastel colors, traditional art style",
      },
      "3d_render": {
        name: "3D rendered pixar style",
        prefix: "3D render, pixar style, octane render, high quality 3D art",
        suffix: "smooth 3D animation style, disney pixar aesthetic, CGI quality",
      },
      oil_painting: {
        name: "oil painting classical",
        prefix: "oil painting, classical art style, renaissance inspired, masterpiece painting",
        suffix: "rich oil colors, brush texture, museum quality art, fine art painting",
      },
      cinematic: {
        name: "cinematic film still",
        prefix: "cinematic shot, movie still, film photography, dramatic lighting",
        suffix: "anamorphic lens, cinematic color grading, blockbuster movie quality, 35mm film",
      },
    };

    // 샘플 스타일 가이드가 있으면 해당 스타일로 매핑
    // 기본 스타일: 3d_render (image_style prop이 없으므로)
    let effectiveStyleKey = "3d_render";
    if (sampleStyleGuide?.image_style) {
      // 샘플 분석 결과에서 스타일 매핑
      const sampleStyle = sampleStyleGuide.image_style.toLowerCase();
      if (sampleStyle.includes('3d') || sampleStyle.includes('render') || sampleStyle.includes('pixar')) {
        effectiveStyleKey = '3d_render';
      } else if (sampleStyle.includes('anime') || sampleStyle.includes('アニメ')) {
        effectiveStyleKey = 'anime';
      } else if (sampleStyle.includes('photo') || sampleStyle.includes('realistic')) {
        effectiveStyleKey = 'photorealistic';
      } else if (sampleStyle.includes('digital')) {
        effectiveStyleKey = 'digital_art';
      } else if (sampleStyle.includes('cinematic')) {
        effectiveStyleKey = 'cinematic';
      }
    }

    const selectedStyle = styleMap[effectiveStyleKey] || styleMap.anime;
    $.export("selected_style", effectiveStyleKey);
    $.export("style_source", sampleStyleGuide ? "sample_analysis" : "user_selection");
    $.export("status", "Analyzing script with Gemini API...");

    // 샘플 스타일 가이드에서 **스타일 정보만** 추출 (캐릭터/소품 제외!)
    // ★ 중요: 샘플 영상의 캐릭터/소품 정보를 포함하면 스크립트 스토리와 충돌함
    let sampleStylePrefix = "";
    if (sampleStyleGuide) {
      const styleParts = [];
      // ✅ 스타일/분위기만 포함
      if (sampleStyleGuide.image_style) styleParts.push(sampleStyleGuide.image_style);
      if (sampleStyleGuide.mood) styleParts.push(`${sampleStyleGuide.mood} mood`);
      if (sampleStyleGuide.color_palette) styleParts.push(`${sampleStyleGuide.color_palette} color palette`);
      if (sampleStyleGuide.lighting) styleParts.push(`${sampleStyleGuide.lighting} lighting`);
      // quality_keywords만 포함 (렌더링 품질)
      if (sampleStyleGuide.quality_keywords && Array.isArray(sampleStyleGuide.quality_keywords)) {
        styleParts.push(sampleStyleGuide.quality_keywords.slice(0, 3).join(", "));
      }
      sampleStylePrefix = styleParts.join(", ");

      // ❌ 제외 항목 (스크립트 스토리와 충돌 방지):
      // - character_type (샘플 영상의 캐릭터)
      // - character_features (샘플 영상 캐릭터의 복장/액세서리)
      // - character_style (anthropomorphized 등)
      // - background/background_description (샘플 영상의 배경)
      // - special_elements/props (샘플 영상의 소품)

      $.export("sample_style_used", {
        included: styleParts,
        excluded: ["character_type", "character_features", "character_style", "background", "props"],
        reason: "Prevent conflict with script story"
      });
    }

    // =====================
    // 2. Gemini API로 스타일 가이드 생성
    // =====================
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.gemini_model}:generateContent`;

    // 샘플 스타일 가이드가 있을 때 헬퍼 함수들
    // Script Generator 출력 구조에 맞게 필드명 처리
    const getCharacterFeatures = () => {
      if (!sampleStyleGuide?.character_features) return 'Not specified';
      return Array.isArray(sampleStyleGuide.character_features)
        ? sampleStyleGuide.character_features.join(", ")
        : sampleStyleGuide.character_features;
    };
    const getBackground = () => {
      return sampleStyleGuide?.background_description ||
             sampleStyleGuide?.background ||
             (sampleStyleGuide?.background_type ? `${sampleStyleGuide.background_type} setting` : 'Not specified');
    };
    const getProps = () => {
      if (sampleStyleGuide?.special_elements) {
        return Array.isArray(sampleStyleGuide.special_elements)
          ? sampleStyleGuide.special_elements.join(", ")
          : sampleStyleGuide.special_elements;
      }
      return sampleStyleGuide?.props || 'Not specified';
    };

    let styleGuide;
    let consistencyPrefix;

    // =====================
    // Script Generator에서 스타일/캐릭터 정보가 있으면 Gemini 호출 스킵
    // =====================
    // 캐릭터 정보가 있거나 샘플 스타일 정보가 있으면 스킵
    const hasCharacterInfo = scriptCharacterInfo.description || characterReferenceDescription;
    const hasSampleStyle = sampleStyleGuide && sampleStylePrefix;

    if (hasCharacterInfo || hasSampleStyle) {
      $.export("gemini_analysis_skipped", `Using pre-analyzed info from Script Generator (character: ${!!hasCharacterInfo}, sample_style: ${!!hasSampleStyle})`);

      // ★ 캐릭터 정보 우선 사용 (image_style_guide.character에서)
      // 캐릭터 설명: Script Generator에서 분석한 캐릭터만 사용 (샘플 영상 캐릭터 제외!)
      // ❌ sampleStyleGuide의 character_type은 사용하지 않음 (스토리 충돌 방지)
      const mainCharacterDescription = scriptCharacterInfo.description ||
                                       characterReferenceDescription ||
                                       "main character";

      // Script Generator에서 이미 분석된 스타일 정보 직접 사용
      // ❌ environment에 샘플 영상 배경 사용하지 않음 (스토리 충돌 방지)
      styleGuide = {
        main_character: mainCharacterDescription,
        environment: "natural setting",  // 각 씬의 scene_description에서 배경 정보 사용
        color_palette: sampleStyleGuide?.color_palette || "natural colors",
        lighting: sampleStyleGuide?.lighting || "soft lighting",
        title: sampleStyleGuide?.reference_video?.title?.substring(0, 30) || "scene_images",
        // scenes 입력에서 직접 enhanced_prompts 생성
        enhanced_prompts: scenes.map((s, i) => ({
          scene_index: i,
          enhanced: s.image_prompt || s.prompt || s.scene_description || `Scene ${i + 1}`,
          camera_angle: "eye level",
          motion_hint: "subtle movement"
        }))
      };

      // ★ 일관성 프리픽스: 캐릭터 정보를 최우선으로
      const characterPrefix = mainCharacterDescription || "";
      const stylePrefix = sampleStylePrefix || "";
      consistencyPrefix = [characterPrefix, stylePrefix].filter(Boolean).join(", ");
      $.export("consistency_source", `script_generator (character: ${!!hasCharacterInfo}, sample_style: ${!!hasSampleStyle})`);

    } else {
      // =====================
      // 샘플 스타일 가이드가 없으면 Gemini로 스타일 분석
      // =====================
      $.export("status", "No sample style guide - analyzing with Gemini API...");

      const geminiResponse = await axios($, {
        method: "POST",
        url: GEMINI_API_URL,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.gemini_api_key,
        },
        data: {
          contents: [
            {
              parts: [
                {
                  text: `You are an expert visual director creating a seamless video sequence. Your goal is to create images that will be converted to video clips and connected smoothly.

## SCRIPT/NARRATION:
${scriptText}

## SCENE TIMING:
${scenes.map((s, i) => `Scene ${i + 1} (${s.start}s-${s.end}s): ${s.image_prompt || s.prompt}`).join('\n')}

## REQUIRED STYLE: "${selectedStyle.name}"
Style Prefix: "${selectedStyle.prefix}"
Style Suffix: "${selectedStyle.suffix}"

## CRITICAL REQUIREMENTS FOR VIDEO CONTINUITY:
1. **SAME CHARACTER(S)**: Define ONE main character/subject that appears in ALL scenes with EXACT same appearance
   - Same hair color, style, length
   - Same clothing/outfit throughout
   - Same body proportions and features
   - Same accessories if any

2. **CONSISTENT ENVIRONMENT**:
   - Same background setting or natural progression of same location
   - Same time of day/lighting conditions
   - Same weather/atmosphere

3. **COLOR PALETTE**: Use IDENTICAL color scheme across all scenes
   - Define 3-4 main colors that appear in every image
   - Keep saturation and brightness consistent

4. **COMPOSITION FOR SMOOTH TRANSITIONS**:
   - Each scene should flow naturally to the next
   - Consider camera angle progression (zoom in/out, pan)
   - Subject position should allow smooth morphing between frames

5. **MOTION HINTS**: Include subtle motion cues in descriptions
   - "character turning slightly left"
   - "wind blowing hair gently"
   - "walking forward"

Output JSON only, no markdown code blocks:
{
  "main_character": "DETAILED description of main character that MUST be included in every prompt",
  "environment": "Consistent environment/setting description",
  "color_palette": "Exact colors used: primary, secondary, accent",
  "lighting": "Consistent lighting description",
  "title": "short_title",
  "enhanced_prompts": [
    {
      "scene_index": 0,
      "enhanced": "Full prompt including character, environment, action",
      "camera_angle": "eye level / low angle / etc",
      "motion_hint": "subtle movement for video"
    }
  ]
}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        },
      });

      try {
        let content = geminiResponse.candidates[0].content.parts[0].text.trim();
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        styleGuide = JSON.parse(content);
      } catch (e) {
        $.export("parse_error", e.message);
        styleGuide = {
          main_character: "detailed character",
          environment: "natural setting",
          color_palette: "warm natural colors",
          lighting: "soft natural lighting",
          title: "scene_images",
          enhanced_prompts: scenes.map((s, i) => ({
            scene_index: i,
            enhanced: s.image_prompt || s.prompt,
            camera_angle: "eye level",
            motion_hint: "subtle movement"
          }))
        };
      }

      // Gemini 분석 결과 기반 일관성 프리픽스
      consistencyPrefix = `${styleGuide.main_character}, ${styleGuide.environment}, ${styleGuide.color_palette}, ${styleGuide.lighting}`;
      $.export("consistency_source", "gemini_analysis");
    }

    // 스타일 가이드 정보 export
    $.export("style_guide", {
      title: styleGuide.title,
      main_character: styleGuide.main_character?.substring(0, 200) + (styleGuide.main_character?.length > 200 ? "..." : ""),
      environment: styleGuide.environment?.substring(0, 80) + (styleGuide.environment?.length > 80 ? "..." : ""),
      color_palette: styleGuide.color_palette,
      source: sampleStyleGuide ? "image_style_guide" : "gemini_analysis",
      // ★ 캐릭터 정보 소스 명시 (샘플 영상 캐릭터는 사용하지 않음)
      character_source: scriptCharacterInfo.description ? "script_generator_character" :
                        characterReferenceDescription ? "character_reference_analysis" : "default",
    });

    // =====================
    // 4. Imagen API로 이미지 생성 (REST API 사용) - 병렬 처리
    // =====================
    $.export("status", `Generating images with ${this.imagen_model}...`);

    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`;

    // =====================
    // ★ character_info 기반 캐릭터 프롬프트 생성
    // =====================
    // Script Generator에서 분석된 캐릭터 정보를 최우선으로 사용
    const characterDescription = scriptCharacterInfo.description ||
                                 characterReferenceDescription ||
                                 "";

    // 캐릭터 이름이 있으면 프롬프트에 포함
    const characterNamePrompt = characterName ? `character named "${characterName}",` : "";

    // 캐릭터 일관성 프롬프트 (이미지 첨부 여부와 무관하게 character_info 사용)
    let characterConsistencyPrompt = "";
    if (characterDescription) {
      const consistencyStrength = this.character_consistency_strength || "high";
      const strengthPrefix = {
        low: "character:",
        medium: "consistent character appearance, same character:",
        high: "EXACT same character in every scene, identical appearance, same distinctive features:",
      };
      characterConsistencyPrompt = `${strengthPrefix[consistencyStrength]} ${characterNamePrompt} ${characterDescription},`;
    }

    $.export("character_prompt_info", {
      has_character_description: !!characterDescription,
      character_name: characterName || "N/A",
      prompt_preview: characterConsistencyPrompt.substring(0, 150) + "...",
    });

    // 병렬로 모든 이미지 생성 요청
    // ★ scenes 데이터를 직접 사용 (Script Generator의 pipeline_data.image_generation.scenes)
    const imagePromises = scenes.map(async (scene, i) => {
      // scenes의 image_prompt 또는 prompt 사용
      const scenePrompt = scene.image_prompt || scene.prompt || `Scene ${i + 1}`;

      // styleGuide.enhanced_prompts가 있으면 추가 정보 사용
      const enhanced = styleGuide.enhanced_prompts?.[i] || {};
      const motionHint = enhanced.motion_hint || "";
      const cameraAngle = enhanced.camera_angle || "";

      // ★ 최종 프롬프트 구성: 장면 설명 우선 + 스타일 보조
      // 프롬프트 순서: [장면 설명] > [캐릭터 일관성] > [스타일]
      // scenePrompt(image_prompt)에 이미 캐릭터, 배경, 액션이 포함되어 있으므로 최우선 배치
      const finalPrompt = `${scenePrompt}, ${cameraAngle}, ${motionHint}, ${characterConsistencyPrompt} ${selectedStyle.prefix}, ${consistencyPrefix}, ${selectedStyle.suffix}`.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

      try {
        // Imagen API 요청 데이터 구성
        const requestData = {
          instances: [{ prompt: finalPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: this.aspect_ratio,
            personGeneration: "allow_adult",
          }
        };

        // ⚠️ 참고: referenceImages 기능은 Vertex AI에서만 지원됨
        // Google AI Studio API 키로는 사용 불가
        // 캐릭터 일관성은 프롬프트에 상세 설명을 포함하여 유지

        const response = await axios($, {
          method: "POST",
          url: IMAGEN_API_URL,
          headers: {
            "x-goog-api-key": this.gemini_api_key,
            "Content-Type": "application/json",
          },
          data: requestData,
          timeout: 120000,
        });

        if (response.predictions && response.predictions[0]) {
          return {
            success: true,
            index: i,
            start: scene.start,
            end: scene.end,
            base64: response.predictions[0].bytesBase64Encoded,
            filename: `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`,
            prompt: finalPrompt.substring(0, 200),
            // ★ 원본 scene 데이터 보존 (image_prompt 연결용)
            original_prompt: scenePrompt,
            scene_data: scene,
          };
        }
        return { success: false, index: i, error: "No prediction returned" };
      } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message || "";
        console.error(`Scene ${i + 1} failed:`, errorMsg);
        return {
          success: false,
          index: i,
          error: errorMsg
        };
      }
    });

    // 모든 이미지 생성 완료 대기
    const results = await Promise.all(imagePromises);

    // 성공한 이미지만 필터링하고 인덱스 순으로 정렬
    const generatedImages = results
      .filter(r => r.success)
      .sort((a, b) => a.index - b.index);

    // 실패한 이미지 로깅
    results.filter(r => !r.success).forEach(r => {
      $.export(`scene_${r.index + 1}_error`, r.error);
    });

    $.export("images_generated", generatedImages.length);
    $.export("images_failed", results.filter(r => !r.success).length);

    // =====================
    // 4. GCS 업로드
    // =====================
    $.export("status", "Uploading to Google Cloud Storage...");

    const { google } = await import("googleapis");
    const { v4: uuid } = await import("uuid");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    // folder_name: Script Generator에서 전달받거나 props에서 받거나 자동 생성
    let folderName = folderNameFromScript || this.folder_name;
    if (!folderName) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const shortUuid = uuid().split('-')[0];
      const safeTitle = (styleGuide.title || 'scene_images').replace(/[^a-zA-Z0-9_]/g, '_');
      folderName = `${dateStr}_${shortUuid}_${safeTitle}`;
    }

    const uploadedFiles = [];

    for (const image of generatedImages) {
      const objectName = `${folderName}/${image.filename}`;
      const imageBuffer = Buffer.from(image.base64, 'base64');

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
          metadata: {
            sceneIndex: String(image.index),
            start: String(image.start),
            end: String(image.end),
          },
        },
      });

      const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

      uploadedFiles.push({
        index: image.index + 1,  // 1-based index
        filename: image.filename,
        url: publicUrl,
        start: image.start,
        end: image.end,
        duration: image.end - image.start,
        // ★ 원본 씬 데이터 연결 (image_prompt 포함)
        image_prompt: image.original_prompt,
        scene_data: image.scene_data,
      });
    }

    // metadata.json 생성
    const metadata = {
      generated_at: new Date().toISOString(),
      folder: folderName,
      script_text: scriptText,
      gemini_model: this.gemini_model,
      imagen_model: this.imagen_model,
      style_guide: {
        art_style: selectedStyle.name,
        title: styleGuide.title,
        main_character: styleGuide.main_character,
        environment: styleGuide.environment,
        color_palette: styleGuide.color_palette,
        lighting: styleGuide.lighting,
      },
      // 샘플 영상 기반 스타일 가이드 정보 (있는 경우)
      sample_style_guide: sampleStyleGuide ? {
        image_style: sampleStyleGuide.image_style,
        character_type: sampleStyleGuide.character_type,
        character_style: sampleStyleGuide.character_style,
        character_features: getCharacterFeatures(),
        background: getBackground(),
        color_palette: sampleStyleGuide.color_palette,
        lighting: sampleStyleGuide.lighting,
        mood: sampleStyleGuide.mood,
        props: getProps(),
        quality_keywords: sampleStyleGuide.quality_keywords,
        reference_video: sampleStyleGuide.reference_video,
      } : null,
      // ★ 원본 씬 입력 데이터 (Script Generator에서 전달된 것)
      input_scenes: scenes,
      total_scenes: uploadedFiles.length,
      // ★ 생성된 이미지와 씬 데이터 연결
      scenes: uploadedFiles.map(f => ({
        index: f.index,
        filename: f.filename,
        url: f.url,
        start: f.start,
        end: f.end,
        duration: f.duration,
        image_prompt: f.image_prompt,
      })),
    };

    const metadataObjectName = `${folderName}/metadata.json`;
    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(metadata, null, 2));
    metadataStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: metadataObjectName,
      media: {
        mimeType: 'application/json',
        body: metadataStream,
      },
      requestBody: {
        name: metadataObjectName,
        contentType: 'application/json',
      },
    });

    const metadataUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${metadataObjectName}`;

    $.export("$summary", `Generated ${uploadedFiles.length} images with Gemini API (${this.imagen_model})`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      folder_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/`,
      metadata_url: metadataUrl,
      gemini_model: this.gemini_model,
      imagen_model: this.imagen_model,
      style_guide: {
        art_style: selectedStyle.name,
        title: styleGuide.title,
        // 샘플 스타일 가이드 사용 여부
        used_sample_style: !!sampleStyleGuide,
        sample_style_summary: sampleStyleGuide ? {
          image_style: sampleStyleGuide.image_style,
          character_type: sampleStyleGuide.character_type,
        } : null,
      },
      // 캐릭터 참조 이미지 정보
      character_reference: characterReferenceBase64 ? {
        used: true,
        name: characterName || null,
        description: characterReferenceDescription,
        consistency_strength: this.character_consistency_strength || "high",
        source_url: effectiveCharacterUrl,
        source: this.character_reference_url ? "props_override" : "script_generator",
      } : (characterReferenceDescription ? {
        used: false,
        name: characterName || null,
        description: characterReferenceDescription,
        note: "Description only (no reference image)",
      } : null),
      // ★ 총 영상 길이 (다음 단계에서 사용)
      total_duration_seconds: totalDuration,
      total_scenes: uploadedFiles.length,
      // ★ 생성된 이미지와 씬 데이터 연결 (image_prompt 포함)
      scenes: uploadedFiles.map(f => ({
        index: f.index,
        filename: f.filename,
        url: f.url,
        start: f.start,
        end: f.end,
        duration: f.duration,
        image_prompt: f.image_prompt,
      })),
    };
  },
});
