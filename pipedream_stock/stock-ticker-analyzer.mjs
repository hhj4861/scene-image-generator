import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Ticker Analyzer",
  description: "종목 분석기 - 섹터 전망 기반 수급 동향 좋은 종목 추천",

  props: {
    // =====================
    // 이전 단계 데이터
    // =====================
    sector_analysis_output: {
      type: "string",
      label: "Sector Analysis Output (JSON)",
      description: "{{JSON.stringify(steps.Stock_Sector_Analyzer.$return_value)}}",
      optional: true,
    },
    market_analysis_output: {
      type: "string",
      label: "Market Analysis Output (JSON)",
      description: "{{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}",
      optional: true,
    },

    // =====================
    // 수동 입력 (이전 단계 없을 때)
    // =====================
    manual_sectors: {
      type: "string[]",
      label: "수동 섹터 입력 (Optional)",
      description: "분석할 섹터 직접 입력. 예: Technology, Healthcare",
      optional: true,
    },
    market_type: {
      type: "string",
      label: "시장 유형",
      options: [
        { label: "미국 (US Market)", value: "us" },
        { label: "한국 (Korean Market)", value: "kr" },
      ],
      default: "us",
      optional: true,
    },

    // =====================
    // 분석 설정
    // =====================
    num_tickers: {
      type: "integer",
      label: "추천 종목 수",
      description: "섹터당 추천할 종목 개수 (3-5개)",
      default: 3,
      optional: true,
    },
    analysis_criteria: {
      type: "string[]",
      label: "분석 기준",
      description: "종목 선정 시 중점 기준",
      options: [
        { label: "수급 동향 (기관/외인 매수)", value: "flow" },
        { label: "실적 모멘텀", value: "earnings" },
        { label: "밸류에이션", value: "valuation" },
        { label: "기술적 분석 (차트)", value: "technical" },
        { label: "성장성", value: "growth" },
        { label: "배당", value: "dividend" },
      ],
      default: ["flow", "earnings", "growth"],
      optional: true,
    },
    market_cap_preference: {
      type: "string",
      label: "시가총액 선호",
      options: [
        { label: "대형주 위주", value: "large" },
        { label: "중형주 포함", value: "mid" },
        { label: "소형주 포함", value: "small" },
        { label: "무관", value: "any" },
      ],
      default: "large",
      optional: true,
    },

    // =====================
    // API Keys
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      secret: true,
    },
    serper_api_key: {
      type: "string",
      label: "Serper API Key",
      description: "종목별 뉴스 및 수급 정보 검색용",
      secret: true,
      optional: true,
    },
    fmp_api_key: {
      type: "string",
      label: "Financial Modeling Prep API Key",
      description: "실시간 주가 및 재무 데이터용 (https://financialmodelingprep.com)",
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
    // ==========================================
    // 이전 단계 데이터 파싱
    // ==========================================
    let sectorData = null;
    let marketData = null;

    if (this.sector_analysis_output) {
      try {
        sectorData = typeof this.sector_analysis_output === "string"
          ? JSON.parse(this.sector_analysis_output)
          : this.sector_analysis_output;
      } catch (e) {
        console.log("Failed to parse sector_analysis_output:", e.message);
      }
    }

    if (this.market_analysis_output) {
      try {
        marketData = typeof this.market_analysis_output === "string"
          ? JSON.parse(this.market_analysis_output)
          : this.market_analysis_output;
      } catch (e) {
        console.log("Failed to parse market_analysis_output:", e.message);
      }
    }

    const marketType = sectorData?.market_type || marketData?.market_type || this.market_type || "us";
    const marketLabels = { us: "미국", kr: "한국" };
    const marketLabel = marketLabels[marketType];
    const analysisDate = sectorData?.analysis_date || marketData?.analysis_date || new Date().toISOString().split("T")[0];

    // 분석할 섹터 추출
    const recommendedSectors = sectorData?.sector_analysis?.recommended_sectors || [];
    const targetSectors = recommendedSectors.length > 0
      ? recommendedSectors.slice(0, 3).map((s) => ({
          name: s.sector_name,
          name_en: s.sector_name_en,
          thesis: s.thesis,
          catalysts: s.catalysts,
        }))
      : (this.manual_sectors || ["Technology"]).map((s) => ({ name: s, name_en: s, thesis: "", catalysts: [] }));

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
    // 종목별 뉴스/수급 정보 검색
    // ==========================================
    const searchTickerInfo = async (sector) => {
      if (!this.serper_api_key) return { sector, news: [] };

      try {
        const query = marketType === "kr"
          ? `${sector.name} 관련주 수급 기관 외인 매수 2024`
          : `${sector.name_en} sector stocks institutional buying flow 2024`;

        const resp = await axios($, {
          url: "https://google.serper.dev/news",
          method: "POST",
          headers: {
            "X-API-KEY": this.serper_api_key,
            "Content-Type": "application/json",
          },
          data: { q: query, num: 5 },
        });
        return { sector, news: resp.news || [] };
      } catch (e) {
        return { sector, news: [], error: e.message };
      }
    };

    // ==========================================
    // FMP API로 섹터 종목 데이터 가져오기 (Optional)
    // ==========================================
    const fetchSectorStocks = async (sectorName) => {
      if (!this.fmp_api_key) return [];

      try {
        // 섹터별 스크리닝
        const resp = await axios($, {
          url: `https://financialmodelingprep.com/api/v3/stock-screener`,
          method: "GET",
          params: {
            sector: sectorName,
            marketCapMoreThan: this.market_cap_preference === "large" ? 10000000000 : 1000000000,
            limit: 20,
            apikey: this.fmp_api_key,
          },
        });
        return resp.slice(0, 10);
      } catch (e) {
        return [];
      }
    };

    // ==========================================
    // 섹터별 종목 분석 (병렬)
    // ==========================================
    const analysisCriteriaLabels = {
      flow: "수급 동향 (기관/외인 매수)",
      earnings: "실적 모멘텀",
      valuation: "밸류에이션",
      technical: "기술적 분석",
      growth: "성장성",
      dividend: "배당",
    };

    const criteriaText = (this.analysis_criteria || ["flow"])
      .map((c) => analysisCriteriaLabels[c])
      .join(", ");

    // 병렬로 섹터별 정보 수집
    const sectorInfoPromises = targetSectors.map((sector, index) =>
      Promise.all([
        searchTickerInfo(sector),
        fetchSectorStocks(sector.name_en),
      ]).then(([newsResult, stockData]) => ({
        index,
        sector,
        news: newsResult.news,
        stocks: stockData,
      }))
    );

    const sectorInfoResults = await Promise.all(sectorInfoPromises);
    const sortedSectorInfo = sectorInfoResults.sort((a, b) => a.index - b.index);

    // 각 섹터별로 종목 분석 수행 (병렬)
    const sectorAnalysisPromises = sortedSectorInfo.map(async (info, idx) => {
      const { sector, news, stocks } = info;

      const newsContext = news.slice(0, 5).map((n) => `- ${n.title}`).join("\n");
      const stockContext = stocks.slice(0, 10).map((s) => `${s.symbol}: ${s.companyName}`).join(", ");

      const prompt = `
당신은 전문 주식 애널리스트입니다. 다음 섹터에서 ${this.num_tickers}개의 유망 종목을 추천해주세요.

===== 섹터 정보 =====
섹터: ${sector.name} (${sector.name_en})
시장: ${marketLabel}
투자 논거: ${sector.thesis || "N/A"}
촉매: ${(sector.catalysts || []).join(", ") || "N/A"}

관련 뉴스:
${newsContext || "없음"}

${stockContext ? `섹터 내 주요 종목: ${stockContext}` : ""}
====================

===== 분석 기준 =====
중점 분석 기준: ${criteriaText}
시가총액 선호: ${this.market_cap_preference}
분석 기준일: ${analysisDate}
====================

다음 JSON 형식으로 ${this.num_tickers}개 종목을 추천해주세요:
\`\`\`json
{
  "sector_name": "${sector.name}",
  "sector_summary": "섹터 내 종목 분석 요약",
  "recommended_tickers": [
    {
      "rank": 1,
      "ticker": "티커 심볼",
      "company_name": "회사명",
      "company_name_kr": "한글 회사명",
      "recommendation": "Strong Buy/Buy/Hold",
      "score": 85,
      "current_price_estimate": "현재 추정가",
      "target_price": "목표가",
      "upside_potential": "상승 여력 (%)",
      "investment_thesis": "투자 논거",
      "flow_analysis": {
        "institutional": "기관 수급 동향",
        "foreign": "외인 수급 동향",
        "retail": "개인 수급 동향"
      },
      "fundamentals": {
        "market_cap": "시가총액",
        "pe_ratio": "PER",
        "revenue_growth": "매출 성장률",
        "earnings_growth": "이익 성장률"
      },
      "catalysts": ["촉매 1", "촉매 2"],
      "risks": ["리스크 1", "리스크 2"],
      "entry_strategy": "진입 전략",
      "stop_loss": "손절 기준"
    }
  ],
  "sector_etf_alternative": {
    "ticker": "섹터 ETF 티커",
    "name": "ETF 이름",
    "reason": "개별 종목 대신 ETF 추천 이유"
  }
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요. (티커, ETF명 제외)" : "Write everything in English."}
중요:
- 반드시 유효한 JSON만 출력하세요.
- 수급 동향이 양호한 종목을 우선 추천하세요.
- ${marketType === "kr" ? "한국 시장 종목(KOSPI, KOSDAQ)을 추천하세요." : "미국 시장 종목(NYSE, NASDAQ)을 추천하세요."}
`;

      const result = await callGemini(prompt, 0.25);

      let parsed;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : result);
      } catch (e) {
        parsed = { sector_name: sector.name, recommended_tickers: [], raw: result };
      }

      return { index: idx, ...parsed };
    });

    const tickerAnalysisResults = await Promise.all(sectorAnalysisPromises);
    const sortedResults = tickerAnalysisResults.sort((a, b) => a.index - b.index);

    // ==========================================
    // 최종 종합 분석
    // ==========================================
    const allTickers = sortedResults.flatMap((r) =>
      (r.recommended_tickers || []).map((t) => ({
        ...t,
        sector: r.sector_name,
      }))
    );

    // 상위 종목 종합 순위
    const topPicks = allTickers
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);

    // 결과 구조화
    const result = {
      analysis_date: analysisDate,
      market_type: marketType,
      market_label: marketLabel,
      analysis_criteria: this.analysis_criteria,
      sector_analyses: sortedResults.map(({ index, ...rest }) => rest),
      top_picks: topPicks,
      summary: {
        total_sectors_analyzed: sortedResults.length,
        total_tickers_recommended: allTickers.length,
        strongest_conviction: topPicks[0] || null,
      },
      generated_at: new Date().toISOString(),
    };

    $.export("ticker_analysis", result);
    return result;
  },
});
