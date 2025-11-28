import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Topic & Keyword Generator",
  description: "AI가 자동으로 바이럴 가능성 높은 토픽과 키워드를 생성합니다. 중복 방지 기능 포함.",

  props: {
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
      default: "gemini-3-pro-preview",
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
    // 2. 프롬프트 생성
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
- **SIMILAR** if: Same main characters (e.g., both about "dog vs cat"), same core conflict, same emotional arc, same punchline concept
- **NOT SIMILAR** if: Different characters, different situation, different emotional journey, unique twist even with similar elements

For each idea you generate, you MUST:
1. Compare it against ALL previous stories above
2. Mark it as "is_similar_to_previous": true/false
3. If similar, explain which previous story and why in "similarity_note"
4. PRIORITIZE ideas marked as NOT similar
` : '';

    const prompt = `You are a creative AI content strategist specializing in viral short-form video content.

## YOUR MISSION:
Autonomously generate ${this.generate_count} unique, creative, and viral-worthy content ideas for ${this.target_platform}.
You have COMPLETE FREEDOM to choose any topic, category, characters, and storyline.

## PLATFORM OPTIMIZATION:
${platformGuides[this.target_platform]}
${previousStoriesSection}
## CONTENT GUIDELINES:

### ✅ ENCOURAGED CONTENT TYPES:
1. **Pet Content** (반려동물)
   - 강아지, 고양이, 햄스터 등의 귀여운/재미있는 상황
   - 동물들 간의 상호작용, 우정, 라이벌 관계
   - 예: "시비거는 강아지 vs 참다가 폭발한 고양이의 냥펀치 대결"

2. **Heartwarming Stories** (감동 스토리)
   - 가족, 우정, 성장, 재회
   - 작은 친절이 만드는 큰 변화
   - 예: "버려진 강아지가 새 가족을 만나기까지"

3. **Comedy/Humor** (코미디)
   - 일상의 웃긴 상황, 반전, 아이러니
   - 과장된 리액션, 예상치 못한 결말
   - 예: "다이어트 결심 후 '마지막 한 입'을 100번 반복하는 나"

4. **Surprising Facts** (놀라운 사실)
   - 99%가 모르는 정보, 반전 있는 진실
   - 과학적 발견, 역사적 비하인드
   - 예: "고양이가 박스를 좋아하는 진짜 이유"

5. **Relatable Daily Life** (공감 일상)
   - 직장인, 학생, 부모 등의 공감 상황
   - "나만 그런 줄 알았는데" 모먼트
   - 예: "월요일 아침 vs 금요일 저녁의 나"

6. **Fantasy/Creative Stories** (창작 스토리)
   - 동물들의 의인화된 상황
   - 상상력 가득한 시나리오
   - 예: "고양이 카페 사장님의 하루 (고양이 시점)"

7. **Healing/ASMR** (힐링)
   - 마음이 편안해지는 콘텐츠
   - 자연, 일상의 소소함, 위로
   - 예: "비 오는 날 창가에서 낮잠 자는 고양이"

8. **Dramatic Relationships** (드라마틱한 관계)
   - 라이벌에서 친구로, 적에서 연인으로
   - 오해와 화해, 반전 있는 관계 변화
   - 예: "매일 싸우던 강아지와 고양이, 한쪽이 아프자 벌어진 일"

### 🎬 STORY STRUCTURE PATTERNS (choose one for each idea):
- **반전형**: 예상 → 반전 → 더 큰 반전 → 웃음/감동
- **성장형**: 시작 → 갈등 → 극복 → 성장
- **대결형**: 대립 → 클라이맥스 → 예상 밖 결말
- **감동형**: 일상 → 위기 → 도움 → 따뜻한 결말
- **코미디형**: 설정 → 반복/에스컬레이션 → 펀치라인

### ⛔ STRICTLY PROHIBITED CONTENT:
- Sexual content or innuendo (성적인 내용)
- Violence, gore, cruelty (폭력, 잔인함)
- Hate speech, discrimination (혐오, 차별)
- Illegal activities (불법 행위)
- Self-harm, dangerous challenges (자해, 위험한 도전)
- Political propaganda (정치적 선전)
- Fetish or perverted content (변태적 내용)
- Animal abuse (동물 학대)
- Bullying, harassment (괴롭힘)
- Misinformation, fake news (허위 정보)

## OUTPUT REQUIREMENTS:
${lang.instruction}

Generate creative, family-friendly content that:
1. Can go viral (high shareability)
2. Evokes strong emotions (laughter, warmth, surprise, empathy)
3. Is visually interesting for short-form video
4. Has a clear story arc within 30-60 seconds
5. Appeals to a wide audience
6. IS COMPLETELY DIFFERENT from previous topics listed above

## OUTPUT FORMAT (JSON only, no markdown):
{
  "generation_theme": "AI가 선택한 이번 생성의 전체 테마/분위기",
  "ideas": [
    {
      "id": 1,
      "category": "pet/comedy/heartwarming/surprising_facts/daily_life/fantasy/healing/drama",
      "topic": "간결하고 임팩트 있는 토픽 제목",
      "keywords": "키워드1, 키워드2, 키워드3, 키워드4, 키워드5",
      "main_characters": ["캐릭터1", "캐릭터2"],
      "story_summary": "2-3문장의 스토리 요약 (시작-전개-결말)",
      "hook": "첫 2-3초에 보여줄 강력한 후킹 장면/대사",
      "emotional_journey": "감정1 → 감정2 → 감정3",
      "story_structure": "반전형/성장형/대결형/감동형/코미디형",
      "character_dynamics": "캐릭터 간의 관계/상호작용 설명",
      "viral_elements": ["바이럴 요소1", "바이럴 요소2"],
      "viral_potential": 1-10,
      "suggested_content_angle": "shocking_facts/emotional_story/comparison/warning/problem_solving/ranking/hidden_meaning",
      "suggested_tone": "funny_cute/emotional/dramatic/heartwarming/surprising",
      "is_similar_to_previous": false,
      "similarity_note": "유사한 이전 스토리가 있으면 여기에 설명 (없으면 null)"
    }
  ],
  "best_pick": {
    "id": "가장 바이럴 가능성 높고 이전 스토리와 유사하지 않은 아이디어 ID",
    "reason": "선택 이유 (유사하지 않은 이유 포함)"
  }
}

Be wildly creative! The best viral content is unexpected and emotionally engaging.`;

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
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    $.export("$summary", `🎯 Generated ${result.ideas.length} ideas (${uniqueIdeas.length} unique). Selected: "${output.topic}" (Viral: ${selectedIdea.viral_potential}/10)`);

    return output;
  },
});
