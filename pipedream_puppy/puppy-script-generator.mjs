import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Script Generator",
  description: "등장인물 이미지 분석 기반 대화 스크립트 생성 (대본 전용)",

  props: {
    topic_generator_output: {
      type: "string",
      label: "Topic Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Topic_Generator.$return_value)}}",
      optional: true,
    },
    // ★ 주인공 (강아지)
    main_character_image_url: {
      type: "string",
      label: "Main Character Image URL (주인공)",
      description: "주인공 이미지 URL (예: 강아지)",
    },
    main_character_name: {
      type: "string",
      label: "Main Character Name",
      default: "땅콩",
      optional: true,
    },
    main_character_language: {
      type: "string",
      label: "Main Character Spoken Language",
      description: "주인공이 말하는 언어",
      options: [
        { label: "한국어 (Korean)", value: "korean" },
        { label: "영어 (English)", value: "english" },
      ],
      default: "korean",
      optional: true,
    },
    // ★ 조연1 (주인/할머니)
    sub_character1_image_url: {
      type: "string",
      label: "Sub Character 1 Image URL (조연1)",
      description: "조연1 이미지 URL (예: 주인/할머니)",
      optional: true,
    },
    sub_character1_name: {
      type: "string",
      label: "Sub Character 1 Name",
      default: "할미",
      optional: true,
    },
    sub_character1_language: {
      type: "string",
      label: "Sub Character 1 Spoken Language",
      description: "조연1이 말하는 언어",
      options: [
        { label: "한국어 (Korean)", value: "korean" },
        { label: "영어 (English)", value: "english" },
      ],
      default: "korean",
      optional: true,
    },
    // ★ 조연2
    sub_character2_image_url: {
      type: "string",
      label: "Sub Character 2 Image URL (조연2)",
      optional: true,
    },
    sub_character2_name: {
      type: "string",
      label: "Sub Character 2 Name",
      optional: true,
    },
    sub_character2_language: {
      type: "string",
      label: "Sub Character 2 Spoken Language",
      description: "조연2가 말하는 언어",
      options: [
        { label: "한국어 (Korean)", value: "korean" },
        { label: "영어 (English)", value: "english" },
      ],
      default: "korean",
      optional: true,
    },
    // ★ 조연3
    sub_character3_image_url: {
      type: "string",
      label: "Sub Character 3 Image URL (조연3)",
      optional: true,
    },
    sub_character3_name: {
      type: "string",
      label: "Sub Character 3 Name",
      optional: true,
    },
    sub_character3_language: {
      type: "string",
      label: "Sub Character 3 Spoken Language",
      description: "조연3이 말하는 언어",
      options: [
        { label: "한국어 (Korean)", value: "korean" },
        { label: "영어 (English)", value: "english" },
      ],
      default: "korean",
      optional: true,
    },
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      secret: true,
    },
    language: {
      type: "string",
      label: "Script Language",
      options: [
        { label: "Japanese", value: "japanese" },
        { label: "Korean", value: "korean" },
        { label: "English", value: "english" },
      ],
      default: "korean",
    },
  },

  async run({ $ }) {
    const GEMINI_MODEL = "gemini-2.0-flash";
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    // =====================
    // 1. 입력 파싱
    // =====================
    let topicData = null;
    if (this.topic_generator_output) {
      try {
        topicData = typeof this.topic_generator_output === "string"
          ? JSON.parse(this.topic_generator_output)
          : this.topic_generator_output;
      } catch (e) { /* ignore */ }
    }

    const effectiveTopic = topicData?.topic || "귀여운 강아지의 일상";
    const dailyContext = topicData?.daily_context;

    // ★★★ 콘텐츠 타입 정보 추출 ★★★
    const contentType = topicData?.content_type || "satire";
    const contentTypeConfig = topicData?.content_type_config || {
      name: "풍자",
      emoji: "🎭",
      description: "시사/이슈를 강아지 세계로 풍자",
      tone: "satirical, clever, witty",
      mood: "playful but sharp",
      recommended_script_format: "interview",
      themes: ["시사 풍자"],
      emotion_range: ["분노", "억울", "당당"],
    };
    const contentTypeInfo = topicData?.content_type_info || null;

    // ★★★ 퍼포먼스 타입 정보 추출 (topic-generator에서 전달받음) ★★★
    // topic-generator에서 사용자가 직접 선택한 퍼포먼스 타입 (props.performance_type)
    const primaryPerformanceType = contentTypeConfig.primary_performance_type
      || (contentType === "performance" ? "beatbox" : null);

    $.export("performance_type_from_topic", primaryPerformanceType);

    // ★ 풍자/패러디 정보 추출
    const isSatire = contentType === "satire" || topicData?.is_satire || false;
    const originalTopic = topicData?.original_topic || null;
    const keywordHint = topicData?.keyword_hint || null;
    const satireInfo = topicData?.satire_info || topicData?.selected?.satire_info || null;

    // ★★★ 퍼포먼스 타입도 인터뷰 형식 허용 (인터뷰 중간에 퍼포먼스 삽입) ★★★
    const scriptFormat = topicData?.script_format || contentTypeConfig.recommended_script_format || "interview";

    // ★★★ 배경 정보 추출 ★★★
    const backgroundData = topicData?.background || {};
    const backgroundPrompt = backgroundData.final_prompt || backgroundData.user_setting || null;
    const hasCustomBackground = backgroundData.has_custom_background || false;
    const backgroundAiGenerated = backgroundData.ai_generated || null;

    $.export("background_info", {
      has_custom: hasCustomBackground,
      prompt: backgroundPrompt,
      ai_generated: backgroundAiGenerated,
    });

    const storyContext = {
      story_summary: topicData?.story_summary || topicData?.selected?.story_summary || null,
      hook: topicData?.hook || topicData?.selected?.hook || null,
      narration_style: topicData?.narration_style || topicData?.selected?.narration_style || null,
      emotional_journey: topicData?.emotional_journey || topicData?.selected?.emotional_journey || null,
      viral_elements: topicData?.selected?.viral_elements || [],
      script_format: scriptFormat,
    };

    // =====================
    // 2. 이미지 분석 함수 (자동 동물/사람 판별)
    // =====================
    const analyzeCharacterImage = async (imageUrl) => {
      if (!imageUrl) return null;

      try {
        const imageResponse = await axios($, { method: "GET", url: imageUrl, responseType: "arraybuffer" });
        const imageBase64 = Buffer.from(imageResponse).toString("base64");
        const mimeType = imageUrl.includes(".png") ? "image/png" : "image/jpeg";

        // ★★★ 통합 분석 프롬프트: 이미지를 보고 자동으로 동물/사람 판별 ★★★
        const analysisPrompt = `Analyze this image and determine if it's an ANIMAL or HUMAN, then provide detailed analysis for consistent image regeneration.

STEP 1: Determine character_type by looking at the image
- If the image shows a dog, cat, rabbit, bird, or any animal → character_type: "animal"
- If the image shows a person/human → character_type: "human"

STEP 2: Return appropriate JSON based on what you see

If you see an ANIMAL, return this JSON format:
{"character_type":"animal","species":"dog/cat/rabbit/etc","breed":"EXACT breed name (e.g., French Bulldog, Pomeranian, Golden Retriever, Persian Cat)","estimated_age":"puppy/adult/senior","gender_appearance":"male/female/unknown","fur_color":"EXACT color with details (e.g., solid black, golden cream, white with brown spots, brindle)","fur_texture":"fluffy/smooth/curly/long/short/wiry","fur_pattern":"solid/spotted/striped/brindle/mixed","eye_color":"exact color (e.g., dark brown, amber, blue)","nose_color":"black/pink/brown","ear_shape":"bat-like erect/pointy erect/floppy/rounded/drop/folded","face_shape":"flat/long/round/square/wrinkled","body_build":"compact muscular/slim/stocky/athletic/chunky","size":"small/medium/large","distinctive_features":["list ALL unique features like wrinkles, underbite, short snout, etc"],"accessories":["EXACT accessories with colors - collars, clothes, chains, etc"],"personality_impression":"cute/playful/calm/fierce/goofy/serious","image_generation_prompt":"CRITICAL: Create a VERY DETAILED prompt to regenerate EXACTLY this animal. Must include: exact breed name, fur color+texture+pattern, eye color, nose color, ear shape, face shape, body build, size, ALL visible accessories with exact colors. Example for French Bulldog: 'French Bulldog, solid black short smooth coat, dark brown round wide-set eyes, black nose, large bat-like erect ears, flat wrinkled face with short snout, compact muscular stocky body, small size, wearing grey ribbed shirt and gold chain necklace'","suggested_voice_type":"baby_girl/child_boy/adult_male/adult_female"}

If you see a HUMAN, return this JSON format:
{"character_type":"human","estimated_age_range":"child/teens/20s/30s/40s/50s/60s+","gender":"male/female","ethnicity":"Asian/Caucasian/African/Hispanic/Mixed","skin_tone":"fair/light/medium/tan/dark","hair_color":"exact color","hair_style":"exact style description","hair_length":"short/medium/long/bald","eye_color":"exact color","eye_shape":"round/almond/monolid/hooded","facial_features":"specific notable features (e.g., round cheeks, sharp jawline)","face_shape":"oval/round/square/heart/long","body_type":"slim/average/athletic/heavy","clothing":"EXACT clothing description with colors and style","accessories":["ALL accessories with colors"],"personality_impression":"warm/stern/friendly/elegant/cheerful/serious","image_generation_prompt":"CRITICAL: Create a VERY DETAILED prompt to regenerate EXACTLY this person. Must include: age range, gender, ethnicity, skin tone, hair (color+style+length), eye details, face shape, body type, EXACT clothing with colors, ALL accessories. Example: 'Asian woman in 50s, fair skin, short black bob hair, brown almond eyes, round friendly face, average build, wearing burgundy knit cardigan over white blouse, pearl necklace, warm gentle smile'","suggested_voice_type":"elderly_female/elderly_male/adult_female/adult_male/child_female/child_male/baby_girl/baby_boy"}

IMPORTANT: Look at the image carefully and return ONLY the JSON, no markdown code blocks or explanations.`;

        const visionResponse = await axios($, {
          url: GEMINI_URL,
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
          data: {
            contents: [{
              parts: [
                { text: analysisPrompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
              ]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
          },
        });

        let content = visionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) {
        console.error(`Image analysis error for ${imageUrl}: ${e.message}`);
        return { error: e.message, url: imageUrl };
      }
    };

    // =====================
    // 3. 모든 캐릭터 이미지 병렬 분석
    // =====================
    $.export("status", "Analyzing character images...");

    // ★★★ 모든 캐릭터 이미지를 자동 판별 (동물/사람 구분 없이) ★★★
    const [mainCharAnalysis, sub1Analysis, sub2Analysis, sub3Analysis] = await Promise.all([
      analyzeCharacterImage(this.main_character_image_url),
      analyzeCharacterImage(this.sub_character1_image_url),
      analyzeCharacterImage(this.sub_character2_image_url),
      analyzeCharacterImage(this.sub_character3_image_url),
    ]);

    // 캐릭터 정보 구성
    const characters = {
      main: {
        name: this.main_character_name || "땅콩",
        role: "main",
        image_url: this.main_character_image_url,
        spoken_language: this.main_character_language || "korean",
        analysis: mainCharAnalysis || {
          character_type: "animal",
          species: "dog",
          breed: "unknown",
          image_generation_prompt: "cute adorable puppy, fluffy fur, expressive eyes",
          suggested_voice_type: "baby_girl",
        },
      },
    };

    if (this.sub_character1_image_url || this.sub_character1_name) {
      characters.sub1 = {
        name: this.sub_character1_name || "할미",
        role: "sub1",
        image_url: this.sub_character1_image_url,
        spoken_language: this.sub_character1_language || "korean",
        analysis: sub1Analysis || {
          character_type: "human",
          estimated_age_range: "50s",
          gender: "female",
          image_generation_prompt: "middle-aged woman with warm gentle expression",
          suggested_voice_type: "elderly_female",
        },
      };
    }

    if (this.sub_character2_image_url || this.sub_character2_name) {
      characters.sub2 = {
        name: this.sub_character2_name || "할비",
        role: "sub2",
        image_url: this.sub_character2_image_url,
        spoken_language: this.sub_character2_language || "korean",
        analysis: sub2Analysis || {
          character_type: "human",
          image_generation_prompt: "person",
          suggested_voice_type: "adult_male",
        },
      };
    }

    if (this.sub_character3_image_url || this.sub_character3_name) {
      characters.sub3 = {
        name: this.sub_character3_name || "조연3",
        role: "sub3",
        image_url: this.sub_character3_image_url,
        spoken_language: this.sub_character3_language || "korean",
        analysis: sub3Analysis || {
          character_type: "human",
          image_generation_prompt: "person",
          suggested_voice_type: "adult_female",
        },
      };
    }

    // ★ 인터뷰 형식일 때 인터뷰어 캐릭터 자동 추가
    if (scriptFormat === "interview") {
      characters.interviewer = {
        name: "인터뷰어",
        role: "interviewer",
        image_url: null,
        analysis: {
          character_type: "human",
          gender: "female",
          estimated_age_range: "30s",
          image_generation_prompt: "off-screen interviewer (voice only)",
          suggested_voice_type: "news_anchor_female",
          voice_description: "Korean female news anchor, 30s, professional friendly tone, 존대말 사용",
        },
      };
      $.export("interviewer_added", "Interview format detected - interviewer character added");
    }

    $.export("characters_analyzed", Object.keys(characters).length);
    $.export("main_image_prompt", characters.main?.analysis?.image_generation_prompt || "NOT SET");

    // =====================
    // 4. 언어 설정
    // =====================
    const langConfig = {
      japanese: { instruction: "日本語で書いてください。", charsPerSec: 4 },
      korean: { instruction: "한국어로 작성해주세요.", charsPerSec: 5 },
      english: { instruction: "Write in English.", charsPerSec: 12 },
    };
    const lang = langConfig[this.language];

    // ★★★ Veo3 제한: 4초, 6초, 8초만 가능 ★★★
    const VEO3_ALLOWED_DURATIONS = [4, 6, 8];
    const VEO3_MAX_SCENE_DURATION = 8;
    const VEO3_MIN_SCENE_DURATION = 4;

    // ★★★ 대본 기반 씬 생성 - Gemini가 콘텐츠에 맞게 자동 결정 ★★★
    // 퍼포먼스: 8개 (인터뷰 3 + 퍼포먼스 3 + 마무리 2)
    // 일반: 6-10개 (콘텐츠 복잡도에 따라 Gemini가 결정)
    const isPerformanceContent = contentType === "performance";
    const sceneCountGuide = isPerformanceContent
      ? "8개 (인터뷰 3개 + 퍼포먼스 3단계 + 마무리 2개)"
      : "6-10개 (스토리 흐름에 맞게 자연스럽게 구성)";

    // =====================
    // 5. 캐릭터 정보를 프롬프트로 변환
    // =====================
    // ★★★ 영어 사용 캐릭터 목록 (자막 처리용) ★★★
    const englishSpeakingChars = Object.entries(characters)
      .filter(([k, c]) => c.spoken_language === "english")
      .map(([k, c]) => ({ key: k, name: c.name }));
    const hasEnglishSpeakers = englishSpeakingChars.length > 0;

    const characterDescriptions = Object.entries(characters).map(([key, char]) => {
      const analysis = char.analysis;
      const spokenLang = char.spoken_language || "korean";
      const langLabel = spokenLang === "english" ? "🇺🇸 영어 (English)" : "🇰🇷 한국어 (Korean)";

      if (key === "interviewer") {
        return `- ${char.name} (INTERVIEWER): 화면에 등장하지 않음 (음성만)
  역할: 질문하는 인터뷰어
  언어: 🇰🇷 한국어 (Korean)
  음성: ${analysis.voice_description || "Korean female news anchor, 30s, professional friendly tone"}
  ⚠️ 인터뷰어가 질문할 때: 강아지는 듣는 표정, lip_sync 없음`;
      }

      if (analysis.character_type === "animal") {
        return `- ${char.name} (${key.toUpperCase()}): ${analysis.species || "animal"}, ${analysis.breed || "unknown breed"}, ${analysis.estimated_age || "unknown age"}, ${analysis.personality_impression || "cute"} personality, Voice: ${analysis.suggested_voice_type || "baby_girl"}
  🗣️ 대사 언어: ${langLabel}
  외형: ${analysis.image_generation_prompt || "cute animal"}
  특징: ${(analysis.distinctive_features || []).join(", ") || "adorable"}
  악세서리: ${(analysis.accessories || []).join(", ") || "none"}`;
      } else {
        return `- ${char.name} (${key.toUpperCase()}): ${analysis.gender || "unknown"}, ${analysis.estimated_age_range || "unknown age"}, ${analysis.personality_impression || "friendly"} personality, Voice: ${analysis.suggested_voice_type || "adult"}
  🗣️ 대사 언어: ${langLabel}
  외형: ${analysis.image_generation_prompt || "person"}
  의상: ${analysis.clothing || "casual"}
  특징: ${analysis.facial_features || ""}`;
      }
    }).join("\n\n");

    // =====================
    // 6. 콘텐츠 타입별 프롬프트 섹션 생성
    // =====================
    const generateContentTypeSection = () => {
      const userTopic = originalTopic || '(없음)';
      const userHint = keywordHint || '(없음)';

      const contentTypeGuides = {
        satire: `
## 🎭 콘텐츠 타입: 풍자 (SATIRE MODE)
**Tone**: ${contentTypeConfig.tone} | **Mood**: ${contentTypeConfig.mood}
**Themes**: ${contentTypeConfig.themes?.join(", ") || "시사 풍자"} | **Emotions**: ${contentTypeConfig.emotion_range?.join(", ") || "분노, 억울, 당당"}
${originalTopic ? `
### 🎯 SATIRE TRANSFORMATION (CRITICAL!)
**Original**: "${userTopic}" | **Hints**: "${userHint}"
Transform to PUPPY-VERSION: Keep core structure (numbers, scale), replace human→puppy elements, make funny & cute but satirical.
예시: 쿠팡 개인정보 유출→"중국집 차우차우한테 3700만개 사료 털린 강아지" / 국회 난투극→"강아지 유치원 간식시간 난투극"
` : `### 🎯 AUTO SATIRE: Generate satirical puppy content based on current trends.`}`,

        comic: `
## 😂 코믹 (COMIC) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 반전(예상밖 결말), 과장(귀여운 과장), 실패(귀여운 실패), 당황(멘붕 표정), vs시리즈(강아지vs로봇청소기)`,

        emotional: `
## 🥺 감동 (EMOTIONAL) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 재회, 성장, 우정, 감사, 극복 | ARC: 평범한시작→감정적계기→클라이맥스(눈물)→따뜻한마무리`,

        daily: `
## 😊 일상 (DAILY) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 루틴(아침/저녁/산책), 먹방(간식타임), 놀이(장난감/공놀이), 휴식(낮잠/이불), 산책(동네/공원)`,

        mukbang: `
## 🍽️ 먹방 (MUKBANG) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 리뷰(신상간식/비교), ASMR(사각사각/오도독), 반응(처음음식), 랭킹(간식순위), 먹방(맛있게먹기)`,

        healing: `
## 💕 힐링 (HEALING) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 휴식(이불/햇살), 자연(비/눈), 함께함(주인과시간), 평화(조용한오후), 치유(하루끝위로)`,

        drama: `
## 🎬 드라마 (DRAMA) - Tone: ${contentTypeConfig.tone} | Mood: ${contentTypeConfig.mood}
ELEMENTS: 갈등(위기), 미스터리(사라진간식), 모험(탈출/탐험), 로맨스(옆집강아지), 성장(용기)
STRUCTURE: 도입(평화)→사건발생→전개(해결노력)→클라이맥스→결말(해피엔딩/반전)`,

        performance: `
## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)
**Tone**: ${contentTypeConfig.tone} | **Mood**: ${contentTypeConfig.mood}

### ⚠️ 퍼포먼스 = 인터뷰 + 퍼포먼스 씬 하이브리드!
퍼포먼스 콘텐츠는 **인터뷰 형식 중간에 퍼포먼스 씬을 삽입**하는 구조입니다!

### 📋 전체 스크립트 구조 (30초 기준, 8개 segment)
1. 인터뷰 질문 1 (interviewer, 존대말!) → 2. 인터뷰 대답 1 (main)
3. 인터뷰 질문 2 - 퍼포먼스 유도 (interviewer)
4. performance_start (main, narration:"", bgm_featured:true, bgm_volume:0.8) - BGM+립싱크
5. performance_break (main, narration:"콩파민!", bgm_featured:false, voice_effect:"robotic") - BGM멈춤+기계음
6. performance_resume (main, narration:"", bgm_featured:true, bgm_volume:0.8) - BGM재개+립싱크
7. 인터뷰 마무리 (interviewer) → 8. 아웃트로 (main)

### 🎵 퍼포먼스 씬 3단계 (필수!)
- STEP 1 performance_start (6초): narration:"", has_narration:false, bgm_featured:true, bgm_volume:0.8
- STEP 2 performance_break (4초): narration:"콩파민!"(2-3글자), has_narration:true, bgm_featured:false, voice_effect:"robotic"
- STEP 3 performance_resume (6초): narration:"", has_narration:false, bgm_featured:true, bgm_volume:0.8

### 🎙️ 인터뷰어 규칙
⚠️ 인터뷰어는 항상 존대말! ❌ "땅콩아, 해봐" → ✅ "땅콩 씨, 보여주시겠어요?"

### 🎵 퍼포먼스 타입별 break 대사/BGM
- 비트박스: "콩파민!","부웅!" / beatbox rhythmic
- 노래: "랄랄라!","우우!" / vocal melody
- 댄스: "이얍!","춤춰!" / dance beat, EDM
- 랩: "요!","간식왕!" / hip-hop beat

### ⚠️ CHECKLIST: 인터뷰어 존대말 / 3단계 필수(start→break→resume) / start,resume는 narration:"" / break만 짧은대사+robotic`,

        random: `
## 🎲 콘텐츠 타입: 랜덤 (RANDOM MODE)
오늘의 컨텍스트를 분석하여 가장 적합한 콘텐츠 타입을 AI가 자동 선택합니다.`,
      };

      return contentTypeGuides[contentType] || contentTypeGuides.satire;
    };

    // =====================
    // 7. 스크립트 형식 가이드 생성
    // =====================
    const generateScriptFormatSection = () => {
      if (scriptFormat === 'interview') {
        return `
★★★ INTERVIEW FORMAT (매우 중요!) ★★★
⚠️ 절대규칙: 조연(할미,할비) 직접대화 금지! 오직 인터뷰어질문→주인공대답 구조만!
⚠️ 인터뷰어는 항상 존대말! ❌"콩아,뭐야?"→✅"땅콩씨,무엇인가요?"
구성: 1.인터뷰어질문(강아지듣는표정,lip_sync:no) 2.주인공대답(카메라정면,lip_sync:yes) 3.필요시flashback 4.조연은회상장면에서만등장
segment: interview_question(speaker:interviewer) / interview_answer(speaker:main) / flashback(speaker:main)
speaker: "interviewer"=질문만, "main"=주인공(80%이상), "sub1","sub2"=회상장면에서만`;
      } else if (scriptFormat === 'monologue') {
        return `★★★ MONOLOGUE FORMAT ★★★ 강아지 1인칭 나레이션. 예: "오늘 있었던 일을 말해줄게..." 강아지시점 스토리텔링, 감정이입 용이`;
      } else if (scriptFormat === 'dialogue') {
        return `★★★ DIALOGUE FORMAT ★★★ 강아지와 주인/다른동물 대화. 예: 강아지:"할미! 이거봐!" 할머니:"어머, 이게뭐야?" 자연스러운일상대화, 여러캐릭터등장`;
      } else {
        return `★★★ MIXED FORMAT ★★★ 상황에맞게 인터뷰/독백/대화 AI자동선택. 풍자콘텐츠는 인터뷰형식 추천`;
      }
    };

    // =====================
    // 8. 스크립트 생성 프롬프트
    // =====================
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

★★★ SCRIPT RULES ★★★
${scriptFormat === 'interview' ? `인터뷰형식: 주인공(${characters.main.name})카메라대답80%이상 / 인터뷰어질문=자막(speaker:interviewer) / 조연=flashback에서만 / speaker:"main","interviewer","sub1","sub2" / scene_type:"interview_question","interview_answer","flashback","reaction"` : `주인공(${characters.main.name})60-70%, 조연30-40% / speaker:"main","sub1","sub2","sub3","interviewer"`}

★★★ 대사/효과음/안전규칙 ★★★
⚠️ 대사 금지: "멍!", "왈왈!", "낑~", "캉캉!" 등 동물 추임새/의성어 금지! 사람처럼 자연스러운 말투로만 작성!
효과음: ❌금지: lion,tiger,thunder,explosion,growl,bark,woof
감정: 대사에 (신나서),(당황) 포함, voice_style에 상세기술
안전: ❌동물흉내(사자,호랑이,으르렁),공격표현

${hasEnglishSpeakers ? `
★★★ 영어 캐릭터 대사 규칙 (매우 중요!) ★★★
${englishSpeakingChars.map(c => `- ${c.name} (${c.key})`).join(", ")} = 영어로 말하는 캐릭터!
⚠️ 영어 캐릭터 대사 처리:
- narration: 영어 대사 (실제 TTS/음성에 사용)
- narration_korean: 한글 번역 (자막에 사용) - 반드시 작성!
- narration_english: 영어 원문 (narration과 동일)
예시:
  "speaker": "sub1",
  "narration": "Oh my gosh! This is so embarrassing!",
  "narration_korean": "세상에! 이건 너무 창피해!",
  "narration_english": "Oh my gosh! This is so embarrassing!"
` : ""}

${lang.instruction}

★★★ OUTPUT FORMAT (JSON only, no markdown) ★★★
{
  "title":{"japanese":"","korean":"","english":""},
  "full_script":"complete dialogue script",
  "location_setting":"전체 스토리가 진행되는 주요 장소",
  "script_segments":[
    {
      "segment_number":1,
      "duration": 6,  // ⚠️ 필수! 반드시 4, 6, 8 중 하나!
      "speaker":"main or sub1 or sub2 or sub3 or interviewer",
      "character_name":"캐릭터 이름",
      "narration":"대사 내용 (한국어 캐릭터=한국어, 영어 캐릭터=영어)",
      "narration_korean":"⚠️ 필수! 한글 자막용 (영어 캐릭터=한글 번역, 한국어 캐릭터=narration과 동일)",
      "narration_english":"⚠️ REQUIRED! English subtitle (Korean character=English translation, English character=same as narration). NEVER leave empty!",
      "scene_type":"interview_question/interview_answer/flashback/narration/reaction",

      "image_prompt":"이미지 생성용 상세 프롬프트 (영어) - 캐릭터 외모 + 감정에 맞는 포즈/표정 + 배경 + 조명",

      "video_prompt":{
        "character_action":"캐릭터 동작 설명 (영어)",
        "lip_sync":"yes or no",
        "facial_expression":"표정 상세 설명",
        "body_movement":"몸 움직임 설명",
        "camera_movement":"static/zoom_in/zoom_out/pan_left/pan_right"
      },

      "scene_details":{
        "location":"indoor or outdoor",
        "background":"배경 상세 설명 (영어)",
        "weather":"sunny/cloudy/rainy/snowy/none",
        "lighting":"조명 설명",
        "mood":"분위기",
        "characters_in_scene":["등장하는 캐릭터들"]
      },

      "audio_details":{
        "voice_style":"음성 스타일 상세",
        "voice_tone":"감정 톤",
        "sound_effects":["코미디 효과음"],
        "ambient_sound":"환경 소리",
        "background_music_mood":"배경음악 분위기"
      },

      "emotion":"happy/excited/curious/surprised/scared/loving 등",
      "emotion_transition":"감정 변화 (예: 신남→당황→안도)"
    }
  ],
  "music_mood":"cute/funny/emotional/heartwarming",
  "overall_style":"photorealistic"
}

스토리 흐름에 맞게 자연스러운 씬 개수로 구성하세요! (각 씬 duration 포함 필수)

★★★ 마지막 씬 (OUTRO) - 매우 중요! ★★★
마지막 씬은 재미있는 마무리 대사로 끝내세요! (면책 씬은 자동 추가됨)
- 구독 유도: "구독 안 하면 간식 안 줌!", "좋아요 누르면 꼬리 흔들어줄게~"
- 반전 유머: 갑자기 간식 달라고 조르기, 예상치 못한 귀여운 반전
- 여운: "다음 화에서 복수한다... 기다려라!", 뒤돌아보며 윙크
- 감정 폭발: 억울해서 바닥 구르기, 분노의 멍멍!, 승리의 만세
⚠️ 면책 문구 씬은 생성하지 마세요! (시스템에서 자동 추가됨)`;


    const scriptResponse = await axios($, {
      url: GEMINI_URL,
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
      data: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
      },
    });

    let script;
    try {
      let content = scriptResponse.candidates[0].content.parts[0].text.trim();
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");

      // ★★★ JSON 정리: 불필요한 문자 제거 ★★★
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let jsonStr = jsonMatch ? jsonMatch[0] : content;

      // 잘못된 이스케이프 문자 수정
      jsonStr = jsonStr
        .replace(/[\x00-\x1F\x7F]/g, " ") // 제어 문자 제거
        .replace(/,\s*}/g, "}") // trailing comma 제거
        .replace(/,\s*]/g, "]"); // trailing comma 제거

      script = JSON.parse(jsonStr);
    } catch (e) {
      // 디버깅을 위해 원본 내용 일부 출력
      const rawContent = scriptResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
      $.export("parse_error_content_preview", rawContent.substring(0, 500));
      $.export("parse_error_content_end", rawContent.substring(Math.max(0, rawContent.length - 500)));
      throw new Error(`Script parse error: ${e.message}. Content length: ${rawContent.length}`);
    }

    // =====================
    // 8-1. 영어 대사 자동 감지 및 한글 번역 후처리
    // =====================
    const isEnglishText = (text) => {
      if (!text?.trim() || text.length < 5) return false;
      const cleaned = text.replace(/\([^)]*[\uAC00-\uD7AF]+[^)]*\)/g, "").trim();
      const ko = (cleaned.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
      const en = (cleaned.match(/[a-zA-Z]/g) || []).length;
      return en > ko * 2 && en > 10;
    };

    const segmentsNeedingTranslation = (script.script_segments || [])
      .map((seg, i) => ({ index: i, narration: seg.narration || "" }))
      .filter(s => isEnglishText(s.narration) && (!script.script_segments[s.index].narration_korean || isEnglishText(script.script_segments[s.index].narration_korean)));

    // 번역이 필요한 세그먼트가 있으면 일괄 번역
    if (segmentsNeedingTranslation.length > 0) {
      $.export("translation_needed", `${segmentsNeedingTranslation.length} segments need Korean translation`);

      try {
        const translationPrompt = `Translate these English sentences to Korean.
Keep any Korean text in parentheses as-is.
Return ONLY a JSON array of translations in the same order.

Sentences to translate:
${segmentsNeedingTranslation.map((s, idx) => `${idx + 1}. "${s.narration}"`).join("\n")}

Example output format:
["한글 번역 1", "한글 번역 2", ...]

Return ONLY the JSON array, no markdown, no explanation.`;

        const translationResponse = await axios($, {
          url: GEMINI_URL,
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
          data: {
            contents: [{ parts: [{ text: translationPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
          },
        });

        let translations = [];
        try {
          let content = translationResponse.candidates[0].content.parts[0].text.trim();
          content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
          translations = JSON.parse(content);
        } catch (e) {
          $.export("translation_parse_error", e.message);
        }

        // 번역 적용
        if (translations.length > 0) {
          for (let i = 0; i < segmentsNeedingTranslation.length && i < translations.length; i++) {
            const segIdx = segmentsNeedingTranslation[i].index;
            script.script_segments[segIdx].narration_korean = translations[i];
            // spoken_language도 english로 업데이트
            script.script_segments[segIdx].spoken_language = "english";
          }
          $.export("translations_applied", translations.length);
        }
      } catch (e) {
        $.export("translation_error", e.message);
      }
    }

    // =====================
    // 9. 풍자 모드일 때 면책 엔딩 씬 추가
    // =====================
    if (isSatire && script.script_segments?.length > 0) {
      // 면책 멘트 랜덤 선택
      const disclaimerMessages = [
        { korean: "(귀엽게 절하며) 풍자 콘텐츠예요~ 너그럽게 봐주세요! 흐흐흐흐흐!", english: "It's satire content~ Please be generous! Hehe!" },
      ];
      const randomDisclaimer = disclaimerMessages[Math.floor(Math.random() * disclaimerMessages.length)];

      const disclaimerSegment = {
        segment_number: script.script_segments.length + 1,
        speaker: "main",
        character_name: characters.main?.name || "땅콩",
        narration: randomDisclaimer.korean,
        narration_english: randomDisclaimer.english,
        scene_type: "disclaimer",
        image_prompt: `${characters.main?.analysis?.image_generation_prompt || "cute adorable puppy"}, full body shot, standing on hind legs, doing a cute polite bow (Korean style belly button bow), front paws together at belly, bending forward respectfully, mischievous smile, warm cozy background`,
        video_prompt: {
          character_action: "standing on hind legs, doing adorable Korean-style belly button bow with front paws together at belly, bending forward politely while speaking, then looking up with mischievous wink and bursting into laughter",
          lip_sync: "yes",
          facial_expression: "polite smile during bow, then mischievous grin, finally uncontrollable cute laughter",
          body_movement: "standing upright, front paws together at belly level, bowing forward 45 degrees politely, then straightening up and shaking with laughter",
          camera_movement: "medium shot to capture full body bow, slight zoom in on face during laughter",
        },
        scene_details: {
          location: "indoor",
          background: "warm cozy studio background with soft bokeh lights",
          lighting: "warm soft flattering lighting",
          mood: "playful and polite",
          characters_in_scene: [characters.main?.name || "땅콩"],
        },
        audio_details: {
          voice_style: "cute adorable toddler girl voice, 2-3 years old, polite then mischievous tone",
          voice_tone: "respectful and cute during bow, then playful and cheeky, finally bursting into giggles",
          sound_effects: ["soft whoosh for bow", "cute giggle", "playful chime", "adorable baby laughter"],
          ambient_sound: "soft warm ambience",
          background_music_mood: "lighthearted and cute",
        },
        emotion: "polite-playful",
        emotion_transition: "polite bow → mischievous wink → uncontrollable laughter",
        is_disclaimer: true,
      };

      script.script_segments.push(disclaimerSegment);
      $.export("disclaimer_added", `Satire disclaimer added: "${randomDisclaimer.korean}"`);
    }

    // =====================
    // 10. 타이밍 정규화 + speaker를 캐릭터 정보와 연결
    // =====================
    const voiceStyleMap = {
      main: "cute adorable toddler girl voice, 2-3 years old, slow sweet innocent speech, baby talk",
      sub1: "warm gentle elderly woman voice, loving grandmother tone",
      sub2: "kind mature adult male voice, gentle father figure",
      sub3: "friendly adult female voice, caring and warm",
      interviewer: "Korean female news anchor, 30s, professional friendly tone",
    };

    const speakerToVoice = {
      main: "cute_toddler_girl",
      sub1: characters.sub1?.analysis?.suggested_voice_type || "elderly_female",
      sub2: characters.sub2?.analysis?.suggested_voice_type || "adult_male",
      sub3: characters.sub3?.analysis?.suggested_voice_type || "adult_female",
      interviewer: "news_anchor_female",
    };

    if (script.script_segments?.length > 0) {
      const totalChars = script.script_segments.reduce((s, seg) => s + (seg.narration?.length || 0), 0);
      let time = 0;

      // ★★★ 퍼포먼스 타입 감지 함수 ★★★
      const isPerformanceScene = (sceneType) => {
        return sceneType && sceneType.startsWith("performance_");
      };

      const getPerformanceType = (sceneType) => {
        if (!sceneType) return null;
        const match = sceneType.match(/^performance_(.+)$/);
        return match ? match[1] : null;
      };

      // ★★★ 퍼포먼스 타입별 기본 설정 ★★★
      const performanceDefaults = {
        beatbox: {
          character_action: "mouth moving rhythmically making beatbox sounds, head bobbing to beat, body grooving",
          facial_expression: "focused and rhythmic, cool expression",
          body_movement: "head bobbing, shoulders moving to beat, rhythmic body sway",
          image_prompt_suffix: "doing beatbox, mouth open making beat sounds, rhythmic expression, stage lighting, cool pose",
          bgm_style: "beatbox rhythmic, mouth percussion, vocal drums, bass drops",
        },
        singing: {
          character_action: "singing with emotion, slight body sway, eyes sometimes closed feeling music",
          facial_expression: "emotional and passionate, singing expression",
          body_movement: "gentle swaying, occasional hand gestures, feeling the music",
          image_prompt_suffix: "singing into microphone, emotional expression, stage spotlight, passionate pose",
          bgm_style: "vocal melody, acapella harmony, cute singing, melodic tune",
        },
        dance: {
          character_action: "dancing energetically, paws moving, body grooving to beat",
          facial_expression: "happy and energetic, enjoying dance",
          body_movement: "full body dance moves, jumping, spinning, grooving",
          image_prompt_suffix: "dancing, dynamic pose, colorful stage lights, dance floor, energetic",
          bgm_style: "dance beat, EDM rhythm, energetic, club music",
        },
        rap: {
          character_action: "rapping with swagger, hand gestures, confident head movements",
          facial_expression: "confident and cool, swagger expression",
          body_movement: "swag movements, hand gestures, head nodding to beat",
          image_prompt_suffix: "rapper with swag, cool pose, hip-hop style, mic in paw, confident",
          bgm_style: "hip-hop beat, trap instrumental, 808 bass, rap backing track",
        },
        instrument: {
          character_action: "playing instrument with passion, body moving with music",
          facial_expression: "focused and passionate, musician expression",
          body_movement: "hands/paws on instrument, body swaying with melody",
          image_prompt_suffix: "playing instrument, focused expression, musical performance, stage setting",
          bgm_style: "instrumental solo, musical performance",
        },
      };

      script.script_segments = script.script_segments.map((seg, idx) => {
        const charLen = seg.narration?.length || 0;
        const speaker = ["main", "sub1", "sub2", "sub3"].includes(seg.speaker) ? seg.speaker : "interviewer";
        const character = characters[speaker] || characters.main;
        const isInterviewQuestion = speaker === "interviewer" || seg.scene_type === "interview_question";

        // 퍼포먼스 씬 타입 감지
        const sceneType = seg.scene_type;
        const isPerformanceStart = sceneType === "performance_start";
        const isPerformanceBreak = sceneType === "performance_break";
        const isPerformanceResume = sceneType === "performance_resume";
        const isAnyPerformance = isPerformanceScene(sceneType) || isPerformanceStart || isPerformanceBreak || isPerformanceResume;

        // duration 계산 (Veo3: 4/6/8초만 가능)
        const findClosest = (t) => VEO3_ALLOWED_DURATIONS.reduce((p, c) => Math.abs(c - t) < Math.abs(p - t) ? c : p);
        const preferredDuration = isPerformanceBreak ? 4 : 6;
        const calcDuration = seg.duration || (!seg.duration && charLen > 0 ? findClosest(Math.ceil(charLen / lang.charsPerSec)) : preferredDuration);
        const duration = VEO3_ALLOWED_DURATIONS.includes(calcDuration) ? calcDuration : findClosest(calcDuration);

        // narration 유무 (퍼포먼스 start/resume는 narration 없음)
        const hasNarration = (isPerformanceStart || isPerformanceResume) ? false : !!(seg.narration?.trim());

        // 퍼포먼스 타입별 처리
        const performanceType = getPerformanceType(sceneType);
        const perfDefaults = performanceType ? performanceDefaults[performanceType] : null;
        const videoPrompt = seg.video_prompt || {};
        const isPerformance = isPerformanceScene(sceneType);

        const defaultVideoPrompt = (isPerformanceStart || isPerformanceResume) ? {
          character_action: perfDefaults?.character_action || "mouth moving to beat rhythm, head bobbing, body grooving",
          lip_sync: "yes", lip_sync_to: "bgm",
          facial_expression: perfDefaults?.facial_expression || "cool and rhythmic",
          body_movement: perfDefaults?.body_movement || "rhythmic body movement to beat",
          camera_movement: "dynamic", is_performance: true, performance_phase: isPerformanceStart ? "start" : "resume",
        } : isPerformanceBreak ? {
          character_action: "pausing performance, looking at camera, saying short word",
          lip_sync: "yes", lip_sync_to: "tts",
          facial_expression: "confident and cool", body_movement: "brief pause, then dramatic pose",
          camera_movement: "zoom_in", is_performance: true, performance_phase: "break",
        } : (isPerformance && perfDefaults) ? {
          character_action: perfDefaults.character_action, lip_sync: "yes", lip_sync_to: "bgm",
          facial_expression: perfDefaults.facial_expression, body_movement: perfDefaults.body_movement,
          camera_movement: "dynamic", is_performance: true, performance_type: performanceType,
        } : {
          character_action: isInterviewQuestion ? "listening attentively with curious expression, head slightly tilted, ears perked up"
            : (hasNarration ? "talking with perfectly synchronized lip movements" : "natural idle animation"),
          lip_sync: isInterviewQuestion ? "no" : (hasNarration ? "yes" : "no"),
          facial_expression: isInterviewQuestion ? "curious listening" : (seg.emotion || "happy"),
          body_movement: isInterviewQuestion ? "subtle listening pose, occasional small nod, ears twitching"
            : (hasNarration ? "subtle expressive gestures while talking" : "gentle breathing and natural movements"),
          camera_movement: "static", is_interviewer_speaking: isInterviewQuestion,
        };

        const sceneDetails = seg.scene_details || {};
        const defaultSceneDetails = { location: "indoor", background: "cozy living room with soft warm lighting", weather: "none", lighting: "warm soft natural", mood: "cozy heartwarming", characters_in_scene: [character.name] };

        const audioDetails = seg.audio_details || {};
        const defaultAudioDetails = (isPerformanceStart || isPerformanceResume) ? {
          voice_style: "no voice - BGM only", voice_type: "none", speaking_speed: "none", sound_effects: [], background_sound: "",
          bgm_featured: true, bgm_volume: 0.8, performance_phase: isPerformanceStart ? "start" : "resume",
          bgm_style: perfDefaults?.bgm_style || "beatbox rhythmic", tts_enabled: false,
        } : isPerformanceBreak ? {
          voice_style: "robotic voice effect", voice_type: "robotic", voice_effect: "robotic", speaking_speed: "fast",
          sound_effects: ["record scratch", "bass drop"], background_sound: "",
          bgm_featured: false, bgm_volume: 0, performance_phase: "break", tts_enabled: true,
        } : (isPerformance && perfDefaults) ? {
          voice_style: "no voice - BGM only", voice_type: "none", speaking_speed: "none", sound_effects: [], background_sound: "",
          bgm_featured: true, bgm_volume: 0.8, performance_type: performanceType, bgm_style: perfDefaults.bgm_style, tts_enabled: false,
        } : {
          voice_style: voiceStyleMap[speaker] || "natural voice", voice_type: speakerToVoice[speaker] || "adult",
          speaking_speed: speaker === "main" ? "slow and cute" : "natural", sound_effects: [], background_sound: "",
          bgm_featured: false, bgm_volume: 0.3, tts_enabled: true,
        };

        // 이미지 프롬프트
        const basePrompt = character.analysis?.image_generation_prompt || "cute adorable puppy";
        const imagePrompt = seg.image_prompt || (isAnyPerformance
          ? `${basePrompt}, ${perfDefaults?.image_prompt_suffix || "doing performance, stage lighting, energetic pose"}`
          : `${basePrompt}, ${isInterviewQuestion ? "curious listening" : seg.emotion || "happy"} expression`);

        const performancePhase = isPerformanceStart ? "start" : isPerformanceBreak ? "break" : isPerformanceResume ? "resume" : isPerformance ? "main" : null;
        const ttsEnabled = isPerformanceBreak ? true : (isPerformanceStart || isPerformanceResume || isPerformance) ? false : hasNarration;
        const ttsVoice = isPerformanceBreak ? "Korean baby girl with robotic effect"
          : (isPerformanceStart || isPerformanceResume || isPerformance) ? null
          : isInterviewQuestion ? "Korean female news anchor, 30s, professional friendly tone" : "Korean baby girl, 2-3 years old toddler voice";

        // 캐릭터 언어 처리 (번역 단계 감지 > 캐릭터 설정 > 기본값)
        const finalSpokenLang = seg.spoken_language || character.spoken_language || "korean";
        const narrationKorean = finalSpokenLang === "english" ? (seg.narration_korean || seg.narration || "") : (seg.narration || "");

        const voiceType = (isPerformanceStart || isPerformanceResume) ? "none" : isPerformanceBreak ? "robotic" : (speakerToVoice[speaker] || "adult");
        const lipSyncTo = (isPerformanceStart || isPerformanceResume) ? "bgm" : isPerformanceBreak ? "tts" : (hasNarration ? "tts" : null);
        const bgmVol = (isPerformanceStart || isPerformanceResume || isPerformance) ? 0.8 : isPerformanceBreak ? 0 : 0.3;

        time += duration;
        // ★★★ 영어 번역 폴백 처리 ★★★
        // 1) AI가 생성한 narration_english
        // 2) 영어 캐릭터면 narration 그대로
        // 3) 한국어 대사면 [Korean] 표시 (나중에 번역 필요)
        const narrationEnglish = seg.narration_english
          || (finalSpokenLang === "english" ? seg.narration : "")
          || (seg.narration ? `[${seg.narration}]` : "");  // 한국어 대사를 표시 (번역 대기)

        return {
          ...seg, index: idx + 1, segment_number: idx + 1, start_time: time - duration, end_time: time, duration, speaker,
          character_name: character.name, spoken_language: finalSpokenLang, voice_type: voiceType,
          scene_type: sceneType || "narration", has_narration: hasNarration,
          narration_korean: narrationKorean, narration_english: narrationEnglish, image_prompt: imagePrompt,
          video_prompt: { ...defaultVideoPrompt, ...videoPrompt,
            lip_sync: isAnyPerformance ? "yes" : (isInterviewQuestion ? "no" : (hasNarration ? "yes" : (videoPrompt.lip_sync || "no"))),
            lip_sync_to: lipSyncTo, is_interviewer_speaking: isInterviewQuestion,
            is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase,
          },
          scene_details: { ...defaultSceneDetails, ...sceneDetails,
            ...(isAnyPerformance ? { location: "stage", background: sceneDetails.background || "concert stage with colorful spotlights and neon lights",
              lighting: sceneDetails.lighting || "dramatic stage lighting with colorful spotlights", mood: sceneDetails.mood || "energetic performance" } : {}),
          },
          audio_details: { ...defaultAudioDetails, ...audioDetails },
          is_performance: isAnyPerformance, performance_type: performanceType, performance_phase: performancePhase,
          bgm_featured: (isPerformanceStart || isPerformanceResume || isPerformance), bgm_volume: bgmVol,
          tts_enabled: ttsEnabled, tts_voice: ttsVoice, voice_effect: isPerformanceBreak ? "robotic" : null,
          dog_lip_sync: isAnyPerformance ? "yes" : (!isInterviewQuestion && hasNarration),
        };
      });
      script.total_duration = time;
    }

    // =====================
    // 11. folder_name 생성
    // =====================
    const { v4: uuidv4 } = await import("uuid");
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const shortUuid = uuidv4().split("-")[0];
    const safeTitle = (script.title?.english || "video").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;

    // =====================
    // 11-1. 일관성 정보 구성 (모든 씬에 동일하게 적용)
    // =====================

    // ★★★ 퍼포먼스 타입별 악세서리 설정 ★★★
    const performanceAccessoriesMap = {
      beatbox: "wearing cool black sunglasses, gold chain necklace, backwards snapback cap",
      singing: "holding wireless microphone, wearing sparkly stage outfit, small earpiece",
      dance: "wearing trendy sunglasses, colorful LED sneakers, sporty headband",
      rap: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, holding microphone",
      hiphop: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, baggy clothes",
      instrument: "wearing round stylish glasses, bow tie, formal vest",
      kpop: "wearing stylish outfit, small accessories, polished look, idol-style fashion",
    };

    // ★★★ 전역 퍼포먼스 타입 (topic-generator → script-generator → image-generator) ★★★
    const hasPerformanceScenes = script.script_segments?.some(seg =>
      ["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)
    ) || (contentType === "performance");

    // ★★★ 퍼포먼스 타입: topic-generator에서 사용자가 선택한 타입 우선 사용! ★★★
    const globalPerformanceType = primaryPerformanceType
      || script.script_segments?.find(seg => seg.performance_type)?.performance_type
      || "beatbox";

    // ★★★ 전역 퍼포먼스 악세서리 (모든 퍼포먼스 씬에 동일하게 적용) ★★★
    const globalPerformanceAccessories = hasPerformanceScenes
      ? (performanceAccessoriesMap[globalPerformanceType] || performanceAccessoriesMap.beatbox)
      : "";

    $.export("performance_config", {
      has_performance: hasPerformanceScenes,
      type: globalPerformanceType,
      accessories: globalPerformanceAccessories,
    });

    // ★★★ 일관된 배경 설정 ★★★
    const firstSceneBackground = script.script_segments?.[0]?.scene_details?.background
      || backgroundPrompt
      || "clean professional studio background with soft gradient";

    const firstSceneLighting = script.script_segments?.[0]?.scene_details?.lighting
      || "warm soft natural lighting";

    // 퍼포먼스 스테이지 배경
    const performanceStageBackground = "dark concert stage with purple and blue neon lights, colorful spotlights from above, subtle smoke effects at the bottom";

    // ★★★ 일관성 정보 객체 ★★★
    const consistencyInfo = {
      // 캐릭터 일관성
      main_character_prompt: characters.main?.analysis?.image_generation_prompt || "cute adorable puppy",
      main_character_image_url: this.main_character_image_url,

      // 배경 일관성
      consistent_background: firstSceneBackground,
      consistent_lighting: firstSceneLighting,
      performance_stage_background: performanceStageBackground,

      // 퍼포먼스 일관성
      has_performance: hasPerformanceScenes,
      performance_type: globalPerformanceType,
      performance_accessories: globalPerformanceAccessories,

      // 실제 강아지 강조 (탈/마스코트 방지)
      real_dog_emphasis: "Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. NOT a stuffed animal. NOT a person in dog mask. Real fur. Real animal.",

      // 텍스트 제거 (한글 깨짐 방지)
      no_text_emphasis: "No text anywhere. No signs. No banners. No posters. No letters. No words. No writing. No Korean text. No watermarks. Clean background without any text elements.",
    };

    $.export("consistency_info", consistencyInfo);

    // =====================
    // 12. 결과 반환 (대본 + 캐릭터 정보만, image/video generation은 분리)
    // =====================
    $.export("$summary", `${contentTypeConfig.emoji} [${contentTypeConfig.name}] ${script.script_segments?.length || 0} scenes, ${script.total_duration}s, ${Object.keys(characters).length} characters`);

    return {
      folder_name: folderName,
      language: this.language,
      script_text: script.full_script,
      total_duration_seconds: script.total_duration,
      title: script.title,

      // 콘텐츠 타입 정보
      content_type: contentType,
      content_type_config: contentTypeConfig,
      content_type_info: contentTypeInfo,

      // 토픽 정보
      topic_info: {
        topic: effectiveTopic,
        content_type: contentType,
        is_satire: isSatire,
        original_topic: originalTopic,
        keyword_hint: keywordHint,
        satire_info: satireInfo,
        story_context: storyContext,
        daily_context: dailyContext,
        script_format: scriptFormat,
      },

      // ★★★ 일관성 정보 (이미지/비디오 생성기에서 사용) ★★★
      consistency: consistencyInfo,

      // 캐릭터 정보 (이미지/비디오 생성기에서 사용)
      characters: Object.fromEntries(
        Object.entries(characters).map(([key, char]) => [
          key,
          {
            name: char.name,
            role: char.role,
            image_url: char.image_url,
            character_type: char.analysis.character_type,
            species: char.analysis.species,
            breed: char.analysis.breed,
            estimated_age: char.analysis.estimated_age,
            gender: char.analysis.gender,
            estimated_age_range: char.analysis.estimated_age_range,
            personality: char.analysis.personality_impression,
            voice_type: char.analysis.suggested_voice_type,
            image_prompt: char.analysis.image_generation_prompt,
            distinctive_features: char.analysis.distinctive_features,
            accessories: char.analysis.accessories,
            clothing: char.analysis.clothing,
            fur_color: char.analysis.fur_color,
            fur_texture: char.analysis.fur_texture,
            eye_color: char.analysis.eye_color,
          }
        ])
      ),

      // ★★★ BGM 정보 (퍼포먼스 타입 반영) ★★★
      // (TTS 정보는 script.script_segments에 통합됨)
      bgm: (() => {
        // 새로운 퍼포먼스 구조 감지 (start, break, resume)
        const performanceStartSegments = script.script_segments?.filter(
          seg => seg.scene_type === "performance_start"
        ) || [];
        const performanceBreakSegments = script.script_segments?.filter(
          seg => seg.scene_type === "performance_break"
        ) || [];
        const performanceResumeSegments = script.script_segments?.filter(
          seg => seg.scene_type === "performance_resume"
        ) || [];
        // 기존 호환성
        const oldPerformanceSegments = script.script_segments?.filter(
          seg => seg.is_performance && !["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)
        ) || [];

        const allPerformanceSegments = [...performanceStartSegments, ...performanceBreakSegments, ...performanceResumeSegments, ...oldPerformanceSegments];
        const hasPerformance = allPerformanceSegments.length > 0;
        const performanceTypes = [...new Set(allPerformanceSegments.map(seg => seg.performance_type).filter(Boolean))];

        // 퍼포먼스 타입별 BGM 스타일
        const performanceBgmStyles = {
          beatbox: "beatbox rhythmic, mouth percussion, vocal drums, bass drops, snare hits, hi-hat patterns",
          singing: "vocal melody, acapella harmony, cute singing, kawaii voice, melodic tune",
          dance: "dance beat, EDM rhythm, trap beat, hip-hop groove, bass heavy club music",
          rap: "hip-hop beat, trap instrumental, 808 bass, snare rolls, rap backing track",
          instrument: "instrumental solo, musical performance",
        };

        if (hasPerformance) {
          const primaryPerformanceType = performanceTypes[0] || "beatbox";

          return {
            mood: script.music_mood || "energetic",
            duration: script.total_duration,
            is_performance: true,
            performance_types: performanceTypes,
            primary_performance_type: primaryPerformanceType,
            bgm_style: performanceBgmStyles[primaryPerformanceType] || "energetic rhythmic",
            // 퍼포먼스 구간 정보는 script.script_segments에서 scene_type으로 확인 가능
          };
        }

        // 일반 BGM (퍼포먼스 아닐 때)
        return {
          mood: script.music_mood || "cute",
          duration: script.total_duration,
          is_performance: false,
        };
      })(),

      // 스크립트 전체 (씬별 상세 정보 포함)
      script: script,
    };
  },
});