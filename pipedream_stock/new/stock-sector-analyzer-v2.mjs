import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Sector Analyzer",
  description: "섹터 전망 분석기 - YouTube 영상 분석 결과 또는 시장 현황 기반 유망 섹터 추천",

  props: {
    // =====================
    // 이전 단계 데이터
    // =====================
    market_analysis_output: {
      type: "string",
      label: "Market Analysis Output (JSON)",
      description: "Stock Market Analyzer 결과: {{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}",
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
        { label: "자동 (섹터별 적정 기간 추천)", value: "auto" },
        { label: "단기 (1-3개월)", value: "short" },
        { label: "중기 (3-6개월)", value: "medium" },
        { label: "장기 (6개월 이상)", value: "long" },
      ],
      default: "auto",
      description: "auto 선택 시 각 섹터별로 최적의 투자 기간을 추천합니다",
      optional: true,
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
      description: "Google AI Studio에서 발급 (https://aistudio.google.com)",
      secret: true,
      optional: true,
    },
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key",
      description: "OpenAI Platform에서 발급 (https://platform.openai.com) - GPT-4o 사용 시 필요",
      secret: true,
      optional: true,
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
        { label: "🤖 자동 선택 (정확도 우선)", value: "auto" },
        { label: "🔵 GPT-4o (최고 정확도, $$$)", value: "gpt-4o" },
        { label: "🔵 GPT-4o-mini (균형, $$)", value: "gpt-4o-mini" },
        { label: "🟢 Gemini 3 Pro (최신, 최강, $$$$)", value: "gemini-3-pro-preview" },
        { label: "🟢 Gemini 2.5 Pro (정식, 정확, $$$)", value: "gemini-2.5-pro" },
        { label: "🟢 Gemini 2.5 Flash (정식, 빠름, $$)", value: "gemini-2.5-flash" },
        { label: "🟢 Gemini 2.0 Flash (빠름, $)", value: "gemini-2.0-flash" },
        { label: "🟢 Gemini 2.0 Flash-Lite (최저가, $)", value: "gemini-2.0-flash-lite" },
        { label: "⚪ Gemini 1.5 Pro (레거시, $$)", value: "gemini-1.5-pro" },
      ],
      default: "auto",
      description: "🔵=OpenAI, 🟢=Gemini, auto: GPT-4o > Gemini 3 Pro > Gemini 2.5 Pro",
    },
    llm_priority: {
      type: "string",
      label: "LLM 우선순위",
      options: [
        { label: "정확도 우선 (비용 높음)", value: "accuracy" },
        { label: "균형 (정확도 + 비용)", value: "balanced" },
        { label: "비용 우선 (저렴)", value: "cost" },
      ],
      default: "balanced",
      description: "auto 모드에서 모델 선택 기준",
      optional: true,
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

    // ==========================================
    // ★ Weekly Outlook 모드: 섹터 분석 스킵
    // ==========================================
    if (marketData?.skip_ticker_analysis === true) {
      const skipReason = marketData?.key_points_structure === "weekly_outlook" 
        ? "Weekly Outlook 모드 - 섹터 분석 불필요" 
        : "Market Analyzer에서 섹터 분석 스킵 플래그 설정됨";
      console.log(`⏭️ [SKIP] ${skipReason}`);
      
      const skipResult = {
        skipped: true,
        skip_reason: skipReason,
        key_points_structure: marketData?.key_points_structure,
        analysis_date: marketData?.analysis_date || new Date().toISOString().split("T")[0],
        market_type: marketData?.market_type,
        recommended_sectors: [],
        sectors: [],
      };
      $.export("sector_analysis", skipResult);
      return skipResult;
    }

    const marketType = marketData?.market_type || this.market_type || "us";
    const marketLabels = { us: "미국", kr: "한국", global: "글로벌" };
    const marketLabel = marketLabels[marketType];
    const analysisDate = marketData?.analysis_date || new Date().toISOString().split("T")[0];

    // 시장 현황 요약 (YouTube 분석 결과 포함)
    const analysis = marketData?.analysis || {};
    const marketSummary = analysis.summary || this.manual_market_summary || "";
    const marketOutlook = analysis.market_outlook || {};
    const keyPoints = analysis.key_points || [];
    const mentionedSectors = analysis.mentioned_sectors || analysis.sector_analysis || [];
    const mentionedTickers = analysis.mentioned_tickers || [];
    const riskFactors = analysis.risk_factors || [];
    const opportunities = analysis.opportunities || [];
    const recommendedSectors = analysis.recommended_focus_sectors || [];

    // YouTube 분석 메타데이터
    const videoInfo = analysis.video_info || {};
    const transcriptMethod = videoInfo.transcript_method || marketData?.source || "unknown";

    $.export("input_source", transcriptMethod);
    $.export("video_info", videoInfo);

    // ==========================================
    // LLM 모델 정확도/비용 정보
    // ==========================================
    const MODEL_INFO = {
      // OpenAI
      "gpt-4o": { provider: "openai", accuracy: 95, cost: 5, speed: 3 },
      "gpt-4o-mini": { provider: "openai", accuracy: 85, cost: 2, speed: 4 },
      // Gemini 3 (최신)
      "gemini-3-pro-preview": { provider: "gemini", accuracy: 97, cost: 6, speed: 2 },
      // Gemini 2.5 (정식)
      "gemini-2.5-pro": { provider: "gemini", accuracy: 93, cost: 4, speed: 3 },
      "gemini-2.5-flash": { provider: "gemini", accuracy: 85, cost: 2, speed: 4 },
      // Gemini 2.0
      "gemini-2.0-flash": { provider: "gemini", accuracy: 78, cost: 1, speed: 5 },
      "gemini-2.0-flash-lite": { provider: "gemini", accuracy: 72, cost: 0.5, speed: 5 },
      // Gemini 1.5 (레거시)
      "gemini-1.5-pro": { provider: "gemini", accuracy: 88, cost: 3, speed: 3 },
    };

    // 자동 모델 선택 로직
    const selectBestModel = () => {
      const priority = this.llm_priority || "balanced";
      const hasOpenAI = !!this.openai_api_key;
      const hasGemini = !!this.gemini_api_key;

      const availableModels = Object.entries(MODEL_INFO)
        .filter(([_, info]) => {
          if (info.provider === "openai" && !hasOpenAI) return false;
          if (info.provider === "gemini" && !hasGemini) return false;
          return true;
        })
        .map(([model, info]) => ({ model, ...info }));

      if (availableModels.length === 0) {
        throw new Error("사용 가능한 LLM API 키가 없습니다. gemini_api_key 또는 openai_api_key를 설정하세요.");
      }

      let sortedModels;
      const MIN_ACCURACY_FOR_BALANCED = 80; // balanced 모드 최소 정확도
      
      switch (priority) {
        case "accuracy":
          // 정확도 높은 순
          sortedModels = availableModels.sort((a, b) => b.accuracy - a.accuracy);
          break;
        case "cost":
          // 비용 낮은 순
          sortedModels = availableModels.sort((a, b) => a.cost - b.cost);
          break;
        case "balanced":
        default:
          // 정확도/비용 비율, 단 최소 정확도 80 이상만
          const qualifiedModels = availableModels.filter(m => m.accuracy >= MIN_ACCURACY_FOR_BALANCED);
          sortedModels = (qualifiedModels.length > 0 ? qualifiedModels : availableModels)
            .sort((a, b) => (b.accuracy / b.cost) - (a.accuracy / a.cost));
          break;
      }

      const selected = sortedModels[0];
      console.log(`[LLM] Auto-selected: ${selected.model} (accuracy: ${selected.accuracy}, cost: ${selected.cost}, priority: ${priority})`);
      return selected.model;
    };

    const resolvedModel = this.llm_model === "auto" ? selectBestModel() : this.llm_model;
    const modelInfo = MODEL_INFO[resolvedModel] || { provider: "gemini", accuracy: 80, cost: 1 };
    
    console.log(`[LLM] Using model: ${resolvedModel} (provider: ${modelInfo.provider})`);
    $.export("llm_model_used", { model: resolvedModel, ...modelInfo });

    // ==========================================
    // LLM Caller - Gemini
    // ==========================================
    const callGemini = async (prompt, temperature = 0.3, model = resolvedModel) => {
      if (!this.gemini_api_key) throw new Error("Gemini API Key가 필요합니다.");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
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
    // LLM Caller - OpenAI
    // ==========================================
    const callOpenAI = async (prompt, temperature = 0.3, model = resolvedModel) => {
      if (!this.openai_api_key) throw new Error("OpenAI API Key가 필요합니다.");
      const resp = await axios($, {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openai_api_key}`,
        },
        data: {
          model: model,
          messages: [
            { role: "system", content: "You are a professional sector analyst. Always respond with valid JSON when requested." },
            { role: "user", content: prompt },
          ],
          temperature,
          max_tokens: 8192,
        },
      });
      return resp.choices[0].message.content;
    };

    // ==========================================
    // 통합 LLM 호출 함수
    // ==========================================
    const callLLM = async (prompt, temperature = 0.3) => {
      const provider = modelInfo.provider;
      const startTime = Date.now();
      
      try {
        let result;
        if (provider === "openai") {
          result = await callOpenAI(prompt, temperature, resolvedModel);
        } else {
          result = await callGemini(prompt, temperature, resolvedModel);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`[LLM] Response received in ${elapsed}ms (model: ${resolvedModel})`);
        return result;
      } catch (error) {
        console.error(`[LLM] Error with ${resolvedModel}: ${error.message}`);
        
        // Fallback
        if (provider === "openai" && this.gemini_api_key) {
          console.log("[LLM] Falling back to Gemini...");
          return await callGemini(prompt, temperature, "gemini-2.0-flash");
        } else if (provider === "gemini" && this.openai_api_key) {
          console.log("[LLM] Falling back to OpenAI...");
          return await callOpenAI(prompt, temperature, "gpt-4o-mini");
        }
        throw error;
      }
    };

    // ==========================================
    // 섹터별 추가 리서치 (Optional)
    // ==========================================
    const fetchSectorNews = async (sectors) => {
      if (!this.serper_api_key || sectors.length === 0) return [];

      // mentionedSectors에서 섹터명 추출
      const sectorNames = sectors.map(s => typeof s === 'string' ? s : s.sector || s.sector_name);

      const results = await Promise.all(
        sectorNames.slice(0, 5).map(async (sector, index) => {
          try {
            const query = `${sector} sector stocks ${marketType === "kr" ? "Korea" : "US"} outlook ${new Date().getFullYear()}`;
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
      auto: "자동 (섹터별 적정 기간 추천)",
      short: "단기 (1-3개월)",
      medium: "중기 (3-6개월)",
      long: "장기 (6개월 이상)",
    };
    const riskLabels = {
      conservative: "보수적",
      moderate: "중립",
      aggressive: "공격적",
    };
    
    const investmentHorizon = this.investment_horizon || "auto";
    const isAutoHorizon = investmentHorizon === "auto";

    // 섹터별 뉴스 가져오기
    const sectorNews = await fetchSectorNews(mentionedSectors);
    const sectorNewsContext = sectorNews
      .map((s) => `\n[${s.sector}]\n${s.news.map((n) => `- ${n.title}`).join("\n")}`)
      .join("\n");

    // 영상 정보 컨텍스트
    const videoContext = videoInfo.title
      ? `\n분석 소스: YouTube 영상\n영상 제목: ${videoInfo.title}\n채널: ${videoInfo.author}\n분석 방식: ${transcriptMethod === 'whisper' ? 'Whisper STT' : 'YouTube 자막'}`
      : "";

    const prompt = `
당신은 전문 섹터 애널리스트입니다. 다음 시장 현황을 바탕으로 유망 섹터를 분석하고 추천해주세요.

===== 시장 현황 =====
분석 기준일: ${analysisDate}
시장: ${marketLabel}${videoContext}
시장 전망: ${marketOutlook.sentiment || "N/A"} (신뢰도: ${marketOutlook.confidence || "N/A"}%)

시장 요약:
${marketSummary}

핵심 포인트:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

언급된 섹터:
${mentionedSectors.map((s) => {
  if (typeof s === 'string') return `- ${s}`;
  return `- ${s.sector}: ${s.outlook} (${s.reason})`;
}).join("\n")}

언급된 종목:
${mentionedTickers.map((t) => `- ${t.ticker} (${t.name}): ${t.action} - ${t.reason}`).join("\n")}

리스크 요인:
${riskFactors.map((r) => `- ${r}`).join("\n")}

기회 요인:
${opportunities.map((o) => `- ${o}`).join("\n")}

추가 섹터 뉴스:
${sectorNewsContext || "없음"}
====================

===== 투자자 프로필 =====
투자 기간: ${isAutoHorizon ? "자동 (각 섹터별로 적정 투자 기간을 추천해주세요)" : investmentHorizonLabels[investmentHorizon]}
리스크 성향: ${riskLabels[this.risk_tolerance]}
====================

다음 JSON 형식으로 ${this.num_sectors}개의 유망 섹터를 추천해주세요:

★★★ 중요: 추천 섹터 선정 기준 ★★★
1. outlook이 반드시 "positive"인 섹터만 추천하세요
2. outlook_score가 70 이상인 섹터만 추천하세요
3. expected_return이 최소 5% 이상인 섹터만 추천하세요
4. neutral 또는 negative outlook 섹터는 "sectors_to_avoid"에 포함하세요
5. 영상에서 언급되었더라도 전망이 불확실하면 추천하지 마세요
${isAutoHorizon ? `6. ★ 각 섹터별로 적합한 투자 기간(time_horizon)을 분석하여 추천하세요:
   - 모멘텀/테마주: 단기 (1-3개월)
   - 실적 개선 섹터: 중기 (3-6개월)
   - 구조적 성장 섹터: 장기 (6개월 이상)` : ""}

\`\`\`json
{
  "analysis_summary": "전체 섹터 분석 요약 (200자)",
  "recommended_sectors": [
    {
      "rank": 1,
      "sector_name": "섹터명",
      "sector_name_en": "Sector Name in English",
      "outlook_score": 85,
      "outlook": "positive",
      "confidence": 80,
      "thesis": "투자 논거 (왜 이 섹터인가)",
      "catalysts": ["촉매 1", "촉매 2"],
      "risks": ["리스크 1", "리스크 2"],
      "key_themes": ["테마 1", "테마 2"],
      "representative_etfs": ["ETF 티커 1", "ETF 티커 2"],
      "representative_stocks": ["종목 티커 1", "종목 티커 2"],
      "expected_return": "예상 수익률 범위 (예: 10-20%)",
      "time_horizon": "${isAutoHorizon ? "섹터 특성에 맞는 추천 기간 (예: 단기 1-3개월, 중기 3-6개월, 장기 6개월+)" : investmentHorizonLabels[investmentHorizon]}",
      "time_horizon_reason": "${isAutoHorizon ? "이 투자 기간을 추천하는 이유" : "사용자 지정 투자 기간"}"
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
  "macro_considerations": ["고려사항 1", "고려사항 2"],
  "action_items": ["실행 항목 1", "실행 항목 2"]
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요. (ETF 티커, 종목 티커, 영문명 제외)" : "Write everything in English."}
중요: 반드시 유효한 JSON만 출력하세요. 영상에서 언급된 내용을 최우선으로 반영하세요.
`;

    const analysisResult = await callLLM(prompt, 0.25);

    // JSON 파싱
    let parsed;
    try {
      const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
    } catch (e) {
      parsed = { analysis_summary: analysisResult, recommended_sectors: [], raw: true };
    }

    // ==========================================
    // 추천 섹터 후처리 필터링
    // LLM이 기준을 무시할 수 있으므로 강제 필터링
    // ==========================================
    if (parsed.recommended_sectors && Array.isArray(parsed.recommended_sectors)) {
      const originalSectors = [...parsed.recommended_sectors];
      const filteredSectors = [];
      const rejectedSectors = [];

      for (const sector of originalSectors) {
        // expected_return에서 숫자 추출 (예: "0-5%" -> 5, "10-20%" -> 20)
        const returnMatch = sector.expected_return?.match(/(\d+)(?:\s*-\s*(\d+))?/);
        const maxReturn = returnMatch ? parseInt(returnMatch[2] || returnMatch[1], 10) : 0;

        const isValid =
          sector.outlook === "positive" &&
          sector.outlook_score >= 70 &&
          maxReturn >= 5 &&
          sector.confidence >= 60;

        if (isValid) {
          filteredSectors.push(sector);
        } else {
          // 기준 미달 섹터는 피해야 할 섹터로 이동
          const reasons = [];
          if (sector.outlook !== "positive") reasons.push(`전망이 ${sector.outlook}(positive 아님)`);
          if (sector.outlook_score < 70) reasons.push(`outlook_score ${sector.outlook_score}(70 미만)`);
          if (maxReturn < 5) reasons.push(`expected_return ${sector.expected_return}(5% 미만)`);
          if (sector.confidence < 60) reasons.push(`confidence ${sector.confidence}(60 미만)`);

          rejectedSectors.push({
            sector_name: sector.sector_name,
            sector_name_en: sector.sector_name_en,
            reason: `추천 기준 미달: ${reasons.join(", ")}`,
            original_data: {
              outlook: sector.outlook,
              outlook_score: sector.outlook_score,
              expected_return: sector.expected_return,
              confidence: sector.confidence,
            },
          });
          console.log(`[필터링] ${sector.sector_name} 제외: ${reasons.join(", ")}`);
        }
      }

      // 필터링된 결과로 교체
      parsed.recommended_sectors = filteredSectors.map((s, i) => ({ ...s, rank: i + 1 }));

      // 피해야 할 섹터에 기준 미달 섹터 추가
      if (!parsed.sectors_to_avoid) parsed.sectors_to_avoid = [];
      parsed.sectors_to_avoid = [...parsed.sectors_to_avoid, ...rejectedSectors];

      // 필터링 정보 기록
      parsed._filtering_info = {
        original_count: originalSectors.length,
        filtered_count: filteredSectors.length,
        rejected_count: rejectedSectors.length,
        criteria: {
          outlook: "positive",
          min_outlook_score: 70,
          min_expected_return: "5%",
          min_confidence: 60,
        },
      };

      console.log(`[섹터 필터링] ${originalSectors.length}개 중 ${filteredSectors.length}개 통과, ${rejectedSectors.length}개 제외`);
    }

    // 결과 구조화
    const result = {
      analysis_date: analysisDate,
      market_type: marketType,
      market_label: marketLabel,
      source: {
        type: marketData?.source || "manual",
        video_info: videoInfo,
        transcript_method: transcriptMethod,
      },
      investment_profile: {
        horizon: investmentHorizon,
        horizon_label: investmentHorizonLabels[investmentHorizon],
        is_auto_horizon: isAutoHorizon,
        risk_tolerance: this.risk_tolerance,
        risk_label: riskLabels[this.risk_tolerance],
      },
      llm_info: {
        model: resolvedModel,
        provider: modelInfo.provider,
        accuracy_score: modelInfo.accuracy,
      },
      input_market_outlook: marketOutlook,
      input_key_points: keyPoints,
      input_mentioned_tickers: mentionedTickers,
      sector_analysis: parsed,
      generated_at: new Date().toISOString(),
    };

    $.export("sector_analysis", result);
    return result;
  },
});
