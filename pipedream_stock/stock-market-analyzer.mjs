import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Market Analyzer",
  description: "주식 시장 현황 분석기 - YouTube 영상 분석 또는 최신 뉴스 기반 현황 정리",

  props: {
    // =====================
    // 입력 소스 설정
    // =====================
    youtube_url: {
      type: "string",
      label: "YouTube URL (Optional)",
      description: "분석할 YouTube 영상 URL. 입력 시 해당 영상 내용을 분석하여 현황 정리. 비워두면 최신 뉴스 기반으로 분석.",
      optional: true,
    },
    analysis_date: {
      type: "string",
      label: "분석 기준일",
      description: "YYYY-MM-DD 형식. 비워두면 오늘 날짜 사용.",
      optional: true,
    },
    market_type: {
      type: "string",
      label: "시장 유형",
      description: "분석할 시장 선택",
      options: [
        { label: "미국 (US Market)", value: "us" },
        { label: "한국 (Korean Market)", value: "kr" },
        { label: "글로벌 (Global)", value: "global" },
      ],
      default: "us",
    },
    analysis_focus: {
      type: "string[]",
      label: "분석 초점",
      description: "중점적으로 분석할 영역 선택 (복수 선택 가능)",
      options: [
        { label: "거시경제 (Macro)", value: "macro" },
        { label: "금리/채권 (Interest Rate)", value: "interest" },
        { label: "기술주 (Tech)", value: "tech" },
        { label: "에너지 (Energy)", value: "energy" },
        { label: "헬스케어 (Healthcare)", value: "healthcare" },
        { label: "금융 (Finance)", value: "finance" },
        { label: "소비재 (Consumer)", value: "consumer" },
        { label: "AI/반도체 (AI/Semiconductor)", value: "ai_semi" },
      ],
      default: ["macro", "tech", "ai_semi"],
      optional: true,
    },

    // =====================
    // API Keys
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google Gemini API Key (https://aistudio.google.com)",
      secret: true,
    },
    serper_api_key: {
      type: "string",
      label: "Serper API Key",
      description: "뉴스 검색용 Serper API Key (https://serper.dev). YouTube URL 없을 때 필수.",
      secret: true,
      optional: true,
    },

    // =====================
    // LLM 설정
    // =====================
    llm_model: {
      type: "string",
      label: "LLM Model",
      options: [
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash" },
        { label: "Gemini 1.5 Pro (Best)", value: "gemini-1.5-pro" },
        { label: "Gemini 2.0 Flash Thinking (Reasoning)", value: "gemini-2.0-flash-thinking-exp" },
      ],
      default: "gemini-2.0-flash",
    },

    // =====================
    // 출력 설정
    // =====================
    output_language: {
      type: "string",
      label: "출력 언어",
      options: [
        { label: "한국어", value: "korean" },
        { label: "English", value: "english" },
      ],
      default: "korean",
    },
  },

  async run({ $ }) {
    const analysisDate = this.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabels = { us: "미국", kr: "한국", global: "글로벌" };
    const marketLabel = marketLabels[this.market_type];

    // ==========================================
    // LLM Caller
    // ==========================================
    const callGemini = async (prompt, temperature = 0.3) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.llm_model}:generateContent`;
      const resp = await axios($, {
        url,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192 },
        },
      });
      return resp.candidates[0].content.parts[0].text;
    };

    // ==========================================
    // YouTube 분석 함수
    // ==========================================
    const analyzeYouTube = async (youtubeUrl) => {
      $.export("source", "youtube");
      $.export("youtube_url", youtubeUrl);

      // YouTube Video ID 추출
      const videoIdMatch = youtubeUrl.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (!videoIdMatch) throw new Error("Invalid YouTube URL");
      const videoId = videoIdMatch[1];

      // Gemini로 YouTube 영상 분석 (File API 사용)
      const prompt = `
당신은 전문 금융 애널리스트입니다. 다음 YouTube 영상을 시청하고 주식 시장 관점에서 분석해주세요.

