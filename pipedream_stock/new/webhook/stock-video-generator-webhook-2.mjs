import { axios } from "@pipedream/platform";
export default defineComponent({
  name: "Stock Video Generator (Webhook V2)",
  description: "Webhook 트리거용 - Shorts 대본으로 씬별 이미지 + 비디오 생성 (Imagen + Veo 3.0)",
  props: {
    webhook_data: { type: "string", label: "Webhook Data (JSON)", description: "Webhook으로 받은 전체 데이터" },
    test_script_json: { type: "string", label: "테스트용 스크립트 (JSON)", optional: true },
    scene_filter: { type: "string", label: "씬 필터 (예: 1,3,5 또는 1-3)", optional: true },
    skip_image_generation: { type: "boolean", label: "이미지 생성 스킵", default: false },
    skip_video_generation: { type: "boolean", label: "비디오 생성 스킵", default: false },
    custom_image_urls: { type: "string", label: "커스텀 이미지 URL", optional: true },
    imagen_model: { type: "string", label: "Imagen Model", options: [{ label: "Imagen 4 Ultra", value: "imagen-4.0-ultra-generate-001" }, { label: "Imagen 4 Standard", value: "imagen-4.0-generate-001" }, { label: "Imagen 4 Fast", value: "imagen-4.0-fast-generate-001" }], default: "imagen-4.0-generate-001" },
    veo_model: { type: "string", label: "Veo Model", options: [{ label: "Veo 3.0 Fast", value: "veo-3.0-fast-generate-001" }, { label: "Veo 3.0 Generate", value: "veo-3.0-generate-001" }], default: "veo-3.0-fast-generate-001" },
    disable_veo_audio: { type: "boolean", label: "Veo 오디오 비활성화", default: false },
    dynamic_background: { type: "boolean", label: "동적 배경", default: true },
    speaking_speed: { type: "string", label: "말하기 속도", options: [{ label: "느림 0.9x", value: "slow" }, { label: "보통 1.0x", value: "normal" }, { label: "약간빠름 1.1x", value: "slightly_fast" }, { label: "빠름 1.2x", value: "fast" }], default: "slightly_fast" },
    voice_gender: { type: "string", label: "보이스 성별", options: [{ label: "남성", value: "male" }, { label: "여성", value: "female" }], default: "male" },
    aspect_ratio: { type: "string", label: "화면 비율", options: [{ label: "16:9", value: "16:9" }, { label: "9:16 (Shorts)", value: "9:16" }, { label: "1:1", value: "1:1" }], default: "16:9" },
    google_cloud: { type: "app", app: "google_cloud" },
    gcs_bucket_name: { type: "string", label: "GCS Bucket (Images)", default: "scene-image-generator-storage-mcp-test-457809" },
    gcs_video_bucket_name: { type: "string", label: "GCS Bucket (Videos)", default: "shorts-videos-storage-mcp-test-457809" },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    gemini_api_keys_extra: { type: "string", label: "추가 Gemini API Keys", optional: true, secret: true },
    veo_quota_per_key: { type: "integer", label: "API 키당 Veo 쿼터", default: 10 },
  },
  methods: {
    digitToKorean(d) { return ["영","일","이","삼","사","오","육","칠","팔","구"][parseInt(d)] || d; },
    numberToKorean(numStr) {
      const num = parseInt(numStr); if (isNaN(num) || num === 0) return "영";
      const units = ["","만","억","조"], small = ["","십","백","천"], digs = ["","일","이","삼","사","오","육","칠","팔","구"];
      let r = ""; const s = num.toString(), len = s.length;
      for (let i = 0; i < len; i++) { const d = parseInt(s[i]), pos = len-1-i, uIdx = Math.floor(pos/4), sIdx = pos%4; if (d !== 0) r += (d === 1 && sIdx > 0) ? small[sIdx] : digs[d] + small[sIdx]; if (sIdx === 0 && uIdx > 0 && parseInt(s.substring(Math.max(0,i-3), i+1)) > 0) r += units[uIdx]; }
      return r || "영";
    },
    decimalToKorean(numStr) {
      const p = numStr.split("."); if (p.length !== 2) return this.numberToKorean(numStr);
      const dec = p[1].replace(/0+$/, "") || "0";
      return `${this.numberToKorean(p[0])} 점 ${[...dec].map(d => this.digitToKorean(d)).join("")}`;
    },
    convertToKoreanNarration(text) {
      const eng2kor = { "S&P":"에스앤피","NASDAQ":"나스닥","KOSPI":"코스피","KOSDAQ":"코스닥","DOW":"다우","NYSE":"뉴욕증권거래소","FTSE":"풋시","CPI":"씨피아이","GDP":"지디피","PCE":"피씨이","PPI":"피피아이","Fed":"연준","FED":"연준","FOMC":"에프오엠씨","BOJ":"비오제이","BoJ":"비오제이","ECB":"이씨비","IMF":"아이엠에프","AI":"에이아이","EPS":"이피에스","PER":"피이알","ROE":"알오이","ETF":"이티에프","IPO":"아이피오","WTI":"더블유티아이","USD":"달러","EUR":"유로","JPY":"엔","CNY":"위안" };
      let r = text; for (const [e,k] of Object.entries(eng2kor)) r = r.replace(new RegExp(e,"gi"), k);
      r = r.replace(/[+\-](\d+\.?\d*%)/g, "$1");
      r = r.replace(/(\d+\.?\d*)%/g, (m,n) => n.includes(".") ? this.decimalToKorean(n)+"퍼" : [...n].map(d => this.digitToKorean(d)).join("")+"퍼");
      r = r.replace(/(\d+\.\d+)(퍼센트|퍼)/g, (m,n) => this.decimalToKorean(n)+"퍼");
      r = r.replace(/(\d+\.\d+)달러/g, (m,n) => this.decimalToKorean(n)+"달러");
      r = r.replace(/\$(\d+\.?\d*)/g, (m,n) => n.includes(".") ? this.decimalToKorean(n)+"달러" : n+"달러");
      r = r.replace(/%/g, "퍼").replace(/\$/g, "달러");
      r = r.replace(/(\d+)([가-힣])/g, (m,n,h) => this.numberToKorean(n)+" "+h);
      r = r.replace(/\d+/g, m => this.numberToKorean(m));
      return r;
    },
    generatePronunciationGuide(t) { return this.convertToKoreanNarration(t); },
  },
  async run({ $ }) {
    let data; const srcLbl = this.test_script_json ? "테스트" : "Webhook";
    try { data = typeof (this.test_script_json || this.webhook_data) === "string" ? JSON.parse(this.test_script_json || this.webhook_data) : (this.test_script_json || this.webhook_data); } catch (e) { throw new Error(`${srcLbl} 파싱 실패: `+e.message); }
    if (data.event?.body) data = data.event.body;
    const script = data.shorts_script || data, scenes = script.scenes || [], aDate = data.analysis_date || new Date().toISOString().split("T")[0], mLabel = data.market_label || "글로벌";
    if (!scenes.length) throw new Error("씬이 없습니다.");
    console.log(`📅 ${aDate} | 🌍 ${mLabel} | 📊 ${scenes.length}씬`);
    const { google } = await import("googleapis"), { Readable } = await import("stream");
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(this.google_cloud.$auth.key_json), scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] });
    const storage = google.storage({ version: "v1", auth });
    const chkGcs = async (b,f) => { try { await storage.objects.get({ bucket: b, object: f }); return true; } catch { return false; } };
    const dlGcs = async (b,f) => { try { const r = await storage.objects.get({ bucket: b, object: f, alt: "media" }, { responseType: "arraybuffer" }); return Buffer.from(r.data).toString("base64"); } catch { return null; } };
    const m2e = { "글로벌":"global","미국":"us","한국":"kr","중국":"cn","일본":"jp","유럽":"eu" }, mEn = m2e[mLabel] || mLabel.replace(/[^a-zA-Z0-9]/g, "");
    const folder = `stock-${mEn}-${aDate.replace(/-/g, "")}`;
    const parseFilter = (f) => { if (!f?.trim()) return null; const idx = new Set(); for (const p of f.split(",").map(x => x.trim())) { if (p.includes("-")) { const [s,e] = p.split("-").map(n => parseInt(n,10)); for (let i = s; i <= e; i++) idx.add(i); } else idx.add(parseInt(p,10)); } return idx; };
    let tgtScenes = scenes; const isTest = data._test_mode === true, hasFilter = !!(this.scene_filter && !isTest);
    if (hasFilter) { const f = parseFilter(this.scene_filter); tgtScenes = scenes.filter(s => f.has(s.scene_number)); }
    if (!tgtScenes.length) throw new Error("필터링된 씬 없음");
    console.log(`🎬 ${tgtScenes.length}씬 처리`);
    const normDur = (d) => { const v = parseInt(d,10) || 4; return v <= 4 ? 4 : v <= 5 ? 5 : v <= 6 ? 6 : v <= 7 ? 7 : 8; };
    const presenter = script.presenter || {}, pGender = this.voice_gender || presenter.gender || "male";
    console.log(`📂 ${folder} | 🎤 ${pGender}`);
    const bgMap = { "modern studio":"clean studio with soft gradient lighting","news studio":"professional studio with soft blue gradient backdrop","transition":"studio with smooth color transition","sector chart":"studio with soft green accent lighting","stock ticker":"studio with warm ambient lighting","warning accent":"studio with subtle orange-red accent lighting","minimal background":"pure clean solid color studio backdrop" };
    const imgRes = [], vidRes = [], VEO_DLY = 30000, POLL_INT = 10000, MAX_POLL = 60;
    let custUrls = {}, singleUrl = null;
    if (this.custom_image_urls?.trim()) { const u = this.custom_image_urls.trim(); if (u.startsWith("{")) { try { custUrls = JSON.parse(u); } catch {} } else if (u.startsWith("http")) singleUrl = u; }
    const sceneImgs = {}, hasCust = Object.keys(custUrls).length > 0 || singleUrl;
    if (hasCust) {
      for (const sc of tgtScenes) { const sn = sc.scene_number, url = custUrls[sn] || custUrls[String(sn)] || singleUrl; if (!url) continue; try { const r = await axios($, { url, method: "GET", responseType: "arraybuffer" }); sceneImgs[sn] = Buffer.from(r).toString("base64"); imgRes.push({ scene_number: sn, duration: normDur(sc.duration), image_url: url, custom_url: true, success: true }); } catch (e) { imgRes.push({ scene_number: sn, success: false, error: e.message }); } }
    } else if (!this.skip_image_generation) {
      const sanitize = (t) => { if (!t) return t; const rep = { "U.S. flag":"Wall Street skyline","American flag":"financial district","Chinese flag":"Asian market","flag":"geometric pattern","tariff":"global trade","trade war":"international commerce","sanctions":"economic policy","government policy":"economic indicators","political":"economic","Capitol building":"government architecture","White House":"institutional building","Congress":"legislative institution","Trump":"US administration","Biden":"US administration","president":"administration","Federal Reserve building":"banking concept","Federal Reserve":"central banking","Fed building":"finance concept","central bank building":"finance architecture","monetary policy":"interest rate","interest rate charts":"financial graphs","financial crisis":"market volatility","economic crisis":"market downturn","crisis":"market uncertainty","crash":"market correction","collapse":"market decline","war":"global tension","military":"defense sector","conflict":"market uncertainty","invasion":"geopolitical event","fighter jet":"aircraft silhouette","stealth aircraft":"advanced aircraft","weapon":"defense equipment","missile":"aerospace technology","logo":"brand visualization","trademark":"brand identity" }; let s = t; for (const [f,r] of Object.entries(rep)) s = s.replace(new RegExp(f,"gi"), r); return s; };
      for (let i = 0; i < tgtScenes.length; i++) {
        const sc = tgtScenes[i], sn = sc.scene_number, bg = sc.background || "modern studio", nar = sc.narration || "", bgDesc = bgMap[bg] || bg, sType = sc.part || "key_point";
        const imgFile = `${folder}/scene_${String(sn).padStart(2,"0")}.png`;
        if (!hasFilter) { const ex = await chkGcs(this.gcs_bucket_name, imgFile); if (ex) { const b64 = await dlGcs(this.gcs_bucket_name, imgFile); if (b64) { sceneImgs[sn] = b64; imgRes.push({ scene_number: sn, duration: normDur(sc.duration), success: true, skipped: true, gcs_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${imgFile}` }); continue; } } }
        let bgPr = ""; if (sc.image_prompt?.trim()) { bgPr = sanitize(sc.image_prompt); } else { bgPr = sType === "opening" ? "Abstract financial background, blue purple gradient, digital data flow" : sType === "key_point" ? "Professional news studio, blurred stock charts, blue green gradient" : sType === "recommendation" ? "Upward trending graph, golden green particles" : sType === "closing" || sType === "disclaimer" ? "Clean minimal gradient, blue purple transition" : `${bgDesc} - abstract visualization`; }
        const pr = `[CRITICAL] TEXT-FREE, NO LETTERS, NO WORDS. NO people, NO faces. Generate: ${bgPr}. ${this.aspect_ratio} format. Cinematic 4K. [CHECK] NO text, NO people`;
        try {
          const resp = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`, method: "POST", headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" }, data: { instances: [{ prompt: pr }], parameters: { sampleCount: 1, aspectRatio: this.aspect_ratio } } });
          const b64 = resp.predictions?.[0]?.bytesBase64Encoded; if (!b64) throw new Error(resp.predictions?.[0]?.raiFilteredReason || "No image");
          sceneImgs[sn] = b64; let imgUrl = null;
          try { await storage.objects.insert({ bucket: this.gcs_bucket_name, name: imgFile, media: { mimeType: "image/png", body: Readable.from(Buffer.from(b64,"base64")) } }); imgUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${imgFile}`; } catch {}
          imgRes.push({ scene_number: sn, duration: normDur(sc.duration), image_url: imgUrl, success: true }); console.log(`✅ Scene ${sn} 이미지`);
        } catch (e) { console.error(`❌ Scene ${sn}: ${e.message}`); imgRes.push({ scene_number: sn, success: false, error: e.message }); }
      }
    } else {
      for (const sc of tgtScenes) { const sn = sc.scene_number, url = `https://storage.googleapis.com/${this.gcs_bucket_name}/${folder}/scene_${String(sn).padStart(2,"0")}.png`; try { const r = await axios($, { url, method: "GET", responseType: "arraybuffer" }); sceneImgs[sn] = Buffer.from(r).toString("base64"); imgRes.push({ scene_number: sn, duration: normDur(sc.duration), image_url: url, skipped: true, success: true }); } catch (e) { imgRes.push({ scene_number: sn, success: false, error: e.message }); } }
    }
    if (!this.skip_video_generation) {
      const withImgs = tgtScenes.filter(s => sceneImgs[s.scene_number]); console.log(`🎥 ${withImgs.length}씬 비디오 생성`);
      const veoKeys = [this.gemini_api_key]; if (this.gemini_api_keys_extra?.trim()) veoKeys.push(...this.gemini_api_keys_extra.split(",").map(k => k.trim()).filter(k => k));
      const qPerKey = this.veo_quota_per_key || 10; console.log(`🔑 ${veoKeys.length}키 (키당 ${qPerKey}개)`);
      const pendOps = [], skippedVid = [];
      const forbid = { "트럼프":"미국 대통령","Trump":"US President","trump":"US President","바이든":"미국 대통령","Biden":"US President","biden":"US President","시진핑":"중국 주석","푸틴":"러시아 대통령","김정은":"북한 지도자","FED":"미국 중앙은행","Fed":"미국 중앙은행","연준":"미국 중앙은행","연방준비제도":"미국 중앙은행","Federal Reserve":"US Central Bank","전쟁":"분쟁","폭락":"급락","폭등":"급등","붕괴":"하락","공황":"불안","좋아 보여요":"주목해볼 만해요","추천드려요":"살펴보세요","사세요":"관심 가져보세요","매수":"관심","매도":"정리" };
      const compKw = { "테슬라":{ bg:"Tesla, electric vehicles", kw:"TESLA" },"tesla":{ bg:"Tesla, electric vehicles", kw:"TESLA" },"애플":{ bg:"Apple, iPhone", kw:"APPLE" },"apple":{ bg:"Apple, iPhone", kw:"APPLE" },"엔비디아":{ bg:"NVIDIA, GPU chips", kw:"NVIDIA" },"nvidia":{ bg:"NVIDIA, GPU chips", kw:"NVIDIA" },"아마존":{ bg:"Amazon, e-commerce", kw:"AMAZON" },"구글":{ bg:"Google, cloud", kw:"GOOGLE" },"마이크로소프트":{ bg:"Microsoft, Azure", kw:"MICROSOFT" },"메타":{ bg:"Meta, VR", kw:"META" },"삼성":{ bg:"Samsung, semiconductors", kw:"SAMSUNG" },"반도체":{ bg:"semiconductor chips", kw:"SEMICONDUCTORS" },"ai":{ bg:"AI neural networks", kw:"AI BOOM" },"인공지능":{ bg:"AI neural networks", kw:"AI BOOM" },"로봇":{ bg:"robotic arms", kw:"ROBOTICS" },"자율주행":{ bg:"self-driving car", kw:"AUTONOMOUS" },"금리":{ bg:"interest rate charts", kw:"INTEREST RATES" },"인플레이션":{ bg:"inflation graphs", kw:"INFLATION" },"유가":{ bg:"oil barrels", kw:"OIL PRICES" },"전기차":{ bg:"electric vehicles", kw:"EV SECTOR" },"급등":{ bg:"stock chart up, green arrows", kw:"SURGE" },"급락":{ bg:"stock chart down, red arrows", kw:"PLUNGE" } };
      const spdMap = { "slow":"0.9","normal":"1.0","slightly_fast":"1.1","fast":"1.2" }, spd = spdMap[this.speaking_speed] || "1.1";
      const gTxt = pGender === "male" ? "male" : "female";
      for (let i = 0; i < withImgs.length; i++) {
        const sc = withImgs[i], sn = sc.scene_number, dur = normDur(sc.duration), nar = sc.narration || "";
        const vidFile = `${folder}/scene_${String(sn).padStart(2,"0")}.mp4`;
        if (!hasFilter) { const ex = await chkGcs(this.gcs_video_bucket_name, vidFile); if (ex) { skippedVid.push({ scene_number: sn, duration: dur, video_url: `https://storage.googleapis.com/${this.gcs_video_bucket_name}/${vidFile}`, success: true, skipped: true }); continue; } }
        const img64 = sceneImgs[sn]; if (!img64) continue;
        let sanNar = nar; for (const [f,r] of Object.entries(forbid)) sanNar = sanNar.replace(new RegExp(f,"gi"), r);
        let matched = compKw[Object.keys(compKw).find(k => nar.toLowerCase().includes(k) || nar.includes(k))] || { bg:"stock market tickers", kw:"MARKET UPDATE" };
        const korNar = this.convertToKoreanNarration(sanNar), sType = sc.part || "key_point";
        const cam = sType === "opening" ? "Slow zoom out" : sType === "closing" ? "Gentle zoom in" : "Subtle pan or static";
        const res = this.aspect_ratio === "16:9" ? "1920x1080px" : this.aspect_ratio === "9:16" ? "1080x1920px" : "1080x1080px";
        const veoObj = { scene_id: `STOCK_S${sn}`, duration: `0-${dur}s`, visual_language: "NO TEXT ON SCREEN", audio_language: "KOREAN ONLY", description: `${matched.bg}, financial news background, NO PEOPLE, TEXT-FREE`, camera: cam, text_overlay: "NONE", animation: "Subtle particle effects, light rays, bokeh", audio: this.disable_veo_audio ? { bgm: "None", sfx: "None", narrator_voice: null } : { bgm: "Soft background", sfx: "None", narrator_voice: { text: korNar, language: "ko-KR", voice_gender: pGender === "male" ? "MALE" : "FEMALE" } }, consistency: "Match reference image, NO PEOPLE", technical: `${res}, 30fps, ${this.aspect_ratio}`, rules: ["VISUAL: No text","AUDIO: Korean narrator","No people"] };
        let curKeyIdx = Math.min(Math.floor(i / qPerKey), veoKeys.length - 1), curKey = veoKeys[curKeyIdx], tried = new Set([curKeyIdx]);
        console.log(`🎬 [${i+1}/${withImgs.length}] Scene ${sn}`);
        while (tried.size <= veoKeys.length) {
          try {
            const r = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/models/${this.veo_model}:predictLongRunning`, method: "POST", headers: { "x-goog-api-key": curKey, "Content-Type": "application/json" }, data: { instances: [{ prompt: JSON.stringify(veoObj), image: { bytesBase64Encoded: img64, mimeType: "image/png" } }], parameters: { aspectRatio: this.aspect_ratio, durationSeconds: dur } } });
            if (r.name) { pendOps.push({ sn, opName: r.name, dur, apiKey: curKey }); console.log(`✅ Scene ${sn} 요청`); } else vidRes.push({ scene_number: sn, success: false, error: "No op name" });
            break;
          } catch (e) {
            const st = e.response?.status, msg = e.response?.data?.error?.message || e.message;
            if ((st === 429 || st === 503 || msg?.includes("quota") || msg?.includes("RESOURCE_EXHAUSTED")) && tried.size < veoKeys.length) { let nxt = (curKeyIdx + 1) % veoKeys.length; while (tried.has(nxt) && tried.size < veoKeys.length) nxt = (nxt + 1) % veoKeys.length; tried.add(nxt); curKeyIdx = nxt; curKey = veoKeys[curKeyIdx]; console.warn(`⚠️ Scene ${sn} 쿼터초과 → 키#${curKeyIdx+1}`); await new Promise(r => setTimeout(r, 3000)); continue; }
            console.error(`❌ Scene ${sn}: ${msg}`); vidRes.push({ scene_number: sn, success: false, error: msg }); break;
          }
        }
        if (i < withImgs.length - 1) { console.log(`⏳ RPM 대기 30초`); await new Promise(r => setTimeout(r, VEO_DLY)); }
      }
      console.log(`📊 ${pendOps.length}개 요청 전송`);
      if (pendOps.length > 0) {
        const poll = async (op) => {
          const { sn, opName, dur, apiKey } = op; let vData = null, err = null, filtered = false;
          for (let a = 0; a < MAX_POLL; a++) {
            await new Promise(r => setTimeout(r, POLL_INT));
            try {
              const pr = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/${opName}`, method: "GET", headers: { "x-goog-api-key": apiKey } });
              if (pr.error) { err = JSON.stringify(pr.error); break; }
              if (pr.done) {
                const raiCnt = pr.response?.generateVideoResponse?.raiMediaFilteredCount || 0; if (raiCnt > 0) { err = `Content filtered (${raiCnt})`; filtered = true; break; }
                const uri = pr.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || pr.response?.videos?.[0]?.uri;
                if (uri) { const dl = await axios($, { url: uri, method: "GET", headers: { "x-goog-api-key": apiKey }, responseType: "arraybuffer" }); vData = Buffer.from(dl).toString("base64"); console.log(`✅ Scene ${sn} 완료`); } else err = "No video URI";
                break;
              }
              if (a % 10 === 0) console.log(`⏳ Scene ${sn} 대기 (${a}/${MAX_POLL})`);
            } catch (pe) { err = pe.message; }
          }
          if (!vData && !err) err = "Timeout";
          return { sn, dur, vData, err, filtered, apiKey };
        };
        let pollRes = await Promise.all(pendOps.map(poll));
        const filteredRes = pollRes.filter(r => r.filtered);
        if (filteredRes.length > 0) {
          console.log(`🔄 ${filteredRes.length}개 재시도`);
          for (const f of filteredRes) {
            const { sn, apiKey } = f, sc = withImgs.find(s => s.scene_number === sn), img64 = sceneImgs[sn]; if (!sc || !img64) continue;
            await new Promise(r => setTimeout(r, VEO_DLY));
            try {
              const rr = await axios($, { url: `https://generativelanguage.googleapis.com/v1beta/models/${this.veo_model}:predictLongRunning`, method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" }, data: { instances: [{ prompt: "Animate background with subtle motion. Particle effects, light rays, bokeh. NO people.", image: { bytesBase64Encoded: img64, mimeType: "image/png" } }], parameters: { aspectRatio: this.aspect_ratio, durationSeconds: normDur(sc.duration) } } });
              if (rr.name) { const retry = await poll({ sn, opName: rr.name, dur: normDur(sc.duration), apiKey }); const idx = pollRes.findIndex(r => r.sn === sn); if (idx !== -1 && retry.vData) { console.log(`✅ Scene ${sn} 재시도 성공`); pollRes[idx] = retry; } }
            } catch {}
          }
        }
        for (const r of pollRes) {
          const { sn, dur, vData, err } = r;
          if (vData) { let vUrl = null; try { const vf = `${folder}/scene_${String(sn).padStart(2,"0")}.mp4`; await storage.objects.insert({ bucket: this.gcs_video_bucket_name, name: vf, media: { mimeType: "video/mp4", body: Readable.from(Buffer.from(vData,"base64")) } }); vUrl = `https://storage.googleapis.com/${this.gcs_video_bucket_name}/${vf}`; } catch {} vidRes.push({ scene_number: sn, duration: dur, video_url: vUrl, success: true }); }
          else vidRes.push({ scene_number: sn, success: false, error: err });
        }
        if (skippedVid.length > 0) vidRes.push(...skippedVid);
      }
    }
    const imgOk = imgRes.filter(r => r.success).length, imgSkip = imgRes.filter(r => r.skipped).length, imgNew = imgOk - imgSkip;
    const vidOk = vidRes.filter(r => r.success).length, vidSkip = vidRes.filter(r => r.skipped).length, vidNew = vidOk - vidSkip;
    console.log(`\n📊 이미지: ${imgOk}/${tgtScenes.length} (신규${imgNew}/기존${imgSkip}) | 비디오: ${vidOk}/${tgtScenes.length} (신규${vidNew}/기존${vidSkip})`);
    const result = { folder_name: folder, analysis_date: aDate, market_label: mLabel, shorts_script: script, images: { total: imgOk, generated: imgNew, skipped: imgSkip, failed: imgRes.filter(r => !r.success).length, results: imgRes }, videos: { total: vidOk, generated: vidNew, skipped: vidSkip, failed: vidRes.filter(r => !r.success).length, results: vidRes }, generated_at: new Date().toISOString() };
    $.export("video_generation", result); $.export("$summary", `이미지: ${imgOk}개 (신규${imgNew}/기존${imgSkip}), 비디오: ${vidOk}개 (신규${vidNew}/기존${vidSkip})`);
    return result;
  },
});
