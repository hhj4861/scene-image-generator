import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Shorts Generator",
  description: "주식 분석 결과로 YouTube Shorts 대본 생성",
  props: {
    test_mode: { type: "boolean", label: "테스트 모드", default: false, optional: true },
    market_analysis_output: { type: "string", label: "Market Analysis Output (JSON)", optional: true },
    sector_analysis_output: { type: "string", label: "Sector Analysis Output (JSON)", optional: true },
    ticker_analysis_output: { type: "string", label: "Ticker Analysis Output (JSON)", optional: true },
    shorts_style: {
      type: "string", label: "콘텐츠 스타일", default: "casual",
      options: [
        { label: "뉴스 브리핑 (전문적)", value: "news" },
        { label: "친근한 설명 (MZ세대)", value: "casual" },
        { label: "긴급 속보 (임팩트)", value: "breaking" },
        { label: "교육적 (초보자용)", value: "educational" },
      ],
    },
    shorts_duration: { type: "integer", label: "영상 길이 (초)", default: 60 },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true, optional: true },
    openai_api_key: { type: "string", label: "OpenAI API Key", secret: true, optional: true },
    llm_model: {
      type: "string", label: "LLM Model", default: "auto",
      options: [
        { label: "🤖 자동 선택", value: "auto" },
        { label: "🔵 GPT-4o", value: "gpt-4o" },
        { label: "🔵 GPT-4o-mini", value: "gpt-4o-mini" },
        { label: "🟢 Gemini 2.5 Pro", value: "gemini-2.5-pro" },
        { label: "🟢 Gemini 2.5 Flash", value: "gemini-2.5-flash" },
        { label: "🟢 Gemini 2.0 Flash", value: "gemini-2.0-flash" },
      ],
    },
    llm_priority: {
      type: "string", label: "LLM 우선순위", default: "balanced",
      options: [{ label: "정확도 우선", value: "accuracy" }, { label: "균형", value: "balanced" }, { label: "비용 우선", value: "cost" }],
    },
  },

  async run({ $ }) {
    // ========== 헬퍼 함수 ==========
    const parseJSON = (str) => { try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return null; } };
    // 이모티콘 제거 함수 (나레이션/자막용)
    const removeEmojis = (text) => {
      if (!text) return text;
      return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[0-9]\uFE0F?\u20E3|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
    };
    const countSyllables = (text) => {
      if (!text) return 0;
      const cleaned = removeEmojis(text);
      return (cleaned.match(/[가-힣]/g) || []).length + (cleaned.match(/[0-9]/g) || []).length + Math.ceil((cleaned.match(/[a-zA-Z]/g) || []).length / 3);
    };
    const calculateDuration = (text) => {
      if (!text) return 4;
      // 음절 수 기준: 초당 약 5음절 (자연스러운 말하기 속도)
      const syllables = countSyllables(text);
      const dur = Math.ceil(syllables / 5);
      // Veo API: 4, 6, 8만 허용 → 가장 가까운 값으로 올림
      if (dur <= 4) return 4;
      if (dur <= 6) return 6;
      return 8;
    };

    // ========== 데이터 파싱 ==========
    const marketData = parseJSON(this.market_analysis_output);
    const sectorData = parseJSON(this.sector_analysis_output);
    const tickerData = parseJSON(this.ticker_analysis_output);
    if (!marketData && !sectorData && !tickerData) throw new Error("최소 하나의 분석 결과가 필요합니다.");

    const marketAnalysis = marketData?.analysis || marketData?.market_analysis || marketData || {};
    const videoInfo = marketAnalysis?.video_info || marketData?.video_info || {};
    const analysisDate = marketData?.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabelMap = { us: "미국", kr: "한국" };
    const marketLabel = marketData?.market_label || marketLabelMap[marketData?.market_type] || "글로벌";
    const keyPointsStructure = marketData?.key_points_structure || marketAnalysis?.key_points_structure || "auto";
    const isWeeklyOutlook = keyPointsStructure === "weekly_outlook";
    if (isWeeklyOutlook) console.log(`📅 [Weekly Outlook 모드] PART1(핵심포인트)만 구성`);

    // 날짜 포맷
    const formatDate = (dateStr, isEn = false) => {
      const d = new Date(dateStr); d.setDate(d.getDate() - 1);
      if (isEn) return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
      return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    };
    const analysisDateKorean = formatDate(analysisDate);
    const marketLabelEn = { "글로벌": "Global", "미국": "US", "한국": "Korea", "중국": "China", "일본": "Japan", "유럽": "Europe" }[marketLabel] || marketLabel;

    const marketSummary = marketAnalysis.executive_summary || marketAnalysis.summary || "";
    const keyPoints = marketAnalysis.key_points || [];
    const marketOutlook = marketAnalysis.market_outlook || {};
    const recommendedSectors = sectorData?.recommended_sectors || sectorData?.sectors || marketAnalysis.recommended_sectors || [];

    // topPicks 추출 및 중복 제거
    const rawTopPicks = tickerData?.recommended_tickers || tickerData?.top_picks || tickerData?.tickers || tickerData?.analysis?.recommended_tickers || marketAnalysis.top_picks || marketAnalysis.recommended_tickers || [];
    const seenTickers = new Set();
    const topPicks = rawTopPicks.filter(p => p?.ticker && !seenTickers.has(p.ticker.toUpperCase()) && seenTickers.add(p.ticker.toUpperCase()));
    console.log(`📊 데이터: key_points=${keyPoints.length}, sectors=${recommendedSectors.length}, topPicks=${topPicks.length}`);

    // ========== 자막 분할 함수 ==========
    // MAX_SUBTITLE_LENGTH: 한글 자막 최대 길이 (영상 너비 고려, 20자 권장)
    const MAX_SUBTITLE_LENGTH = 20, MIN_SUBTITLE_DURATION = 0.5, NARRATION_START = 0.2, MIN_SYLLABLES = 8;

    const splitNarrationToSubtitles = (text, textEn, duration) => {
      const effectiveDuration = duration - NARRATION_START;
      if (!text) return [{ start_time: NARRATION_START, end_time: duration, text_ko: "", text_en: textEn || "" }];

      const convertSymbols = (s, isEn) => s?.replace(/\$(\d+(?:\.\d+)?)/g, isEn ? '$$$1 dollars' : '$1달러').replace(/(\d)%/g, isEn ? '$1 percent' : '$1퍼센트') || s;
      
      // ★★★ 부자연스러운 종료 패턴 체크 ★★★
      const endsUnnatural = (s) => {
        const trimmed = s.trim();
        // 조사/어미로 끝나면 부자연스러움
        if (/[은는이가을를에의로와과도만]$/.test(trimmed)) return true;
        // 수식어로 끝나면 부자연스러움
        if (/\s(첫|약|내년|올해|지난|이번|총|각|매|전|후)$/.test(trimmed)) return true;
        // 숫자로만 끝나면 부자연스러움 (단위 없이)
        if (/\s\d+$/.test(trimmed)) return true;
        return false;
      };
      
      // ★★★ 짧거나 부자연스러운 부분 병합 ★★★
      const mergeUnnatural = (parts) => {
        if (parts.length <= 1) return parts;
        const merged = [];
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const syl = countSyllables(p);
          const unnatural = endsUnnatural(p);
          
          // 짧거나 부자연스러운 종료면 이전/다음과 합치기
          if ((syl < MIN_SYLLABLES || unnatural) && merged.length > 0) {
            merged[merged.length - 1] += ' ' + p;
          } else if ((syl < MIN_SYLLABLES || unnatural) && i < parts.length - 1) {
            merged.push(p + ' ' + parts[++i]);
        } else {
            merged.push(p);
          }
        }
        // 마지막이 짧거나 부자연스러우면 이전과 합치기
        if (merged.length >= 2) {
          const last = merged[merged.length - 1];
          if (countSyllables(last) < MIN_SYLLABLES || endsUnnatural(last)) {
            merged[merged.length - 2] += ' ' + merged.pop();
          }
        }
        return merged;
      };
      
      // 1단계: 쉼표/괄호 우선 분할
      const splitByDelimiter = (t) => {
        // 괄호가 있으면 괄호 앞에서 분리 (괄호 내용은 별도 자막)
        if (t.includes('(') && t.includes(')')) {
          const match = t.match(/^(.+?)(\([^)]+\))(.*)$/);
          if (match) {
            const [, before, paren, after] = match;
            const parts = [];
            if (before.trim()) parts.push(before.trim());
            if (paren.trim()) parts.push(paren.trim() + (after.trim() ? '' : ''));
            if (after.trim()) {
              // 괄호 뒤 내용을 괄호와 합치거나 별도 분리
              if (after.trim().length < 8) {
                parts[parts.length - 1] += after;
              } else {
                parts.push(after.trim());
              }
            }
            if (parts.length >= 2) return mergeUnnatural(parts);
          }
        }
        
        // 쉼표가 있으면 쉼표에서 분리
        if (t.includes(',')) {
          const parts = t.split(/,\s*/).filter(s => s.trim().length > 0);
          if (parts.length >= 2) {
            const withComma = parts.map((p, i) => i < parts.length - 1 ? p + ',' : p);
            return mergeUnnatural(withComma);
          }
        }
        return null;
      };
      
      // ★★★ 2단계: 의미 단위 보호 분할 (수식어+숫자 보호) ★★★
      const splitBalanced = (t) => {
        const words = t.split(/\s+/);
        if (words.length < 2) return [t];
        
        // 보호해야 할 패턴
        const protectedPatterns = [
          /^(첫|약|내년|올해|지난|이번|총|각)\s+\d+/,
          /^\d+.*?(퍼센트|달러|거래일|분기|월|년|조|억|만)/
        ];
        
        // 부자연스러운 종료 패턴
        const badEndings = /[은는이가을를에의로와과도만]$|^(첫|약|내년|올해|지난|이번|총|각|매|전|후)$/;
        
        let bestIdx = -1, bestScore = Infinity;
        
        for (let i = 1; i < words.length; i++) {
          const first = words.slice(0, i).join(' ');
          const second = words.slice(i).join(' ');
          const firstSyl = countSyllables(first);
          const secondSyl = countSyllables(second);
          
          // 최소 음절 체크
          if (firstSyl < MIN_SYLLABLES || secondSyl < MIN_SYLLABLES) continue;
          
          let penalty = 0;
          
          // 보호 패턴 위반 시 패널티
          for (const pat of protectedPatterns) {
            if (pat.test(second)) penalty += 200;
          }
          
          // 부자연스러운 종료 시 패널티
          if (badEndings.test(words[i-1])) penalty += 150;
          
          // 균형 점수 (음절 수 기준)
          const balance = Math.abs(firstSyl - secondSyl);
          const score = balance + penalty;
          
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        
        if (bestIdx > 0 && bestScore < 200) {
          return [words.slice(0, bestIdx).join(' '), words.slice(bestIdx).join(' ')];
        }
        return [t];
      };
      
      // 분할 실행
      let partsKo = [];
      
      // 1. 쉼표/괄호가 있으면 분할
      const delimParts = splitByDelimiter(text);
      if (delimParts && delimParts.length >= 2) {
        partsKo = delimParts;
      } else if (text.length > MAX_SUBTITLE_LENGTH) {
        // 2. 쉼표/괄호가 없으면 의미 단위 보호 분할
        partsKo = splitBalanced(text);
      } else {
        partsKo = [text];
      }
      
      // 각 부분이 너무 길면 추가 분할 (재귀적)
      const recursiveSplit = (p) => {
        if (p.length <= MAX_SUBTITLE_LENGTH) return [p];
        // 먼저 괄호/쉼표 분리 시도
        const delimResult = splitByDelimiter(p);
        if (delimResult && delimResult.length >= 2) {
          return delimResult.flatMap(recursiveSplit);
        }
        // 의미 단위 분리 시도
        const balancedResult = splitBalanced(p);
        if (balancedResult.length >= 2) {
          return balancedResult.flatMap(recursiveSplit);
        }
        // 강제 분리 (공백 기준 중간점)
        const words = p.split(/\s+/);
        if (words.length >= 2) {
          const mid = Math.ceil(words.length / 2);
          return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].flatMap(recursiveSplit);
        }
        return [p]; // 분리 불가
      };
      partsKo = partsKo.flatMap(recursiveSplit);
      
      // 최종 병합 (짧거나 부자연스러운 부분)
      partsKo = mergeUnnatural(partsKo);
      
      // 심볼 변환
      partsKo = partsKo.map(p => convertSymbols(p, false));
      
      // 영어 처리
      let partsEn = textEn ? textEn.split(/(?<=[,!?.])\s+/).filter(s => s.length > 1).map(s => convertSymbols(s, true)) : [];
      if (partsEn.length <= 1 && textEn?.length > MAX_SUBTITLE_LENGTH + 15) {
        const w = textEn.split(/\s+/);
        if (w.length >= 2) {
          const mid = Math.ceil(w.length / 2);
          partsEn = [w.slice(0, mid).join(' '), w.slice(mid).join(' ')];
        }
      }

      if (partsKo.length <= 1 && text.length <= MAX_SUBTITLE_LENGTH) {
        return [{ start_time: NARRATION_START, end_time: duration, text_ko: convertSymbols(text, false), text_en: textEn || "" }];
      }
      if (partsKo.length <= 1) partsKo = [convertSymbols(text, false)];

      while (partsEn.length < partsKo.length) partsEn.push(partsEn[partsEn.length - 1] || "");
      partsEn = partsEn.slice(0, partsKo.length);

      const sylCounts = partsKo.map(countSyllables), total = sylCounts.reduce((a, b) => a + b, 0) || 1;
      let durations = partsKo.map((_, i) => (sylCounts[i] / total) * effectiveDuration);
      if (durations.some(d => d < MIN_SUBTITLE_DURATION)) {
        const borrowed = durations.filter(d => d < MIN_SUBTITLE_DURATION).reduce((a, b) => a + MIN_SUBTITLE_DURATION - b, 0);
        const longTotal = durations.filter(d => d >= MIN_SUBTITLE_DURATION).reduce((a, b) => a + b, 0);
        durations = durations.map(d => d < MIN_SUBTITLE_DURATION ? MIN_SUBTITLE_DURATION : d - (d / longTotal) * borrowed);
      }

      let cumTime = NARRATION_START;
      return partsKo.map((ko, i) => {
        const start = cumTime; cumTime += durations[i];
        return { start_time: Math.round(start * 10) / 10, end_time: Math.round((i === partsKo.length - 1 ? duration : cumTime) * 10) / 10, text_ko: ko.trim(), text_en: partsEn[i]?.trim() || "" };
      });
    };

    // ========== 테스트 모드 ==========
    if (this.test_mode) {
      console.log("🧪 테스트 모드 - 2개 씬 생성");
      const summarize = (t, max = 45) => { if (!t || t.length <= max) return t; const s = t.split(/(?<=[.!?])\s*/); let r = ""; for (const x of s) if ((r + x).length <= max) r += x; else break; return r?.length >= 10 ? r : t.substring(0, max - 3) + "..."; };
      const toEn = (ko) => {
        const map = { "상승": "rises", "하락": "falls", "급등": "surges", "급락": "plunges", "강세": "bullish", "약세": "bearish", "혼조": "mixed", "반도체": "semiconductor", "AI": "AI", "테슬라": "Tesla", "엔비디아": "NVIDIA", "시장": "market" };
        const found = Object.entries(map).filter(([k]) => ko.includes(k)).map(([, v]) => v);
        return found.length >= 2 ? `${found.slice(0, 3).join(", ")} - market update` : found.length === 1 ? `${found[0]} market news` : "Market news update";
      };
      const kp1 = keyPoints[0] || "오늘 시장은 혼조세를 보였습니다.", kp2 = keyPoints[1] || kp1;
      const n1 = summarize(kp1), n2 = summarize(kp2), e1 = toEn(n1), e2 = toEn(n2);
      const testScript = {
        title: `${analysisDateKorean} ${marketLabel} 증시`, title_english: `${marketLabelEn} Market ${analysisDate}`, full_script: `${n1} ${n2}`,
        presenter: { name: "준호", gender: "male", age: "early_30s", voice_style: "warm, friendly, professional Korean male voice" },
        scenes: [
          { scene_number: 1, duration: 8, narration: n1, narration_english: e1, timed_subtitles: splitNarrationToSubtitles(n1, e1, 8), emotion: "serious", image_prompt: "Professional stock market visualization, abstract financial charts, blue and green gradient lighting, cinematic, 4K, COMPLETELY TEXT-FREE, NO LETTERS, NO CHARACTERS, NO WORDS, pure visual only, no people", part: "key_point" },
          { scene_number: 2, duration: 8, narration: n2, narration_english: e2, timed_subtitles: splitNarrationToSubtitles(n2, e2, 8), emotion: "serious", image_prompt: "Financial news studio background, abstract stock charts, professional blue gradient backdrop, bokeh lights, cinematic, COMPLETELY TEXT-FREE, NO LETTERS, NO CHARACTERS, NO WORDS, pure visual only, no people", part: "key_point" },
        ],
        total_duration: 16, scene_count: 2, hashtags: ["#주식", `#${marketLabel}주식`, "#투자"],
      };
      $.export("skip_sector_analyzer", true); $.export("skip_ticker_analyzer", true); $.export("shorts_script", testScript);
      $.export("$summary", `[테스트] Shorts 대본: 2씬, 16초`);
      return { analysis_date: analysisDate, market_label: marketLabel, shorts_script: testScript, _test_mode: true, generated_at: new Date().toISOString() };
    }

    // ========== LLM 설정 ==========
    const MODEL_INFO = {
      "gpt-4o": { provider: "openai", accuracy: 95, cost: 5 }, "gpt-4o-mini": { provider: "openai", accuracy: 85, cost: 2 },
      "gemini-2.5-pro": { provider: "gemini", accuracy: 93, cost: 4 }, "gemini-2.5-flash": { provider: "gemini", accuracy: 85, cost: 2 }, "gemini-2.0-flash": { provider: "gemini", accuracy: 78, cost: 1 },
    };
    const selectModel = () => {
      const p = this.llm_priority || "balanced", avail = Object.entries(MODEL_INFO).filter(([, i]) => (i.provider === "openai" && this.openai_api_key) || (i.provider === "gemini" && this.gemini_api_key)).map(([m, i]) => ({ model: m, ...i }));
      if (!avail.length) throw new Error("사용 가능한 API 키가 없습니다.");
      if (p === "accuracy") return avail.sort((a, b) => b.accuracy - a.accuracy)[0].model;
      if (p === "cost") return avail.sort((a, b) => a.cost - b.cost)[0].model;
      const q = avail.filter(m => m.accuracy >= 80); return (q.length ? q : avail).sort((a, b) => (b.accuracy / b.cost) - (a.accuracy / a.cost))[0].model;
    };
    const resolvedModel = this.llm_model === "auto" ? selectModel() : this.llm_model;
    const modelInfo = MODEL_INFO[resolvedModel] || { provider: "gemini" };
    console.log(`[LLM] Using: ${resolvedModel}`);

    const callLLM = async (prompt, temp = 0.7) => {
      if (modelInfo.provider === "openai") {
        const r = await axios($, { url: "https://api.openai.com/v1/chat/completions", method: "POST", headers: { Authorization: `Bearer ${this.openai_api_key}`, "Content-Type": "application/json" }, data: { model: resolvedModel, messages: [{ role: "user", content: prompt }], temperature: temp, max_tokens: 4096 } });
        return r.choices[0].message.content;
      }
      const r = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`, method: "POST", headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" }, data: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, maxOutputTokens: 4096 } } });
      return r.candidates[0].content.parts[0].text;
    };

    // ========== 스타일/오프닝 설정 ==========
    const styleGuides = {
      news: { tone: "전문적이고 객관적인 뉴스 앵커 톤", hook: "오늘의 증시 핵심 뉴스입니다.", character: "금융 전문가" },
      casual: { tone: "친근한 MZ세대 말투", hook: "야, 오늘 장 미쳤다~!", character: "친근한 투자 전문가" },
      breaking: { tone: "긴박한 속보 톤", hook: "긴급 속보!", character: "속보 앵커" },
      educational: { tone: "차분한 선생님 톤", hook: "오늘은 이것만 알아가세요!", character: "투자 교육 전문가" },
    };
    const style = styleGuides[this.shorts_style] || styleGuides.casual;
    const narrativeSummary = marketAnalysis.narrative_summary || marketSummary;
    const videoTitle = videoInfo.title || "";
    const analysisType = marketAnalysis.analysis_type || null;

    let openingContext = "전일 증시 분석", openingMent = `여러분, ${analysisDateKorean} ${marketLabel}증시 핵심 정리해요!`, skipRecs = isWeeklyOutlook;
    
    if (isWeeklyOutlook) { openingContext = "주간 시장 전망"; openingMent = `여러분, 이번 주 ${marketLabel}시장 핵심 정리 및 차주 전망 함께 살펴봐요!`; }
    else if (analysisType === "daily_market") { openingContext = "전일 증시 분석"; skipRecs = false; }
    else if (analysisType === "outlook") { openingContext = "시장 전망 분석"; openingMent = `여러분, ${marketLabel}시장 전망 ${keyPoints.length}가지 정리해요!`; skipRecs = true; }
    else if (analysisType === "issue") { openingContext = "주요 이슈 분석"; openingMent = `여러분, ${marketLabel}증시 주요 이슈 ${keyPoints.length}가지 정리해요!`; skipRecs = true; }
    else if (analysisType === "sector") { openingContext = "섹터/업종 분석"; openingMent = `여러분, ${analysisDateKorean} ${marketLabel} 주목 섹터 분석해봤어요!`; skipRecs = false; }
    else if (analysisType === "stock") { openingContext = "종목 분석"; openingMent = `여러분, ${analysisDateKorean} ${marketLabel}증시 주목 종목이에요!`; skipRecs = true; }
    else if (!analysisType) {
      if (videoTitle.match(/2025|내년|전망/)) { openingContext = "시장 전망 분석"; openingMent = `여러분, ${marketLabel}시장 전망 ${keyPoints.length}가지 정리해요!`; skipRecs = true; }
      else if (videoTitle.match(/이슈|핫이슈/)) { openingContext = "주요 이슈 분석"; openingMent = `여러분, ${marketLabel}증시 주요 이슈 ${keyPoints.length}가지 정리해요!`; skipRecs = true; }
      else if (videoTitle.match(/섹터|업종/)) { openingContext = "섹터/업종 분석"; openingMent = `여러분, ${analysisDateKorean} ${marketLabel} 주목 섹터 분석해봤어요!`; }
      else if (videoTitle.match(/종목|추천/)) { openingContext = "종목 분석"; openingMent = `여러분, ${analysisDateKorean} ${marketLabel}증시 주목 종목이에요!`; skipRecs = true; }
    }
    console.log(`📢 오프닝: ${openingContext}${skipRecs ? " (추천 스킵)" : ""}`);

    // ========== 나레이션 기반 이미지 프롬프트 생성 ==========
    const generateImagePrompt = (narration, sceneType = "key_point") => {
      const base = "cinematic, 4K, COMPLETELY TEXT-FREE, NO LETTERS, NO CHARACTERS, NO WORDS, pure visual only, no people";
      
      if (sceneType === "opening") {
        return `Abstract futuristic financial world map, glowing blue and purple gradient, dynamic light particles, global market visualization, ${base}`;
      }
      if (sceneType === "closing") {
        return `Warm golden sunset gradient, floating heart and thumbs up shapes made of light particles, appreciation theme, ${base}`;
      }
      if (sceneType === "disclaimer") {
        return `Clean minimal dark blue gradient, subtle geometric patterns, professional legal document atmosphere, ${base}`;
      }
      
      // 키워드 매핑 테이블
      const keywordPrompts = [
        // 지수/시장
        { keywords: ["S&P", "에스앤피", "나스닥", "NASDAQ", "다우", "DOW", "지수"], prompt: "Stock market index visualization, multiple rising and falling line charts, green and red gradient glow" },
        { keywords: ["상승", "급등", "반등", "올랐"], prompt: "Upward trending abstract arrows, green glowing particles, bull market energy, growth visualization" },
        { keywords: ["하락", "급락", "떨어"], prompt: "Downward flowing abstract shapes, red tinted gradients, bear market atmosphere, decline visualization" },
        { keywords: ["혼조", "변동성"], prompt: "Dynamic wave patterns, alternating green and red lights, volatile market visualization" },
        // 경제 지표
        { keywords: ["CPI", "물가", "인플레이션"], prompt: "Abstract price level visualization, layered bar charts, economic data flow, inflation concept art" },
        { keywords: ["GDP", "성장률"], prompt: "Growing abstract city skyline, upward economic graphs, prosperity visualization" },
        { keywords: ["실업률", "고용"], prompt: "Abstract human figures as data points, employment statistics visualization, workforce concept" },
        { keywords: ["PCE", "소비지출"], prompt: "Consumer spending visualization, abstract shopping cart shapes, economic flow patterns" },
        { keywords: ["금리", "이자율", "연준", "Fed"], prompt: "Abstract central bank building silhouette, interest rate curve visualization, monetary policy concept" },
        // 원자재/유가
        { keywords: ["유가", "WTI", "원유", "오일"], prompt: "Abstract oil barrel shapes, energy sector visualization, crude oil price waves, orange and black gradients" },
        { keywords: ["금", "골드", "금값"], prompt: "Golden abstract bars, precious metal glow, luxury gradient, gold investment concept" },
        // 기업/섹터
        { keywords: ["마이크론", "반도체", "칩"], prompt: "Glowing semiconductor chip patterns, circuit board visualization, technology sector, blue neon lights" },
        { keywords: ["나이키", "소비재", "리테일"], prompt: "Abstract retail store visualization, consumer goods concept, shopping atmosphere" },
        { keywords: ["AI", "인공지능", "테크"], prompt: "Neural network visualization, AI brain concept, futuristic technology patterns, blue and white glow" },
        { keywords: ["애플", "AAPL", "아이폰"], prompt: "Sleek technology product silhouettes, premium design aesthetic, minimalist tech visualization" },
        // 이벤트
        { keywords: ["산타 랠리", "연말"], prompt: "Holiday market rally visualization, festive golden particles, year-end celebration, warm colors" },
        { keywords: ["만기", "옵션", "파생상품"], prompt: "Complex derivative instrument visualization, options expiry concept, financial engineering patterns" },
        { keywords: ["국채", "채권", "금리"], prompt: "Government bond visualization, fixed income concept, treasury yield curves, blue institutional colors" },
        // 글로벌
        { keywords: ["일본", "엔화", "BOJ", "BoJ"], prompt: "Japanese financial market visualization, yen currency symbols as abstract shapes, Tokyo skyline silhouette" },
        { keywords: ["중국", "위안"], prompt: "Asian market visualization, Chinese economic growth concept, red and gold gradients" },
        { keywords: ["유럽", "ECB", "유로"], prompt: "European financial district visualization, euro zone concept, blue and gold EU colors" },
      ];
      
      // 나레이션에서 매칭되는 키워드 찾기
      const matchedPrompts = [];
      for (const { keywords, prompt } of keywordPrompts) {
        if (keywords.some(kw => narration.includes(kw))) {
          matchedPrompts.push(prompt);
        }
      }
      
      // 매칭된 프롬프트 조합 (최대 2개)
      if (matchedPrompts.length > 0) {
        const combined = matchedPrompts.slice(0, 2).join(", ");
        return `${combined}, professional lighting, ${base}`;
      }
      
      // 기본 프롬프트
      return `Professional financial news background, abstract flowing data streams, market analysis atmosphere, blue gradient lighting, ${base}`;
    };

    // ========== Weekly Outlook 모드: LLM 없이 직접 씬 생성 ==========
    if (isWeeklyOutlook && keyPoints.length >= 2) {
      console.log("📅 [Weekly Outlook] LLM 없이 직접 씬 생성 (원본 유지)");
      
      // 긴 문장을 동적으로 균형 분리 (쉼표/공백 기준)
      const splitLongSentence = (text, maxSyl = 40) => {
        const syl = countSyllables(text);
        if (syl <= maxSyl) return [text];
        
        // 모든 쉼표/공백 위치에서 분리 지점 수집
        const splitPoints = [];
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ',' || text[i] === ' ') {
            const p1 = text.slice(0, i + 1).trim(), p2 = text.slice(i + 1).trim();
            const s1 = countSyllables(p1), s2 = countSyllables(p2);
            if (s1 >= 8 && s2 >= 8) { // 최소 8음절 이상
              splitPoints.push({ p1, p2, s1, s2, diff: Math.abs(s1 - s2), valid: s1 <= maxSyl && s2 <= maxSyl });
            }
          }
        }
        
        if (splitPoints.length === 0) return [text];
        
        // 1순위: 둘 다 maxSyl 이하 중 가장 균형 잡힌 것
        const valid = splitPoints.filter(sp => sp.valid).sort((a, b) => a.diff - b.diff);
        if (valid.length > 0) return [valid[0].p1, valid[0].p2];
        
        // 2순위: 하나라도 maxSyl 이하인 것 → 재귀 분리
        const partial = splitPoints.filter(sp => sp.s1 <= maxSyl || sp.s2 <= maxSyl).sort((a, b) => a.diff - b.diff);
        if (partial.length > 0) {
          const best = partial[0];
          const parts = [];
          parts.push(...(best.s1 > maxSyl ? splitLongSentence(best.p1, maxSyl) : [best.p1]));
          parts.push(...(best.s2 > maxSyl ? splitLongSentence(best.p2, maxSyl) : [best.p2]));
          return parts;
        }
        
        // 3순위: 강제로 가장 균형 잡힌 곳에서 분리
        splitPoints.sort((a, b) => a.diff - b.diff);
        const best = splitPoints[0];
        const parts = [];
        parts.push(...(best.s1 > maxSyl ? splitLongSentence(best.p1, maxSyl) : [best.p1]));
        parts.push(...(best.s2 > maxSyl ? splitLongSentence(best.p2, maxSyl) : [best.p2]));
        return parts;
      };
      
      // key_points를 40음절 단위로 분리
      const splitToScenes = (text, maxSyl = 40) => {
        // [W51 요약], [W52 전망] 등 라벨 제거 + 숫자 앞 +/- 기호 제거
        let cleaned = removeEmojis(text)
          .replace(/\[W\d+\s*(요약|전망)\]\s*/g, "")
          .replace(/[+\-](\d)/g, "$1")  // +0.10% → 0.10%, -0.70% → 0.70%
          .replace(/\$(\d+(?:\.\d+)?)/g, "$1달러")  // $56.65 → 56.65달러
          .replace(/(\d+(?:\.\d+)?)%/g, "$1퍼센트")  // 0.10% → 0.10퍼센트
          .trim();
        // 문장 단위 분리 (마침표, 느낌표, 물음표 기준)
        const sentences = cleaned.split(/(?<=[요죠다에어]\.)\s*/).filter(s => s.trim());
        const scenes = [];
        let current = "";
        let currentSyl = 0;
        
        for (const sent of sentences) {
          const sentSyl = countSyllables(sent);
          if (currentSyl + sentSyl <= maxSyl) {
            current = current ? `${current} ${sent}` : sent;
            currentSyl += sentSyl;
          } else {
            if (current) scenes.push(current.trim());
            // 문장 자체가 40음절 초과 시 추가 분리
            if (sentSyl > maxSyl) {
              const splits = splitLongSentence(sent, maxSyl);
              // 마지막 조각은 다음 문장과 합칠 수 있으므로 분리 처리
              for (let i = 0; i < splits.length - 1; i++) scenes.push(splits[i]);
              current = splits[splits.length - 1];
              currentSyl = countSyllables(current);
            } else {
              current = sent;
              currentSyl = sentSyl;
            }
          }
        }
        if (current) scenes.push(current.trim());
        return scenes;
      };
      
      // 오프닝 씬
      const scenes = [{
        scene_number: 1, duration: 6, narration: openingMent, narration_english: `Hello! Key ${marketLabelEn} market update!`,
        emotion: "friendly", image_prompt: generateImagePrompt(openingMent, "opening"), part: "opening"
      }];
      
      // key_points를 씬으로 분리
      let sceneNum = 2;
      for (let kpIdx = 0; kpIdx < keyPoints.length; kpIdx++) {
        const kp = keyPoints[kpIdx];
        const kpScenes = splitToScenes(kp, 40);
        console.log(`   📝 key_point ${kpIdx + 1}: ${kpScenes.length}개 씬으로 분리`);
        
        for (let i = 0; i < kpScenes.length; i++) {
          const narration = kpScenes[i];
          const imagePrompt = generateImagePrompt(narration, "key_point");
          console.log(`      씬${sceneNum}: "${narration.substring(0, 40)}..." (${countSyllables(narration)}음절)`);
          console.log(`         🖼️ 이미지: ${imagePrompt.substring(0, 60)}...`);
          scenes.push({
            scene_number: sceneNum++, duration: 8, narration, narration_english: "",
            emotion: "serious", image_prompt: imagePrompt, part: "key_point"
          });
        }
      }
      
      // 마무리 씬
      scenes.push({
        scene_number: sceneNum++, duration: 4, narration: "도움이 되셨다면, 구독과 좋아요 부탁드려요!", narration_english: "Please subscribe and like!",
        emotion: "friendly", image_prompt: generateImagePrompt("", "closing"), part: "closing"
      });
      
      // 면책 씬
      scenes.push({
        scene_number: sceneNum++, duration: 4, narration: "본 영상은 투자 권유가 아닙니다", narration_english: "This is not investment advice",
        emotion: "serious", image_prompt: generateImagePrompt("", "disclaimer"), part: "disclaimer", is_disclaimer: true
      });
      
      // Duration 및 자막 생성
      let currentTime = 0;
      const finalScenes = scenes.map((scene, idx) => {
        const cleanNarration = removeEmojis(scene.narration);
        const dur = calculateDuration(cleanNarration);
        const start = currentTime; currentTime += dur;
        return {
          ...scene, scene_number: idx + 1, duration: dur, time_range: `${start}-${currentTime}초`,
          narration: cleanNarration, syllable_count: countSyllables(cleanNarration),
          timed_subtitles: splitNarrationToSubtitles(cleanNarration, scene.narration_english, dur),
        };
      });
      
      const shortsScript = {
        title: `이번 주 ${marketLabel}시장 전망`, title_english: `${marketLabelEn} Weekly Outlook`,
        full_script: finalScenes.map(s => s.narration).join(" "),
        presenter: { name: "준호", gender: "male", age: "early_30s", voice_style: "warm, friendly, professional Korean male voice" },
        scenes: finalScenes, total_duration: currentTime, scene_count: finalScenes.length,
        hashtags: ["#주식", `#${marketLabel}주식`, "#주간전망", "#투자"],
      };
      
      console.log(`✅ [Weekly Outlook] 직접 생성 완료: ${shortsScript.scene_count}씬, ${shortsScript.total_duration}초`);
      
      const result = {
        analysis_date: analysisDate, market_label: marketLabel, shorts_script: shortsScript,
        source_summary: { video_title: videoInfo.title || null, market_outlook: marketOutlook.sentiment, key_points_count: keyPoints.length },
        _weekly_outlook_direct: true, generated_at: new Date().toISOString(),
      };
      $.export("shorts_script", shortsScript);
      $.export("$summary", `[Weekly Outlook] Shorts 대본: ${shortsScript.scene_count}씬, ${shortsScript.total_duration}초`);
      return result;
    }

    // ========== 씬 계산 ==========
    const kpCount = keyPoints.length, openingDur = isWeeklyOutlook ? 6 : 4, sceneDur = 8, sceneSyl = 40;
    const kpScenes = kpCount * 2, hasRecs = topPicks.length >= 2 && !skipRecs, recScenes = hasRecs ? 2 : 0;
    const totalScenes = 1 + kpScenes + recScenes + 2, totalDur = openingDur + (kpScenes * sceneDur) + (recScenes * 8) + 10;
    console.log(`📊 씬 계산: 1 + ${kpScenes} + ${recScenes} + 2 = ${totalScenes}씬, ${totalDur}초`);

    // key_points 목록 생성
    const ordinals = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째"];
    const kpList = isWeeklyOutlook
      ? keyPoints.map((kp, i) => `[key_point ${i + 1}] ${i === 0 ? "[지난주 요약]" : "[이번주 전망]"}\n- ★원문 그대로★: "${kp}"\n- 8초(35음절) 단위 씬 분리, 수치 필수!`).join("\n\n")
      : keyPoints.map((kp, i) => `[key_point ${i + 1}] "${ordinals[i] || `${i + 1}번째`}" 주제:\n- 내용: "${kp}"\n- 씬당 35음절, 수치 필수!`).join("\n\n");

    // ========== 프롬프트 생성 ==========
    const shortsPrompt = `당신은 유명 금융 유튜버입니다. ${totalDur}초 분량 YouTube 대본 작성.
스타일: ${style.character}

★ 주식 초보자도 이해하기 쉽게! 전문 용어 풀어서 설명 ★

🚨 숫자/수치 필수 유지! 🚨
- ❌ +/- 기호 금지! "상승/하락"이 방향을 나타냄
- ✅ "S&P 500은 0.10% 상승했어요" (수치 포함!)

===== 분석 데이터 =====
분석일: ${analysisDate} | 시장: ${marketLabel}
${videoTitle ? `원본: ${videoTitle}` : ""}
[요약] ${narrativeSummary}
[핵심 포인트 - ${kpCount}개]
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}
[시장 전망] ${marketOutlook.sentiment || "혼조세"}
[허용된 종목] ${topPicks.slice(0, 4).map((t, i) => `${i + 1}. ${t.ticker}=${t.company_name_kr || t.company_name}`).join(", ") || "없음"}
[추천 종목 상세] ${topPicks.slice(0, 3).map((t, i) => `${i + 1}. ${t.ticker}: ${t.investment_thesis?.substring(0, 50) || "성장 기대"}...`).join("\n") || "없음"}
[리스크] ${(marketAnalysis.risk_factors || []).slice(0, 3).join(", ") || "시장 변동성"}
====================

🚨 금지 사항 🚨
1. 숫자 환각: 제공되지 않은 수치 금지
2. 종목 환각: [허용된 종목] 외 언급 금지!
3. 뉴스 환각: [핵심 포인트]에 없는 뉴스/이슈 금지!
4. 씬당 ${sceneSyl}음절(${sceneDur}초) 이내!
5. 🚫 image_prompt에 한글/중국어/일본어 텍스트 절대 금지!

${isWeeklyOutlook ? `★ [Weekly Outlook 모드] 원문 유지! 8초 단위 씬 분리만!
❌ key_points에 없는 내용 추가 금지!` : `★ key_point 분할: 씬당 35음절! 내용 길면 씬 추가!`}

★ 구조: 총 ${totalScenes}씬, ${totalDur}초 ★

🎬 씬1: 오프닝 (${openingDur}초, ${isWeeklyOutlook ? "25" : "20"}음절)
- 분석 주제: ${openingContext}
- 인사말: "${openingMent}"

${isWeeklyOutlook ? `📊 PART 1: 주간 전망 (씬2부터, 각 ${sceneDur}초)
${kpList}
🔚 마무리 (2씬): 마무리(6초) + 면책(4초)` : `📊 PART 1: 핵심 포인트 (씬2부터, 각 ${sceneDur}초)
★ "첫째,", "둘째," 등 순서 표시!
${kpList}
${hasRecs ? `🎯 PART 2: 종목 추천 (2씬, 각 8초)
- 추천1: "${topPicks[0]?.sector || "기술"} 섹터! ${topPicks[0]?.ticker} ${topPicks[0]?.company_name_kr} 주목!"
- 추천2: "${topPicks[1]?.ticker} ${topPicks[1]?.company_name_kr}도 좋아 보여요!"` : `⚠️ 종목 추천 스킵`}
🔚 마무리 + 면책 (2씬, 10초)`}

JSON 출력:
\`\`\`json
{
  "title": "영상 제목 (15자 이내)",
  "title_english": "English Title",
  "full_script": "전체 대본",
  "presenter": { "name": "준호", "gender": "male", "age": "early_30s", "voice_style": "warm, friendly, professional Korean male voice" },
  "scenes": [
    { "scene_number": 1, "duration": ${openingDur}, "narration": "${openingMent}", "narration_english": "Hello! Key ${marketLabelEn} market update!", "timed_subtitles": [{"start_time": 0, "end_time": ${openingDur}, "text_ko": "...", "text_en": "..."}], "emotion": "friendly", "image_prompt": "Abstract futuristic financial background, glowing blue and purple gradient, dynamic light streaks, digital data flow visualization, cinematic, 4K, COMPLETELY TEXT-FREE, NO LETTERS, NO CHARACTERS, NO WORDS, pure visual only, no people", "part": "opening" },
    { "scene_number": 2, "duration": ${sceneDur}, "narration": "[핵심포인트1]", "narration_english": "[Key point 1]", "timed_subtitles": [], "emotion": "serious", "image_prompt": "[나레이션 관련 배경], professional lighting, COMPLETELY TEXT-FREE, NO LETTERS, NO CHARACTERS, NO WORDS, pure visual only, no people", "part": "key_point" }
    // ... 나머지 씬 ...
  ],
  "total_duration": ${totalDur},
  "hashtags": ["#주식", "#${marketLabel}주식", "#투자"],
  "scene_count": ${totalScenes}
}
\`\`\`

★ 핵심 규칙 ★
1. 씬1: 인사말 필수! (${openingDur}초)
2. 씬2~: 핵심 포인트 (각 8초, 40음절 이내) - "첫째,", "둘째," 로 시작!
${hasRecs ? `3. 종목 추천은 topPicks 데이터만 사용!` : `3. ❌ 종목 추천 금지!`}
4. 숫자/종목/뉴스 환각 금지
5. 🖼️ image_prompt: 영어만! 한글 금지! 사람 금지!
6. 마지막 씬: "본 영상은 투자 권유가 아닙니다" (is_disclaimer: true)
7. 영문 번역 필수: narration_english, title_english 포함
`;

    // ========== LLM 호출 및 파싱 ==========
    console.log("📝 Shorts 대본 생성 중...");
    // temperature 0.4로 설정 (일관성 향상, 원본 유지)
    const scriptResult = await callLLM(shortsPrompt, 0.4);
    const jsonMatch = scriptResult.match(/```json\s*([\s\S]*?)\s*```/);
    let shortsScript = JSON.parse(jsonMatch ? jsonMatch[1] : scriptResult);

    // ========== 긴 나레이션 자동 분리 ==========
    const MAX_SYL = 40;
    const splitLongNarration = (narration) => {
      if (!narration) return [narration];
      const total = countSyllables(narration);
      if (total <= MAX_SYL) return [narration];
      console.log(`   🔍 분리 시도: ${total}음절`);

      // 방법 1: 문장 단위
      const sentEnd = /(요|죠|니다|에요|어요|해요|네요|세요)\.\s+/g;
      const sents = []; let last = 0, m;
      while ((m = sentEnd.exec(narration)) !== null) { sents.push(narration.slice(last, m.index + m[0].length).trim()); last = m.index + m[0].length; }
      if (last < narration.length) sents.push(narration.slice(last).trim());

      if (sents.length > 1) {
        const groups = []; let cur = "", curSyl = 0;
        for (const s of sents) {
          const syl = countSyllables(s);
          if (curSyl + syl <= MAX_SYL) { cur = cur ? `${cur} ${s}` : s; curSyl += syl; }
          else { if (cur) groups.push(cur); cur = s; curSyl = syl; }
        }
        if (cur) groups.push(cur);
        if (groups.length > 1) { console.log(`   ✂️ 문장 기준: ${groups.length}개`); return groups; }
      }

      // 방법 2: 쉼표/접속어 (각 파트 최대 40음절)
      for (const pat of [/지만,?\s*/g, /했고,?\s*/g, /있고,?\s*/g, /,\s*/g]) {
        pat.lastIndex = 0;
        for (const m of [...narration.matchAll(pat)]) {
          const idx = m.index + m[0].length, p1 = narration.slice(0, idx).trim(), p2 = narration.slice(idx).trim();
          const s1 = countSyllables(p1), s2 = countSyllables(p2);
          // 최소 10음절 이상, 각 파트 최대 40음절
          if (s1 >= 10 && s2 >= 10) { console.log(`   ✂️ 접속어 기준 (${s1}+${s2}음절)`); return [p1, p2]; }
        }
      }

      // 방법 3: 강제 중간 분리
      const target = Math.floor(narration.length * 0.5); let best = -1, bestScore = Infinity;
      for (let i = Math.floor(narration.length * 0.4); i < Math.floor(narration.length * 0.6); i++) {
        if (" ,.".includes(narration[i]) && Math.abs(i - target) < bestScore) { bestScore = Math.abs(i - target); best = i; }
      }
      if (best > 0) { console.log(`   ✂️ 강제 중간 분리`); return [narration.slice(0, best + 1).trim(), narration.slice(best + 1).trim()]; }
      return [narration];
    };

    if (shortsScript.scenes) {
      // 재귀적 분리: 모든 씬이 40음절 이하가 될 때까지 반복
      let expanded = [...shortsScript.scenes];
      let maxIterations = 10; // 무한루프 방지
      
      while (maxIterations-- > 0) {
        const newExpanded = [];
        let needsMoreSplit = false;
        
        for (const scene of expanded) {
          if (["opening", "closing"].includes(scene.part) || scene.is_disclaimer) { newExpanded.push(scene); continue; }
          const syl = countSyllables(scene.narration);
          if (syl > MAX_SYL) {
            console.log(`   ⚠️ 씬${scene.scene_number || scene._original_scene}: ${syl}음절 > ${MAX_SYL}`);
            const parts = splitLongNarration(scene.narration);
            if (parts.length > 1) {
              needsMoreSplit = true;
              for (let i = 0; i < parts.length; i++) {
                const partSyl = countSyllables(parts[i]);
                console.log(`      파트${i + 1}: ${partSyl}음절 - "${parts[i].substring(0, 30)}..."`);
                newExpanded.push({ ...scene, narration: parts[i], narration_english: i === 0 ? scene.narration_english : "", duration: 8, _split_part: (scene._split_part || 0) * 10 + i + 1, _original_scene: scene._original_scene || scene.scene_number });
              }
            } else {
              // 더 이상 분리 불가 - 그대로 유지
              console.log(`   ⚠️ 분리 불가 - 원본 유지 (${syl}음절)`);
              newExpanded.push(scene);
            }
          } else newExpanded.push(scene);
        }
        
        expanded = newExpanded;
        if (!needsMoreSplit) break;
      }
      
      shortsScript.scenes = expanded;
      console.log(`   📊 씬 분리 후: ${shortsScript.scenes.length}개`);
    }

    // ========== Duration 검증 및 보정 ==========
    if (shortsScript.scenes) {
      if (!shortsScript.scenes.some(s => s.is_disclaimer || s.narration?.includes("투자 권유가 아닙니다"))) {
        shortsScript.scenes.push({ scene_number: shortsScript.scenes.length + 1, duration: 4, narration: "본 영상은 투자 권유가 아닙니다", emotion: "serious", is_disclaimer: true });
      }

      let currentTime = 0;
      shortsScript.scenes = shortsScript.scenes.map((scene, idx) => {
        // 나레이션/영문에서 이모티콘 제거
        const cleanNarration = removeEmojis(scene.narration || "");
        const cleanNarrationEn = removeEmojis(scene.narration_english || "");
        const dur = calculateDuration(cleanNarration), start = currentTime; currentTime += dur;
        return {
          ...scene, scene_number: idx + 1, duration: dur, time_range: `${start}-${currentTime}초`,
          narration: cleanNarration,
          narration_english: cleanNarrationEn,
          syllable_count: cleanNarration.replace(/[^가-힣a-zA-Z0-9]/g, "").length,
          timed_subtitles: splitNarrationToSubtitles(cleanNarration, cleanNarrationEn, dur),
        };
      });
      shortsScript.total_duration = currentTime;
      shortsScript.scene_count = shortsScript.scenes.length;
      if (!shortsScript.title_english) shortsScript.title_english = "Stock Market News";
    }

    console.log(`✅ 대본 완료: ${shortsScript.scenes?.length || 0}씬, ${shortsScript.total_duration || 0}초`);

    const result = {
      analysis_date: analysisDate, market_label: marketLabel, shorts_script: shortsScript,
      source_summary: { video_title: videoInfo.title || null, market_outlook: marketOutlook.sentiment, key_points_count: keyPoints.length, recommended_sectors: recommendedSectors.slice(0, 3).map(s => s.sector_name), top_picks: topPicks.slice(0, 5).map(t => ({ ticker: t.ticker, recommendation: t.recommendation })) },
      _llm_info: { model: resolvedModel, provider: modelInfo.provider }, generated_at: new Date().toISOString(),
    };

    $.export("shorts_script", shortsScript);
    $.export("$summary", `Shorts 대본: ${shortsScript.scenes?.length || 0}씬, ${shortsScript.total_duration || 0}초`);
    return result;
  },
});
