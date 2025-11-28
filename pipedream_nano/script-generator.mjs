import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Shorts Script Generator",
  description: "Generate viral, engaging scripts with unique angles and surprising facts (Gemini-powered)",
  type: "action",
  props: {
    // =====================
    // Topic Generator 연동 (선택)
    // =====================
    topic_generator_output: {
      type: "string",
      label: "Topic Generator Output (JSON) - Optional",
      description: "Topic Generator의 출력. 사용시 topic/keywords 자동 설정. 사용: {{JSON.stringify(steps.Topic_Keyword_Generator.$return_value)}}",
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
      default: "gemini-3-pro-preview",
    },
    // 샘플 쇼츠 링크 분석
    sample_shorts_url: {
      type: "string",
      label: "Sample Shorts URL (Optional)",
      description: "참고할 쇼츠 링크 (예: https://youtube.com/shorts/xxxx) - 유사한 스타일로 대본/이미지스타일 생성",
      optional: true,
    },
    youtube_data_api: {
      type: "app",
      app: "youtube_data_api",
      description: "샘플 쇼츠 분석용 (sample_shorts_url 사용시 필요)",
      // optional: true,
    },
    // 주제 입력 (Topic Generator 사용시 자동 설정됨)
    topic: {
      type: "string",
      label: "Topic",
      description: "구체적인 주제. Topic Generator 사용시 자동 설정됨",
      optional: true,
    },
    keywords: {
      type: "string",
      label: "Additional Keywords (Optional)",
      description: "추가 키워드 (콤마로 구분). Topic Generator 사용시 자동 설정됨",
      optional: true,
    },
    // 바이럴 콘텐츠 앵글
    content_angle: {
      type: "string",
      label: "Content Angle",
      description: "바이럴 콘텐츠 앵글 선택",
      options: [
        { label: "🤯 충격적 사실 (99%가 모르는...)", value: "shocking_facts" },
        { label: "🔬 과학적 발견 (연구로 밝혀진...)", value: "scientific" },
        { label: "😢 감동 스토리 (실제로 있었던...)", value: "emotional_story" },
        { label: "🆚 비교 분석 (A vs B)", value: "comparison" },
        { label: "⚠️ 경고/주의 (절대 하면 안되는...)", value: "warning" },
        { label: "💡 문제 해결 (이렇게 하면 해결)", value: "problem_solving" },
        { label: "🏆 랭킹/TOP (가장 ~한 TOP 5)", value: "ranking" },
        { label: "🕵️ 숨겨진 의미 (이 행동의 진짜 이유)", value: "hidden_meaning" },
        { label: "🌍 문화 비교 (한국 vs 일본 vs 미국)", value: "culture_compare" },
        { label: "⏰ 역사/기원 (원래는 ~였다)", value: "history_origin" },
        { label: "💰 돈/비용 (실제 비용 공개)", value: "money_facts" },
        { label: "👨‍⚕️ 전문가 의견 (수의사가 말하는...)", value: "expert_opinion" },
      ],
      default: "shocking_facts",
    },
    content_style: {
      type: "string",
      label: "Content Style",
      description: "콘텐츠 스타일",
      options: [
        { label: "Pet (반려동물/강아지/고양이)", value: "pet" },
        { label: "Motivational (동기부여/자기계발)", value: "motivational" },
        { label: "Healing (힐링/감성)", value: "healing" },
        { label: "Story (스토리/서사)", value: "story" },
        { label: "Comedy (코미디/유머)", value: "comedy" },
        { label: "Educational (교육/정보)", value: "educational" },
        { label: "ASMR/Relaxing (ASMR/릴렉싱)", value: "asmr" },
        { label: "Daily Life (일상/Vlog)", value: "daily" },
        { label: "Cute (귀여운/사랑스러운)", value: "cute" },
      ],
      default: "pet",
    },
    target_emotion: {
      type: "string",
      label: "Target Emotion",
      description: "타겟 감정",
      options: [
        { label: "감동 (Touching)", value: "touching" },
        { label: "힐링 (Healing)", value: "healing" },
        { label: "웃음 (Funny)", value: "funny" },
        { label: "공감 (Empathy)", value: "empathy" },
        { label: "열정 (Passion)", value: "passion" },
        { label: "평온 (Calm)", value: "calm" },
        { label: "귀여움 (Cute)", value: "cute" },
        { label: "따뜻함 (Warm)", value: "warm" },
      ],
      default: "passion",
    },
    duration_seconds: {
      type: "integer",
      label: "Duration (seconds)",
      description: "영상 길이 (초)",
      default: 40,
      min: 15,
      max: 60,
    },
    language: {
      type: "string",
      label: "Script Language",
      description: "대본 언어",
      options: [
        { label: "Japanese (일본어)", value: "japanese" },
        { label: "Korean (한국어)", value: "korean" },
        { label: "English (영어)", value: "english" },
      ],
      default: "japanese",
    },
    voice_style: {
      type: "string",
      label: "Voice Style",
      description: "나레이션 스타일",
      options: [
        { label: "Calm & Warm (차분하고 따뜻한)", value: "calm_warm" },
        { label: "Energetic (활기찬)", value: "energetic" },
        { label: "Emotional (감성적인)", value: "emotional" },
        { label: "Professional (전문적인)", value: "professional" },
        { label: "Friendly (친근한)", value: "friendly" },
        { label: "Soft (부드럽고 나긋나긋한)", value: "soft" },
        { label: "Cheerful (밝고 경쾌한)", value: "cheerful" },
      ],
      default: "calm_warm",
    },
    include_scenes: {
      type: "boolean",
      label: "Include Scene Descriptions",
      description: "장면 설명 포함 여부 (이미지 생성용)",
      default: true,
    },
    // 등장인물 설정
    character_image_url: {
      type: "string",
      label: "Character Image URL (Optional)",
      description: "등장인물 참조 이미지 URL (이 이미지를 기반으로 캐릭터 생성). 입력하지 않으면 AI가 자동 생성",
      optional: true,
    },
    character_name: {
      type: "string",
      label: "Character Name (Optional)",
      description: "등장인물 이름 (예: '뽀삐', 'Max', 'モモ'). 입력하지 않으면 AI가 자동 생성",
      optional: true,
    },
  },
  async run({ $ }) {
    // =====================
    // Topic Generator 출력 파싱 (있는 경우)
    // =====================
    let topicGenOutput = null;
    let effectiveTopic = this.topic;
    let effectiveKeywords = this.keywords;
    let storyContext = null; // Topic Generator에서 전달된 스토리 컨텍스트

    if (this.topic_generator_output) {
      try {
        topicGenOutput = typeof this.topic_generator_output === 'string'
          ? JSON.parse(this.topic_generator_output)
          : this.topic_generator_output;

        // Topic Generator 출력에서 값 추출
        effectiveTopic = this.topic || topicGenOutput.topic || topicGenOutput.selected?.topic;
        effectiveKeywords = this.keywords || topicGenOutput.keywords || topicGenOutput.selected?.keywords;

        // 스토리 컨텍스트 추출 (프롬프트에 사용)
        storyContext = {
          story_summary: topicGenOutput.story_summary || topicGenOutput.selected?.story_summary,
          hook: topicGenOutput.hook || topicGenOutput.selected?.hook,
          character_dynamics: topicGenOutput.character_dynamics || topicGenOutput.selected?.character_dynamics,
          emotional_journey: topicGenOutput.emotional_journey || topicGenOutput.selected?.emotional_journey,
          suggested_angle: topicGenOutput.suggested_angle || topicGenOutput.selected?.suggested_angle,
        };

        $.export("topic_generator_parsed", {
          topic: effectiveTopic,
          keywords: effectiveKeywords,
          has_story_context: !!storyContext.story_summary,
          suggested_angle: storyContext.suggested_angle,
        });
      } catch (e) {
        $.export("topic_generator_parse_error", e.message);
      }
    }

    // topic 필수 검증
    if (!effectiveTopic) {
      throw new Error("Topic is required. Either provide it directly or use Topic Generator output.");
    }

    // 바이럴 콘텐츠 앵글 가이드 (핵심!)
    const angleGuides = {
      shocking_facts: {
        hook_template: "99%의 사람들이 모르는 {topic}의 비밀",
        structure: "충격적 사실 제시 → 왜 몰랐는지 → 더 놀라운 사실들 → 시청자 반응 유도",
        requirements: "구체적인 숫자, 연구 결과, 또는 검증된 사실 포함 필수",
        examples: [
          "시바견이 절대로 하지 않는 행동이 있는데, 이유가 충격적입니다",
          "고양이가 박스를 좋아하는 진짜 이유, 과학자들도 놀랐습니다",
          "강아지 코가 젖어있는 이유, 알고 나면 소름돋습니다",
        ],
        avoid: ["~에 대해 알아보겠습니다", "오늘은 ~를 소개합니다"],
      },
      scientific: {
        hook_template: "최신 연구로 밝혀진 {topic}의 진실",
        structure: "연구 결과 소개 → 실험 내용 → 결론 → 실생활 적용",
        requirements: "실제 연구, 대학, 또는 전문 기관 언급. 구체적 수치 포함",
        examples: [
          "하버드 연구팀이 발견한 강아지 지능의 비밀",
          "일본 수의학회가 경고한 고양이 사료의 진실",
          "10년 추적 연구로 밝혀진 반려견 수명 연장법",
        ],
        avoid: ["~가 좋다고 합니다", "전문가들은 ~라고 말합니다"],
      },
      emotional_story: {
        hook_template: "실제로 있었던 {topic} 이야기",
        structure: "상황 설정 → 갈등/위기 → 전환점 → 감동적 결말",
        requirements: "구체적인 장소, 시간, 인물 설정. 감정선 명확히",
        examples: [
          "버려진 시바견이 주인을 3년 동안 기다린 이유",
          "유기견 보호소에서 마지막까지 입양되지 않던 강아지의 반전",
          "교통사고로 주인을 잃은 고양이가 한 행동",
        ],
        avoid: ["감동적인 이야기입니다", "눈물 주의"],
      },
      comparison: {
        hook_template: "{A} vs {B}, 승자는?",
        structure: "비교 대상 소개 → 차이점 나열 → 의외의 공통점 → 결론",
        requirements: "객관적 데이터 기반. 한쪽 편들지 않기",
        examples: [
          "시바견 vs 진돗개, 실제 성격 비교 결과",
          "한국 vs 일본 강아지 문화 차이점 5가지",
          "건식사료 vs 습식사료, 수의사의 결론",
        ],
        avoid: ["당연히 ~가 좋습니다", "모두 알다시피"],
      },
      warning: {
        hook_template: "절대 {topic}에게 하면 안되는 것",
        structure: "경고 → 왜 위험한지 → 실제 사례 → 대안 제시",
        requirements: "구체적인 위험성. 과장 금지, 사실 기반",
        examples: [
          "강아지에게 절대 먹이면 안되는 과일 1위",
          "고양이 집사 90%가 모르는 치명적 실수",
          "수의사가 경고하는 강아지 산책 시 절대 금기",
        ],
        avoid: ["주의하세요", "조심해야 합니다"],
      },
      problem_solving: {
        hook_template: "{문제}를 3일만에 해결한 방법",
        structure: "문제 공감 → 시도했던 방법들 → 해결책 발견 → 결과",
        requirements: "구체적인 방법과 기간. 실제 효과 수치",
        examples: [
          "강아지 분리불안, 수의사도 놀란 해결법",
          "고양이 야옹 소리 멈추게 한 의외의 방법",
          "강아지 입냄새 3일만에 없앤 비법",
        ],
        avoid: ["이렇게 해보세요", "~하면 됩니다"],
      },
      ranking: {
        hook_template: "가장 {특성}한 {topic} TOP 5",
        structure: "기준 설명 → 5위~2위 → 1위 공개 → 의외의 순위 해설",
        requirements: "객관적 기준 제시. 순위 선정 이유 명확히",
        examples: [
          "가장 키우기 쉬운 강아지 품종 TOP 5",
          "수의사들이 절대 안 키우는 품종 1위",
          "일본에서 가장 인기있는 강아지 품종 변천사",
        ],
        avoid: ["개인 취향입니다", "정답은 없습니다"],
      },
      hidden_meaning: {
        hook_template: "{topic}이 {행동}하는 진짜 이유",
        structure: "행동 묘사 → 흔한 오해 → 진짜 이유 → 대처법",
        requirements: "과학적/행동학적 근거. 출처 있으면 더 좋음",
        examples: [
          "강아지가 발을 핥는 진짜 이유, 애정 표현 아닙니다",
          "고양이가 화장실 따라오는 숨겨진 의미",
          "강아지가 잘 때 발을 떠는 이유, 꿈 때문 아닙니다",
        ],
        avoid: ["~일 수도 있습니다", "여러 이유가 있습니다"],
      },
      culture_compare: {
        hook_template: "한국 vs 일본 vs 미국, {topic} 문화 차이",
        structure: "각국 문화 소개 → 차이점 → 이유 분석 → 인사이트",
        requirements: "정확한 국가별 정보. 편견 없이 객관적으로",
        examples: [
          "일본에서 강아지 산책할 때 이것 안하면 벌금",
          "미국 vs 한국 강아지 훈련법 차이",
          "독일에서 반려견 키우려면 면허가 필요한 이유",
        ],
        avoid: ["우리나라가 최고", "외국은 다릅니다"],
      },
      history_origin: {
        hook_template: "{topic}의 놀라운 기원",
        structure: "현재 모습 → 과거 기원 → 변천사 → 의외의 사실",
        requirements: "역사적 사실 기반. 연도/시대 구체적으로",
        examples: [
          "시바견이 원래 사냥개였던 충격적인 과거",
          "골든리트리버가 만들어진 진짜 이유",
          "고양이가 신으로 숭배받던 시절의 비밀",
        ],
        avoid: ["옛날에는 ~했습니다", "역사를 알아봅시다"],
      },
      money_facts: {
        hook_template: "{topic} 실제 비용, 공개합니다",
        structure: "비용 공개 → 세부 항목 → 숨겨진 비용 → 절약팁",
        requirements: "실제 가격/비용. 최신 정보로 업데이트",
        examples: [
          "강아지 한 마리 키우는데 진짜 드는 비용",
          "시바견 분양가 왜 이렇게 비싼지 알려드림",
          "반려견 의료비, 보험 가입 전후 비교",
        ],
        avoid: ["비용이 많이 듭니다", "경제적 부담이 있습니다"],
      },
      expert_opinion: {
        hook_template: "수의사 15년차가 말하는 {topic}의 진실",
        structure: "전문가 소개 → 일반 상식 뒤집기 → 전문가 조언 → 핵심 포인트",
        requirements: "전문가 경력/자격 언급. 구체적인 조언",
        examples: [
          "수의사가 절대 자기 강아지에게 안 하는 것",
          "브리더 20년차가 추천하는 강아지 선택법",
          "동물행동전문가가 경고하는 훈련 실수",
        ],
        avoid: ["전문가에 따르면", "의사 선생님이 말하길"],
      },
    };

    const styleGuides = {
      motivational: {
        structure: "도입(공감) → 문제제기 → 해결/깨달음 → 행동촉구",
        tone: "희망적이고 격려하는",
        keywords_jp: ["頑張る", "夢", "挑戦", "成長", "自分を信じる"],
      },
      healing: {
        structure: "평온한 시작 → 감성적 전개 → 위로의 메시지 → 따뜻한 마무리",
        tone: "부드럽고 위로하는",
        keywords_jp: ["癒し", "大丈夫", "ゆっくり", "心", "優しい"],
      },
      story: {
        structure: "상황설정 → 갈등/전환점 → 클라이맥스 → 여운있는 결말",
        tone: "서사적이고 몰입감있는",
        keywords_jp: ["物語", "出会い", "運命", "変化", "始まり"],
      },
      comedy: {
        structure: "기대설정 → 반전 → 펀치라인 → 웃음포인트",
        tone: "유머러스하고 가벼운",
        keywords_jp: ["面白い", "笑", "まさか", "なんで", "草"],
      },
      educational: {
        structure: "흥미유발 질문 → 핵심정보 → 실용적 팁 → 요약",
        tone: "친절하고 명확한",
        keywords_jp: ["知ってた", "実は", "コツ", "方法", "ポイント"],
      },
      asmr: {
        structure: "조용한 도입 → 감각적 묘사 → 편안한 전개 → 평화로운 마무리",
        tone: "속삭이듯 부드러운",
        keywords_jp: ["静か", "音", "リラックス", "眠り", "穏やか"],
      },
      daily: {
        structure: "일상 시작 → 에피소드 → 느낀점/공감 → 마무리",
        tone: "자연스럽고 친근한",
        keywords_jp: ["今日", "日常", "ふと", "思った", "みんな"],
      },
      cute: {
        structure: "귀여운 등장 → 사랑스러운 행동 → 감탄 포인트 → 힐링 마무리",
        tone: "사랑스럽고 귀여운",
        keywords_jp: ["かわいい", "癒し", "ふわふわ", "もふもふ", "キュン"],
      },
      pet: {
        structure: "흥미로운 사실 → 귀여운 예시 → 깊은 정보 → 시청자 참여 유도",
        tone: "따뜻하면서도 정보성 있는",
        keywords_jp: ["犬", "猫", "ペット", "家族", "癒し", "かわいい", "驚き"],
      },
    };

    const emotionGuides = {
      touching: "감동을 주는, 눈물이 날 것 같은",
      healing: "마음이 편안해지는, 위로받는",
      funny: "웃음이 나는, 유쾌한",
      empathy: "공감되는, 나도 그래",
      passion: "열정이 불타오르는, 도전하고 싶은",
      calm: "평온한, 차분해지는",
      cute: "귀엽고 사랑스러운, 심쿵하는",
      warm: "따뜻하고 포근한, 마음이 녹는",
    };

    const voiceGuides = {
      calm_warm: "차분하고 따뜻한 톤, 천천히 말하듯",
      energetic: "활기차고 빠른 톤, 열정적으로",
      emotional: "감성적이고 깊은 톤, 감정을 담아",
      professional: "명확하고 신뢰감있는 톤",
      friendly: "친근하고 편안한 톤, 친구에게 말하듯",
      soft: "부드럽고 나긋나긋한 톤, 속삭이듯",
      cheerful: "밝고 경쾌한 톤, 즐거운 느낌으로",
    };

    const languageConfig = {
      japanese: {
        name: "일본어",
        instruction: "日本語で書いてください。自然な日本語表現を使用してください。",
        chars_per_second: 4, // 일본어는 초당 약 4자
      },
      korean: {
        name: "한국어",
        instruction: "한국어로 작성해주세요. 자연스러운 한국어 표현을 사용해주세요.",
        chars_per_second: 5,
      },
      english: {
        name: "영어",
        instruction: "Write in English. Use natural, conversational English.",
        chars_per_second: 12, // 영어는 초당 약 12자 (words 기준으로는 2-3)
      },
    };

    const style = styleGuides[this.content_style];
    const emotion = emotionGuides[this.target_emotion];
    const voice = voiceGuides[this.voice_style];
    const lang = languageConfig[this.language];

    // =====================
    // 병렬 분석: 샘플 쇼츠 + 캐릭터 이미지 동시 처리
    // =====================

    // Vision 분석용 빠른 모델 (Flash 사용으로 속도 향상)
    const visionModel = this.gemini_model;

    // 병렬 작업 정의
    const parallelTasks = [];

    // Task 1: 샘플 쇼츠 분석 (YouTube API + 썸네일 Vision 분석)
    let sampleAnalysisPromise = null;
    let videoId = null;

    if (this.sample_shorts_url && this.youtube_data_api) {
      const shortsMatch = this.sample_shorts_url.match(/shorts\/([a-zA-Z0-9_-]+)/);
      const watchMatch = this.sample_shorts_url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
      const shortUrlMatch = this.sample_shorts_url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);

      if (shortsMatch) videoId = shortsMatch[1];
      else if (watchMatch) videoId = watchMatch[1];
      else if (shortUrlMatch) videoId = shortUrlMatch[1];

      if (videoId) {
        sampleAnalysisPromise = (async () => {
          try {
            // 1단계: YouTube API 병렬 호출 (video info + channel videos 동시)
            const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

            const [videoResponse, thumbnailResponse] = await Promise.all([
              axios($, {
                url: "https://www.googleapis.com/youtube/v3/videos",
                headers: {
                  Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
                },
                params: {
                  part: "snippet,statistics,contentDetails",
                  id: videoId,
                },
              }),
              axios($, {
                method: "GET",
                url: thumbnailUrl,
                responseType: "arraybuffer",
              }).catch(() => null), // 썸네일 실패해도 계속 진행
            ]);

            if (!videoResponse.items || videoResponse.items.length === 0) {
              return null;
            }

            const video = videoResponse.items[0];

            // 2단계: 채널 영상 조회 + Vision 분석 병렬 실행
            const channelVideosPromise = axios($, {
              url: "https://www.googleapis.com/youtube/v3/search",
              headers: {
                Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
              },
              params: {
                part: "snippet",
                channelId: video.snippet.channelId,
                order: "viewCount",
                maxResults: 5,
                type: "video",
              },
            }).catch(() => ({ items: [] }));

            let visionPromise = Promise.resolve(null);
            if (thumbnailResponse) {
              const thumbnailBase64 = Buffer.from(thumbnailResponse).toString("base64");
              visionPromise = axios($, {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent`,
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": this.gemini_api_key,
                },
                data: {
                  contents: [{
                    parts: [
                      {
                        text: `Analyze this YouTube Shorts thumbnail image and extract the visual style information for AI image generation.

Return a JSON object with these fields:
{
  "image_style": "3d_render/anime/photorealistic/digital_art/watercolor/oil_painting/cinematic",
  "character_type": "description of main character (e.g., 'cute white fluffy dog like Bichon Frise')",
  "character_style": "anthropomorphized/realistic/cartoon/chibi",
  "character_features": ["wearing clothes", "human-like pose", "holding objects", etc.],
  "background_type": "indoor/outdoor/abstract/studio",
  "background_description": "detailed background description",
  "color_palette": "warm/cool/pastel/vibrant/muted",
  "lighting": "soft/dramatic/natural/studio",
  "mood": "cute/funny/emotional/dramatic/calm",
  "special_elements": ["microphone", "food", "props", etc.],
  "text_overlay_style": "description of text style if present",
  "aspect_ratio": "9:16 for shorts",
  "quality_keywords": ["high detail", "soft focus", "bokeh", etc.],
  "negative_prompts": ["things to avoid in generation"]
}

Return ONLY valid JSON, no markdown.`
                      },
                      {
                        inline_data: {
                          mime_type: "image/jpeg",
                          data: thumbnailBase64
                        }
                      }
                    ]
                  }],
                  generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048,
                  },
                },
              }).catch(() => null);
            }

            const [channelVideosResponse, visionResponse] = await Promise.all([
              channelVideosPromise,
              visionPromise,
            ]);

            // Vision 결과 파싱
            let imageStyleAnalysis = null;
            if (visionResponse) {
              try {
                let styleContent = visionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (styleContent) {
                  if (styleContent.startsWith("```json")) {
                    styleContent = styleContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                  } else if (styleContent.startsWith("```")) {
                    styleContent = styleContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
                  }
                  const jsonMatch = styleContent.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    imageStyleAnalysis = JSON.parse(jsonMatch[0]);
                  }
                }
              } catch (e) {
                // Vision 파싱 실패는 무시
              }
            }

            const finalThumbnailUrl = video.snippet.thumbnails?.maxres?.url ||
                                      video.snippet.thumbnails?.high?.url ||
                                      video.snippet.thumbnails?.medium?.url ||
                                      thumbnailUrl;

            return {
              video_id: videoId,
              title: video.snippet.title,
              description: video.snippet.description,
              tags: video.snippet.tags || [],
              channel_title: video.snippet.channelTitle,
              view_count: video.statistics?.viewCount,
              like_count: video.statistics?.likeCount,
              comment_count: video.statistics?.commentCount,
              duration: video.contentDetails?.duration,
              thumbnail_url: finalThumbnailUrl,
              image_style: imageStyleAnalysis,
              channel_top_videos: channelVideosResponse.items?.map(v => ({
                title: v.snippet.title,
                description: v.snippet.description?.substring(0, 200),
              })) || [],
            };
          } catch (e) {
            $.export("sample_analysis_error", e.message);
            return null;
          }
        })();
        parallelTasks.push(sampleAnalysisPromise);
      }
    }

    // Task 2: 캐릭터 이미지 분석
    let characterAnalysisPromise = null;

    if (this.character_image_url) {
      characterAnalysisPromise = (async () => {
        try {
          // 이미지 다운로드 + Vision 분석 순차 실행 (이미지 필요)
          const characterImageResponse = await axios($, {
            method: "GET",
            url: this.character_image_url,
            responseType: "arraybuffer",
          });
          const characterImageBase64 = Buffer.from(characterImageResponse).toString("base64");

          const characterVisionResponse = await axios($, {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${visionModel}:generateContent`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.gemini_api_key,
            },
            data: {
              contents: [{
                parts: [
                  {
                    text: `Analyze this character/subject image for AI image generation reference.
This character will be used as the main subject in all generated scenes.

Return a JSON object with these fields:
{
  "character_type": "type of subject (e.g., 'dog', 'cat', 'person', 'mascot')",
  "species_breed": "specific breed or type if applicable (e.g., 'Shiba Inu', 'Persian cat')",
  "appearance": {
    "size": "small/medium/large",
    "body_shape": "description of body shape",
    "fur_hair_color": "main color(s)",
    "fur_hair_texture": "fluffy/smooth/curly/short",
    "distinctive_features": ["list of distinctive features"],
    "face_description": "detailed face description",
    "eye_color": "eye color",
    "expression_style": "typical expression style"
  },
  "style_keywords": ["keywords for consistent generation"],
  "clothing_accessories": ["any clothing or accessories if present"],
  "personality_impression": "personality impression from the image",
  "pose_suggestion": ["suggested poses that would suit this character"],
  "image_generation_prompt": "A detailed prompt segment to consistently generate this character",
  "negative_prompts": ["things to avoid to maintain consistency"]
}

Return ONLY valid JSON, no markdown.`
                  },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: characterImageBase64
                    }
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048,
              },
            },
          });

          let characterContent = characterVisionResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (characterContent) {
            if (characterContent.startsWith("```json")) {
              characterContent = characterContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (characterContent.startsWith("```")) {
              characterContent = characterContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }
            const jsonMatch = characterContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              let jsonStr = jsonMatch[0];
              let result;
              try {
                result = JSON.parse(jsonStr);
              } catch (parseError) {
                // JSON 파싱 실패 시 복구 시도
                jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
                jsonStr = jsonStr.replace(/[\n\r]/g, ' ');
                jsonStr = jsonStr.replace(/(?<!\\)"\s*:\s*"([^"]*?)(?<!\\)"\s*([^,}\]])/g, '": "$1", $2');

                try {
                  result = JSON.parse(jsonStr);
                } catch (secondError) {
                  result = {
                    parse_failed: true,
                    raw_response: jsonMatch[0].substring(0, 500),
                  };
                }
              }

              if (result) {
                result.name = this.character_name || null;
                result.reference_image_url = this.character_image_url;
              }
              return result;
            }
          }
          return null;
        } catch (characterError) {
          $.export("character_analysis_error", characterError.message);
          if (this.character_name) {
            return {
              name: this.character_name,
              reference_image_url: this.character_image_url,
              analysis_failed: true,
            };
          }
          return null;
        }
      })();
      parallelTasks.push(characterAnalysisPromise);
    }

    // 모든 병렬 작업 실행 및 결과 수집
    let sampleAnalysis = null;
    let characterAnalysis = null;

    if (parallelTasks.length > 0) {
      const results = await Promise.all(parallelTasks);

      // 결과 할당 (순서 보장)
      let resultIndex = 0;
      if (sampleAnalysisPromise) {
        sampleAnalysis = results[resultIndex++];
        if (sampleAnalysis) {
          $.export("sample_analysis", `분석 완료: "${sampleAnalysis.title}" (조회수: ${sampleAnalysis.view_count})`);
        }
      }
      if (characterAnalysisPromise) {
        characterAnalysis = results[resultIndex++];
        if (characterAnalysis) {
          $.export("character_analysis", `캐릭터 분석 완료: ${characterAnalysis?.character_type || 'Unknown'} - ${characterAnalysis?.species_breed || ''}`);
        }
      }
    }

    // 캐릭터 이미지 없이 이름만 입력된 경우
    if (!characterAnalysis && this.character_name) {
      characterAnalysis = {
        name: this.character_name,
        character_type: "to_be_generated",
        note: "AI will generate character appearance based on topic and style",
      };
      $.export("character_info", `캐릭터 이름 설정: ${this.character_name}`);
    }

    // 예상 글자수 계산 (최소 기준 - AI가 더 길게 쓸 수 있음)
    const estimatedChars = this.duration_seconds * lang.chars_per_second;
    const sceneCount = Math.ceil(this.duration_seconds / 5); // 5초당 1장면

    // 앵글 가이드 가져오기
    const angle = angleGuides[this.content_angle] || angleGuides.shocking_facts;
    const topicForPrompt = effectiveTopic || effectiveKeywords || "반려동물";

    // 샘플 분석 섹션 생성
    const sampleAnalysisSection = sampleAnalysis ? `
## 📺 SAMPLE VIDEO ANALYSIS (CRITICAL - MATCH THIS QUALITY):
You must create content that matches or exceeds this viral video's quality.

### Reference Video:
- Title: "${sampleAnalysis.title}"
- Channel: ${sampleAnalysis.channel_title}
- Views: ${sampleAnalysis.view_count} | Likes: ${sampleAnalysis.like_count}
- Tags: ${sampleAnalysis.tags?.slice(0, 10).join(', ') || 'N/A'}
- Description: ${sampleAnalysis.description?.substring(0, 500) || 'N/A'}

### Channel's Top Performing Videos:
${sampleAnalysis.channel_top_videos?.map((v, i) => `${i + 1}. "${v.title}"`).join('\n') || 'N/A'}

### WHAT MADE THIS VIDEO VIRAL (analyze and replicate):
- Study the hook pattern from the title
- Match the emotional tone and pacing
- Use similar visual storytelling techniques
- Apply the same engagement triggers
` : '';

    // 등장인물 섹션 생성
    const characterSection = characterAnalysis ? `
## 🎭 MAIN CHARACTER (MUST USE IN ALL SCENES):
${characterAnalysis.name ? `**Character Name: "${characterAnalysis.name}"** - Use this name in the script when referring to the character.` : 'AI will generate an appropriate name for the character.'}

${characterAnalysis.image_generation_prompt ? `### Character Description (for consistent image generation):
${characterAnalysis.image_generation_prompt}` : ''}

${characterAnalysis.appearance ? `### Character Appearance:
- Type: ${characterAnalysis.character_type || 'N/A'}
- Breed/Species: ${characterAnalysis.species_breed || 'N/A'}
- Size: ${characterAnalysis.appearance.size || 'N/A'}
- Color: ${characterAnalysis.appearance.fur_hair_color || 'N/A'}
- Texture: ${characterAnalysis.appearance.fur_hair_texture || 'N/A'}
- Face: ${characterAnalysis.appearance.face_description || 'N/A'}
- Eye Color: ${characterAnalysis.appearance.eye_color || 'N/A'}
- Distinctive Features: ${characterAnalysis.appearance.distinctive_features?.join(', ') || 'N/A'}` : ''}

${characterAnalysis.style_keywords ? `### Style Keywords for Generation:
${characterAnalysis.style_keywords.join(', ')}` : ''}

${characterAnalysis.personality_impression ? `### Character Personality:
${characterAnalysis.personality_impression}` : ''}

### ⚠️ IMPORTANT CHARACTER RULES:
1. This character MUST appear in EVERY scene description
2. Keep the character's appearance CONSISTENT across all scenes
3. ${characterAnalysis.name ? `Use the name "${characterAnalysis.name}" in narration when appropriate` : 'Generate a fitting name for this character and use it in the script'}
4. Reference the character's distinctive features in scene descriptions
5. Adapt poses and expressions to match each scene's emotion while maintaining character identity
` : `
## 🎭 CHARACTER (AI GENERATED):
No reference character provided. Please create an appropriate main character that fits the topic and content style.
- Generate a memorable character with distinctive features
- Create a fitting name for the character
- Keep the character consistent across all scenes
- The character should be visually appealing for the target audience
`;

    const prompt = `You are an expert viral content creator specializing in YouTube Shorts that get millions of views.

## 🎯 TOPIC: "${topicForPrompt}"
${sampleAnalysisSection}
${characterSection}
## 📐 CONTENT ANGLE (CRITICAL - FOLLOW THIS EXACTLY):
- Type: ${this.content_angle}
- Hook Template: "${angle.hook_template.replace('{topic}', topicForPrompt)}"
- Structure: ${angle.structure}
- Requirements: ${angle.requirements}

### ✅ GOOD HOOK EXAMPLES (Study these patterns):
${angle.examples.map(ex => `- "${ex}"`).join('\n')}

### ❌ PHRASES TO AVOID (NEVER use these):
${angle.avoid.map(av => `- "${av}"`).join('\n')}

## 📊 CONTENT SETTINGS:
- Content Style: ${this.content_style} (${style.tone})
- Target Emotion: ${emotion}
- Voice Style: ${voice}
- Duration: ${this.duration_seconds} seconds
- Language: ${lang.name}
- Estimated characters: ~${estimatedChars} characters
- Number of scenes: ${sceneCount}
${effectiveKeywords ? `- Additional Keywords: ${effectiveKeywords}` : ''}
${storyContext?.story_summary ? `
## 📖 STORY CONTEXT (from Topic Generator):
- **Story Summary**: ${storyContext.story_summary}
- **Suggested Hook**: ${storyContext.hook || 'Create your own hook'}
- **Character Dynamics**: ${storyContext.character_dynamics || 'Develop naturally'}
- **Emotional Journey**: ${storyContext.emotional_journey || 'Build emotional arc'}
` : ''}
${(storyContext?.story_summary && characterAnalysis) ? `
## 🔄 CONFLICT RESOLUTION (CRITICAL - READ CAREFULLY):
There may be a conflict between the Topic/Story and the Character Image provided.

