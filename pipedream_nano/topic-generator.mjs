import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Topic & Keyword Generator",
  description: "AI가 자동으로 바이럴 가능성 높은 토픽과 키워드를 생성합니다. 입력값이 있으면 그 주제를 기반으로 핫한 토픽을 재생성하고, 없으면 AI가 트렌디한 토픽을 자동 생성합니다. 강아지 중심의 재미/풍자/귀여움 콘텐츠에 특화되어 있습니다.",

  props: {
    // =====================
    // 사용자 입력 토픽 (선택)
    // =====================
    user_topic_input: {
      type: "string",
      label: "Topic Input (Optional)",
      description: "사용자가 원하는 주제/키워드를 입력하세요. 입력하면 해당 주제를 기반으로 바이럴될만한 토픽을 재생성합니다. 비워두면 AI가 현재 트렌드에 맞는 토픽을 자동 생성합니다. 예: '로봇청소기', '다이어트', '명절', '산책'",
      optional: true,
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
        { label: "Gemini 3 Pro Preview (최신, 권장)", value: "gemini-3-pro-preview" },
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
    const HISTORY_FILE = "_topic_history.json";

    // =====================
    // 1. 히스토리 로드 (story_summary 기반)
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
        $.export("history_loaded", `Loaded ${topicHistory.story_summaries?.length || 0} previous stories`);
      } catch (e) {
        $.export("history_status", "No history file found, will create new one");
      }
    } catch (e) {
      $.export("history_error", e.message);
    }

    // 이전 story_summary들 추출 (AI 유사도 판단용)
    const previousStorySummaries = topicHistory.story_summaries || [];

    // =====================
    // 2. 날짜/계절 정보 계산
    // =====================
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

    // 계절 판단
    let season, seasonThemes;
    if (month >= 3 && month <= 5) {
      season = "봄 (Spring)";
      seasonThemes = ["벚꽃 구경", "산책", "피크닉", "알레르기", "봄맞이 청소", "새학기", "입학", "졸업", "꽃놀이", "따뜻해진 날씨"];
    } else if (month >= 6 && month <= 8) {
      season = "여름 (Summer)";
      seasonThemes = ["수영", "더위", "에어컨", "아이스크림", "휴가", "바다", "수박", "여름 더위", "물놀이", "선풍기", "장마"];
    } else if (month >= 9 && month <= 11) {
      season = "가을 (Autumn)";
      seasonThemes = ["단풍", "추석/한가위", "명절", "가을 산책", "낙엽", "할로윈", "고구마", "밤", "환절기", "선선한 날씨"];
    } else {
      season = "겨울 (Winter)";
      seasonThemes = ["크리스마스", "새해", "눈", "따뜻한 집", "이불", "난로", "핫초코", "연말", "설날", "보온", "털옷"];
    }

    // 특별 이벤트/기념일 체크
    const specialEvents = [];
    if (month === 12 && day >= 20 && day <= 26) specialEvents.push("크리스마스 시즌");
    if (month === 12 && day >= 29 || (month === 1 && day <= 3)) specialEvents.push("새해/연말 시즌");
    if (month === 2 && day >= 10 && day <= 15) specialEvents.push("밸런타인데이");
    if (month === 3 && day >= 12 && day <= 15) specialEvents.push("화이트데이");
    if (month === 10 && day >= 28 || (month === 11 && day <= 1)) specialEvents.push("할로윈");
    if (dayOfWeek === "Monday") specialEvents.push("월요병/월요일 블루스");
    if (dayOfWeek === "Friday") specialEvents.push("불금/주말 기대");

    // =====================
    // 3. 프롬프트 생성
    // =====================
    const langConfig = {
      japanese: {
        instruction: "日本語で出力してください。自然な日本語表現を使用してください。",
        name: "Japanese",
      },
      korean: {
        instruction: "한국어로 출력해주세요. 자연스러운 한국어 표현을 사용해주세요.",
        name: "Korean",
      },
      english: {
        instruction: "Output in English. Use natural English expressions.",
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
## ⚠️ PREVIOUS STORIES - AI MUST JUDGE SIMILARITY:
Below are story summaries that have been used before. YOU must determine if your new ideas are too similar.

${previousStorySummaries.slice(-50).map((s, i) => `${i + 1}. "${s}"`).join('\n')}

### SIMILARITY JUDGMENT CRITERIA (YOU decide):
- **SIMILAR** if: Same main scenario (e.g., both about "dog vs robot vacuum"), same core conflict, same punchline concept
- **NOT SIMILAR** if: Different scenario, different conflict, unique twist even with similar elements

For each idea you generate, you MUST:
1. Compare it against ALL previous stories above
2. Mark it as "is_similar_to_previous": true/false
3. If similar, explain which previous story and why in "similarity_note"
4. PRIORITIZE ideas marked as NOT similar
` : '';

    // 사용자 입력 토픽에 따른 프롬프트 분기
    const userInputSection = this.user_topic_input ? `
## 🎯 USER INPUT TOPIC (MUST USE):
The user has provided this topic/keyword: **"${this.user_topic_input}"**

YOUR MISSION: Create ${this.generate_count} viral-worthy content ideas that incorporate this topic with a PUPPY/DOG as the main character.
- Transform this topic into entertaining puppy-centric content
- Find unexpected, funny, or touching angles related to this topic
- Think: "What would happen if a puppy encountered/experienced ${this.user_topic_input}?"
- Make it relatable, shareable, and emotionally engaging

Examples of transformation:
- Input "로봇청소기" → "로봇청소기 vs 겁쟁이 강아지, 3일간의 전쟁 기록"
- Input "다이어트" → "다이어트 중인 주인 몰래 간식 훔치는 강아지의 치밀한 작전"
- Input "명절" → "설날 친척집 가기 싫은 강아지의 연기력 대결"
` : `
## 🎯 AUTO-GENERATE VIRAL TOPICS:
No user input provided. YOU must autonomously generate trending, viral-worthy topics.
Focus on what's currently popular and timely considering the date and season below.
`;

    const prompt = `You are a creative AI content strategist specializing in viral short-form video content featuring PUPPIES/DOGS.

${userInputSection}

## 📅 CURRENT DATE & SEASON CONTEXT (VERY IMPORTANT FOR VIRAL CONTENT):
- **Today**: ${now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
- **Season**: ${season}
- **Seasonal Themes**: ${seasonThemes.join(', ')}
${specialEvents.length > 0 ? `- **Special Events**: ${specialEvents.join(', ')}` : ''}

🔥 **TIMING IS EVERYTHING**: Create content that feels CURRENT and RELEVANT to today's date!
- If it's winter, feature cozy/snow/holiday themes
- If it's Monday, relate to Monday blues
- If it's near a holiday, incorporate holiday elements
- Seasonal content gets 40% more engagement!

## 🐕 CORE REQUIREMENT: PUPPY/DOG AS MAIN CHARACTER

**EVERY idea MUST feature a puppy or dog as the MAIN CHARACTER.**
The dog should be:
- Cute and lovable (귀여움)
- Funny and relatable (재미/유머)
- Sometimes satirical of human behavior (풍자)
- Emotionally expressive
- Easy to anthropomorphize

## PLATFORM OPTIMIZATION:
${platformGuides[this.target_platform]}
${previousStoriesSection}

## 🎬 CONTENT THEMES FOR PUPPY CONTENT:

### 1. **일상 코미디 (Daily Comedy)**
   - 강아지의 엉뚱한 행동, 반전 리액션
   - 주인과의 귀여운 밀당
   - 예: "택배 올 때마다 경비대장 모드 ON하는 강아지"

### 2. **VS 대결 시리즈 (VS Battles)**
   - 강아지 vs 일상용품 (로봇청소기, 거울, 레이저포인터)
   - 강아지 vs 상황 (목욕, 병원, 미용실)
   - 예: "로봇청소기에 영역 침범당한 강아지의 분노"

### 3. **인간 풍자 (Human Satire through Dogs)**
   - 강아지 시점에서 본 인간의 이상한 행동
   - 직장인/학생/부모의 일상을 강아지로 표현
   - 예: "재택근무하는 주인이 이상해진 강아지의 관찰일지"

### 4. **감동/힐링 (Heartwarming)**
   - 강아지와 가족의 따뜻한 순간
   - 우정, 충성, 기다림의 스토리
   - 예: "퇴근길 매일 같은 자리에서 기다리는 강아지"

### 5. **시즌/이벤트 연동 (Seasonal)**
   - 현재 계절/기념일에 맞는 콘텐츠
   - 예: (겨울) "첫눈 내린 날 강아지의 리액션", (크리스마스) "산타 할아버지 도둑으로 착각한 강아지"

### 6. **트렌드/밈 패러디 (Trend Parody)**
   - 유행하는 밈, 챌린지를 강아지 버전으로
   - 인기 있는 포맷의 강아지 버전
   - 예: "요즘 유행하는 '조용히 해줄래요' 강아지 버전"

### 7. **정보성 콘텐츠 (Educational but Fun)**
   - 강아지에 대한 놀라운 사실 + 귀여운 영상
   - 예: "강아지가 고개를 갸웃하는 진짜 이유"

## 🎭 STORY STRUCTURE PATTERNS:
- **반전형**: 예상 → 반전 → 더 큰 반전 → 웃음
- **대결형**: 대립 → 클라이맥스 → 예상 밖 결말
- **코미디형**: 설정 → 반복/에스컬레이션 → 펀치라인
- **감동형**: 일상 → 위기 → 도움 → 따뜻한 결말
- **풍자형**: 인간 행동 → 강아지 시점 해석 → 웃음 포인트

## ⛔ STRICTLY PROHIBITED:
- Sexual content, Violence, Hate speech
- Animal abuse or dangerous situations
- Sad endings (we want POSITIVE emotions!)
- Content that makes dogs look stupid or mean

## OUTPUT REQUIREMENTS:
${lang.instruction}

Generate content that:
1. Features a PUPPY/DOG as the main character (MANDATORY)
2. Incorporates current season/date context
3. Is funny (재미), satirical (풍자), or cute (귀여움)
4. Can go viral (high shareability)
5. Has a clear story arc within 30-60 seconds
6. IS COMPLETELY DIFFERENT from previous stories

## OUTPUT FORMAT (JSON only, no markdown):
{
  "generation_theme": "이번 생성의 전체 테마 (예: '겨울맞이 강아지 일상', '월요일 강아지의 고충')",
  "date_context": {
    "season": "${season}",
    "special_events": ${JSON.stringify(specialEvents)},
    "incorporated": "how the date/season was incorporated into ideas"
  },
  "user_input": ${this.user_topic_input ? `"${this.user_topic_input}"` : 'null'},
  "ideas": [
    {
      "id": 1,
      "category": "daily_comedy/vs_battle/human_satire/heartwarming/seasonal/trend_parody/educational",
      "topic": "간결하고 임팩트 있는 토픽 제목 (반드시 강아지 관련)",
      "keywords": "키워드1, 키워드2, 키워드3, 키워드4, 키워드5",
      "main_characters": ["강아지 캐릭터 설명", "기타 캐릭터"],
      "puppy_character": {
        "personality": "강아지 성격 (예: 겁쟁이, 먹보, 호기심왕)",
        "breed_suggestion": "추천 견종 (예: 시바견, 골든리트리버, 포메라니안)",
        "key_trait": "핵심 특성 (이 영상에서 강조될 특성)"
      },
      "story_summary": "2-3문장의 스토리 요약 (시작-전개-결말)",
      "hook": "첫 2-3초에 보여줄 강력한 후킹 장면/대사",
      "funny_elements": ["웃음 포인트1", "웃음 포인트2"],
      "cute_elements": ["귀여움 포인트1", "귀여움 포인트2"],
      "satire_elements": ["풍자 포인트 (있는 경우)"],
      "emotional_journey": "감정1 → 감정2 → 감정3",
      "story_structure": "반전형/대결형/코미디형/감동형/풍자형",
      "viral_elements": ["바이럴 요소1", "바이럴 요소2"],
      "viral_potential": 1-10,
      "seasonal_relevance": "계절/날짜와의 연관성 설명",
      "suggested_content_angle": "shocking_facts/emotional_story/comparison/warning/problem_solving/ranking/hidden_meaning",
      "suggested_tone": "funny_cute/emotional/dramatic/heartwarming/surprising",
      "is_similar_to_previous": false,
      "similarity_note": "유사한 이전 스토리가 있으면 여기에 설명 (없으면 null)"
    }
  ],
  "best_pick": {
    "id": "가장 바이럴 가능성 높고 유니크한 아이디어 ID",
    "reason": "선택 이유 (계절성, 유니크함, 바이럴 가능성)"
  }
}

Be wildly creative! The best puppy content is unexpected, relatable, and makes people want to share it immediately!`;

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

      // 스토리 컨텍스트 (Script Generator가 사용)
      story_summary: selectedIdea.story_summary,
      hook: selectedIdea.hook,
      character_dynamics: selectedIdea.character_dynamics,
      emotional_journey: selectedIdea.emotional_journey,
      suggested_angle: selectedIdea.suggested_content_angle,
      suggested_tone: selectedIdea.suggested_tone,

      // ★ 강아지 캐릭터 정보 (새로 추가)
      puppy_character: selectedIdea.puppy_character || null,
      funny_elements: selectedIdea.funny_elements || [],
      cute_elements: selectedIdea.cute_elements || [],
      satire_elements: selectedIdea.satire_elements || [],

      // 선택된 아이디어 상세
      selected: selectedIdea,

      // 모든 생성된 아이디어 (참고용)
      all_ideas: result.ideas,

      // 유니크한 아이디어만 (중복 제외)
      unique_ideas: uniqueIdeas,

      // AI가 선택한 테마
      generation_theme: result.generation_theme,

      // ★ 날짜/계절 컨텍스트 (새로 추가)
      date_context: result.date_context || {
        season: season,
        special_events: specialEvents,
        incorporated: selectedIdea.seasonal_relevance || null,
      },

      // ★ 사용자 입력 정보 (새로 추가)
      user_input: {
        provided: !!this.user_topic_input,
        original_input: this.user_topic_input || null,
        transformed_to: selectedIdea.topic,
      },

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
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    // 입력값 유무에 따른 요약 메시지 변경
    const inputInfo = this.user_topic_input
      ? `📝 Input: "${this.user_topic_input}" → `
      : `🎲 Auto-generated: `;
    $.export("$summary", `🐕 ${inputInfo}"${output.topic}" (${season}) | Viral: ${selectedIdea.viral_potential}/10`);

    return output;
  },
});
