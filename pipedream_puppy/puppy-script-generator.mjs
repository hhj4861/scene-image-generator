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
  },
  async run({ $ }) {
    const GEMINI_MODEL = "gemini-2.0-flash";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    let topicData = null;
    if (this.topic_generator_output) { try { topicData = typeof this.topic_generator_output === "string" ? JSON.parse(this.topic_generator_output) : this.topic_generator_output; } catch (e) {} }
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
      if (scriptFormat === 'interview') return `★★★ INTERVIEW FORMAT (매우 중요!) ★★★\n⚠️ 절대규칙: 조연(할미,할비) 직접대화 금지! 오직 인터뷰어질문→주인공대답 구조만!\n⚠️ 인터뷰어는 항상 존대말! ❌"콩아,뭐야?"→✅"땅콩씨,무엇인가요?"\n구성: 1.인터뷰어질문(강아지듣는표정,lip_sync:no) 2.주인공대답(카메라정면,lip_sync:yes) 3.필요시flashback 4.조연은회상장면에서만등장\nsegment: interview_question(speaker:interviewer) / interview_answer(speaker:main) / flashback(speaker:main)\nspeaker: "interviewer"=질문만, "main"=주인공(80%이상), "sub1","sub2"=회상장면에서만`;
      if (scriptFormat === 'monologue') return `★★★ MONOLOGUE FORMAT ★★★ 강아지 1인칭 나레이션. 예: "오늘 있었던 일을 말해줄게..." 강아지시점 스토리텔링, 감정이입 용이`;
      if (scriptFormat === 'dialogue') return `★★★ DIALOGUE FORMAT ★★★ 강아지와 주인/다른동물 대화. 예: 강아지:"할미! 이거봐!" 할머니:"어머, 이게뭐야?" 자연스러운일상대화, 여러캐릭터등장`;
      return `★★★ MIXED FORMAT ★★★ 상황에맞게 인터뷰/독백/대화 AI자동선택. 풍자콘텐츠는 인터뷰형식 추천`;
    };
    const mainCharPrompt = characters.main.analysis.image_generation_prompt || "cute adorable puppy";
    const prompt = `Create a viral YouTube Short script with DETAILED visual descriptions.
★★★ VEO3 DURATION RULES ★★★
⚠️ Veo3: 4/6/8초만 지원! 각 씬 duration 필수! 씬개수: ${sceneCountGuide} | 퍼포먼스: start(6초), break(4초), resume(6초)
★★★ CHARACTERS ★★★
${characterDescriptions}
${Object.entries(characters).map(([key, char]) => `- ${char.name}: ${char.analysis.image_generation_prompt || ""} (모든씬동일외형)`).join("\n")}
TOPIC: ${effectiveTopic}${dailyContext ? ` | CONTEXT: ${dailyContext.season}, ${dailyContext.day_of_week}` : ""}
★★★ 배경 ★★★
${hasCustomBackground ? `🎯 USER BACKGROUND: "${backgroundPrompt}" - 모든씬에 반드시 포함!` : backgroundAiGenerated ? `🤖 AI BACKGROUND: ${backgroundAiGenerated.location||"auto"}, ${backgroundAiGenerated.style||"auto"}, ${backgroundAiGenerated.lighting||"auto"}` : `🤖 AUTO: ${contentType}에 맞는 배경 자동생성, 일관성유지`}
${generateContentTypeSection()}
${storyContext.story_summary ? `★★★ 스토리 ★★★ 요약:${storyContext.story_summary} | 후킹:${storyContext.hook||"N/A"} | 스타일:${storyContext.narration_style||"N/A"} | 감정:${storyContext.emotional_journey||"N/A"} | 바이럴:${storyContext.viral_elements?.join(",")||"N/A"}` : ""}
${generateScriptFormatSection()}
★★★ 🎬 첫 씬 = 쇼츠 썸네일! (CRITICAL FOR SHORTS!) ★★★
⚠️ 쇼츠 피드에서 첫 1-2초가 시청 결정! 첫 씬이 "영상 썸네일" 역할!
📌 첫 씬 필수 요소:
1. **강렬한 비주얼**: 주인공 얼굴 클로즈업 + 눈에 띄는 표정 (놀람/흥분/귀여움)
2. **즉각적 후킹**: 바로 관심 끄는 대사 (질문/감탄/충격적 발언) - ✅ "여러분! 제가 오늘 엄청난 걸 발견했어요!" ✅ "아니 이게 말이 돼?!" ❌ "안녕하세요~" (평범한 인사 금지!)
3. **밝고 선명한 화면**: 어둡거나 흐린 배경 금지, 밝은 조명 필수
4. **움직임**: 정적인 장면 금지! 표정 변화나 작은 동작 필수
5. **감정 극대화**: 첫 씬 emotion은 "excited", "surprised", "shocked" 등 강한 감정
📌 첫 씬 image_prompt 예시: "EXTREME CLOSE-UP of [character]'s face filling 70% of frame, WIDE EYES with sparkling excitement, mouth slightly open in amazement, ears perked up high, BRIGHT studio lighting, vibrant colorful background, HIGH CONTRAST, attention-grabbing composition"
★★★ SCRIPT RULES ★★★
${scriptFormat === 'interview' ? `인터뷰형식: 주인공(${characters.main.name})카메라대답80%이상 / 인터뷰어질문=자막(speaker:interviewer) / 조연=flashback에서만 / speaker:"main","interviewer","sub1","sub2" / scene_type:"interview_question","interview_answer","flashback","reaction"` : `주인공(${characters.main.name})60-70%, 조연30-40% / speaker:"main","sub1","sub2","sub3","interviewer"`}
★★★ 🎬 회상 씬 분리 규칙 (FLASHBACK SPLIT - 매우 중요!) ★★★
⚠️ 대사에 회상/추억 내용이 있으면 반드시 2개 씬으로 분리!
📌 회상 키워드 감지: "(회상하며)", "(추억에 잠겨)", "그때", "그날", "예전에", "기억나요", "있었는데"
📌 분리 패턴:
- 씬1 (interview_answer): 주인공이 카메라 보며 회상 대사 시작 (예: "당연하죠! 털 부츠만 있으면...")
- 씬2 (flashback): 회상 장면 시각화! narration 없음, 액션만! (예: 털부츠 신고 눈밭에서 폴짝폴짝 뛰는 ${characters.main.name})
📌 예시:
❌ 잘못된 예 (하나의 씬에 모두 담음):
{"narration":"(회상하며) 털 부츠만 있으면 눈밭에서도 끄떡없다구요! 따뜻하고 포근하고...","scene_type":"interview_answer"}
✅ 올바른 예 (2개 씬으로 분리):
씬1: {"narration":"당연하죠! 털 부츠만 있으면 눈밭에서도 끄떡없다구요!","scene_type":"interview_answer","emotion":"proud"}
씬2: {"narration":"","scene_type":"flashback","has_narration":false,"image_prompt":"${characters.main.name} wearing fluffy fur boots, hopping joyfully in snowy field, snow particles flying, happy expression","video_prompt":{"character_action":"hopping and jumping playfully in snow wearing cute fur boots","lip_sync":"no"}}
📌 flashback 씬 규칙:
- narration: "" (빈 문자열) 또는 짧은 감탄사만 ("와~!", "뽀송뽀송~")
- has_narration: false
- lip_sync: "no"
- scene_type: "flashback"
- image_prompt: 회상 내용을 시각적으로 표현 (액션 중심!)
- scene_details.mood: "dreamy", "nostalgic", "warm memory"
- 약간 dreamy/따뜻한 필터 느낌의 조명
★★★ 🏃 동작 키워드 포함 (VIDEO ACTION - 매우 중요!) ★★★
⚠️ 캐릭터가 동작을 하면서 말할 때, 대사에 동작 키워드를 포함하세요!
📌 동작 키워드 목록 (이 단어가 대사에 있으면 영상에 동작이 반영됨):
- 춤/댄스: "핫팩 댄스", "댄스", "춤", "흔들흔들"
- 뛰기/점프: "폴짝폴짝", "폴짝", "뛰어", "점프", "깡충깡충"
- 돌기: "빙글빙글", "회전", "돌아"
- 꼬리: "꼬리 흔들", "살랑살랑"
- 이동: "달려", "뛰어가"
- 자세: "앉아", "누워", "일어나", "벌떡"
- 표정: "갸웃", "하품", "기지개"
📌 예시 대사 (동작 포함):
- "핫팩 댄스 하면 따뜻해지지~!" (→ 영상: 핫팩 들고 춤추는 장면)
- "나 폴짝폴짝 뛰는 거 좋아해요~" (→ 영상: 폴짝폴짝 뛰는 장면)
- "빙글빙글 도니까 어지러워요~" (→ 영상: 빙글빙글 도는 장면)
- "꼬리가 살랑살랑 흔들려요~" (→ 영상: 꼬리 흔드는 장면)
📌 동작 씬 규칙:
- 대사에 동작 키워드 포함
- video_prompt.character_action에 동작 상세 기술
- 동작이 있으면 camera_movement: "dynamic" 또는 "tracking" 권장
★★★ 대사/효과음/안전규칙 ★★★
⚠️ 대사 금지: "멍!", "왈왈!", "낑~", "캉캉!" 등 동물 추임새/의성어 금지! 사람처럼 자연스러운 말투로만 작성!
효과음: ❌금지: lion,tiger,thunder,explosion,growl,bark,woof / 감정: 대사에 (신나서),(당황) 포함, voice_style에 상세기술 / 안전: ❌동물흉내(사자,호랑이,으르렁),공격표현
★★★ 🎯 대사 스타일 참고 (보리와냥이 스타일 - 바이럴 성공 채널!) ★★★
📌 아기 강아지 말투 패턴 (2-3세 유아 말투): "~해요" 종결: "나 배고파요~", "산책 가고 싶어요~" / "~거야" 종결: "나 졸린 거야~", "이거 내 거야!" / "~인 거야" 강조: "나 귀여운 거야!" / "~할래" 요청: "안아줄래?", "간식 줄래?"
📌 감정별 대사 예시: 기쁨: "와! 산책이다!", "간식이다!" / 애교: "${characters.main.name}은~ 오빠랑 평생 살 거야~♥", "쓰담쓰담 해줘요~" / 투정: "왜 안 놀아줘요?", "심심한 거야~" / 놀람: "헐! 이게 뭐야?!", "세상에...!" / 삐짐: "흥! 나 삐졌어요", "${characters.main.name} 서운해..."
📌 후킹 대사 (첫 씬용): "여러분! 오늘 엄청난 일이 있었어요!", "아니... 이게 말이 돼?!", "제가 드디어 비밀을 알아냈어요!"
📌 바이럴 포인트 대사: 반전: "근데요... 사실은요..." / 클라이맥스: "진짜 대박이에요!" / 마무리: "그래서 ${characters.main.name}은 행복했어요~"
${hasEnglishSpeakers ? `★★★ 영어 캐릭터 대사 규칙 (매우 중요!) ★★★\n${englishSpeakingChars.map(c => `- ${c.name} (${c.key})`).join(", ")} = 영어로 말하는 캐릭터!\n⚠️ 영어 캐릭터 대사 처리: narration: 영어 대사 (실제 TTS/음성에 사용) / narration_korean: 한글 번역 (자막에 사용) - 반드시 작성! / narration_english: 영어 원문 (narration과 동일)` : ""}
${lang.instruction}
★★★ OUTPUT FORMAT (JSON only, no markdown) ★★★
{"title":{"japanese":"","korean":"","english":""},"full_script":"complete dialogue script","location_setting":"전체 스토리가 진행되는 주요 장소","script_segments":[{"segment_number":1,"duration":4,"speaker":"main or sub1 or sub2 or sub3 or interviewer","character_name":"캐릭터 이름","narration":"대사 내용","narration_korean":"⚠️ 필수! 한글 자막용","narration_english":"⚠️ REQUIRED! English subtitle","scene_type":"interview_question/interview_answer/flashback/narration/reaction","image_prompt":"이미지 생성용 상세 프롬프트 (영어)","video_prompt":{"character_action":"캐릭터 동작 설명","lip_sync":"yes or no","facial_expression":"표정 상세 설명","body_movement":"몸 움직임","camera_movement":"static/zoom_in/zoom_out"},"scene_details":{"location":"indoor or outdoor","background":"배경 상세 설명","weather":"sunny/cloudy/rainy/snowy/none","lighting":"조명 설명","mood":"분위기","characters_in_scene":["등장하는 캐릭터들"]},"audio_details":{"voice_style":"음성 스타일","voice_tone":"감정 톤","sound_effects":["효과음"],"ambient_sound":"환경 소리","background_music_mood":"배경음악 분위기"},"emotion":"happy/excited/curious/surprised/scared/loving","emotion_transition":"감정 변화"}],"music_mood":"cute/funny/emotional/heartwarming","overall_style":"photorealistic"}
스토리 흐름에 맞게 자연스러운 씬 개수로 구성하세요! (각 씬 duration 포함 필수)
★★★ 마지막 씬 (OUTRO) - 매우 중요! ★★★
마지막 씬은 재미있는 마무리 대사 + 웃음으로 끝내세요! (면책 씬은 자동 추가됨)
⚠️ 필수: 마지막 씬은 반드시 "웃음 장면"으로 마무리!
📌 마지막 대사 패턴 (대사 후 웃음 필수): 마무리 대사 + "흐흐흐흐흐흐~" (귀여운 웃음)
- 예시: "그래서 ${characters.main.name}은 행복했어요~ 흐흐흐흐흐흐~", "다음에 또 만나요~ 흐흐흐흐흐흐!", "구독 안 하면 간식 안 줌! 흐흐흐흐흐흐~"
📌 마지막 씬 구성: speaker: "main" / narration: "[마무리 대사] 흐흐흐흐흐흐~" / emotion: "happy" / video_prompt.facial_expression: "bursting into adorable laughter"
⚠️ 면책 문구 씬은 생성하지 마세요! (시스템에서 자동 추가됨)`;
    const scriptResponse = await axios($, { url: GEMINI_URL, method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key }, data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 8192 } } });
    let script;
    try {
      let content = scriptResponse.candidates[0].content.parts[0].text.trim();
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let jsonStr = jsonMatch ? jsonMatch[0] : content;
      jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      script = JSON.parse(jsonStr);
    } catch (e) {
      const rawContent = scriptResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
      $.export("parse_error_content_preview", rawContent.substring(0, 500));
      $.export("parse_error_content_end", rawContent.substring(Math.max(0, rawContent.length - 500)));
      throw new Error(`Script parse error: ${e.message}. Content length: ${rawContent.length}`);
    }
    const isEnglishText = (text) => { if (!text?.trim() || text.length < 5) return false; const cleaned = text.replace(/\([^)]*[\uAC00-\uD7AF]+[^)]*\)/g, "").trim(); const ko = (cleaned.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length; const en = (cleaned.match(/[a-zA-Z]/g) || []).length; return en > ko * 2 && en > 10; };
    const segmentsNeedingTranslation = (script.script_segments || []).map((seg, i) => ({ index: i, narration: seg.narration || "" })).filter(s => isEnglishText(s.narration) && (!script.script_segments[s.index].narration_korean || isEnglishText(script.script_segments[s.index].narration_korean)));
    if (segmentsNeedingTranslation.length > 0) {
      $.export("translation_needed", `${segmentsNeedingTranslation.length} segments need Korean translation`);
      try {
        const translationPrompt = `Translate these English sentences to Korean. Keep any Korean text in parentheses as-is. Return ONLY a JSON array of translations in the same order.\nSentences to translate:\n${segmentsNeedingTranslation.map((s, idx) => `${idx + 1}. "${s.narration}"`).join("\n")}\nExample output format: ["한글 번역 1", "한글 번역 2", ...]\nReturn ONLY the JSON array, no markdown, no explanation.`;
        const translationResponse = await axios($, { url: GEMINI_URL, method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key }, data: { contents: [{ parts: [{ text: translationPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2000 } } });
        let translations = [];
        try { let content = translationResponse.candidates[0].content.parts[0].text.trim(); content = content.replace(/```json\s*/g, "").replace(/```\s*/g, ""); translations = JSON.parse(content); } catch (e) { $.export("translation_parse_error", e.message); }
        if (translations.length > 0) { for (let i = 0; i < segmentsNeedingTranslation.length && i < translations.length; i++) { const segIdx = segmentsNeedingTranslation[i].index; script.script_segments[segIdx].narration_korean = translations[i]; script.script_segments[segIdx].spoken_language = "english"; } $.export("translations_applied", translations.length); }
      } catch (e) { $.export("translation_error", e.message); }
    }
    if (isSatire && script.script_segments?.length > 0) {
      const disclaimerMessages = [{ korean: "(귀엽게 절하며) 풍자 콘텐츠예요~ 너그럽게 봐주세요! 흐흐흐흐흐!", english: "It's satire content~ Please be generous! Hehe!" }];
      const randomDisclaimer = disclaimerMessages[Math.floor(Math.random() * disclaimerMessages.length)];
      const disclaimerSegment = { segment_number: script.script_segments.length + 1, speaker: "main", character_name: characters.main?.name || "땅콩", narration: randomDisclaimer.korean, narration_english: randomDisclaimer.english, scene_type: "disclaimer", image_prompt: `${characters.main?.analysis?.image_generation_prompt || "cute adorable puppy"}, full body shot, standing on hind legs, doing a cute polite bow (Korean style belly button bow), front paws together at belly, bending forward respectfully, mischievous smile, warm cozy background`, video_prompt: { character_action: "standing on hind legs, doing adorable Korean-style belly button bow with front paws together at belly, bending forward politely while speaking, then looking up with mischievous wink and bursting into laughter", lip_sync: "yes", facial_expression: "polite smile during bow, then mischievous grin, finally uncontrollable cute laughter", body_movement: "standing upright, front paws together at belly level, bowing forward 45 degrees politely, then straightening up and shaking with laughter", camera_movement: "medium shot to capture full body bow, slight zoom in on face during laughter" }, scene_details: { location: "indoor", background: "warm cozy studio background with soft bokeh lights", lighting: "warm soft flattering lighting", mood: "playful and polite", characters_in_scene: [characters.main?.name || "땅콩"] }, audio_details: { voice_style: "cute adorable toddler girl voice, 2-3 years old, polite then mischievous tone", voice_tone: "respectful and cute during bow, then playful and cheeky, finally bursting into giggles", sound_effects: ["soft whoosh for bow", "cute giggle", "playful chime", "adorable baby laughter"], ambient_sound: "soft warm ambience", background_music_mood: "lighthearted and cute" }, emotion: "polite-playful", emotion_transition: "polite bow → mischievous wink → uncontrollable laughter", is_disclaimer: true };
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
        const imagePrompt = seg.image_prompt || (isAnyPerformance ? `${basePrompt}, ${perfDefaults?.image_prompt_suffix || "doing performance, stage lighting, energetic pose"}` : `${basePrompt}, ${isInterviewQuestion ? "curious listening" : seg.emotion || "happy"} expression`);
        const performancePhase = isPerformanceStart ? "start" : isPerformanceBreak ? "break" : isPerformanceResume ? "resume" : isPerformance ? "main" : null;
        const ttsEnabled = isPerformanceBreak ? true : (isPerformanceStart || isPerformanceResume || isPerformance) ? false : hasNarration;
        const ttsVoice = isPerformanceBreak ? "Korean baby girl with robotic effect" : (isPerformanceStart || isPerformanceResume || isPerformance) ? null : isInterviewQuestion ? "Korean female news anchor, 30s, professional friendly tone" : "Korean baby girl, 2-3 years old toddler voice";
        const finalSpokenLang = seg.spoken_language || character.spoken_language || "korean";
        const narrationKorean = finalSpokenLang === "english" ? (seg.narration_korean || seg.narration || "") : (seg.narration || "");
        const voiceType = (isPerformanceStart || isPerformanceResume) ? "none" : isPerformanceBreak ? "robotic" : (speakerToVoice[speaker] || "adult");
        const lipSyncTo = (isPerformanceStart || isPerformanceResume) ? "bgm" : isPerformanceBreak ? "tts" : (hasNarration ? "tts" : null);
        const bgmVol = (isPerformanceStart || isPerformanceResume || isPerformance) ? 0.8 : isPerformanceBreak ? 0 : 0.3;
        time += duration;
        const narrationEnglish = seg.narration_english || (finalSpokenLang === "english" ? seg.narration : "") || (seg.narration ? `[${seg.narration}]` : "");
        return { ...seg, index: idx + 1, segment_number: idx + 1, start_time: time - duration, end_time: time, duration, speaker, character_name: character.name, spoken_language: finalSpokenLang, voice_type: voiceType, scene_type: sceneType || "narration", has_narration: hasNarration, narration_korean: narrationKorean, narration_english: narrationEnglish, image_prompt: imagePrompt, video_prompt: { ...defaultVideoPrompt, ...videoPrompt, lip_sync: isAnyPerformance ? "yes" : (isInterviewQuestion ? "no" : (hasNarration ? "yes" : (videoPrompt.lip_sync || "no"))), lip_sync_to: lipSyncTo, is_interviewer_speaking: isInterviewQuestion, is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase }, scene_details: { ...defaultSceneDetails, ...sceneDetails, ...(isAnyPerformance ? { location: "stage", background: sceneDetails.background || "concert stage with colorful spotlights and neon lights", lighting: sceneDetails.lighting || "dramatic stage lighting with colorful spotlights", mood: sceneDetails.mood || "energetic performance" } : {}) }, audio_details: { ...defaultAudioDetails, ...audioDetails }, is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase, bgm_featured: (isPerformanceStart || isPerformanceResume || isPerformance), bgm_volume: bgmVol, tts_enabled: ttsEnabled, tts_voice: ttsVoice, voice_effect: isPerformanceBreak ? "robotic" : null, dog_lip_sync: isAnyPerformance ? "yes" : (!isInterviewQuestion && hasNarration) };
      });
      script.total_duration = time;
      if (script.script_segments && script.script_segments.length > 0) {
        const firstScene = script.script_segments[0];
        if (firstScene.image_prompt && !firstScene.image_prompt.includes("CLOSE-UP")) { firstScene.image_prompt = `HOOK SHOT: EXTREME CLOSE-UP, ${firstScene.image_prompt}, attention-grabbing composition, BRIGHT lighting, HIGH CONTRAST`; }
        const weakEmotions = ["neutral", "calm", "relaxed", "normal"];
        if (weakEmotions.includes(firstScene.emotion?.toLowerCase())) { firstScene.emotion = "excited"; }
        if (firstScene.video_prompt) { firstScene.video_prompt.camera_movement = firstScene.video_prompt.camera_movement || "zoom_in"; if (!firstScene.video_prompt.facial_expression?.includes("eye")) { firstScene.video_prompt.facial_expression = `expressive with sparkling eyes, ${firstScene.video_prompt.facial_expression || "excited look"}`; } }
        if (firstScene.scene_details) { if (!firstScene.scene_details.lighting?.includes("bright")) { firstScene.scene_details.lighting = `bright studio lighting, ${firstScene.scene_details.lighting || "well-lit"}`; } }
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
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;
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
    $.export("$summary", `${contentTypeConfig.emoji} [${contentTypeConfig.name}] ${script.script_segments?.length || 0} scenes, ${script.total_duration}s, ${Object.keys(characters).length} characters`);
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
      script: script
    };
  },
});
