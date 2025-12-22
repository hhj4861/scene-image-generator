import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Ticker Analyzer",
  description: "종목 분석기 - YouTube 영상/섹터 전망 기반 수급 동향 좋은 종목 추천",

  props: {
    sector_analysis_output: { type: "string", label: "Sector Analysis Output (JSON)", description: "Stock Sector Analyzer 결과: {{JSON.stringify(steps.Stock_Sector_Analyzer.$return_value)}}", optional: true },
    market_analysis_output: { type: "string", label: "Market Analysis Output (JSON)", description: "Stock Market Analyzer 결과: {{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}", optional: true },
    manual_sectors: { type: "string[]", label: "수동 섹터 입력 (Optional)", description: "분석할 섹터 직접 입력. 예: Technology, Healthcare", optional: true },
    market_type: { type: "string", label: "시장 유형", options: [{ label: "미국 (US Market)", value: "us" }, { label: "한국 (Korean Market)", value: "kr" }], default: "us", optional: true },
    num_tickers: { type: "integer", label: "추천 종목 수", description: "총 추천할 종목 개수 (기본: 10개, FMP 부족 시 LLM으로 보충)", default: 10, optional: true },
    top_picks_count: { type: "integer", label: "Top Picks 수", description: "최종 선별할 상위 종목 수 (conviction_score 순)", default: 2, optional: true },
    analysis_criteria: { type: "string[]", label: "분석 기준", description: "종목 선정 시 중점 기준", options: [{ label: "수급 동향 (기관/외인 매수)", value: "flow" }, { label: "실적 모멘텀", value: "earnings" }, { label: "밸류에이션", value: "valuation" }, { label: "기술적 분석 (차트)", value: "technical" }, { label: "성장성", value: "growth" }, { label: "배당", value: "dividend" }], default: ["flow", "earnings", "growth"], optional: true },
    market_cap_preference: { type: "string", label: "시가총액 선호", options: [{ label: "대형주 위주", value: "large" }, { label: "중형주 포함", value: "mid" }, { label: "소형주 포함", value: "small" }, { label: "무관", value: "any" }], default: "large", optional: true },
    gemini_api_key: { type: "string", label: "Gemini API Key", description: "Google AI Studio에서 발급 (https://aistudio.google.com)", secret: true, optional: true },
    openai_api_key: { type: "string", label: "OpenAI API Key", description: "OpenAI Platform에서 발급 (https://platform.openai.com) - GPT-4o 사용 시 필요", secret: true, optional: true },
    serper_api_key: { type: "string", label: "Serper API Key", description: "종목별 뉴스 및 수급 정보 검색용", secret: true, optional: true },
    fmp_api_key: { type: "string", label: "Financial Modeling Prep API Key", description: "실시간 주가 및 재무 데이터용 (https://financialmodelingprep.com) - 정확한 분석을 위해 필수 권장", secret: true, optional: true },
    fmp_plan: { type: "string", label: "FMP API Plan", options: [{ label: "Free (250 calls/day, 5 calls/min)", value: "free" }, { label: "Starter ($14/mo, 300 calls/day)", value: "starter" }, { label: "Professional ($29/mo, 750 calls/day)", value: "professional" }, { label: "Ultimate ($79/mo, Unlimited)", value: "ultimate" }], default: "free", description: "FMP API 플랜에 따라 호출 제한이 조절됩니다", optional: true },
    fmp_daily_calls_used: { type: "integer", label: "오늘 사용한 FMP API 호출 수", description: "수동으로 입력하거나 비워두면 0으로 시작. 쿼터 관리용", default: 0, optional: true },
    fmp_quota_strategy: { type: "string", label: "쿼터 부족 시 처리 방식", options: [{ label: "strict (정확도 우선) - 쿼터 부족 시 분석 중단", value: "strict" }, { label: "fallback (완성도 우선) - LLM 추정 사용 + 경고", value: "fallback" }, { label: "skip_unverified (검증만) - 미검증 종목 결과에서 제외", value: "skip_unverified" }], default: "fallback", description: "쿼터 부족 시 정확도 vs 완성도 선택", optional: true },
    use_real_data_only: { type: "boolean", label: "실제 데이터만 사용", description: "true: FMP API 데이터만 사용 (정확), false: LLM 추정 허용 (비용 절감)", default: true, optional: true },
    llm_model: { type: "string", label: "LLM Model", options: [{ label: "🤖 자동 선택 (정확도 우선)", value: "auto" }, { label: "🔵 GPT-4o (최고 정확도, $$$)", value: "gpt-4o" }, { label: "🔵 GPT-4o-mini (균형, $$)", value: "gpt-4o-mini" }, { label: "🟢 Gemini 3 Pro (최신, 최강, $$$$)", value: "gemini-3-pro-preview" }, { label: "🟢 Gemini 2.5 Pro (정식, 정확, $$$)", value: "gemini-2.5-pro" }, { label: "🟢 Gemini 2.5 Flash (정식, 빠름, $$)", value: "gemini-2.5-flash" }, { label: "🟢 Gemini 2.0 Flash (빠름, $)", value: "gemini-2.0-flash" }, { label: "🟢 Gemini 2.0 Flash-Lite (최저가, $)", value: "gemini-2.0-flash-lite" }, { label: "⚪ Gemini 1.5 Pro (레거시, $$)", value: "gemini-1.5-pro" }], default: "auto", description: "🔵=OpenAI, 🟢=Gemini, auto: GPT-4o > Gemini 3 Pro > Gemini 2.5 Pro" },
    llm_priority: { type: "string", label: "LLM 우선순위", options: [{ label: "정확도 우선 (비용 높음)", value: "accuracy" }, { label: "균형 (정확도 + 비용)", value: "balanced" }, { label: "비용 우선 (저렴)", value: "cost" }], default: "balanced", description: "auto 모드에서 모델 선택 기준", optional: true },
    output_language: { type: "string", label: "출력 언어", options: [{ label: "한국어", value: "korean" }, { label: "English", value: "english" }], default: "korean" },
  },

  async run({ $ }) {
    let sectorData = null, marketData = null;

    if (this.sector_analysis_output) {
      try {
        sectorData = typeof this.sector_analysis_output === "string" ? JSON.parse(this.sector_analysis_output) : this.sector_analysis_output;
      } catch (e) { console.log("Failed to parse sector_analysis_output:", e.message); }
    }

    if (this.market_analysis_output) {
      try {
        marketData = typeof this.market_analysis_output === "string" ? JSON.parse(this.market_analysis_output) : this.market_analysis_output;
      } catch (e) { console.log("Failed to parse market_analysis_output:", e.message); }
    }

    if (marketData?.skip_ticker_analysis === true) {
      const skipReason = marketData?.key_points_structure === "weekly_outlook" ? "Weekly Outlook 모드 - 종목 분석 불필요" : "Market Analyzer에서 종목 분석 스킵 플래그 설정됨";
      console.log(`⏭️ [SKIP] ${skipReason}`);
      const skipResult = { skipped: true, skip_reason: skipReason, key_points_structure: marketData?.key_points_structure, analysis_date: marketData?.analysis_date || new Date().toISOString().split("T")[0], market_type: marketData?.market_type, recommended_tickers: [], top_picks: [] };
      $.export("ticker_analysis", skipResult);
      return skipResult;
    }

    const marketType = sectorData?.market_type || marketData?.market_type || this.market_type || "us";
    const marketLabels = { us: "미국", kr: "한국" };
    const marketLabel = marketLabels[marketType];
    const analysisDate = sectorData?.analysis_date || marketData?.analysis_date || new Date().toISOString().split("T")[0];

    const marketAnalysis = marketData?.analysis || {};
    const mentionedTickers = marketAnalysis.mentioned_tickers || [];
    const videoInfo = marketAnalysis.video_info || {};
    const keyPoints = marketAnalysis.key_points || [];

    $.export("source_video", videoInfo);
    $.export("mentioned_tickers_from_video", mentionedTickers);

    const recommendedSectors = sectorData?.sector_analysis?.recommended_sectors || [];
    const targetSectors = recommendedSectors.length > 0
      ? recommendedSectors.slice(0, 3).map(s => ({ name: s.sector_name, name_en: s.sector_name_en, thesis: s.thesis, catalysts: s.catalysts, representative_stocks: s.representative_stocks || [] }))
      : (this.manual_sectors || ["Technology"]).map(s => ({ name: s, name_en: s, thesis: "", catalysts: [], representative_stocks: [] }));

    const MODEL_INFO = {
      "gpt-4o": { provider: "openai", accuracy: 95, cost: 5, speed: 3 },
      "gpt-4o-mini": { provider: "openai", accuracy: 85, cost: 2, speed: 4 },
      "gemini-3-pro-preview": { provider: "gemini", accuracy: 97, cost: 6, speed: 2 },
      "gemini-2.5-pro": { provider: "gemini", accuracy: 93, cost: 4, speed: 3 },
      "gemini-2.5-flash": { provider: "gemini", accuracy: 85, cost: 2, speed: 4 },
      "gemini-2.0-flash": { provider: "gemini", accuracy: 78, cost: 1, speed: 5 },
      "gemini-2.0-flash-lite": { provider: "gemini", accuracy: 72, cost: 0.5, speed: 5 },
      "gemini-1.5-pro": { provider: "gemini", accuracy: 88, cost: 3, speed: 3 },
    };

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

      if (availableModels.length === 0) throw new Error("사용 가능한 LLM API 키가 없습니다. gemini_api_key 또는 openai_api_key를 설정하세요.");

      let sortedModels;
      const MIN_ACCURACY_FOR_BALANCED = 80;

      switch (priority) {
        case "accuracy":
          sortedModels = availableModels.sort((a, b) => b.accuracy - a.accuracy);
          break;
        case "cost":
          sortedModels = availableModels.sort((a, b) => a.cost - b.cost);
          break;
        case "balanced":
        default:
          const qualifiedModels = availableModels.filter(m => m.accuracy >= MIN_ACCURACY_FOR_BALANCED);
          sortedModels = (qualifiedModels.length > 0 ? qualifiedModels : availableModels).sort((a, b) => (b.accuracy / b.cost) - (a.accuracy / a.cost));
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

    const callGemini = async (prompt, temperature = 0.3, model = resolvedModel) => {
      if (!this.gemini_api_key) throw new Error("Gemini API Key가 필요합니다.");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const resp = await axios($, {
        url, method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: 8192 } },
      });
      return resp.candidates[0].content.parts[0].text;
    };

    const callOpenAI = async (prompt, temperature = 0.3, model = resolvedModel) => {
      if (!this.openai_api_key) throw new Error("OpenAI API Key가 필요합니다.");
      const resp = await axios($, {
        url: "https://api.openai.com/v1/chat/completions", method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.openai_api_key}` },
        data: {
          model: model,
          messages: [{ role: "system", content: "You are a professional stock analyst. Always respond with valid JSON when requested." }, { role: "user", content: prompt }],
          temperature, max_tokens: 8192,
        },
      });
      return resp.choices[0].message.content;
    };

    const callLLM = async (prompt, temperature = 0.3) => {
      const provider = modelInfo.provider;
      const startTime = Date.now();
      try {
        let result;
        if (provider === "openai") result = await callOpenAI(prompt, temperature, resolvedModel);
        else result = await callGemini(prompt, temperature, resolvedModel);
        const elapsed = Date.now() - startTime;
        console.log(`[LLM] Response received in ${elapsed}ms (model: ${resolvedModel})`);
        return result;
      } catch (error) {
        console.error(`[LLM] Error with ${resolvedModel}: ${error.message}`);
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

    const searchTickerInfo = async (sector) => {
      if (!this.serper_api_key) return { sector, news: [] };
      try {
        const query = marketType === "kr"
          ? `${sector.name} 관련주 수급 기관 외인 매수 ${new Date().getFullYear()}`
          : `${sector.name_en} sector stocks institutional buying flow ${new Date().getFullYear()}`;
        const resp = await axios($, {
          url: "https://google.serper.dev/news", method: "POST",
          headers: { "X-API-KEY": this.serper_api_key, "Content-Type": "application/json" },
          data: { q: query, num: 5 },
        });
        return { sector, news: resp.news || [] };
      } catch (e) { return { sector, news: [], error: e.message }; }
    };

    const FMP_PLAN_CONFIG = {
      free: { daily_limit: 250, calls_per_minute: 5, batch_size: 3, delay_between_batches: 15000, max_tickers_per_run: 10, screener_limit: 10 },
      starter: { daily_limit: 300, calls_per_minute: 10, batch_size: 5, delay_between_batches: 8000, max_tickers_per_run: 15, screener_limit: 15 },
      professional: { daily_limit: 750, calls_per_minute: 30, batch_size: 10, delay_between_batches: 3000, max_tickers_per_run: 30, screener_limit: 20 },
      ultimate: { daily_limit: Infinity, calls_per_minute: 300, batch_size: 20, delay_between_batches: 500, max_tickers_per_run: 50, screener_limit: 30 },
    };

    const fmpPlan = this.fmp_plan || "free";
    const fmpConfig = FMP_PLAN_CONFIG[fmpPlan];
    let fmpCallsUsed = this.fmp_daily_calls_used || 0;
    const fmpCallsRemaining = fmpConfig.daily_limit - fmpCallsUsed;

    console.log(`[FMP] Plan: ${fmpPlan}, Daily limit: ${fmpConfig.daily_limit}, Used: ${fmpCallsUsed}, Remaining: ${fmpCallsRemaining}`);
    if (fmpCallsRemaining < 10 && fmpConfig.daily_limit !== Infinity) console.warn(`[FMP] ⚠️ Warning: Only ${fmpCallsRemaining} API calls remaining today!`);

    const quotaStrategy = this.fmp_quota_strategy || "fallback";
    let quotaExceeded = false;

    const fmpApiCall = async (url, params) => {
      const remaining = fmpConfig.daily_limit - fmpCallsUsed;
      if (remaining <= 0 && fmpConfig.daily_limit !== Infinity) {
        quotaExceeded = true;
        if (quotaStrategy === "strict") throw new Error(`[FMP] 일일 쿼터 초과! 분석을 중단합니다. (사용: ${fmpCallsUsed}/${fmpConfig.daily_limit})`);
        console.warn(`[FMP] ⚠️ Daily quota exceeded! Strategy: ${quotaStrategy}`);
        return null;
      }
      try {
        const resp = await axios($, { url, method: "GET", params: { ...params, apikey: this.fmp_api_key } });
        fmpCallsUsed++;
        return resp;
      } catch (e) {
        if (e.response?.status === 429) {
          console.warn(`[FMP] Rate limit hit. Waiting 60 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
          return fmpApiCall(url, params);
        }
        throw e;
      }
    };

    $.export("fmp_quota_info", { plan: fmpPlan, daily_limit: fmpConfig.daily_limit, calls_used_before: this.fmp_daily_calls_used || 0, max_tickers_this_run: fmpConfig.max_tickers_per_run });

    const fetchSectorStocks = async (sectorName) => {
      if (!this.fmp_api_key) return [];
      if (fmpCallsRemaining <= 0 && fmpConfig.daily_limit !== Infinity) {
        console.log(`[FMP] Skipping fetchSectorStocks - quota exceeded`);
        return [];
      }
      try {
        const resp = await fmpApiCall(`https://financialmodelingprep.com/api/v3/stock-screener`, {
          sector: sectorName,
          marketCapMoreThan: this.market_cap_preference === "large" ? 10000000000 : 1000000000,
          limit: fmpConfig.screener_limit,
        });
        if (!resp) return [];
        return resp.slice(0, fmpConfig.screener_limit);
      } catch (e) {
        console.log(`[FMP] fetchSectorStocks error: ${e.message}`);
        return [];
      }
    };

    const formatMarketCap = (value) => {
      if (!value) return "N/A";
      if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
      if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      return `$${value.toLocaleString()}`;
    };

    const fetchTickerDetails = async (ticker) => {
      if (!this.fmp_api_key) return null;
      if (fmpCallsRemaining <= 0 && fmpConfig.daily_limit !== Infinity) {
        console.log(`[FMP] Skipping fetchTickerDetails for ${ticker} - quota exceeded`);
        return null;
      }

      try {
        const isPremiumPlan = ["professional", "ultimate"].includes(fmpPlan);

        let quoteResp = await fmpApiCall(`https://financialmodelingprep.com/stable/quote?symbol=${ticker}`, {}).catch(() => null);

        if (!quoteResp || quoteResp.length === 0) {
          console.log(`[FMP] Stable API 실패, 레거시 API 시도: ${ticker}`);
          quoteResp = await fmpApiCall(`https://financialmodelingprep.com/api/v3/quote/${ticker}`, {}).catch(() => []);
        }

        if (!quoteResp || quoteResp.length === 0 || !quoteResp[0]?.price) {
          console.log(`[FMP] 모든 FMP API 실패, Yahoo Finance fallback: ${ticker}`);
          try {
            const yahooResp = await axios($, {
              url: `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
              method: "GET", params: { interval: "1d", range: "1d" },
              headers: { "User-Agent": "Mozilla/5.0" },
            });

            const result = yahooResp?.chart?.result?.[0];
            const meta = result?.meta || {};
            const price = meta.regularMarketPrice;

            if (price) {
              console.log(`[Yahoo] ${ticker} 가격 조회 성공: $${price}`);
              return {
                ticker, company_name: meta.shortName || meta.longName || ticker, current_price: price,
                price_change_pct: meta.regularMarketChangePercent || null, market_cap: meta.marketCap || null,
                market_cap_formatted: formatMarketCap(meta.marketCap), sector: null, industry: null,
                pe_ratio: null, pb_ratio: null, dividend_yield: null, revenue_growth: null, earnings_growth: null,
                roe: null, debt_to_equity: null, avg_volume: meta.averageDailyVolume10Day || null,
                year_high: meta.fiftyTwoWeekHigh || null, year_low: meta.fiftyTwoWeekLow || null,
                price_to_year_high_pct: meta.fiftyTwoWeekHigh ? ((price / meta.fiftyTwoWeekHigh - 1) * 100).toFixed(2) : null,
                beta: null, description: null, _data_source: "YAHOO_FINANCE", _fetched_at: new Date().toISOString(),
              };
            }
          } catch (yahooErr) { console.log(`[Yahoo] ${ticker} 조회 실패: ${yahooErr.message}`); }
          return null;
        }

        let profileResp = [], ratiosResp = [];
        if (isPremiumPlan && quoteResp) {
          [profileResp, ratiosResp] = await Promise.all([
            fmpApiCall(`https://financialmodelingprep.com/stable/profile?symbol=${ticker}`, {}).catch(() =>
              fmpApiCall(`https://financialmodelingprep.com/api/v3/profile/${ticker}`, {}).catch(() => [])
            ),
            fmpApiCall(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}`, {}).catch(() => [])
          ]);
        }

        const quote = quoteResp?.[0] || {};
        const profile = profileResp?.[0] || {};
        const ratios = ratiosResp?.[0] || {};

        return {
          ticker, company_name: profile.companyName || quote.name || ticker,
          current_price: quote.price || null, price_change_pct: quote.changesPercentage || null,
          market_cap: profile.mktCap || quote.marketCap || null, market_cap_formatted: formatMarketCap(profile.mktCap || quote.marketCap),
          sector: profile.sector || null, industry: profile.industry || null,
          pe_ratio: ratios.peRatioTTM || profile.peRatio || null, pb_ratio: ratios.priceToBookRatioTTM || null,
          dividend_yield: ratios.dividendYieldTTM || profile.lastDiv || null, revenue_growth: ratios.revenueGrowthTTM || null,
          earnings_growth: ratios.netIncomeGrowthTTM || null, roe: ratios.returnOnEquityTTM || null,
          debt_to_equity: ratios.debtEquityRatioTTM || null, avg_volume: quote.avgVolume || null,
          year_high: quote.yearHigh || null, year_low: quote.yearLow || null,
          price_to_year_high_pct: quote.yearHigh ? ((quote.price / quote.yearHigh - 1) * 100).toFixed(2) : null,
          beta: profile.beta || null, description: profile.description?.substring(0, 200) || null,
          _data_source: "FMP_API", _fetched_at: new Date().toISOString(),
        };
      } catch (e) {
        console.log(`[FMP] fetchTickerDetails error for ${ticker}: ${e.message}`);
        return null;
      }
    };

    const fetchMultipleTickerDetails = async (tickers) => {
      if (!this.fmp_api_key || !tickers || tickers.length === 0) return {};

      const limitedTickers = tickers.slice(0, fmpConfig.max_tickers_per_run);
      if (tickers.length > fmpConfig.max_tickers_per_run) {
        console.log(`[FMP] Limiting tickers from ${tickers.length} to ${fmpConfig.max_tickers_per_run} (${fmpPlan} plan)`);
      }

      const results = {};
      const batchSize = fmpConfig.batch_size;
      const delayMs = fmpConfig.delay_between_batches;

      console.log(`[FMP] Fetching ${limitedTickers.length} tickers in batches of ${batchSize} with ${delayMs}ms delay`);

      for (let i = 0; i < limitedTickers.length; i += batchSize) {
        if (fmpCallsRemaining <= 0 && fmpConfig.daily_limit !== Infinity) {
          console.warn(`[FMP] Stopping - daily quota exceeded`);
          break;
        }

        const batch = limitedTickers.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(ticker => fetchTickerDetails(ticker)));
        batchResults.forEach((data, idx) => { if (data) results[batch[idx]] = data; });

        if (i + batchSize < limitedTickers.length) {
          console.log(`[FMP] Waiting ${delayMs}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      console.log(`[FMP] Fetched details for ${Object.keys(results).length}/${tickers.length} tickers (plan: ${fmpPlan})`);
      return results;
    };

    const analysisCriteriaLabels = { flow: "수급 동향 (기관/외인 매수)", earnings: "실적 모멘텀", valuation: "밸류에이션", technical: "기술적 분석", growth: "성장성", dividend: "배당" };
    const criteriaText = (this.analysis_criteria || ["flow"]).map(c => analysisCriteriaLabels[c]).join(", ");

    const sectorInfoPromises = targetSectors.map((sector, index) =>
      Promise.all([searchTickerInfo(sector), fetchSectorStocks(sector.name_en)])
        .then(([newsResult, stockData]) => ({ index, sector, news: newsResult.news, stocks: stockData }))
    );
    const sectorInfoResults = await Promise.all(sectorInfoPromises);
    const sortedSectorInfo = sectorInfoResults.sort((a, b) => a.index - b.index);

    const tickersToFetch = new Set();
    mentionedTickers.forEach(t => { if (t.ticker) tickersToFetch.add(t.ticker.toUpperCase()); });
    targetSectors.forEach(s => { (s.representative_stocks || []).forEach(ticker => { tickersToFetch.add(ticker.toUpperCase()); }); });

    const realTickerData = await fetchMultipleTickerDetails([...tickersToFetch]);
    console.log(`[FMP] Real data available for: ${Object.keys(realTickerData).join(", ")}`);
    $.export("real_ticker_data", realTickerData);

    const sectorAnalysisPromises = sortedSectorInfo.map(async (info, idx) => {
      const { sector, news, stocks } = info;
      const newsContext = news.slice(0, 5).map(n => `- ${n.title}`).join("\n");
      const stockContext = stocks.slice(0, 10).map(s => `${s.symbol}: ${s.companyName}`).join(", ");
      const representativeStocks = sector.representative_stocks || [];

      const realDataContext = representativeStocks
        .map(ticker => {
          const data = realTickerData[ticker.toUpperCase()];
          if (!data) return null;
          return `- ${ticker}: 현재가 $${data.current_price || 'N/A'}, 시총 ${data.market_cap_formatted}, PER ${data.pe_ratio?.toFixed(2) || 'N/A'}, 52주고점대비 ${data.price_to_year_high_pct}%`;
        })
        .filter(Boolean).join("\n");

      const mentionedWithData = mentionedTickers
        .map(t => {
          const data = realTickerData[t.ticker?.toUpperCase()];
          if (!data) return `- ${t.ticker} (${t.name}): ${t.action} - ${t.reason} [데이터 없음]`;
          return `- ${t.ticker} (${data.company_name}): ${t.action} - ${t.reason}\n  └ 현재가 $${data.current_price}, 시총 ${data.market_cap_formatted}, PER ${data.pe_ratio?.toFixed(2) || 'N/A'}`;
        }).join("\n");

      const mentionedTickersContextWithData = mentionedTickers.length > 0
        ? `\n\n===== 영상에서 언급된 종목 (우선 고려) =====\n${mentionedWithData}\n` : "";

      const useRealData = this.use_real_data_only && this.fmp_api_key;

      const prompt = useRealData ? `당신은 전문 주식 애널리스트입니다. 다음 섹터에서 ${this.num_tickers}개의 유망 종목을 추천해주세요.

★★★ 중요: 아래 제공된 실제 데이터만 사용하세요. 숫자를 추정하거나 만들어내지 마세요! ★★★

===== 섹터 정보 =====
섹터: ${sector.name} (${sector.name_en})
시장: ${marketLabel}
투자 논거: ${sector.thesis || "N/A"}
촉매: ${(sector.catalysts || []).join(", ") || "N/A"}
${mentionedTickersContextWithData}
${realDataContext ? `\n===== 실제 종목 데이터 (FMP API) =====\n${realDataContext}\n` : ""}
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
  "sector_summary": "섹터 내 종목 분석 요약 (100자)",
  "recommended_tickers": [
    {
      "rank": 1, "ticker": "티커 심볼", "company_name": "회사명", "company_name_kr": "한글 회사명",
      "recommendation": "Strong Buy/Buy/Hold", "conviction_score": 85,
      "investment_thesis": "투자 논거 (왜 이 종목인가)", "catalysts": ["촉매 1", "촉매 2"],
      "risks": ["리스크 1", "리스크 2"], "flow_outlook": "수급 전망 (정성적 설명)",
      "entry_strategy": "진입 전략", "stop_loss_reason": "손절 기준 근거",
      "mentioned_in_video": true/false, "data_source": "FMP_API"
    }
  ],
  "sector_etf_alternative": { "ticker": "섹터 ETF 티커", "name": "ETF 이름", "reason": "개별 종목 대신 ETF 추천 이유" }
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요. (티커, ETF명 제외)" : "Write everything in English."}
★ 절대 규칙 ★
1. 주가, 시가총액, PER 등 숫자 데이터는 절대 생성하지 마세요. 위에 제공된 데이터만 참조하세요.
2. 투자 논거, 리스크, 촉매 등 정성적 분석에만 집중하세요.
3. 영상에서 언급된 종목은 mentioned_in_video: true로 표시하세요.
4. 반드시 유효한 JSON만 출력하세요.` : `당신은 전문 주식 애널리스트입니다. 다음 섹터에서 ${this.num_tickers}개의 유망 종목을 추천해주세요.

===== 섹터 정보 =====
섹터: ${sector.name} (${sector.name_en})
시장: ${marketLabel}
투자 논거: ${sector.thesis || "N/A"}
촉매: ${(sector.catalysts || []).join(", ") || "N/A"}
${representativeStocks.length > 0 ? `섹터 대표 종목: ${representativeStocks.join(", ")}` : ""}
${mentionedTickersContextWithData}
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
      "rank": 1, "ticker": "티커 심볼", "company_name": "회사명", "company_name_kr": "한글 회사명",
      "recommendation": "Strong Buy/Buy/Hold", "conviction_score": 85,
      "investment_thesis": "투자 논거", "catalysts": ["촉매 1", "촉매 2"],
      "risks": ["리스크 1", "리스크 2"], "flow_outlook": "수급 전망",
      "entry_strategy": "진입 전략", "stop_loss_reason": "손절 기준",
      "mentioned_in_video": true/false, "data_source": "LLM_ESTIMATE"
    }
  ],
  "sector_etf_alternative": { "ticker": "섹터 ETF 티커", "name": "ETF 이름", "reason": "개별 종목 대신 ETF 추천 이유" }
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요. (티커, ETF명 제외)" : "Write everything in English."}
중요:
- 반드시 유효한 JSON만 출력하세요.
- 영상에서 언급된 종목은 mentioned_in_video: true로 표시하세요.
- ${marketType === "kr" ? "한국 시장 종목(KOSPI, KOSDAQ)을 추천하세요." : "미국 시장 종목(NYSE, NASDAQ)을 추천하세요."}
- ⚠️ 주의: 실제 데이터 없이 추정한 값입니다. 투자 전 반드시 검증하세요.`;

      const result = await callLLM(prompt, 0.25);
      let parsed;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : result);
      } catch (e) {
        parsed = { sector_name: sector.name, recommended_tickers: [], raw: result, _llm_model: resolvedModel };
      }

      if (parsed.recommended_tickers && Array.isArray(parsed.recommended_tickers)) {
        parsed.recommended_tickers = parsed.recommended_tickers.map(ticker => {
          const realData = realTickerData[ticker.ticker?.toUpperCase()];
          if (realData) {
            const hasValidData = realData.current_price !== null && realData.current_price !== undefined;
            if (hasValidData) {
              return {
                ...ticker, fmp_verified: true,
                fmp_data: {
                  source: "Financial Modeling Prep API", fetched_at: realData._fetched_at,
                  current_price: realData.current_price, price_change_pct: realData.price_change_pct,
                  market_cap: realData.market_cap_formatted, market_cap_raw: realData.market_cap,
                  pe_ratio: realData.pe_ratio, pb_ratio: realData.pb_ratio, dividend_yield: realData.dividend_yield,
                  revenue_growth: realData.revenue_growth, earnings_growth: realData.earnings_growth,
                  year_high: realData.year_high, year_low: realData.year_low,
                  price_to_year_high_pct: realData.price_to_year_high_pct, beta: realData.beta,
                  sector: realData.sector, industry: realData.industry,
                },
                sector: realData.sector || ticker.sector, industry: realData.industry, data_source: "FMP_API", _verified: true,
              };
            }
            return { ...ticker, fmp_verified: false, fmp_data: null, data_source: "FMP_API_FAILED", _verified: false, _warning: "⚠️ FMP API 호출했으나 데이터 없음. LLM 추정값입니다." };
          }
          return { ...ticker, fmp_verified: false, fmp_data: null, data_source: ticker.data_source || "LLM_ESTIMATE", _verified: false, _warning: "⚠️ FMP 데이터 없음. LLM 추정값입니다. 투자 전 반드시 검증 필요" };
        });
      }

      return { index: idx, ...parsed, _use_real_data: useRealData };
    });

    const tickerAnalysisResults = await Promise.all(sectorAnalysisPromises);
    const sortedResults = tickerAnalysisResults.sort((a, b) => a.index - b.index);

    const allTickers = sortedResults.flatMap(r => (r.recommended_tickers || []).map(t => ({ ...t, sector: r.sector_name })));

    const RECOMMENDATION_FILTER = { valid_recommendations: ["Strong Buy", "Buy", "Outperform", "Overweight"], min_conviction_score: 70 };

    let filteredTickers = allTickers.filter(ticker => {
      const score = ticker.conviction_score || ticker.score || 0;
      const recommendation = ticker.recommendation || "";
      if (score < RECOMMENDATION_FILTER.min_conviction_score) {
        console.log(`[Filter] ${ticker.ticker} 제외: conviction_score ${score} < ${RECOMMENDATION_FILTER.min_conviction_score}`);
        return false;
      }
      const isValidRecommendation = RECOMMENDATION_FILTER.valid_recommendations.some(valid => recommendation.toLowerCase().includes(valid.toLowerCase()));
      if (!isValidRecommendation && recommendation) {
        console.log(`[Filter] ${ticker.ticker} 제외: recommendation "${recommendation}" is not Buy/Strong Buy`);
        return false;
      }
      return true;
    });

    const skippedByQuality = allTickers.length - filteredTickers.length;
    if (skippedByQuality > 0) console.log(`[Quality Filter] ${skippedByQuality}개 종목 제외 (낮은 conviction_score 또는 Watch/Hold/Sell)`);

    const positiveKeyStocks = new Set();
    const positiveKeyStocksKr = new Set();

    const krToTickerMap = {
      "엔비디아": "NVDA", "마이크론": "MU", "테슬라": "TSLA", "애플": "AAPL", "아마존": "AMZN", "구글": "GOOGL", "알파벳": "GOOGL",
      "마이크로소프트": "MSFT", "메타": "META", "팔란티어": "PLTR", "AMD": "AMD", "TSMC": "TSM", "인텔": "INTC", "퀄컴": "QCOM",
      "브로드컴": "AVGO", "어도비": "ADBE", "세일즈포스": "CRM", "넷플릭스": "NFLX", "록히드 마틴": "LMT", "로키드 마틴": "LMT",
      "노스롭 그루먼": "NOC", "레이시온": "RTX", "보잉": "BA", "스페이스X": "SPACEX", "코인베이스": "COIN", "로빈후드": "HOOD",
      "페이팔": "PYPL", "스퀘어": "SQ", "블록": "SQ", "비자": "V", "마스터카드": "MA", "JP모건": "JPM", "골드만삭스": "GS",
      "모건스탠리": "MS", "버크셔해서웨이": "BRK.B", "화이자": "PFE", "모더나": "MRNA", "존슨앤존슨": "JNJ", "애브비": "ABBV",
      "유나이티드헬스": "UNH", "엑슨모빌": "XOM", "쉐브론": "CVX", "홈디포": "HD", "월마트": "WMT", "코스트코": "COST",
      "타겟": "TGT", "나이키": "NKE", "스타벅스": "SBUX", "맥도날드": "MCD", "디즈니": "DIS", "셀시우스": "CELH",
      "버텍스": "VRTX", "일라이릴리": "LLY", "노보노디스크": "NVO",
    };

    if (keyPoints && Array.isArray(keyPoints)) {
      for (const point of keyPoints) {
        if (point.outlook === "positive" && Array.isArray(point.key_stocks)) {
          for (const stock of point.key_stocks) {
            if (/^[A-Z]{1,5}$/.test(stock)) positiveKeyStocks.add(stock);
            else if (krToTickerMap[stock]) { positiveKeyStocks.add(krToTickerMap[stock]); positiveKeyStocksKr.add(stock); }
            else positiveKeyStocksKr.add(stock);
          }
        }
      }
    }

    console.log(`[Positive Stocks] 총 ${positiveKeyStocks.size}개 티커: ${[...positiveKeyStocks].join(", ") || "없음"}`);

    const isPositivelyMentioned = (ticker) => {
      if (positiveKeyStocks.has(ticker.ticker)) return true;
      if (ticker.name && positiveKeyStocksKr.has(ticker.name)) return true;
      if (ticker.name_kr && positiveKeyStocksKr.has(ticker.name_kr)) return true;
      return false;
    };

    const SCORE_ADJUSTMENT = {
      unverified_penalty: 5, risk_penalty_per_item: 2, max_risk_penalty: 10, fmp_data_missing_penalty: 3,
      earnings_beat_bonus: 5, earnings_growth_bonus: 3, revenue_growth_bonus: 3,
      technical_bullish_bonus: 4, above_ma_bonus: 2, catalyst_bonus: 3, max_catalyst_bonus: 9,
      policy_positive_bonus: 5, options_bullish_bonus: 3, positive_mention_bonus: 5,
      year_high_drop_20_penalty: 5, year_high_drop_30_penalty: 10, year_high_drop_40_penalty: 15,
    };

    filteredTickers = filteredTickers.map(ticker => {
      const originalScore = ticker.conviction_score || ticker.score || 0;
      let adjustedScore = originalScore;
      const adjustmentReasons = [];
      const bonusDetails = {};

      if (ticker.fmp_verified && ticker.fmp_data) {
        const fmpData = ticker.fmp_data;
        if (fmpData.earnings_growth !== null && fmpData.earnings_growth > 0) {
          adjustedScore += SCORE_ADJUSTMENT.earnings_growth_bonus;
          adjustmentReasons.push(`실적성장 +${SCORE_ADJUSTMENT.earnings_growth_bonus}점`);
          bonusDetails.earnings_growth = fmpData.earnings_growth;
        }
        if (fmpData.revenue_growth !== null && fmpData.revenue_growth > 0) {
          adjustedScore += SCORE_ADJUSTMENT.revenue_growth_bonus;
          adjustmentReasons.push(`매출성장 +${SCORE_ADJUSTMENT.revenue_growth_bonus}점`);
          bonusDetails.revenue_growth = fmpData.revenue_growth;
        }
        if (fmpData.earnings_surprise && fmpData.earnings_surprise > 0) {
          adjustedScore += SCORE_ADJUSTMENT.earnings_beat_bonus;
          adjustmentReasons.push(`어닝서프라이즈 +${SCORE_ADJUSTMENT.earnings_beat_bonus}점`);
          bonusDetails.earnings_surprise = fmpData.earnings_surprise;
        }
        if (fmpData.price_to_year_high_pct !== null && fmpData.price_to_year_high_pct !== undefined) {
          const dropPct = parseFloat(fmpData.price_to_year_high_pct);
          if (dropPct <= -40) {
            adjustedScore -= SCORE_ADJUSTMENT.year_high_drop_40_penalty;
            adjustmentReasons.push(`52주고점대비${dropPct.toFixed(0)}% -${SCORE_ADJUSTMENT.year_high_drop_40_penalty}점`);
            bonusDetails.year_high_drop = dropPct;
          } else if (dropPct <= -30) {
            adjustedScore -= SCORE_ADJUSTMENT.year_high_drop_30_penalty;
            adjustmentReasons.push(`52주고점대비${dropPct.toFixed(0)}% -${SCORE_ADJUSTMENT.year_high_drop_30_penalty}점`);
            bonusDetails.year_high_drop = dropPct;
          } else if (dropPct <= -20) {
            adjustedScore -= SCORE_ADJUSTMENT.year_high_drop_20_penalty;
            adjustmentReasons.push(`52주고점대비${dropPct.toFixed(0)}% -${SCORE_ADJUSTMENT.year_high_drop_20_penalty}점`);
            bonusDetails.year_high_drop = dropPct;
          }
        }
      }

      if (ticker.technical || ticker.technicals) {
        const tech = ticker.technical || ticker.technicals;
        if (tech.signal && /bullish|buy|strong/i.test(tech.signal)) {
          adjustedScore += SCORE_ADJUSTMENT.technical_bullish_bonus;
          adjustmentReasons.push(`기술적상승 +${SCORE_ADJUSTMENT.technical_bullish_bonus}점`);
          bonusDetails.technical_signal = tech.signal;
        }
        if (tech.above_ma50 || tech.above_ma200) {
          adjustedScore += SCORE_ADJUSTMENT.above_ma_bonus;
          adjustmentReasons.push(`이평선상단 +${SCORE_ADJUSTMENT.above_ma_bonus}점`);
          bonusDetails.moving_average = tech.above_ma50 ? "50MA상단" : "200MA상단";
        }
      }

      const catalysts = ticker.catalysts || [];
      if (catalysts.length > 0) {
        const catalystBonus = Math.min(catalysts.length * SCORE_ADJUSTMENT.catalyst_bonus, SCORE_ADJUSTMENT.max_catalyst_bonus);
        adjustedScore += catalystBonus;
        adjustmentReasons.push(`카탈리스트${catalysts.length}개 +${catalystBonus}점`);
        bonusDetails.catalysts = catalysts;
      }

      const thesis = ticker.thesis || ticker.investment_thesis || "";
      const policyKeywords = ["정책", "규제완화", "세금혜택", "보조금", "관세", "policy", "tariff", "subsidy", "tax credit"];
      const hasPositivePolicy = policyKeywords.some(kw => thesis.toLowerCase().includes(kw.toLowerCase()));
      if (hasPositivePolicy && ticker.recommendation !== "Sell") {
        adjustedScore += SCORE_ADJUSTMENT.policy_positive_bonus;
        adjustmentReasons.push(`정책수혜 +${SCORE_ADJUSTMENT.policy_positive_bonus}점`);
        bonusDetails.policy_impact = true;
      }

      if (ticker.options_data || ticker.put_call_ratio !== undefined) {
        const pcRatio = ticker.put_call_ratio || ticker.options_data?.put_call_ratio;
        if (pcRatio !== undefined && pcRatio < 0.7) {
          adjustedScore += SCORE_ADJUSTMENT.options_bullish_bonus;
          adjustmentReasons.push(`옵션강세 +${SCORE_ADJUSTMENT.options_bullish_bonus}점`);
          bonusDetails.put_call_ratio = pcRatio;
        }
      }

      const isPositive = isPositivelyMentioned(ticker);
      if (isPositive) {
        adjustedScore += SCORE_ADJUSTMENT.positive_mention_bonus;
        adjustmentReasons.push(`긍정언급 +${SCORE_ADJUSTMENT.positive_mention_bonus}점`);
        bonusDetails.positively_mentioned = true;
      }

      if (!ticker._verified) {
        adjustedScore -= SCORE_ADJUSTMENT.unverified_penalty;
        adjustmentReasons.push(`미검증 -${SCORE_ADJUSTMENT.unverified_penalty}점`);
      }

      const risks = ticker.risks || [];
      if (risks.length > 0) {
        const riskPenalty = Math.min(risks.length * SCORE_ADJUSTMENT.risk_penalty_per_item, SCORE_ADJUSTMENT.max_risk_penalty);
        adjustedScore -= riskPenalty;
        adjustmentReasons.push(`리스크${risks.length}개 -${riskPenalty}점`);
      }

      if (ticker.fmp_verified && ticker.fmp_data) {
        const criticalFields = ['pe_ratio', 'revenue_growth', 'earnings_growth'];
        const missingFields = criticalFields.filter(f => ticker.fmp_data[f] === null || ticker.fmp_data[f] === undefined);
        if (missingFields.length >= 2) {
          adjustedScore -= SCORE_ADJUSTMENT.fmp_data_missing_penalty;
          adjustmentReasons.push(`재무불완전 -${SCORE_ADJUSTMENT.fmp_data_missing_penalty}점`);
        }
      }

      adjustedScore = Math.max(0, Math.min(100, adjustedScore));
      if (adjustmentReasons.length > 0) console.log(`[Score Adjust] ${ticker.ticker}: ${originalScore}점 → ${adjustedScore}점 (${adjustmentReasons.join(", ")})`);

      return {
        ...ticker,
        conviction_score_original: originalScore, conviction_score: adjustedScore,
        conviction_score_adjustment: adjustmentReasons.length > 0 ? adjustmentReasons.join(", ") : null,
        score_bonus_details: Object.keys(bonusDetails).length > 0 ? bonusDetails : null,
      };
    });

    const beforeRefilter = filteredTickers.length;
    filteredTickers = filteredTickers.filter(t => t.conviction_score >= RECOMMENDATION_FILTER.min_conviction_score);
    const refiltered = beforeRefilter - filteredTickers.length;
    if (refiltered > 0) console.log(`[Score Adjust] 조정 후 ${refiltered}개 종목 제외 (조정 점수 < 70)`);

    const targetTickerCount = this.num_tickers || 10;
    if (filteredTickers.length < targetTickerCount) {
      const needed = targetTickerCount - filteredTickers.length;
      console.log(`[LLM Supplement] 종목 ${filteredTickers.length}개 < 목표 ${targetTickerCount}개. ${needed}개 추가 조회 중...`);

      const existingTickers = filteredTickers.map(t => t.ticker?.toUpperCase());
      const supplementPrompt = `당신은 전문 주식 애널리스트입니다. 다음 섹터에서 추가로 ${needed}개의 유망 종목을 추천해주세요.

===== 분석 조건 =====
시장: ${marketLabel}
분석일: ${analysisDate}
분석한 섹터: ${sortedResults.map(r => r.sector_name).join(", ")}
이미 추천된 종목 (제외): ${existingTickers.join(", ")}

★★★ 중요 ★★★
1. 위에 이미 추천된 종목은 절대 중복 추천하지 마세요!
2. conviction_score는 70~100 사이로 솔직하게 평가하세요.
3. 반드시 정확히 ${needed}개 종목을 추천하세요!

다음 JSON 형식으로 응답하세요:
\`\`\`json
{
  "supplementary_tickers": [
    { "ticker": "티커", "company_name": "회사명", "company_name_kr": "한글 회사명", "sector": "섹터명", "recommendation": "Buy/Strong Buy", "conviction_score": 75, "investment_thesis": "투자 논거", "data_source": "LLM_SUPPLEMENT" }
  ]
}
\`\`\``;

      try {
        const supplementResult = await callLLM(supplementPrompt, 0.3);
        let supplementParsed;
        try {
          const jsonMatch = supplementResult.match(/```json\s*([\s\S]*?)\s*```/);
          supplementParsed = JSON.parse(jsonMatch ? jsonMatch[1] : supplementResult);
        } catch (e) { supplementParsed = { supplementary_tickers: [] }; }

        if (supplementParsed.supplementary_tickers && supplementParsed.supplementary_tickers.length > 0) {
          const validSupplements = supplementParsed.supplementary_tickers
            .filter(t => !existingTickers.includes(t.ticker?.toUpperCase()))
            .map(t => {
              const originalScore = t.conviction_score || 0;
              const adjustedScore = Math.max(0, originalScore - SCORE_ADJUSTMENT.unverified_penalty);
              console.log(`[LLM Supplement Score] ${t.ticker}: ${originalScore}점 → ${adjustedScore}점 (미검증 -${SCORE_ADJUSTMENT.unverified_penalty}점)`);
              return {
                ...t, conviction_score_original: originalScore, conviction_score: adjustedScore,
                conviction_score_adjustment: `미검증 -${SCORE_ADJUSTMENT.unverified_penalty}점`,
                _verified: false, fmp_verified: false, data_source: "LLM_SUPPLEMENT",
              };
            })
            .filter(t => t.conviction_score >= RECOMMENDATION_FILTER.min_conviction_score);

          filteredTickers = [...filteredTickers, ...validSupplements];
          console.log(`[LLM Supplement] ${validSupplements.length}개 종목 추가됨: ${validSupplements.map(t => `${t.ticker}(${t.conviction_score}점)`).join(", ")}`);
        }
      } catch (e) { console.error(`[LLM Supplement] 추가 조회 실패: ${e.message}`); }
    }

    let skippedUnverified = 0;
    if (quotaStrategy === "skip_unverified") {
      const verifiedOnly = filteredTickers.filter(t => t._verified);
      skippedUnverified = filteredTickers.length - verifiedOnly.length;
      filteredTickers = verifiedOnly;
      if (skippedUnverified > 0) console.log(`[Quota Strategy] skip_unverified: ${skippedUnverified}개 미검증 종목 제외`);
    }

    const topPicksCount = this.top_picks_count || 2;
    const TOP_PICKS_MIN_SCORE = 75;

    const isTopPicksEligible = (ticker) => {
      const isPositive = isPositivelyMentioned(ticker);
      if ((ticker.fmp_verified || ticker._verified) && isPositive) return true;
      if (ticker.fmp_verified || ticker._verified) return true;
      if (isPositive) return true;
      if (ticker.mentioned_in_video && !isPositive) {
        console.log(`[Top Picks] ${ticker.ticker} 제외: 언급되었으나 긍정적 언급 아님`);
        return false;
      }
      if (ticker.data_source === "LLM_SUPPLEMENT" || ticker.data_source === "LLM_ESTIMATE") {
        console.log(`[Top Picks] ${ticker.ticker} 제외: 미검증 LLM 추정 (data_source: ${ticker.data_source})`);
        return false;
      }
      return false;
    };

    const getReliabilityScore = (ticker) => {
      let score = 0;
      const isPositive = isPositivelyMentioned(ticker);
      if (ticker.fmp_verified) score += 100;
      if (isPositive) score += 80;
      if (ticker._verified) score += 30;
      return score;
    };

    const getReliabilityTier = (ticker) => {
      const isPositive = isPositivelyMentioned(ticker);
      if (ticker.fmp_verified && isPositive) return "Tier 1 (검증+긍정)";
      if (ticker.fmp_verified) return "Tier 2 (FMP 검증)";
      if (isPositive) return "Tier 3 (긍정적 언급)";
      return "Tier 4 (기타)";
    };

    const topPicks = filteredTickers
      .filter(t => isTopPicksEligible(t))
      .filter(t => (t.conviction_score || t.score || 0) >= TOP_PICKS_MIN_SCORE)
      .sort((a, b) => {
        const reliabilityA = getReliabilityScore(a);
        const reliabilityB = getReliabilityScore(b);
        if (reliabilityB !== reliabilityA) return reliabilityB - reliabilityA;
        const scoreA = a.conviction_score || a.score || 0;
        const scoreB = b.conviction_score || b.score || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return 0;
      })
      .slice(0, topPicksCount)
      .map(t => ({
        ...t, conviction_score_display: `${t.conviction_score || t.score || 0}점`,
        reliability_tier: getReliabilityTier(t), positively_mentioned: isPositivelyMentioned(t),
      }));

    let topPicksFinal = topPicks;
    if (topPicks.length === 0 && positiveKeyStocks.size > 0) {
      console.log(`[Top Picks] 검증된 종목 없음 → 긍정적 언급 종목에서 fallback 시도`);

      const positiveInFiltered = filteredTickers
        .filter(t => isPositivelyMentioned(t))
        .sort((a, b) => (b.conviction_score || 0) - (a.conviction_score || 0))
        .slice(0, topPicksCount)
        .map(t => ({
          ...t, conviction_score_display: `${t.conviction_score || t.score || 0}점`,
          reliability_tier: "Tier 3 (긍정적 언급)", positively_mentioned: true,
          _fallback_pick: true, _warning: "⚠️ FMP 검증 데이터 없음. 투자 전 반드시 검증 필요.",
        }));

      if (positiveInFiltered.length > 0) {
        topPicksFinal = positiveInFiltered;
        console.log(`[Top Picks Fallback] 긍정적 언급 종목 ${positiveInFiltered.length}개: ${positiveInFiltered.map(t => t.ticker).join(", ")}`);
      }
    }

    if (topPicksFinal.length > 0) console.log(`[Top Picks] 최종 ${topPicksFinal.length}개 선별:`, topPicksFinal.map(t => `${t.ticker}(${t.conviction_score}점, ${t.reliability_tier})`).join(", "));
    else console.log(`[Top Picks] 적격 종목 없음 - top_picks 비어있음 (FMP 검증 또는 긍정적 언급 종목 필요)`);

    const referenceOnlyTickers = filteredTickers
      .filter(t => !isTopPicksEligible(t))
      .map(t => ({ ...t, _reference_only: true, _warning: "⚠️ LLM 추정값. Top Picks 대상 아님. 참고용으로만 활용하세요." }));

    const verifiedCount = filteredTickers.filter(t => t._verified).length;
    const unverifiedCount = filteredTickers.filter(t => !t._verified).length;
    const fmpVerifiedTickers = filteredTickers.filter(t => t.fmp_verified).map(t => t.ticker);
    const fmpUnverifiedTickers = filteredTickers.filter(t => !t.fmp_verified).map(t => t.ticker);

    const result = {
      analysis_date: analysisDate, market_type: marketType, market_label: marketLabel,
      source: { video_info: videoInfo, mentioned_tickers_count: mentionedTickers.length },
      data_quality: {
        use_real_data_only: this.use_real_data_only, fmp_api_available: !!this.fmp_api_key, fmp_plan: fmpPlan,
        fmp_calls_this_run: fmpCallsUsed - (this.fmp_daily_calls_used || 0), fmp_total_calls_today: fmpCallsUsed,
        fmp_daily_limit: fmpConfig.daily_limit, fmp_remaining: fmpConfig.daily_limit === Infinity ? "Unlimited" : fmpConfig.daily_limit - fmpCallsUsed,
        quota_exceeded: quotaExceeded, quota_strategy: quotaStrategy, skipped_unverified: skippedUnverified,
        verified_tickers: verifiedCount, unverified_tickers: unverifiedCount,
        verification_rate: filteredTickers.length > 0 ? `${((verifiedCount / filteredTickers.length) * 100).toFixed(1)}%` : "N/A",
        warning: quotaExceeded
          ? `⚠️ FMP API 쿼터 초과! 전략: ${quotaStrategy}. ${quotaStrategy === "fallback" ? "일부 종목은 LLM 추정값입니다." : quotaStrategy === "skip_unverified" ? `${skippedUnverified}개 미검증 종목이 제외되었습니다.` : ""}`
          : unverifiedCount > 0 ? `${unverifiedCount}개 종목은 실제 데이터 없이 LLM 추정값입니다. 투자 전 반드시 검증하세요.` : null,
      },
      fmp_verification_summary: {
        fmp_api_used: !!this.fmp_api_key, verified_tickers: fmpVerifiedTickers, verified_count: fmpVerifiedTickers.length,
        unverified_tickers: fmpUnverifiedTickers, unverified_count: fmpUnverifiedTickers.length,
        note: fmpVerifiedTickers.length > 0 ? `✅ ${fmpVerifiedTickers.join(", ")} 종목은 FMP API 실제 데이터입니다.` : "❌ FMP API 데이터 없음. 모든 종목이 LLM 추정값입니다.",
      },
      analysis_criteria: this.analysis_criteria, llm_model: this.llm_model,
      sector_analyses: sortedResults.map(({ index, ...rest }) => rest),
      top_picks: topPicksFinal,
      top_picks_criteria: {
        min_score: TOP_PICKS_MIN_SCORE, eligible_conditions: ["FMP 검증됨", "긍정적 언급됨 (outlook: positive)"],
        excluded_sources: ["LLM_SUPPLEMENT", "LLM_ESTIMATE"], excluded_mentions: "단순 언급 (긍정적 언급 아님)",
        reliability_tiers: { "Tier 1": "FMP 검증 + 긍정적 언급 (최고 신뢰)", "Tier 2": "FMP 검증 (실제 데이터)", "Tier 3": "긍정적 언급 (전문가 추천)", "Tier 4": "기타 (참고용)" },
      },
      score_criteria: {
        description: "conviction_score 가산점/감점 시스템",
        bonus_factors: {
          earnings_growth: "+3점 (실적 성장률 양수)", revenue_growth: "+3점 (매출 성장률 양수)",
          earnings_surprise: "+5점 (어닝 서프라이즈)", technical_bullish: "+4점 (기술적 상승 신호)",
          above_ma: "+2점 (이평선 상단)", catalysts: "+3점/개 (최대 +9점)",
          policy_positive: "+5점 (정책 수혜)", options_bullish: "+3점 (콜옵션 우위)",
          positive_mention: "+5점 (긍정적 언급)",
        },
        penalty_factors: { unverified: "-5점 (미검증 종목)", risk_per_item: "-2점/개 (최대 -10점)", fmp_data_missing: "-3점 (재무데이터 불완전)", year_high_drop_20: "-5점 (52주고점대비 -20% 이상)", year_high_drop_30: "-10점 (52주고점대비 -30% 이상)", year_high_drop_40: "-15점 (52주고점대비 -40% 이상)" },
      },
      positive_stocks_summary: { count: positiveKeyStocks.size, tickers: [...positiveKeyStocks], korean_names: [...positiveKeyStocksKr] },
      reference_only_tickers: referenceOnlyTickers,
      all_recommended_tickers: filteredTickers.map(t => ({
        ...t, conviction_score_display: `${t.conviction_score || t.score || 0}점`,
        is_top_picks_eligible: isTopPicksEligible(t), is_positively_mentioned: isPositivelyMentioned(t),
      })),
      excluded_unverified_tickers: quotaStrategy === "skip_unverified" ? allTickers.filter(t => !t._verified) : [],
      summary: {
        total_sectors_analyzed: sortedResults.length, total_tickers_before_filter: allTickers.length,
        total_tickers_recommended: filteredTickers.length, top_picks_count: topPicksFinal.length,
        reference_only_count: referenceOnlyTickers.length,
        positively_mentioned_count: filteredTickers.filter(t => isPositivelyMentioned(t)).length,
        skipped_by_quality_filter: skippedByQuality, skipped_by_quota_strategy: skippedUnverified,
        video_mentioned_included: filteredTickers.filter(t => t.mentioned_in_video).length,
        verified_with_real_data: verifiedCount, strongest_conviction: topPicksFinal[0] || null,
        filter_criteria: {
          min_conviction_score: RECOMMENDATION_FILTER.min_conviction_score, top_picks_min_score: TOP_PICKS_MIN_SCORE,
          valid_recommendations: RECOMMENDATION_FILTER.valid_recommendations, top_picks_eligible: ["fmp_verified", "positively_mentioned"],
        },
      },
      generated_at: new Date().toISOString(),
    };

    $.export("ticker_analysis", result);
    return result;
  },
});