**Topic/Keywords suggest**: "${topicForPrompt}" / "${effectiveKeywords || ''}"
**Character Image shows**: "${characterAnalysis.character_type || 'unknown'}" - "${characterAnalysis.species_breed || characterAnalysis.appearance?.fur_hair_color || 'N/A'}"

### ⚠️ IF THERE IS A MISMATCH (e.g., topic says "cat" but image is a "dog"):
1. **ADAPT the story** to fit the ACTUAL CHARACTER from the image
2. **KEEP the story structure and emotional journey** from the topic
3. **REPLACE the mismatched animal/character** with the one from the image
4. **PRESERVE the core concept** (e.g., "vs 로봇청소기", "냥펀치" → "멍펀치")

### Example Adaptation:
- Topic: "고양이 vs 로봇청소기" + Image: Shiba Inu dog
- Result: "시바견 vs 로봇청소기" - same story structure, different protagonist
- "냥펀치" → "멍발차기" or similar dog-appropriate action

### PRIORITY ORDER:
1. **Character from Image** (visual consistency is most important for video)
2. **Story Structure from Topic** (keep the narrative arc)
3. **Adapt keywords** to match the actual character
` : ''}

## 🔥 VIRAL CONTENT RULES (MANDATORY):

### 1. HOOK (First 3 seconds) - MAKE OR BREAK
- Must create IMMEDIATE curiosity or shock
- Use the hook template pattern above
- NO generic openings like "오늘은 ~에 대해..."
- Start with the most surprising fact or statement

### 2. SPECIFICITY IS KING
- ❌ BAD: "강아지는 후각이 좋습니다" (boring, everyone knows)
- ✅ GOOD: "강아지 코에는 3억개의 후각 수용체가 있는데, 이건 인간의 50배입니다"
- ❌ BAD: "산책이 중요합니다" (generic)
- ✅ GOOD: "옥스포드 대학 연구팀이 8년간 추적한 결과, 하루 23분 산책하는 강아지의 수명이 평균 2.7년 길었습니다"

### 3. EMOTIONAL TRIGGERS
- Surprise: "이건 아무도 몰랐는데..."
- Urgency: "지금 당장 확인해보세요"
- Fear: "이걸 모르면 위험할 수 있습니다"
- Curiosity: "진짜 이유는 따로 있었습니다"

### 4. UNIQUE ANGLE REQUIREMENT
- Find information that 99% of similar videos DON'T cover
- Include at least ONE surprising statistic or research finding
- Avoid rehashing the same generic tips everyone shares

## Japanese Market Keywords Reference:
${style.keywords_jp.join(", ")}

## Requirements:
1. ${lang.instruction}
2. Write a script that is AT LEAST ${estimatedChars} characters long (MANDATORY)
3. Follow the structure: ${style.structure}
4. Evoke the emotion: ${emotion}
5. Voice style should be: ${voice}
6. Include natural pauses marked with "..." for emotional effect
7. The script should hook viewers in the first 2 seconds
8. Each segment must have substantial narration (not just a few words)
9. Content must be UNIQUE and SURPRISING - avoid generic information

${this.include_scenes ? `
## Scene Descriptions:
For each scene (approximately every 5 seconds), provide:
- Detailed visual description for AI image generation
- Include anime/illustration style specifications
- Describe character expressions, poses, background, lighting, mood
` : ""}

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title for YouTube",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds - attention grabber",
  "full_script": "Complete narration script in ${lang.name}",
  "character": {
    "name": "${characterAnalysis?.name || 'Generate a fitting name'}",
    "description": "Brief character description for consistency",
    "appearance_prompt": "Detailed prompt to generate this character consistently in every scene (include species, color, size, distinctive features)"
  },
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment",
      "emotion_note": "How to deliver this part",
      "scene_type": "narration or action - 'narration' if character is speaking/talking to camera, 'action' if character is doing something without speaking directly",
      ${this.include_scenes ? '"scene_description": "Detailed visual description for image generation - MUST include the main character with consistent appearance, anime style, background, mood, lighting",' : ""}
      "visual_keywords": ["keyword1", "keyword2"]
    }
  ],
  "hashtags": {
    "japanese": ["#shorts", "#日本語ハッシュタグ"],
    "korean": ["#shorts", "#쇼츠", "#한국어해시태그"],
    "english": ["#shorts", "#EnglishHashtags"]
  },
  "thumbnail_prompt": "Detailed image generation prompt for thumbnail - MUST include the main character, eye-catching, vertical 9:16 format, dramatic lighting, text-free composition",
  "music_suggestion": "Background music style recommendation",
  "total_duration": ${this.duration_seconds},
  "character_count": "actual character count",
  "target_audience": "Target audience description",
  "viral_elements": ["Element 1", "Element 2"],
  "adaptation_notes": {
    "had_conflict": true/false,
    "original_topic": "Original topic if adapted",
    "adapted_to": "What it was adapted to (if applicable)",
    "changes_made": ["List of adaptations made to resolve conflicts"]
  }
}

Create an emotionally engaging script that will resonate with Japanese YouTube Shorts viewers. Make it memorable and shareable.

Return ONLY valid JSON, no markdown formatting.`;

    // Gemini API 호출
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.gemini_model}:generateContent`;

    const systemPrompt = `You are an expert viral content scriptwriter specializing in Japanese YouTube Shorts. You understand Japanese culture, emotions, and what makes content go viral in Japan. You write scripts that are emotionally resonant, culturally appropriate, and optimized for short-form video. Always respond with valid JSON only.`;

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
            parts: [
              {
                text: `${systemPrompt}\n\n${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      },
    });

    let script;
    try {
      let responseContent = aiResponse.candidates[0].content.parts[0].text.trim();

      // Remove markdown code blocks if present
      if (responseContent.startsWith("```json")) {
        responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (responseContent.startsWith("```")) {
        responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseContent = jsonMatch[0];
      }

      script = JSON.parse(responseContent);
    } catch (error) {
      $.export("$summary", `Error parsing response: ${error.message}`);
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }

    // =====================
    // 실제 스크립트 길이 기반 영상 길이 재계산
    // =====================
    const actualScriptLength = script.full_script?.length || 0;
    const actualDurationSeconds = Math.ceil(actualScriptLength / lang.chars_per_second);

    // 스크립트 길이에 맞게 segment 타이밍 재조정
    if (script.script_segments && script.script_segments.length > 0) {
      const totalNarrationLength = script.script_segments.reduce((sum, seg) => {
        return sum + (seg.narration?.length || 0);
      }, 0);

      // 1차: 각 segment의 비율 기반 duration 계산
      const segmentDurations = script.script_segments.map(seg => {
        const segmentLength = seg.narration?.length || 0;
        const rawDuration = totalNarrationLength > 0
          ? (segmentLength / totalNarrationLength) * actualDurationSeconds
          : actualDurationSeconds / script.script_segments.length;
        return Math.max(rawDuration, 2); // 최소 2초
      });

      // 2차: 실제 총 duration 계산 (segment 합계)
      const actualTotalDuration = Math.ceil(segmentDurations.reduce((sum, d) => sum + d, 0));

      // 3차: segment에 시간 할당
      let currentTime = 0;
      script.script_segments = script.script_segments.map((seg, idx) => {
        const segmentDuration = Math.ceil(segmentDurations[idx]);
        const startTime = currentTime;
        const endTime = currentTime + segmentDuration;
        currentTime = endTime;

        return {
          ...seg,
          segment_number: idx + 1,
          start_time: startTime,
          end_time: endTime,
          duration: segmentDuration,
        };
      });

      // ★ total_duration = 모든 segment duration의 합 (정확히 일치)
      script.total_duration = currentTime;
    } else {
      script.total_duration = actualDurationSeconds;
    }

    // segment 합계 검증
    const segmentDurationSum = script.script_segments?.reduce((sum, seg) => sum + (seg.duration || 0), 0) || 0;

    $.export("script_length_info", {
      input_duration: this.duration_seconds,
      actual_script_chars: actualScriptLength,
      calculated_duration: actualDurationSeconds,
      segment_duration_sum: segmentDurationSum,
      final_duration: script.total_duration,
      duration_match: segmentDurationSum === script.total_duration,
      segment_count: script.script_segments?.length || 0,
    });

    // folder_name 생성 (모든 Step에서 공유)
    const { v4: uuidv4 } = await import("uuid");
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const shortUuid = uuidv4().split('-')[0];
    const safeTitle = (script.title?.english || script.title?.japanese || effectiveTopic || 'shorts')
      .replace(/[^a-zA-Z0-9_\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;

    // 결과 정리 및 추가 정보 포함
    const result = {
      // 폴더명 (모든 Step에서 사용)
      folder_name: folderName,

      // BGM 생성용 mood (target_emotion 기반)
      mood: this.target_emotion,

      // TTS/Whisper용 언어
      language: this.language,

      // 전체 스크립트 텍스트 (TTS용)
      script_text: script.full_script,

      // ★ 스크립트 길이 기반 영상/음성 길이 정보 (핵심!)
      duration_info: {
        input_duration: this.duration_seconds,           // 입력된 목표 길이
        script_char_count: actualScriptLength,           // 실제 스크립트 글자수
        chars_per_second: lang.chars_per_second,         // 언어별 초당 글자수
        calculated_duration: actualDurationSeconds,       // 스크립트 기반 계산된 길이
        final_duration: script.total_duration,           // 최종 영상 길이 (이 값 사용!)
        segment_count: script.script_segments?.length || 0,
      },
      // 영상/BGM/TTS 길이에 사용할 최종 duration (초)
      total_duration_seconds: script.total_duration,

      // YouTube Upload용 (최상위 레벨로 복사)
      title: script.title,
      hashtags: script.hashtags,

      // 샘플 영상 분석 결과 (있는 경우)
      sample_analysis: sampleAnalysis,

      // 이미지 생성용 스타일 가이드 (샘플 영상 기반 + 캐릭터 정보)
      image_style_guide: {
        // 샘플 영상에서 분석된 이미지 스타일 (있는 경우)
        ...(sampleAnalysis?.image_style || {}),
        // 샘플 영상 참조 정보
        reference_video: sampleAnalysis ? {
          title: sampleAnalysis.title,
          channel: sampleAnalysis.channel_title,
          thumbnail_url: sampleAnalysis.thumbnail_url,
        } : null,
        // ★ 등장인물 정보 (핵심! - 이미지 생성 시 반드시 참조)
        character: {
          // 입력된 캐릭터 분석 정보
          ...(characterAnalysis || {}),
          // AI가 생성한 캐릭터 정보 (스크립트에서)
          generated: script.character || null,
          // 통합 프롬프트 (이미지 생성 시 사용)
          prompt: characterAnalysis?.image_generation_prompt || script.character?.appearance_prompt || null,
          // 캐릭터 이름
          name: characterAnalysis?.name || script.character?.name || null,
        },
      },

      // 등장인물 분석 결과 (별도 필드로도 제공)
      character_info: characterAnalysis,

      // 입력 파라미터
      input: {
        topic: effectiveTopic,
        keywords: effectiveKeywords,
        content_angle: this.content_angle,
        content_style: this.content_style,
        target_emotion: this.target_emotion,
        duration: this.duration_seconds,
        language: this.language,
        voice_style: this.voice_style,
        character_image_url: this.character_image_url || null,
        character_name: this.character_name || null,
        // Topic Generator 사용 여부
        from_topic_generator: !!topicGenOutput,
      },

      // Topic Generator 정보 (사용한 경우)
      topic_generator_info: topicGenOutput ? {
        story_summary: storyContext?.story_summary,
        hook: storyContext?.hook,
        character_dynamics: storyContext?.character_dynamics,
        emotional_journey: storyContext?.emotional_journey,
      } : null,

      // 생성된 스크립트
      script: script,

      // 파이프라인 연동용 데이터
      pipeline_data: {
        // ★ 총 영상 길이 (모든 컴포넌트에서 이 값 사용)
        total_duration_seconds: script.total_duration,

        // scene-image-generator 연동용
        image_generation: {
          // style_guide는 최상위 image_style_guide 사용 (중복 제거)
          // ★ 캐릭터 프롬프트 (모든 장면에 일관되게 적용)
          character_prompt: characterAnalysis?.image_generation_prompt || script.character?.appearance_prompt || null,
          character_name: characterAnalysis?.name || script.character?.name || null,
          scenes: script.script_segments?.map((seg, idx) => ({
            index: idx + 1,
            start: seg.start_time,
            end: seg.end_time,
            duration: seg.end_time - seg.start_time,
            prompt: seg.scene_description || `Scene ${idx + 1}: ${seg.visual_keywords?.join(", ")}`,
            image_prompt: seg.scene_description || seg.visual_keywords?.join(", "),
            // ★ 씬 타입: narration(Hedra 립싱크) / action(Veo 모션)
            scene_type: seg.scene_type || "narration",
            // 나레이션 텍스트 (Hedra TTS용)
            narration: seg.narration,
          })) || [],
        },

        // elevenlabs-tts 연동용
        tts: {
          text: script.full_script,
          language: this.language,
          voice_style: this.voice_style,
        },

        // BGM Generator 연동용
        bgm: {
          mood: this.target_emotion,
          content_style: this.content_style,
          music_suggestion: script.music_suggestion,
        },

        // 메타데이터
        metadata: {
          title: script.title,
          hashtags: script.hashtags,
          // 썸네일용 이미지 프롬프트 (첫 번째 장면 기반)
          thumbnail: script.thumbnail_prompt || script.script_segments?.[0]?.scene_description || script.thumbnail_idea,
          music: script.music_suggestion,
        },

        // Creatomate/Video Render 연동용
        video: {
          segment_count: script.script_segments?.length || 0,
          segments: script.script_segments?.map((seg, idx) => ({
            index: idx + 1,
            start: seg.start_time,
            end: seg.end_time,
            duration: seg.end_time - seg.start_time,
            narration: seg.narration,
          })) || [],
        },
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    $.export("$summary",
      `스크립트 생성: "${script.title?.korean || script.title?.japanese}" [${this.content_angle}] - ${script.script_segments?.length || 0}장면, ${actualScriptLength}자, ${script.total_duration}초`
    );

    return result;
  },
});
