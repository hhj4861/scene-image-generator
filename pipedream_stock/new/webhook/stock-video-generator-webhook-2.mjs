import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Video Generator (Webhook V2)",
  description: "Webhook 트리거용 - Shorts 대본으로 씬별 이미지 + 비디오 생성 (Imagen + Veo 3.0)",

  props: {
    // =====================
    // Webhook 데이터 (자동 매핑)
    // =====================
    webhook_data: {
      type: "string",
      label: "Webhook Data (JSON)",
      description: "Webhook으로 받은 전체 데이터: {{JSON.stringify(steps.trigger.event.body)}}",
    },
    test_script_json: {
      type: "string",
      label: "테스트용 스크립트 (JSON)",
      description: "로컬 테스트용 스크립트 JSON. 입력 시 webhook_data 대신 사용됨. 예: pipedream_stock/validation/script/script.json 내용",
      optional: true,
    },

    // =====================
    // 생성 모드
    // =====================
    scene_filter: {
      type: "string",
      label: "씬 필터 (예: 1,3,5 또는 1-3)",
      description: "비어있으면 전체 씬 생성",
      optional: true,
    },
    skip_image_generation: {
      type: "boolean",
      label: "이미지 생성 스킵",
      description: "이미 이미지가 있는 경우 체크",
      default: false,
    },
    skip_video_generation: {
      type: "boolean",
      label: "비디오 생성 스킵 (이미지만)",
      default: false,
    },
    custom_image_urls: {
      type: "string",
      label: "커스텀 이미지 URL",
      description: 'URL 직접 입력 또는 JSON. 예: https://... (전체 적용) 또는 {"1":"https://..."}',
      optional: true,
    },

    // =====================
    // Imagen/Veo 설정
    // =====================
    imagen_model: {
      type: "string",
      label: "Imagen Model",
      options: [
        { label: "Imagen 4 Ultra (최고)", value: "imagen-4.0-ultra-generate-001" },
        { label: "Imagen 4 Standard", value: "imagen-4.0-generate-001" },
        { label: "Imagen 4 Fast", value: "imagen-4.0-fast-generate-001" },
      ],
      default: "imagen-4.0-generate-001",
    },
    veo_model: {
      type: "string",
      label: "Veo Model",
      options: [
        { label: "Veo 3.0 Fast (안정)", value: "veo-3.0-fast-generate-001" },
        { label: "Veo 3.0 Generate", value: "veo-3.0-generate-001" },
      ],
      default: "veo-3.0-fast-generate-001",
    },
    disable_veo_audio: {
      type: "boolean",
      label: "Veo 오디오 비활성화 (별도 TTS 사용 시)",
      description: "체크하면 음성 없이 영상만 생성 (별도 TTS 사용 시)",
      default: false,
    },
    dynamic_background: {
      type: "boolean",
      label: "동적 배경 (대본 기반)",
      description: "대본 내용에 맞는 배경 생성 (예: 테슬라 → 테슬라 로고/차량, 애플 → 애플 로고 등)",
      default: true,
    },
    speaking_speed: {
      type: "string",
      label: "말하기 속도",
      options: [
        { label: "느림 0.9x (정확한 발음)", value: "slow" },
        { label: "보통 1.0x", value: "normal" },
        { label: "약간빠름 1.1x (추천)", value: "slightly_fast" },
        { label: "빠름 1.2x (뉴스 스타일)", value: "fast" },
      ],
      default: "slightly_fast",
    },
    voice_gender: {
      type: "string",
      label: "보이스 성별",
      description: "나레이션 목소리 성별 선택",
      options: [
        { label: "남성", value: "male" },
        { label: "여성", value: "female" },
      ],
      default: "male",
    },
    aspect_ratio: {
      type: "string",
      label: "화면 비율",
      options: [
        { label: "16:9 (YouTube)", value: "16:9" },
        { label: "9:16 (Shorts)", value: "9:16" },
        { label: "1:1 (Square)", value: "1:1" },
      ],
      default: "16:9",
    },

    // =====================
    // GCS 설정
    // =====================
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket (Images)",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    gcs_video_bucket_name: {
      type: "string",
      label: "GCS Bucket (Videos)",
      default: "shorts-videos-storage-mcp-test-457809",
    },

    // =====================
    // API Key
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key (기본)",
      secret: true,
    },
    gemini_api_keys_extra: {
      type: "string",
      label: "추가 Gemini API Keys (Veo 쿼터용)",
      description: "콤마로 구분된 추가 API 키들. Veo는 키당 하루 10개 제한이므로 씬 11개 이상 시 필요. 예: key1,key2,key3",
      optional: true,
      secret: true,
    },
    veo_quota_per_key: {
      type: "integer",
      label: "API 키당 Veo 쿼터",
      description: "하나의 API 키로 생성 가능한 비디오 수 (기본: 10)",
      default: 10,
    },
  },

  methods: {
    // 숫자 한 자리 → 한글
    digitToKorean(digit) {
      const digits = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      return digits[parseInt(digit)] || digit;
    },

    // 정수 → 한글 (500 → 오백, 2000 → 이천, 11 → 십일)
    numberToKorean(numStr) {
      const num = parseInt(numStr);
      if (isNaN(num) || num === 0) return "영";
      
      const units = ["", "만", "억", "조"];
      const smallUnits = ["", "십", "백", "천"];
      const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      
      let result = "";
      const numString = num.toString();
      const len = numString.length;
      
      for (let i = 0; i < len; i++) {
        const d = parseInt(numString[i]);
        const pos = len - 1 - i;
        const unitIdx = Math.floor(pos / 4);
        const smallUnitIdx = pos % 4;
        
        if (d !== 0) {
          // 1인 경우 십, 백, 천 앞에서는 "일" 생략
          if (d === 1 && smallUnitIdx > 0) {
            result += smallUnits[smallUnitIdx];
          } else {
            result += digits[d] + smallUnits[smallUnitIdx];
          }
        }
        
        // 만, 억, 조 단위 추가
        if (smallUnitIdx === 0 && unitIdx > 0) {
          const groupStart = Math.max(0, i - 3);
          const groupDigits = numString.substring(groupStart, i + 1);
          if (parseInt(groupDigits) > 0) {
            result += units[unitIdx];
          }
        }
      }
      
      return result || "영";
    },

    // 소수점 숫자 → 한글 (56.65 → 오십육 점 육오, 2.7 → 이 점 칠)
    decimalToKorean(numStr) {
      const parts = numStr.split(".");
      if (parts.length !== 2) return this.numberToKorean(numStr);
      
      const intPart = parts[0];
      let decPart = parts[1];
      
      // 끝자리 0 제거 (0.10 → 0.1, 0.50 → 0.5)
      decPart = decPart.replace(/0+$/, "") || "0";
      
      // 정수부 변환 (56 → 오십육)
      const intKor = this.numberToKorean(intPart);
      // 소수부 변환 (65 → 육오, 각 자리수)
      const decKor = [...decPart].map(d => this.digitToKorean(d)).join("");
      
      // ★ 띄어쓰기 추가: "오십육점육오" → "오십육 점 육오"
      return `${intKor} 점 ${decKor}`;
    },

    // 나레이션을 완전한 한글로 변환 (TTS용)
    convertToKoreanNarration(text) {
      // ★★★ 1단계: 영어 약어 → 한국어 ★★★
      const englishToKorean = {
        "S&P": "에스앤피", "NASDAQ": "나스닥", "KOSPI": "코스피", "KOSDAQ": "코스닥",
        "DOW": "다우", "NYSE": "뉴욕증권거래소", "FTSE": "풋시",
        "CPI": "씨피아이", "GDP": "지디피", "PCE": "피씨이", "PPI": "피피아이",
        "Fed": "연준", "FED": "연준", "FOMC": "에프오엠씨", "BOJ": "비오제이", "BoJ": "비오제이",
        "ECB": "이씨비", "IMF": "아이엠에프",
        "AI": "에이아이", "EPS": "이피에스", "PER": "피이알", "ROE": "알오이",
        "ETF": "이티에프", "IPO": "아이피오", "WTI": "더블유티아이",
        "USD": "달러", "EUR": "유로", "JPY": "엔", "CNY": "위안",
      };

      let result = text;
      for (const [eng, kor] of Object.entries(englishToKorean)) {
        result = result.replace(new RegExp(eng, "gi"), kor);
      }

      // ★★★ 2단계: +/-숫자% → 숫자%로 변환 (기호 제거) ★★★
      // +0.10% 상승 → 0.10% 상승 (상승/하락이 방향을 나타내므로 +/- 불필요)
      result = result.replace(/[+\-](\d+\.?\d*%)/g, "$1");

      // ★★★ 3단계: 일반 숫자% → 한글 ★★★
      result = result.replace(/(\d+\.?\d*)%/g, (match, num) => {
        if (num.includes(".")) {
          return this.decimalToKorean(num) + "퍼";
        }
        return [...num].map(d => this.digitToKorean(d)).join("") + "퍼";
      });

      // ★★★ 3-1단계: 숫자퍼센트 → 한글 (대본에서 이미 변환된 경우) ★★★
      result = result.replace(/(\d+\.\d+)(퍼센트|퍼)/g, (match, num, suffix) => {
        return this.decimalToKorean(num) + "퍼";
      });

      // ★★★ 3-2단계: 숫자달러 → 한글 (대본에서 이미 변환된 경우) ★★★
      result = result.replace(/(\d+\.\d+)달러/g, (match, num) => {
        return this.decimalToKorean(num) + "달러";
      });

      // ★★★ 4단계: $숫자 → 숫자달러 ★★★
      result = result.replace(/\$(\d+\.?\d*)/g, (match, num) => {
        if (num.includes(".")) {
          return this.decimalToKorean(num) + "달러";
        }
        return num + "달러";
      });

      // ★★★ 5단계: 남은 단독 % → 퍼, $ → 달러 ★★★
      result = result.replace(/%/g, "퍼");
      result = result.replace(/\$/g, "달러");

      // ★★★ 6단계: 숫자+한글 → 한글 숫자 + 띄어쓰기 + 한글 (10월 → 십 월, 11월 → 십일 월) ★★★
      result = result.replace(/(\d+)([가-힣])/g, (match, num, hangul) => {
        return this.numberToKorean(num) + " " + hangul;
      });

      // ★★★ 7단계: 남은 단독 숫자 → 한글 ★★★
      result = result.replace(/\d+/g, (match) => this.numberToKorean(match));

      return result;
    },

    // 발음 가이드 생성 (한글 그대로)
    generatePronunciationGuide(text) {
      return this.convertToKoreanNarration(text);
    },
  },

  async run({ $ }) {
    // 데이터 파싱 (테스트 스크립트 우선, 없으면 웹훅 데이터)
    let data;
    const sourceLabel = this.test_script_json ? "테스트 스크립트" : "Webhook";
    try {
      const rawData = this.test_script_json || this.webhook_data;
      data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      console.log(`📋 ${sourceLabel} 데이터 사용`);
    } catch (e) {
      throw new Error(`${sourceLabel} 데이터 파싱 실패: ` + e.message);
    }

    // ★ 전체 webhook response 구조 자동 감지 (event.body 추출)
    if (data.event?.body) {
      console.log(`📦 전체 webhook 구조 감지 → event.body 추출`);
      data = data.event.body;
    }

    const shortsScript = data.shorts_script || data;
    const scenes = shortsScript.scenes || [];
    const analysisDate = data.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabel = data.market_label || "글로벌";

    if (!scenes.length) throw new Error("씬이 없습니다.");

    // ★ 디버깅 로그 (즉시 출력)
    console.log(`\n========== 디버깅 정보 ==========`);
    console.log(`📅 분석일: ${analysisDate}`);
    console.log(`🌍 시장: ${marketLabel}`);
    console.log(`📊 전체 씬 수: ${scenes.length}개`);
    console.log(`🔍 씬 필터 입력값: "${this.scene_filter || '(없음)'}"`);
    console.log(`🧪 _test_mode: ${data._test_mode}`);
    console.log(`==================================\n`);

    // GCS 설정
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

    // ★★★ GCS 파일 존재 여부 체크 함수 ★★★
    const checkGcsFileExists = async (bucketName, fileName) => {
      try {
        await storage.objects.get({ bucket: bucketName, object: fileName });
        return true;
      } catch (e) {
        if (e.code === 404 || e.status === 404) return false;
        // 404 외 에러는 존재하지 않는 것으로 간주
        return false;
      }
    };

    // ★★★ GCS에서 기존 파일 다운로드 함수 ★★★
    const downloadFromGcs = async (bucketName, fileName) => {
      try {
        const resp = await storage.objects.get({
          bucket: bucketName,
          object: fileName,
          alt: "media",
        }, { responseType: "arraybuffer" });
        return Buffer.from(resp.data).toString("base64");
      } catch (e) {
        return null;
      }
    };

    // 폴더명 생성 (한글 → 영어 변환)
    const marketLabelToEnglish = {
      "글로벌": "global",
      "미국": "us",
      "한국": "kr",
      "중국": "cn",
      "일본": "jp",
      "유럽": "eu",
    };
    const marketLabelEn = marketLabelToEnglish[marketLabel] || marketLabel.replace(/[^a-zA-Z0-9]/g, "");
    const folderName = `stock-${marketLabelEn}-${analysisDate.replace(/-/g, "")}`;

    // 씬 필터링
    const parseFilter = (filter) => {
      if (!filter?.trim()) return null;
      const indexes = new Set();
      for (const part of filter.split(",").map(p => p.trim())) {
        if (part.includes("-")) {
          const [s, e] = part.split("-").map(n => parseInt(n, 10));
          for (let i = s; i <= e; i++) indexes.add(i);
        } else {
          indexes.add(parseInt(part, 10));
        }
      }
      return indexes;
    };

    let targetScenes = scenes;
    const isTestMode = data._test_mode === true;

    // 테스트 모드일 때는 scene_filter 무시
    const hasSceneFilter = !!(this.scene_filter && !isTestMode);  // ★ 씬 필터 여부 저장
    
    if (hasSceneFilter) {
      const filter = parseFilter(this.scene_filter);
      targetScenes = scenes.filter(s => filter.has(s.scene_number));
      console.log(`🔄 씬 필터 활성화 - 선택된 씬은 GCS 존재 여부와 관계없이 재생성됩니다!`);
    }

    if (isTestMode) {
      console.log("🧪 테스트 모드 - scene_filter 무시, 전체 씬 사용");
    }

    if (!targetScenes.length) throw new Error("필터링된 씬이 없습니다.");

    console.log(`🎬 ${targetScenes.length}개 씬 처리 (씬별 이미지→비디오 방식)`);

    // Duration 정규화 (Veo 3.0은 4-8초 지원)
    const normalizeDuration = (d) => {
      const dur = parseInt(d, 10) || 4;
      if (dur <= 4) return 4;
      if (dur <= 5) return 5;
      if (dur <= 6) return 6;
      if (dur <= 7) return 7;
      return 8;
    };

    // ==========================================
    // 배경 영상 설정 (사람 없음 - 배경/그래픽만)
    // ==========================================
    console.log(`🎨 배경 전용 모드: 사람 없이 배경/그래픽만 생성`);

    // presenter 정보 (나레이션 목소리 지정용)
    // voice_gender prop이 설정되어 있으면 우선 사용, 아니면 스크립트의 presenter.gender 사용
    const presenter = shortsScript.presenter || {};
    const presenterGender = this.voice_gender || presenter.gender || "male";
    console.log(`🎤 보이스 성별: ${presenterGender}`);
    console.log(`🎙️ 나레이션 목소리: ${presenterGender === "male" ? "남성" : "여성"}`);
    console.log(`📂 폴더: ${folderName}`);
    console.log(`🎥 Veo 모델: ${this.veo_model}`);

    // 배경 매핑 - 텍스트/모니터/차트 등을 제외한 단순 배경으로 변경
    const backgroundMap = {
      "modern studio": "clean studio with soft gradient lighting, blurred background",
      "news studio": "professional studio with soft blue gradient backdrop, bokeh lights",
      "transition": "studio with smooth color transition lighting, abstract blurred background",
      "sector chart": "studio with soft green accent lighting, abstract bokeh background",
      "stock ticker": "studio with warm ambient lighting, blurred city lights backdrop",
      "warning accent": "studio with subtle orange-red accent lighting, clean backdrop",
      "minimal background": "pure clean solid color studio backdrop with soft lighting",
    };

    // ==========================================
    // 결과 저장
    // ==========================================
    const imageResults = [];
    const videoResults = [];

    // ==========================================
    // 상수
    // ==========================================
    const VEO_DELAY_MS = 30000; // RPM=2 제한 (30초당 1요청)
    const POLL_INTERVAL = 10000;
    const MAX_POLL_ATTEMPTS = 60;

    // ==========================================
    // 커스텀 이미지 URL 파싱
    // ==========================================
    let customImageUrls = {}; // { scene_number: url }
    let singleImageUrl = null; // 모든 씬에 동일 이미지 사용 시

    if (this.custom_image_urls?.trim()) {
      const urlInput = this.custom_image_urls.trim();
      if (urlInput.startsWith("{")) {
        // JSON 형식: {"1": "url1", "2": "url2"}
        try {
          customImageUrls = JSON.parse(urlInput);
          console.log(`📎 커스텀 이미지 URL ${Object.keys(customImageUrls).length}개 로드됨`);
        } catch (e) {
          console.warn(`⚠️ 커스텀 이미지 URL JSON 파싱 실패: ${e.message}`);
        }
      } else if (urlInput.startsWith("http")) {
        // 단일 URL: 모든 씬에 동일 이미지 사용
        singleImageUrl = urlInput;
        console.log(`📎 단일 커스텀 이미지 URL 로드됨: ${singleImageUrl.substring(0, 50)}...`);
      }
    }

    // ==========================================
    // STEP 1: 모든 씬 배경 이미지 생성 (Imagen - 사람 없음)
    // ==========================================
    const sceneImages = {}; // { scene_number: base64 }

    // 커스텀 이미지 URL이 있으면 Imagen 생성 대신 다운로드
    const hasCustomUrls = Object.keys(customImageUrls).length > 0 || singleImageUrl;

    if (hasCustomUrls) {
      console.log(`\n📥 === STEP 1: 커스텀 이미지 URL에서 다운로드 (${targetScenes.length}개 씬) ===`);

      for (const scene of targetScenes) {
        const sceneNum = scene.scene_number;
        const imageUrl = customImageUrls[sceneNum] || customImageUrls[String(sceneNum)] || singleImageUrl;

        if (!imageUrl) {
          console.warn(`⚠️ Scene ${sceneNum} 커스텀 이미지 URL 없음, Imagen 생성 필요`);
          continue;
        }

        try {
          console.log(`📥 Scene ${sceneNum} 이미지 다운로드 중... ${imageUrl.substring(0, 60)}...`);
          const imgResp = await axios($, {
            url: imageUrl,
            method: "GET",
            responseType: "arraybuffer",
          });
          const imageBase64 = Buffer.from(imgResp).toString("base64");
          sceneImages[sceneNum] = imageBase64;

          imageResults.push({
            scene_number: sceneNum,
            duration: normalizeDuration(scene.duration),
            image_url: imageUrl,
            custom_url: true,
            success: true,
          });
          console.log(`✅ Scene ${sceneNum} 이미지 다운로드 완료 (${Math.round(imageBase64.length / 1024)}KB)`);
        } catch (e) {
          console.error(`❌ Scene ${sceneNum} 이미지 다운로드 실패: ${e.message}`);
          imageResults.push({ scene_number: sceneNum, success: false, error: e.message });
        }
      }

      console.log(`📊 커스텀 이미지 다운로드 완료: ${imageResults.filter(r => r.success).length}/${targetScenes.length}`);
    } else if (!this.skip_image_generation) {
      console.log(`\n🖼️ === STEP 1: 배경 이미지 생성 (${targetScenes.length}개 씬, 사람 없음) ===`);

      // ★★★ LLM 기반 영어 키워드 추출 함수 ★★★
      const extractEnglishKeywordsWithLLM = async (narration) => {
        if (!narration) return [];
        
        try {
          const prompt = `You are a financial image text overlay generator. Extract company names, tickers, brands, or key financial terms from the Korean narration and convert them to proper English for image display.

NARRATION:
"${narration}"

RULES:
1. Extract ONLY proper nouns: company names, stock tickers, brand names, index names, sector names
2. Convert Korean names to official English names (e.g., 테슬라→TESLA, 엔비디아→NVIDIA, 골드만삭스→GOLDMAN SACHS)
3. Keep already-English terms as-is (e.g., AI, AMD, TSMC)
4. EXCLUDE: 연준, Fed, 정부, 중앙은행 (political/sensitive terms - not suitable for images)
5. EXCLUDE: Korean companies if market is US (e.g., 삼성전자, SK하이닉스)
6. Return MAX 2 keywords, prioritize by importance
7. Use UPPERCASE for brand visibility

RESPOND WITH ONLY A JSON ARRAY (no explanation):
["KEYWORD1", "KEYWORD2"]

If no suitable keywords found, respond: []`;

          const resp = await axios($, {
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
            method: "POST",
            headers: { 
              "Content-Type": "application/json", 
              "x-goog-api-key": this.gemini_api_key 
            },
            data: {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
            },
          });

          const result = resp.candidates[0].content.parts[0].text.trim();
          // JSON 배열 파싱
          const match = result.match(/\[.*\]/s);
          if (match) {
            const keywords = JSON.parse(match[0]);
            return keywords.filter(k => k && typeof k === 'string').slice(0, 2);
          }
          return [];
        } catch (e) {
          console.log(`   ⚠️ LLM 키워드 추출 실패: ${e.message}`);
          return [];
        }
      };

      // ★★★ 모든 씬의 영어 키워드를 한번에 추출 (배치 처리로 API 호출 최소화) ★★★
      const extractAllEnglishKeywords = async (scenes) => {
        const narrations = scenes.map(s => `[Scene ${s.scene_number}] ${s.narration || ""}`).join("\n");
        
        try {
          const prompt = `You are a financial image text overlay generator. For each scene, extract company names, tickers, brands, or key financial terms from the Korean narration and convert them to proper English.

SCENES:
${narrations}

RULES:
1. Extract ONLY proper nouns: company names, stock tickers, brand names, index names, sector names
2. Convert Korean names to official English names (e.g., 테슬라→TESLA, 엔비디아→NVIDIA, 골드만삭스→GOLDMAN SACHS)
3. Keep already-English terms as-is (e.g., AI, AMD, TSMC)
4. EXCLUDE: 연준, Fed, 정부, 중앙은행, 트럼프, 바이든 (political/sensitive terms)
5. EXCLUDE: Korean companies if they don't trade on US exchanges (e.g., 삼성전자, SK하이닉스 → exclude)
6. Return MAX 2 keywords per scene, prioritize by importance
7. Use UPPERCASE for brand visibility

RESPOND WITH ONLY A JSON OBJECT (no explanation):
{
  "1": ["KEYWORD1", "KEYWORD2"],
  "2": ["KEYWORD"],
  "3": []
}

If a scene has no suitable keywords, use empty array [].`;

          const resp = await axios($, {
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
            method: "POST",
            headers: { 
              "Content-Type": "application/json", 
              "x-goog-api-key": this.gemini_api_key 
            },
            data: {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
            },
          });

          const result = resp.candidates[0].content.parts[0].text.trim();
          // JSON 객체 파싱
          const match = result.match(/\{[\s\S]*\}/);
          if (match) {
            const keywordsMap = JSON.parse(match[0]);
            console.log(`   🔤 영어 키워드 추출 완료:`, JSON.stringify(keywordsMap));
            return keywordsMap;
          }
          return {};
        } catch (e) {
          console.log(`   ⚠️ LLM 배치 키워드 추출 실패: ${e.message}`);
          return {};
        }
      };

      // 먼저 모든 씬의 영어 키워드를 배치로 추출
      console.log(`   🔤 LLM으로 영어 키워드 추출 중...`);
      const allEnglishKeywords = await extractAllEnglishKeywords(targetScenes);

      for (let i = 0; i < targetScenes.length; i++) {
        const scene = targetScenes[i];
        const sceneNum = scene.scene_number;
        const background = scene.background || "modern studio";
        const narration = scene.narration || "";

        const backgroundDesc = backgroundMap[background] || background;
        const sceneType = scene.part || "key_point";

        // ★★★ GCS에 이미 존재하는 이미지 스킵 (씬 필터 있으면 무조건 재생성) ★★★
        const imageFileName = `${folderName}/scene_${String(sceneNum).padStart(2, "0")}.png`;
        
        if (!hasSceneFilter) {  // ★ 씬 필터 없을 때만 GCS 체크
          const imageExists = await checkGcsFileExists(this.gcs_bucket_name, imageFileName);
          
          if (imageExists) {
            console.log(`⏭️ Scene ${sceneNum} 이미지 이미 존재 - 스킵 (GCS에서 다운로드)`);
            const existingImageBase64 = await downloadFromGcs(this.gcs_bucket_name, imageFileName);
            if (existingImageBase64) {
              sceneImages[sceneNum] = existingImageBase64;
              imageResults.push({
                scene_number: sceneNum,
                duration: normalizeDuration(scene.duration),
                success: true,
                skipped: true,
                gcs_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${imageFileName}`,
              });
              continue;  // 다음 씬으로
            }
            console.log(`   ⚠️ 기존 이미지 다운로드 실패 - 재생성`);
          }
        } else {
          console.log(`🔄 Scene ${sceneNum} 씬 필터로 선택됨 - 무조건 재생성`);
        }

        // ★★★ 배치로 추출한 영어 키워드 사용 ★★★
        const englishKeywords = allEnglishKeywords[String(sceneNum)] || [];
        const keywordOverlay = englishKeywords.length > 0
          ? `Include stylized English text overlay: "${englishKeywords.join(" | ")}" in modern sans-serif font, subtle glow effect. `
          : "";

        if (englishKeywords.length > 0) {
          console.log(`   🔤 씬${sceneNum} 영어 키워드: ${englishKeywords.join(", ")}`);
        }

        // ★★★ 프롬프트 생성 - 텍스트 완전 금지! ★★★
        let prompt = `[CRITICAL RULES - COMPLETELY TEXT-FREE IMAGE] `;
        prompt += `TEXT: ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WORDS in ANY language. `;
        prompt += `PEOPLE: NO people, NO humans, NO faces, NO hands, NO body parts - pure background ONLY. `;
        prompt += `OUTPUT: Clean visual background with abstract shapes, gradients, lights - ZERO text elements. `;

        // ★★★ Imagen 금지어 필터링 (정치/민감 주제) ★★★
        const sanitizeImagePrompt = (promptText) => {
          if (!promptText) return promptText;
          const replacements = {
            // 국기
            "U.S. flag": "Wall Street skyline",
            "American flag": "financial district cityscape",
            "Chinese flag": "Asian financial market visualization",
            "flag": "abstract geometric pattern",
            // 정치/무역
            "tariff": "global trade",
            "trade war": "international commerce",
            "sanctions": "economic policy",
            "government policy": "economic indicators",
            "political": "economic",
            // 중앙은행/금리
            "Federal Reserve building": "abstract banking concept",
            "Federal Reserve": "central banking visualization",
            "Fed building": "financial institution concept",
            "central bank building": "abstract finance architecture",
            "monetary policy": "interest rate visualization",
            "interest rate charts": "abstract financial graphs",
            // 위기
            "financial crisis": "market volatility",
            "economic crisis": "market downturn",
            "crisis": "market uncertainty",
            "crash": "market correction",
            "collapse": "market decline",
            // 전쟁
            "war": "global tension",
            "military": "defense sector",
            "conflict": "market uncertainty",
            "invasion": "geopolitical event",
          };

          let sanitized = promptText;
          for (const [forbidden, replacement] of Object.entries(replacements)) {
            sanitized = sanitized.replace(new RegExp(forbidden, "gi"), replacement);
          }
          return sanitized;
        };

        // 대본에 image_prompt가 있으면 사용, 없으면 기본 프롬프트
        let backgroundPrompt = "";

        if (scene.image_prompt && scene.image_prompt.trim()) {
          // 대본에서 생성된 image_prompt 사용 (금지어 필터링)
          backgroundPrompt = sanitizeImagePrompt(scene.image_prompt);
          if (backgroundPrompt !== scene.image_prompt) {
            console.log(`   ⚠️ 금지어 필터링됨`);
          }
          console.log(`   📝 대본 image_prompt 사용: ${backgroundPrompt.substring(0, 50)}...`);
        } else {
          // 기본 프롬프트 (씬 타입별)
          if (sceneType === "opening") {
            backgroundPrompt = `Abstract financial background, glowing blue and purple gradient, dynamic light streaks, futuristic stock market visualization, digital data flow`;
          } else if (sceneType === "key_point") {
            backgroundPrompt = `Professional news studio background, blurred stock charts, abstract financial graphs without numbers, blue and green gradient lighting, bokeh lights, cinematic atmosphere`;
          } else if (sceneType === "recommendation") {
            backgroundPrompt = `Upward trending abstract graph, golden and green glowing particles, success and growth visualization, dynamic lighting`;
          } else if (sceneType === "closing" || sceneType === "disclaimer") {
            backgroundPrompt = `Clean minimal gradient background, soft blue to purple transition, subtle lens flare, professional and calming atmosphere`;
          } else {
            backgroundPrompt = `${backgroundDesc} - abstract visualization, professional lighting`;
          }
          console.log(`   📝 기본 프롬프트 사용 (${sceneType})`);
        }

        prompt += `Generate ONLY: ${backgroundPrompt}. `;
        // 키워드 오버레이 제거 - 텍스트 완전 금지
        prompt += `In ${this.aspect_ratio} format for YouTube Shorts. `;
        prompt += `Style: Cinematic, high quality, 4K, professional color grading, depth of field. `;
        prompt += `[FINAL CHECK] 1) NO people/faces/hands/body 2) COMPLETELY TEXT-FREE - ZERO letters, ZERO characters, ZERO words in ANY language`;

        try {
          console.log(`🖼️ Scene ${sceneNum} 배경 이미지 생성 중... (사람 없음)`);
          console.log(`📝 프롬프트 길이: ${prompt.length}자`);

          // API 요청 데이터 구성 (사람 없이 배경만 생성)
          const requestData = {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: this.aspect_ratio,
              // personGeneration: "dont_allow" - API에서 현재 지원하지 않음
            },
          };

          let imagenResp;

          try {
            imagenResp = await axios($, {
              url: `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`,
              method: "POST",
              headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" },
              data: requestData,
            });
            console.log(`📋 Imagen 응답 키: ${Object.keys(imagenResp || {}).join(", ")}`);
          } catch (refError) {
            console.error(`❌ Imagen API 에러:`, refError.message);
            if (refError.response?.data) {
              console.error(`   응답 데이터:`, JSON.stringify(refError.response.data).substring(0, 1000));
            }
            throw refError;
          }

          // 응답 구조 상세 로깅
          console.log(`📋 Imagen 전체 응답:`, JSON.stringify(imagenResp).substring(0, 500));

          const imageBase64 = imagenResp.predictions?.[0]?.bytesBase64Encoded;
          if (!imageBase64) {
            // 콘텐츠 필터링 확인
            const filteredReason = imagenResp.predictions?.[0]?.raiFilteredReason ||
                                   imagenResp.promptFeedback?.blockReason ||
                                   imagenResp.filters?.[0]?.reason;
            if (filteredReason) {
              throw new Error(`Content filtered: ${filteredReason}`);
            }
            throw new Error(`No image generated. Response keys: ${Object.keys(imagenResp || {}).join(", ")}`);
          }

          sceneImages[sceneNum] = imageBase64;

          // GCS 업로드
          let imageUrl = null;
          try {
            const fileName = `${folderName}/scene_${String(sceneNum).padStart(2, "0")}.png`;
            const buffer = Buffer.from(imageBase64, "base64");
            await storage.objects.insert({
              bucket: this.gcs_bucket_name,
              name: fileName,
              media: { mimeType: "image/png", body: Readable.from(buffer) },
            });
            imageUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${fileName}`;
          } catch (gcsError) {
            console.warn(`⚠️ Scene ${sceneNum} GCS 업로드 실패: ${gcsError.message}`);
          }

          imageResults.push({
            scene_number: sceneNum,
            duration: normalizeDuration(scene.duration),
            image_url: imageUrl,
            success: true,
          });
          console.log(`✅ Scene ${sceneNum} 이미지 완료`);

        } catch (e) {
          console.error(`❌ Scene ${sceneNum} 이미지 실패:`, e.message);
          imageResults.push({ scene_number: sceneNum, success: false, error: e.message });
        }
      }

      console.log(`📊 이미지 생성 완료: ${imageResults.filter(r => r.success).length}/${targetScenes.length}`);
    } else {
      // 이미지 스킵 시 기존 GCS 이미지에서 다운로드
      console.log(`\n📥 === STEP 1: 기존 이미지 다운로드 (${targetScenes.length}개 씬) ===`);

      for (const scene of targetScenes) {
        const sceneNum = scene.scene_number;
        const imageUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/scene_${String(sceneNum).padStart(2, "0")}.png`;

        try {
          console.log(`📥 Scene ${sceneNum} 이미지 다운로드 중...`);
          const imgResp = await axios($, {
            url: imageUrl,
            method: "GET",
            responseType: "arraybuffer",
          });
          const imageBase64 = Buffer.from(imgResp).toString("base64");
          sceneImages[sceneNum] = imageBase64;

          imageResults.push({
            scene_number: sceneNum,
            duration: normalizeDuration(scene.duration),
            image_url: imageUrl,
            skipped: true,
            success: true,
          });
          console.log(`✅ Scene ${sceneNum} 이미지 다운로드 완료`);
        } catch (e) {
          console.error(`❌ Scene ${sceneNum} 이미지 다운로드 실패: ${e.message}`);
          imageResults.push({ scene_number: sceneNum, success: false, error: e.message });
        }
      }

      console.log(`📊 이미지 다운로드 완료: ${imageResults.filter(r => r.success).length}/${targetScenes.length}`);
    }

    // ==========================================
    // STEP 2: 비디오 생성 (Veo 3.0) - 최적화: 요청 먼저 → 병렬 폴링
    // ==========================================
    if (!this.skip_video_generation) {
      console.log(`\n🎬 === STEP 2: 비디오 생성 (${targetScenes.length}개 씬, 최적화 모드) ===`);
      console.log(`⚡ RPM=2 최적화: 요청 순차 → 폴링 병렬 처리`);

      const scenesWithImages = targetScenes.filter(s => sceneImages[s.scene_number]);
      console.log(`🎥 이미지가 있는 씬: ${scenesWithImages.length}개`);
      console.log(`⏱️ 예상 시간: ${Math.ceil(scenesWithImages.length * 30 / 60)}분 (요청) + 2-3분 (폴링)`);

      // ========================================
      // API 키 순환 설정 (Veo 쿼터: 키당 10개/일)
      // ========================================
      const veoApiKeys = [this.gemini_api_key];
      if (this.gemini_api_keys_extra?.trim()) {
        const extraKeys = this.gemini_api_keys_extra.split(",").map(k => k.trim()).filter(k => k);
        veoApiKeys.push(...extraKeys);
      }
      const quotaPerKey = this.veo_quota_per_key || 10;
      const totalQuota = veoApiKeys.length * quotaPerKey;

      console.log(`🔑 API 키: ${veoApiKeys.length}개 (키당 ${quotaPerKey}개, 총 ${totalQuota}개 가능)`);

      if (scenesWithImages.length > totalQuota) {
        console.warn(`⚠️ 씬 ${scenesWithImages.length}개 > 총 쿼터 ${totalQuota}개! 일부 씬이 생성되지 않을 수 있습니다.`);
      }

      // API 키 선택 함수
      const getApiKeyForIndex = (index) => {
        const keyIndex = Math.floor(index / quotaPerKey);
        if (keyIndex >= veoApiKeys.length) {
          console.warn(`⚠️ 씬 ${index + 1}: 쿼터 초과, 마지막 키 재사용 (실패 가능성 있음)`);
          return veoApiKeys[veoApiKeys.length - 1];
        }
        return veoApiKeys[keyIndex];
      };

      // ========================================
      // Phase 1: 모든 씬에 대해 요청 먼저 보내기 (RPM 고려)
      // ========================================
      console.log(`\n📤 Phase 1: 모든 요청 전송 시작...`);
      const pendingOperations = []; // { sceneNum, operationName, duration, apiKey }

      // ★★★ 스킵된 씬 목록 (GCS에 이미 존재) ★★★
      const skippedVideoScenes = [];

      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const sceneNum = scene.scene_number;
        const duration = normalizeDuration(scene.duration);
        const narration = scene.narration || "";

        // ★★★ GCS에 이미 존재하는 비디오 스킵 (씬 필터 있으면 무조건 재생성) ★★★
        const videoFileName = `${folderName}/scene_${String(sceneNum).padStart(2, "0")}.mp4`;
        
        if (!hasSceneFilter) {  // ★ 씬 필터 없을 때만 GCS 체크
          const videoExists = await checkGcsFileExists(this.gcs_video_bucket_name, videoFileName);
          
          if (videoExists) {
            console.log(`⏭️ Scene ${sceneNum} 비디오 이미 존재 - 스킵`);
            skippedVideoScenes.push({
              scene_number: sceneNum,
              duration: duration,
              video_url: `https://storage.googleapis.com/${this.gcs_video_bucket_name}/${videoFileName}`,
              success: true,
              skipped: true,
            });
            continue;  // 다음 씬으로
          }
        } else {
          console.log(`🔄 Scene ${sceneNum} 비디오 씬 필터로 선택됨 - 무조건 재생성`);
        }

        const imageBase64 = sceneImages[sceneNum];
        if (!imageBase64) {
          console.warn(`⚠️ Scene ${sceneNum} 이미지 없음, 스킵`);
          continue;
        }

        // ========================================
        // 금기어 필터링 (Veo 정책 우회)
        // ========================================
        const forbiddenWords = {
          // 정치/인물 관련
          "트럼프": "미국 대통령",
          "Trump": "US President",
          "trump": "US President",
          "바이든": "미국 대통령",
          "Biden": "US President",
          "biden": "US President",
          "시진핑": "중국 주석",
          "푸틴": "러시아 대통령",
          "김정은": "북한 지도자",
          // 금융기관 (대문자 주의)
          "FED": "미국 중앙은행",
          "Fed": "미국 중앙은행",
          "연준": "미국 중앙은행",
          "연방준비제도": "미국 중앙은행",
          "Federal Reserve": "US Central Bank",
          // 민감한 주제
          "전쟁": "분쟁",
          "폭락": "급락",
          "폭등": "급등",
          "붕괴": "하락",
          "공황": "불안",
          // 투자 추천 표현 완화
          "좋아 보여요": "주목해볼 만해요",
          "추천드려요": "살펴보세요",
          "사세요": "관심 가져보세요",
          "매수": "관심",
          "매도": "정리",
        };

        // 나레이션에서 금기어 치환
        let sanitizedNarration = narration;
        for (const [forbidden, replacement] of Object.entries(forbiddenWords)) {
          sanitizedNarration = sanitizedNarration.replace(new RegExp(forbidden, "gi"), replacement);
        }

        if (sanitizedNarration !== narration) {
          console.log(`⚠️ Scene ${sceneNum} 금기어 치환됨`);
          console.log(`   원본: ${narration.substring(0, 50)}...`);
          console.log(`   치환: ${sanitizedNarration.substring(0, 50)}...`);
        }

        // ========================================
        // 동적 배경 & 텍스트 오버레이 생성 (대본 내용 기반)
        // ========================================
        // 회사/브랜드 키워드 매핑 (금기어 제외)
        const companyKeywords = {
          "테슬라": { bg: "Tesla logo, electric vehicles, Cybertruck silhouette", keyword: "TESLA", color: "#E31937" },
          "tesla": { bg: "Tesla logo, electric vehicles, Cybertruck silhouette", keyword: "TESLA", color: "#E31937" },
          "애플": { bg: "Apple logo, iPhone, MacBook products", keyword: "APPLE", color: "#A2AAAD" },
          "apple": { bg: "Apple logo, iPhone, MacBook products", keyword: "APPLE", color: "#A2AAAD" },
          "엔비디아": { bg: "NVIDIA logo, GPU chips, green tech glow", keyword: "NVIDIA", color: "#76B900" },
          "nvidia": { bg: "NVIDIA logo, GPU chips, green tech glow", keyword: "NVIDIA", color: "#76B900" },
          "아마존": { bg: "Amazon logo, e-commerce packages, AWS cloud", keyword: "AMAZON", color: "#FF9900" },
          "amazon": { bg: "Amazon logo, e-commerce packages, AWS cloud", keyword: "AMAZON", color: "#FF9900" },
          "구글": { bg: "Google logo, search interface, cloud icons", keyword: "GOOGLE", color: "#4285F4" },
          "google": { bg: "Google logo, search interface, cloud icons", keyword: "GOOGLE", color: "#4285F4" },
          "마이크로소프트": { bg: "Microsoft logo, Windows, Azure cloud", keyword: "MICROSOFT", color: "#00A4EF" },
          "microsoft": { bg: "Microsoft logo, Windows, Azure cloud", keyword: "MICROSOFT", color: "#00A4EF" },
          "메타": { bg: "Meta logo, VR headset, social media", keyword: "META", color: "#0668E1" },
          "meta": { bg: "Meta logo, VR headset, social media", keyword: "META", color: "#0668E1" },
          "삼성": { bg: "Samsung logo, semiconductors, displays", keyword: "SAMSUNG", color: "#1428A0" },
          "반도체": { bg: "semiconductor chips, circuit boards, fab equipment", keyword: "SEMICONDUCTORS", color: "#00D4FF" },
          "ai": { bg: "AI neural networks, digital brain, data streams", keyword: "AI BOOM", color: "#9D4EDD" },
          "인공지능": { bg: "AI neural networks, digital brain, data streams", keyword: "AI BOOM", color: "#9D4EDD" },
          "로봇": { bg: "robotic arms, humanoid robots, automation", keyword: "ROBOTICS", color: "#00D4FF" },
          "자율주행": { bg: "self-driving car sensors, autonomous vehicles", keyword: "AUTONOMOUS", color: "#00D4FF" },
          "금리": { bg: "interest rate charts, dollar bills, banking", keyword: "INTEREST RATES", color: "#FFD700" },
          "중앙은행": { bg: "central bank building, monetary policy charts", keyword: "CENTRAL BANK", color: "#FFD700" },
          "고용": { bg: "employment charts, workforce statistics", keyword: "JOBS REPORT", color: "#4CAF50" },
          "인플레이션": { bg: "inflation graphs, CPI charts, price indexes", keyword: "INFLATION", color: "#FF6B6B" },
          "유가": { bg: "oil barrels, crude oil rigs, energy charts", keyword: "OIL PRICES", color: "#8B4513" },
          "전기차": { bg: "electric vehicles, EV charging, batteries", keyword: "EV SECTOR", color: "#4CAF50" },
          "조선": { bg: "shipyard, large vessels, maritime industry", keyword: "SHIPBUILDING", color: "#1E90FF" },
          "방산": { bg: "defense equipment, aerospace, military tech", keyword: "DEFENSE", color: "#2F4F4F" },
          "급등": { bg: "stock chart going up, green arrows, bull market", keyword: "SURGE", color: "#4CAF50" },
          "급락": { bg: "stock chart going down, red arrows, bear market", keyword: "PLUNGE", color: "#FF6B6B" },
        };

        // 키워드 매칭
        let matchedKeyword = null;
        const narrationLower = narration.toLowerCase();
        for (const [keyword, data] of Object.entries(companyKeywords)) {
          if (narrationLower.includes(keyword) || narration.includes(keyword)) {
            matchedKeyword = data;
            break;
          }
        }

        // 기본값
        if (!matchedKeyword) {
          matchedKeyword = {
            bg: "stock market tickers, financial data displays, global markets",
            keyword: "MARKET UPDATE",
            color: "#FFD700"
          };
        }

        // 배경 애니메이션 카메라 설정
        const sceneType = scene.part || "key_point";
        const cameraMove = sceneType === "opening" ? "Slow zoom out from center"
          : sceneType === "closing" ? "Gentle zoom in"
          : "Subtle pan or static with parallax";

        // 배경 전용 Veo 프롬프트 생성 (JSON 형태 - narrator_voice 포함)
        const resolution = this.aspect_ratio === "16:9" ? "1920x1080px"
          : this.aspect_ratio === "9:16" ? "1080x1920px"
          : "1080x1080px";

        // 말하기 속도 및 voice_style 설정
        const genderText = presenterGender === "male" ? "male" : "female";
        const speakingRateMap = {
          "slow": "0.9",
          "normal": "1.0",
          "slightly_fast": "1.1",
          "fast": "1.2"
        };
        const speakingRate = speakingRateMap[this.speaking_speed] || "1.1";
        const voiceStyle = this.speaking_speed === "slow"
          ? `Adult Korean ${genderText} voice, warm professional tone, speak slowly and clearly, rate ${speakingRate}x`
          : this.speaking_speed === "fast"
          ? `Adult Korean ${genderText} voice, confident news anchor tone, brisk pace, rate ${speakingRate}x`
          : `Adult Korean ${genderText} voice, warm friendly tone, slightly fast pace, rate ${speakingRate}x`;

        // ★★★ 나레이션을 완전한 한글로 변환 (TTS용) ★★★
        // S&P 500 → 에스앤피 오백, +0.10% → 영점일퍼, CPI → 씨피아이 등
        const koreanNarration = this.convertToKoreanNarration(sanitizedNarration);

        // JSON 형태 프롬프트 구성
        const veoPromptObj = {
          scene_id: `STOCK_S${sceneNum}`,
          duration: `0-${duration}s`,
          // ★★★ 화면과 오디오 언어 분리 ★★★
          visual_language: "NO TEXT ON SCREEN - completely text-free background animation",
          audio_language: "KOREAN ONLY - narrator speaks in Korean",
          description: `Single frame shot, ${matchedKeyword.bg}, professional financial news background animation, subtle motion effects, NO PEOPLE, COMPLETELY TEXT-FREE SCREEN`,
          camera: cameraMove,
          text_overlay: "NONE - completely text-free",
          animation: `Subtle particle effects, light rays, floating bokeh lights, gentle gradient color shifts, smooth transitions, professional motion graphics style`,
          audio: this.disable_veo_audio ? {
            bgm: "None",
            sfx: "None",
            narrator_voice: null,
            character_voice: "None"
          } : {
            bgm: "Soft background music",
            sfx: "None",
            narrator_voice: {
              text: koreanNarration,
              language: "ko-KR",
              voice_gender: presenterGender === "male" ? "MALE" : "FEMALE"
            },
            character_voice: "None"
          },
          audio_timeline: this.disable_veo_audio ? {
            [`0.0s - ${duration}s`]: "Silent background animation"
          } : {
            "0.0s - 0.5s": "Scene fade in",
            [`0.5s - ${duration - 0.5}s`]: `[KOREAN AUDIO] ${koreanNarration}`,
            [`${duration - 0.5}s - ${duration}s`]: "Scene transition"
          },
          consistency: "Maintain exact appearance from reference image, no blur edges, full frame must match throughout, NO PEOPLE, NO FACES, NO HANDS",
          technical: `${resolution}, 30fps, ${this.aspect_ratio}, professional broadcast quality`,
          rules: [
            "VISUAL: No text on screen, text-free background only",
            "AUDIO: Korean narrator reads the provided Korean text",
            "No people, no faces, no hands in video"
          ]
        };

        const veoPrompt = JSON.stringify(veoPromptObj, null, 2);

        console.log(`🎬 Scene ${sceneNum} 배경: ${matchedKeyword.keyword}`);
        if (!this.disable_veo_audio && koreanNarration) {
          console.log(`🎙️ Scene ${sceneNum} 나레이션(한글): ${koreanNarration.substring(0, 80)}${koreanNarration.length > 80 ? "..." : ""}`);
        }

        // ★★★ 429 에러 시 자동 키 전환 로직 ★★★
        // 현재 키 인덱스 계산 (0부터 시작)
        let currentKeyIndex = Math.floor(i / quotaPerKey);
        if (currentKeyIndex >= veoApiKeys.length) currentKeyIndex = veoApiKeys.length - 1;
        
        let currentApiKey = veoApiKeys[currentKeyIndex];
        let attemptedKeys = new Set(); // 시도한 키 추적
        attemptedKeys.add(currentKeyIndex);
        
        console.log(`\n🎬 [${i + 1}/${scenesWithImages.length}] Scene ${sceneNum} 요청 중... (키 #${currentKeyIndex + 1}/${veoApiKeys.length})`);

        while (attemptedKeys.size <= veoApiKeys.length) {
          try {
            const veoResp = await axios($, {
              url: `https://generativelanguage.googleapis.com/v1beta/models/${this.veo_model}:predictLongRunning`,
              method: "POST",
              headers: { "x-goog-api-key": currentApiKey, "Content-Type": "application/json" },
              data: {
                instances: [{
                  prompt: veoPrompt,
                  image: { bytesBase64Encoded: imageBase64, mimeType: "image/png" },
                }],
                parameters: {
                  aspectRatio: this.aspect_ratio,
                  durationSeconds: duration,
                },
              },
            });

            const operationName = veoResp.name;
            if (operationName) {
              pendingOperations.push({ sceneNum, operationName, duration, apiKey: currentApiKey });
              console.log(`✅ Scene ${sceneNum} 요청 완료: ${operationName.split('/').pop()}`);
            } else {
              console.error(`❌ Scene ${sceneNum} operation name 없음`);
              videoResults.push({ scene_number: sceneNum, success: false, error: "No operation name" });
            }
            break; // 성공 시 루프 탈출
            
          } catch (e) {
            const status = e.response?.status || e.status;
            const errorMsg = e.response?.data?.error?.message || e.message;
            
            // 429 (Quota Exceeded) 또는 503 (Service Unavailable) 또는 RESOURCE_EXHAUSTED 시 다른 키로 재시도
            const isQuotaError = status === 429 || status === 503 || 
                                 errorMsg?.includes("quota") || 
                                 errorMsg?.includes("RESOURCE_EXHAUSTED") ||
                                 errorMsg?.includes("exhausted");
            
            if (isQuotaError && attemptedKeys.size < veoApiKeys.length) {
              // 아직 시도하지 않은 다음 키 찾기
              let nextKeyIndex = (currentKeyIndex + 1) % veoApiKeys.length;
              while (attemptedKeys.has(nextKeyIndex) && attemptedKeys.size < veoApiKeys.length) {
                nextKeyIndex = (nextKeyIndex + 1) % veoApiKeys.length;
              }
              
              attemptedKeys.add(nextKeyIndex);
              currentKeyIndex = nextKeyIndex;
              currentApiKey = veoApiKeys[currentKeyIndex];
              
              console.warn(`⚠️ Scene ${sceneNum} 쿼터 초과 (${status || 'quota'}) - 키 #${currentKeyIndex + 1}로 전환 (${attemptedKeys.size}/${veoApiKeys.length} 키 시도)`);
              await new Promise(r => setTimeout(r, 3000)); // 3초 대기 후 재시도
              continue;
            }
            
            // 다른 오류 또는 모든 키 소진
            console.error(`❌ Scene ${sceneNum} 요청 실패 (${attemptedKeys.size}개 키 시도):`, errorMsg);
            videoResults.push({ scene_number: sceneNum, success: false, error: errorMsg });
            break;
          }
        }

        // RPM 제한 대기 (마지막 요청 제외)
        if (i < scenesWithImages.length - 1) {
          console.log(`⏳ RPM 대기: 30초...`);
          await new Promise(r => setTimeout(r, VEO_DELAY_MS));
        }
      }

      console.log(`\n📊 Phase 1 완료: ${pendingOperations.length}개 요청 전송됨`);

      // ========================================
      // Phase 2: 모든 작업 병렬 폴링
      // ========================================
      if (pendingOperations.length > 0) {
        console.log(`\n🔄 Phase 2: 병렬 폴링 시작 (${pendingOperations.length}개)...`);

        // 단일 작업 폴링 함수
        const pollOperation = async (op) => {
          const { sceneNum, operationName, duration, apiKey } = op;
          let videoData = null;
          let errorMsg = null;
          let contentFiltered = false; // 콘텐츠 필터링 여부

          for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));

            try {
              const pollResp = await axios($, {
                url: `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
                method: "GET",
                headers: { "x-goog-api-key": apiKey },
              });

              if (pollResp.error) {
                errorMsg = JSON.stringify(pollResp.error);
                break;
              }

              if (pollResp.done) {
                // 콘텐츠 필터링 확인
                const raiFilteredCount = pollResp.response?.generateVideoResponse?.raiMediaFilteredCount ||
                                        pollResp.response?.raiMediaFilteredCount || 0;
                if (raiFilteredCount > 0) {
                  errorMsg = `Content filtered by safety policy (${raiFilteredCount})`;
                  contentFiltered = true; // 재시도 대상
                  break;
                }

                // 비디오 URI 추출
                const generateVideoResponse = pollResp.response?.generateVideoResponse;
                const videoUri = generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
                                pollResp.response?.videos?.[0]?.uri ||
                                pollResp.response?.video?.uri ||
                                pollResp.result?.video?.uri;

                if (videoUri) {
                  console.log(`✅ Scene ${sceneNum} 생성 완료, 다운로드 중...`);
                  const videoDownload = await axios($, {
                    url: videoUri,
                    method: "GET",
                    headers: { "x-goog-api-key": apiKey },
                    responseType: "arraybuffer",
                  });
                  videoData = Buffer.from(videoDownload).toString("base64");
                  console.log(`✅ Scene ${sceneNum} 다운로드 완료 (${Math.round(videoData.length / 1024)}KB)`);
                } else {
                  errorMsg = "No video URI in response";
                }
                break;
              }

              // 진행 로그 (10회마다)
              if (attempt % 10 === 0) {
                console.log(`⏳ Scene ${sceneNum} 대기 중... (${attempt}/${MAX_POLL_ATTEMPTS})`);
              }
            } catch (pollError) {
              errorMsg = pollError.message;
            }
          }

          if (!videoData && !errorMsg) {
            errorMsg = "Timeout - max poll attempts reached";
          }

          return { sceneNum, duration, videoData, errorMsg, contentFiltered, apiKey };
        };

        // 모든 작업 병렬 폴링
        let pollResults = await Promise.all(pendingOperations.map(op => pollOperation(op)));

        // ========================================
        // Phase 2.5: 콘텐츠 필터링 재시도 (1회)
        // ========================================
        const filteredResults = pollResults.filter(r => r.contentFiltered);
        if (filteredResults.length > 0) {
          console.log(`\n🔄 Phase 2.5: 콘텐츠 필터링 재시도 (${filteredResults.length}개)...`);

          for (const filtered of filteredResults) {
            const { sceneNum, apiKey } = filtered;
            const originalOp = pendingOperations.find(op => op.sceneNum === sceneNum);
            if (!originalOp) continue;

            // 원본 씬 데이터 찾기
            const scene = scenesWithImages.find(s => s.scene_number === sceneNum);
            if (!scene) continue;

            const imageBase64 = sceneImages[sceneNum];
            if (!imageBase64) continue;

            console.log(`🔄 Scene ${sceneNum} 재시도 중...`);

            // RPM 대기
            await new Promise(r => setTimeout(r, VEO_DELAY_MS));

            try {
              // 간소화된 배경 애니메이션 프롬프트로 재시도
              const retryPrompt = `Animate background with subtle motion. Gentle particle effects, light rays, bokeh lights. Professional motion graphics. NO people, NO humans, NO faces.`;

              const retryResp = await axios($, {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${this.veo_model}:predictLongRunning`,
                method: "POST",
                headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
                data: {
                  instances: [{
                    prompt: retryPrompt,
                    image: { bytesBase64Encoded: imageBase64, mimeType: "image/png" },
                  }],
                  parameters: {
                    aspectRatio: this.aspect_ratio,
                    durationSeconds: originalOp.duration,
                    // personGeneration: "dont_allow" - API에서 현재 지원하지 않음
                  },
                },
              });

              const retryOpName = retryResp.name;
              if (retryOpName) {
                console.log(`✅ Scene ${sceneNum} 재시도 요청 완료`);

                // 재시도 폴링
                const retryResult = await pollOperation({
                  sceneNum,
                  operationName: retryOpName,
                  duration: originalOp.duration,
                  apiKey,
                });

                // 결과 업데이트
                const idx = pollResults.findIndex(r => r.sceneNum === sceneNum);
                if (idx !== -1) {
                  if (retryResult.videoData) {
                    console.log(`✅ Scene ${sceneNum} 재시도 성공!`);
                    pollResults[idx] = retryResult;
                  } else {
                    console.log(`❌ Scene ${sceneNum} 재시도도 실패: ${retryResult.errorMsg}`);
                  }
                }
              }
            } catch (retryError) {
              console.error(`❌ Scene ${sceneNum} 재시도 요청 실패: ${retryError.message}`);
            }
          }
        }

        // ========================================
        // Phase 3: 결과 처리 및 GCS 업로드
        // ========================================
        console.log(`\n📤 Phase 3: GCS 업로드...`);

        for (const result of pollResults) {
          const { sceneNum, duration, videoData, errorMsg } = result;

          if (videoData) {
            let videoUrl = null;
            try {
              const videoFileName = `${folderName}/scene_${String(sceneNum).padStart(2, "0")}.mp4`;
              const videoBuffer = Buffer.from(videoData, "base64");
              await storage.objects.insert({
                bucket: this.gcs_video_bucket_name,
                name: videoFileName,
                media: { mimeType: "video/mp4", body: Readable.from(videoBuffer) },
              });
              videoUrl = `https://storage.googleapis.com/${this.gcs_video_bucket_name}/${videoFileName}`;
              console.log(`✅ Scene ${sceneNum} 업로드 완료`);
            } catch (gcsError) {
              console.warn(`⚠️ Scene ${sceneNum} 업로드 실패: ${gcsError.message}`);
            }

            videoResults.push({ scene_number: sceneNum, duration, video_url: videoUrl, success: true });
          } else {
            console.error(`❌ Scene ${sceneNum} 실패: ${errorMsg}`);
            videoResults.push({ scene_number: sceneNum, success: false, error: errorMsg });
          }
        }

        // ★★★ 스킵된 비디오 씬들을 결과에 추가 ★★★
        if (skippedVideoScenes.length > 0) {
          console.log(`\n📋 GCS 기존 비디오 사용: ${skippedVideoScenes.length}개 씬`);
          videoResults.push(...skippedVideoScenes);
        }
      }
    } else {
      console.log(`⏭️ 비디오 생성 스킵됨`);
    }

    // ==========================================
    // 결과 반환
    // ==========================================
    const imgSuccess = imageResults.filter(r => r.success).length;
    const imgSkipped = imageResults.filter(r => r.skipped).length;
    const imgGenerated = imgSuccess - imgSkipped;
    const vidSuccess = videoResults.filter(r => r.success).length;
    const vidSkipped = videoResults.filter(r => r.skipped).length;
    const vidGenerated = vidSuccess - vidSkipped;

    console.log(`\n📊 === 최종 결과 ===`);
    console.log(`이미지: ${imgSuccess}/${targetScenes.length} (새로 생성: ${imgGenerated}, 기존 사용: ${imgSkipped})`);
    console.log(`비디오: ${vidSuccess}/${targetScenes.length} (새로 생성: ${vidGenerated}, 기존 사용: ${vidSkipped})`);

    const result = {
      folder_name: folderName,
      analysis_date: analysisDate,
      market_label: marketLabel,
      shorts_script: shortsScript,
      images: {
        total: imgSuccess,
        generated: imgGenerated,
        skipped: imgSkipped,
        failed: imageResults.filter(r => !r.success).length,
        results: imageResults,
      },
      videos: {
        total: vidSuccess,
        generated: vidGenerated,
        skipped: vidSkipped,
        failed: videoResults.filter(r => !r.success).length,
        results: videoResults,
      },
      generated_at: new Date().toISOString(),
    };

    $.export("video_generation", result);
    $.export("$summary", `이미지: ${imgSuccess}개 (신규${imgGenerated}/기존${imgSkipped}), 비디오: ${vidSuccess}개 (신규${vidGenerated}/기존${vidSkipped})`);
    return result;
  },
});
