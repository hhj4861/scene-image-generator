import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Shorts Script Generator",
  description: "Generate viral, engaging scripts with unique angles and surprising facts (Gemini-powered)",
  type: "action",
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
    // 샘플 쇼츠 링크 분석
    sample_shorts_url: {
      type: "string",
      label: "Sample Shorts URL (Optional)",
      description: "참고할 쇼츠 링크 (예: https://youtube.com/shorts/xxxx) - 유사한 스타일로 대본 생성",
      optional: true,
    },
    youtube_data_api: {
      type: "app",
      app: "youtube_data_api",
      description: "샘플 쇼츠 분석용 (sample_shorts_url 사용시 필요)",
      optional: true,
    },
    // 주제 입력 (키워드보다 구체적)
    topic: {
      type: "string",
      label: "Topic",
      description: "구체적인 주제 (예: '시바견', '고양이 수면 패턴', '골든리트리버 성격')",
    },
    keywords: {
      type: "string",
      label: "Additional Keywords (Optional)",
      description: "추가 키워드 (콤마로 구분)",
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
    // 중복 방지 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
      description: "히스토리 저장용 GCS 연결 (중복 방지 기능 사용시 필요)",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      description: "히스토리 저장용 버킷 (중복 방지)",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    prevent_duplicate: {
      type: "boolean",
      label: "Prevent Duplicate Scripts",
      description: "이전에 사용한 대본/키워드 중복 방지 (false로 설정하면 GCS 연결 없이도 동작)",
      default: true,
    },
  },
  async run({ $ }) {
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
    // 샘플 쇼츠 분석 (옵션)
    // =====================
    let sampleAnalysis = null;
    if (this.sample_shorts_url && this.youtube_data_api) {
      try {
        // YouTube Shorts URL에서 video ID 추출
        let videoId = null;
        const shortsMatch = this.sample_shorts_url.match(/shorts\/([a-zA-Z0-9_-]+)/);
        const watchMatch = this.sample_shorts_url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        const shortUrlMatch = this.sample_shorts_url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);

        if (shortsMatch) videoId = shortsMatch[1];
        else if (watchMatch) videoId = watchMatch[1];
        else if (shortUrlMatch) videoId = shortUrlMatch[1];

        if (videoId) {
          // YouTube Data API로 영상 정보 가져오기
          const videoResponse = await axios($, {
            url: "https://www.googleapis.com/youtube/v3/videos",
            headers: {
              Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
            },
            params: {
              part: "snippet,statistics,contentDetails",
              id: videoId,
            },
          });

          if (videoResponse.items && videoResponse.items.length > 0) {
            const video = videoResponse.items[0];

            // 채널의 다른 인기 영상도 가져오기
            const channelVideosResponse = await axios($, {
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
            });

            sampleAnalysis = {
              video_id: videoId,
              title: video.snippet.title,
              description: video.snippet.description,
              tags: video.snippet.tags || [],
              channel_title: video.snippet.channelTitle,
              view_count: video.statistics?.viewCount,
              like_count: video.statistics?.likeCount,
              comment_count: video.statistics?.commentCount,
              duration: video.contentDetails?.duration,
              channel_top_videos: channelVideosResponse.items?.map(v => ({
                title: v.snippet.title,
                description: v.snippet.description?.substring(0, 200),
              })) || [],
            };

            $.export("sample_analysis", `분석 완료: "${video.snippet.title}" (조회수: ${video.statistics?.viewCount})`);
          }
        }
      } catch (e) {
        $.export("sample_analysis_error", e.message);
      }
    }

    // =====================
    // 중복 체크 로직
    // =====================
    const HISTORY_FILE = "_script_history.json";
    let scriptHistory = { scripts: [], keywords_used: [] };
    let isDuplicate = false;

    if (this.prevent_duplicate && this.google_cloud) {
      try {
        const { google } = await import("googleapis");
        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(this.google_cloud.$auth.key_json),
          scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
        });
        const storage = google.storage({ version: 'v1', auth });

        // 히스토리 파일 로드 시도
        try {
          const response = await storage.objects.get({
            bucket: this.gcs_bucket_name,
            object: HISTORY_FILE,
            alt: 'media',
          });
          scriptHistory = response.data;
          $.export("history_loaded", `Loaded ${scriptHistory.scripts?.length || 0} previous scripts`);
        } catch (e) {
          // 히스토리 파일이 없으면 새로 생성
          $.export("history_status", "No history file found, will create new one");
        }

        // 키워드 중복 체크 (topic + keywords + angle 조합)
        const topicKey = (this.topic || '').toLowerCase().trim();
        const currentKeywords = (this.keywords || '').toLowerCase().split(',').map(k => k.trim()).sort().join(',');
        const keywordKey = `${topicKey}|${currentKeywords}|${this.content_angle}|${this.content_style}|${this.language}`;

        // 같은 조합이 몇 번 사용되었는지 카운트
        const usageCount = scriptHistory.keywords_used?.filter(k => k === keywordKey).length || 0;
        if (usageCount > 0) {
          isDuplicate = true;
          $.export("duplicate_info", `ℹ️ Topic "${this.topic}" + Angle "${this.content_angle}" used ${usageCount} time(s) before. Generating variation #${usageCount + 1}`);
        }
      } catch (e) {
        $.export("history_error", e.message);
      }
    }

    // 예상 글자수 계산
    const estimatedChars = this.duration_seconds * lang.chars_per_second;
    const sceneCount = Math.ceil(this.duration_seconds / 5); // 5초당 1장면

    // 앵글 가이드 가져오기
    const angle = angleGuides[this.content_angle] || angleGuides.shocking_facts;
    const topicForPrompt = this.topic || this.keywords || "반려동물";

    // 중복인 경우 이전 대본들의 제목을 가져와서 AI에게 전달
    let previousScripts = [];
    if (isDuplicate && scriptHistory.scripts) {
      const currentKeywords = (this.keywords || '').toLowerCase().split(',').map(k => k.trim()).sort().join(',');
      previousScripts = scriptHistory.scripts
        .filter(s => {
          const sKeywords = (s.keywords || '').toLowerCase().split(',').map(k => k.trim()).sort().join(',');
          return sKeywords === currentKeywords && s.content_style === this.content_style;
        })
        .map(s => s.title?.japanese || s.title?.korean || 'Unknown');
    }

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

    const prompt = `You are an expert viral content creator specializing in YouTube Shorts that get millions of views.

## 🎯 TOPIC: "${topicForPrompt}"
${sampleAnalysisSection}
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
${this.keywords ? `- Additional Keywords: ${this.keywords}` : ''}
${isDuplicate ? `
## ⚠️ DUPLICATE WARNING - CREATE COMPLETELY DIFFERENT VERSION:
Previous scripts with similar topic: ${previousScripts.join(', ')}
You MUST create entirely different content - different facts, different angle, different story.
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
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment",
      "emotion_note": "How to deliver this part",
      ${this.include_scenes ? '"scene_description": "Detailed visual description for image generation - anime style, character details, background, mood, lighting",' : ""}
      "visual_keywords": ["keyword1", "keyword2"]
    }
  ],
  "hashtags": {
    "japanese": ["#shorts", "#日本語ハッシュタグ"],
    "english": ["#shorts", "#EnglishHashtags"]
  },
  "thumbnail_idea": "Thumbnail concept description",
  "music_suggestion": "Background music style recommendation",
  "total_duration": ${this.duration_seconds},
  "character_count": "actual character count",
  "target_audience": "Target audience description",
  "viral_elements": ["Element 1", "Element 2"]
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

    // folder_name 생성 (모든 Step에서 공유)
    const { v4: uuidv4 } = await import("uuid");
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const shortUuid = uuidv4().split('-')[0];
    const safeTitle = (script.title?.english || script.title?.japanese || this.topic || 'shorts')
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

      // YouTube Upload용 (최상위 레벨로 복사)
      title: script.title,
      hashtags: script.hashtags,

      // 입력 파라미터
      input: {
        topic: this.topic,
        keywords: this.keywords,
        content_angle: this.content_angle,
        content_style: this.content_style,
        target_emotion: this.target_emotion,
        duration: this.duration_seconds,
        language: this.language,
        voice_style: this.voice_style,
      },

      // 생성된 스크립트
      script: script,

      // 파이프라인 연동용 데이터
      pipeline_data: {
        // scene-image-generator 연동용
        image_generation: {
          scenes: script.script_segments?.map((seg, idx) => ({
            index: idx + 1,
            start: seg.start_time,
            end: seg.end_time,
            prompt: seg.scene_description || `Scene ${idx + 1}: ${seg.visual_keywords?.join(", ")}`,
            image_prompt: seg.scene_description || seg.visual_keywords?.join(", "),
            style: "ultra realistic photography, high quality, detailed",
          })) || [],
        },

        // elevenlabs-tts 연동용
        tts: {
          text: script.full_script,
          language: this.language,
          voice_style: this.voice_style,
        },

        // 메타데이터
        metadata: {
          title: script.title,
          hashtags: script.hashtags,
          thumbnail: script.thumbnail_idea,
          music: script.music_suggestion,
        },
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    $.export("$summary",
      `스크립트 생성: "${script.title?.korean || script.title?.japanese}" [${this.content_angle}] - ${script.script_segments?.length || 0}장면`
    );

    // =====================
    // 히스토리 저장
    // =====================
    if (this.prevent_duplicate && this.google_cloud) {
      try {
        const { google } = await import("googleapis");
        const { Readable } = await import("stream");

        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(this.google_cloud.$auth.key_json),
          scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
        });
        const storage = google.storage({ version: 'v1', auth });

        // 현재 키워드 키 생성 (topic + keywords + angle 조합)
        const topicKey = (this.topic || '').toLowerCase().trim();
        const currentKeywords = (this.keywords || '').toLowerCase().split(',').map(k => k.trim()).sort().join(',');
        const keywordKey = `${topicKey}|${currentKeywords}|${this.content_angle}|${this.content_style}|${this.language}`;

        // 히스토리 업데이트
        if (!scriptHistory.scripts) scriptHistory.scripts = [];
        if (!scriptHistory.keywords_used) scriptHistory.keywords_used = [];

        scriptHistory.scripts.push({
          topic: this.topic,
          keywords: this.keywords,
          content_angle: this.content_angle,
          content_style: this.content_style,
          language: this.language,
          title: script.title,
          hook: script.hook,
          generated_at: new Date().toISOString(),
        });
        scriptHistory.keywords_used.push(keywordKey);
        scriptHistory.last_updated = new Date().toISOString();
        scriptHistory.total_count = scriptHistory.scripts.length;

        // GCS에 저장
        const historyStream = new Readable();
        historyStream.push(JSON.stringify(scriptHistory, null, 2));
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

        $.export("history_saved", `Saved to history. Total scripts: ${scriptHistory.total_count}`);
      } catch (e) {
        $.export("history_save_error", e.message);
      }
    }

    return result;
  },
});
