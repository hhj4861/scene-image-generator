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
    // 2. 이미지 분석 함수
    // =====================
    const analyzeCharacterImage = async (imageUrl, characterType) => {
      if (!imageUrl) return null;

      try {
        const imageResponse = await axios($, { method: "GET", url: imageUrl, responseType: "arraybuffer" });
        const imageBase64 = Buffer.from(imageResponse).toString("base64");
        const mimeType = imageUrl.includes(".png") ? "image/png" : "image/jpeg";

        const analysisPrompt = characterType === "animal"
          ? `Analyze this animal image in EXTREME DETAIL for consistent image regeneration.

Return JSON only:
{
  "character_type": "animal",
  "species": "exact species (예: dog, cat, rabbit)",
  "breed": "exact breed (예: Pomeranian, Golden Retriever, Persian cat)",
  "estimated_age": "puppy/adult/senior",
  "gender_appearance": "male/female/unknown",
  "fur_color": "EXACT fur color with details (예: golden cream with white chest, orange tabby with white paws)",
  "fur_texture": "fluffy/smooth/curly/long/short",
  "fur_pattern": "solid/spotted/striped/mixed - describe pattern",
  "eye_color": "exact eye color",
  "nose_color": "black/pink/brown",
  "ear_shape": "pointy/floppy/rounded",
  "size": "small/medium/large",
  "distinctive_features": ["specific unique features - scars, markings, etc"],
  "accessories": ["EXACT accessories with colors - grey knit sweater, red collar, blue leash"],
  "personality_impression": "cute/playful/calm/fierce",
  "image_generation_prompt": "CRITICAL: Write a VERY SPECIFIC prompt that will generate the EXACT SAME animal. Include: breed, fur color+pattern, eye color, nose color, ear shape, size, ALL accessories with colors. Example: 'Pomeranian puppy with golden cream fluffy fur, white chest patch, dark brown eyes, small black nose, pointy ears, wearing a grey knitted sweater with brown leather tag, yellow leash attached'",
  "suggested_voice_type": "baby_girl/child_boy/adult_female"
}`
          : `Analyze this person image in EXTREME DETAIL for consistent image regeneration.

Return JSON only:
{
  "character_type": "human",
  "estimated_age_range": "20s/30s/40s/50s/60s+",
  "gender": "male/female",
  "ethnicity": "Asian/Caucasian/African/Hispanic/etc",
  "skin_tone": "fair/medium/tan/dark",
  "hair_color": "exact color (예: dark brown, salt-and-pepper grey)",
  "hair_style": "exact style (예: short bob, long wavy, tied back)",
  "hair_length": "short/medium/long",
  "eye_color": "exact color",
  "eye_shape": "round/almond/monolid",
  "facial_features": "specific features - round face, high cheekbones, etc",
  "body_type": "slim/average/heavy",
  "clothing": "EXACT clothing with colors (예: burgundy dress with white pearl necklace)",
  "accessories": ["ALL accessories with colors - glasses, jewelry, etc"],
  "personality_impression": "warm/stern/friendly/elegant",
  "image_generation_prompt": "CRITICAL: Write a VERY SPECIFIC prompt that will generate the EXACT SAME person. Include: age, gender, ethnicity, skin tone, hair color+style, eye details, facial features, body type, EXACT clothing with colors, ALL accessories. Example: 'Asian woman in her 50s, fair skin, short black bob hair, warm brown eyes, round friendly face, wearing a burgundy bell-sleeve dress with white pearl necklace, gentle maternal smile'",
  "suggested_voice_type": "elderly_female/adult_male/child_female"
}`;

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
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
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

    const [mainCharAnalysis, sub1Analysis, sub2Analysis, sub3Analysis] = await Promise.all([
      analyzeCharacterImage(this.main_character_image_url, "animal"),
      analyzeCharacterImage(this.sub_character1_image_url, "human"),
      analyzeCharacterImage(this.sub_character2_image_url, "human"),
      analyzeCharacterImage(this.sub_character3_image_url, "human"),
    ]);

    // 캐릭터 정보 구성
    const characters = {
      main: {
        name: this.main_character_name || "땅콩",
        role: "main",
        image_url: this.main_character_image_url,
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
    const characterDescriptions = Object.entries(characters).map(([key, char]) => {
      const analysis = char.analysis;

      if (key === "interviewer") {
        return `- ${char.name} (INTERVIEWER): 화면에 등장하지 않음 (음성만)
  역할: 질문하는 인터뷰어
  음성: ${analysis.voice_description || "Korean female news anchor, 30s, professional friendly tone"}
  ⚠️ 인터뷰어가 질문할 때: 강아지는 듣는 표정, lip_sync 없음`;
      }

      if (analysis.character_type === "animal") {
        return `- ${char.name} (${key.toUpperCase()}): ${analysis.species || "animal"}, ${analysis.breed || "unknown breed"}, ${analysis.estimated_age || "unknown age"}, ${analysis.personality_impression || "cute"} personality, Voice: ${analysis.suggested_voice_type || "baby_girl"}
  외형: ${analysis.image_generation_prompt || "cute animal"}
  특징: ${(analysis.distinctive_features || []).join(", ") || "adorable"}
  악세서리: ${(analysis.accessories || []).join(", ") || "none"}`;
      } else {
        return `- ${char.name} (${key.toUpperCase()}): ${analysis.gender || "unknown"}, ${analysis.estimated_age_range || "unknown age"}, ${analysis.personality_impression || "friendly"} personality, Voice: ${analysis.suggested_voice_type || "adult"}
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
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}
**Themes**: ${contentTypeConfig.themes?.join(", ") || "시사 풍자"}
**Emotion Range**: ${contentTypeConfig.emotion_range?.join(", ") || "분노, 억울, 당당"}

${originalTopic ? `
### 🎯 USER INPUT - SATIRE/PARODY TRANSFORMATION (CRITICAL!)
**Original Topic to Satirize**: "${userTopic}"
**Conversion Hints**: "${userHint}"

### YOUR MISSION:
Transform the above real-world topic into a PUPPY-VERSION SATIRE/PARODY.
The original topic should be recognizable but converted into a cute, funny puppy world scenario.

### TRANSFORMATION RULES:
1. **Keep the core structure** of the original topic (numbers, scale, impact)
2. **Replace human elements** with puppy/dog world equivalents
3. **Use the keyword hints** to guide the transformation
4. **Make it funny and cute** while maintaining the satirical edge
5. **The satire should be obvious** but not offensive

### TRANSFORMATION EXAMPLES:
| Original Topic | Keyword Hints | Puppy Version |
|---------------|---------------|---------------|
| 쿠팡 개인정보 유출 3700만건 | 중국, 차우차우, 사료 | "중국집 차우차우한테 3700만개 사료 털린 강아지의 분노" |
| 테슬라 자율주행 사고 | 로봇청소기, 충돌 | "자율주행 로봇청소기에 치인 강아지의 복수극" |
| 국회 난투극 | 강아지 유치원, 싸움 | "강아지 유치원 간식시간 난투극 현장" |
` : `
### 🎯 AUTO-GENERATE SATIRE MODE:
Generate satirical puppy content based on current trends and news.
`}`,

        comic: `
## 😂 콘텐츠 타입: 코믹 (COMIC MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### COMIC ELEMENTS:
1. **반전 (Twist)** - 예상 밖의 결말로 웃음 유발
2. **과장 (Exaggeration)** - 귀여운 과장으로 코믹한 상황
3. **실패 (Fail)** - 강아지의 귀여운 실패 모음
4. **당황 (Confusion)** - 멘붕하는 강아지의 표정
5. **vs 시리즈** - 강아지 vs 로봇청소기, 강아지 vs 거울 등`,

        emotional: `
## 🥺 콘텐츠 타입: 감동 (EMOTIONAL MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### EMOTIONAL ELEMENTS:
1. **재회 (Reunion)** - 오랜만에 만난 주인/가족
2. **성장 (Growth)** - 아기 강아지의 성장 스토리
3. **우정 (Friendship)** - 다른 동물/강아지와의 우정
4. **감사 (Gratitude)** - 주인에게 감사하는 마음
5. **극복 (Overcome)** - 어려움을 이겨낸 이야기

### EMOTIONAL STORY ARC:
평범한 시작 → 감정적 계기 → 클라이맥스 (눈물) → 따뜻한 마무리`,

        daily: `
## 😊 콘텐츠 타입: 일상 (DAILY MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### DAILY VLOG ELEMENTS:
1. **루틴 (Routine)** - 아침/저녁 루틴, 산책 루틴
2. **먹방 (Eating)** - 간식 타임, 밥 먹기
3. **놀이 (Play)** - 장난감, 공놀이
4. **휴식 (Rest)** - 낮잠, 이불 속
5. **산책 (Walk)** - 동네 산책, 공원`,

        mukbang: `
## 🍽️ 콘텐츠 타입: 먹방 (MUKBANG MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### MUKBANG ELEMENTS:
1. **리뷰 (Review)** - 신상 간식 리뷰, 비교 리뷰
2. **ASMR** - 사각사각, 오도독 먹는 소리
3. **반응 (Reaction)** - 처음 먹어보는 음식 반응
4. **랭킹 (Ranking)** - 간식 순위, 최애 간식
5. **먹방 (Eating Show)** - 맛있게 먹는 모습`,

        healing: `
## 💕 콘텐츠 타입: 힐링 (HEALING MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### HEALING ELEMENTS:
1. **휴식 (Rest)** - 포근한 이불, 햇살 아래
2. **자연 (Nature)** - 비 오는 날, 눈 오는 날
3. **함께함 (Together)** - 주인과 함께하는 시간
4. **평화 (Peace)** - 조용한 오후, 나른한 시간
5. **치유 (Comfort)** - 힘든 하루 끝 위로`,

        drama: `
## 🎬 콘텐츠 타입: 드라마 (DRAMA MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### DRAMA ELEMENTS:
1. **갈등 (Conflict)** - 문제 상황, 위기
2. **미스터리 (Mystery)** - 사라진 간식, 수상한 소리
3. **모험 (Adventure)** - 탈출, 탐험, 도전
4. **로맨스 (Romance)** - 옆집 강아지와의 사랑
5. **성장 (Growth)** - 두려움 극복, 용기

### DRAMA STORY STRUCTURE:
1. **도입** - 평화로운 일상
2. **사건 발생** - 갈등/문제 등장
3. **전개** - 해결을 위한 노력
4. **클라이맥스** - 최고 긴장 순간
5. **결말** - 해피엔딩 또는 반전`,

        performance: `
## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)
**Tone**: ${contentTypeConfig.tone}
**Mood**: ${contentTypeConfig.mood}

### ⚠️⚠️⚠️ 퍼포먼스 = 인터뷰 + 퍼포먼스 씬 하이브리드! ⚠️⚠️⚠️

퍼포먼스 콘텐츠는 **인터뷰 형식 중간에 퍼포먼스 씬을 삽입**하는 구조입니다!

### 📋 전체 스크립트 구조 (30초 기준)

1. **인터뷰 질문 1** - speaker: "interviewer" (존대말 필수!)
   - scene_type: "interview_question"
   - narration: "땅콩 씨, 비트박스를 시작하게 된 계기가 무엇인가요?"

2. **인터뷰 대답 1** - speaker: "main"
   - scene_type: "interview_answer"
   - narration: "어릴 때부터 리듬을 타는 게 너무 좋았어요!"

3. **인터뷰 질문 2 (퍼포먼스 유도)** - speaker: "interviewer"
   - scene_type: "interview_question"
   - narration: "그렇군요! 그럼 오늘 비트박스 실력을 보여주시겠어요?"

4. **퍼포먼스 시작 (4초)** - speaker: "main"
   - scene_type: "performance_start"
   - narration: "" (대사 없음!)
   - has_narration: false
   - audio_details.bgm_featured: true
   - audio_details.bgm_volume: 0.8
   - 설명: BGM 비트박스 음악이 나오고, 강아지가 BGM에 맞춰 입 움직임

5. **퍼포먼스 멈춤 + 대사 (2초)** - speaker: "main"
   - scene_type: "performance_break"
   - narration: "콩파민!" (짧은 단어 2-3글자!)
   - has_narration: true
   - audio_details.bgm_featured: false (BGM 멈춤!)
   - audio_details.bgm_volume: 0
   - audio_details.voice_effect: "robotic"
   - 설명: BGM 멈추고, 강아지가 기계음으로 외침

6. **퍼포먼스 재개 (4초)** - speaker: "main"
   - scene_type: "performance_resume"
   - narration: "" (대사 없음!)
   - has_narration: false
   - audio_details.bgm_featured: true
   - audio_details.bgm_volume: 0.8
   - 설명: BGM 다시 시작, 강아지가 BGM에 맞춰 다시 립싱크

7. **인터뷰 마무리** - speaker: "interviewer"
   - scene_type: "interview_question"
   - narration: "와! 정말 대단하시네요! 마지막으로 한마디 해주세요."

8. **아웃트로** - speaker: "main"
   - scene_type: "interview_answer"
   - narration: "헥헥... 구독하고 좋아요 눌러주세요!"

### 🎵 퍼포먼스 씬 3단계 (필수!)

#### STEP 1: performance_start (3-4초)
- narration: "" (빈 문자열!)
- has_narration: false
- bgm_featured: true, bgm_volume: 0.8
- 강아지가 BGM에 맞춰 입 움직임 (립싱크)

#### STEP 2: performance_break (2-3초)
- narration: "콩파민!" 등 짧은 단어 (2-3글자)
- has_narration: true
- bgm_featured: false, bgm_volume: 0 (BGM 멈춤!)
- voice_effect: "robotic" (기계음)
- BGM 멈추고 강아지가 기계음으로 외침

#### STEP 3: performance_resume (3-4초)
- narration: "" (빈 문자열!)
- has_narration: false
- bgm_featured: true, bgm_volume: 0.8
- BGM 다시 시작, 강아지 립싱크

### 🎙️ 인터뷰어 규칙
- ⚠️ **인터뷰어는 항상 존대말!**
- ❌ 금지: "땅콩아, 비트박스 해봐" (반말)
- ✅ 올바른 예: "땅콩 씨, 비트박스 실력을 보여주시겠어요?" (존대말)

### 🎵 퍼포먼스 타입별 설정

#### 비트박스 (Beatbox)
- break 대사: "콩파민!", "부웅!", "츠크츠크!"
- BGM: beatbox rhythmic, mouth percussion

#### 노래 (Singing)
- break 대사: "랄랄라!", "우우!", "예에!"
- BGM: vocal melody, acapella

#### 댄스 (Dance)
- break 대사: "이얍!", "춤춰!", "고고!"
- BGM: dance beat, EDM

#### 랩 (Rap)
- break 대사: "요!", "간식왕!", "멍멍!"
- BGM: hip-hop beat, trap

### ⚠️ FINAL CHECKLIST:
- ✅ 인터뷰어는 존대말 사용!
- ✅ 퍼포먼스 씬 3단계 (start → break → resume) 반드시 포함!
- ✅ performance_start/resume는 narration 빈 문자열!
- ✅ performance_break만 짧은 대사 (2-3글자) + voice_effect: "robotic"!

### 📋 JSON 출력 예시
\`\`\`json
{
  "title": {"korean": "땅콩의 비트박스 데뷔", "english": "Peanut's Beatbox Debut"},
  "script_segments": [
    {"segment_number": 1, "speaker": "interviewer", "scene_type": "interview_question", "narration": "땅콩 씨, 비트박스를 시작하게 된 계기가 무엇인가요?", "has_narration": true},
    {"segment_number": 2, "speaker": "main", "scene_type": "interview_answer", "narration": "어릴 때부터 리듬 타는 게 좋았어요!", "has_narration": true},
    {"segment_number": 3, "speaker": "interviewer", "scene_type": "interview_question", "narration": "오늘 실력을 보여주시겠어요?", "has_narration": true},
    {"segment_number": 4, "speaker": "main", "scene_type": "performance_start", "narration": "", "has_narration": false, "audio_details": {"bgm_featured": true, "bgm_volume": 0.8}},
    {"segment_number": 5, "speaker": "main", "scene_type": "performance_break", "narration": "콩파민!", "has_narration": true, "audio_details": {"bgm_featured": false, "bgm_volume": 0, "voice_effect": "robotic"}},
    {"segment_number": 6, "speaker": "main", "scene_type": "performance_resume", "narration": "", "has_narration": false, "audio_details": {"bgm_featured": true, "bgm_volume": 0.8}},
    {"segment_number": 7, "speaker": "interviewer", "scene_type": "interview_question", "narration": "대단하시네요! 마지막 한마디 해주세요.", "has_narration": true},
    {"segment_number": 8, "speaker": "main", "scene_type": "interview_answer", "narration": "헥헥... 구독 눌러주세요!", "has_narration": true}
  ]
}
\`\`\``,

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
★★★ 스크립트 형식: INTERVIEW (매우 중요!!!) ★★★

🎤 **인터뷰 형식 (INTERVIEW FORMAT) - 반드시 이 형식으로 작성!**

⚠️ **절대 규칙: 할미, 할비 등 조연이 직접 대화하는 장면 금지!**
⚠️ **오직 인터뷰어 질문 → 주인공 대답 구조만 사용!**

### 🎙️ 인터뷰어 말투 규칙 (CRITICAL!)
⚠️ **인터뷰어는 항상 존대말(존칭)을 사용!**
- ❌ 금지: "콩아, 비트박스를 시작하게 된 계기가 뭐야?" (반말)
- ❌ 금지: "그래서 어떻게 됐어?" (반말)
- ✅ 올바른 예: "땅콩 씨, 비트박스를 시작하게 된 계기가 무엇인가요?" (존대말)
- ✅ 올바른 예: "그래서 어떻게 되셨나요?" (존대말)
- ✅ 올바른 예: "당시 심정이 어떠셨나요?" (존대말)
- 인터뷰어는 전문 뉴스 앵커처럼 격식있고 정중하게 질문!

**인터뷰 구성 (필수!):**
1. 인터뷰어가 질문할 때: 강아지는 듣는 표정 (lip_sync: no), 인터뷰어 음성만 재생
2. 주인공(강아지)이 대답할 때: 카메라 정면 보고 말하기 (lip_sync: yes)
3. 필요시 과거 회상 장면 삽입 (flashback)
4. 조연(할미 등)은 회상 장면에서만 등장 가능

**올바른 인터뷰 형식 예시:**
[인터뷰어 질문 - 자막만] "이 사건에 대해 어떻게 생각하세요?"
[땅콩 - 카메라 정면] "아니 내가 말이야... 진짜 어이가 없어서..."

[인터뷰어 질문 - 자막만] "당시 상황을 설명해주세요"
[땅콩 - 회상하며] "그날 밤이었어... (회상 장면 시작)"
[회상 장면] 차우차우가 사료를 털어가는 모습
[땅콩 - 다시 카메라] "그래서 3700만 봉지가 사라진거야!"

**segment 구성:**
- scene_type: "interview_question" → speaker: "interviewer", narration: 질문 내용
- scene_type: "interview_answer" → speaker: "main", narration: 대답 내용
- scene_type: "flashback" → speaker: "main", narration: 회상 나레이션

**speaker 규칙:**
- "interviewer": 질문만 (화면에 자막, 음성 없음)
- "main": 주인공 강아지 (대부분의 대답, 80% 이상)
- "sub1", "sub2": 회상 장면에서만 등장 가능`;
      } else if (scriptFormat === 'monologue') {
        return `
★★★ 스크립트 형식: MONOLOGUE ★★★

📖 **독백 형식 (MONOLOGUE FORMAT)**
강아지가 혼자 이야기하는 1인칭 나레이션.

**구성 예시:**
- "오늘 있었던 일을 말해줄게..."
- "내가 얼마나 억울했는지 알아?"

**특징:**
- 강아지 시점의 스토리텔링
- 감정 이입이 쉬움`;
      } else if (scriptFormat === 'dialogue') {
        return `
★★★ 스크립트 형식: DIALOGUE ★★★

💬 **대화 형식 (DIALOGUE FORMAT)**
강아지와 주인/다른 동물의 대화.

**구성 예시:**
- 강아지: "할미! 이거 봐!"
- 할머니: "어머, 이게 뭐야?"

**특징:**
- 자연스러운 일상 대화
- 여러 캐릭터 등장`;
      } else {
        return `
★★★ 스크립트 형식: MIXED ★★★

🎭 **혼합 형식 (MIXED FORMAT)**
상황에 맞게 인터뷰/독백/대화를 AI가 자동 선택.
풍자 콘텐츠는 주로 인터뷰 형식 추천.`;
      }
    };

    // =====================
    // 8. 스크립트 생성 프롬프트
    // =====================
    const mainCharPrompt = characters.main.analysis.image_generation_prompt || "cute adorable puppy";

    const prompt = `Create a viral YouTube Short script with DETAILED visual descriptions.

★★★ VEO3 VIDEO DURATION RULES (매우 중요!) ★★★
- ⚠️ Veo3는 4초, 6초, 8초만 지원! (5초, 7초 등 불가능!)
- 각 씬의 duration은 반드시 4, 6, 8 중 하나로 설정!
- 씬 개수: ${sceneCountGuide}
- 퍼포먼스 씬 duration: start(6초), break(4초), resume(6초)
- ⚠️ 각 segment에 "duration" 필드 필수! (예: "duration": 6)

★★★ CHARACTERS (이미지 분석 결과 기반) ★★★
${characterDescriptions}

★★★ CRITICAL - CHARACTER APPEARANCE CONSISTENCY ★★★
${Object.entries(characters).map(([key, char]) =>
  `- ${char.name}: ${char.analysis.image_generation_prompt || ""}
   모든 씬에서 동일한 외형 유지!`
).join("\n")}

TOPIC: ${effectiveTopic}
${dailyContext ? `CONTEXT: ${dailyContext.season}, ${dailyContext.day_of_week}` : ""}

★★★ 배경 설정 (CRITICAL - 모든 씬에 일관되게 적용!) ★★★
${hasCustomBackground ? `
🎯 **USER-SPECIFIED BACKGROUND** (최우선 적용!):
"${backgroundPrompt}"

⚠️ IMPORTANT: 이 배경을 모든 씬의 scene_details.background와 image_prompt에 반드시 포함!
` : backgroundAiGenerated ? `
🤖 **AI-GENERATED BACKGROUND**:
- Location: ${backgroundAiGenerated.location || "auto"}
- Style: ${backgroundAiGenerated.style || "auto"}
- Lighting: ${backgroundAiGenerated.lighting || "auto"}
- Description: ${backgroundAiGenerated.description || "auto"}

모든 씬에서 이 배경을 일관되게 사용하세요!
` : `
🤖 **AUTO BACKGROUND**: 콘텐츠 타입(${contentType})에 맞는 배경을 자동 생성하되, 모든 씬에서 일관성 유지!
`}

${generateContentTypeSection()}

${storyContext.story_summary ? `★★★ 스토리 가이드 ★★★
📖 스토리 요약: ${storyContext.story_summary}
🎣 후킹 대사: ${storyContext.hook || "N/A"}
🎭 나레이션 스타일: ${storyContext.narration_style || "N/A"}
💓 감정 여정: ${storyContext.emotional_journey || "N/A"}
🔥 바이럴 요소: ${storyContext.viral_elements?.join(", ") || "N/A"}
` : ""}

${generateScriptFormatSection()}

★★★ SCRIPT RULES ★★★
${scriptFormat === 'interview' ? `
- ⚠️ 인터뷰 형식: 주인공(${characters.main.name})이 카메라 보고 대답 (80% 이상)
- ⚠️ 인터뷰어 질문은 자막으로만 표시 (speaker: "interviewer")
- ⚠️ 조연(할미 등)은 회상 장면(flashback)에서만 등장!
- ⚠️ 조연이 직접 대화하는 장면 절대 금지!
- speaker 필드: "main", "interviewer", 또는 회상 시 "sub1", "sub2"
- scene_type 필드: "interview_question", "interview_answer", "flashback", "reaction"
` : `
- 주인공(${characters.main.name})이 주로 말하고 (60-70%)
- 조연들이 반응하거나 대화 (30-40%)
- 캐릭터별 성격과 목소리 특성 반영
- speaker 필드는 반드시 다음 중 하나: "main", "sub1", "sub2", "sub3", "interviewer"
`}

★★★ 코미디 효과음 규칙 ★★★
- 대사 중 의성어(멍멍! 왈왈! 낑!)가 나올 때, 귀여운 효과음을 sound_effects에 추가
- 예시:
  * "멍멍!" → sound_effects: ["playful bark", "cute whoosh"]
  * "왈왈!" → sound_effects: ["excited puppy bark", "happy jingle"]
  * "낑..." → sound_effects: ["tiny whimper", "soft piano"]
- ⚠️ 금지: lion roar, tiger, thunder, explosion, growl 등 자극적 표현 금지!

★★★ 감정 표현 규칙 ★★★
- 대사에 감정/액션 지시어 포함: (신나서), (당황), (작은 목소리로)
- 목소리 스타일 변화도 voice_style에 상세히 기술

★★★ 대사 안전 규칙 ★★★
- ⚠️ 금지: 동물 흉내(사자,호랑이,으르렁), 공격적 표현(때리다,죽이다)
- ✅ 허용: "멍멍!", "왈왈!", "낑~", "캉캉!" 등 귀여운 표현

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
      "narration":"대사 내용 (한국어)",
      "narration_english":"English translation of narration",
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

스토리 흐름에 맞게 자연스러운 씬 개수로 구성하세요! (각 씬 duration 포함 필수)`;

    const scriptResponse = await axios($, {
      url: GEMINI_URL,
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
      data: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      },
    });

    let script;
    try {
      let content = scriptResponse.candidates[0].content.parts[0].text.trim();
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      script = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      throw new Error(`Script parse error: ${e.message}`);
    }

    // =====================
    // 9. 풍자 모드일 때 면책 엔딩 씬 추가
    // =====================
    if (isSatire && script.script_segments?.length > 0) {
      const disclaimerSegment = {
        segment_number: script.script_segments.length + 1,
        speaker: "main",
        character_name: characters.main?.name || "땅콩",
        narration: "이 영상은 실제 사건을 바탕으로 한 풍자입니다~ 헤헤헤!",
        narration_english: "This video is a satire based on real events~ Hehehe!",
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
      $.export("disclaimer_added", "Satire disclaimer ending scene added");
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
        const speaker = seg.speaker || "main";
        const character = characters[speaker] || characters.main;
        const isInterviewQuestion = seg.scene_type === "interview_question" || speaker === "interviewer";

        // ★★★ 퍼포먼스 씬 타입 감지 (새로운 3단계 구조) ★★★
        const isPerformance = isPerformanceScene(seg.scene_type);
        const isPerformanceStart = seg.scene_type === "performance_start";
        const isPerformanceBreak = seg.scene_type === "performance_break";
        const isPerformanceResume = seg.scene_type === "performance_resume";
        const isAnyPerformance = isPerformance || isPerformanceStart || isPerformanceBreak || isPerformanceResume;

        // ★★★ Veo3 제한: 4초, 6초, 8초만 가능! ★★★
        // 가장 가까운 허용 duration을 찾는 함수
        const findClosestAllowedDuration = (target, allowedOptions = VEO3_ALLOWED_DURATIONS) => {
          return allowedOptions.reduce((prev, curr) =>
            Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
          );
        };

        // 퍼포먼스 장면별 권장 duration
        let preferredDuration;
        if (isPerformanceStart || isPerformanceResume) {
          preferredDuration = 6; // BGM 재생 구간: 6초 권장
        } else if (isPerformanceBreak) {
          preferredDuration = 4; // 짧은 대사 구간: 4초 (Veo3 최소)
        } else {
          preferredDuration = 6; // 일반 씬: 6초 기본값
        }

        // ★★★ duration: Gemini가 제공한 값 우선, 없으면 대사 길이 기반 계산 ★★★
        let calculatedDuration = seg.duration || preferredDuration;

        // Gemini가 duration을 제공하지 않은 경우 대사 길이 기반으로 추정
        if (!seg.duration && charLen > 0) {
          // 한국어 기준 초당 5글자로 계산
          const estimatedDuration = Math.ceil(charLen / lang.charsPerSec);
          calculatedDuration = findClosestAllowedDuration(estimatedDuration);
        }

        // Veo3 허용 duration (4, 6, 8) 중 가장 가까운 값으로 조정
        const duration = VEO3_ALLOWED_DURATIONS.includes(calculatedDuration)
          ? calculatedDuration
          : findClosestAllowedDuration(calculatedDuration);

        // 퍼포먼스 break 장면만 narration 있음
        const hasNarration = isPerformanceBreak
          ? !!(seg.narration && seg.narration.trim())
          : (isPerformanceStart || isPerformanceResume)
            ? false
            : !!(seg.narration && seg.narration.trim());

        // ★★★ 퍼포먼스 타입별 처리 ★★★
        const performanceType = getPerformanceType(seg.scene_type);
        const perfDefaults = performanceType ? performanceDefaults[performanceType] : null;

        const videoPrompt = seg.video_prompt || {};
        let defaultVideoPrompt;

        if (isPerformanceStart || isPerformanceResume) {
          // 퍼포먼스 시작/재개: BGM + 립싱크
          defaultVideoPrompt = {
            character_action: perfDefaults?.character_action || "mouth moving to beat rhythm, head bobbing, body grooving",
            lip_sync: "yes", // BGM 비트에 맞춰 립싱크!
            lip_sync_to: "bgm", // TTS가 아닌 BGM에 맞춤
            facial_expression: perfDefaults?.facial_expression || "cool and rhythmic",
            body_movement: perfDefaults?.body_movement || "rhythmic body movement to beat",
            camera_movement: "dynamic",
            is_performance: true,
            performance_phase: isPerformanceStart ? "start" : "resume",
          };
        } else if (isPerformanceBreak) {
          // 퍼포먼스 브레이크: BGM 멈춤 + 짧은 대사 (기계음)
          defaultVideoPrompt = {
            character_action: "pausing performance, looking at camera, saying short word",
            lip_sync: "yes", // 대사에 맞춰 립싱크
            lip_sync_to: "tts",
            facial_expression: "confident and cool",
            body_movement: "brief pause, then dramatic pose",
            camera_movement: "zoom_in",
            is_performance: true,
            performance_phase: "break",
          };
        } else if (isPerformance && perfDefaults) {
          // 기존 퍼포먼스 타입 (호환성)
          defaultVideoPrompt = {
            character_action: perfDefaults.character_action,
            lip_sync: "yes",
            lip_sync_to: "bgm",
            facial_expression: perfDefaults.facial_expression,
            body_movement: perfDefaults.body_movement,
            camera_movement: "dynamic",
            is_performance: true,
            performance_type: performanceType,
          };
        } else {
          defaultVideoPrompt = {
            character_action: isInterviewQuestion
              ? "listening attentively with curious expression, head slightly tilted, ears perked up"
              : (hasNarration ? "talking with perfectly synchronized lip movements" : "natural idle animation"),
            lip_sync: isInterviewQuestion ? "no" : (hasNarration ? "yes" : "no"),
            facial_expression: isInterviewQuestion ? "curious listening" : (seg.emotion || "happy"),
            body_movement: isInterviewQuestion
              ? "subtle listening pose, occasional small nod, ears twitching"
              : (hasNarration ? "subtle expressive gestures while talking" : "gentle breathing and natural movements"),
            camera_movement: "static",
            is_interviewer_speaking: isInterviewQuestion,
          };
        }

        const sceneDetails = seg.scene_details || {};
        const defaultSceneDetails = {
          location: "indoor",
          background: "cozy living room with soft warm lighting",
          weather: "none",
          lighting: "warm soft natural",
          mood: "cozy heartwarming",
          characters_in_scene: [character.name],
        };

        const audioDetails = seg.audio_details || {};
        let defaultAudioDetails;

        if (isPerformanceStart || isPerformanceResume) {
          // ★★★ 퍼포먼스 시작/재개: BGM 80%, TTS 없음 ★★★
          defaultAudioDetails = {
            voice_style: "no voice - BGM only",
            voice_type: "none",
            speaking_speed: "none",
            sound_effects: [],
            background_sound: "",
            bgm_featured: true, // BGM이 메인 오디오!
            bgm_volume: 0.8, // 80% 볼륨
            performance_phase: isPerformanceStart ? "start" : "resume",
            bgm_style: perfDefaults?.bgm_style || "beatbox rhythmic",
            tts_enabled: false, // TTS 비활성화
          };
        } else if (isPerformanceBreak) {
          // ★★★ 퍼포먼스 브레이크: BGM 멈춤, 기계음 TTS ★★★
          defaultAudioDetails = {
            voice_style: "robotic voice effect",
            voice_type: "robotic", // 기계음
            voice_effect: "robotic", // 오토튠/기계음 효과
            speaking_speed: "fast",
            sound_effects: ["record scratch", "bass drop"],
            background_sound: "",
            bgm_featured: false, // BGM 멈춤!
            bgm_volume: 0, // BGM 볼륨 0
            performance_phase: "break",
            tts_enabled: true, // TTS 활성화 (기계음)
          };
        } else if (isPerformance && perfDefaults) {
          // ★★★ 기존 퍼포먼스 타입 (호환성) ★★★
          defaultAudioDetails = {
            voice_style: "no voice - BGM only",
            voice_type: "none",
            speaking_speed: "none",
            sound_effects: [],
            background_sound: "",
            bgm_featured: true,
            bgm_volume: 0.8,
            performance_type: performanceType,
            bgm_style: perfDefaults.bgm_style,
            tts_enabled: false,
          };
        } else {
          defaultAudioDetails = {
            voice_style: voiceStyleMap[speaker] || "natural voice",
            voice_type: speakerToVoice[speaker] || "adult",
            speaking_speed: speaker === "main" ? "slow and cute" : "natural",
            sound_effects: [],
            background_sound: "",
            bgm_featured: false,
            bgm_volume: 0.3, // 일반 장면은 BGM 30%
            tts_enabled: true,
          };
        }

        // ★★★ 퍼포먼스 장면 이미지 프롬프트 ★★★
        let imagePrompt;
        if (isAnyPerformance) {
          const basePrompt = character.analysis?.image_generation_prompt || "cute adorable puppy";
          const perfSuffix = perfDefaults?.image_prompt_suffix || "doing performance, stage lighting, energetic pose";
          imagePrompt = seg.image_prompt || `${basePrompt}, ${perfSuffix}`;
        } else {
          imagePrompt = seg.image_prompt || `${character.analysis?.image_generation_prompt || "character"}, ${isInterviewQuestion ? "curious listening" : seg.emotion || "happy"} expression`;
        }

        // 퍼포먼스 phase 결정
        const performancePhase = isPerformanceStart ? "start" :
                                isPerformanceBreak ? "break" :
                                isPerformanceResume ? "resume" :
                                isPerformance ? "main" : null;

        // ★★★ TTS 관련 필드 (voice_segments 통합) ★★★
        const ttsEnabled = isPerformanceBreak ? true :
                          (isPerformanceStart || isPerformanceResume || isPerformance) ? false :
                          hasNarration;

        const ttsVoice = isPerformanceBreak
          ? "Korean baby girl with robotic effect"
          : (isPerformanceStart || isPerformanceResume || isPerformance)
            ? null
            : (isInterviewQuestion
              ? "Korean female news anchor, 30s, professional friendly tone"
              : "Korean baby girl, 2-3 years old toddler voice");

        const result = {
          ...seg,
          index: idx + 1,
          segment_number: idx + 1,
          start_time: time,
          end_time: time + duration,
          duration,
          speaker,
          character_name: character.name,
          voice_type: (isPerformanceStart || isPerformanceResume) ? "none" :
                      isPerformanceBreak ? "robotic" :
                      (speakerToVoice[speaker] || "adult"),
          scene_type: seg.scene_type || "narration",
          has_narration: hasNarration,
          narration_english: seg.narration_english || "",
          image_prompt: imagePrompt,
          video_prompt: {
            ...defaultVideoPrompt,
            ...videoPrompt,
            // 퍼포먼스 시작/재개: BGM에 맞춰 립싱크, 브레이크: TTS에 맞춰 립싱크
            lip_sync: isAnyPerformance ? "yes" : (isInterviewQuestion ? "no" : (hasNarration ? "yes" : (videoPrompt.lip_sync || "no"))),
            lip_sync_to: (isPerformanceStart || isPerformanceResume) ? "bgm" :
                        isPerformanceBreak ? "tts" :
                        (hasNarration ? "tts" : null),
            is_interviewer_speaking: isInterviewQuestion,
            is_performance: isAnyPerformance,
            performance_type: performanceType,
            performance_phase: performancePhase,
          },
          scene_details: {
            ...defaultSceneDetails,
            ...sceneDetails,
            // 퍼포먼스 장면은 스테이지 배경
            ...(isAnyPerformance ? {
              location: "stage",
              background: sceneDetails.background || "concert stage with colorful spotlights and neon lights",
              lighting: sceneDetails.lighting || "dramatic stage lighting with colorful spotlights",
              mood: sceneDetails.mood || "energetic performance",
            } : {}),
          },
          audio_details: { ...defaultAudioDetails, ...audioDetails },
          // ★★★ 퍼포먼스 관련 메타데이터 ★★★
          is_performance: isAnyPerformance,
          performance_type: performanceType,
          performance_phase: performancePhase, // start, break, resume, main, null
          bgm_featured: (isPerformanceStart || isPerformanceResume || isPerformance), // BGM이 메인인 장면
          bgm_volume: (isPerformanceStart || isPerformanceResume) ? 0.8 :
                      isPerformanceBreak ? 0 :
                      isPerformance ? 0.8 : 0.3,
          // ★★★ TTS 관련 필드 (voice_segments에서 통합) ★★★
          tts_enabled: ttsEnabled,
          tts_voice: ttsVoice,
          voice_effect: isPerformanceBreak ? "robotic" : null,
          dog_lip_sync: isAnyPerformance ? "yes" : (!isInterviewQuestion && hasNarration),
        };
        time += duration;
        return result;
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