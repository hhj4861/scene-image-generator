import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Market Analyzer",
  description: "주식 시장 현황 분석기 - YouTube 영상/채널 분석 또는 최신 뉴스 기반 현황 정리",

  props: {
    test_mode: { type: "boolean", label: "테스트 모드", description: "Mock 데이터로 테스트", default: false, optional: true },
    test_key_points_count: { type: "integer", label: "테스트 key_points 수", default: 2, optional: true },
    youtube_url: { type: "string", label: "YouTube URL (Optional)", description: "YouTube 영상/채널/플레이리스트 URL", optional: true },
    analysis_date: { type: "string", label: "분석 기준일", description: "YYYY-MM-DD 형식", optional: true },
    market_type: {
      type: "string", label: "시장 유형", default: "us",
      options: [{ label: "미국", value: "us" }, { label: "한국", value: "kr" }, { label: "글로벌", value: "global" }],
    },
    analysis_focus: {
      type: "string[]", label: "분석 초점", default: ["macro", "tech", "ai_semi"], optional: true,
      options: [
        { label: "거시경제", value: "macro" }, { label: "금리/채권", value: "interest" },
        { label: "기술주", value: "tech" }, { label: "에너지", value: "energy" },
        { label: "헬스케어", value: "healthcare" }, { label: "금융", value: "finance" },
        { label: "소비재", value: "consumer" }, { label: "AI/반도체", value: "ai_semi" },
      ],
    },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    serper_api_key: { type: "string", label: "Serper API Key", secret: true, optional: true },
    youtube_api_key: { type: "string", label: "YouTube API Key", secret: true, optional: true },
    openai_api_key: { type: "string", label: "OpenAI API Key", secret: true, optional: true },
    ffmpeg_vm_url: { type: "string", label: "FFmpeg VM URL", default: "http://34.64.168.173:3000", optional: true },
    gcs_bucket: { type: "string", label: "GCS Bucket Name", optional: true },
    gcs_file_path: { type: "string", label: "GCS File Path", optional: true },
    gcs_service_account_json: { type: "string", label: "GCS Service Account JSON", secret: true, optional: true },
    key_points_structure: {
      type: "string", label: "Key Points 구조", default: "auto", optional: true,
      options: [{ label: "자동", value: "auto" }, { label: "주간 전망", value: "weekly_outlook" }, { label: "커스텀", value: "custom" }],
    },
    key_points_custom_structure: { type: "string", label: "커스텀 Key Points 구조", optional: true },
    llm_model: {
      type: "string", label: "LLM Model", default: "gemini-2.0-flash",
      options: [
        { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
        { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
      ],
    },
    key_points_model: {
      type: "string", label: "Key Points 모델", default: "same", optional: true,
      options: [
        { label: "기본 모델과 동일", value: "same" },
        { label: "Gemini 2.5 Flash (추천)", value: "gemini-2.5-flash" },
        { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
        { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
      ],
    },
    output_language: {
      type: "string", label: "출력 언어", default: "korean",
      options: [{ label: "한국어", value: "korean" }, { label: "English", value: "english" }],
    },
    fast_mode: { type: "boolean", label: "Fast Mode", default: true, optional: true },
    max_transcript_length: { type: "integer", label: "Max Transcript Length", default: 15000, optional: true },
  },

  async run({ $ }) {
    const analysisDate = this.analysis_date || new Date().toISOString().split("T")[0];
    const isKorean = this.output_language === "korean";

    // 텍스트 내용에 따른 마켓 레벨 자동 감지 함수
    const detectMarketType = (text) => {
      if (!text) return this.market_type;
      const t = text.toLowerCase();
      
      // 한국 시장 키워드
      const krKeywords = ["한국", "코스피", "코스닥", "국내", "원화", "한국증시", "국내증시", "kospi", "kosdaq", "삼성전자", "sk하이닉스", "현대차"];
      // 미국 시장 키워드
      const usKeywords = ["미국", "s&p", "나스닥", "다우", "월가", "연준", "fed", "nasdaq", "dow", "wall street", "테슬라", "애플", "마이크로소프트"];
      
      const krCount = krKeywords.reduce((cnt, kw) => cnt + (t.split(kw).length - 1), 0);
      const usCount = usKeywords.reduce((cnt, kw) => cnt + (t.split(kw).length - 1), 0);
      
      console.log(`📊 마켓 감지: 한국=${krCount}, 미국=${usCount}`);
      
      // 한국 키워드가 압도적으로 많으면 한국
      if (krCount > usCount * 2) return "kr";
      // 미국 키워드가 압도적으로 많으면 미국
      if (usCount > krCount * 2) return "us";
      // 둘 다 있으면 글로벌
      if (krCount > 0 && usCount > 0) return "global";
      // 한국만 있으면 한국
      if (krCount > 0) return "kr";
      // 미국만 있으면 미국
      if (usCount > 0) return "us";
      // 기본값
      return this.market_type;
    };

    // 마켓 레벨 (나중에 텍스트 분석 후 재결정)
    let detectedMarketType = this.market_type;
    const getMarketLabel = () => ({ us: "미국", kr: "한국", global: "글로벌" }[detectedMarketType]);
    let marketLabel = getMarketLabel();
    const langInstr = isKorean ? "한국어로 작성. 친근한 말투(~해요, ~이에요)." : "Write in English.";

    // ========== 테스트 모드 ==========
    if (this.test_mode) {
      console.log("🧪 테스트 모드");
      const pool = [
        "미국 11월 고용 보고서 결과 혼조세, 실업률 4년 만에 최고치로 금리 인하 불확실성 증가.",
        "테슬라 무인 로봇택시 이슈로 급등, 시총 7위 안착. 자율주행 시장 경쟁 심화 예상.",
        "AI 버블 논쟁 속 연준 완화 사이클 지속 시 AI 관련주 강세 지속 가능성 분석.",
        "소비재·방산 섹터 조용한 강세, 포트폴리오 다변화 전략 필요.",
      ];
      const count = this.test_key_points_count || 2;
      const keyPoints = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
      const mock = {
        executive_summary: `[테스트] ${analysisDate} ${marketLabel} 시장 분석`,
        key_points: keyPoints,
        market_outlook: { sentiment: "neutral", confidence: 70 },
        hook_line: `${marketLabel} 증시 핵심 뉴스!`,
      };
      $.export("analysis", mock);
      return { analysis_date: analysisDate, market_type: this.market_type, source: "test_mode", analysis: mock };
    }

    // ========== 공통 유틸리티 ==========
    const parseJson = (text) => {
      try {
        const m = text.match(/```json\s*([\s\S]*?)\s*```/);
        return JSON.parse(m ? m[1] : text);
      } catch { return { summary: text, key_points: [], raw: true }; }
    };

    const callGemini = async (prompt, temp = 0.3, model = null) => {
      const m = model || this.llm_model;
      const r = await axios($, {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, maxOutputTokens: 8192 } },
      });
      return r.candidates[0].content.parts[0].text;
    };

    const callOpenAI = async (prompt, temp = 0.3, model = "gpt-4o") => {
      if (!this.openai_api_key) throw new Error("OpenAI API Key 필요");
      const r = await axios($, {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: { Authorization: `Bearer ${this.openai_api_key}`, "Content-Type": "application/json" },
        data: { model, messages: [{ role: "user", content: prompt }], temperature: temp, max_tokens: 4096 },
      });
      return r.choices[0].message.content;
    };

    const callKeyPointsModel = async (prompt, temp = 0.3) => {
      const m = this.key_points_model || "same";
      if (m === "same") return callGemini(prompt, temp);
      if (m.startsWith("gpt-")) return callOpenAI(prompt, temp, m);
      return callGemini(prompt, temp, m);
    };

    // 주차 계산 함수 (ISO week number)
    const getWeekNumber = (dateStr) => {
      const date = new Date(dateStr);
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
      return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    };

    const getKeyPointsInstruction = () => {
      const s = this.key_points_structure || "auto";
      if (s === "weekly_outlook") {
        console.log(`[Weekly Outlook] 원문 주차 번호 사용 모드`);
        
        return `"key_points": [
    "1️⃣ [W?? 요약] 원문에서 주차번호 추출! 지난주 시장 흐름 - ★모든 수치 필수 포함★ S&P 500 +X.XX%, 나스닥 +X.XX%, 다우 -X.XX% 등 (200-300자)",
    "2️⃣ [W?? 전망] 원문에서 주차번호 추출! 이번주 전망 - ★모든 수치 필수 포함★ PCE 예상치, 금리 저항선 등 (200-300자)"
  ],
  ★★★ key_points 필수 규칙 ★★★
  - 주차번호: 원문에 "W51", "W52", "제51주" 등 있으면 그대로 사용!
  - 수치 필수: CPI 2.7%, 실업률 4.6%, S&P +0.10%, 마이크론 +17% 등 원문의 모든 숫자 포함!
  - ❌ "소폭 상승" → 숫자 누락! ✅ "+0.10% 상승"
  - ❌ "금리 인상" → 숫자 누락! ✅ "0.75%로 인상"`;
      }
      if (s === "custom" && this.key_points_custom_structure) {
        const parts = this.key_points_custom_structure.split("|").map((p, i) => `"${i + 1}️⃣ ${p.trim()} 200-300자"`);
        return `"key_points": [${parts.join(", ")}],`;
      }
      // auto (daily_market 등) - 일간 분석 형식
      console.log(`[Daily Market] 일간 분석 형식 사용`);
      return `"key_points": [
    "1️⃣ [시장 현황] 오늘/금일 시장 핵심 이슈 - ★수치 필수★ CPI X.X%, EPS 가이던스, 주가 변동률 등 (200-300자)",
    "2️⃣ [주목 포인트] 투자자 주목 사항 - ★수치 필수★ 만기일 규모, 목표가, 기업 가치 등 (200-300자)"
  ],
  ★★★ 일간 분석 필수 규칙 (DAILY_MARKET) ★★★
  - ❌ 금지: "[W?? 요약]", "[W?? 전망]" 형식 사용 금지!
  - ❌ 금지: "지난주", "이번 주" 표현 사용 금지!
  - ✅ 사용: "[시장 현황]", "[주목 포인트]" 형식 사용!
  - ✅ 사용: "오늘", "금일", "이번 금요일" 등 일간 표현!
  - 수치 필수: CPI 2.7%, 주가 +10.1%, 7조 달러 규모 등 원문의 모든 숫자 포함!`;
    };

    const regenerateKeyPoints = async (parsed, context) => {
      const m = this.key_points_model || "same";
      if (m === "same" || !parsed.all_topics_scored?.length) return;
      
      // weekly_outlook 구조인 경우 특별 처리
      const keyPointsStructure = this.key_points_structure || "auto";
      
      // ★★★ 기존 key_points가 이미 좋으면 스킵 ★★★
      const existingKP = parsed.key_points || [];
      const hasNumbers = existingKP.some(kp => /\d+\.?\d*%|\$\d+|\d+조|\d+억/.test(kp));
      const hasWeekLabel = existingKP.some(kp => /\[W\d+/.test(kp));
      const hasGoodLength = existingKP.every(kp => kp.length >= 100); // 100자 이상
      
      // weekly_outlook: 수치 + 주차 라벨 필수
      // 그 외: 수치 + 적절한 길이면 OK
      const isAlreadyGood = keyPointsStructure === "weekly_outlook" 
        ? (hasNumbers && hasWeekLabel) 
        : (hasNumbers && hasGoodLength);
      
      if (isAlreadyGood) {
        console.log(`[KeyPoints] 기존 key_points 품질 우수 - 재생성 스킵`);
        console.log(`   구조: ${keyPointsStructure}, 수치: ${hasNumbers}, 주차: ${hasWeekLabel}, 길이OK: ${hasGoodLength}`);
        console.log(`   예시: ${existingKP[0]?.substring(0, 60)}...`);
        return;  // 재생성하지 않음
      }
      
      console.log(`[KeyPoints] 고성능 모델로 재생성: ${m}`);
      console.log(`   구조: ${keyPointsStructure}, 수치: ${hasNumbers}, 주차: ${hasWeekLabel}, 길이OK: ${hasGoodLength}`);
      let structureInstruction = "";
      
      if (keyPointsStructure === "weekly_outlook") {
        structureInstruction = `
★★★ 중요: 반드시 아래 구조로 작성하세요! ★★★
key_points는 정확히 2개여야 합니다:
- key_points[0]: 원문에 명시된 주차 번호로 "[W?? 요약]" 시작 (지난주 내용)
- key_points[1]: 원문에 명시된 주차 번호로 "[W?? 전망]" 시작 (이번주/차주 내용)

🚨🚨🚨 주차 번호는 원문에서 추출! 🚨🚨🚨
- 원문에 "W51", "W52", "제51주", "제52주" 등 주차 번호가 있으면 그대로 사용!
- 예: 원문에 "W51 증시 요약"이 있으면 → "[W51 요약]"으로 시작!
- 예: 원문에 "W52 전망"이 있으면 → "[W52 전망]"으로 시작!
- ❌ 임의로 주차 번호 변경 금지! 원문 주차 번호 그대로!

🚨🚨🚨 구체적 수치 필수 포함! 🚨🚨🚨
원문에 있는 모든 숫자/비율을 반드시 포함하세요!
- ❌ "CPI가 예상치를 하회" → 숫자 누락!
- ✅ "CPI가 전년 대비 2.7%를 기록하며 예상치(3.1%)를 하회"
- ❌ "실업률 상승" → 숫자 누락!
- ✅ "실업률이 4.6%로 상승"
- ❌ "일본은행 금리 인상" → 숫자 누락!
- ✅ "일본은행이 30년 만에 최고치인 0.75%로 인상"
- ❌ "마이크론 급등, 나이키 급락" → 숫자 누락!
- ✅ "마이크론 17% 급등, 나이키 10.5% 급락"
- ❌ "S&P 상승, 다우 하락" → 숫자 누락!
- ✅ "S&P 500 +0.10%, 나스닥 +0.50%, 다우 -0.70%, 러셀 -0.90%"

🚨🚨🚨 주차별 내용 구분 필수! 🚨🚨🚨
- key_points[0]: 원문의 "지난주", "요약", 과거형 내용만!
- key_points[1]: 원문의 "이번주", "전망", 미래형 내용만!
- ❌ 지난주 내용을 전망에 넣기 금지!
- ❌ 이번주 내용을 요약에 넣기 금지!

예시:
{
  "key_points": [
    "[W51 요약] 지난주 미국 증시는 CPI가 전년 대비 2.7%(근원 2.6%)로 예상치(3.1%)를 하회하며 혼조세를 보였어요. S&P 500 +0.10%, 나스닥 +0.50% 상승했지만 다우 -0.70%, 러셀 -0.90% 하락했죠. 실업률은 4.6%로 상승했고, 일본은행은 30년 만에 최고치인 0.75%로 금리를 인상했어요...",
    "[W52 전망] 이번주는 PCE 물가지수(예상 2.8%~2.9%) 발표가 핵심이에요. 10년물 국채 금리가 4.2% 저항선을 돌파하면..."
  ]
}`;
        console.log(`[KeyPoints] weekly_outlook 구조 적용 (원문 주차 번호 사용)`);
      } else {
        // daily_market / auto - 일간 분석 형식
        structureInstruction = `★★★ 일간 분석 형식 (DAILY_MARKET) ★★★
key_points는 정확히 2개:
- key_points[0]: "[시장 현황]"으로 시작. 오늘/금일 핵심 이슈 (200-300자)
- key_points[1]: "[주목 포인트]"로 시작. 투자자 주목 사항 (200-300자)

🚨🚨🚨 금지 표현 🚨🚨🚨
- ❌ "[W?? 요약]", "[W?? 전망]" 형식 절대 금지!
- ❌ "지난주", "이번 주" 표현 절대 금지!
- ✅ "[시장 현황]", "[주목 포인트]" 사용!
- ✅ "오늘", "금일", "이번 금요일" 등 일간 표현!

🚨🚨🚨 수치 필수 🚨🚨🚨
- CPI 전월비 0.3%, 전년비 2.7%, 코어 CPI 2.6% 등 원문 수치 그대로!
- 마이크론 +10.1%, 목표가 500달러, 7조 달러 규모 등!

예시:
{
  "key_points": [
    "[시장 현황] 오늘 시장에서 CPI가 전월비 0.3%, 전년비 2.7%로 발표되며...",
    "[주목 포인트] 이번 금요일 7조 달러 규모 선물옵션 만기일이 예정되어..."
  ]
}`;
        console.log(`[KeyPoints] daily_market 구조 적용 (일간 표현 사용)`);
      }
      
      // ★★★ 기존 key_points에 수치가 있으면 그것을 기반으로! ★★★
      const existingKeyPoints = parsed.key_points || [];
      const kpHasNumbers = existingKeyPoints.some(kp => /\d+\.?\d*%|\$\d+|\d+조|\d+억/.test(kp));
      
      if (kpHasNumbers && keyPointsStructure === "weekly_outlook") {
        console.log(`[KeyPoints] 기존 key_points에 수치 포함됨 - 형식만 개선`);
      }
      
      const prompt = `주식 애널리스트로서 key_points 개선.

${kpHasNumbers ? `★★★ 기존 key_points (수치 포함됨 - 반드시 유지!) ★★★
${JSON.stringify(existingKeyPoints, null, 2)}

위 key_points의 모든 숫자/비율을 그대로 유지하면서 형식만 개선하세요!
- S&P 500 +0.10% → 그대로!
- CPI 2.7% → 그대로!
- 실업률 4.6% → 그대로!
- 마이크론 17% → 그대로!
❌ 숫자를 삭제하거나 "소폭 상승" 같은 표현으로 바꾸면 안 됨!
` : `주제 점수 (kpHasNumbers=${kpHasNumbers}):
${JSON.stringify(parsed.all_topics_scored)}

요약:
${parsed.summary || parsed.narrative_summary || ""}`}

${structureInstruction}

JSON으로만 응답:
\`\`\`json
{"key_points": ["...", "..."], "selection_reason": "..."}
\`\`\`

${langInstr}`;

      try {
        const r = parseJson(await callKeyPointsModel(prompt, 0.2));
        if (r.key_points?.length) {
          parsed.key_points_original = parsed.key_points;
          parsed.key_points = r.key_points;
          parsed.key_points_model = m;
          parsed.key_points_structure = keyPointsStructure;
          console.log(`[KeyPoints] ${r.key_points.length}개 생성:`, r.key_points.map(kp => kp.substring(0, 30) + "...").join(" | "));
        }
      } catch (e) { console.error(`[KeyPoints] 실패: ${e.message}`); }
    };

    // ========== GCS 파일 읽기 ==========
    const fetchGcsTextFile = async () => {
      if (!this.gcs_bucket || !this.gcs_file_path) return null;
      console.log(`[GCS] Reading: gs://${this.gcs_bucket}/${this.gcs_file_path}`);
      try {
        let token = null;
        if (this.gcs_service_account_json) {
          const sa = typeof this.gcs_service_account_json === "string" ? JSON.parse(this.gcs_service_account_json) : this.gcs_service_account_json;
          const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
          const now = Math.floor(Date.now() / 1000);
          const h = { alg: "RS256", typ: "JWT" };
          const c = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/devstorage.read_only", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
          const unsigned = `${b64(h)}.${b64(c)}`;
          const crypto = await import("crypto");
          const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
          const jwt = `${unsigned}.${sig}`;
          const tr = await axios($, { url: "https://oauth2.googleapis.com/token", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
          token = tr.access_token;
        }
        const r = await axios($, { url: `https://storage.googleapis.com/storage/v1/b/${this.gcs_bucket}/o/${encodeURIComponent(this.gcs_file_path)}?alt=media`, method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {}, responseType: "text" });
        const content = typeof r === "string" ? r : r.data || "";
        console.log(`[GCS] Loaded: ${content.length} chars`);
        return content;
      } catch (e) { console.error(`[GCS] Error: ${e.message}`); return null; }
    };

    // ========== YouTube 유틸리티 ==========
    const parseYouTubeUrl = (url) => {
      if (!url) return { type: "none" };
      const pl = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (pl && !url.includes("v=")) return { type: "playlist", playlistId: pl[1] };
      for (const p of [/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/, /^([a-zA-Z0-9_-]{11})$/]) {
        const m = url.match(p);
        if (m?.[1]) return { type: "video", videoId: m[1] };
      }
      for (const { regex, type } of [
        { regex: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: "channel_id" },
        { regex: /youtube\.com\/@([a-zA-Z0-9_-]+)/, type: "handle" },
        { regex: /youtube\.com\/c\/([a-zA-Z0-9_-]+)/, type: "custom" },
        { regex: /youtube\.com\/user\/([a-zA-Z0-9_-]+)/, type: "user" },
      ]) {
        const m = url.match(regex);
        if (m?.[1]) return { type: "channel", subType: type, identifier: m[1] };
      }
      return { type: "unknown" };
    };

    const getChannelId = async (info) => {
      if (info.subType === "channel_id") return info.identifier;
      if (this.youtube_api_key) {
        try {
          const param = info.subType === "handle" ? `forHandle=@${info.identifier}` : `forUsername=${info.identifier}`;
          const r = await axios($, { url: `https://www.googleapis.com/youtube/v3/channels?${param}&part=id&key=${this.youtube_api_key}`, method: "GET" });
          if (r.items?.[0]?.id) return r.items[0].id;
        } catch {}
      }
      const urlMap = { handle: `https://www.youtube.com/@${info.identifier}`, custom: `https://www.youtube.com/c/${info.identifier}`, user: `https://www.youtube.com/user/${info.identifier}` };
      const r = await axios($, { url: urlMap[info.subType], method: "GET", headers: { "User-Agent": "Mozilla/5.0" } });
      const html = typeof r === "string" ? r : r.data || "";
      for (const p of [/"channelId":"(UC[a-zA-Z0-9_-]+)"/, /"externalId":"(UC[a-zA-Z0-9_-]+)"/]) {
        const m = html.match(p);
        if (m?.[1]) return m[1];
      }
      throw new Error("Channel ID not found");
    };

    const getChannelVideos = async (channelId) => {
      const r = await axios($, { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, method: "GET" });
      const xml = typeof r === "string" ? r : r.data || "";
      const videos = [];
      const re = /<entry>([\s\S]*?)<\/entry>/g;
      let m;
      while ((m = re.exec(xml))) {
        const e = m[1];
        const vid = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
        const title = e.match(/<title>([^<]+)<\/title>/)?.[1];
        const pub = e.match(/<published>([^<]+)<\/published>/)?.[1];
        if (vid && title && pub) videos.push({ videoId: vid, title, published: pub.split("T")[0] });
      }
      return videos;
    };

    const getPlaylistVideos = async (playlistId) => {
      const r = await axios($, { url: `https://www.youtube.com/playlist?list=${playlistId}`, method: "GET", headers: { "User-Agent": "Mozilla/5.0" } });
      const html = typeof r === "string" ? r : r.data || "";
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(" - YouTube", "").trim() || "Playlist";
      const videos = [], seen = new Set();
      const re = /"videoId":"([a-zA-Z0-9_-]{11})"[^}]*?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
      let m;
      while ((m = re.exec(html))) {
        if (!seen.has(m[1])) { seen.add(m[1]); videos.push({ videoId: m[1], title: m[2] }); }
      }
      return { playlistTitle: title, videos: videos.slice(0, 50) };
    };

    const findVideoForDate = async (channelId, date) => {
      const videos = await getChannelVideos(channelId);
      if (!videos.length) throw new Error("No videos found");
      return videos.find(v => v.published === date) || videos[0];
    };

    const fetchYouTubeTranscript = async (videoId) => {
      try {
        const r = await axios($, { url: `https://www.youtube.com/watch?v=${videoId}`, method: "GET", headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9" } });
        const html = typeof r === "string" ? r : r.data || "";
        const cm = html.match(/"captionTracks":\s*(\[.*?\])/s);
        if (!cm) throw new Error("No captions");
        const tracks = JSON.parse(cm[1]);
        if (!tracks?.length) throw new Error("No tracks");
        const track = tracks.find(t => t.languageCode === "ko") || tracks.find(t => t.languageCode === "en") || tracks[0];
        const cr = await axios($, { url: track.baseUrl, method: "GET" });
        const xml = typeof cr === "string" ? cr : cr.data || "";
        const parts = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()).filter(Boolean);
        return { success: true, language: track.languageCode, transcript: parts.join(" ") };
      } catch (e) { return { success: false, error: e.message, transcript: null }; }
    };

    const fetchVideoMetadata = async (videoId) => {
      try {
        const r = await axios($, { url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, method: "GET" });
        return { title: r.title, author: r.author_name };
      } catch { return { title: "Unknown", author: "Unknown" }; }
    };

    const extractAudioFromVM = async (videoId) => {
      const r = await axios($, {
        url: `${this.ffmpeg_vm_url || "http://34.64.168.173:3000"}/extract-audio`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: { youtube_url: `https://www.youtube.com/watch?v=${videoId}`, format: "mp3", quality: "128" },
        timeout: 300000,
      });
      return { audio_url: r.audio_url, duration_seconds: r.duration_seconds };
    };

    const transcribeWithWhisper = async (audioUrl) => {
      if (!this.openai_api_key) throw new Error("OpenAI API Key 필요");
      const ar = await axios($, { url: audioUrl, method: "GET", responseType: "arraybuffer", timeout: 120000 });
      const FormData = (await import("form-data")).default;
      const form = new FormData();
      form.append("file", Buffer.from(ar), { filename: "audio.mp3", contentType: "audio/mpeg" });
      form.append("model", "whisper-1");
      form.append("language", "ko");
      form.append("response_format", "text");
      const r = await axios($, { url: "https://api.openai.com/v1/audio/transcriptions", method: "POST", headers: { Authorization: `Bearer ${this.openai_api_key}`, ...form.getHeaders() }, data: form, timeout: 300000 });
      return { success: true, transcript: typeof r === "string" ? r : r.text || r, language: "ko" };
    };

    // ========== 분석 프롬프트 ==========
    const buildAnalysisPrompt = (content, contentType, metadata = {}) => {
      const keyPointsInstr = getKeyPointsInstruction();
      return `당신은 주식 유튜브 콘텐츠 작가입니다. 1분 쇼츠 영상용 대본으로 정리해주세요.

===== 정보 =====
${contentType === "youtube" ? `제목: ${metadata.title}\n채널: ${metadata.author}` : "소스: GCS 텍스트"}
분석일: ${analysisDate}, 시장: ${marketLabel}

===== 내용 =====
${content.substring(0, 15000)}${content.length > 15000 ? "... (생략)" : ""}
====================

JSON 형식으로 응답:
\`\`\`json
{
  "analysis_type": "daily_market|outlook|issue|sector|stock",
  "narrative_summary": "여러분 오늘은 ${marketLabel}증시의... (300자+)",
  "summary": "핵심 요약 (300자+)",
  "all_topics_scored": [{"topic": "주제", "importance_score": 1-10, "score_reason": "이유"}],
  ${keyPointsInstr}
  "market_outlook": {"sentiment": "bullish/bearish/neutral", "confidence": 0-100, "reasoning": "근거"},
  "mentioned_sectors": [{"sector": "섹터", "outlook": "positive/negative/neutral", "reason": "이유", "key_stocks": ["종목"]}],
  "mentioned_tickers": [{"ticker": "티커", "name": "종목명", "action": "buy/sell/hold", "reason": "이유"}],
  "risk_factors": ["리스크1", "리스크2"],
  "opportunities": ["기회1", "기회2"],
  "hook_line": "임팩트 있는 한 줄",
  "shorts_script_points": [
    {"order": 1, "topic": "오프닝", "script": "대사", "duration_hint": "3초"},
    {"order": 2, "topic": "시장현황", "script": "대사", "duration_hint": "10초"}
  ]
}
\`\`\`

${isKorean ? "한국어로, 친근한 말투(~해요, ~이에요)로 작성." : "Write in English."}

★★★ 수치 필수 포함 규칙 ★★★
- key_points에 원문의 모든 숫자/비율을 그대로 포함하세요!
- ❌ "S&P 상승" → ✅ "S&P 500 +0.10% 상승"
- ❌ "CPI 하회" → ✅ "CPI 2.7%로 예상치 3.1% 하회"
- ❌ "실업률 상승" → ✅ "실업률 4.6%로 상승"
- ❌ "금리 인상" → ✅ "0.75%로 금리 인상"
- ❌ "마이크론 급등" → ✅ "마이크론 17% 급등"
- 주차번호도 원문 그대로: W51, W52, 제51주 등

중요: 전문가 이름 제외, narrative_summary는 "여러분 오늘은 ${marketLabel}증시의"로 시작.`;
    };

    // ========== YouTube 분석 ==========
    const analyzeYouTubeVideo = async (videoId, sourceInfo = {}) => {
      $.export("source", "youtube");
      $.export("video_id", videoId);
      const start = Date.now();
      const fast = this.fast_mode !== false;

      let metadata, transcriptResult;
      if (fast) {
        [metadata, transcriptResult] = await Promise.all([fetchVideoMetadata(videoId), fetchYouTubeTranscript(videoId)]);
      } else {
        metadata = await fetchVideoMetadata(videoId);
        transcriptResult = await fetchYouTubeTranscript(videoId);
      }
      $.export("video_metadata", metadata);

      let transcriptMethod = "caption";
      if (!transcriptResult.success || !transcriptResult.transcript) {
        console.log("[YouTube] 자막 없음, Whisper 시도...");
        if (!this.openai_api_key) throw new Error("자막 없음. Whisper 사용하려면 OpenAI API Key 필요.");
        const audio = await extractAudioFromVM(videoId);
        transcriptResult = await transcribeWithWhisper(audio.audio_url);
        transcriptMethod = "whisper";
      }

      const maxLen = fast ? (this.max_transcript_length || 8000) : (this.max_transcript_length || 15000);
      let transcript = transcriptResult.transcript;
      if (transcript.length > maxLen) transcript = transcript.substring(0, maxLen) + "... (생략)";

      // 콘텐츠 기반 마켓 타입 자동 감지
      const combinedText = `${metadata.title || ""} ${transcript}`;
      detectedMarketType = detectMarketType(combinedText);
      marketLabel = getMarketLabel();
      console.log(`[YouTube] 감지된 마켓: ${detectedMarketType} (${marketLabel})`);

      const prompt = buildAnalysisPrompt(transcript, "youtube", metadata);
      const result = await callGemini(prompt);
      const parsed = parseJson(result);

      parsed.video_info = { title: metadata.title, author: metadata.author, video_id: videoId, video_url: `https://www.youtube.com/watch?v=${videoId}`, transcript_method: transcriptMethod, ...sourceInfo };
      await regenerateKeyPoints(parsed);

      console.log(`[YouTube] 완료: ${Date.now() - start}ms`);
      return parsed;
    };

    // ========== 뉴스 분석 ==========
    const analyzeNews = async () => {
      $.export("source", "news");
      if (!this.serper_api_key) throw new Error("Serper API Key 필요");

      const focus = { macro: "economy GDP inflation", interest: "interest rate fed bond", tech: "tech stocks FAANG", energy: "oil energy", healthcare: "healthcare pharma", finance: "bank financial", consumer: "consumer retail", ai_semi: "AI semiconductor nvidia" };
      const market = { us: "US stock market S&P 500", kr: "Korea KOSPI", global: "global stock market" };

      const results = await Promise.all((this.analysis_focus || ["macro"]).map(async (f) => {
        try {
          const r = await axios($, { url: "https://google.serper.dev/news", method: "POST", headers: { "X-API-KEY": this.serper_api_key, "Content-Type": "application/json" }, data: { q: `${market[this.market_type]} ${focus[f]} ${analysisDate}`, num: 5 } });
          return (r.news || []).map(a => ({ focus: f, title: a.title, snippet: a.snippet }));
        } catch { return []; }
      }));

      const articles = results.flat().slice(0, 20);
      const context = articles.map(a => `[${a.focus}] ${a.title}\n${a.snippet}`).join("\n\n");

      const prompt = `전문 금융 애널리스트로서 뉴스 분석.\n\n분석일: ${analysisDate}\n시장: ${marketLabel}\n\n===== 뉴스 =====\n${context}\n====================\n\nJSON 형식으로 응답:\n\`\`\`json\n{"summary": "요약", "key_points": ["포인트"], "market_outlook": {"sentiment": "neutral", "confidence": 70}, "sector_analysis": [], "risk_factors": [], "opportunities": []}\n\`\`\`\n\n${langInstr}`;
      const parsed = parseJson(await callGemini(prompt, 0.2));
      return { ...parsed, news_sources: articles };
    };

    // ========== GCS 분석 ==========
    const analyzeGcsText = async (content) => {
      $.export("source", "gcs");
      console.log(`[GCS] 분석 시작: ${content.length}자`);

      // 콘텐츠 기반 마켓 타입 자동 감지
      detectedMarketType = detectMarketType(content);
      marketLabel = getMarketLabel();
      console.log(`[GCS] 감지된 마켓: ${detectedMarketType} (${marketLabel})`);

      const prompt = buildAnalysisPrompt(content, "gcs");
      const parsed = parseJson(await callGemini(prompt));
      parsed.gcs_info = { bucket: this.gcs_bucket, file_path: this.gcs_file_path, content_length: content.length };
      parsed.detected_market = { type: detectedMarketType, label: marketLabel };
      await regenerateKeyPoints(parsed);
      return parsed;
    };

    // ========== 메인 실행 ==========
    let analysisResult, sourceType = "news", sourceUrl = null;
    const gcsContent = await fetchGcsTextFile();

    if (this.gcs_bucket && this.gcs_file_path && gcsContent) {
      console.log(`[Priority] 1순위: GCS`);
      sourceType = "gcs";
      sourceUrl = `gs://${this.gcs_bucket}/${this.gcs_file_path}`;
      analysisResult = await analyzeGcsText(gcsContent);

    } else if (this.youtube_url) {
      const info = parseYouTubeUrl(this.youtube_url);
      console.log(`[Priority] 2순위: YouTube (${info.type})`);

      if (info.type === "video") {
        sourceType = "youtube_video";
        sourceUrl = `https://www.youtube.com/watch?v=${info.videoId}`;
        analysisResult = await analyzeYouTubeVideo(info.videoId);

      } else if (info.type === "channel") {
        sourceType = "youtube_channel";
        const channelId = await getChannelId(info);
        const video = await findVideoForDate(channelId, analysisDate);
        sourceUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
        analysisResult = await analyzeYouTubeVideo(video.videoId, { source_type: "channel", channel_id: channelId });

      } else if (info.type === "playlist") {
        sourceType = "youtube_playlist";
        const pl = await getPlaylistVideos(info.playlistId);
        if (!pl.videos.length) throw new Error("No videos in playlist");
        const video = pl.videos[0];
        sourceUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
        analysisResult = await analyzeYouTubeVideo(video.videoId, { source_type: "playlist", playlist_id: info.playlistId });

      } else {
        throw new Error(`Invalid YouTube URL: ${this.youtube_url}`);
      }

    } else {
      console.log(`[Priority] 3순위: 뉴스`);
      analysisResult = await analyzeNews();
    }

    const keyPointsStructure = this.key_points_structure || "auto";
    const skipTickerAnalysis = keyPointsStructure === "weekly_outlook";
    
    if (skipTickerAnalysis) {
      console.log(`[Weekly Outlook] 섹터/종목 분석 스킵 플래그 설정`);
    }
    
    const result = { 
      analysis_date: analysisDate, 
      market_type: detectedMarketType,  // 자동 감지된 마켓 타입
      market_label: marketLabel,        // 감지된 마켓 레이블
      original_market_type: this.market_type,  // 사용자 설정값 (참고용)
      source: sourceType, 
      source_url: sourceUrl, 
      analysis: analysisResult, 
      key_points_structure: keyPointsStructure,
      skip_ticker_analysis: skipTickerAnalysis,
      generated_at: new Date().toISOString() 
    };
    $.export("market_analysis", result);
    return result;
  },
});
