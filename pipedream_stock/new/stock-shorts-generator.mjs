import { axios } from "@pipedream/platform";
export default defineComponent({
  name: "Stock Shorts Generator",
  description: "주식 분석 결과로 YouTube Shorts 대본 생성",
  props: {
    test_mode: { type: "boolean", label: "테스트 모드", default: false, optional: true },
    market_analysis_output: { type: "string", label: "Market Analysis Output (JSON)", optional: true },
    sector_analysis_output: { type: "string", label: "Sector Analysis Output (JSON)", optional: true },
    ticker_analysis_output: { type: "string", label: "Ticker Analysis Output (JSON)", optional: true },
    shorts_style: { type: "string", label: "콘텐츠 스타일", default: "casual", options: [{ label: "뉴스 브리핑", value: "news" }, { label: "친근한 설명", value: "casual" }, { label: "긴급 속보", value: "breaking" }, { label: "교육적", value: "educational" }] },
    shorts_duration: { type: "integer", label: "영상 길이 (초)", default: 60 },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true, optional: true },
    openai_api_key: { type: "string", label: "OpenAI API Key", secret: true, optional: true },
    llm_model: { type: "string", label: "LLM Model", default: "auto", options: [{ label: "자동", value: "auto" }, { label: "GPT-4o", value: "gpt-4o" }, { label: "GPT-4o-mini", value: "gpt-4o-mini" }, { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" }, { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" }, { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" }] },
    llm_priority: { type: "string", label: "LLM 우선순위", default: "balanced", options: [{ label: "정확도", value: "accuracy" }, { label: "균형", value: "balanced" }, { label: "비용", value: "cost" }] },
  },
  async run({ $ }) {
    const parseJSON = (str) => { try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return null; } };
    const removeEmojis = (t) => t ? t.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1FAFF}]|[\u{231A}-\u{23FA}]|[\u{25AA}-\u{27BF}]|[\u{2934}-\u{2B55}]|[\u{3030}-\u{3299}]|[0-9]\uFE0F?\u20E3|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu, "").replace(/\s+/g, " ").trim() : t;
    const convTTS = (t) => { if (!t) return t; return t.replace(/~/g, "에서 ").replace(/\s*\/\s*/g, " 또는 ").replace(/&(?!amp;)/g, "앤드").replace(/\s*\+\s*(?!\d)/g, " 플러스 ").replace(/\s*-\s*(?!\d)/g, " 마이너스 ").replace(/\s+/g, " ").trim(); };
    const countSyl = (t) => { if (!t) return 0; const c = removeEmojis(convTTS(t)); return (c.match(/[가-힣]/g)||[]).length + (c.match(/[0-9]/g)||[]).length + Math.ceil((c.match(/[a-zA-Z]/g)||[]).length/3); };
    const calcDur = (t) => { if (!t) return 4; const d = Math.ceil(countSyl(t)/5); return d <= 4 ? 4 : d <= 6 ? 6 : 8; };
    const marketData = parseJSON(this.market_analysis_output), sectorData = parseJSON(this.sector_analysis_output), tickerData = parseJSON(this.ticker_analysis_output);
    if (!marketData && !sectorData && !tickerData) throw new Error("분석 결과 필요");
    const mA = marketData?.analysis || marketData?.market_analysis || marketData || {}, vInfo = mA?.video_info || marketData?.video_info || {};
    const aDate = marketData?.analysis_date || new Date().toISOString().split("T")[0];
    const mLabelMap = { us: "미국", kr: "한국", global: "글로벌" }, mLabel = marketData?.market_label || mLabelMap[marketData?.market_type] || "글로벌";
    const kpStruct = marketData?.key_points_structure || mA?.key_points_structure || "auto", aType = mA?.analysis_type || null;
    const isWeekly = kpStruct === "weekly_outlook" && aType !== "daily_market";
    const fmtDate = (d) => { const dt = new Date(d); dt.setDate(dt.getDate()-1); return `${dt.getMonth()+1}월 ${dt.getDate()}일`; };
    const aDateKr = fmtDate(aDate), mLabelEn = { "글로벌": "Global", "미국": "US", "한국": "Korea" }[mLabel] || mLabel;
    const kPoints = mA.key_points || [], mOutlook = mA.market_outlook || {}, recSectors = sectorData?.recommended_sectors || mA.recommended_sectors || [];
    const rawPicks = tickerData?.top_picks || tickerData?.all_recommended_tickers || tickerData?.recommended_tickers || mA.top_picks || [];
    const seen = new Set(), topPicks = rawPicks.filter(p => p?.ticker && !seen.has(p.ticker.toUpperCase()) && seen.add(p.ticker.toUpperCase()));
    console.log(`📊 데이터: kp=${kPoints.length}, picks=${topPicks.length}`);
    const MAX_SUB = 20, MIN_DUR = 0.5, NAR_ST = 0.2, MIN_SYL = 8;
    const splitSub = (txt, txtEn, dur) => {
      const eDur = dur - NAR_ST;
      if (!txt) return [{ start_time: NAR_ST, end_time: dur, text_ko: "", text_en: txtEn || "" }];
      const conv = (s, en) => s?.replace(/\$(\d+(?:\.\d+)?)/g, en ? '$$$1 dollars' : '$1달러').replace(/(\d)%/g, en ? '$1 percent' : '$1퍼센트') || s;
      const badEnd = (s) => /[은는이가을를에의로와과도만]$/.test(s.trim()) || /\s(첫|약|내년|올해|지난|이번)$/.test(s.trim()) || /\s\d+$/.test(s.trim());
      const merge = (parts) => {
        if (parts.length <= 1) return parts;
        const m = [];
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i], syl = countSyl(p), bad = badEnd(p);
          if ((syl < MIN_SYL || bad) && m.length > 0) m[m.length-1] += ' ' + p;
          else if ((syl < MIN_SYL || bad) && i < parts.length-1) m.push(p + ' ' + parts[++i]);
          else m.push(p);
        }
        if (m.length >= 2 && (countSyl(m[m.length-1]) < MIN_SYL || badEnd(m[m.length-1]))) m[m.length-2] += ' ' + m.pop();
        return m;
      };
      const splitDelim = (t) => {
        if (t.includes('(') && t.includes(')')) {
          const mt = t.match(/^(.+?)(\([^)]+\))(.*)$/);
          if (mt) { const pts = []; if (mt[1].trim()) pts.push(mt[1].trim()); if (mt[2].trim()) pts.push(mt[2].trim()); if (mt[3].trim()) { if (mt[3].trim().length < 8) pts[pts.length-1] += mt[3]; else pts.push(mt[3].trim()); } if (pts.length >= 2) return merge(pts); }
        }
        if (t.includes(',')) { const pts = t.split(/,\s*/).filter(s => s.trim()); if (pts.length >= 2) return merge(pts.map((p,i) => i < pts.length-1 ? p+',' : p)); }
        return null;
      };
      const splitBal = (t) => {
        const w = t.split(/\s+/); if (w.length < 2) return [t];
        const prot = [/^(첫|약|내년|올해|지난|이번)\s+\d+/, /^\d+.*?(퍼센트|달러|억|조|만)/], badPat = /[은는이가을를에의로와과도만]$/;
        let best = -1, bestSc = Infinity;
        for (let i = 1; i < w.length; i++) {
          const f = w.slice(0,i).join(' '), s = w.slice(i).join(' '), fs = countSyl(f), ss = countSyl(s);
          if (fs < MIN_SYL || ss < MIN_SYL) continue;
          let pen = 0; for (const p of prot) if (p.test(s)) pen += 200; if (badPat.test(w[i-1])) pen += 150;
          const sc = Math.abs(fs-ss) + pen; if (sc < bestSc) { bestSc = sc; best = i; }
        }
        return best > 0 && bestSc < 200 ? [w.slice(0,best).join(' '), w.slice(best).join(' ')] : [t];
      };
      let pKo = splitDelim(txt); if (!pKo || pKo.length < 2) pKo = txt.length > MAX_SUB ? splitBal(txt) : [txt];
      const recSplit = (p) => { if (p.length <= MAX_SUB) return [p]; const dr = splitDelim(p); if (dr && dr.length >= 2) return dr.flatMap(recSplit); const br = splitBal(p); if (br.length >= 2) return br.flatMap(recSplit); const ws = p.split(/\s+/); if (ws.length >= 2) { const mid = Math.ceil(ws.length/2); return [ws.slice(0,mid).join(' '), ws.slice(mid).join(' ')].flatMap(recSplit); } return [p]; };
      pKo = merge(pKo.flatMap(recSplit)).map(p => conv(p, false));
      let pEn = txtEn ? txtEn.split(/(?<=[,!?.])\s+/).filter(s => s.length > 1).map(s => conv(s, true)) : [];
      if (pEn.length <= 1 && txtEn?.length > MAX_SUB + 15) { const ws = txtEn.split(/\s+/); if (ws.length >= 2) { const mid = Math.ceil(ws.length/2); pEn = [ws.slice(0,mid).join(' '), ws.slice(mid).join(' ')]; } }
      if (pKo.length <= 1 && txt.length <= MAX_SUB) return [{ start_time: NAR_ST, end_time: dur, text_ko: conv(txt, false), text_en: txtEn || "" }];
      if (pKo.length <= 1) pKo = [conv(txt, false)];
      while (pEn.length < pKo.length) pEn.push(pEn[pEn.length-1] || ""); pEn = pEn.slice(0, pKo.length);
      const syls = pKo.map(countSyl), tot = syls.reduce((a,b) => a+b, 0) || 1;
      let durs = pKo.map((_,i) => (syls[i]/tot)*eDur);
      if (durs.some(d => d < MIN_DUR)) { const borr = durs.filter(d => d < MIN_DUR).reduce((a,b) => a + MIN_DUR - b, 0), lt = durs.filter(d => d >= MIN_DUR).reduce((a,b) => a+b, 0); durs = durs.map(d => d < MIN_DUR ? MIN_DUR : d - (d/lt)*borr); }
      let cum = NAR_ST;
      return pKo.map((ko, i) => { const st = cum; cum += durs[i]; return { start_time: Math.round(st*10)/10, end_time: Math.round((i === pKo.length-1 ? dur : cum)*10)/10, text_ko: ko.trim(), text_en: pEn[i]?.trim() || "" }; });
    };
    if (this.test_mode) {
      const sum = (t, mx=45) => { if (!t || t.length <= mx) return t; const s = t.split(/(?<=[.!?])\s*/); let r = ""; for (const x of s) if ((r+x).length <= mx) r += x; else break; return r?.length >= 10 ? r : t.substring(0,mx-3)+"..."; };
      const kp1 = kPoints[0] || "오늘 시장은 혼조세", kp2 = kPoints[1] || kp1, n1 = sum(kp1), n2 = sum(kp2);
      const ts = { title: `${aDateKr} ${mLabel} 증시`, title_english: `${mLabelEn} Market`, full_script: `${n1} ${n2}`, presenter: { name: "준호", gender: "male", age: "early_30s", voice_style: "warm Korean male" }, scenes: [{ scene_number: 1, duration: 8, narration: n1, narration_english: "Market update", timed_subtitles: splitSub(n1, "Market", 8), emotion: "serious", image_prompt: "Stock market visualization, blue gradient, 4K, TEXT-FREE, no people", part: "key_point" }, { scene_number: 2, duration: 8, narration: n2, narration_english: "Update", timed_subtitles: splitSub(n2, "Update", 8), emotion: "serious", image_prompt: "Financial charts, blue backdrop, 4K, TEXT-FREE, no people", part: "key_point" }], total_duration: 16, scene_count: 2, hashtags: ["#주식", `#${mLabel}주식`] };
      $.export("shorts_script", ts); $.export("$summary", `[테스트] 2씬, 16초`);
      return { analysis_date: aDate, market_label: mLabel, shorts_script: ts, _test_mode: true };
    }
    const MDL = { "gpt-4o": { prov: "openai", acc: 95, cost: 5 }, "gpt-4o-mini": { prov: "openai", acc: 85, cost: 2 }, "gemini-2.5-pro": { prov: "gemini", acc: 93, cost: 4 }, "gemini-2.5-flash": { prov: "gemini", acc: 85, cost: 2 }, "gemini-2.0-flash": { prov: "gemini", acc: 78, cost: 1 } };
    const selMdl = () => { const p = this.llm_priority || "balanced", av = Object.entries(MDL).filter(([,i]) => (i.prov === "openai" && this.openai_api_key) || (i.prov === "gemini" && this.gemini_api_key)).map(([m,i]) => ({ model: m, ...i })); if (!av.length) throw new Error("API 키 없음"); if (p === "accuracy") return av.sort((a,b) => b.acc - a.acc)[0].model; if (p === "cost") return av.sort((a,b) => a.cost - b.cost)[0].model; const q = av.filter(m => m.acc >= 80); return (q.length ? q : av).sort((a,b) => (b.acc/b.cost) - (a.acc/a.cost))[0].model; };
    const rMdl = this.llm_model === "auto" ? selMdl() : this.llm_model, mInfo = MDL[rMdl] || { prov: "gemini" };
    const callLLM = async (pr, tmp = 0.7) => { if (mInfo.prov === "openai") { const r = await axios($, { url: "https://api.openai.com/v1/chat/completions", method: "POST", headers: { Authorization: `Bearer ${this.openai_api_key}`, "Content-Type": "application/json" }, data: { model: rMdl, messages: [{ role: "user", content: pr }], temperature: tmp, max_tokens: 4096 } }); return r.choices[0].message.content; } const r = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/models/${rMdl}:generateContent`, method: "POST", headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" }, data: { contents: [{ parts: [{ text: pr }] }], generationConfig: { temperature: tmp, maxOutputTokens: 4096 } } }); return r.candidates[0].content.parts[0].text; };
    const styles = { news: { char: "금융 전문가" }, casual: { char: "친근한 투자 전문가" }, breaking: { char: "속보 앵커" }, educational: { char: "투자 교육가" } };
    const style = styles[this.shorts_style] || styles.casual, narSum = mA.narrative_summary || mA.summary || "", vTitle = vInfo.title || "";
    let opCtx = "전일 증시", opMent = `여러분, ${aDateKr} ${mLabel}증시 핵심 정리해요!`, skipRec = isWeekly;
    if (isWeekly) { opCtx = "주간 전망"; opMent = `여러분, 이번 주 ${mLabel}시장 핵심 정리!`; }
    else if (aType === "daily_market") { opCtx = "전일 증시"; skipRec = false; }
    else if (aType === "outlook") { opCtx = "시장 전망"; skipRec = true; }
    else if (aType === "issue") { opCtx = "주요 이슈"; skipRec = true; }
    else if (aType === "sector") { opCtx = "섹터 분석"; skipRec = false; }
    else if (aType === "stock") { opCtx = "종목 분석"; skipRec = false; }
    else if (!aType && vTitle.match(/2025|내년|전망/)) { opCtx = "시장 전망"; skipRec = true; }
    else if (!aType && vTitle.match(/종목|추천/)) { opCtx = "종목 분석"; skipRec = false; }
    console.log(`📢 ${opCtx}${skipRec ? " (추천스킵)" : ""}, picks=${topPicks.length}`);
    const base = "cinematic 4K, ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO LOGOS, NO WATERMARKS, no people, no faces";
    const genImg = (nar, type = "key_point") => {
      if (type === "opening") return `Stunning 3D glass globe with holographic stock market data flowing around it, blue purple neon gradient background, floating geometric shapes, volumetric lighting, ${base}`;
      if (type === "closing") return `Beautiful golden hour sunset over modern city skyline, warm orange purple gradient sky, lens flare, hopeful atmosphere, cinematic composition, ${base}`;
      if (type === "disclaimer") return `Elegant dark blue gradient with subtle grid pattern, professional minimalist design, soft ambient lighting, ${base}`;
      const kwMap = [
        { kw: ["테슬라","TSLA"], pr: "Sleek futuristic electric vehicle in showroom with dramatic red ambient lighting, chrome reflections, charging port glowing, cyberpunk aesthetic", p: 10 },
        { kw: ["엔비디아","NVDA"], pr: "Powerful GPU graphics card with glowing green LED circuits, inside high-tech server rack, matrix-style data visualization, emerald lighting", p: 10 },
        { kw: ["애플","AAPL"], pr: "Premium minimalist aluminum devices on white surface, soft studio lighting, clean modern aesthetic, subtle rainbow light reflection", p: 10 },
        { kw: ["마이크로소프트","MSFT"], pr: "Massive cloud data center with blue holographic displays, Azure-style architecture, floating cloud icons, cool blue atmosphere", p: 10 },
        { kw: ["구글","GOOGL"], pr: "Vibrant colorful data center with red yellow green blue lighting sections, AI neural pathways visualization, playful tech aesthetic", p: 10 },
        { kw: ["아마존","AMZN"], pr: "Massive automated warehouse with robotic arms, delivery drones hovering, orange accent lighting, logistics visualization", p: 10 },
        { kw: ["메타","META"], pr: "Immersive VR metaverse landscape, floating islands, neon blue portals, virtual reality headset in foreground, digital universe", p: 10 },
        { kw: ["마이크론","MU"], pr: "Close-up of memory chips with blue LED reflections, RAM modules in formation, clean room aesthetic, technical precision", p: 10 },
        { kw: ["AMD"], pr: "High-performance processor with red RGB lighting, gaming aesthetic, heat sink with dramatic cooling, crimson glow", p: 10 },
        { kw: ["인텔","INTC"], pr: "Blue glowing processor chip, semiconductor fabrication facility, silicon wafer, Intel-blue corporate lighting", p: 10 },
        { kw: ["오픈AI","OpenAI","GPT","챗GPT"], pr: "Glowing AI brain made of neural network nodes, digital consciousness visualization, teal and white gradient, futuristic", p: 10 },
        { kw: ["팔란티어","PLTR"], pr: "Holographic big data dashboard floating in dark room, glowing data streams, surveillance-style interface, cyan accents", p: 10 },
        { kw: ["브로드컴","AVGO"], pr: "Network infrastructure chips connected by glowing fiber optics, data center backbone, purple blue lighting", p: 10 },
        { kw: ["퀄컴","QCOM"], pr: "5G mobile chip with wireless signal waves emanating, smartphone components, blue connectivity visualization", p: 10 },
        { kw: ["반도체","칩","HBM"], pr: "Stunning macro shot of semiconductor chip with intricate circuit traces, blue gold accents, silicon wafer background, tech marvel", p: 8 },
        { kw: ["AI","인공지능"], pr: "Mesmerizing neural network brain visualization, synapses firing with blue purple energy, deep learning concept, futuristic", p: 8 },
        { kw: ["전기차","EV","배터리"], pr: "Electric vehicle charging station at night with green energy flowing, battery cell visualization, sustainable future aesthetic", p: 8 },
        { kw: ["클라우드","데이터센터"], pr: "Endless rows of glowing server racks in massive data center, cool blue lighting, cloud icons floating, enterprise scale", p: 8 },
        { kw: ["S&P","나스닥","NASDAQ","다우"], pr: "Iconic Wall Street bronze bull statue with holographic stock charts rising behind it, golden hour lighting, prosperity symbol", p: 7 },
        { kw: ["상승","급등","강세","랠리"], pr: "Dynamic green upward arrows breaking through ceiling, bull market energy, particles rising, victorious atmosphere, growth visualization", p: 6 },
        { kw: ["하락","급락","약세","조정"], pr: "Red downward particles cascading like waterfall, bear market mood, crimson gradient, dramatic lighting, market correction visual", p: 6 },
        { kw: ["CPI","물가","인플레이션"], pr: "Artistic inflation gauge meter with needle in red zone, price tags floating upward, economic pressure visualization, warm tones", p: 7 },
        { kw: ["금리","FOMC","연준","파월"], pr: "Majestic Federal Reserve building facade with interest rate curve projected, marble columns, authoritative blue lighting", p: 7 },
        { kw: ["유가","WTI","원유","OPEC"], pr: "Oil derrick silhouette against dramatic sunset, crude oil waves, industrial energy aesthetic, amber orange sky", p: 7 },
        { kw: ["금","골드","금값"], pr: "Luxurious stack of gold bullion bars with dramatic lighting, precious metal glow, vault aesthetic, wealth visualization", p: 7 },
        { kw: ["비트코인","BTC","코인","암호화폐"], pr: "Golden Bitcoin floating in digital blockchain network, cryptocurrency mining visualization, orange and black aesthetic", p: 7 },
        { kw: ["만기","옵션","선물"], pr: "Complex derivatives trading floor visualization, options chains floating, expiration countdown aesthetic, intense trading mood", p: 6 },
        { kw: ["실적","어닝","매출"], pr: "3D earnings chart with glowing bars rising, quarterly results visualization, corporate success aesthetic, professional lighting", p: 6 },
        { kw: ["둔화","하락세"], pr: "Gentle downward slope visualization with soft amber lighting, careful market mood, cautious aesthetic", p: 5 },
        { kw: ["전망","예상","예측"], pr: "Crystal ball with stock market reflections, future forecast visualization, mystical blue purple glow, oracle aesthetic", p: 5 },
      ];
      const matched = kwMap.filter(k => k.kw.some(w => nar.includes(w))).sort((a,b) => b.p - a.p);
      if (matched.length > 0) { const top2 = matched.slice(0,2).map(m => m.pr); return `${top2.join(", ")}, dramatic cinematic lighting, ${base}`; }
      return `Professional financial news studio with holographic data streams, glass desk, blue gradient backdrop, breaking news atmosphere, ${base}`;
    };
    if (isWeekly && kPoints.length >= 2) {
      const splitLong = (txt, maxS = 40) => {
        const syl = countSyl(txt); if (syl <= maxS) return [txt];
        const pts = [];
        for (let i = 0; i < txt.length; i++) {
          if (txt[i] === ',' || txt[i] === ' ') {
            const p1 = txt.slice(0,i+1).trim(), p2 = txt.slice(i+1).trim(), s1 = countSyl(p1), s2 = countSyl(p2);
            if (s1 >= 8 && s2 >= 8) pts.push({ p1, p2, s1, s2, diff: Math.abs(s1-s2), ok: s1 <= maxS && s2 <= maxS });
          }
        }
        if (!pts.length) return [txt];
        const ok = pts.filter(p => p.ok).sort((a,b) => a.diff - b.diff);
        if (ok.length) return [ok[0].p1, ok[0].p2];
        pts.sort((a,b) => a.diff - b.diff);
        const b = pts[0], r = [];
        r.push(...(b.s1 > maxS ? splitLong(b.p1, maxS) : [b.p1]));
        r.push(...(b.s2 > maxS ? splitLong(b.p2, maxS) : [b.p2]));
        return r;
      };
      const splitScenes = (txt, maxS = 40) => {
        let cl = removeEmojis(txt).replace(/\[W\d+\s*(요약|전망)\]\s*/g, "").replace(/[+\-](\d)/g, "$1").replace(/\$(\d+(?:\.\d+)?)/g, "$1달러").replace(/(\d+(?:\.\d+)?)%/g, "$1퍼센트").trim();
        const sents = cl.split(/(?<=[요죠다에어]\.)\s*/).filter(s => s.trim()), sc = [];
        let cur = "", curS = 0;
        for (const s of sents) {
          const ss = countSyl(s);
          if (curS + ss <= maxS) { cur = cur ? `${cur} ${s}` : s; curS += ss; }
          else { if (cur) sc.push(cur.trim()); if (ss > maxS) { const sp = splitLong(s, maxS); for (let i = 0; i < sp.length-1; i++) sc.push(sp[i]); cur = sp[sp.length-1]; curS = countSyl(cur); } else { cur = s; curS = ss; } }
        }
        if (cur) sc.push(cur.trim());
        return sc;
      };
      const scenes = [{ scene_number: 1, duration: 6, narration: opMent, narration_english: `Key ${mLabelEn} update!`, emotion: "friendly", image_prompt: genImg(opMent, "opening"), part: "opening" }];
      let sNum = 2;
      for (const kp of kPoints) {
        for (const nar of splitScenes(kp, 40)) {
          scenes.push({ scene_number: sNum++, duration: 8, narration: nar, narration_english: "", emotion: "serious", image_prompt: genImg(nar), part: "key_point" });
        }
      }
      scenes.push({ scene_number: sNum++, duration: 4, narration: "도움이 되셨다면, 구독과 좋아요 부탁드려요!", narration_english: "Please subscribe!", emotion: "friendly", image_prompt: genImg("", "closing"), part: "closing" });
      scenes.push({ scene_number: sNum++, duration: 4, narration: "본 영상은 투자 권유가 아닙니다", narration_english: "Not investment advice", emotion: "serious", image_prompt: genImg("", "disclaimer"), part: "disclaimer", is_disclaimer: true });
      let cTime = 0;
      const fScenes = scenes.map((s, i) => { const cn = convTTS(removeEmojis(s.narration)), d = calcDur(cn), st = cTime; cTime += d; return { ...s, scene_number: i+1, duration: d, time_range: `${st}-${cTime}초`, narration: cn, syllable_count: countSyl(cn), timed_subtitles: splitSub(cn, s.narration_english, d) }; });
      const script = { title: `이번 주 ${mLabel}시장 전망`, title_english: `${mLabelEn} Weekly`, full_script: fScenes.map(s => s.narration).join(" "), presenter: { name: "준호", gender: "male", age: "early_30s", voice_style: "warm Korean male" }, scenes: fScenes, total_duration: cTime, scene_count: fScenes.length, hashtags: ["#주식", `#${mLabel}주식`, "#주간전망"] };
      $.export("shorts_script", script); $.export("$summary", `[Weekly] ${script.scene_count}씬, ${script.total_duration}초`);
      return { analysis_date: aDate, market_label: mLabel, shorts_script: script, _weekly: true };
    }
    const kpCnt = kPoints.length, opDur = isWeekly ? 6 : 4, sDur = 8, sSyl = 40;
    const kpSc = kpCnt * 2, hasRec = topPicks.length >= 1 && !skipRec, recSc = hasRec ? Math.min(topPicks.length, 2) : 0;
    const totSc = 1 + kpSc + recSc + 2, totDur = opDur + (kpSc * sDur) + (recSc * 8) + 10;
    const ords = ["첫째", "둘째", "셋째", "넷째", "다섯째"];
    const kpList = kPoints.map((kp, i) => `[kp${i+1}] "${ords[i]||`${i+1}번째`}": "${kp}" (35음절)`).join("\n");
    const getPickReason = (p) => p.reason || p.rationale || p.recommendation_reason || p.summary || p.analysis_summary || "";
    const recList = hasRec ? topPicks.slice(0, recSc).map((p, i) => `[종목${i+1}] ${p.ticker} (${p.company_name_kr||p.company_name}): ${getPickReason(p) || "주목할 만한 종목"}`).join("\n") : "";
    const prompt = `금융 유튜버. ${totDur}초 YouTube 대본.\n스타일: ${style.char}\n\n분석일: ${aDate} | 시장: ${mLabel}\n[요약] ${narSum}\n[핵심 포인트]\n${kPoints.map((p,i) => `${i+1}. ${p}`).join("\n")}\n[전망] ${mOutlook.sentiment || "혼조세"}\n${hasRec ? `[추천 종목 정보]\n${recList}` : "[추천 종목] 없음"}\n\n금지: 숫자/종목/뉴스 환각, 씬당 ${sSyl}음절 초과, "뉴스프레소" 언급 금지\n\n구조: ${totSc}씬, ${totDur}초\n씬1: 오프닝 (${opDur}초) "${opMent}"\n핵심 포인트 (각 ${sDur}초)\n${kpList}\n${hasRec ? `종목 추천 (${recSc}씬, 각 8초): 반드시 추천 이유를 간단히 포함! 예: "마이크론은 HBM 수요 증가로 주목받고 있어요"` : "종목 추천 스킵"}\n마무리 + 면책\n\nJSON:\n\`\`\`json\n{ "title": "제목", "title_english": "Title", "full_script": "전체대본", "presenter": { "name": "준호", "gender": "male", "age": "early_30s", "voice_style": "warm Korean male" }, "scenes": [{ "scene_number": 1, "duration": ${opDur}, "narration": "${opMent}", "narration_english": "Hello!", "timed_subtitles": [], "emotion": "friendly", "image_prompt": "Financial background, blue gradient, 4K, TEXT-FREE, no people", "part": "opening" }], "total_duration": ${totDur}, "hashtags": ["#주식"], "scene_count": ${totSc} }\n\`\`\`\n\n규칙: 씬1=인사말, 핵심포인트="첫째,둘째"로 시작, 종목추천="XXX는 YYY 때문에 주목"형식, image_prompt=영어만, 마지막="투자 권유 아님"(is_disclaimer:true)`;
    const res = await callLLM(prompt, 0.4), jMatch = res.match(/```json\s*([\s\S]*?)\s*```/);
    let script = JSON.parse(jMatch ? jMatch[1] : res);
    const MAX_S = 40, protNum = (t) => t.replace(/(\d),(\d)/g, '$1★$2'), restNum = (t) => t.replace(/(\d)★(\d)/g, '$1,$2');
    const protPhr = ["선물 옵션", "향후 가이던스", "EPS의 향후", "달러에서", "억에서", "조에서", "퍼센트에서", "사이로"];
    const hasProt = (t, i) => protPhr.some(p => { const idx = t.indexOf(p); return idx >= 0 && idx < i && idx + p.length > i; });
    const badSplit = (t, i) => /\d$/.test(t.slice(0,i)) && /^\d/.test(t.slice(i)) || /\d$/.test(t.slice(0,i).trim()) && /^(달러|억|조|만|퍼센트|%)/.test(t.slice(i).trim()) || /^에서/.test(t.slice(i).trim()) || hasProt(t, i);
    const splitNar = (nar) => {
      if (!nar) return [nar]; const tot = countSyl(nar); if (tot <= MAX_S) return [nar];
      const safe = protNum(nar), sentEnd = /(요|죠|니다|에요|어요|해요|습니다)[.!?]\s*/g, sents = [];
      let last = 0, m; while ((m = sentEnd.exec(safe)) !== null) { sents.push(restNum(safe.slice(last, m.index + m[0].length).trim())); last = m.index + m[0].length; }
      if (last < safe.length) sents.push(restNum(safe.slice(last).trim()));
      if (sents.length > 1) { const g = []; let c = "", cs = 0; for (const s of sents) { const sy = countSyl(s); if (cs + sy <= MAX_S) { c = c ? `${c} ${s}` : s; cs += sy; } else { if (c) g.push(c); c = s; cs = sy; } } if (c) g.push(c); if (g.length > 1) return g; }
      const brks = [/했고[,.]?\s*/g, /있고[,.]?\s*/g, /지만[,.]?\s*/g, /으며[,.]?\s*/g];
      for (const pat of brks) { pat.lastIndex = 0; for (const mt of [...safe.matchAll(pat)]) { const i = mt.index + mt[0].length, p1 = restNum(safe.slice(0,i).trim()), p2 = restNum(safe.slice(i).trim()), s1 = countSyl(p1), s2 = countSyl(p2); if (s1 >= 12 && s2 >= 12 && s1 <= 45 && s2 <= 45) return [p1, p2]; } }
      const cms = [...safe.matchAll(/,\s*/g)];
      for (const mt of cms) { const i = mt.index + mt[0].length; if (badSplit(nar, mt.index)) continue; const p1 = restNum(safe.slice(0,i).trim()), p2 = restNum(safe.slice(i).trim()), s1 = countSyl(p1), s2 = countSyl(p2); if (s1 >= 10 && s2 >= 10 && s1 <= 45 && s2 <= 45) return [p1, p2]; }
      const ws = nar.split(/\s+/); if (ws.length >= 4) { let best = -1, bestS = Infinity, cum = 0; for (let i = 1; i < ws.length; i++) { cum += ws[i-1].length + 1; const p1 = ws.slice(0,i).join(' '), p2 = ws.slice(i).join(' '), s1 = countSyl(p1), s2 = countSyl(p2); if (s1 < 10 || s2 < 10 || s1 > 45 || s2 > 45) continue; if (badSplit(nar, cum)) continue; if (/[은는이가을를에의로와과도만]$/.test(ws[i-1]) || /^\d+$/.test(ws[i-1])) continue; const b = Math.abs(s1-s2); if (b < bestS) { bestS = b; best = i; } } if (best > 0) return [ws.slice(0,best).join(' '), ws.slice(best).join(' ')]; }
      if (ws.length >= 2) { const mid = Math.ceil(ws.length / 2); console.log(`⚠️ splitNar fallback: ${nar.substring(0,30)}...`); return [ws.slice(0,mid).join(' '), ws.slice(mid).join(' ')]; }
      return [nar];
    };
    if (script.scenes) {
      let exp = [...script.scenes], iter = 10;
      while (iter-- > 0) { const nExp = []; let more = false; for (const s of exp) { if (["opening","closing"].includes(s.part) || s.is_disclaimer) { nExp.push(s); continue; } const sy = countSyl(s.narration); if (sy > MAX_S) { const pts = splitNar(s.narration); if (pts.length > 1) { more = true; for (let i = 0; i < pts.length; i++) nExp.push({ ...s, narration: pts[i], narration_english: i === 0 ? s.narration_english : "", duration: 8, _split: i+1 }); } else nExp.push(s); } else nExp.push(s); } exp = nExp; if (!more) break; }
      script.scenes = exp;
    }
    if (script.scenes) {
      const isDisc = (s) => s.is_disclaimer || s.part === "disclaimer" || (s.narration?.includes("투자") && s.narration?.includes("권유")) || s.narration?.includes("면책");
      script.scenes = script.scenes.map(s => isDisc(s) ? { ...s, is_disclaimer: true, part: "disclaimer", image_prompt: s.image_prompt || genImg("", "disclaimer") } : s);
      const discIdx = script.scenes.map((s,i) => isDisc(s) ? i : -1).filter(i => i >= 0);
      if (discIdx.length > 1) script.scenes = script.scenes.filter((_, i) => i === discIdx[discIdx.length - 1] || !discIdx.includes(i));
      if (!script.scenes.some(isDisc)) script.scenes.push({ scene_number: script.scenes.length + 1, duration: 4, narration: "본 영상은 투자 권유가 아닙니다", emotion: "serious", is_disclaimer: true, part: "disclaimer", image_prompt: genImg("", "disclaimer") });
      let cTime = 0;
      script.scenes = script.scenes.map((s, i) => { const cn = convTTS(removeEmojis(s.narration || "")), ce = removeEmojis(s.narration_english || ""), d = calcDur(cn), st = cTime; cTime += d; return { ...s, scene_number: i+1, duration: d, time_range: `${st}-${cTime}초`, narration: cn, narration_english: ce, syllable_count: countSyl(cn), timed_subtitles: splitSub(cn, ce, d) }; });
      script.total_duration = cTime; script.scene_count = script.scenes.length;
      if (!script.title_english) script.title_english = "Stock Market News";
    }
    console.log(`✅ 대본: ${script.scenes?.length || 0}씬, ${script.total_duration || 0}초`);
    $.export("shorts_script", script); $.export("$summary", `Shorts: ${script.scenes?.length || 0}씬, ${script.total_duration || 0}초`);
    return { analysis_date: aDate, market_label: mLabel, shorts_script: script, source_summary: { video_title: vInfo.title || null, market_outlook: mOutlook.sentiment, key_points_count: kPoints.length, top_picks: topPicks.slice(0,5).map(t => ({ ticker: t.ticker })) }, _llm: { model: rMdl, prov: mInfo.prov } };
  },
});
