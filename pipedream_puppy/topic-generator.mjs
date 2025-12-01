import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Topic Generator",
  description: "귀여운 강아지 중심의 바이럴 토픽과 키워드를 생성합니다. 시사/이슈를 강아지 버전으로 풍자하거나, AI가 자동으로 트렌디한 토픽을 생성합니다.",

  props: {
    // =====================
    // 사용자 입력 (선택) - 풍자/패러디용
    // =====================
    user_topic_input: {
      type: "string",
      label: "🎯 풍자할 주제 (Optional)",
      description: "풍자하고 싶은 시사/이슈/트렌드를 입력하세요. 예: '쿠팡 개인정보 유출 3700만건', '테슬라 자율주행 사고', '애플 비전프로 출시'. 비워두면 AI가 자동으로 트렌디한 토픽을 생성합니다.",
      optional: true,
    },
    user_keyword_hint: {
      type: "string",
      label: "🔑 변환 힌트 (Optional)",
      description: "강아지 버전으로 어떻게 변환할지 힌트를 입력하세요. 예: '중국, 차우차우, 사료 털림' → AI가 '중국집 차우차우한테 3700만개 사료 털린 강아지' 식으로 변환합니다.",
      optional: true,
    },
    script_format: {
      type: "string",
      label: "🎬 스크립트 형식",
      description: "스크립트 구성 형식을 선택하세요",
      options: [
        { label: "🎤 인터뷰 형식 (주인공 인터뷰)", value: "interview" },
        { label: "📖 독백 형식 (1인칭 나레이션)", value: "monologue" },
        { label: "💬 대화 형식 (캐릭터 간 대화)", value: "dialogue" },
        { label: "🎭 혼합 형식 (AI 자동 선택)", value: "mixed" },
      ],
      default: "interview",
    },

    // Gemini API 설정
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google AI Studio API Key (https://aistudio.google.com)",
      secret: true,
    },
    gemini_model: {
      type: "string",
      label: "Gemini Model",
      description: "사용할 Gemini 모델",
      options: [
        { label: "Gemini 2.5 Pro Preview", value: "gemini-2.5-pro-preview-05-06" },
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash-exp" },
        { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
      ],
      default: "gemini-2.0-flash-exp",
    },

    // 생성 개수
    generate_count: {
      type: "integer",
      label: "Number of Ideas to Generate",
      description: "생성할 아이디어 개수",
      default: 5,
      min: 1,
      max: 10,
    },

    // 타겟 플랫폼
    target_platform: {
      type: "string",
      label: "Target Platform",
      description: "타겟 플랫폼 (스타일 최적화)",
      options: [
        { label: "YouTube Shorts", value: "youtube_shorts" },
        { label: "TikTok", value: "tiktok" },
        { label: "Instagram Reels", value: "instagram_reels" },
        { label: "All Platforms", value: "all" },
      ],
      default: "youtube_shorts",
    },

    // 언어
    language: {
      type: "string",
      label: "Output Language",
      description: "출력 언어",
      options: [
        { label: "Japanese (일본어)", value: "japanese" },
        { label: "Korean (한국어)", value: "korean" },
        { label: "English (영어)", value: "english" },
      ],
      default: "japanese",
    },

    // GCS 설정 (히스토리 저장용)
    google_cloud: {
      type: "app",
      app: "google_cloud",
      description: "히스토리 저장용 GCS 연결 (중복 방지)",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      description: "히스토리 저장용 버킷",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
  },

  async run({ $ }) {
    const HISTORY_FILE = "_puppy_topic_history.json";

    // =====================
    // 1. 날짜/시간/계절 기반 동적 요소 생성
    // =====================
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayOfWeek = now.getDay(); // 0=일, 1=월, ...
    const hour = now.getHours();

    // 계절 판단
    const getSeason = (m) => {
      if (m >= 3 && m <= 5) return { name: "spring", ko: "봄", jp: "春", themes: ["벚꽃", "나들이", "꽃밭", "봄바람", "피크닉", "새싹", "알레르기"] };
      if (m >= 6 && m <= 8) return { name: "summer", ko: "여름", jp: "夏", themes: ["수박", "바다", "수영장", "에어컨", "더위", "아이스크림", "물놀이", "선풍기", "시원한"] };
      if (m >= 9 && m <= 11) return { name: "autumn", ko: "가을", jp: "秋", themes: ["단풍", "낙엽", "밤", "고구마", "산책", "쓸쓸함", "선선한", "독서"] };
      return { name: "winter", ko: "겨울", jp: "冬", themes: ["눈", "핫초코", "난로", "이불", "크리스마스", "새해", "따뜻함", "겨울잠", "눈사람"] };
    };

    // 요일별 테마
    const dayThemes = {
      0: { name: "sunday", ko: "일요일", themes: ["휴식", "늦잠", "집순이", "게으름", "힐링", "가족"] },
      1: { name: "monday", ko: "월요일", themes: ["월요병", "출근", "피곤", "커피", "새로운 시작", "의욕 없음"] },
      2: { name: "tuesday", ko: "화요일", themes: ["루틴", "일상", "평범한 하루"] },
      3: { name: "wednesday", ko: "수요일", themes: ["주중", "반의 반", "버티기"] },
      4: { name: "thursday", ko: "목요일", themes: ["불금 전날", "기대감", "조금만 더"] },
      5: { name: "friday", ko: "금요일", themes: ["불금", "퇴근", "행복", "설렘", "주말 계획"] },
      6: { name: "saturday", ko: "토요일", themes: ["주말", "놀이", "나들이", "신나는", "파티"] },
    };

    // 시간대별 테마
    const getTimeTheme = (h) => {
      if (h >= 5 && h < 9) return { name: "morning", ko: "아침", themes: ["기상", "아침밥", "산책", "알람", "늦잠"] };
      if (h >= 9 && h < 12) return { name: "late_morning", ko: "오전", themes: ["졸림", "낮잠", "간식"] };
      if (h >= 12 && h < 14) return { name: "lunch", ko: "점심", themes: ["밥", "먹방", "배고픔", "간식 타임"] };
      if (h >= 14 && h < 18) return { name: "afternoon", ko: "오후", themes: ["나른함", "산책", "낮잠", "놀이"] };
      if (h >= 18 && h < 21) return { name: "evening", ko: "저녁", themes: ["저녁밥", "퇴근", "집", "편안함"] };
      return { name: "night", ko: "밤", themes: ["잠", "이불", "밤산책", "야식", "꿈"] };
    };

    const season = getSeason(month);
    const dayTheme = dayThemes[dayOfWeek];
    const timeTheme = getTimeTheme(hour);

    // 특별한 날 체크
    const specialDays = [];
    if (month === 1 && day === 1) specialDays.push("새해");
    if (month === 2 && day === 14) specialDays.push("발렌타인데이");
    if (month === 3 && day === 14) specialDays.push("화이트데이");
    if (month === 4 && day === 1) specialDays.push("만우절");
    if (month === 5 && day === 5) specialDays.push("어린이날");
    if (month === 12 && day === 25) specialDays.push("크리스마스");
    if (month === 12 && day === 31) specialDays.push("연말");

    // 랜덤 추가 요소 (매일 다르게)
    const dailySeed = year * 10000 + month * 100 + day;
    const randomThemes = [
      "먹방", "ASMR", "리액션", "일상브이로그", "챌린지", "몰래카메라", "반전",
      "감동", "웃김", "귀여움폭발", "츤데레", "애교", "질투", "투정",
      "운동", "다이어트", "패션", "목욕", "미용", "건강", "교육",
      "친구", "가족", "형제", "라이벌", "케미", "우정", "사랑"
    ];
    const todayRandomTheme = randomThemes[dailySeed % randomThemes.length];

    $.export("daily_context", {
      date: `${year}-${month}-${day}`,
      season: season.ko,
      day_of_week: dayTheme.ko,
      time_of_day: timeTheme.ko,
      special_days: specialDays,
      random_theme: todayRandomTheme,
    });

    // =====================
    // 2. 사용자 입력 처리
    // =====================
    const hasUserInput = !!(this.user_topic_input || this.user_keyword_hint);

    if (hasUserInput) {
      $.export("user_input", {
        topic: this.user_topic_input || null,
        keyword_hint: this.user_keyword_hint || null,
        mode: "satire_transform",
      });
    } else {
      $.export("user_input", {
        topic: null,
        keyword_hint: null,
        mode: "auto_generate",
      });
    }

    // =====================
    // 3. 히스토리 로드 (story_summary 기반)
    // =====================
    let topicHistory = { story_summaries: [] };

    try {
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
      });
      const storage = google.storage({ version: 'v1', auth });

      try {
        const response = await storage.objects.get({
          bucket: this.gcs_bucket_name,
          object: HISTORY_FILE,
          alt: 'media',
        });
        topicHistory = response.data;
        $.export("history_loaded", `Loaded ${topicHistory.story_summaries?.length || 0} previous puppy stories`);
      } catch (e) {
        $.export("history_status", "No history file found, will create new one");
      }
    } catch (e) {
      $.export("history_error", e.message);
    }

    // 이전 story_summary들 추출 (AI 유사도 판단용)
    const previousStorySummaries = topicHistory.story_summaries || [];

    // =====================
    // 4. 프롬프트 생성
    // =====================
    const langConfig = {
      japanese: {
        instruction: "日本語で出力してください。自然で可愛らしい日本語表現を使用してください。",
        name: "Japanese",
      },
      korean: {
        instruction: "한국어로 출력해주세요. 자연스럽고 귀여운 한국어 표현을 사용해주세요.",
        name: "Korean",
      },
      english: {
        instruction: "Output in English. Use natural and cute English expressions.",
        name: "English",
      },
    };

    const lang = langConfig[this.language];

    const platformGuides = {
      youtube_shorts: "YouTube Shorts: 0-3초 강력한 후킹, 세로 9:16, 60초 이내, 댓글 유도, 반복 시청 유발",
      tiktok: "TikTok: 트렌디한 요소, 밈 활용, 듀엣/스티치 유도, 사운드 중요",
      instagram_reels: "Instagram Reels: 비주얼 중심, 세련된 편집, 해시태그 최적화",
      all: "모든 플랫폼에 적합하도록 범용적으로 제작",
    };

    // 이전 story_summary 목록을 프롬프트에 포함 (AI가 유사도 판단)
    const previousStoriesSection = previousStorySummaries.length > 0 ? `
## ⚠️ PREVIOUS PUPPY STORIES - MUST BE DIFFERENT:
Below are puppy story summaries that have been used before. Generate COMPLETELY DIFFERENT stories.

${previousStorySummaries.slice(-30).map((s, i) => `${i + 1}. "${s}"`).join('\n')}

For each idea, mark "is_similar_to_previous": true/false based on whether it's too similar.
` : '';

    // 사용자 입력에 따른 프롬프트 분기
    const userInputSection = hasUserInput ? `
## 🎯 USER INPUT - SATIRE/PARODY TRANSFORMATION (CRITICAL!)

**Original Topic to Satirize**: "${this.user_topic_input || '(없음)'}"
**Conversion Hints**: "${this.user_keyword_hint || '(없음)'}"

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
| 애플 비전프로 출시 | VR고글, 가상현실, 간식 | "VR고글 쓰고 가상 간식 먹방하는 강아지" |
| 연말정산 환급 | 간식 통장, 정산 | "간식 통장 연말정산 받은 강아지의 기쁨" |
| 삼성 AI 반도체 | AI 자동급식기 | "AI 자동급식기 해킹한 천재 강아지" |
| 국회 난투극 | 강아지 유치원, 싸움 | "강아지 유치원 간식시간 난투극 현장" |

### IMPORTANT:
- ALL ${this.generate_count} ideas must be variations of transforming the user's topic
- Each variation should have a different angle/approach to the satire
- Keep the funny puppy character narrating the story
` : `
## 🎯 AUTO-GENERATE MODE:
No user input provided. Generate fresh, trending puppy content ideas based on today's context.
Focus on: ${season.ko} themes, ${dayTheme.ko} vibes, ${todayRandomTheme} style.
`;

    const prompt = `You are a creative AI specializing in ADORABLE PUPPY content for viral short-form videos.
You excel at creating SATIRICAL/PARODY content that transforms real-world topics into cute puppy versions.

${userInputSection}

## 📅 TODAY'S CONTEXT:
- **Date**: ${year}년 ${month}월 ${day}일 (${dayTheme.ko})
- **Season**: ${season.ko} (${season.jp})
- **Season Themes**: ${season.themes.join(", ")}
- **Day Themes**: ${dayTheme.themes.join(", ")}
${specialDays.length > 0 ? `- **Special Day**: ${specialDays.join(", ")}` : ""}
- **Today's Random Theme**: ${todayRandomTheme}

## 🐶 PUPPY CHARACTER:
- The puppy TALKS and narrates in first person ("나는...", "私は...")
- Puppy wears cute clothes and accessories
- Puppy can hold props (food, toys, phone, etc.)
- Breed will be determined later in Script Generator (don't fix breed here)

## 🎬 SCRIPT FORMAT: ${this.script_format?.toUpperCase() || 'INTERVIEW'}
${this.script_format === 'interview' ? `
### 🎤 인터뷰 형식 (INTERVIEW FORMAT)
강아지가 카메라를 보고 인터뷰하는 형식. 보이지 않는 기자/MC가 질문하고 강아지가 대답.

**구성 예시:**
- (질문 자막) "이 사건에 대해 어떻게 생각하세요?"
- 강아지: "아니 내가 말이야... 진짜 어이가 없어서..."
- (질문 자막) "당시 상황을 설명해주세요"
- 강아지: "그러니까 그때 내가..."

**특징:**
- 강아지가 정면을 보고 이야기
- 억울함/분노/기쁨 등 감정을 직접 토로
- 시청자가 인터뷰 시청하는 느낌
- 중간중간 과거 회상 장면 삽입 가능
` : this.script_format === 'monologue' ? `
### 📖 독백 형식 (MONOLOGUE FORMAT)
강아지가 혼자 이야기하는 1인칭 나레이션.

**구성 예시:**
- "오늘 있었던 일을 말해줄게..."
- "내가 얼마나 억울했는지 알아?"

**특징:**
- 강아지 시점의 스토리텔링
- 감정 이입이 쉬움
` : this.script_format === 'dialogue' ? `
### 💬 대화 형식 (DIALOGUE FORMAT)
강아지와 주인/다른 동물의 대화.

**구성 예시:**
- 강아지: "할미! 이거 봐!"
- 할머니: "어머, 이게 뭐야?"

**특징:**
- 자연스러운 일상 대화
- 여러 캐릭터 등장
` : `
### 🎭 혼합 형식 (MIXED FORMAT)
상황에 맞게 인터뷰/독백/대화를 AI가 자동 선택.
풍자 콘텐츠는 주로 인터뷰 형식 추천.
`}

## PLATFORM: ${platformGuides[this.target_platform]}

${previousStoriesSection}

## 🎬 CONTENT CATEGORIES:
1. **풍자/패러디 (Satire)** - 시사/이슈를 강아지 버전으로
2. **먹방/간식 (Food)** - 간식 관련 상황
3. **일상/루틴 (Daily)** - 강아지 일상
4. **감정 표현 (Emotion)** - 질투, 애교, 삐짐
5. **재미/반전 (Comedy)** - 예상 밖 결말
6. **힐링 (Healing)** - 편안한 힐링 콘텐츠

## 🎯 VIRAL ELEMENTS:
- 첫 2초: 강력한 후킹
- 공감 포인트: 반려인 공감
- 반전: 귀여운 반전
- 댓글 유도: "우리 강아지도!" 반응

## ⛔ PROHIBITED (법적 안전):
- 동물 학대, 위험한 상황
- 성적/폭력적 내용
- 정치적으로 민감한 직접적 비판 (풍자는 OK, 직접 비판은 NO)
- ⚠️ **특정 기업/브랜드명 직접 언급 금지** (쿠팡 → 중국집, 테슬라 → 로봇청소기 등으로 변환)
- ⚠️ **특정 인물 직접 비하/비난 금지** (상황만 풍자, 개인 공격 X)
- ⚠️ **허위사실 유포 금지** ("~라는 소문이래", "~라 카더라" 등 전달 형식 사용)

## OUTPUT REQUIREMENTS:
${lang.instruction}

## OUTPUT FORMAT (JSON only, no markdown):
{
  "generation_theme": "${hasUserInput ? '사용자 입력 기반 풍자/패러디' : '오늘의 테마'}",
  "user_input_transformed": ${hasUserInput ? 'true' : 'false'},
  "original_topic": ${hasUserInput ? `"${this.user_topic_input || ''}"` : 'null'},
  "ideas": [
    {
      "id": 1,
      "category": "satire/food/daily/emotion/comedy/healing",
      "topic": "강아지 시점의 귀여운 제목",
      "keywords": "키워드1, 키워드2, 키워드3, 키워드4, 키워드5",
      "satire_info": {
        "original_reference": "원본 주제 (풍자인 경우)",
        "transformation_method": "변환 방법 설명",
        "humor_point": "웃음 포인트"
      },
      "puppy_character": {
        "suggested_breed": "추천 품종 (상황에 맞는)",
        "personality": "성격 특성",
        "outfit": "의상 설명",
        "props": ["소품1", "소품2"]
      },
      "story_summary": "2-3문장의 스토리 요약",
      "hook": "첫 2-3초 후킹 장면/대사",
      "narration_style": "귀여운/츤데레/순둥이/분노/억울",
      "emotional_journey": "감정1 → 감정2 → 감정3",
      "viral_elements": ["요소1", "요소2"],
      "viral_potential": 1-10,
      "is_similar_to_previous": false,
      "similarity_note": null
    }
  ],
  "best_pick": {
    "id": 1,
    "reason": "선택 이유"
  }
}

Be CREATIVE and FUNNY! Transform serious topics into adorable puppy satire!`;

    // =====================
    // 3. Gemini API 호출
    // =====================
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.gemini_model}:generateContent`;

    const aiResponse = await axios($, {
      url: GEMINI_API_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.gemini_api_key,
      },
      data: {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 8192,
        },
      },
    });

    let result;
    try {
      let responseContent = aiResponse.candidates[0].content.parts[0].text.trim();

      if (responseContent.startsWith("```json")) {
        responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (responseContent.startsWith("```")) {
        responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseContent = jsonMatch[0];
      }

      result = JSON.parse(responseContent);
    } catch (error) {
      $.export("parse_error", error.message);
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }

    // =====================
    // 4. AI 유사도 판단 기반 아이디어 선택
    // =====================
    // AI가 판단한 유사하지 않은 아이디어 필터링
    const uniqueIdeas = result.ideas.filter(idea => idea.is_similar_to_previous === false);
    const similarIdeas = result.ideas.filter(idea => idea.is_similar_to_previous === true);

    $.export("similarity_check", {
      total_generated: result.ideas.length,
      unique_ideas: uniqueIdeas.length,
      similar_ideas: similarIdeas.length,
      similar_notes: similarIdeas.map(i => ({ topic: i.topic, note: i.similarity_note })),
    });

    // 선택할 아이디어 결정
    let selectedIdea = null;
    if (uniqueIdeas.length > 0) {
      // AI가 유사하지 않다고 판단한 아이디어 중에서 선택
      if (result.best_pick) {
        const bestId = parseInt(result.best_pick.id);
        selectedIdea = uniqueIdeas.find(idea => idea.id === bestId);
      }
      if (!selectedIdea) {
        // viral_potential이 가장 높은 것 선택
        selectedIdea = uniqueIdeas.reduce((best, current) =>
          (current.viral_potential > best.viral_potential) ? current : best
        , uniqueIdeas[0]);
      }
    } else {
      // 모든 아이디어가 유사하면 가장 viral_potential이 높은 것 선택 (경고와 함께)
      $.export("warning", "AI judged all generated ideas as similar to previous stories. Selecting best available.");
      selectedIdea = result.ideas.reduce((best, current) =>
        (current.viral_potential > best.viral_potential) ? current : best
      , result.ideas[0]);
    }

    // =====================
    // 5. 히스토리 저장 (story_summary만 저장)
    // =====================
    try {
      const { google } = await import("googleapis");
      const { Readable } = await import("stream");

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
      });
      const storage = google.storage({ version: 'v1', auth });

      // 히스토리 업데이트 (story_summary만 저장)
      if (!topicHistory.story_summaries) topicHistory.story_summaries = [];

      // 선택된 아이디어의 story_summary 저장
      if (selectedIdea.story_summary) {
        topicHistory.story_summaries.push(selectedIdea.story_summary);
      }

      // 최근 100개만 유지 (너무 커지지 않도록)
      if (topicHistory.story_summaries.length > 100) {
        topicHistory.story_summaries = topicHistory.story_summaries.slice(-100);
      }

      topicHistory.last_updated = new Date().toISOString();
      topicHistory.total_count = topicHistory.story_summaries.length;

      // GCS에 저장
      const historyStream = new Readable();
      historyStream.push(JSON.stringify(topicHistory, null, 2));
      historyStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: HISTORY_FILE,
        media: {
          mimeType: 'application/json',
          body: historyStream,
        },
        requestBody: {
          name: HISTORY_FILE,
          contentType: 'application/json',
        },
      });

      $.export("history_saved", `Saved story_summary to history. Total: ${topicHistory.total_count}`);
    } catch (e) {
      $.export("history_save_error", e.message);
    }

    // =====================
    // 6. 결과 반환
    // =====================
    const output = {
      // ★ Script Generator 직접 연동용 필드 (최상위)
      topic: selectedIdea.topic,
      keywords: selectedIdea.keywords,

      // 강아지 캐릭터 정보 (Script Generator, Image Generator에서 사용)
      // ※ 품종은 Script Generator에서 이미지로 결정됨
      puppy_character: selectedIdea.puppy_character || {
        suggested_breed: "다양한 품종",
        personality: "귀여운",
        outfit: "분홍 리본",
        props: [],
      },

      // ★ 풍자/패러디 정보 (새로 추가)
      satire_info: selectedIdea.satire_info || null,
      is_satire: hasUserInput,
      original_topic: this.user_topic_input || null,
      keyword_hint: this.user_keyword_hint || null,

      // 스토리 컨텍스트 (Script Generator가 사용)
      story_summary: selectedIdea.story_summary,
      hook: selectedIdea.hook,
      narration_style: selectedIdea.narration_style || "귀여운",
      emotional_journey: selectedIdea.emotional_journey,
      category: selectedIdea.category,
      script_format: this.script_format || "interview",

      // 오늘의 컨텍스트 (동적 요소)
      daily_context: {
        date: `${year}-${month}-${day}`,
        season: season.ko,
        season_jp: season.jp,
        day_of_week: dayTheme.ko,
        time_of_day: timeTheme.ko,
        special_days: specialDays,
        random_theme: todayRandomTheme,
        seasonal_relevance: selectedIdea.seasonal_relevance,
      },

      // 선택된 아이디어 상세
      selected: selectedIdea,

      // 모든 생성된 아이디어 (참고용)
      all_ideas: result.ideas,

      // 유니크한 아이디어만 (중복 제외)
      unique_ideas: uniqueIdeas,

      // AI가 선택한 테마
      generation_theme: result.generation_theme,

      // 선택 이유
      selection_reason: result.best_pick?.reason || `Highest viral potential: ${selectedIdea.viral_potential}/10`,

      // 히스토리 정보
      history_info: {
        previous_stories_count: previousStorySummaries.length,
        is_unique: !selectedIdea.is_similar_to_previous,
        similarity_note: selectedIdea.similarity_note || null,
      },

      // 설정 정보
      settings: {
        language: this.language,
        target_platform: this.target_platform,
        generated_count: result.ideas.length,
        mode: hasUserInput ? "satire_transform" : "auto_generate",
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    const modeEmoji = hasUserInput ? "🎭" : "🐕";
    const modeText = hasUserInput ? "Satire" : "Auto";
    $.export("$summary", `${modeEmoji} [${modeText}] Generated ${result.ideas.length} ideas. Selected: "${output.topic}" (Viral: ${selectedIdea.viral_potential}/10)`);

    return output;
  },
});
