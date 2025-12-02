import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Topic Generator",
  description: "귀여운 강아지 중심의 바이럴 토픽과 키워드를 생성합니다. 시사/이슈를 강아지 버전으로 풍자하거나, AI가 자동으로 트렌디한 토픽을 생성합니다.",

  props: {
    // =====================
    // 콘텐츠 타입 선택 (NEW!)
    // =====================
    content_type: {
      type: "string",
      label: "🎭 콘텐츠 타입",
      description: "영상의 전체적인 톤과 스타일을 선택하세요",
      options: [
        { label: "🎭 풍자 (Satire) - 시사/이슈를 강아지 버전으로 풍자", value: "satire" },
        { label: "😂 코믹 (Comic) - 웃긴 상황, 반전, 개그", value: "comic" },
        { label: "🥺 감동 (Emotional) - 따뜻하고 감동적인 이야기", value: "emotional" },
        { label: "😊 일상 (Daily) - 귀여운 일상 브이로그 스타일", value: "daily" },
        { label: "🍽️ 먹방 (Mukbang) - 간식/음식 관련 콘텐츠", value: "mukbang" },
        { label: "💕 힐링 (Healing) - 편안하고 치유되는 콘텐츠", value: "healing" },
        { label: "🎬 드라마 (Drama) - 스토리가 있는 미니 드라마", value: "drama" },
        { label: "🎤 퍼포먼스 (Performance) - 비트박스, 노래, 댄스, 랩", value: "performance" },
        { label: "🎲 랜덤 (Random) - AI가 자동 선택", value: "random" },
      ],
      default: "satire",
    },
    // =====================
    // 사용자 입력 (선택) - 풍자/패러디용
    // =====================
    user_topic_input: {
      type: "string",
      label: "🎯 주제 입력 (Optional)",
      description: "다루고 싶은 주제를 입력하세요. 풍자 모드: '쿠팡 개인정보 유출', 감동 모드: '유기견 입양 이야기', 코믹 모드: '강아지 vs 로봇청소기'. 비워두면 AI가 자동으로 토픽을 생성합니다.",
      optional: true,
    },
    user_keyword_hint: {
      type: "string",
      label: "🔑 키워드 힌트 (Optional)",
      description: "콘텐츠에 포함하고 싶은 키워드나 힌트를 입력하세요. 예: '차우차우, 사료, 분노' 또는 '할머니, 재회, 눈물'",
      optional: true,
    },
    // =====================
    // 퍼포먼스 타입 선택 (콘텐츠 타입이 performance일 때)
    // =====================
    performance_type: {
      type: "string",
      label: "🎵 퍼포먼스 타입",
      description: "퍼포먼스 콘텐츠일 때 타입을 선택하세요. 선택한 타입에 맞는 악세서리(선글라스, 금목걸이 등)와 무대가 적용됩니다.",
      options: [
        { label: "🎤 비트박스 (Beatbox) - 입으로 비트 만들기", value: "beatbox" },
        { label: "🎵 노래 (Singing) - 귀여운 보컬 퍼포먼스", value: "singing" },
        { label: "💃 댄스 (Dance) - 댄스 챌린지, 춤", value: "dance" },
        { label: "🎙️ 랩 (Rap) - 강아지 랩, 디스전", value: "rap" },
        { label: "🎸 힙합 (Hiphop) - 힙합 스타일 퍼포먼스", value: "hiphop" },
        { label: "🎹 악기 연주 (Instrument) - 피아노, 드럼 등", value: "instrument" },
        { label: "🎶 케이팝 (K-pop) - 아이돌 스타일", value: "kpop" },
      ],
      default: "beatbox",
      optional: true,
    },
    // =====================
    // 배경 설정
    // =====================
    background_setting: {
      type: "string",
      label: "🏠 배경 설정 (Optional)",
      description: "영상의 배경을 직접 지정하세요. 예: '화려한 콘서트 무대', '아늑한 거실', '벚꽃이 흩날리는 공원', '뉴스 스튜디오'. 비워두면 AI가 주제에 맞게 자동 생성합니다.",
      optional: true,
    },
    background_style: {
      type: "string",
      label: "🎨 배경 스타일 (Optional)",
      description: "배경의 전체적인 분위기/스타일을 선택하세요",
      options: [
        { label: "🏠 실내 (Indoor) - 거실, 방, 스튜디오 등", value: "indoor" },
        { label: "🌳 실외 (Outdoor) - 공원, 거리, 자연 등", value: "outdoor" },
        { label: "🎭 무대 (Stage) - 콘서트, 공연장, 스포트라이트", value: "stage" },
        { label: "📺 스튜디오 (Studio) - 뉴스룸, 인터뷰 세트", value: "studio" },
        { label: "🌈 판타지 (Fantasy) - 마법, 꿈, 상상의 공간", value: "fantasy" },
        { label: "🤖 AI 자동 선택", value: "auto" },
      ],
      default: "auto",
      optional: true,
    },
    background_mood: {
      type: "string",
      label: "💡 배경 분위기 (Optional)",
      description: "배경의 조명/분위기를 선택하세요",
      options: [
        { label: "☀️ 밝고 화사한 (Bright)", value: "bright" },
        { label: "🌅 따뜻한 (Warm)", value: "warm" },
        { label: "🌙 어둡고 무디한 (Dark/Moody)", value: "dark" },
        { label: "🎪 화려한/네온 (Colorful/Neon)", value: "colorful" },
        { label: "🍃 자연스러운 (Natural)", value: "natural" },
        { label: "🎬 시네마틱 (Cinematic)", value: "cinematic" },
        { label: "🤖 AI 자동 선택", value: "auto" },
      ],
      default: "auto",
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
    // 2. 콘텐츠 타입 및 사용자 입력 처리
    // =====================
    const contentType = this.content_type || "satire";
    const hasUserInput = !!(this.user_topic_input || this.user_keyword_hint);

    // 콘텐츠 타입별 설정
    const contentTypeConfig = {
      satire: {
        name: "풍자",
        emoji: "🎭",
        description: "시사/이슈를 강아지 세계로 풍자",
        tone: "satirical, clever, witty",
        mood: "playful but sharp",
        recommended_script_format: "interview",
        themes: ["시사 풍자", "사회 비평", "트렌드 패러디", "뉴스 패러디"],
        emotion_range: ["분노", "억울", "당당", "비꼬는"],
        example_topics: ["개인정보 유출 → 사료 정보 유출", "자율주행 사고 → 로봇청소기 충돌"],
      },
      comic: {
        name: "코믹",
        emoji: "😂",
        description: "웃긴 상황과 반전으로 가득한 개그",
        tone: "funny, absurd, unexpected",
        mood: "hilarious and light-hearted",
        recommended_script_format: "mixed",
        themes: ["반전 개그", "상황 코미디", "몰래카메라", "실패 모음", "리액션"],
        emotion_range: ["신남", "당황", "멘붕", "웃음"],
        example_topics: ["로봇청소기와의 전쟁", "목욕 탈출 대작전", "간식 도둑 추격전"],
      },
      emotional: {
        name: "감동",
        emoji: "🥺",
        description: "따뜻하고 감동적인 스토리",
        tone: "heartwarming, touching, emotional",
        mood: "warm and moving",
        recommended_script_format: "monologue",
        themes: ["가족 사랑", "재회", "우정", "성장", "극복", "감사"],
        emotion_range: ["그리움", "기쁨", "눈물", "감사", "사랑"],
        example_topics: ["오랜만에 만난 주인", "유기견에서 가족으로", "할머니와의 추억"],
      },
      daily: {
        name: "일상",
        emoji: "😊",
        description: "귀여운 일상 브이로그",
        tone: "casual, relatable, adorable",
        mood: "cozy and comfortable",
        recommended_script_format: "monologue",
        themes: ["아침 루틴", "산책", "낮잠", "간식 타임", "놀이"],
        emotion_range: ["평온", "졸림", "설렘", "만족"],
        example_topics: ["나의 하루 루틴", "산책 브이로그", "간식 리뷰"],
      },
      mukbang: {
        name: "먹방",
        emoji: "🍽️",
        description: "간식/음식 관련 콘텐츠",
        tone: "enthusiastic, descriptive, satisfying",
        mood: "delicious and satisfying",
        recommended_script_format: "monologue",
        themes: ["간식 리뷰", "먹방", "음식 반응", "간식 비교", "ASMR"],
        emotion_range: ["기대", "행복", "만족", "실망", "환희"],
        example_topics: ["신상 간식 리뷰", "간식 ASMR", "간식 먹방"],
      },
      healing: {
        name: "힐링",
        emoji: "💕",
        description: "편안하고 치유되는 콘텐츠",
        tone: "gentle, soothing, peaceful",
        mood: "calm and relaxing",
        recommended_script_format: "monologue",
        themes: ["휴식", "자연", "힐링", "명상", "수면"],
        emotion_range: ["평화", "편안", "나른함", "행복"],
        example_topics: ["비 오는 날 창밖 구경", "포근한 이불 속", "할머니 무릎에서 낮잠"],
      },
      drama: {
        name: "드라마",
        emoji: "🎬",
        description: "스토리가 있는 미니 드라마",
        tone: "dramatic, narrative, engaging",
        mood: "story-driven and immersive",
        recommended_script_format: "dialogue",
        themes: ["갈등", "해결", "반전", "미스터리", "로맨스", "모험"],
        emotion_range: ["긴장", "놀람", "기쁨", "슬픔", "해피엔딩"],
        example_topics: ["사라진 간식의 비밀", "새 강아지가 왔다", "할미의 비밀"],
      },
      performance: {
        name: "퍼포먼스",
        emoji: "🎤",
        description: "비트박스, 노래, 댄스, 랩 등 음악 퍼포먼스",
        tone: "rhythmic, energetic, musical, entertaining",
        mood: "performance-driven, show-like",
        recommended_script_format: "interview", // 인터뷰 + 퍼포먼스 하이브리드
        themes: ["비트박스", "노래", "댄스", "랩", "악기 연주", "리듬", "힙합", "락", "케이팝"],
        emotion_range: ["신남", "자신감", "열정", "집중", "즐거움"],
        example_topics: ["비트박스 배틀", "강아지 랩 배틀", "댄스 챌린지", "노래 커버"],
        music_style: "beatbox, acapella, rhythmic, percussive",
        performance_types: ["beatbox", "singing", "dance", "rap", "hiphop", "rock", "instrument", "kpop"],
      },
      random: {
        name: "랜덤",
        emoji: "🎲",
        description: "AI가 오늘의 분위기에 맞게 자동 선택",
        tone: "varied",
        mood: "surprise",
        recommended_script_format: "mixed",
        themes: ["다양함"],
        emotion_range: ["다양함"],
        example_topics: ["AI 추천"],
      },
    };

    const currentConfig = contentTypeConfig[contentType] || contentTypeConfig.satire;

    $.export("content_type", {
      type: contentType,
      config: currentConfig,
    });

    // =====================
    // 2-1. 배경 설정 처리 (NEW!)
    // =====================
    const backgroundSetting = this.background_setting || null;
    const backgroundStyle = this.background_style || "auto";
    const backgroundMood = this.background_mood || "auto";
    const hasBackgroundInput = !!(backgroundSetting || backgroundStyle !== "auto" || backgroundMood !== "auto");

    // 배경 스타일별 기본 설정
    const backgroundStyleConfig = {
      indoor: {
        locations: ["cozy living room", "modern bedroom", "warm kitchen", "home studio", "cafe interior"],
        lighting: "warm indoor lighting, soft ambient light",
        props: ["furniture", "decorations", "plants", "cushions"],
      },
      outdoor: {
        locations: ["sunny park", "cherry blossom garden", "beach", "mountain trail", "city street"],
        lighting: "natural sunlight, golden hour",
        props: ["trees", "flowers", "grass", "sky"],
      },
      stage: {
        locations: ["concert stage", "performance hall", "spotlight arena", "music show set", "award ceremony"],
        lighting: "dramatic stage lighting, colorful spotlights, neon lights",
        props: ["microphone", "speakers", "stage equipment", "crowd silhouette"],
      },
      studio: {
        locations: ["news studio", "interview set", "broadcast room", "talk show set", "podcast studio"],
        lighting: "professional studio lighting, softbox lights",
        props: ["desk", "monitors", "microphone", "camera"],
      },
      fantasy: {
        locations: ["magical forest", "dreamy clouds", "rainbow land", "starry universe", "underwater palace"],
        lighting: "magical glowing light, ethereal atmosphere",
        props: ["sparkles", "magic effects", "floating objects"],
      },
      auto: {
        locations: ["varies based on content"],
        lighting: "varies based on mood",
        props: ["varies"],
      },
    };

    // 배경 분위기별 조명 설정
    const backgroundMoodConfig = {
      bright: "bright cheerful lighting, high key, vibrant colors",
      warm: "warm golden lighting, cozy atmosphere, soft orange tones",
      dark: "moody dark lighting, dramatic shadows, low key",
      colorful: "colorful neon lights, vibrant RGB, party atmosphere",
      natural: "natural daylight, realistic lighting, soft shadows",
      cinematic: "cinematic lighting, dramatic contrast, movie-like atmosphere",
      auto: "appropriate lighting for the scene",
    };

    const currentBackgroundStyle = backgroundStyleConfig[backgroundStyle] || backgroundStyleConfig.auto;
    const currentBackgroundMood = backgroundMoodConfig[backgroundMood] || backgroundMoodConfig.auto;

    // 배경 정보 객체 생성
    const backgroundInfo = {
      user_setting: backgroundSetting,
      style: backgroundStyle,
      mood: backgroundMood,
      style_config: currentBackgroundStyle,
      mood_config: currentBackgroundMood,
      has_custom_background: hasBackgroundInput,
      // 최종 배경 프롬프트 (사용자 입력 우선)
      prompt: backgroundSetting
        ? `${backgroundSetting}, ${currentBackgroundMood}`
        : (backgroundStyle !== "auto"
          ? `${currentBackgroundStyle.locations[0]}, ${currentBackgroundStyle.lighting}, ${currentBackgroundMood}`
          : null),
    };

    $.export("background_info", backgroundInfo);

    if (hasUserInput) {
      $.export("user_input", {
        topic: this.user_topic_input || null,
        keyword_hint: this.user_keyword_hint || null,
        mode: contentType === "satire" ? "satire_transform" : `${contentType}_custom`,
        content_type: contentType,
        background: backgroundInfo,
      });
    } else {
      $.export("user_input", {
        topic: null,
        keyword_hint: null,
        mode: `${contentType}_auto`,
        content_type: contentType,
        background: backgroundInfo,
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

    // 콘텐츠 타입별 프롬프트 섹션 생성
    const generateContentTypeSection = () => {
      const userTopic = this.user_topic_input || '(없음)';
      const userHint = this.user_keyword_hint || '(없음)';

      // 콘텐츠 타입별 상세 가이드
      const contentTypeGuides = {
        satire: `
## 🎭 콘텐츠 타입: 풍자 (SATIRE MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

${hasUserInput ? `
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
Focus on: ${season.ko} themes, current social issues transformed into puppy world.
`}`,

        comic: `
## 😂 콘텐츠 타입: 코믹 (COMIC MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 COMIC CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 웃긴 상황으로 만들어주세요!
` : `
자동으로 웃긴 상황을 생성합니다.
`}

### COMIC ELEMENTS:
1. **반전 (Twist)** - 예상 밖의 결말로 웃음 유발
2. **과장 (Exaggeration)** - 귀여운 과장으로 코믹한 상황
3. **실패 (Fail)** - 강아지의 귀여운 실패 모음
4. **당황 (Confusion)** - 멘붕하는 강아지의 표정
5. **vs 시리즈** - 강아지 vs 로봇청소기, 강아지 vs 거울 등

### COMIC EXAMPLES:
| 상황 | 반전 포인트 | 코믹 요소 |
|------|-------------|-----------|
| 로봇청소기와의 전쟁 | 결국 청소기 위에 탄 강아지 | 표정 변화, 반전 |
| 목욕 탈출 대작전 | 이미 샴푸 거품 투성이 | 실패, 당황 |
| 간식 도둑 잡기 | 범인이 자기 그림자 | 바보미, 귀여움 |
| 처음 보는 고양이 | 고양이가 더 무서워함 | 역반전, 웃음 |`,

        emotional: `
## 🥺 콘텐츠 타입: 감동 (EMOTIONAL MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 EMOTIONAL CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 감동적인 이야기로 만들어주세요!
` : `
자동으로 감동적인 스토리를 생성합니다.
`}

### EMOTIONAL ELEMENTS:
1. **재회 (Reunion)** - 오랜만에 만난 주인/가족
2. **성장 (Growth)** - 아기 강아지의 성장 스토리
3. **우정 (Friendship)** - 다른 동물/강아지와의 우정
4. **감사 (Gratitude)** - 주인에게 감사하는 마음
5. **극복 (Overcome)** - 어려움을 이겨낸 이야기

### EMOTIONAL EXAMPLES:
| 상황 | 감동 포인트 | 눈물샘 자극 요소 |
|------|-------------|------------------|
| 출장 갔던 주인 귀가 | 문 앞에서 기다린 흔적 | 기다림, 재회의 기쁨 |
| 유기견에서 가족으로 | 처음 이불에서 잔 날 | 안도감, 소속감 |
| 할머니와의 마지막 산책 | 할머니 슬리퍼 냄새 맡기 | 그리움, 추억 |
| 아프던 날 주인의 간호 | 밤새 옆에 있던 주인 | 사랑, 감사 |

### EMOTIONAL STORY ARC:
평범한 시작 → 감정적 계기 → 클라이맥스 (눈물) → 따뜻한 마무리`,

        daily: `
## 😊 콘텐츠 타입: 일상 (DAILY MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 DAILY CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 귀여운 일상 콘텐츠로 만들어주세요!
` : `
오늘의 시간대/계절에 맞는 일상 콘텐츠를 생성합니다.
Focus on: ${season.ko} + ${dayTheme.ko} + ${timeTheme.ko}
`}

### DAILY VLOG ELEMENTS:
1. **루틴 (Routine)** - 아침/저녁 루틴, 산책 루틴
2. **먹방 (Eating)** - 간식 타임, 밥 먹기
3. **놀이 (Play)** - 장난감, 공놀이
4. **휴식 (Rest)** - 낮잠, 이불 속
5. **산책 (Walk)** - 동네 산책, 공원

### DAILY EXAMPLES:
| 시간대 | 콘텐츠 | 포인트 |
|--------|--------|--------|
| 아침 | 알람 끄는 주인 vs 배고픈 나 | 졸린 눈, 기다림 |
| 점심 | 간식 타임 브이로그 | 행복한 먹방 |
| 오후 | 햇살 받으며 낮잠 | 평화로움, ASMR |
| 저녁 | 주인 퇴근 기다리기 | 설렘, 반가움 |`,

        mukbang: `
## 🍽️ 콘텐츠 타입: 먹방 (MUKBANG MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 MUKBANG CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 먹방/간식 콘텐츠로 만들어주세요!
` : `
자동으로 먹방/간식 콘텐츠를 생성합니다.
`}

### MUKBANG ELEMENTS:
1. **리뷰 (Review)** - 신상 간식 리뷰, 비교 리뷰
2. **ASMR** - 사각사각, 오도독 먹는 소리
3. **반응 (Reaction)** - 처음 먹어보는 음식 반응
4. **랭킹 (Ranking)** - 간식 순위, 최애 간식
5. **먹방 (Eating Show)** - 맛있게 먹는 모습

### MUKBANG EXAMPLES:
| 콘텐츠 타입 | 예시 | 포인트 |
|-------------|------|--------|
| 신상 리뷰 | 새로 나온 덴탈껌 리뷰 | 첫 반응, 평가 |
| 비교 리뷰 | A간식 vs B간식 | 선택, 반응 차이 |
| ASMR 먹방 | 바삭바삭 간식 ASMR | 소리, 씹는 모습 |
| 반응 영상 | 처음 먹어보는 과일 | 표정, 리액션 |`,

        healing: `
## 💕 콘텐츠 타입: 힐링 (HEALING MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 HEALING CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 힐링 콘텐츠로 만들어주세요!
` : `
오늘의 날씨/계절에 맞는 힐링 콘텐츠를 생성합니다.
Focus on: ${season.ko} 힐링, 편안함, 치유
`}

### HEALING ELEMENTS:
1. **휴식 (Rest)** - 포근한 이불, 햇살 아래
2. **자연 (Nature)** - 비 오는 날, 눈 오는 날
3. **함께함 (Together)** - 주인과 함께하는 시간
4. **평화 (Peace)** - 조용한 오후, 나른한 시간
5. **치유 (Comfort)** - 힘든 하루 끝 위로

### HEALING EXAMPLES:
| 상황 | 힐링 포인트 | 분위기 |
|------|-------------|--------|
| 비 오는 날 창밖 구경 | 빗소리, 평온함 | ASMR, 차분함 |
| 할머니 무릎에서 낮잠 | 따뜻함, 안정감 | 포근함, 사랑 |
| 벚꽃 아래 산책 | 봄바람, 꽃잎 | 아름다움, 설렘 |
| 눈 오는 밤 창가 | 고요함, 눈 | 평화, 아늑함 |

### HEALING AUDIO:
- 배경: lo-fi, 자연 소리, 피아노
- ASMR: 빗소리, 새소리, 벽난로`,

        drama: `
## 🎬 콘텐츠 타입: 드라마 (DRAMA MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 DRAMA CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 미니 드라마로 만들어주세요!
` : `
자동으로 스토리가 있는 미니 드라마를 생성합니다.
`}

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
5. **결말** - 해피엔딩 또는 반전

### DRAMA EXAMPLES:
| 스토리 | 갈등 | 결말 |
|--------|------|------|
| 사라진 간식의 비밀 | 간식이 자꾸 없어짐 | 범인은 할머니 (많이 줘서) |
| 새 강아지가 왔다 | 관심을 뺏긴 질투 | 결국 친한 친구가 됨 |
| 무서운 천둥 밤 | 천둥이 무서워 | 주인과 함께라 극복 |`,

        performance: `
## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)
**Tone**: ${currentConfig.tone}
**Mood**: ${currentConfig.mood}
**Themes**: ${currentConfig.themes.join(", ")}
**Emotion Range**: ${currentConfig.emotion_range.join(", ")}

### 🎯 PERFORMANCE CONTENT GUIDE:
${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 주제를 퍼포먼스 콘텐츠로 만들어주세요!
` : `
자동으로 음악/퍼포먼스 콘텐츠를 생성합니다.
`}

### PERFORMANCE TYPES:
1. **비트박스 (Beatbox)** - 입으로 비트 만들기, 리듬 퍼포먼스
2. **노래 (Singing)** - 강아지 버전 노래, 귀여운 보컬
3. **댄스 (Dance)** - 댄스 챌린지, 귀여운 춤
4. **랩 (Rap)** - 강아지 랩, 디스전, 자랑
5. **악기 (Instrument)** - 피아노 치는 척, 드럼 비트

### PERFORMANCE ELEMENTS:
- **리듬감** - 음악에 맞춘 동작과 표정
- **자신감** - 당당하고 멋있는 모습
- **관객 반응** - 환호, 박수 (상상)
- **클라이맥스** - 하이라이트 순간
- **마무리** - 인사, 포즈

### PERFORMANCE EXAMPLES:
| 퍼포먼스 타입 | 예시 | 포인트 |
|---------------|------|--------|
| 비트박스 | 강아지 비트박스 배틀 | 입 모양, 리듬감, 사운드 |
| 노래 | 강아지가 부르는 "보고싶다" | 감정, 음정, 표현력 |
| 댄스 | 틱톡 댄스 챌린지 | 동작, 타이밍, 귀여움 |
| 랩 | "나는야 간식왕" 랩 | 가사, 플로우, 스웨그 |

### PERFORMANCE STRUCTURE:
1. **인트로** - 등장, 준비 자세
2. **빌드업** - 점점 고조되는 분위기
3. **클라이맥스** - 최고 하이라이트
4. **아웃트로** - 마무리, 인사

### ⚠️ IMPORTANT FOR PERFORMANCE:
- 강아지의 입 움직임이 음악/비트에 맞아야 함
- 몸 전체가 리듬을 타는 모습
- 자신감 넘치는 표정
- 관객이 있는 것처럼 연출
`,

        random: `
## 🎲 콘텐츠 타입: 랜덤 (RANDOM MODE)
오늘의 컨텍스트를 분석하여 가장 적합한 콘텐츠 타입을 AI가 자동 선택합니다.

### 오늘의 컨텍스트:
- 날짜: ${year}년 ${month}월 ${day}일 (${dayTheme.ko})
- 계절: ${season.ko}
- 시간대: ${timeTheme.ko}
- 오늘의 테마: ${todayRandomTheme}
${specialDays.length > 0 ? `- 특별한 날: ${specialDays.join(", ")}` : ""}

### AI SELECTION CRITERIA:
1. 오늘의 날씨/계절에 맞는 콘텐츠
2. 시간대에 어울리는 분위기
3. 특별한 날이면 관련 콘텐츠
4. 최근 트렌드 반영

${hasUserInput ? `
**User Topic**: "${userTopic}"
**User Hints**: "${userHint}"
이 입력을 반영하여 가장 적합한 콘텐츠 타입으로 생성합니다.
` : ''}`,
      };

      return contentTypeGuides[contentType] || contentTypeGuides.satire;
    };

    const userInputSection = generateContentTypeSection();

    const prompt = `You are a creative AI specializing in ADORABLE PUPPY content for viral short-form videos.
You excel at creating ${currentConfig.name} (${currentConfig.emoji}) content - ${currentConfig.description}.

${userInputSection}

## 📅 TODAY'S CONTEXT:
- **Date**: ${year}년 ${month}월 ${day}일 (${dayTheme.ko})
- **Season**: ${season.ko} (${season.jp})
- **Season Themes**: ${season.themes.join(", ")}
- **Day Themes**: ${dayTheme.themes.join(", ")}
${specialDays.length > 0 ? `- **Special Day**: ${specialDays.join(", ")}` : ""}
- **Today's Random Theme**: ${todayRandomTheme}

## 🏠 BACKGROUND SETTING (CRITICAL - 모든 씬에 적용!):
${hasBackgroundInput ? `
### 🎯 USER-SPECIFIED BACKGROUND (최우선 적용!)
${backgroundSetting ? `**User Background**: "${backgroundSetting}"` : ""}
${backgroundStyle !== "auto" ? `**Background Style**: ${backgroundStyle} (${currentBackgroundStyle.locations.join(", ")})` : ""}
${backgroundMood !== "auto" ? `**Background Mood/Lighting**: ${currentBackgroundMood}` : ""}

⚠️ IMPORTANT: 사용자가 지정한 배경을 모든 씬에서 일관되게 사용하세요!
- 배경 위치: ${backgroundSetting || currentBackgroundStyle.locations[0]}
- 조명/분위기: ${currentBackgroundMood}
- 소품/환경: ${currentBackgroundStyle.props?.join(", ") || "varies"}

모든 씬의 scene_details.background에 이 배경 정보가 반영되어야 합니다!
` : `
### 🤖 AUTO BACKGROUND MODE
배경이 지정되지 않았습니다. 콘텐츠 타입과 주제에 맞는 최적의 배경을 생성하세요.
- Content Type: ${contentType} → 추천 배경 스타일 자동 선택
- 모든 씬에서 배경 일관성 유지!
`}

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
  "generation_theme": "${currentConfig.name} 콘텐츠",
  "content_type": "${contentType}",
  "user_input_transformed": ${hasUserInput ? 'true' : 'false'},
  "original_topic": ${hasUserInput ? `"${this.user_topic_input || ''}"` : 'null'},
  "ideas": [
    {
      "id": 1,
      "content_type": "${contentType}",
      "category": "${contentType}",
      "topic": "강아지 시점의 귀여운 제목",
      "keywords": "키워드1, 키워드2, 키워드3, 키워드4, 키워드5",
      "content_type_info": {
        "tone": "${currentConfig.tone}",
        "mood": "${currentConfig.mood}",
        "main_theme": "주요 테마 설명",
        "key_element": "핵심 요소 (반전/감동포인트/웃음포인트 등)"
      },
      "satire_info": ${contentType === 'satire' ? `{
        "original_reference": "원본 주제 (풍자인 경우)",
        "transformation_method": "변환 방법 설명",
        "humor_point": "웃음 포인트"
      }` : 'null'},
      "puppy_character": {
        "suggested_breed": "추천 품종 (상황에 맞는)",
        "personality": "성격 특성",
        "outfit": "의상 설명",
        "props": ["소품1", "소품2"]
      },
      "background": {
        "location": "${backgroundSetting || '주제에 맞는 배경 위치'}",
        "style": "${backgroundStyle !== 'auto' ? backgroundStyle : '콘텐츠에 맞는 스타일'}",
        "lighting": "${currentBackgroundMood || '적절한 조명'}",
        "description": "배경에 대한 상세 설명 (이미지 생성에 사용)",
        "props": ["배경 소품1", "배경 소품2"],
        "atmosphere": "분위기 설명"
      },
      "story_summary": "2-3문장의 스토리 요약",
      "hook": "첫 2-3초 후킹 장면/대사",
      "narration_style": "${currentConfig.emotion_range[0] || '귀여운'}",
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
  },
  "recommended_script_format": "${currentConfig.recommended_script_format}"
}

Be CREATIVE and match the ${currentConfig.name} content type perfectly!
Tone: ${currentConfig.tone}
Mood: ${currentConfig.mood}`;

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
    // 6. 퍼포먼스 타입 (사용자 선택 기반)
    // =====================
    // ★★★ 키워드 감지 대신 사용자가 직접 선택한 퍼포먼스 타입 사용 ★★★
    const selectedPerformanceType = contentType === "performance"
      ? (this.performance_type || "beatbox")
      : null;

    if (selectedPerformanceType) {
      $.export("performance_type", selectedPerformanceType);
    }

    // =====================
    // 7. 결과 반환
    // =====================
    const output = {
      // ★ Script Generator 직접 연동용 필드 (최상위)
      topic: selectedIdea.topic,
      keywords: selectedIdea.keywords,

      // ★★★ 콘텐츠 타입 정보 ★★★
      content_type: contentType,
      content_type_config: {
        ...currentConfig,
        // ★★★ 퍼포먼스 타입 (사용자 선택) ★★★
        primary_performance_type: selectedPerformanceType,
      },
      content_type_info: selectedIdea.content_type_info || {
        tone: currentConfig.tone,
        mood: currentConfig.mood,
        main_theme: currentConfig.themes[0] || "다양함",
        key_element: null,
      },

      // 강아지 캐릭터 정보 (Script Generator, Image Generator에서 사용)
      // ※ 품종은 Script Generator에서 이미지로 결정됨
      puppy_character: selectedIdea.puppy_character || {
        suggested_breed: "다양한 품종",
        personality: "귀여운",
        outfit: "분홍 리본",
        props: [],
      },

      // ★ 풍자/패러디 정보 (풍자 모드일 때만 사용)
      satire_info: contentType === 'satire' ? (selectedIdea.satire_info || null) : null,
      is_satire: contentType === 'satire',
      original_topic: this.user_topic_input || null,
      keyword_hint: this.user_keyword_hint || null,

      // ★★★ 배경 정보 (NEW!) ★★★
      background: {
        // 사용자 입력 정보
        user_setting: backgroundSetting,
        user_style: backgroundStyle,
        user_mood: backgroundMood,
        has_custom_background: hasBackgroundInput,
        // AI 생성 배경 정보 (선택된 아이디어에서)
        ai_generated: selectedIdea.background || null,
        // 최종 배경 프롬프트 (이미지 생성에 직접 사용)
        final_prompt: backgroundSetting
          ? `${backgroundSetting}, ${currentBackgroundMood}`
          : (selectedIdea.background?.description || `${currentBackgroundStyle.locations[0]}, ${currentBackgroundMood}`),
        // 상세 설정
        style_config: currentBackgroundStyle,
        mood_config: currentBackgroundMood,
      },

      // 스토리 컨텍스트 (Script Generator가 사용)
      story_summary: selectedIdea.story_summary,
      hook: selectedIdea.hook,
      narration_style: selectedIdea.narration_style || currentConfig.emotion_range[0] || "귀여운",
      emotional_journey: selectedIdea.emotional_journey,
      category: selectedIdea.category || contentType,
      // ★ 추천 스크립트 형식 (콘텐츠 타입에 따라 다름)
      script_format: this.script_format || result.recommended_script_format || currentConfig.recommended_script_format || "interview",

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
        content_type: contentType,
        mode: hasUserInput ? `${contentType}_custom` : `${contentType}_auto`,
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    $.export("$summary", `${currentConfig.emoji} [${currentConfig.name}] Generated ${result.ideas.length} ideas. Selected: "${output.topic}" (Viral: ${selectedIdea.viral_potential}/10)`);

    return output;
  },
});
