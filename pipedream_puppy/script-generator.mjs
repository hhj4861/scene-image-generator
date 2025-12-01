import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Script Generator",
  description: "등장인물 이미지 분석 기반 대화 스크립트 생성",

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
      description: "조연2 이미지 URL (선택)",
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
      description: "조연3 이미지 URL (선택)",
      optional: true,
    },
    sub_character3_name: {
      type: "string",
      label: "Sub Character 3 Name",
      optional: true,
    },
    total_duration_seconds: {
      type: "integer",
      label: "Total Video Duration (seconds)",
      default: 30,
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

    // ★ 풍자/패러디 정보 추출
    const isSatire = topicData?.is_satire || false;
    const originalTopic = topicData?.original_topic || null;
    const keywordHint = topicData?.keyword_hint || null;
    const satireInfo = topicData?.satire_info || topicData?.selected?.satire_info || null;
    const scriptFormat = topicData?.script_format || "interview";
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
        // 에러 로깅 - 디버깅용
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
        image_url: null,  // 인터뷰어는 화면에 나오지 않음 (음성만)
        analysis: {
          character_type: "human",
          gender: "female",
          estimated_age_range: "30s",
          image_generation_prompt: "off-screen interviewer (voice only)",
          suggested_voice_type: "news_anchor_female",
          voice_description: "Korean female news anchor, 30s, professional friendly tone",
        },
      };
      $.export("interviewer_added", "Interview format detected - interviewer character added");
    }

    $.export("characters_analyzed", Object.keys(characters).length);
    $.export("analysis_results", {
      main: mainCharAnalysis?.error ? `error: ${mainCharAnalysis.error}` : (mainCharAnalysis ? "success" : "failed (no URL)"),
      sub1: sub1Analysis?.error ? `error: ${sub1Analysis.error}` : (sub1Analysis ? "success" : "failed (no URL)"),
      sub2: sub2Analysis?.error ? `error: ${sub2Analysis.error}` : (sub2Analysis ? "success" : "failed (no URL)"),
      sub3: sub3Analysis?.error ? `error: ${sub3Analysis.error}` : (sub3Analysis ? "success" : "failed (no URL)"),
    });
    $.export("input_urls", {
      main: this.main_character_image_url || "NOT PROVIDED",
      sub1: this.sub_character1_image_url || "NOT PROVIDED",
      sub2: this.sub_character2_image_url || "NOT PROVIDED",
      sub3: this.sub_character3_image_url || "NOT PROVIDED",
    });
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
    const targetDuration = this.total_duration_seconds;
    const sceneCount = Math.ceil(targetDuration / 5);

    // =====================
    // 4-1. 한글 입모양 매핑 (Veo 3 립싱크용)
    // =====================
    const koreanMouthShapes = {
      // 모음
      "ㅏ": "Mouth wide open, jaw drops",
      "ㅑ": "Mouth wide open, jaw drops",
      "ㅓ": "Mouth medium open, lips slightly rounded",
      "ㅕ": "Mouth medium open, lips slightly rounded",
      "ㅗ": "Lips form small round O shape",
      "ㅛ": "Lips form small round O shape",
      "ㅜ": "Lips push forward, small round opening",
      "ㅠ": "Lips push forward, small round opening",
      "ㅡ": "Lips stretch wide horizontally, teeth close",
      "ㅣ": "Lips stretch sideways, teeth slightly visible",
      "ㅐ": "Mouth open, lips stretched sideways",
      "ㅔ": "Mouth open, lips stretched sideways",
      "ㅚ": "Lips round then stretch",
      "ㅟ": "Lips round forward",
      "ㅢ": "Lips stretch horizontally then open",
      // 자주 쓰는 글자 조합
      "아": "Mouth wide open, relaxed",
      "어": "Mouth medium open, rounded",
      "오": "Lips form small round O shape",
      "우": "Lips push forward, small round",
      "으": "Lips stretch wide, teeth close",
      "이": "Lips stretch sideways, teeth visible",
      "에": "Mouth open, stretched",
      "애": "Mouth open wide, stretched",
      "요": "Lips round forward, closing",
      "야": "Mouth opens wide",
      "여": "Mouth medium open",
      "유": "Lips push forward",
      "예": "Lips stretch then open",
      // 자음 영향
      "가": "Mouth opens wide, jaw drops",
      "나": "Tongue touches roof, mouth opens wide",
      "다": "Tongue touches roof, mouth medium open",
      "라": "Tongue flicks, mouth opens",
      "마": "Lips press together then open wide",
      "바": "Lips press together then open",
      "사": "Teeth close, air through, mouth opens",
      "자": "Tongue touches teeth, mouth opens",
      "차": "Teeth close with air, mouth opens wide",
      "카": "Back tongue, mouth opens wide",
      "타": "Tongue touches roof hard, opens wide",
      "파": "Lips press together, burst open",
      "하": "Mouth opens with breath",
      "고": "Mouth opens with back tongue, then closes",
      "기": "Lips stretch sideways, teeth slightly visible",
      "더": "Tongue touches roof, mouth medium open",
      "좋": "Lips round then quickly open",
      "소": "Lips form small round O shape",
      "네": "Tongue touches roof, stretch sideways",
      "뭐": "Lips press then round forward",
      "왜": "Lips round then stretch wide",
      // 웃음/감정
      "ㅋ": "Mouth opens with back throat sound",
      "ㅎ": "Mouth opens with breath exhale",
      "훗": "Lips press, proud nose exhale",
    };

    // 대사에서 한글 입모양 추출 함수
    const extractMouthShapes = (text) => {
      if (!text) return null;
      const shapes = {};
      const chars = text.replace(/[^가-힣]/g, '').split('');
      for (const char of chars) {
        if (!shapes[char] && koreanMouthShapes[char]) {
          shapes[char] = koreanMouthShapes[char];
        }
      }
      return Object.keys(shapes).length > 0 ? shapes : null;
    };

    // =====================
    // 5. 캐릭터 정보를 프롬프트로 변환
    // =====================
    const characterDescriptions = Object.entries(characters).map(([key, char]) => {
      const analysis = char.analysis;

      // ★ 인터뷰어는 특별 처리 (화면에 안 나오고 음성만)
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
    // 6. 스크립트 생성 프롬프트
    // =====================
    const mainCharPrompt = characters.main.analysis.image_generation_prompt || "cute adorable puppy";

    const prompt = `Create a ${targetDuration}s viral YouTube Short script with DETAILED visual descriptions.

★★★ CHARACTERS (이미지 분석 결과 기반) ★★★
${characterDescriptions}

★★★ CRITICAL - CHARACTER APPEARANCE CONSISTENCY ★★★
${Object.entries(characters).map(([key, char]) =>
  `- ${char.name}: ${char.analysis.image_generation_prompt || ""}
   모든 씬에서 동일한 외형 유지!`
).join("\n")}

TOPIC: ${effectiveTopic}
${dailyContext ? `CONTEXT: ${dailyContext.season}, ${dailyContext.day_of_week}` : ""}

${isSatire ? `★★★ 풍자/패러디 모드 (CRITICAL!) ★★★
이 콘텐츠는 실제 이슈를 강아지 세계로 풍자한 것입니다.

📰 원본 주제: ${originalTopic || "N/A"}
🔑 변환 힌트: ${keywordHint || "N/A"}
${satireInfo ? `
🎭 풍자 정보:
- 원본 참조: ${satireInfo.original_reference || "N/A"}
- 변환 방법: ${satireInfo.transformation_method || "N/A"}
- 웃음 포인트: ${satireInfo.humor_point || "N/A"}` : ""}

★ 풍자 스크립트 규칙:
1. 원본 주제의 핵심 구조(숫자, 규모, 임팩트)를 유지
2. 사람/기업 요소를 강아지 세계 요소로 치환
3. 풍자적 유머를 유지하면서 귀엽게 표현
4. 시사적 내용을 강아지 시점에서 재해석
5. 후킹 대사에 원본 주제의 핵심 숫자/키워드 포함

★ 예시:
- "쿠팡 개인정보 유출 3700만건" → "차우차우한테 3700만개 사료 털렸다고?!"
- "테슬라 자율주행 사고" → "로봇청소기가 나를 치고 도망갔어!"
` : ""}

${storyContext.story_summary ? `★★★ 스토리 가이드 ★★★
📖 스토리 요약: ${storyContext.story_summary}
🎣 후킹 대사: ${storyContext.hook || "N/A"}
🎭 나레이션 스타일: ${storyContext.narration_style || "N/A"}
💓 감정 여정: ${storyContext.emotional_journey || "N/A"}
🔥 바이럴 요소: ${storyContext.viral_elements?.join(", ") || "N/A"}
` : ""}

★★★ 스크립트 형식: ${scriptFormat.toUpperCase()} (매우 중요!!!) ★★★
${scriptFormat === 'interview' ? `
🎤 **인터뷰 형식 (INTERVIEW FORMAT) - 반드시 이 형식으로 작성!**

⚠️ **절대 규칙: 할미, 할비 등 조연이 직접 대화하는 장면 금지!**
⚠️ **오직 인터뷰어 질문 → 주인공 대답 구조만 사용!**

**인터뷰 구성 (필수!):**
1. 인터뷰어가 질문할 때: 강아지는 듣는 표정 (lip_sync: no), 인터뷰어 음성만 재생
2. 주인공(강아지)이 대답할 때: 카메라 정면 보고 말하기 (lip_sync: yes)
3. 필요시 과거 회상 장면 삽입 (flashback)
4. 조연(할미 등)은 회상 장면에서만 등장 가능

**올바른 인터뷰 형식 예시:**
\`\`\`
[인터뷰어 질문 - 자막만] "이 사건에 대해 어떻게 생각하세요?"
[땅콩 - 카메라 정면] "아니 내가 말이야... 진짜 어이가 없어서..."

[인터뷰어 질문 - 자막만] "당시 상황을 설명해주세요"
[땅콩 - 회상하며] "그날 밤이었어... (회상 장면 시작)"
[회상 장면] 차우차우가 사료를 털어가는 모습
[땅콩 - 다시 카메라] "그래서 3700만 봉지가 사라진거야!"

[인터뷰어 질문 - 자막만] "마지막으로 하고 싶은 말은?"
[땅콩 - 카메라 정면] "차우차우! 내 사료 돌려줘!!!"
\`\`\`

**잘못된 예시 (이렇게 하면 안됨!):**
\`\`\`
땅콩: "왈왈!"
할미: "아이고, 땅콩아, 그게 정말이니?"  ← 이런 대화 형식 금지!
\`\`\`

**segment 구성:**
- scene_type: "interview_question" → speaker: "interviewer", narration: 질문 내용
- scene_type: "interview_answer" → speaker: "main", narration: 대답 내용
- scene_type: "flashback" → speaker: "main", narration: 회상 나레이션

**speaker 규칙:**
- "interviewer": 질문만 (화면에 자막, 음성 없음)
- "main": 주인공 강아지 (대부분의 대답, 80% 이상)
- "sub1", "sub2": 회상 장면에서만 등장 가능
` : scriptFormat === 'monologue' ? `
📖 **독백 형식 (MONOLOGUE FORMAT)**
강아지가 혼자 이야기하는 1인칭 나레이션 형식.
- 강아지 시점의 스토리텔링
- 감정 이입이 쉬운 구조
` : scriptFormat === 'dialogue' ? `
💬 **대화 형식 (DIALOGUE FORMAT)**
강아지와 주인/다른 동물의 대화 형식.
- 자연스러운 일상 대화
- 여러 캐릭터가 번갈아 등장
` : `
🎭 **혼합 형식 (MIXED FORMAT)**
상황에 맞게 인터뷰/독백/대화를 적절히 혼합.
풍자 콘텐츠의 경우 인터뷰 형식 권장.
`}

SCRIPT RULES:
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
- 스토리가 자연스럽게 이어지도록 구성
- speaker 필드는 반드시 다음 중 하나: "main", "sub1", "sub2", "sub3", "interviewer"
- scene_type 필드 옵션: "narration", "interview_question", "interview_answer", "flashback", "reaction"
`}

★★★ 코미디 효과음 규칙 (매우 중요!) ★★★
- 대사 중 의성어(멍멍! 왈왈! 낑!)가 나올 때, 귀여운 효과음을 sound_effects에 추가
- 예시:
  * "내가 바로 용감한 땅콩이다!" + "멍멍!" → sound_effects: ["playful bark", "cute whoosh"]
  * "왈왈!" → sound_effects: ["excited puppy bark", "happy jingle"]
  * "낑..." → sound_effects: ["tiny whimper", "soft piano"]
  * "헉!" + 놀람 → sound_effects: ["cartoon pop", "funny boing"]
- 강아지가 용감한 척할 때 → 귀여운 짖는 소리 + 재미있는 효과음
- 강아지가 겁먹을 때 → 작고 귀여운 whimper + 코믹한 효과음
- ⚠️ 금지: lion roar, tiger, thunder, explosion, growl, scream 등 자극적 표현 금지!

★★★ 감정 표현 규칙 ★★★
- 대사에 감정/액션 지시어 포함: (신나서), (당황), (작은 목소리로), (점점 커지는 목소리)
- 목소리 스타일 변화도 voice_style에 상세히 기술
- 감정 전환이 있으면 emotion_transition에 기록

★★★ 대사 안전 규칙 (매우 중요!) ★★★
- ⚠️ 대사에서 금지 표현:
  * 동물 흉내: 사자, 호랑이, 맹수, 으르렁, 포효, 크아앙
  * 공격적 표현: 때리다, 죽이다, 무섭다, 공격
  * 폭력적 의성어: 쾅, 펑, 으악
- ✅ 대신 사용할 표현:
  * "용감한 땅콩!", "씩씩한 땅콩!", "최고의 땅콩!"
  * "멍멍!", "왈왈!", "낑~", "캉캉!"
- 항상 귀엽고 가족 친화적인 대사로 작성

★★★ 상황 변화 규칙 ★★★
- 극적인 상황 변화는 action_cues에 상세히 기술
- 예: "(갑자기 빗방울이 떨어진다)" → scene_transition + weather 변경 + ambient_sound 추가

${lang.instruction}

★★★ SCENE CONSISTENCY RULES ★★★
1. 배경(background)은 스토리 흐름에 맞게 설정
2. 연속된 씬은 같은 장소에서 촬영된 것처럼 배경 일관성 유지
3. 장소가 바뀔 때만 배경 변경

★★★ OUTPUT FORMAT ★★★

Return JSON only:
{
  "title":{"japanese":"","korean":"","english":""},
  "full_script":"complete dialogue script",
  "location_setting":"전체 스토리가 진행되는 주요 장소",
  "script_segments":[
    {
      "segment_number":1,
      "speaker":"main or sub1 or sub2 or sub3",
      "character_name":"캐릭터 이름",
      "narration":"대사 내용 (한국어)",
      "narration_english":"English translation of narration (for subtitles)",

      "image_prompt":"이미지 생성용 상세 프롬프트 (영어) - 캐릭터 외모 + 감정에 맞는 포즈/표정 + 배경 + 조명. 예: proud puppy with puffed chest roaring pose / scared puppy cowering with ears down",

      "video_prompt":{
        "character_action":"캐릭터 동작 설명 (영어) - 구체적 액션 포함",
        "lip_sync":"yes or no",
        "facial_expression":"표정 상세 설명 (감정 변화 포함)",
        "body_movement":"몸 움직임 설명 (예: trembling, jumping, being picked up)",
        "camera_movement":"static/zoom_in/zoom_out/pan_left/pan_right/tilt_up/tilt_down",
        "special_effects":"특수 효과 (예: rain falling, leaves blowing)",
        "interaction_with_others":"다른 캐릭터와의 상호작용 동작"
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
        "voice_style":"음성 스타일 상세 (예: tiny cute voice getting louder, scared whimpering voice)",
        "voice_tone":"감정 톤 (예: excited, scared, confused, proud)",
        "sound_effects":["코미디 효과음 (예: playful bark, cute whoosh, soft rain, funny boing, happy jingle)"],
        "ambient_sound":"환경 소리 (예: gentle rain, soft wind, birds chirping)",
        "background_music_mood":"배경음악 분위기 (예: playful adventure, warm and cozy, cute and cheerful)"
      },

      "action_cues":{
        "scene_transition":"씬 전환 액션 (예: 갑자기 빗방울이 떨어진다)",
        "character_interaction":"캐릭터 간 상호작용 (예: 할미가 땅콩을 안아 올린다)",
        "environmental_change":"환경 변화 (예: 하늘이 어두워진다)"
      },

      "emotion":"happy/excited/curious/surprised/scared/loving 등",
      "emotion_transition":"감정 변화 (예: 신남→당황→안도)"
    }
  ],
  "music_mood":"cute/funny/emotional/heartwarming",
  "overall_style":"photorealistic"
}

Create ${sceneCount} segments with complete visual details!`;

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
    // 6-1. 풍자 모드일 때 면책 엔딩 씬 추가
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
          character_action: "standing on hind legs, doing adorable Korean-style belly button bow (배꼽인사) with front paws together at belly, bending forward politely while speaking, then looking up with mischievous wink and bursting into laughter",
          lip_sync: "yes",
          facial_expression: "polite smile during bow, then mischievous grin, finally uncontrollable cute laughter",
          body_movement: "standing upright, front paws together at belly level, bowing forward 45 degrees politely, then straightening up and shaking with laughter",
          camera_movement: "medium shot to capture full body bow, slight zoom in on face during laughter",
          pose: "배꼽인사 (belly button bow) - traditional Korean polite greeting pose",
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
        action_cues: {
          bow_action: "Korean style 배꼽인사 (belly button bow) - front paws together at belly, bend forward politely",
          ending_expression: "Bursting into adorable uncontrollable baby laughter, eyes squinting, whole face laughing",
        },
        emotion: "polite-playful",
        emotion_transition: "polite bow → mischievous wink → uncontrollable laughter",
        is_disclaimer: true,
      };

      script.script_segments.push(disclaimerSegment);
      $.export("disclaimer_added", "Satire disclaimer ending scene added");
    }

    // =====================
    // 7. 타이밍 정규화 + speaker를 캐릭터 정보와 연결
    // =====================
    // Veo 3용 음성 스타일 매핑 (영어 프롬프트용)
    const voiceStyleMap = {
      main: "cute adorable toddler girl voice, 2-3 years old, slow sweet innocent speech, baby talk",
      sub1: "warm gentle elderly woman voice, loving grandmother tone",
      sub2: "kind mature adult male voice, gentle father figure",
      sub3: "friendly adult female voice, caring and warm",
    };

    const speakerToVoice = {
      main: "cute_toddler_girl",
      sub1: characters.sub1?.analysis?.suggested_voice_type || "elderly_female",
      sub2: characters.sub2?.analysis?.suggested_voice_type || "adult_male",
      sub3: characters.sub3?.analysis?.suggested_voice_type || "adult_female",
    };

    if (script.script_segments?.length > 0) {
      const totalChars = script.script_segments.reduce((s, seg) => s + (seg.narration?.length || 0), 0);
      let time = 0;

      script.script_segments = script.script_segments.map((seg, idx) => {
        const charLen = seg.narration?.length || 0;
        const duration = Math.max(Math.ceil(totalChars > 0 ? (charLen / totalChars) * targetDuration : targetDuration / script.script_segments.length), 3);
        const speaker = seg.speaker || "main";
        const character = characters[speaker] || characters.main;
        const hasNarration = !!(seg.narration && seg.narration.trim());

        // ★ 인터뷰 질문인지 판단 (인터뷰어가 말하는 경우)
        const isInterviewQuestion = seg.scene_type === "interview_question" || speaker === "interviewer";

        // video_prompt 기본값 - lip_sync는 narration 유무 + 인터뷰어 여부로 결정
        // 인터뷰 질문일 때: 강아지는 듣는 표정, lip_sync 없음
        const videoPrompt = seg.video_prompt || {};
        const defaultVideoPrompt = {
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

        // scene_details 기본값
        const sceneDetails = seg.scene_details || {};
        const defaultSceneDetails = {
          location: "indoor",
          background: "cozy living room with soft warm lighting",
          weather: "none",
          lighting: "warm soft natural",
          mood: "cozy heartwarming",
          characters_in_scene: [character.name],
        };

        // audio_details 기본값 - Veo 3용 상세 음성 스타일
        const audioDetails = seg.audio_details || {};
        const defaultAudioDetails = {
          voice_style: voiceStyleMap[speaker] || "natural voice",
          voice_type: speakerToVoice[speaker] || "adult",
          speaking_speed: speaker === "main" ? "slow and cute" : "natural",
          sound_effects: "",
          background_sound: "",
        };

        const result = {
          ...seg,
          index: idx + 1,
          segment_number: idx + 1,
          start_time: time,
          end_time: time + duration,
          duration,
          speaker,
          character_name: character.name,
          voice_type: speakerToVoice[speaker] || "adult",
          scene_type: seg.scene_type || "narration",
          has_narration: hasNarration,
          narration_english: seg.narration_english || "",

          image_prompt: seg.image_prompt || `${character.analysis?.image_generation_prompt || "character"}, ${isInterviewQuestion ? "curious listening" : seg.emotion || "happy"} expression`,
          video_prompt: {
            ...defaultVideoPrompt,
            ...videoPrompt,
            // ★ 인터뷰 질문일 때는 강아지가 듣는 표정 (lip_sync 없음)
            lip_sync: isInterviewQuestion ? "no" : (hasNarration ? "yes" : (videoPrompt.lip_sync || "no")),
            is_interviewer_speaking: isInterviewQuestion,
          },
          scene_details: { ...defaultSceneDetails, ...sceneDetails },
          audio_details: { ...defaultAudioDetails, ...audioDetails },
        };
        time += duration;
        return result;
      });
      script.total_duration = time;
    }

    // =====================
    // 8. folder_name 생성
    // =====================
    const { v4: uuidv4 } = await import("uuid");
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const shortUuid = uuidv4().split("-")[0];
    const safeTitle = (script.title?.english || "video").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;

    // =====================
    // 9. 결과 반환
    // =====================
    $.export("$summary", `🎬 ${script.script_segments?.length || 0} scenes, ${script.total_duration}s, ${Object.keys(characters).length} characters`);

    return {
      folder_name: folderName,
      language: this.language,
      script_text: script.full_script,
      total_duration_seconds: script.total_duration || targetDuration,
      title: script.title,

      // ★ 토픽 정보 (풍자 모드 포함)
      topic_info: {
        topic: effectiveTopic,
        is_satire: isSatire,
        original_topic: originalTopic,
        keyword_hint: keywordHint,
        satire_info: satireInfo,
        story_context: storyContext,
        daily_context: dailyContext,
        script_format: scriptFormat,
      },

      // ★ 캐릭터 정보 (분석 결과 포함)
      characters: Object.fromEntries(
        Object.entries(characters).map(([key, char]) => [
          key,
          {
            name: char.name,
            role: char.role,
            image_url: char.image_url,
            character_type: char.analysis.character_type,
            // 동물인 경우
            species: char.analysis.species,
            breed: char.analysis.breed,
            estimated_age: char.analysis.estimated_age,
            // 사람인 경우
            gender: char.analysis.gender,
            estimated_age_range: char.analysis.estimated_age_range,
            // 공통
            personality: char.analysis.personality_impression,
            voice_type: char.analysis.suggested_voice_type,
            image_prompt: char.analysis.image_generation_prompt,
            distinctive_features: char.analysis.distinctive_features,
            accessories: char.analysis.accessories,
            clothing: char.analysis.clothing,
          }
        ])
      ),

      // ★ Image Generator용
      image_generation: {
        // 전역 설정
        resolution: "8K",
        format: "Clean image only",
        text_overlays: false,
        watermarks: false,

        // 캐릭터 프롬프트
        character_prompts: Object.fromEntries(
          Object.entries(characters).map(([key, char]) => [key, char.analysis.image_generation_prompt])
        ),

        // ★ 캐릭터 상세 정보 (옷, 악세서리, 특징)
        character_details: Object.fromEntries(
          Object.entries(characters).map(([key, char]) => [key, {
            name: char.name,
            base_prompt: char.analysis?.image_generation_prompt || "",
            species: char.analysis?.species || "dog",
            breed: char.analysis?.breed || "unknown",
            fur_color: char.analysis?.fur_color || "",
            fur_texture: char.analysis?.fur_texture || "",
            eye_color: char.analysis?.eye_color || "",
            outfit: char.analysis?.clothing || char.analysis?.outfit || "",
            accessories: char.analysis?.accessories || [],
            distinctive_features: char.analysis?.distinctive_features || [],
            personality: char.analysis?.personality_impression || "",
          }])
        ),

        overall_style: script.overall_style || "photorealistic",

        scenes: script.script_segments?.map((seg) => {
          const speaker = seg.speaker || "main";
          const character = characters[speaker] || characters.main;
          const charAnalysis = character?.analysis || {};

          // 캐릭터 외형 정보
          const characterAppearance = {
            base: charAnalysis.image_generation_prompt || "cute adorable puppy",
            species: charAnalysis.species || "dog",
            breed: charAnalysis.breed || "unknown",
            fur_color: charAnalysis.fur_color || "",
            fur_texture: charAnalysis.fur_texture || "",
            outfit: charAnalysis.clothing || charAnalysis.outfit || seg.video_prompt?.costume || "",
            accessories: charAnalysis.accessories || [],
            props: seg.video_prompt?.props || charAnalysis.props || [],
            distinctive_features: charAnalysis.distinctive_features || [],
          };

          // 씬 환경 정보
          const sceneEnvironment = {
            background: seg.scene_details?.background || "clean studio background",
            location: seg.scene_details?.location || "indoor",
            lighting: seg.scene_details?.lighting || "warm soft natural lighting",
            weather: seg.scene_details?.weather || "none",
            mood: seg.scene_details?.mood || "comfortable",
            props_in_scene: seg.scene_details?.props || [],
            special_effects: seg.video_prompt?.special_effects || "",
          };

          // 이미지 생성 프롬프트 조합
          const generateImagePrompt = () => {
            let prompt = characterAppearance.base;
            if (characterAppearance.outfit) {
              prompt += `, wearing ${characterAppearance.outfit}`;
            }
            if (characterAppearance.accessories?.length > 0) {
              prompt += `, with ${characterAppearance.accessories.join(", ")}`;
            }
            if (characterAppearance.props?.length > 0) {
              prompt += `, holding ${characterAppearance.props.join(", ")}`;
            }
            prompt += `. ${seg.emotion || "neutral"} expression`;
            prompt += `. ${sceneEnvironment.background}`;
            if (sceneEnvironment.props_in_scene?.length > 0) {
              prompt += `. Scene includes ${sceneEnvironment.props_in_scene.join(", ")}`;
            }
            prompt += `. ${sceneEnvironment.lighting}`;
            prompt += `. 8K photorealistic. No text. No watermarks.`;
            return prompt;
          };

          return {
            index: seg.index,
            start: seg.start_time,
            end: seg.end_time,
            duration: seg.duration,

            // 원본 이미지 프롬프트
            image_prompt: seg.image_prompt,

            // ★ 조합된 상세 이미지 프롬프트
            detailed_image_prompt: generateImagePrompt(),

            // 대사 정보
            narration: seg.narration,
            speaker: seg.speaker,
            character_name: seg.character_name,
            voice_type: seg.voice_type,

            // 감정
            emotion: seg.emotion,
            emotion_transition: seg.emotion_transition,

            // 씬 타입
            scene_type: seg.scene_type,

            // ★ 캐릭터 외형 정보 (옷, 악세서리, 소품)
            character_appearance: characterAppearance,

            // ★ 씬 환경 정보 (배경, 조명, 소품)
            scene_environment: sceneEnvironment,

            // 씬 디테일 (기존 호환성)
            scene_details: {
              ...seg.scene_details,
              location: sceneEnvironment.location,
              background: sceneEnvironment.background,
              lighting: sceneEnvironment.lighting,
              weather: sceneEnvironment.weather,
              mood: sceneEnvironment.mood,
              props_in_scene: sceneEnvironment.props_in_scene,
            },

            // 액션 큐 (이미지 포즈/상황 결정에 사용)
            action_cues: seg.action_cues || {},

            // 특수 효과 (이미지 배경에 반영)
            special_effects: sceneEnvironment.special_effects,

            // 캐릭터 상호작용 (이미지 구도에 반영)
            character_interaction: seg.action_cues?.character_interaction || seg.video_prompt?.interaction_with_others,

            // 출력 설정
            output: {
              format: "Image only",
              text_overlays: false,
              watermarks: false,
            },
          };
        }) || [],
      },

      // ★ Video Generator용 (Veo 3 최적화 - veo_script_sample 형식)
      video_generation: {
        // 전역 설정
        resolution: "8K",
        format: "Clean video only",
        text_overlays: false,
        subtitles: false,
        watermarks: false,

        // 캐릭터 프롬프트
        character_prompts: Object.fromEntries(
          Object.entries(characters).map(([key, char]) => [key, char.analysis.image_generation_prompt])
        ),

        // 음성 설정 (2-3살 여아 목소리)
        voice_settings: {
          main: {
            type: "Korean baby girl, 2-3 years old toddler voice",
            tone: "cute, innocent, sometimes whiny or excited",
            characteristics: "slow speech, adorable pronunciation, occasional baby talk",
            laugh_style: "Adorable toddler giggling, infectious cute laughter",
            consistent_across: "All videos",
          },
          interviewer: {
            type: "Korean female news anchor, 30s, professional friendly tone",
            characteristics: "clear, warm, professional",
            consistent_across: "All videos",
          },
          sub1: {
            type: characters.sub1?.analysis?.suggested_voice_type === "elderly_female"
              ? "Warm elderly woman voice, loving grandmother tone"
              : "Adult female voice, warm and caring",
            consistent_across: "All videos",
          },
        },

        // 인터뷰 배경 설정 (인터뷰 형식일 때)
        interview_background: scriptFormat === 'interview' ? {
          type: "Interview studio or themed background",
          description: `Professional interview setting matching the topic: ${effectiveTopic}`,
          lighting: "Warm soft studio lighting",
          props: "Microphone visible or implied",
          consistency: "Same background throughout all interview segments",
        } : null,

        overall_style: script.overall_style || "photorealistic",

        // 씬별 상세 (veo_script_sample 형식)
        scenes: script.script_segments?.map((seg, idx) => {
          const speaker = seg.speaker || "main";
          const character = characters[speaker] || characters.main;
          const hasNarration = !!(seg.narration && seg.narration.trim());
          const isInterviewQuestion = seg.scene_type === "interview_question" || speaker === "interviewer";
          const isFlashback = seg.scene_type === "flashback";

          // 대사에서 한글 입모양 추출 (강아지가 말할 때만)
          const mouthShapes = (hasNarration && !isInterviewQuestion) ? extractMouthShapes(seg.narration) : null;

          // 캐릭터 외형 정보 추출
          const charAnalysis = character.analysis || {};
          const characterAppearance = {
            base: charAnalysis.image_generation_prompt || "cute adorable puppy",
            species: charAnalysis.species || "dog",
            breed: charAnalysis.breed || "unknown",
            fur_color: charAnalysis.fur_color || "",
            fur_texture: charAnalysis.fur_texture || "",
            outfit: charAnalysis.clothing || charAnalysis.outfit || seg.video_prompt?.costume || "",
            accessories: charAnalysis.accessories || [],
            props: seg.video_prompt?.props || charAnalysis.props || [],
            distinctive_features: charAnalysis.distinctive_features || [],
          };

          // 씬별 배경/환경 정보
          const sceneEnvironment = {
            background: seg.scene_details?.background || "clean studio background",
            location: seg.scene_details?.location || "indoor",
            lighting: seg.scene_details?.lighting || "warm soft natural lighting",
            weather: seg.scene_details?.weather || "none",
            mood: seg.scene_details?.mood || "comfortable",
            props_in_scene: seg.scene_details?.props || [],
            special_effects: seg.video_prompt?.special_effects || "",
          };

          // 8K 시네마틱 프롬프트 생성 (옷/악세서리/배경 포함)
          const generateVeoPrompt = () => {
            // 캐릭터 외형 프롬프트 조합
            let charPrompt = characterAppearance.base;
            if (characterAppearance.outfit) {
              charPrompt += `, wearing ${characterAppearance.outfit}`;
            }
            if (characterAppearance.accessories?.length > 0) {
              charPrompt += `, with ${characterAppearance.accessories.join(", ")}`;
            }
            if (characterAppearance.props?.length > 0) {
              charPrompt += `, holding ${characterAppearance.props.join(", ")}`;
            }

            // 배경 프롬프트
            let bgPrompt = sceneEnvironment.background;
            if (sceneEnvironment.props_in_scene?.length > 0) {
              bgPrompt += `. Scene includes ${sceneEnvironment.props_in_scene.join(", ")}`;
            }
            if (sceneEnvironment.special_effects) {
              bgPrompt += `. ${sceneEnvironment.special_effects}`;
            }

            const emotionPrompt = seg.emotion || "neutral";
            const lightingPrompt = sceneEnvironment.lighting;

            if (isInterviewQuestion) {
              // 인터뷰 질문: 강아지가 듣는 장면 (lip_sync 없음, 인터뷰어 음성만 재생)
              return `8K cinematic interview video. ${charPrompt} sits facing camera, listening attentively. ${bgPrompt}. ${lightingPrompt}. Dog has curious listening expression, head slightly tilted, ears perked up, mouth CLOSED. Occasionally blinks and makes small subtle nods. No talking. No mouth movement. No text. No subtitles. No watermarks.`;
            } else if (isFlashback) {
              // 회상 장면
              return `8K cinematic flashback video. ${charPrompt} in recalled scene. ${bgPrompt}. Slightly dreamy/vintage filter effect. ${emotionPrompt} expression. ${lightingPrompt}. No text. No subtitles. No watermarks.`;
            } else if (hasNarration) {
              // 대사 장면
              return `8K cinematic video. ${charPrompt} sits facing camera. ${bgPrompt}. ${lightingPrompt}. Dog speaks to camera with precise mouth movements matching each Korean syllable. ${emotionPrompt} expression. Same dog appearance maintained throughout. No text. No subtitles. No watermarks.`;
            } else {
              // 리액션/대기 장면
              return `8K cinematic video. ${charPrompt}. ${bgPrompt}. ${lightingPrompt}. ${emotionPrompt} expression, natural subtle movements. No text. No subtitles. No watermarks.`;
            }
          };

          // 립싱크 타이밍 생성 (veo_script_sample 형식)
          const generateLipSyncTiming = () => {
            // 인터뷰 질문일 때: 강아지는 말하지 않음 - 립싱크 타이밍 불필요
            if (isInterviewQuestion) return null;

            if (!hasNarration) return null;

            const text = seg.narration;
            const duration = seg.duration || 5;
            const timing = {};

            // 대기 시간 (0.5초)
            timing[`0.0_to_0.5_sec`] = {
              audio: "Silence",
              mouth: "Closed, relaxed",
              expression: `${seg.emotion || 'neutral'}, preparing to speak`,
            };

            // 대사 구간
            timing[`0.5_to_${duration}_sec`] = {
              text: text,
              mouth: "Precise mouth movements matching Korean syllables",
              expression: seg.emotion_transition || seg.emotion || "expressive",
            };

            return timing;
          };

          return {
            video: idx + 1,
            title: `${script.title?.korean || effectiveTopic} - Scene ${idx + 1}`,
            duration: `${seg.duration || 5} seconds`,
            resolution: "8K",

            // Veo 3 프롬프트 (8K, 자막 없음 명시)
            prompt: generateVeoPrompt(),

            // 대화 정보
            dialogue: {
              script: seg.narration || "",
              script_english: seg.narration_english || "",
              timing: {
                start: seg.start_time || 0,
                end: seg.end_time || seg.duration || 5,
              },
              audio_only: true,  // 자막 없이 오디오만
            },

            // 립싱크 타이밍
            lip_sync_timing: generateLipSyncTiming(),

            // 음성 설정
            voice_settings: isInterviewQuestion ? {
              // 인터뷰어가 말하는 장면
              interviewer: {
                type: "Korean female news anchor, 30s, professional friendly tone",
                consistent_across: "All videos",
              },
            } : {
              // 강아지 또는 다른 캐릭터가 말하는 장면
              [speaker]: speaker === "main" ? {
                type: "Korean baby girl, 2-3 years old toddler voice",
                tone: seg.audio_details?.voice_tone || "cute and expressive",
                emotion: seg.emotion || "neutral",
                consistent_across: "All videos",
              } : {
                type: voiceStyleMap[speaker] || "natural voice",
                consistent_across: "All videos",
              },
            },

            // 한글 입모양 매핑 (강아지가 말할 때만)
            korean_mouth_shapes: mouthShapes,

            // 립싱크 스타일
            lip_sync_style: isInterviewQuestion ? {
              // 인터뷰 질문: 강아지는 듣기만 함
              type: "Listening pose - NO lip sync",
              method: "Dog listens while interviewer speaks",
              mouth_movement: "NONE - mouth stays CLOSED",
              face: "Curious, attentive listening expression",
              body: "Subtle movements - occasional nod, ear twitch, blink",
              audio_source: "interviewer",
              dog_speaks: false,
              note: "Play interviewer TTS audio while dog shows listening animation",
            } : hasNarration ? {
              type: "Subtle talking photo style",
              method: "Minimal mouth animation on static image",
              mouth_movement: "Small natural opening and closing matching Korean syllables",
              face: "Keep same expression, only mouth area moves slightly",
              do_not: "Do not regenerate dog image, do not change dog appearance",
              dog_speaks: true,
            } : {
              type: "Static or minimal movement",
              mouth: "Closed or natural breathing",
              dog_speaks: false,
            },

            // ★ 캐릭터 외형 정보 (옷, 악세서리, 소품)
            character_appearance: characterAppearance,

            // ★ 씬 환경 정보 (배경, 조명, 소품)
            scene_environment: sceneEnvironment,

            // 시각적 연속성
            visual_continuity: {
              instruction: "Same visual appearance throughout video",
              dog: `Same ${characterAppearance.fur_color || 'fur color'}, same face, same ${characterAppearance.outfit || 'costume'} as reference`,
              accessories: characterAppearance.accessories?.length > 0
                ? `Must keep: ${characterAppearance.accessories.join(", ")}`
                : "No accessories",
              background: sceneEnvironment.background,
              keep_same: isInterviewQuestion
                ? "Everything identical - dog is LISTENING (mouth closed, no movement)"
                : "Everything identical to reference image except mouth movement",
            },

            // ★ 인터뷰 질문 전용 정보
            interview_question_info: isInterviewQuestion ? {
              dog_state: "listening",
              dog_lip_sync: false,
              dog_mouth: "CLOSED",
              dog_expression: "curious, attentive, head slightly tilted",
              dog_animation: "subtle nods, ear twitching, blinking",
              audio_source: "interviewer TTS",
              interviewer_text: seg.narration || "",
              note: "강아지는 말하지 않음 - 인터뷰어 음성만 재생, 강아지는 듣는 표정",
            } : null,

            // 씬 상세
            scene_details: {
              scene_type: seg.scene_type || "narration",
              speaker: speaker,
              character_name: seg.character_name,
              location: sceneEnvironment.location,
              background: sceneEnvironment.background,
              lighting: sceneEnvironment.lighting,
              weather: sceneEnvironment.weather,
              mood: sceneEnvironment.mood,
              props_in_scene: sceneEnvironment.props_in_scene,
              special_effects: sceneEnvironment.special_effects,
              is_flashback: isFlashback,
              is_interview_question: isInterviewQuestion,
            },

            // 감정 정보
            emotion: {
              primary: seg.emotion || "neutral",
              transition: seg.emotion_transition || null,
              ending_expression: seg.action_cues?.ending_expression || null,
            },

            // 출력 설정
            output: {
              format: "Video only",
              text_overlays: false,
              subtitles: false,
              watermarks: false,
            },

            // 기존 호환성 필드
            index: seg.index,
            start: seg.start_time,
            end: seg.end_time,
            narration: seg.narration || "",
            has_narration: hasNarration,
            image_prompt: seg.image_prompt,
            video_prompt: seg.video_prompt,
            audio_details: seg.audio_details,
            action_cues: seg.action_cues || {},
          };
        }) || [],
      },

      // ★ TTS용 음성 정보
      voice_segments: script.script_segments?.map((seg) => {
        const isInterviewerSpeaking = seg.scene_type === "interview_question" || seg.speaker === "interviewer";
        return {
          index: seg.index,
          text: seg.narration,
          speaker: seg.speaker,
          character_name: seg.character_name,
          voice_type: isInterviewerSpeaking ? "interviewer" : seg.voice_type,
          start: seg.start_time,
          end: seg.end_time,
          duration: seg.duration,
          emotion: seg.emotion,
          audio_details: seg.audio_details,
          // ★ 인터뷰 질문 정보
          is_interviewer_speaking: isInterviewerSpeaking,
          tts_voice: isInterviewerSpeaking
            ? "Korean female news anchor, 30s, professional friendly tone"
            : "Korean baby girl, 2-3 years old toddler voice",
          dog_lip_sync: !isInterviewerSpeaking, // 인터뷰어가 말할 때는 강아지 lip_sync 없음
        };
      }) || [],

      bgm: { mood: script.music_mood || "cute", duration: script.total_duration },
      script: script,
    };
  },
});
