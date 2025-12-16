import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Sector Analyzer",
  description: "섹터 전망 분석기 - 시장 현황 분석 기반 유망 섹터 추천",

  props: {
    // =====================
    // 이전 단계 데이터
    // =====================
    market_analysis_output: {
      type: "string",
      label: "Market Analysis Output (JSON)",
      description: "{{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}",
      optional: true,
    },

    // =====================
    // 수동 입력 (market_analysis_output 없을 때)
    // =====================
    manual_market_summary: {
      type: "string",
      label: "수동 시장 요약 (Optional)",
      description: "이전 단계 데이터가 없을 때 직접 시장 현황을 입력하세요.",
      optional: true,
    },
    market_type: {
      type: "string",
      label: "시장 유형",
      options: [
        { label: "미국 (US Market)", value: "us" },
        { label: "한국 (Korean Market)", value: "kr" },
        { label: "글로벌 (Global)", value: "global" },
      ],
      default: "us",
      optional: true,
    },

    // =====================
    // 분석 설정
    // =====================
    num_sectors: {
      type: "integer",
      label: "추천 섹터 수",
      description: "추천할 유망 섹터 개수",
      default: 5,
      optional: true,
    },
    investment_horizon: {
      type: "string",
      label: "투자 기간",
      options: [
        { label: "단기 (1-3개월)", value: "short" },
        { label: "중기 (3-6개월)", value: "medium" },
        { label: "장기 (6개월 이상)", value: "long" },
      ],
      default: "medium",
    },
    risk_tolerance: {
      type: "string",
      label: "리스크 성향",
      options: [
        { label: "보수적 (Conservative)", value: "conservative" },
        { label: "중립 (Moderate)", value: "moderate" },
        { label: "공격적 (Aggressive)", value: "aggressive" },
      ],
      default: "moderate",
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
      description: "섹터별 추가 뉴스 검색용 (Optional)",
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
    let marketData = null;
    if (this.market_analysis_output) {
      try {
        marketData = typeof this.market_analysis_output === "string"
          ? JSON.parse(this.market_analysis_output)
          : this.market_analysis_output;
      } catch (e) {
        console.log("Failed to parse market_analysis_output:", e.message);
      }
    }

    const marketType = marketData?.market_type || this.market_type || "us";
    const marketLabels = { us: "미국", kr: "한국", global: "글로벌" };
    const marketLabel = marketLabels[marketType];
    const analysisDate = marketData?.analysis_date || new Date().toISOString().split("T")[0];

    // 시장 현황 요약
    const marketSummary = marketData?.analysis?.summary || this.manual_market_summary || "";
    const marketOutlook = marketData?.analysis?.market_outlook || {};
    const sectorAnalysis = marketData?.analysis?.sector_analysis || [];
    const recommendedSectors = marketData?.analysis?.recommended_focus_sectors || [];

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
    // 섹터별 추가 리서치 (Optional)
    // ==========================================
    const fetchSectorNews = async (sectors) => {
      if (!this.serper_api_key || sectors.length === 0) return [];

      const results = await Promise.all(
        sectors.slice(0, 5).map(async (sector, index) => {
          try {
            const query = `${sector} sector stocks ${marketType === "kr" ? "Korea" : "US"} outlook 2024`;
            const resp = await axios($, {
              url: "https://google.serper.dev/news",
              method: "POST",
              headers: {
                "X-API-KEY": this.serper_api_key,
                "Content-Type": "application/json",
              },
              data: { q: query, num: 3 },
            });
            return { index, sector, news: resp.news || [] };
          } catch (e) {
            return { index, sector, news: [], error: e.message };
          }
        })
      );

      return results.sort((a, b) => a.index - b.index);
    };

    // ==========================================
    // 섹터 전망 분석
    // ==========================================
    const investmentHorizonLabels = {
      short: "단기 (1-3개월)",
      medium: "중기 (3-6개월)",
      long: "장기 (6개월 이상)",
    };
    const riskLabels = {
      conservative: "보수적",
      moderate: "중립",
      aggressive: "공격적",
    };

    // 섹터별 뉴스 가져오기
    const sectorNews = await fetchSectorNews(recommendedSectors);
    const sectorNewsContext = sectorNews
      .map((s) => `\n[${s.sector}]\n${s.news.map((n) => `- ${n.title}`).join("\n")}`)
      .join("\n");

    const prompt = `
당신은 전문 섹터 애널리스트입니다. 다음 시장 현황을 바탕으로 유망 섹터를 분석하고 추천해주세요.

===== 시장 현황 =====
분석 기준일: ${analysisDate}
시장: ${marketLabel}
시장 전망: ${marketOutlook.sentiment || "N/A"} (신뢰도: ${marketOutlook.confidence || "N/A"}%)
시장 요약: ${marketSummary}

기존 섹터 분석:
${sectorAnalysis.map((s) => `- ${s.sector}: ${s.outlook} (${s.reason})`).join("\n")}

추가 섹터 뉴스:
${sectorNewsContext || "없음"}
====================

===== 투자자 프로필 =====
투자 기간: ${investmentHorizonLabels[this.investment_horizon]}
리스크 성향: ${riskLabels[this.risk_tolerance]}
====================

다음 JSON 형식으로 ${this.num_sectors}개의 유망 섹터를 추천해주세요:
\`\`\`json
{
  "analysis_summary": "전체 섹터 분석 요약 (200자)",
  "recommended_sectors": [
    {
      "rank": 1,
      "sector_name": "섹터명",
      "sector_name_en": "Sector Name in English",
      "outlook_score": 85,
      "outlook": "positive/neutral/negative",
      "confidence": 80,
      "thesis": "투자 논거 (왜 이 섹터인가)",
      "catalysts": ["촉매 1", "촉매 2"],
      "risks": ["리스크 1", "리스크 2"],
      "key_themes": ["테마 1", "테마 2"],
      "representative_etfs": ["ETF 티커 1", "ETF 티커 2"],
      "expected_return": "예상 수익률 범위 (예: 10-20%)",
      "time_horizon": "추천 보유 기간"
    }
  ],
  "sectors_to_avoid": [
    {
      "sector_name": "피해야 할 섹터",
      "reason": "이유"
    }
  ],
  "market_rotation_signal": {
    "current_phase": "확장/정점/수축/저점",
    "rotation_direction": "성장주→가치주 등",
    "explanation": "설명"
  },
  "macro_considerations": ["고려사항 1", "고려사항 2"]
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요. (ETF 티커, 영문명 제외)" : "Write everything in English."}
중요: 반드시 유효한 JSON만 출력하세요.
`;

    const analysisResult = await callGemini(prompt, 0.25);

    // JSON 파싱
    let parsed;
    try {
      const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
    } catch (e) {
      parsed = { analysis_summary: analysisResult, recommended_sectors: [], raw: true };
    }

    // 결과 구조화
    const result = {
      analysis_date: analysisDate,
      market_type: marketType,
      market_label: marketLabel,
      investment_profile: {
        horizon: this.investment_horizon,
        risk_tolerance: this.risk_tolerance,
      },
      input_market_outlook: marketOutlook,
      sector_analysis: parsed,
      generated_at: new Date().toISOString(),
    };

    $.export("sector_analysis", result);
    return result;
  },
});
