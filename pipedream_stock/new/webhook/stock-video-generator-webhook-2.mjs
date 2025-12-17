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
        { label: "느림 (정확한 발음)", value: "slow" },
        { label: "보통", value: "normal" },
        { label: "빠름 (뉴스 스타일)", value: "fast" },
      ],
      default: "slow",
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
    // 한국어 → 로마자 발음 변환 (Revised Romanization)
    generatePronunciationGuide(text) {
      // 초성, 중성, 종성 매핑
      const cho = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
      const jung = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
      const jong = ["", "k", "kk", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"];

      let result = "";
      for (const char of text) {
        const code = char.charCodeAt(0);
        // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
        if (code >= 0xAC00 && code <= 0xD7A3) {
          const syllable = code - 0xAC00;
          const choIdx = Math.floor(syllable / 588);
          const jungIdx = Math.floor((syllable % 588) / 28);
          const jongIdx = syllable % 28;
          result += cho[choIdx] + jung[jungIdx] + jong[jongIdx];
        } else if (char === " " || char === "," || char === "!" || char === "?") {
          result += char;
        } else {
          result += char; // 영어, 숫자 등은 그대로
        }
      }
      return result;
    },
  },

  async run({ $ }) {
    // 데이터 파싱 (웹훅 데이터)
    let data;
    try {
      data = typeof this.webhook_data === "string"
        ? JSON.parse(this.webhook_data) : this.webhook_data;
    } catch (e) {
      throw new Error("Webhook 데이터 파싱 실패: " + e.message);
    }

    const shortsScript = data.shorts_script || data;
    const scenes = shortsScript.scenes || [];
    const analysisDate = data.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabel = data.market_label || "글로벌";

    if (!scenes.length) throw new Error("씬이 없습니다.");

    // GCS 설정
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

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
    if (this.scene_filter && !isTestMode) {
      const filter = parseFilter(this.scene_filter);
      targetScenes = scenes.filter(s => filter.has(s.scene_number));
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
    // 캐릭터 설정 (presenter 정보 기반)
    // ==========================================
    const presenter = shortsScript.presenter || {};
    const presenterGender = presenter.gender || "male";
    const presenterAge = presenter.age || "late_20s";

    // 민감한 단어 필터링 (안전 정책 우회)
    const sanitizeAppearance = (text) => {
      if (!text) return "";
      return text
        .replace(/beautiful/gi, "professional")
        .replace(/handsome/gi, "professional")
        .replace(/sexy/gi, "elegant")
        .replace(/hot/gi, "confident")
        .replace(/gorgeous/gi, "professional")
        .replace(/stunning/gi, "professional")
        .replace(/attractive/gi, "professional")
        .replace(/red lipstick/gi, "natural makeup")
        .replace(/feminine appearance/gi, "professional appearance")
        .replace(/masculine appearance/gi, "professional appearance");
    };

    const presenterAppearance = sanitizeAppearance(presenter.appearance) || "";

    const genderDescriptions = {
      male: {
        keywords: "MAN, MALE ONLY, professional young man, clean features",
        appearance: presenterAppearance || "male presenter, clean-shaven, short black hair, navy suit with white shirt",
        critical: "CRITICAL: MALE MAN only, NOT female, no woman, centered single subject",
      },
      female: {
        keywords: "WOMAN, FEMALE ONLY, professional young woman, soft features",
        appearance: presenterAppearance || "female presenter, long straight black hair, elegant beige dress, pearl earrings, NATURAL MAKEUP with NUDE/PINK lip color (NOT red), professional appearance",
        critical: "CRITICAL: FEMALE WOMAN only, NOT male, no man, centered single subject. LIPS MUST BE natural nude or soft pink color, absolutely NO red lipstick",
      },
    };

    const genderDesc = genderDescriptions[presenterGender] || genderDescriptions.female;
    const characterDescription = `
      ${genderDesc.keywords}.
      Single person portrait, centered composition, ONE person only.
      Professional ${presenterGender === "male" ? "male" : "female"} presenter in ${presenterAge.replace("_", " ")},
      ${genderDesc.appearance}.
      Upper body shot, looking at camera, professional studio lighting.
      ${genderDesc.critical}.
    `.trim();

    console.log(`👤 Presenter: ${presenter.name || "Unknown"} (${presenterGender}, ${presenterAge})`);
    console.log(`📂 폴더: ${folderName}`);
    console.log(`🎥 Veo 모델: ${this.veo_model}`);

    // 감정/배경 매핑
    const emotionMap = {
      friendly: "warm friendly smile, welcoming expression",
      serious: "serious focused expression, professional demeanor",
      curious: "curious interested expression, slight head tilt",
      confident: "confident assured expression, strong posture",
      excited: "excited enthusiastic expression, bright eyes",
      cautious: "cautious warning expression, raised eyebrow",
      neutral: "calm neutral expression",
    };

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
    // STEP 1: 모든 씬 이미지 생성 (Imagen - 캐릭터 일관성 유지)
    // ==========================================
    const sceneImages = {}; // { scene_number: base64 }
    let referenceImageBase64 = null; // 첫 번째 씬 이미지 (reference용)

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
      console.log(`\n🖼️ === STEP 1: 이미지 생성 (${targetScenes.length}개 씬, 캐릭터 일관성 유지) ===`);

      for (let i = 0; i < targetScenes.length; i++) {
        const scene = targetScenes[i];
        const sceneNum = scene.scene_number;
        const visual = scene.visual_description || "";
        const background = scene.background || "modern studio";
        const emotion = scene.emotion || "neutral";
        const isFirstScene = i === 0;

        const emotionDesc = emotionMap[emotion] || emotion;
        const backgroundDesc = backgroundMap[background] || background;

        // 프롬프트 생성 - 텍스트 금지를 최우선으로 강조
        let prompt = `[CRITICAL - TEXT-FREE IMAGE ONLY] `;
        prompt += `ABSOLUTE PROHIBITION: NO Korean text (한글/Hangul), NO English text, NO Chinese characters, NO Japanese text, NO numbers, NO symbols, NO letters of ANY language. `;
        prompt += `FORBIDDEN ELEMENTS: monitors, screens, displays, signs, banners, watermarks, logos, tickers, captions, subtitles, name tags, labels, buttons, UI elements. `;
        prompt += `The background MUST be completely clean - either solid color gradient OR heavily blurred bokeh with ZERO readable elements. `;
        prompt += `Generate ONLY: person + clean background. Nothing else. `;

        if (!isFirstScene && referenceImageBase64) {
          // 씬2부터: reference 이미지의 동일 인물 강조
          prompt += `SAME EXACT PERSON as the reference image. Maintain identical face, hair, clothing, and appearance. `;
        }

        prompt += `${characterDescription} `;
        prompt += `In ${this.aspect_ratio} vertical format. `;
        prompt += `Expression: ${emotionDesc}. Action: ${visual}. `;
        prompt += `Background: ${backgroundDesc} - must be PURE solid color or heavily blurred with NO visible text or objects. `;
        prompt += `High quality, professional studio lighting, 4K quality, shallow depth of field, bokeh background. `;
        prompt += `MAKEUP: Natural makeup only, NO red lipstick, NO bold lipstick colors, subtle neutral tones only. `;
        prompt += `FINAL CHECK: If ANY text, letters, Korean characters, Hangul, numbers, words, or readable content appears ANYWHERE in the image, the generation has FAILED.`;

        try {
          console.log(`🖼️ Scene ${sceneNum} 이미지 생성 중... ${isFirstScene ? "(기준 이미지)" : "(reference 사용)"}`);
          console.log(`📝 프롬프트 길이: ${prompt.length}자`);

          // API 요청 데이터 구성 (personGeneration 필수 - 인물 생성 허용)
          let requestData;

          if (!isFirstScene && referenceImageBase64) {
            // 씬2부터: reference 이미지 사용 시도
            requestData = {
              instances: [{
                prompt,
                referenceImages: [{
                  referenceId: 1,
                  referenceType: "REFERENCE_TYPE_SUBJECT",
                  referenceImage: {
                    bytesBase64Encoded: referenceImageBase64,
                  },
                }],
              }],
              parameters: {
                sampleCount: 1,
                aspectRatio: this.aspect_ratio,
                personGeneration: "allow_adult",
              },
            };
          } else {
            // 첫 씬: reference 없이 생성
            requestData = {
              instances: [{ prompt }],
              parameters: {
                sampleCount: 1,
                aspectRatio: this.aspect_ratio,
                personGeneration: "allow_adult",
              },
            };
          }

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
            // reference 이미지 실패 시 기본 방식으로 재시도
            if (!isFirstScene && referenceImageBase64) {
              console.warn(`⚠️ Reference 방식 실패, 기본 방식으로 재시도...`);
              imagenResp = await axios($, {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`,
                method: "POST",
                headers: { "x-goog-api-key": this.gemini_api_key, "Content-Type": "application/json" },
                data: {
                  instances: [{ prompt }],
                  parameters: {
                    sampleCount: 1,
                    aspectRatio: this.aspect_ratio,
                    personGeneration: "allow_adult",
                  },
                },
              });
            } else {
              throw refError;
            }
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

          // 첫 번째 씬 이미지를 reference로 저장
          if (isFirstScene) {
            referenceImageBase64 = imageBase64;
            console.log(`📌 Scene ${sceneNum} 이미지를 reference로 저장`);
          }

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
            is_reference: isFirstScene,
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

      for (let i = 0; i < scenesWithImages.length; i++) {
        const scene = scenesWithImages[i];
        const sceneNum = scene.scene_number;
        const duration = normalizeDuration(scene.duration);
        const visual = scene.visual_description || "";
        const narration = scene.narration || "";
        const emotion = scene.emotion || "neutral";
        const background = scene.background || "modern studio";

        const imageBase64 = sceneImages[sceneNum];
        if (!imageBase64) {
          console.warn(`⚠️ Scene ${sceneNum} 이미지 없음, 스킵`);
          continue;
        }

        const emotionDesc = emotionMap[emotion] || emotion;
        const backgroundDesc = backgroundMap[background] || background;

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

        // 감정에 따른 카메라/애니메이션 설정
        const emotionToCamera = {
          friendly: "Static shot with gentle zoom-in",
          serious: "Static shot, steady and professional",
          curious: "Slight dolly movement, engaging",
          confident: "Static shot with subtle zoom-in settling",
          excited: "Dynamic slight movement, energetic",
          cautious: "Static shot, measured and careful",
          neutral: "Clean static shot",
        };
        const cameraMove = emotionToCamera[emotion] || "Static shot";

        // 프로페셔널 Veo 프롬프트 생성 (Google Flow 스타일)
        let veoPrompt = `Scene ${sceneNum} (${duration}s): ${scene.part || "content"}

VISUAL: Keep the EXACT same person from the input image. Professional news presenter in modern broadcast studio. Clean background with ${matchedKeyword.bg} displayed on screens behind. ${emotionDesc}.

CAMERA: ${cameraMove} in first 1 second.

TEXT OVERLAYS (English only, 2 elements):
1. "${matchedKeyword.keyword}" (0.5s) - top right corner, ${matchedKeyword.color}, bold 48px
2. Scene indicator subtle watermark bottom left

ANIMATION:
- Keyword text fade-in with slight glow effect
- Background screens with subtle motion graphics
- All transitions smooth 0.3s

AUDIO:`;

        if (this.disable_veo_audio) {
          veoPrompt += `
- Silent video, no speech audio
- Natural lip movements and professional gestures`;
        } else {
          veoPrompt += `
- Narration (KR): "${sanitizedNarration}"
- Voice: Professional Korean ${presenterGender === "male" ? "male" : "female"} voice, -14 LUFS
- Natural speech with appropriate pauses`;
        }

        veoPrompt += `

TECHNICAL SPECS:
- Resolution: ${this.aspect_ratio === "16:9" ? "1920x1080px" : this.aspect_ratio === "9:16" ? "1080x1920px" : "1080x1080px"} (${this.aspect_ratio})
- Frame rate: 30fps
- Duration: ${duration} seconds
- Expression: ${emotionDesc}

IMPORTANT: English text only. NO Korean text (한글), NO garbled/broken characters on screen.`;

        console.log(`🎬 Scene ${sceneNum} 배경: ${matchedKeyword.keyword}`);

        // API 키 순환 선택
        const currentApiKey = getApiKeyForIndex(i);
        const keyIndex = Math.floor(i / quotaPerKey) + 1;
        console.log(`\n🎬 [${i + 1}/${scenesWithImages.length}] Scene ${sceneNum} 요청 중... (키 #${keyIndex})`);

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
                personGeneration: "allow_adult",
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
        } catch (e) {
          console.error(`❌ Scene ${sceneNum} 요청 실패:`, e.message);
          videoResults.push({ scene_number: sceneNum, success: false, error: e.message });
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
              // 간소화된 프롬프트로 재시도
              const retryPrompt = `Professional presenter speaking in a modern studio. Natural expressions and gestures. Speaking in Korean. Clean background with subtle graphics. No text overlays.`;

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
                    personGeneration: "allow_adult",
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
      }
    } else {
      console.log(`⏭️ 비디오 생성 스킵됨`);
    }

    // ==========================================
    // 결과 반환
    // ==========================================
    console.log(`\n📊 === 최종 결과 ===`);
    console.log(`이미지: ${imageResults.filter(r => r.success).length}/${targetScenes.length}`);
    console.log(`비디오: ${videoResults.filter(r => r.success).length}/${targetScenes.length}`);

    const result = {
      folder_name: folderName,
      analysis_date: analysisDate,
      market_label: marketLabel,
      shorts_script: shortsScript,
      images: {
        generated: imageResults.filter(r => r.success).length,
        failed: imageResults.filter(r => !r.success).length,
        results: imageResults,
      },
      videos: {
        generated: videoResults.filter(r => r.success).length,
        failed: videoResults.filter(r => !r.success).length,
        results: videoResults,
      },
      generated_at: new Date().toISOString(),
    };

    $.export("video_generation", result);
    $.export("$summary", `이미지: ${result.images.generated}개, 비디오: ${result.videos.generated}개`);
    return result;
  },
});
