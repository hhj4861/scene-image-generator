import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Shorts Generator",
  description: "주식 분석 결과로 YouTube Shorts 대본 생성",

  props: {
    // =====================
    // 테스트 모드 설정
    // =====================
    test_mode: {
      type: "boolean",
      label: "테스트 모드",
      description: "테스트 모드 활성화 시 LLM 호출 없이 2개 씬만 생성 (전체 파이프라인 테스트용)",
      default: false,
      optional: true,
    },

    // =====================
    // 이전 단계 데이터
    // =====================
    market_analysis_output: {
      type: "string",
      label: "Market Analysis Output (JSON)",
      description: "Stock Market Analyzer 결과: {{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}",
      optional: true,
    },
    sector_analysis_output: {
      type: "string",
      label: "Sector Analysis Output (JSON)",
      description: "Stock Sector Analyzer 결과: {{JSON.stringify(steps.Stock_Sector_Analyzer.$return_value)}}",
      optional: true,
    },
    ticker_analysis_output: {
      type: "string",
      label: "Ticker Analysis Output (JSON)",
      description: "Stock Ticker Analyzer 결과: {{JSON.stringify(steps.Stock_Ticker_Analyzer.$return_value)}}",
      optional: true,
    },

    // =====================
    // Shorts 대본 설정
    // =====================
    shorts_style: {
      type: "string",
      label: "콘텐츠 스타일",
      options: [
        { label: "뉴스 브리핑 (전문적)", value: "news" },
        { label: "친근한 설명 (MZ세대)", value: "casual" },
        { label: "긴급 속보 (임팩트)", value: "breaking" },
        { label: "교육적 (초보자용)", value: "educational" },
      ],
      default: "casual",
    },
    shorts_duration: {
      type: "integer",
      label: "영상 길이 (초)",
      default: 60,
    },

    // =====================
    // API Keys
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      secret: true,
      optional: true,
    },
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key",
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
        { label: "🔵 GPT-4o (최고 정확도)", value: "gpt-4o" },
        { label: "🔵 GPT-4o-mini (균형)", value: "gpt-4o-mini" },
        { label: "🟢 Gemini 2.5 Pro (정확)", value: "gemini-2.5-pro" },
        { label: "🟢 Gemini 2.5 Flash (빠름)", value: "gemini-2.5-flash" },
        { label: "🟢 Gemini 2.0 Flash (저가)", value: "gemini-2.0-flash" },
      ],
      default: "auto",
    },
    llm_priority: {
      type: "string",
      label: "LLM 우선순위",
      options: [
        { label: "정확도 우선", value: "accuracy" },
        { label: "균형", value: "balanced" },
        { label: "비용 우선", value: "cost" },
      ],
      default: "balanced",
    },
  },

  async run({ $ }) {
    // ==========================================
    // 데이터 파싱
    // ==========================================
    let marketData = null, sectorData = null, tickerData = null;

    if (this.market_analysis_output) {
      try {
        marketData = typeof this.market_analysis_output === "string"
          ? JSON.parse(this.market_analysis_output) : this.market_analysis_output;
      } catch (e) { console.error("Market data parse error:", e.message); }
    }
    if (this.sector_analysis_output) {
      try {
        sectorData = typeof this.sector_analysis_output === "string"
          ? JSON.parse(this.sector_analysis_output) : this.sector_analysis_output;
      } catch (e) { console.error("Sector data parse error:", e.message); }
    }
    if (this.ticker_analysis_output) {
      try {
        tickerData = typeof this.ticker_analysis_output === "string"
          ? JSON.parse(this.ticker_analysis_output) : this.ticker_analysis_output;
      } catch (e) { console.error("Ticker data parse error:", e.message); }
    }

    if (!marketData && !sectorData && !tickerData) {
      throw new Error("최소 하나의 분석 결과가 필요합니다.");
    }

    // 데이터 추출 (stock-market-analyzer.mjs 출력 구조에 맞춤)
    // market-analyzer 출력: { analysis_date, market_type, market_label, source, analysis: {...} }
    const marketAnalysis = marketData?.analysis || marketData?.market_analysis || marketData || {};
    const videoInfo = marketAnalysis?.video_info || marketData?.video_info || {};
    const analysisDate = marketData?.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabel = marketData?.market_label ||
      (marketData?.market_type === "us" ? "미국" : marketData?.market_type === "kr" ? "한국" : "글로벌");

    // 날짜를 "12월 16일" 형식으로 변환 (전일자 기준)
    const formatDateKorean = (dateStr) => {
      const date = new Date(dateStr);
      // 전일자로 변환 (영상/뉴스는 전일 분석이므로)
      date.setDate(date.getDate() - 1);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}월 ${day}일`;
    };
    const formatDateEnglish = (dateStr) => {
      const date = new Date(dateStr);
      date.setDate(date.getDate() - 1);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    };
    const analysisDateKorean = formatDateKorean(analysisDate);
    const analysisDateEnglish = formatDateEnglish(analysisDate);

    // 시장 라벨 영문 변환 (공통)
    const marketLabelEnMap = {
      "글로벌": "Global", "미국": "US", "한국": "Korea",
      "중국": "China", "일본": "Japan", "유럽": "Europe",
    };
    const marketLabelEn = marketLabelEnMap[marketLabel] || marketLabel;

    const marketSummary = marketAnalysis.executive_summary || marketAnalysis.summary || "";
    const keyPoints = marketAnalysis.key_points || [];
    const marketOutlook = marketAnalysis.market_outlook || {};
    const recommendedSectors = sectorData?.recommended_sectors || marketAnalysis.recommended_sectors || [];
    const topPicks = tickerData?.recommended_tickers || marketAnalysis.top_picks || [];

    // ==========================================
    // 나레이션을 분할하여 timed_subtitles 생성 (공통 함수)
    // 한글/영문 동일 타이밍으로 분할
    // ==========================================
    const splitNarrationToSubtitles = (text, textEn, duration) => {
      if (!text) return [{ start_time: 0, end_time: duration, text_ko: "", text_en: textEn || "" }];

      // 말줄임표(...) 처리: 임시 치환
      const ellipsisPlaceholder = "<<<ELLIPSIS>>>";
      let processedText = text.replace(/\.{2,}/g, ellipsisPlaceholder);
      let processedTextEn = (textEn || "").replace(/\.{2,}/g, ellipsisPlaceholder);

      // 한글: 구분자로 분할 (쉼표, 마침표, 느낌표, 물음표)
      let partsKo = processedText.split(/(?<=[,，.。!！?？])\s*/)
        .map(p => p.replace(ellipsisPlaceholder, "...").trim())
        .filter(p => p && p.length > 1);

      // 영문: 구분자로 분할
      let partsEn = processedTextEn.split(/(?<=[,!?.])\s*/)
        .map(p => p.replace(ellipsisPlaceholder, "...").trim())
        .filter(p => p && p.length > 1);

      // 한글 분할 안 되면 공백 기준으로 반으로
      if (partsKo.length <= 1) {
        const words = text.split(/\s+/);
        const mid = Math.ceil(words.length / 2);
        if (words.length >= 4) {
          partsKo = [
            words.slice(0, mid).join(" "),
            words.slice(mid).join(" "),
          ];
        }
      }

      // 영문 분할 안 되면 공백 기준으로 반으로
      if (partsEn.length <= 1 && textEn) {
        const words = textEn.split(/\s+/);
        const mid = Math.ceil(words.length / 2);
        if (words.length >= 4) {
          partsEn = [
            words.slice(0, mid).join(" "),
            words.slice(mid).join(" "),
          ];
        }
      }

      // 여전히 1개면 그대로 반환
      if (partsKo.length <= 1) {
        return [{ start_time: 0, end_time: duration, text_ko: text, text_en: textEn || "" }];
      }

      // 한글 파트 수에 맞춰 영문도 맞추기
      const partCount = partsKo.length;
      const segmentDuration = duration / partCount;

      // 영문 파트가 한글보다 적으면 마지막 항목 재사용, 많으면 자르기
      while (partsEn.length < partCount) {
        partsEn.push(partsEn[partsEn.length - 1] || "");
      }
      partsEn = partsEn.slice(0, partCount);

      return partsKo.map((partKo, idx) => ({
        start_time: Math.round(idx * segmentDuration * 10) / 10,
        end_time: Math.round((idx + 1) * segmentDuration * 10) / 10,
        text_ko: partKo.trim(),
        text_en: partsEn[idx]?.trim() || "",
      }));
    };

    // ==========================================
    // 테스트 모드: key_points 기반 2개 씬 생성 (섹터/종목 추천 스킵!)
    // ==========================================
    if (this.test_mode) {
      console.log("🧪 테스트 모드 - key_points 기반 2개 씬 생성 (LLM 스킵)");
      console.log("⏭️ 섹터/종목 추천 스킵 (테스트 모드)");
      console.log(`📊 key_points: ${keyPoints.length}개`);

      // 나레이션 요약 함수 (8초 = 약 40음절)
      const summarizeFor8Seconds = (text, maxLength = 45) => {
        if (!text || text.length <= maxLength) return text;
        // 문장 구분자로 자르기
        const sentences = text.split(/(?<=[.!?。！？])\s*/);
        let result = "";
        for (const sentence of sentences) {
          if ((result + sentence).length <= maxLength) {
            result += sentence;
          } else {
            break;
          }
        }
        // 문장으로 안 되면 글자 수로 자르기
        if (!result || result.length < 10) {
          result = text.substring(0, maxLength - 3) + "...";
        }
        return result;
      };

      // key_points에서 2개 사용 (Market Analyzer 테스트 모드가 2개 생성)
      const kp1 = keyPoints[0] || "오늘 시장은 혼조세를 보였습니다.";
      const kp2 = keyPoints[1] || keyPoints[0] || "투자에 주의가 필요합니다.";

      // 각 씬 8초용 나레이션 생성
      const scene1Narration = summarizeFor8Seconds(kp1);
      const scene2Narration = summarizeFor8Seconds(kp2);

      // 간단한 영문 생성 (키워드 기반)
      const generateSimpleEnglish = (koreanText) => {
        // 주요 키워드 매핑
        const keywordMap = {
          "상승": "rises", "하락": "falls", "급등": "surges", "급락": "plunges",
          "강세": "bullish", "약세": "bearish", "혼조": "mixed",
          "반도체": "semiconductor", "AI": "AI", "테슬라": "Tesla", "엔비디아": "NVIDIA",
          "애플": "Apple", "마이크론": "Micron", "삼성": "Samsung",
          "데이터센터": "data center", "규제": "regulation", "완화": "easing",
          "기대감": "expectations", "우려": "concerns", "전망": "outlook",
          "실적": "earnings", "목표가": "price target", "투자": "investment",
          "시장": "market", "주가": "stock price", "종목": "stocks",
        };

        let english = koreanText;
        let foundKeywords = [];

        // 키워드 찾기
        for (const [ko, en] of Object.entries(keywordMap)) {
          if (koreanText.includes(ko)) {
            foundKeywords.push(en);
          }
        }

        // 영문 문장 생성
        if (foundKeywords.length >= 2) {
          return `${foundKeywords.slice(0, 3).join(", ")} - market update`;
        } else if (foundKeywords.length === 1) {
          return `${foundKeywords[0]} market news`;
        }
        return "Market news update";
      };

      const scene1NarrationEn = generateSimpleEnglish(scene1Narration);
      const scene2NarrationEn = generateSimpleEnglish(scene2Narration);

      const testShortsScript = {
        title: `${analysisDateKorean} ${marketLabel} 증시`,
        title_english: `${marketLabelEn} Market ${analysisDate}`,
        full_script: `${scene1Narration} ${scene2Narration}`,
        presenter: {
          name: "준호",
          gender: "male",
          age: "early_30s",
          appearance: "Professional Korean man, short black hair, navy suit",
          voice_style: "warm, friendly, professional Korean male voice",
        },
        scenes: [
          {
            scene_number: 1,
            duration: 8,
            narration: scene1Narration,
            narration_english: scene1NarrationEn,
            timed_subtitles: splitNarrationToSubtitles(scene1Narration, scene1NarrationEn, 8),
            emotion: "serious",
            visual_description: "professional news anchor presenting market data",
            background: "stock market chart background",
            part: "key_point",
          },
          {
            scene_number: 2,
            duration: 8,
            narration: scene2Narration,
            narration_english: scene2NarrationEn,
            timed_subtitles: splitNarrationToSubtitles(scene2Narration, scene2NarrationEn, 8),
            emotion: "serious",
            visual_description: "focused expression explaining market trends",
            background: "financial news studio",
            part: "key_point",
          },
        ],
        total_duration: 16,
        scene_count: 2,
        hashtags: ["#주식", `#${marketLabel}주식`, "#투자", "#증시"],
      };

      console.log(`   📝 Scene 1: ${scene1Narration}`);
      console.log(`   📝 Scene 2: ${scene2Narration}`);

      console.log(`✅ 테스트 대본 생성: 2개 씬, ${testShortsScript.total_duration}초`);

      const testResult = {
        analysis_date: analysisDate,
        market_label: marketLabel,
        shorts_script: testShortsScript,
        source_summary: {
          video_title: videoInfo.title || "[테스트]",
          market_outlook: marketOutlook.sentiment,
          key_points_count: keyPoints.length,
        },
        _test_mode: true,
        _skip_recommendations: true,  // 섹터/종목 추천 스킵 플래그
        generated_at: new Date().toISOString(),
      };

      // 테스트 모드 플래그 export (Pipedream에서 조건부 실행용)
      $.export("skip_sector_analyzer", true);
      $.export("skip_ticker_analyzer", true);
      $.export("shorts_script", testShortsScript);
      $.export("$summary", `[테스트] Shorts 대본: 2씬, 10초 (추천 스킵)`);
      return testResult;
    }

    // ==========================================
    // LLM 설정
    // ==========================================
    const MODEL_INFO = {
      "gpt-4o": { provider: "openai", accuracy: 95, cost: 5 },
      "gpt-4o-mini": { provider: "openai", accuracy: 85, cost: 2 },
      "gemini-2.5-pro": { provider: "gemini", accuracy: 93, cost: 4 },
      "gemini-2.5-flash": { provider: "gemini", accuracy: 85, cost: 2 },
      "gemini-2.0-flash": { provider: "gemini", accuracy: 78, cost: 1 },
    };

    const selectBestModel = () => {
      const priority = this.llm_priority || "balanced";
      const hasOpenAI = !!this.openai_api_key;
      const hasGemini = !!this.gemini_api_key;

      const available = Object.entries(MODEL_INFO)
        .filter(([_, i]) => (i.provider === "openai" && hasOpenAI) || (i.provider === "gemini" && hasGemini))
        .map(([m, i]) => ({ model: m, ...i }));

      if (!available.length) throw new Error("사용 가능한 API 키가 없습니다.");

      if (priority === "accuracy") return available.sort((a, b) => b.accuracy - a.accuracy)[0].model;
      if (priority === "cost") return available.sort((a, b) => a.cost - b.cost)[0].model;
      const qualified = available.filter(m => m.accuracy >= 80);
      return (qualified.length ? qualified : available).sort((a, b) => (b.accuracy / b.cost) - (a.accuracy / a.cost))[0].model;
    };

    const resolvedModel = this.llm_model === "auto" ? selectBestModel() : this.llm_model;
    const modelInfo = MODEL_INFO[resolvedModel] || { provider: "gemini" };
    console.log(`[LLM] Using: ${resolvedModel}`);

    // LLM 호출 함수
    const callLLM = async (prompt, temperature = 0.7) => {
      if (modelInfo.provider === "openai") {
        const resp = await axios($, {
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          headers: { "Authorization": `Bearer ${this.openai_api_key}`, "Content-Type": "application/json" },
          data: { model: resolvedModel, messages: [{ role: "user", content: prompt }], temperature, max_tokens: 4096 },
        });
        return resp.choices[0].message.content;
      } else {
        const resp = await axios($, {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`,
          method: "POST",
          headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" },
          data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: 4096 } },
        });
        return resp.candidates[0].content.parts[0].text;
      }
    };

    // ==========================================
    // Duration 계산
    // ==========================================
    const calculateDuration = (text) => {
      if (!text) return 4;
      const syllables = text.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
      const duration = Math.ceil(syllables / 5);
      if (duration <= 4) return 4;
      if (duration <= 6) return 6;
      return 8;
    };

    // ==========================================
    // 스타일 설정
    // ==========================================
    const styleGuides = {
      news: { tone: "전문적이고 객관적인 뉴스 앵커 톤", hook: "오늘의 증시 핵심 뉴스입니다.", character: "금융 전문가" },
      casual: { tone: "친근한 MZ세대 말투", hook: "야, 오늘 장 미쳤다~!", character: "친근한 투자 전문가" },
      breaking: { tone: "긴박한 속보 톤", hook: "긴급 속보!", character: "속보 앵커" },
      educational: { tone: "차분한 선생님 톤", hook: "오늘은 이것만 알아가세요!", character: "투자 교육 전문가" },
    };
    const style = styleGuides[this.shorts_style] || styleGuides.casual;
    const hookLine = marketAnalysis.hook_line || style.hook;
    const narrativeSummary = marketAnalysis.narrative_summary || marketSummary;

    // ==========================================
    // 동적 씬 계산 (인사말 + key_points + 추천(있을 때만) + 마무리)
    // ==========================================
    const keyPointCount = keyPoints.length;
    const openingScenes = 1; // 인사말 (4초)
    const keyPointScenes = keyPointCount; // key_point 1개 = 1씬 (8초)
    const hasRecommendations = topPicks.length >= 2;  // 추천 종목이 2개 이상일 때만
    const recommendScenes = hasRecommendations ? 2 : 0; // 추천 종목 없으면 스킵!
    const closingScenes = 2; // 마무리 + 면책
    const totalScenes = openingScenes + keyPointScenes + recommendScenes + closingScenes;
    const totalDuration = 4 + (keyPointScenes * 8) + (recommendScenes * 8) + (4 + 4); // 인사(4초) + key_points(8초씩) + 추천(0-16초) + 마무리(8초)

    console.log(`📊 인사(1) + key_points(${keyPointCount}) + 추천(${recommendScenes}) + 마무리(2) → 총 ${totalScenes}씬, ${totalDuration}초`);
    if (!hasRecommendations) {
      console.log(`⚠️ 추천 종목 없음 - 추천 씬 생략`);
    }

    // key_points를 씬 목록으로 변환 (씬2부터 시작!)
    const keyPointsList = keyPoints.map((kp, i) =>
      `- 씬${i + 2} (8초): "${kp}" → 40음절 이내로 요약`
    ).join("\n");

    // ==========================================
    // Shorts 대본 생성
    // ==========================================
    const shortsPrompt = `
당신은 유명 금융 유튜버입니다. ${totalDuration}초 분량의 YouTube 대본을 작성하세요.
스타일: ${style.character}

===== 분석 데이터 (제공된 내용만 사용!) =====
분석일: ${analysisDate} | 시장: ${marketLabel}
${videoInfo.title ? `원본: ${videoInfo.title}` : ""}

[요약] ${narrativeSummary}

[핵심 포인트 - ${keyPointCount}개] (각각 1씬 = 8초로 변환!)
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

[시장 전망] ${marketOutlook.sentiment || "혼조세"} (신뢰도: ${marketOutlook.confidence || "N/A"}%)

╔══════════════════════════════════════════════════════════════╗
║ 🚨 [허용된 종목] (ONLY THESE!)                                ║
${topPicks.slice(0, 4).map((t, i) => `║ ${i + 1}. ${t.ticker} = ${t.company_name_kr || t.company_name}`).join("\n") || "║ 없음"}
║ ❌ 위 목록에 없는 종목 언급 금지!                             ║
╚══════════════════════════════════════════════════════════════╝

[추천 종목 상세]
${topPicks.slice(0, 3).map((t, i) => `${i + 1}. ${t.ticker} (${t.company_name_kr}): ${t.investment_thesis?.substring(0, 50) || "성장 기대"}...`).join("\n") || "없음"}

[리스크] ${(marketAnalysis.risk_factors || []).slice(0, 3).join(", ") || "시장 변동성"}
====================

🚨🚨🚨 절대 금지 사항 🚨🚨🚨
1. 숫자 환각: 제공되지 않은 수치 (%, 달러) 금지
2. 종목 환각: [허용된 종목] 외 다른 종목 언급 금지!
3. 뉴스 환각: [핵심 포인트]에 없는 뉴스/이슈 금지!
4. 각 key_point는 반드시 40음절(8초) 이내로 요약!

★★★ 구조: 총 ${totalScenes}씬, ${totalDuration}초 ★★★

🎬 씬1: 오프닝 인사 (4초, 16~20음절!)
- "여러분, ${analysisDateKorean} ${marketLabel}증시 핵심 정리해요!" (약 20음절)
- emotion: "friendly", visual: "waving hand, warm smile", background: "modern studio"

📊 PART 1: 핵심 포인트 (씬2~${keyPointCount + 1}, 각 8초)
⚠️ 각 [핵심 포인트]를 40음절 이내로 요약하여 1씬씩 배정!
${keyPointsList}

${hasRecommendations ? `🔗 PART 1→2 전환 (씬${keyPointCount + 1} 마지막에 포함!)
- 마지막 key_point 씬의 narration 끝에 자연스럽게 추가:
- 예: "[key_point 내용]... 그래서 주목할 종목은요!" 또는 "이런 상황에서 뭘 사야 할까요?"

🎯 PART 2: 섹터/종목 추천 (씬${keyPointCount + 2}~${keyPointCount + 3}, 16초)
- 씬${keyPointCount + 2} (8초): "${topPicks[0]?.sector || "기술"} 섹터 강세! ${topPicks[0]?.ticker} ${topPicks[0]?.company_name_kr} 주목해보세요!"
- 씬${keyPointCount + 3} (8초): "또 하나! ${topPicks[1]?.ticker} ${topPicks[1]?.company_name_kr}도 좋아 보여요!"

🔚 PART 3: 마무리 + 면책 (씬${keyPointCount + 4}~${keyPointCount + 5}, 10초)
- 씬${keyPointCount + 4} (6초): "단, [리스크 5음절 이내] 조심! 도움이 되셨다면, 구독과 좋아요!"
  - ⚠️ 리스크는 반드시 5음절 이내로 요약! (예: "변동성", "금리", "경쟁 심화")
  - 예: "단, 변동성 조심! 도움이 되셨다면, 구독과 좋아요!" (약 22음절)
- 씬${keyPointCount + 5} (4초): 면책 조항 (필수!) "본 영상은 투자 권유가 아닙니다"

💡 PART 2→3 자연스러운 흐름:
- 종목 추천 후 바로 "단, [리스크] 조심하세요!"로 연결
- "하지만 주의할 점도 있어요!" 같은 별도 전환 문구 불필요!` : `⚠️ 추천 종목 데이터 없음 - 종목 추천 씬 생략!
❌ 절대로 종목을 추천하거나 언급하지 마세요!

🔚 PART 2: 마무리 + 면책 (씬${keyPointCount + 2}~${keyPointCount + 3}, 10초)
- 씬${keyPointCount + 2} (6초): "단, [리스크 5음절 이내] 조심! 도움이 되셨다면, 구독과 좋아요!"
  - ⚠️ 리스크는 반드시 5음절 이내로 요약! (예: "변동성", "금리", "경쟁 심화")
- 씬${keyPointCount + 3} (4초): 면책 조항 (필수!) "본 영상은 투자 권유가 아닙니다"`}

JSON 출력 형식:
\`\`\`json
{
  "title": "영상 제목 (15자 이내)",
  "title_english": "English Title (short)",
  "full_script": "전체 대본 연결",
  "presenter": {
    "name": "준호",
    "gender": "male",
    "age": "early_30s",
    "appearance": "Professional young Korean man, clean-shaven, short black hair, navy suit with white shirt, confident posture",
    "voice_style": "warm, friendly, professional Korean male voice"
  },
  "scenes": [
    // 씬1: 오프닝 인사 (필수!)
    {
      "scene_number": 1, "duration": 4,
      "narration": "여러분, ${analysisDateKorean} ${marketLabel}증시 핵심 정리해요!",
      "narration_english": "Hello! Key ${marketLabelEn} market summary for ${analysisDateEnglish}!",
      "timed_subtitles": [{"start_time": 0, "end_time": 4, "text_ko": "여러분, ${analysisDateKorean} ${marketLabel}증시 핵심 정리해요!", "text_en": "Hello! Key ${marketLabelEn} market summary!"}],
      "emotion": "friendly", "visual_description": "waving hand, warm smile", "background": "modern studio", "part": "opening"
    },

    // 씬2~: 핵심 포인트 (${keyPointCount}씬, 각 8초)
    {
      "scene_number": 2, "duration": 8,
      "narration": "[핵심포인트1 요약 40음절]",
      "narration_english": "[Key point 1 English summary]",
      "timed_subtitles": [{"start_time": 0, "end_time": 8, "text_ko": "[핵심포인트1 요약]", "text_en": "[Key point 1 summary]"}],
      "emotion": "serious", "visual_description": "serious expression", "background": "news studio", "part": "key_point"
    },
    // ... 중간 key_point 씬들 (동일 형식) ...
    {
      "scene_number": ${keyPointCount + 1}, "duration": 8,
      "narration": "[마지막 핵심포인트]${hasRecommendations ? " 그래서 주목할 종목은요!" : ""}",
      "narration_english": "[Last key point]${hasRecommendations ? " So which stocks to watch?" : ""}",
      "timed_subtitles": [{"start_time": 0, "end_time": 8, "text_ko": "[마지막 핵심포인트]", "text_en": "[Last key point]"}],
      "emotion": "${hasRecommendations ? "curious" : "serious"}", "visual_description": "${hasRecommendations ? "expectant look" : "serious expression"}", "background": "news studio", "part": "key_point"
    },
${hasRecommendations ? `
    // 종목 추천 (2씬) - topPicks 데이터 기반!
    {
      "scene_number": ${keyPointCount + 2}, "duration": 8,
      "narration": "${topPicks[0]?.sector || "기술"} 섹터 강세! ${topPicks[0]?.ticker} ${topPicks[0]?.company_name_kr} 주목해보세요!",
      "narration_english": "${topPicks[0]?.sector || "Tech"} sector strong! Watch ${topPicks[0]?.ticker}!",
      "timed_subtitles": [{"start_time": 0, "end_time": 8, "text_ko": "[섹터명] 섹터 강세! [종목1] 주목!", "text_en": "[Sector] strong! Watch [Stock1]!"}],
      "emotion": "confident", "visual_description": "thumbs up", "background": "sector chart", "part": "recommendation"
    },
    {
      "scene_number": ${keyPointCount + 3}, "duration": 8,
      "narration": "또 하나! ${topPicks[1]?.ticker} ${topPicks[1]?.company_name_kr}도 좋아 보여요!",
      "narration_english": "One more! ${topPicks[1]?.ticker} looks good too!",
      "timed_subtitles": [{"start_time": 0, "end_time": 8, "text_ko": "또 하나! [종목2]도 좋아 보여요!", "text_en": "One more! [Stock2] looks good!"}],
      "emotion": "excited", "visual_description": "pointing up", "background": "stock ticker", "part": "recommendation"
    },
` : ""}
    // 마무리 (2씬)
    {
      "scene_number": ${keyPointCount + (hasRecommendations ? 4 : 2)}, "duration": 6,
      "narration": "단, [리스크] 조심! 도움이 되셨다면, 구독과 좋아요!",
      "narration_english": "But watch [risk]! Subscribe and like!",
      "timed_subtitles": [{"start_time": 0, "end_time": 6, "text_ko": "단, [리스크] 조심! 구독과 좋아요!", "text_en": "Watch [risk]! Subscribe & like!"}],
      "emotion": "cautious", "visual_description": "cautious look, then thumbs up", "background": "warning accent", "part": "closing"
    },
    {
      "scene_number": ${keyPointCount + (hasRecommendations ? 5 : 3)}, "duration": 4,
      "narration": "본 영상은 투자 권유가 아닙니다",
      "narration_english": "This is not investment advice",
      "timed_subtitles": [{"start_time": 0, "end_time": 4, "text_ko": "본 영상은 투자 권유가 아닙니다", "text_en": "This is not investment advice"}],
      "emotion": "serious", "visual_description": "direct gaze", "background": "minimal background", "is_disclaimer": true, "part": "disclaimer"
    }
  ],
  "total_duration": ${totalDuration},
  "hashtags": ["#주식", "#${marketLabel}주식", "#투자"],
  "scene_count": ${totalScenes}
}
\`\`\`

★★★ 핵심 규칙 ★★★
1. 씬1: 인사말 필수! "여러분, ${analysisDateKorean} ${marketLabel}증시 핵심 정리해요!" (4초, 20음절)
2. 씬2~${keyPointCount + 1}: 핵심 포인트 ${keyPointCount}개 (각 8초, 40음절 이내 요약!)
★ 영문 번역 필수: 모든 씬에 narration_english 포함, title_english도 필수!
★ 자막 필수: 모든 씬에 timed_subtitles 배열 포함! (text_ko, text_en 모두 포함)
${hasRecommendations ? `3. 🔗 PART 전환:
   - 씬${keyPointCount + 1} (마지막 key_point) 끝: "...그래서 주목할 종목은요!" 추가
   - 씬${keyPointCount + 4} (마무리): "단, [리스크] 조심하세요! 구독 좋아요!" (리스크와 구독 자연 연결)
4. 종목 추천은 반드시 제공된 topPicks 데이터만 사용!` : `3. ❌ 종목 추천 금지! topPicks 데이터가 없으므로 어떤 종목도 언급하지 마세요!
4. 마지막 key_point 씬에서 바로 마무리로 연결`}
5. 숫자/종목/뉴스 환각 금지
6. visual_description은 영어로, 텍스트 삽입 금지
7. 마지막 씬: "본 영상은 투자 권유가 아닙니다" (is_disclaimer: true)
8. 캐릭터/목소리 일관성 유지
`;

    console.log("📝 Shorts 대본 생성 중...");
    const scriptResult = await callLLM(shortsPrompt, 0.7);
    const jsonMatch = scriptResult.match(/```json\s*([\s\S]*?)\s*```/);
    let shortsScript = JSON.parse(jsonMatch ? jsonMatch[1] : scriptResult);

    // Duration 검증 및 보정
    if (shortsScript.scenes) {
      // 면책 씬 확인 및 자동 추가
      const hasDisclaimer = shortsScript.scenes.some(s =>
        s.is_disclaimer || s.narration?.includes("투자 권유가 아닙니다")
      );

      if (!hasDisclaimer) {
        console.log("⚠️ 면책 씬 없음 - 자동 추가");
        shortsScript.scenes.push({
          scene_number: shortsScript.scenes.length + 1,
          duration: 4,
          narration: "본 영상은 투자 권유가 아닙니다",
          emotion: "serious",
          visual_description: "정면 응시, 진지한 표정",
          background: "깔끔한 단색 배경",
          is_disclaimer: true,
        });
      }

      let currentTime = 0;
      shortsScript.scenes = shortsScript.scenes.map((scene, idx) => {
        const duration = calculateDuration(scene.narration);
        const startTime = currentTime;
        currentTime += duration;

        // timed_subtitles 자동 생성/분할 (LLM이 생성하지 않았거나 단일 자막인 경우)
        let timedSubtitles = scene.timed_subtitles;
        const needsSplit = !timedSubtitles || timedSubtitles.length === 0 ||
          (timedSubtitles.length === 1 && timedSubtitles[0].start_time === 0 &&
           timedSubtitles[0].end_time >= duration - 0.5);

        if (needsSplit) {
          timedSubtitles = splitNarrationToSubtitles(
            scene.narration || "",
            scene.narration_english || "",
            duration
          );
          console.log(`   📝 Scene ${idx + 1} timed_subtitles 분할 생성 (${timedSubtitles.length}개)`);
        }

        // narration_english 없으면 빈 문자열로 설정
        const narrationEnglish = scene.narration_english || "";

        return {
          ...scene,
          scene_number: idx + 1,
          duration,
          time_range: `${startTime}-${currentTime}초`,
          syllable_count: (scene.narration || "").replace(/[^가-힣a-zA-Z0-9]/g, "").length,
          timed_subtitles: timedSubtitles,
          narration_english: narrationEnglish,
        };
      });
      shortsScript.total_duration = currentTime;
      shortsScript.scene_count = shortsScript.scenes.length;

      // title_english 없으면 기본값 설정
      if (!shortsScript.title_english) {
        shortsScript.title_english = "Stock Market News";
        console.log(`   📝 title_english 자동 설정: ${shortsScript.title_english}`);
      }
    }

    console.log(`✅ 대본 생성 완료: ${shortsScript.scenes?.length || 0}개 씬, ${shortsScript.total_duration || 0}초`);

    // 결과 반환
    const result = {
      analysis_date: analysisDate,
      market_label: marketLabel,
      shorts_script: shortsScript,
      source_summary: {
        video_title: videoInfo.title || null,
        market_outlook: marketOutlook.sentiment,
        key_points_count: keyPoints.length,
        recommended_sectors: recommendedSectors.slice(0, 3).map(s => s.sector_name),
        top_picks: topPicks.slice(0, 5).map(t => ({ ticker: t.ticker, recommendation: t.recommendation })),
      },
      _llm_info: { model: resolvedModel, provider: modelInfo.provider },
      generated_at: new Date().toISOString(),
    };

    $.export("shorts_script", shortsScript);
    $.export("$summary", `Shorts 대본: ${shortsScript.scenes?.length || 0}씬, ${shortsScript.total_duration || 0}초`);
    return result;
  },
});