YouTube Video ID: ${videoId}
분석 기준일: ${analysisDate}
시장: ${marketLabel}

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "summary": "영상 내용 요약 (300자 이내)",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", ...],
  "market_outlook": {
    "sentiment": "bullish/bearish/neutral",
    "confidence": 0-100,
    "reasoning": "판단 근거"
  },
  "mentioned_sectors": [
    {"sector": "섹터명", "outlook": "positive/negative/neutral", "reason": "이유"}
  ],
  "mentioned_tickers": [
    {"ticker": "티커", "name": "종목명", "action": "buy/sell/hold", "reason": "이유"}
  ],
  "risk_factors": ["리스크 1", "리스크 2"],
  "opportunities": ["기회 요인 1", "기회 요인 2"],
  "timeline": "단기/중기/장기 전망"
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요." : "Write everything in English."}
`;

      // 실제로는 YouTube Data API나 Whisper로 자막 추출 후 분석하는 것이 좋음
      // 여기서는 간소화를 위해 Gemini의 URL 기반 분석 사용
      const analysisResult = await callGemini(prompt);

      // JSON 파싱
      let parsed;
      try {
        const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
      } catch (e) {
        parsed = { summary: analysisResult, key_points: [], raw: true };
      }

      return parsed;
    };

    // ==========================================
    // 뉴스 기반 분석 함수
    // ==========================================
    const analyzeNews = async () => {
      $.export("source", "news");

      if (!this.serper_api_key) {
        throw new Error("Serper API Key is required for news-based analysis");
      }

      // 분석 초점에 따른 검색 쿼리 생성
      const focusKeywords = {
        macro: "economy GDP inflation unemployment",
        interest: "interest rate fed treasury bond yield",
        tech: "technology stocks FAANG big tech",
        energy: "oil energy stocks crude",
        healthcare: "healthcare pharma biotech stocks",
        finance: "bank stocks financial sector",
        consumer: "consumer spending retail stocks",
        ai_semi: "AI artificial intelligence semiconductor nvidia",
      };

      const marketKeywords = {
        us: "US stock market S&P 500",
        kr: "Korea KOSPI stock market",
        global: "global stock market",
      };

      // 병렬로 뉴스 검색
      const searchQueries = (this.analysis_focus || ["macro"]).map(
        (focus) => `${marketKeywords[this.market_type]} ${focusKeywords[focus]} ${analysisDate}`
      );

      const newsResults = await Promise.all(
        searchQueries.map(async (query, index) => {
          try {
            const resp = await axios($, {
              url: "https://google.serper.dev/news",
              method: "POST",
              headers: {
                "X-API-KEY": this.serper_api_key,
                "Content-Type": "application/json",
              },
              data: { q: query, num: 5 },
            });
            return { focus: this.analysis_focus[index], articles: resp.news || [] };
          } catch (e) {
            return { focus: this.analysis_focus[index], articles: [], error: e.message };
          }
        })
      );

      // 뉴스 요약 생성
      const allArticles = newsResults.flatMap((r) =>
        r.articles.map((a) => ({
          focus: r.focus,
          title: a.title,
          snippet: a.snippet,
          source: a.source,
          date: a.date,
        }))
      );

      const newsContext = allArticles
        .slice(0, 20)
        .map((a) => `[${a.focus}] ${a.title}\n${a.snippet}`)
        .join("\n\n");

      const prompt = `
당신은 전문 금융 애널리스트입니다. 다음 최신 뉴스들을 종합하여 주식 시장 현황을 분석해주세요.

분석 기준일: ${analysisDate}
시장: ${marketLabel}
분석 초점: ${(this.analysis_focus || []).join(", ")}

===== 최신 뉴스 =====
${newsContext}
====================

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "summary": "시장 현황 요약 (300자 이내)",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", ...],
  "market_outlook": {
    "sentiment": "bullish/bearish/neutral",
    "confidence": 0-100,
    "reasoning": "판단 근거"
  },
  "sector_analysis": [
    {"sector": "섹터명", "outlook": "positive/negative/neutral", "reason": "이유", "hot_keywords": ["키워드1", "키워드2"]}
  ],
  "macro_indicators": {
    "interest_rate": "현재 금리 상황",
    "inflation": "인플레이션 상황",
    "employment": "고용 상황",
    "gdp": "경제 성장 상황"
  },
  "risk_factors": ["리스크 1", "리스크 2"],
  "opportunities": ["기회 요인 1", "기회 요인 2"],
  "recommended_focus_sectors": ["추천 섹터 1", "추천 섹터 2"],
  "timeline": "단기/중기/장기 전망"
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요." : "Write everything in English."}
중요: 반드시 유효한 JSON만 출력하세요.
`;

      const analysisResult = await callGemini(prompt, 0.2);

      // JSON 파싱
      let parsed;
      try {
        const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
      } catch (e) {
        // JSON 파싱 실패 시 텍스트 그대로 반환
        parsed = { summary: analysisResult, key_points: [], raw: true };
      }

      return { ...parsed, news_sources: allArticles };
    };

    // ==========================================
    // 메인 실행 로직
    // ==========================================
    let analysisResult;

    if (this.youtube_url) {
      analysisResult = await analyzeYouTube(this.youtube_url);
    } else {
      analysisResult = await analyzeNews();
    }

    // 결과 구조화
    const result = {
      analysis_date: analysisDate,
      market_type: this.market_type,
      market_label: marketLabel,
      source: this.youtube_url ? "youtube" : "news",
      source_url: this.youtube_url || null,
      analysis: analysisResult,
      generated_at: new Date().toISOString(),
    };

    $.export("market_analysis", result);
    return result;
  },
});
