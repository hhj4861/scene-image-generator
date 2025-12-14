import { axios } from "@pipedream/platform";
export default defineComponent({
  name: "Puppy Script Generator",
  description: "등장인물 이미지 분석 기반 대화 스크립트 생성 (대본 전용)",
  props: {
    topic_generator_output: { type: "string", label: "Topic Generator Output (JSON)", description: "{{JSON.stringify(steps.Puppy_Topic_Generator.$return_value)}}", optional: true },
    main_character_image_url: { type: "string", label: "Main Character Image URL (주인공)", description: "주인공 이미지 URL (예: 강아지)" },
    main_character_name: { type: "string", label: "Main Character Name", default: "땅콩", optional: true },
    main_character_language: { type: "string", label: "Main Character Spoken Language", description: "주인공이 말하는 언어", options: [{ label: "한국어 (Korean)", value: "korean" }, { label: "영어 (English)", value: "english" }], default: "korean", optional: true },
    sub_character1_image_url: { type: "string", label: "Sub Character 1 Image URL (조연1)", description: "조연1 이미지 URL (예: 주인/할머니)", optional: true },
    sub_character1_name: { type: "string", label: "Sub Character 1 Name", default: "할미", optional: true },
    sub_character1_language: { type: "string", label: "Sub Character 1 Spoken Language", description: "조연1이 말하는 언어", options: [{ label: "한국어 (Korean)", value: "korean" }, { label: "영어 (English)", value: "english" }], default: "korean", optional: true },
    sub_character2_image_url: { type: "string", label: "Sub Character 2 Image URL (조연2)", optional: true },
    sub_character2_name: { type: "string", label: "Sub Character 2 Name", optional: true },
    sub_character2_language: { type: "string", label: "Sub Character 2 Spoken Language", description: "조연2가 말하는 언어", options: [{ label: "한국어 (Korean)", value: "korean" }, { label: "영어 (English)", value: "english" }], default: "korean", optional: true },
    sub_character3_image_url: { type: "string", label: "Sub Character 3 Image URL (조연3)", optional: true },
    sub_character3_name: { type: "string", label: "Sub Character 3 Name", optional: true },
    sub_character3_language: { type: "string", label: "Sub Character 3 Spoken Language", description: "조연3이 말하는 언어", options: [{ label: "한국어 (Korean)", value: "korean" }, { label: "영어 (English)", value: "english" }], default: "korean", optional: true },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    language: { type: "string", label: "Script Language", options: [{ label: "Japanese", value: "japanese" }, { label: "Korean", value: "korean" }, { label: "English", value: "english" }], default: "korean" },
    script_guide: {
      type: "string",
      label: "Script Guide (Optional)",
      description: "대본의 대략적인 흐름, 포함하고 싶은 대사, 혹은 특별한 요청사항을 자유롭게 적어주세요. AI가 이 내용을 최대한 반영하여 대본을 작성합니다.",
      optional: true,
    },
    manual_script_json: {
      type: "string",
      label: "Manual Script Override (JSON)",
      description: "AI 생성을 건너뛰고 직접 수정한 JSON을 사용할 경우 입력하세요.",
      optional: true,
    },
    llm_model: {
      type: "string",
      label: "LLM Model",
      description: "스크립트 생성에 사용할 모델을 선택하세요.",
      options: [
        { label: "Gemini 2.0 Flash (Fast & Free)", value: "gemini-2.0-flash" },
        { label: "Claude 3.5 Haiku (Fast & Cheap)", value: "claude-3-5-haiku-20241022" },
        { label: "Claude 3.5 Sonnet (Best Quality)", value: "claude-3-5-sonnet-20241022" },
        { label: "Claude Sonnet 4 (Latest)", value: "claude-sonnet-4-20250514" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Custom Model (Direct Input)", value: "custom" },
      ],
      default: "gemini-2.0-flash",
    },
    custom_llm_model: {
      type: "string",
      label: "Custom LLM Model ID",
      description: "'LLM Model'을 'Custom'으로 선택했을 때 사용할 모델 ID를 직접 입력하세요.",
      optional: true,
    },
    anthropic_api_key: {
      type: "string",
      label: "Anthropic API Key",
      description: "Claude 모델 사용 시 필수",
      optional: true,
      secret: true,
    },
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key",
      description: "GPT 모델 사용 시 필수",
      optional: true,
      secret: true,
    },
  },
  async run({ $ }) {
    // ==========================================
    // Unified LLM Caller
    // ==========================================
    const callLLM = async (prompt, temperature = 0.7, jsonMode = false) => {
      const model = this.llm_model === "custom" ? this.custom_llm_model : this.llm_model;
      if (!model) throw new Error("Custom model ID is missing.");

      // 1. Gemini
      if (model.startsWith("gemini")) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const resp = await axios($, {
          url,
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
          data: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: 8192 }
          }
        });
        return resp.candidates[0].content.parts[0].text;
      }

      // 2. Claude (Anthropic)
      if (model.startsWith("claude")) {
        if (!this.anthropic_api_key) throw new Error("Anthropic API Key is missing.");
        const resp = await axios($, {
          url: "https://api.anthropic.com/v1/messages",
          method: "POST",
          headers: {
            "x-api-key": this.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          data: {
            model: model, // e.g. "claude-3-5-sonnet-latest"
            max_tokens: 8192,
            temperature: temperature,
            messages: [{ role: "user", content: prompt }]
          }
        });
        return resp.content[0].text;
      }

      // 3. GPT (OpenAI)
      if (model.startsWith("gpt")) {
        if (!this.openai_api_key) throw new Error("OpenAI API Key is missing.");
        const resp = await axios($, {
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.openai_api_key}`,
            "Content-Type": "application/json"
          },
          data: {
            model: model, // e.g. "gpt-4o"
            messages: [{ role: "user", content: prompt }],
            temperature: temperature,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {})
          }
        });
        return resp.choices[0].message.content;
      }

      throw new Error(`Unsupported model: ${model}`);
    };

    // Default constant for vision (Gemini only for now)
    const GEMINI_VISION_MODEL = "gemini-2.0-flash";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;
    let topicData = null;
    if (this.topic_generator_output) { try { topicData = typeof this.topic_generator_output === "string" ? JSON.parse(this.topic_generator_output) : this.topic_generator_output; } catch (e) { } }
    const effectiveTopic = topicData?.topic || "귀여운 강아지의 일상";
    const dailyContext = topicData?.daily_context;
    const contentType = topicData?.content_type || "satire";
    const contentTypeConfig = topicData?.content_type_config || { name: "풍자", emoji: "🎭", description: "시사/이슈를 강아지 세계로 풍자", tone: "satirical, clever, witty", mood: "playful but sharp", recommended_script_format: "interview", themes: ["시사 풍자"], emotion_range: ["분노", "억울", "당당"] };
    const contentTypeInfo = topicData?.content_type_info || null;
    const primaryPerformanceType = contentTypeConfig.primary_performance_type || (contentType === "performance" ? "beatbox" : null);
    $.export("performance_type_from_topic", primaryPerformanceType);
    const isSatire = contentType === "satire" || topicData?.is_satire || false;
    const originalTopic = topicData?.original_topic || null;
    const keywordHint = topicData?.keyword_hint || null;
    const satireInfo = topicData?.satire_info || topicData?.selected?.satire_info || null;
    const scriptFormat = topicData?.script_format || contentTypeConfig.recommended_script_format || "interview";
    const backgroundData = topicData?.background || {};
    const backgroundPrompt = backgroundData.final_prompt || backgroundData.user_setting || null;
    const hasCustomBackground = backgroundData.has_custom_background || false;
    const backgroundAiGenerated = backgroundData.ai_generated || null;
    $.export("background_info", { has_custom: hasCustomBackground, prompt: backgroundPrompt, ai_generated: backgroundAiGenerated });
    const storyContext = { story_summary: topicData?.story_summary || topicData?.selected?.story_summary || null, hook: topicData?.hook || topicData?.selected?.hook || null, narration_style: topicData?.narration_style || topicData?.selected?.narration_style || null, emotional_journey: topicData?.emotional_journey || topicData?.selected?.emotional_journey || null, viral_elements: topicData?.selected?.viral_elements || [], script_format: scriptFormat };
    const analyzeCharacterImage = async (imageUrl) => {
      if (!imageUrl) return null;
      try {
        const imageResponse = await axios($, { method: "GET", url: imageUrl, responseType: "arraybuffer" });
        const imageBase64 = Buffer.from(imageResponse).toString("base64");
        const mimeType = imageUrl.includes(".png") ? "image/png" : "image/jpeg";
        const analysisPrompt = `Analyze this image and determine if it's an ANIMAL or HUMAN, then provide detailed analysis for consistent image regeneration.
STEP 1: Determine character_type by looking at the image - If the image shows a dog, cat, rabbit, bird, or any animal → character_type: "animal" - If the image shows a person/human → character_type: "human"
STEP 2: Return appropriate JSON based on what you see
If you see an ANIMAL, return this JSON format:
{"character_type":"animal","species":"dog/cat/rabbit/etc","breed":"EXACT breed name (e.g., French Bulldog, Pomeranian, Golden Retriever, Persian Cat)","estimated_age":"puppy/adult/senior","gender_appearance":"male/female/unknown","fur_color":"EXACT color with details (e.g., solid black, golden cream, white with brown spots, brindle)","fur_texture":"fluffy/smooth/curly/long/short/wiry","fur_pattern":"solid/spotted/striped/brindle/mixed","eye_color":"exact color (e.g., dark brown, amber, blue)","nose_color":"black/pink/brown","ear_shape":"bat-like erect/pointy erect/floppy/rounded/drop/folded","face_shape":"flat/long/round/square/wrinkled","body_build":"compact muscular/slim/stocky/athletic/chunky","size":"small/medium/large","distinctive_features":["list ALL unique features like wrinkles, underbite, short snout, etc"],"accessories":["EXACT accessories with colors - collars, clothes, chains, etc"],"personality_impression":"cute/playful/calm/fierce/goofy/serious","image_generation_prompt":"CRITICAL: Create a VERY DETAILED prompt to regenerate EXACTLY this animal. Must include: exact breed name, fur color+texture+pattern, eye color, nose color, ear shape, face shape, body build, size, ALL visible accessories with exact colors.","suggested_voice_type":"baby_girl/child_boy/adult_male/adult_female"}
If you see a HUMAN, return this JSON format:
{"character_type":"human","estimated_age_range":"child/teens/20s/30s/40s/50s/60s+","gender":"male/female","ethnicity":"Asian/Caucasian/African/Hispanic/Mixed","skin_tone":"fair/light/medium/tan/dark","hair_color":"exact color","hair_style":"exact style description","hair_length":"short/medium/long/bald","eye_color":"exact color","eye_shape":"round/almond/monolid/hooded","facial_features":"specific notable features","face_shape":"oval/round/square/heart/long","body_type":"slim/average/athletic/heavy","clothing":"EXACT clothing description with colors and style","accessories":["ALL accessories with colors"],"personality_impression":"warm/stern/friendly/elegant/cheerful/serious","image_generation_prompt":"CRITICAL: Create a VERY DETAILED prompt to regenerate EXACTLY this person.","suggested_voice_type":"elderly_female/elderly_male/adult_female/adult_male/child_female/child_male/baby_girl/baby_boy"}
IMPORTANT: Look at the image carefully and return ONLY the JSON, no markdown code blocks or explanations.`;
        const visionResponse = await axios($, { url: GEMINI_URL, method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key }, data: { contents: [{ parts: [{ text: analysisPrompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1500 } } });
        let content = visionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) { console.error(`Image analysis error for ${imageUrl}: ${e.message}`); return { error: e.message, url: imageUrl }; }
    };
    $.export("status", "Analyzing character images...");
    const [mainCharAnalysis, sub1Analysis, sub2Analysis, sub3Analysis] = await Promise.all([analyzeCharacterImage(this.main_character_image_url), analyzeCharacterImage(this.sub_character1_image_url), analyzeCharacterImage(this.sub_character2_image_url), analyzeCharacterImage(this.sub_character3_image_url)]);
    const characters = { main: { name: this.main_character_name || "땅콩", role: "main", image_url: this.main_character_image_url, spoken_language: this.main_character_language || "korean", analysis: mainCharAnalysis || { character_type: "animal", species: "dog", breed: "unknown", image_generation_prompt: "cute adorable puppy, fluffy fur, expressive eyes", suggested_voice_type: "baby_girl" } } };
    if (this.sub_character1_image_url || this.sub_character1_name) { characters.sub1 = { name: this.sub_character1_name || "할미", role: "sub1", image_url: this.sub_character1_image_url, spoken_language: this.sub_character1_language || "korean", analysis: sub1Analysis || { character_type: "human", estimated_age_range: "50s", gender: "female", image_generation_prompt: "middle-aged woman with warm gentle expression", suggested_voice_type: "elderly_female" } }; }
    if (this.sub_character2_image_url || this.sub_character2_name) { characters.sub2 = { name: this.sub_character2_name || "할비", role: "sub2", image_url: this.sub_character2_image_url, spoken_language: this.sub_character2_language || "korean", analysis: sub2Analysis || { character_type: "human", image_generation_prompt: "person", suggested_voice_type: "adult_male" } }; }
    if (this.sub_character3_image_url || this.sub_character3_name) { characters.sub3 = { name: this.sub_character3_name || "조연3", role: "sub3", image_url: this.sub_character3_image_url, spoken_language: this.sub_character3_language || "korean", analysis: sub3Analysis || { character_type: "human", image_generation_prompt: "person", suggested_voice_type: "adult_female" } }; }
    if (scriptFormat === "interview") { characters.interviewer = { name: "인터뷰어", role: "interviewer", image_url: null, analysis: { character_type: "human", gender: "female", estimated_age_range: "30s", image_generation_prompt: "off-screen interviewer (voice only)", suggested_voice_type: "news_anchor_female", voice_description: "Korean female news anchor, 30s, professional friendly tone, 존대말 사용" } }; $.export("interviewer_added", "Interview format detected - interviewer character added"); }
    $.export("characters_analyzed", Object.keys(characters).length);
    $.export("main_image_prompt", characters.main?.analysis?.image_generation_prompt || "NOT SET");
    const langConfig = { japanese: { instruction: "日本語で書いてください。", charsPerSec: 4 }, korean: { instruction: "한국어로 작성해주세요.", charsPerSec: 5 }, english: { instruction: "Write in English.", charsPerSec: 12 } };
    const lang = langConfig[this.language];
    const VEO3_ALLOWED_DURATIONS = [4, 6, 8];
    const isPerformanceContent = contentType === "performance";
    const sceneCountGuide = isPerformanceContent ? "8개 (인터뷰 3개 + 퍼포먼스 3단계 + 마무리 2개)" : "6-10개 (스토리 흐름에 맞게 자연스럽게 구성)";
    const englishSpeakingChars = Object.entries(characters).filter(([k, c]) => c.spoken_language === "english").map(([k, c]) => ({ key: k, name: c.name }));
    const hasEnglishSpeakers = englishSpeakingChars.length > 0;
    const characterDescriptions = Object.entries(characters).map(([key, char]) => {
      const analysis = char.analysis; const spokenLang = char.spoken_language || "korean"; const langLabel = spokenLang === "english" ? "🇺🇸 영어 (English)" : "🇰🇷 한국어 (Korean)";
      if (key === "interviewer") { return `- ${char.name} (INTERVIEWER): 화면에 등장하지 않음 (음성만)\n  역할: 질문하는 인터뷰어\n  언어: 🇰🇷 한국어 (Korean)\n  음성: ${analysis.voice_description || "Korean female news anchor, 30s, professional friendly tone"}\n  ⚠️ 인터뷰어가 질문할 때: 강아지는 듣는 표정, lip_sync 없음`; }
      if (analysis.character_type === "animal") { return `- ${char.name} (${key.toUpperCase()}): ${analysis.species || "animal"}, ${analysis.breed || "unknown breed"}, ${analysis.estimated_age || "unknown age"}, ${analysis.personality_impression || "cute"} personality, Voice: ${analysis.suggested_voice_type || "baby_girl"}\n  🗣️ 대사 언어: ${langLabel}\n  외형: ${analysis.image_generation_prompt || "cute animal"}\n  특징: ${(analysis.distinctive_features || []).join(", ") || "adorable"}\n  악세서리: ${(analysis.accessories || []).join(", ") || "none"}`; }
      return `- ${char.name} (${key.toUpperCase()}): ${analysis.gender || "unknown"}, ${analysis.estimated_age_range || "unknown age"}, ${analysis.personality_impression || "friendly"} personality, Voice: ${analysis.suggested_voice_type || "adult"}\n  🗣️ 대사 언어: ${langLabel}\n  외형: ${analysis.image_generation_prompt || "person"}\n  의상: ${analysis.clothing || "casual"}\n  특징: ${analysis.facial_features || ""}`;
    }).join("\n\n");
    const generateContentTypeSection = () => {
      const userTopic = originalTopic || '(없음)'; const userHint = keywordHint || '(없음)';
      const contentTypeGuides = {
        satire: `## 🎭 콘텐츠 타입: 풍자 (SATIRE MODE)\n**Tone**: ${contentTypeConfig.tone} | **Mood**: ${contentTypeConfig.mood}\n**Themes**: ${contentTypeConfig.themes?.join(", ") || "시사 풍자"} | **Emotions**: ${contentTypeConfig.emotion_range?.join(", ") || "분노, 억울, 당당"}\n${originalTopic ? `### 🎯 SATIRE TRANSFORMATION (CRITICAL!)\n**Original**: "${userTopic}" | **Hints**: "${userHint}"\nTransform to PUPPY-VERSION: Keep core structure (numbers, scale), replace human→puppy elements, make funny & cute but satirical.\n예시: 쿠팡 개인정보 유출→"중국집 차우차우한테 3700만개 사료 털린 강아지" / 국회 난투극→"강아지 유치원 간식시간 난투극"` : `### 🎯 AUTO SATIRE: Generate satirical puppy content based on current trends.`}`,
        comic: `## 😂 코믹 (COMIC) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 반전(예상밖 결말), 과장(귀여운 과장), 실패(귀여운 실패), 당황(멘붕 표정), vs시리즈(강아지vs로봇청소기)`,
        emotional: `## 🥺 감동 (EMOTIONAL) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 재회, 성장, 우정, 감사, 극복 | ARC: 평범한시작→감정적계기→클라이맥스(눈물)→따뜻한마무리`,
        daily: `## 😊 일상 (DAILY) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 루틴(아침/저녁/산책), 먹방(간식타임), 놀이(장난감/공놀이), 휴식(낮잠/이불), 산책(동네/공원)`,
        mukbang: `## 🍽️ 먹방 (MUKBANG) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 리뷰(신상간식/비교), ASMR(사각사각/오도독), 반응(처음음식), 랭킹(간식순위), 먹방(맛있게먹기)`,
        healing: `## 💕 힐링 (HEALING) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 휴식(이불/햇살), 자연(비/눈), 함께함(주인과시간), 평화(조용한오후), 치유(하루끝위로)`,
        drama: `## 🎬 드라마 (DRAMA) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}\nELEMENTS: 갈등(위기), 미스터리(사라진간식), 모험(탈출/탐험), 로맨스(옆집강아지), 성장(용기)\nSTRUCTURE: 도입(평화)→사건발생→전개(해결노력)→클라이맥스→결말(해피엔딩/반전)`,
        performance: `## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)\n**Tone**: ${contentTypeConfig.tone} | **Mood**: ${contentTypeConfig.mood}\n### ⚠️ 퍼포먼스 = 인터뷰 + 퍼포먼스 씬 하이브리드!\n### 📋 전체 스크립트 구조 (30초 기준, 8개 segment)\n1. 인터뷰 질문 1 (interviewer, 존대말!) → 2. 인터뷰 대답 1 (main)\n3. 인터뷰 질문 2 - 퍼포먼스 유도 (interviewer)\n4. performance_start (main, narration:"", bgm_featured:true, bgm_volume:0.8) - BGM+립싱크\n5. performance_break (main, narration:"콩파민!", bgm_featured:false, voice_effect:"robotic") - BGM멈춤+기계음\n6. performance_resume (main, narration:"", bgm_featured:true, bgm_volume:0.8) - BGM재개+립싱크\n7. 인터뷰 마무리 (interviewer) → 8. 아웃트로 (main)\n### 🎵 퍼포먼스 씬 3단계 (필수!)\n- STEP 1 performance_start (6초): narration:"", has_narration:false, bgm_featured:true, bgm_volume:0.8\n- STEP 2 performance_break (4초): narration:"콩파민!"(2-3글자), has_narration:true, bgm_featured:false, voice_effect:"robotic"\n- STEP 3 performance_resume (6초): narration:"", has_narration:false, bgm_featured:true, bgm_volume:0.8\n### 🎙️ 인터뷰어 규칙\n⚠️ 인터뷰어는 항상 존대말! ❌ "땅콩아, 해봐" → ✅ "땅콩 씨, 보여주시겠어요?"\n### 🎵 퍼포먼스 타입별 break 대사/BGM\n- 비트박스: "콩파민!","부웅!" / beatbox rhythmic\n- 노래: "랄랄라!","우우!" / vocal melody\n- 댄스: "이얍!","춤춰!" / dance beat, EDM\n- 랩: "요!","간식왕!" / hip-hop beat\n### ⚠️ CHECKLIST: 인터뷰어 존대말 / 3단계 필수(start→break→resume) / start,resume는 narration:"" / break만 짧은대사+robotic`,
        random: `## 🎲 콘텐츠 타입: 랜덤 (RANDOM MODE)\n오늘의 컨텍스트를 분석하여 가장 적합한 콘텐츠 타입을 AI가 자동 선택합니다.`
      };
      return contentTypeGuides[contentType] || contentTypeGuides.satire;
    };
    const generateScriptFormatSection = () => {
      if (scriptFormat === 'interview') return `★★★ INTERVIEW / DOCUMENTARY FORMAT (CRITICAL!) ★★★
[DOCUMENTARY STYLE PERMITTED]
This is NOT a static studio interview! Create a 'Documentary' or 'Reality Show' vibe.

[ROLES]
- Interviewer (Host): Narrator/Host. Starts with a witty intro. (e.g., "Today we met a dog who thinks he's a nobleman!")
- Main Character (${characters.main.name}): The Star. Can do monologues, answer questions, OR interact with others.
- Sub Characters: ALLOWED to appear and interact if the story needs them (e.g., Maid Cat appears, Owner scolds dog).

[STRUCTURE]
1. Intro: Interviewer's Witty Opening (REQUIRED!) - "Meet the friend who..."
2. Body: Interview Q&A + Reality Sketches + Spontaneous Interactions
3. Outro: Interviewer's Closing + Main Character's funny/cute final remark.

[CORE RULES]
- Fun Editing: Like a Korean Variety Show (예능 자막).
- Interviewer: Always uses polite formal Korean (존댓말).
- Main Character: Uses 'Human Baby Tone' (unless specified otherwise).`;
      if (scriptFormat === 'monologue') return `★★★ MONOLOGUE FORMAT ★★★ First-person narration by the dog. Storytelling from dog's perspective.`;
      if (scriptFormat === 'dialogue') return `★★★ DIALOGUE FORMAT ★★★ Conversation between dog and owner/friends. Natural daily life dialogue.`;
      return `★★★ MIXED FORMAT ★★★ AI chooses best format. For Satire, 'Interview' is recommended.`;
    };
    const mainCharPrompt = characters.main.analysis.image_generation_prompt || "cute adorable puppy";
    const prompt = `Create a viral YouTube Short script with DETAILED visual descriptions.
★★★ VEO3 DURATION RULES ★★★
⚠️ Veo3 guarantees 4/6/8 seconds ONLY! Each scene MUST have exact 'duration'. Scene count: ${sceneCountGuide} | Performance: start(6s), break(4s), resume(6s)
★★★ CHARACTERS ★★★
${characterDescriptions}
${Object.entries(characters).map(([key, char]) => `- ${char.name}: ${char.analysis.image_generation_prompt || ""} (Consistent Appearance)`).join("\n")}
TOPIC: ${effectiveTopic}${dailyContext ? ` | CONTEXT: ${dailyContext.season}, ${dailyContext.day_of_week}` : ""}
${this.script_guide ? `★★★ USER SCRIPT GUIDE (ABSOLUTE PRIORITY!) ★★★
User Request: "${this.script_guide}"
⚠️ CRITICAL: The User's Script Guide overrides ALL other rules (format, logic, consistency).
1. Follow the scene flow, visuals, and specific dialogue described in the guide EXACTLY.
2. If the guide describes Scene 1, Scene 2... match that structure perfectly.` : ""}
★★★ BACKGROUND ★★★
${hasCustomBackground ? `🎯 USER BACKGROUND: "${backgroundPrompt}" - MUST be in ALL scenes!` : backgroundAiGenerated ? `🤖 AI BACKGROUND: ${backgroundAiGenerated.location || "auto"}, ${backgroundAiGenerated.style || "auto"}, ${backgroundAiGenerated.lighting || "auto"}` : `🤖 AUTO: Generate background based on ${contentType}. Keep consistency.`}
${generateContentTypeSection()}
${storyContext.story_summary ? `★★★ STORY INFO ★★★ Summary:${storyContext.story_summary} | Hook:${storyContext.hook || "N/A"} | Style:${storyContext.narration_style || "N/A"} | Emotion:${storyContext.emotional_journey || "N/A"} | Viral:${storyContext.viral_elements?.join(",") || "N/A"}` : ""}
${generateScriptFormatSection()}
★★★ 🎬 SCENE 1 = THUMBNAIL (CRITICAL!) ★★★
⚠️ First 1-2 seconds determine views! Scene 1 is the Video Thumbnail.
1. **Visual**: Close-up of Main Character + Strong Expression (Surprised/Excited/Cute).
2. **Hook**: Immediate attention-grabbing line (Question/Exclamation). - ✅ "You won't believe this!" ❌ "Hello everyone."
3. **Bright**: No dark/dim lighting.
4. **Action**: Dynamic movement or expression change.
5. **Emotion**: "excited", "surprised", "shocked".
📌 Scene 1 image_prompt example: "MEDIUM SHOT of [character], upper body visible, WIDE EYES with sparkling excitement, mouth slightly open, ears perked up, BRIGHT lighting, HIGH CONTRAST"
★★★ SCRIPT RULES ★★★
${scriptFormat === 'interview' ? `Interview Format: Main Character(${characters.main.name}) 80%+ / Interviewer Question = Subtitle only (speaker:interviewer) / Sub Characters = Mostly in flashbacks / scene_type:"interview_question","interview_answer","flashback","reaction"` : `Main(${characters.main.name}) 60-70%, Sub 30-40%`}
★★★ 🎬 FLASHBACK SPLIT RULES (IMPORTANT) ★★★
⚠️ If dialogue mentions past events ("remember when..."), SPLIT into 2 scenes!
1. Scene A (interview_answer): Character talking to camera.
2. Scene B (flashback): Visualizing the memory! narration:"", lip_sync:"no", scene_type:"flashback".
★★★ 🏃 ACTION KEYWORDS (IMPORTANT) ★★★
⚠️ If character does an action, include keyword in dialogue AND video_prompt!
- Dance: "춤", "댄스", "흔들흔들" → video_prompt: "dancing"
- Jump: "폴짝", "점프", "뛰어" → video_prompt: "jumping"
- Spin: "빙글빙글", "돌아" → video_prompt: "spinning"
- Tail: "꼬리", "살랑살랑" → video_prompt: "wagging tail"
- Scoot/Drag Butt: "똥꼬스키", "엉덩이 끌", "스키" → video_prompt: "scooting butt on floor"
★★★ AUDIO/SAFETY RULES ★★★
⚠️ NO ANIMAL SOUNDS defined as dialogue ("Bark!", "Woof!"). Use human speech only.
Safety: NO violence, NO real weapon, NO animal cruelty simulation.
★★★ 🎯 TONE & STYLE GUIDE (HYBRID) ★★★
📌 'HUMAN BABY TONE' (사람 아기 말투 2-3세)
The Main Character must speak like a human toddler, NOT a dog.
- ❌ **ABSOLUTELY BANNED (Forbidden)**:
  - DO NOT use dog-like endings: "~다개", "~멍", "~왈", "~개".
  - DO NOT use animal sounds in text: "멍멍!", "왈왈!".
- ✅ **REQUIRED PATTERNS (Korean Examples)**:
  - Use "~해요" (Polite/Cute): "배고파요~", "산책 가요~"
  - Use "~거야" (Causal/Cute): "이거 내 거야!", "안 할 거야~"
  - Use "~할래" (Volition): "나도 할래!", "안아줄래?"
  - Tone: Innocent, slightly clumsy, very cute 2-3 year old human child.

📌 **Specific Emotion Examples**:
- Joy: "와! 신난다!", "까까 주세요!"
- Affection: "오빠가 제일 좋아~♥", "사랑해요~"
- Complaint: "왜 안 놀아줘요?", "심심한 거야~"
- Surprise: "헐! 이게 뭐야?!", "우와..."
- Sulking: "흥! 나 삐졌어요."

📌 **Hook Lines (Scene 1)**: "여러분! 오늘 대박 사건이에요!", "아니... 이럴 수가?!"
📌 **Outro Line**: "그래서 ${characters.main.name}은 행복했어요~ 흐흐흐흐흐흐~" (Must end with laughter)
${hasEnglishSpeakers ? `★★★ ENGLISH SPEAKER RULES ★★★\n${englishSpeakingChars.map(c => `- ${c.name} (${c.key})`).join(", ")} = English Speakers!\n- narration: English Text\n- narration_korean: Korean Translation (Required for subtitles)\n- narration_english: English Text` : ""}
${lang.instruction}
★★★ OUTPUT FORMAT (JSON only, no markdown) ★★★
{"title":{"japanese":"","korean":"","english":""},"full_script":"complete dialogue script","location_setting":"main location","script_segments":[{"segment_number":1,"duration":4,"speaker":"main/interviewer/sub1...","character_name":"name","narration":"Dialogue","narration_korean":"Korean Subtitle","narration_english":"English Subtitle","scene_type":"interview_question/interview_answer/flashback/narration/reaction","image_prompt":"Detailed Visual Prompt (English)","video_prompt":{"character_action":"Action Description","lip_sync":"yes/no","facial_expression":"Expression","body_movement":"Movement","camera_movement":"static/zoom_in/dynamic"},"scene_details":{"location":"indoor/outdoor","background":"Visual Desc","weather":"...","lighting":"...","mood":"...","characters_in_scene":["..."]},"audio_details":{"voice_style":"Style","voice_tone":"Tone","sound_effects":["SFX"],"ambient_sound":"Ambience","background_music_mood":"Mood"},"emotion":"happy/excited...","emotion_transition":"..."}],"music_mood":"cute/funny...","overall_style":"photorealistic"}
Match scene flow to storyline.
★★★ OUTRO SCENE RULES ★★★
Last scene MUST be a "Laughter Ending".
Pattern: [Closing REMARK] + "Hehehe~" (Laughter sound).
Example: "Goodbye everyone~ Hehehehehe~"
video_prompt: "bursting into adorable laughter"
⚠️ NO DISCLAIMER SCENE (Auto-added).
    let script;
    if (this.manual_script_json && this.manual_script_json.trim().length > 10) {
      // ★★★ MANUAL OVERRIDE MODE ★★★
      $.export("status", "Using Manual Script Override...");
      try {
        script = JSON.parse(this.manual_script_json);
        $.export("manual_override_active", true);
      } catch (e) {
        throw new Error(`Manual Script JSON parse error: ${ e.message
}`);
      }
    } else {
      // ★★★ AI GENERATION MODE ★★★
      $.export("status", `Generating script using ${ this.llm_model }...`);

      const responseText = await callLLM(prompt, 0.8, true);

      try {
        let content = responseText.trim();
        content = content.replace(/```json\s * /g, "").replace(/```\s*/g, "");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        let jsonStr = jsonMatch ? jsonMatch[0] : content;
        jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        script = JSON.parse(jsonStr);
      } catch (e) {
        $.export("parse_error_content_preview", responseText.substring(0, 500));
        throw new Error(`Script parse error: ${ e.message }`);
      }
    }
    const isEnglishText = (text) => { if (!text?.trim() || text.length < 5) return false; const cleaned = text.replace(/\([^)]*[\uAC00-\uD7AF]+[^)]*\)/g, "").trim(); const ko = (cleaned.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length; const en = (cleaned.match(/[a-zA-Z]/g) || []).length; return en > ko * 2 && en > 10; };
    const segmentsNeedingTranslation = (script.script_segments || []).map((seg, i) => ({ index: i, narration: seg.narration || "" })).filter(s => isEnglishText(s.narration) && (!script.script_segments[s.index].narration_korean || isEnglishText(script.script_segments[s.index].narration_korean)));
    if (segmentsNeedingTranslation.length > 0) {
      $.export("translation_needed", `${ segmentsNeedingTranslation.length } segments need Korean translation`);
      try {
        const translationPrompt = `Translate these English sentences to Korean.Keep any Korean text in parentheses as- is.Return ONLY a JSON array of translations in the same order.\nSentences to translate: \n${ segmentsNeedingTranslation.map((s, idx) => `${idx + 1}. "${s.narration}"`).join("\n") }\nExample output format: ["한글 번역 1", "한글 번역 2", ...]\nReturn ONLY the JSON array, no markdown, no explanation.`;

        const responseText = await callLLM(translationPrompt, 0.3, true);

        let translations = [];
        try {
          let content = responseText.trim();
          content = content.replace(/```json\s * /g, "").replace(/```\s*/g, "");
          translations = JSON.parse(content);
        } catch (e) {
          $.export("translation_parse_error", e.message);
        }

        if (translations.length > 0) { for (let i = 0; i < segmentsNeedingTranslation.length && i < translations.length; i++) { const segIdx = segmentsNeedingTranslation[i].index; script.script_segments[segIdx].narration_korean = translations[i]; script.script_segments[segIdx].spoken_language = "english"; } $.export("translations_applied", translations.length); }
      } catch (e) { $.export("translation_error", e.message); }
    }
    if (isSatire && script.script_segments?.length > 0) {
      const disclaimerMessages = [{ korean: "(귀엽게 절하며) 풍자 콘텐츠예요~ 너그럽게 봐주세요! 흐흐흐흐흐!", english: "It's satire content~ Please be generous! Hehe!" }];
      const randomDisclaimer = disclaimerMessages[Math.floor(Math.random() * disclaimerMessages.length)];
      const disclaimerSegment = { segment_number: script.script_segments.length + 1, speaker: "main", character_name: characters.main?.name || "땅콩", narration: randomDisclaimer.korean, narration_english: randomDisclaimer.english, scene_type: "disclaimer", image_prompt: `${ characters.main?.analysis?.image_generation_prompt || "cute adorable puppy" }, full body shot, standing on hind legs, doing a cute polite bow(Korean style belly button bow), front paws together at belly, bending forward respectfully, mischievous smile, warm cozy background`, video_prompt: { character_action: "standing on hind legs, doing adorable Korean-style belly button bow with front paws together at belly, bending forward politely while speaking, then looking up with mischievous wink and bursting into laughter", lip_sync: "yes", facial_expression: "polite smile during bow, then mischievous grin, finally uncontrollable cute laughter", body_movement: "standing upright, front paws together at belly level, bowing forward 45 degrees politely, then straightening up and shaking with laughter", camera_movement: "medium shot to capture full body bow, slight zoom in on face during laughter" }, scene_details: { location: "indoor", background: "warm cozy studio background with soft bokeh lights", lighting: "warm soft flattering lighting", mood: "playful and polite", characters_in_scene: [characters.main?.name || "땅콩"] }, audio_details: { voice_style: "cute adorable toddler girl voice, 2-3 years old, polite then mischievous tone", voice_tone: "respectful and cute during bow, then playful and cheeky, finally bursting into giggles", sound_effects: ["soft whoosh for bow", "cute giggle", "playful chime", "adorable baby laughter"], ambient_sound: "soft warm ambience", background_music_mood: "lighthearted and cute" }, emotion: "polite-playful", emotion_transition: "polite bow → mischievous wink → uncontrollable laughter", is_disclaimer: true };
      script.script_segments.push(disclaimerSegment);
      $.export("disclaimer_added", `Satire disclaimer added: "${randomDisclaimer.korean}"`);
    }
    const voiceStyleMap = { main: "cute adorable toddler girl voice, 2-3 years old, slow sweet innocent speech, baby talk", sub1: "warm gentle elderly woman voice, loving grandmother tone", sub2: "kind mature adult male voice, gentle father figure", sub3: "friendly adult female voice, caring and warm", interviewer: "Korean female news anchor, 30s, professional friendly tone" };
    const speakerToVoice = { main: "cute_toddler_girl", sub1: characters.sub1?.analysis?.suggested_voice_type || "elderly_female", sub2: characters.sub2?.analysis?.suggested_voice_type || "adult_male", sub3: characters.sub3?.analysis?.suggested_voice_type || "adult_female", interviewer: "news_anchor_female" };
    if (script.script_segments?.length > 0) {
      let time = 0;
      const isPerformanceScene = (sceneType) => sceneType && sceneType.startsWith("performance_");
      const getPerformanceType = (sceneType) => { if (!sceneType) return null; const match = sceneType.match(/^performance_(.+)$/); return match ? match[1] : null; };
      const performanceDefaults = {
        beatbox: { character_action: "mouth moving rhythmically making beatbox sounds, head bobbing to beat, body grooving", facial_expression: "focused and rhythmic, cool expression", body_movement: "head bobbing, shoulders moving to beat, rhythmic body sway", image_prompt_suffix: "doing beatbox, mouth open making beat sounds, rhythmic expression, stage lighting, cool pose", bgm_style: "beatbox rhythmic, mouth percussion, vocal drums, bass drops" },
        singing: { character_action: "singing with emotion, slight body sway, eyes sometimes closed feeling music", facial_expression: "emotional and passionate, singing expression", body_movement: "gentle swaying, occasional hand gestures, feeling the music", image_prompt_suffix: "singing into microphone, emotional expression, stage spotlight, passionate pose", bgm_style: "vocal melody, acapella harmony, cute singing, melodic tune" },
        dance: { character_action: "dancing energetically, paws moving, body grooving to beat", facial_expression: "happy and energetic, enjoying dance", body_movement: "full body dance moves, jumping, spinning, grooving", image_prompt_suffix: "dancing, dynamic pose, colorful stage lights, dance floor, energetic", bgm_style: "dance beat, EDM rhythm, energetic, club music" },
        rap: { character_action: "rapping with swagger, hand gestures, confident head movements", facial_expression: "confident and cool, swagger expression", body_movement: "swag movements, hand gestures, head nodding to beat", image_prompt_suffix: "rapper with swag, cool pose, hip-hop style, mic in paw, confident", bgm_style: "hip-hop beat, trap instrumental, 808 bass, snare rolls, rap backing track" },
        instrument: { character_action: "playing instrument with passion, body moving with music", facial_expression: "focused and passionate, musician expression", body_movement: "hands/paws on instrument, body swaying with melody", image_prompt_suffix: "playing instrument, focused expression, musical performance, stage setting", bgm_style: "instrumental solo, musical performance" }
      };
      script.script_segments = script.script_segments.map((seg, idx) => {
        const charLen = seg.narration?.length || 0;
        const speaker = ["main", "sub1", "sub2", "sub3"].includes(seg.speaker) ? seg.speaker : "interviewer";
        const character = characters[speaker] || characters.main;
        const isInterviewQuestion = speaker === "interviewer" || seg.scene_type === "interview_question";
        const sceneType = seg.scene_type;
        const isPerformanceStart = sceneType === "performance_start", isPerformanceBreak = sceneType === "performance_break", isPerformanceResume = sceneType === "performance_resume";
        const isAnyPerformance = isPerformanceScene(sceneType) || isPerformanceStart || isPerformanceBreak || isPerformanceResume;
        const findClosest = (t) => VEO3_ALLOWED_DURATIONS.reduce((p, c) => Math.abs(c - t) < Math.abs(p - t) ? c : p);
        const preferredDuration = isPerformanceBreak ? 4 : 6;
        const calcDuration = seg.duration || (!seg.duration && charLen > 0 ? findClosest(Math.ceil(charLen / lang.charsPerSec)) : preferredDuration);
        const duration = VEO3_ALLOWED_DURATIONS.includes(calcDuration) ? calcDuration : findClosest(calcDuration);
        const hasNarration = (isPerformanceStart || isPerformanceResume) ? false : !!(seg.narration?.trim());
        const performanceType = getPerformanceType(sceneType);
        const perfDefaults = performanceType ? performanceDefaults[performanceType] : null;
        const videoPrompt = seg.video_prompt || {};
        const isPerformance = isPerformanceScene(sceneType);
        const defaultVideoPrompt = (isPerformanceStart || isPerformanceResume) ? { character_action: perfDefaults?.character_action || "mouth moving to beat rhythm, head bobbing, body grooving", lip_sync: "yes", lip_sync_to: "bgm", facial_expression: perfDefaults?.facial_expression || "cool and rhythmic", body_movement: perfDefaults?.body_movement || "rhythmic body movement to beat", camera_movement: "dynamic", is_performance: true, performance_phase: isPerformanceStart ? "start" : "resume" } : isPerformanceBreak ? { character_action: "pausing performance, looking at camera, saying short word", lip_sync: "yes", lip_sync_to: "tts", facial_expression: "confident and cool", body_movement: "brief pause, then dramatic pose", camera_movement: "zoom_in", is_performance: true, performance_phase: "break" } : (isPerformance && perfDefaults) ? { character_action: perfDefaults.character_action, lip_sync: "yes", lip_sync_to: "bgm", facial_expression: perfDefaults.facial_expression, body_movement: perfDefaults.body_movement, camera_movement: "dynamic", is_performance: true, performance_type: performanceType } : { character_action: isInterviewQuestion ? "listening attentively with curious expression, head slightly tilted, ears perked up" : (hasNarration ? "talking with perfectly synchronized lip movements" : "natural idle animation"), lip_sync: isInterviewQuestion ? "no" : (hasNarration ? "yes" : "no"), facial_expression: isInterviewQuestion ? "curious listening" : (seg.emotion || "happy"), body_movement: isInterviewQuestion ? "subtle listening pose, occasional small nod, ears twitching" : (hasNarration ? "subtle expressive gestures while talking" : "gentle breathing and natural movements"), camera_movement: "static", is_interviewer_speaking: isInterviewQuestion };
        const sceneDetails = seg.scene_details || {};
        const defaultSceneDetails = { location: "indoor", background: "cozy living room with soft warm lighting", weather: "none", lighting: "warm soft natural", mood: "cozy heartwarming", characters_in_scene: [character.name] };
        const audioDetails = seg.audio_details || {};
        const defaultAudioDetails = (isPerformanceStart || isPerformanceResume) ? { voice_style: "no voice - BGM only", voice_type: "none", speaking_speed: "none", sound_effects: [], background_sound: "", bgm_featured: true, bgm_volume: 0.8, performance_phase: isPerformanceStart ? "start" : "resume", bgm_style: perfDefaults?.bgm_style || "beatbox rhythmic", tts_enabled: false } : isPerformanceBreak ? { voice_style: "robotic voice effect", voice_type: "robotic", voice_effect: "robotic", speaking_speed: "fast", sound_effects: ["record scratch", "bass drop"], background_sound: "", bgm_featured: false, bgm_volume: 0, performance_phase: "break", tts_enabled: true } : (isPerformance && perfDefaults) ? { voice_style: "no voice - BGM only", voice_type: "none", speaking_speed: "none", sound_effects: [], background_sound: "", bgm_featured: true, bgm_volume: 0.8, performance_type: performanceType, bgm_style: perfDefaults.bgm_style, tts_enabled: false } : { voice_style: voiceStyleMap[speaker] || "natural voice", voice_type: speakerToVoice[speaker] || "adult", speaking_speed: speaker === "main" ? "slow and cute" : "natural", sound_effects: [], background_sound: "", bgm_featured: false, bgm_volume: 0.3, tts_enabled: true };
        const basePrompt = character.analysis?.image_generation_prompt || "cute adorable puppy";
        // ★★★ AI가 생성한 image_prompt를 그대로 사용 (스크립트 우선) ★★★
        const imagePrompt = seg.image_prompt || (isAnyPerformance ? `${ basePrompt }, ${ perfDefaults?.image_prompt_suffix || "doing performance, stage lighting, energetic pose"}` : `${ basePrompt }, ${ isInterviewQuestion? "curious listening": seg.emotion || "happy" } expression`);
        const performancePhase = isPerformanceStart ? "start" : isPerformanceBreak ? "break" : isPerformanceResume ? "resume" : isPerformance ? "main" : null;
        const ttsEnabled = isPerformanceBreak ? true : (isPerformanceStart || isPerformanceResume || isPerformance) ? false : hasNarration;
        const ttsVoice = isPerformanceBreak ? "Korean baby girl with robotic effect" : (isPerformanceStart || isPerformanceResume || isPerformance) ? null : isInterviewQuestion ? "Korean female news anchor, 30s, professional friendly tone" : "Korean baby girl, 2-3 years old toddler voice";
        const finalSpokenLang = seg.spoken_language || character.spoken_language || "korean";
        const narrationKorean = finalSpokenLang === "english" ? (seg.narration_korean || seg.narration || "") : (seg.narration || "");
        const voiceType = (isPerformanceStart || isPerformanceResume) ? "none" : isPerformanceBreak ? "robotic" : (speakerToVoice[speaker] || "adult");
        const lipSyncTo = (isPerformanceStart || isPerformanceResume) ? "bgm" : isPerformanceBreak ? "tts" : (hasNarration ? "tts" : null);
        const bgmVol = (isPerformanceStart || isPerformanceResume || isPerformance) ? 0.8 : isPerformanceBreak ? 0 : 0.3;
        time += duration;
        const narrationEnglish = seg.narration_english || (finalSpokenLang === "english" ? seg.narration : "") || (seg.narration ? `[${ seg.narration }]` : "");
        return { ...seg, index: idx + 1, segment_number: idx + 1, start_time: time - duration, end_time: time, duration, speaker, character_name: character.name, spoken_language: finalSpokenLang, voice_type: voiceType, scene_type: sceneType || "narration", has_narration: hasNarration, narration_korean: narrationKorean, narration_english: narrationEnglish, image_prompt: imagePrompt, video_prompt: { ...defaultVideoPrompt, ...videoPrompt, lip_sync: isAnyPerformance ? "yes" : (isInterviewQuestion ? "no" : (hasNarration ? "yes" : (videoPrompt.lip_sync || "no"))), lip_sync_to: lipSyncTo, is_interviewer_speaking: isInterviewQuestion, is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase }, scene_details: { ...defaultSceneDetails, ...sceneDetails, ...(isAnyPerformance ? { location: "stage", background: sceneDetails.background || "concert stage with colorful spotlights and neon lights", lighting: sceneDetails.lighting || "dramatic stage lighting with colorful spotlights", mood: sceneDetails.mood || "energetic performance" } : {}) }, audio_details: { ...defaultAudioDetails, ...audioDetails }, is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase, bgm_featured: (isPerformanceStart || isPerformanceResume || isPerformance), bgm_volume: bgmVol, tts_enabled: ttsEnabled, tts_voice: ttsVoice, voice_effect: isPerformanceBreak ? "robotic" : null, dog_lip_sync: isAnyPerformance ? "yes" : (!isInterviewQuestion && hasNarration) };
      });
      script.total_duration = time;
      if (script.script_segments && script.script_segments.length > 0) {
        const firstScene = script.script_segments[0];
        // ★★★ 첫 씬: MEDIUM SHOT 유지 (Hook Scene) ★★★
        if (firstScene.image_prompt) {
          // CLOSE-UP만 MEDIUM SHOT으로 교체
          firstScene.image_prompt = firstScene.image_prompt
            .replace(/CLOSE-UP/gi, "MEDIUM SHOT")
            .replace(/close up/gi, "medium shot");
          // Shot 가이드가 없으면 MEDIUM SHOT 추가
          if (!firstScene.image_prompt.includes("SHOT")) {
            firstScene.image_prompt = `MEDIUM SHOT, upper body visible.${ firstScene.image_prompt }.Attention - grabbing composition, BRIGHT lighting`;
          }
        }
        const weakEmotions = ["neutral", "calm", "relaxed", "normal"];
        if (weakEmotions.includes(firstScene.emotion?.toLowerCase())) { firstScene.emotion = "excited"; }
        if (firstScene.video_prompt) { firstScene.video_prompt.camera_movement = firstScene.video_prompt.camera_movement || "zoom_in"; if (!firstScene.video_prompt.facial_expression?.includes("eye")) { firstScene.video_prompt.facial_expression = `expressive with sparkling eyes, ${ firstScene.video_prompt.facial_expression || "excited look" } `; } }
        if (firstScene.scene_details) { if (!firstScene.scene_details.lighting?.includes("bright")) { firstScene.scene_details.lighting = `bright studio lighting, ${ firstScene.scene_details.lighting || "well-lit" } `; } }
        firstScene.is_hook_scene = true; firstScene.thumbnail_optimized = true;
      }
      if (script.script_segments && script.script_segments.length > 0) {
        const lastScene = script.script_segments[script.script_segments.length - 1];
        const laughSound = "흐흐흐흐흐흐~";
        if (lastScene.narration && !lastScene.narration.includes("흐흐흐")) { lastScene.narration = lastScene.narration.replace(/[~!.?]*$/, "") + " " + laughSound; if (lastScene.narration_korean) { lastScene.narration_korean = lastScene.narration_korean.replace(/[~!.?]*$/, "") + " " + laughSound; } }
        lastScene.emotion = "happy";
        if (lastScene.video_prompt) { lastScene.video_prompt.facial_expression = "bursting into adorable laughter, eyes squinting with pure joy, mouth wide open laughing happily, infectious giggling expression"; lastScene.video_prompt.character_action = (lastScene.video_prompt.character_action || "") + ", then bursting into cute laughter"; }
        lastScene.is_outro_scene = true; lastScene.has_laughter = true;
      }
    }
    const { v4: uuidv4 } = await import("uuid");
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const shortUuid = uuidv4().split("-")[0];
    const safeTitle = (script.title?.english || "video").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    const folderName = `${ dateStr }_${ shortUuid }_${ safeTitle } `;
    const performanceAccessoriesMap = { beatbox: "wearing cool black sunglasses, gold chain necklace, backwards snapback cap", singing: "holding wireless microphone, wearing sparkly stage outfit, small earpiece", dance: "wearing trendy sunglasses, colorful LED sneakers, sporty headband", rap: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, holding microphone", hiphop: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, baggy clothes", instrument: "wearing round stylish glasses, bow tie, formal vest", kpop: "wearing stylish outfit, small accessories, polished look, idol-style fashion" };
    const hasPerformanceScenes = script.script_segments?.some(seg => ["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)) || (contentType === "performance");
    const globalPerformanceType = primaryPerformanceType || script.script_segments?.find(seg => seg.performance_type)?.performance_type || "beatbox";
    const globalPerformanceAccessories = hasPerformanceScenes ? (performanceAccessoriesMap[globalPerformanceType] || performanceAccessoriesMap.beatbox) : "";
    $.export("performance_config", { has_performance: hasPerformanceScenes, type: globalPerformanceType, accessories: globalPerformanceAccessories });
    const firstSceneBackground = script.script_segments?.[0]?.scene_details?.background || backgroundPrompt || "clean professional studio background with soft gradient";
    const firstSceneLighting = script.script_segments?.[0]?.scene_details?.lighting || "warm soft natural lighting";
    const performanceStageBackground = "dark concert stage with purple and blue neon lights, colorful spotlights from above, subtle smoke effects at the bottom";
    const consistencyInfo = { main_character_prompt: characters.main?.analysis?.image_generation_prompt || "cute adorable puppy", main_character_image_url: this.main_character_image_url, consistent_background: firstSceneBackground, consistent_lighting: firstSceneLighting, performance_stage_background: performanceStageBackground, has_performance: hasPerformanceScenes, performance_type: globalPerformanceType, performance_accessories: globalPerformanceAccessories, real_dog_emphasis: "Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. NOT a stuffed animal. NOT a person in dog mask. Real fur. Real animal.", no_text_emphasis: "No text anywhere. No signs. No banners. No posters. No letters. No words. No writing. No Korean text. No watermarks. Clean background without any text elements." };
    $.export("consistency_info", consistencyInfo);

    // ★★★ timed_subtitles 생성 (VM 서버용 시간대별 자막) ★★★
    const secondsToTimeStr = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toFixed(2);
      return `${ mins.toString().padStart(2, '0') }:${ secs.padStart(5, '0') } `;
    };
    // ★★★ 자막 특수문자 처리 함수 (FFmpeg drawtext 호환) ★★★
    const cleanSubtitleText = (text) => {
      if (!text) return "";
      return text
        .replace(/\$/g, "달러")       // $ → 달러 (FFmpeg에서 $가 누락되는 문제 해결)
        .replace(/\|/g, " - ")        // | → 하이픈으로 대체 (FFmpeg 필터 구분자 충돌 방지)
        .replace(/%/g, "퍼센트")      // % → 퍼센트 (FFmpeg drawtext에서 %는 특수문자)
        .replace(/&/g, "앤드")        // & → 앤드
        .replace(/#/g, "")            // # 제거
        .replace(/\*/g, "")           // * 제거
        .replace(/<[^>]*>/g, "")      // HTML 태그 제거
        .replace(/\s+/g, " ")         // 연속 공백 제거
        .trim();
    };
    const timedSubtitles = (script.script_segments || [])
      .filter(seg => seg.has_narration && seg.narration_korean?.trim())
      .map(seg => ({
        start_time: secondsToTimeStr(seg.start_time || 0),
        end_time: secondsToTimeStr(seg.end_time || (seg.start_time || 0) + (seg.duration || 4)),
        text_ko: cleanSubtitleText(seg.narration_korean || seg.narration || ""),
        text_en: cleanSubtitleText(seg.narration_english || ""),
        speaker: seg.speaker || "main",
        color: seg.scene_type === "interview_question" ? "silver" : (seg.emotion === "excited" || seg.emotion === "happy" ? "gold" : "white")
      }));
    $.export("timed_subtitles_count", timedSubtitles.length);

    $.export("$summary", `${ contentTypeConfig.emoji } [${ contentTypeConfig.name }] ${ script.script_segments?.length || 0 } scenes, ${ script.total_duration } s, ${ Object.keys(characters).length } characters`);
    return {
      folder_name: folderName, language: this.language, script_text: script.full_script, total_duration_seconds: script.total_duration, title: script.title,
      content_type: contentType, content_type_config: contentTypeConfig, content_type_info: contentTypeInfo,
      topic_info: { topic: effectiveTopic, content_type: contentType, is_satire: isSatire, original_topic: originalTopic, keyword_hint: keywordHint, satire_info: satireInfo, story_context: storyContext, daily_context: dailyContext, script_format: scriptFormat },
      consistency: consistencyInfo,
      characters: Object.fromEntries(Object.entries(characters).map(([key, char]) => [key, { name: char.name, role: char.role, image_url: char.image_url, character_type: char.analysis.character_type, species: char.analysis.species, breed: char.analysis.breed, estimated_age: char.analysis.estimated_age, gender: char.analysis.gender, estimated_age_range: char.analysis.estimated_age_range, personality: char.analysis.personality_impression, voice_type: char.analysis.suggested_voice_type, image_prompt: char.analysis.image_generation_prompt, distinctive_features: char.analysis.distinctive_features, accessories: char.analysis.accessories, clothing: char.analysis.clothing, fur_color: char.analysis.fur_color, fur_texture: char.analysis.fur_texture, eye_color: char.analysis.eye_color }])),
      bgm: (() => {
        const performanceStartSegments = script.script_segments?.filter(seg => seg.scene_type === "performance_start") || [];
        const performanceBreakSegments = script.script_segments?.filter(seg => seg.scene_type === "performance_break") || [];
        const performanceResumeSegments = script.script_segments?.filter(seg => seg.scene_type === "performance_resume") || [];
        const oldPerformanceSegments = script.script_segments?.filter(seg => seg.is_performance && !["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)) || [];
        const allPerformanceSegments = [...performanceStartSegments, ...performanceBreakSegments, ...performanceResumeSegments, ...oldPerformanceSegments];
        const hasPerformance = allPerformanceSegments.length > 0;
        const performanceTypes = [...new Set(allPerformanceSegments.map(seg => seg.performance_type).filter(Boolean))];
        const performanceBgmStyles = { beatbox: "beatbox rhythmic, mouth percussion, vocal drums, bass drops, snare hits, hi-hat patterns", singing: "vocal melody, acapella harmony, cute singing, kawaii voice, melodic tune", dance: "dance beat, EDM rhythm, trap beat, hip-hop groove, bass heavy club music", rap: "hip-hop beat, trap instrumental, 808 bass, snare rolls, rap backing track", instrument: "instrumental solo, musical performance" };
        if (hasPerformance) { const primaryPerformanceType = performanceTypes[0] || "beatbox"; return { mood: script.music_mood || "energetic", duration: script.total_duration, is_performance: true, performance_types: performanceTypes, primary_performance_type: primaryPerformanceType, bgm_style: performanceBgmStyles[primaryPerformanceType] || "energetic rhythmic" }; }
        return { mood: script.music_mood || "cute", duration: script.total_duration, is_performance: false };
      })(),
      // ★★★ VM 서버용 시간대별 자막 (timed_subtitles) ★★★
      timed_subtitles: timedSubtitles,
      script: script
    };
  },
});
