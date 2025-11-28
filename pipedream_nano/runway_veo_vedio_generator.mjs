import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Video Generator (Veo Only)",
  description: "Generate videos from images using Google Veo 3 with automatic model/API key fallback",

  props: {
    // 입력 데이터
    images: {
      type: "string",
      label: "Images JSON",
      description: "JSON array of image objects with url, start, end, prompt, mood fields",
    },

    // 이미지 스타일 (프롬프트에 영향)
    image_style: {
      type: "string",
      label: "Image Style",
      description: "이미지 스타일",
      options: [
        { label: "실사 (Ultra Realistic)", value: "ultra_realistic" },
        { label: "스톡 포토 (Stock Photo)", value: "stock_photo" },
        { label: "야생동물 사진 (Wildlife)", value: "wildlife" },
        { label: "인물 사진 (Portrait)", value: "portrait" },
        { label: "시네마틱 (Cinematic)", value: "cinematic" },
        { label: "애니메이션 (Anime)", value: "anime" },
        { label: "디지털 아트 (Digital Art)", value: "digital_art" },
        { label: "3D 렌더 (3D Render)", value: "3d_render" },
        { label: "수채화 (Watercolor)", value: "watercolor" },
        { label: "유화 (Oil Painting)", value: "oil_painting" },
      ],
      default: "ultra_realistic",
    },

    // 모션 스타일 설정
    motion_style: {
      type: "string",
      label: "Motion Style",
      description: "Overall motion/animation style for the video",
      options: [
        { label: "자연스러운 움직임 (Natural)", value: "natural" },
        { label: "시네마틱 (Cinematic)", value: "cinematic" },
        { label: "다이나믹 (Dynamic)", value: "dynamic" },
        { label: "차분한 (Calm)", value: "calm" },
        { label: "드라마틱 (Dramatic)", value: "dramatic" },
        { label: "귀여운/활기찬 (Cute/Lively)", value: "cute" },
      ],
      default: "natural",
    },

    // 카메라 무브먼트 설정
    camera_movement: {
      type: "string",
      label: "Camera Movement",
      description: "Primary camera movement style",
      options: [
        { label: "천천히 줌인 (Slow Zoom In)", value: "slow_zoom_in" },
        { label: "천천히 줌아웃 (Slow Zoom Out)", value: "slow_zoom_out" },
        { label: "천천히 패닝 (Slow Pan)", value: "slow_pan" },
        { label: "부드러운 트래킹 (Smooth Tracking)", value: "tracking" },
        { label: "고정 + 피사체 움직임 (Static + Subject Motion)", value: "static_subject" },
        { label: "자동 (장면별 최적화)", value: "auto" },
      ],
      default: "auto",
    },

    // 콘텐츠 타입
    content_type: {
      type: "string",
      label: "Content Type",
      description: "Type of content for optimized motion",
      options: [
        { label: "반려동물 (Pet)", value: "pet" },
        { label: "자연/풍경 (Nature)", value: "nature" },
        { label: "인물 (Portrait)", value: "portrait" },
        { label: "음식 (Food)", value: "food" },
        { label: "제품 (Product)", value: "product" },
        { label: "일반 (General)", value: "general" },
      ],
      default: "pet",
    },

    default_prompt: {
      type: "string",
      label: "Default Motion Prompt (Optional)",
      description: "Custom motion prompt override. Leave empty for auto-generated prompts.",
      optional: true,
    },

    // Primary Google AI Studio API Key
    gemini_api_key: {
      type: "string",
      label: "Primary Gemini API Key",
      description: "Primary Google AI Studio API Key (https://aistudio.google.com)",
      secret: true,
    },

    // Backup API Key (한도 초과 시 사용)
    gemini_api_key_backup: {
      type: "string",
      label: "Backup Gemini API Key (Optional)",
      description: "Backup API Key - 한도 초과 시 자동 전환",
      secret: true,
      optional: true,
      default: "AIzaSyCUpTU6iWX81OvQU2eknDhXipEU86K40tA",
    },

    // GCS 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name for storing videos",
    },

    // 영상 설정
    video_duration: {
      type: "integer",
      label: "Video Duration (seconds)",
      default: 5,
      description: "Duration of each video clip (4, 6, or 8 seconds for Veo 3.x)",
    },
  },

  async run({ steps, $ }) {
    const images = typeof this.images === 'string' ? JSON.parse(this.images) : this.images;

    const generatedVideos = [];

    // =====================
    // Veo 모델 및 API Key fallback 설정
    // =====================
    // 모델 우선순위: veo-3.0-fast-generate → veo-3.0-generate → (API Key 전환 후 재시도)
    const veoModels = [
      "veo-3.0-fast-generate",  // 1순위: 빠른 생성
      "veo-3.0-generate",       // 2순위: 일반 생성
    ];

    const apiKeys = [this.gemini_api_key];
    if (this.gemini_api_key_backup) {
      apiKeys.push(this.gemini_api_key_backup);
    }

    // 현재 사용 중인 모델과 API Key 인덱스
    let currentModelIndex = 0;
    let currentApiKeyIndex = 0;

    $.export("veo_config", {
      models: veoModels,
      api_keys_count: apiKeys.length,
      image_style: this.image_style,
    });

    // =====================
    // Google Veo API 호출 함수 (모델/API Key fallback 포함)
    // =====================
    const generateWithVeo = async (imageUrl, motionPrompt, sceneIndex) => {
      const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

      // 현재 모델 및 API Key로 시작
      let modelIdx = currentModelIndex;
      let apiKeyIdx = currentApiKeyIndex;

      // 이미지 다운로드 후 base64로 변환
      const imageResponse = await axios($, {
        method: "GET",
        url: imageUrl,
        responseType: "arraybuffer",
      });
      const imageBase64 = Buffer.from(imageResponse).toString("base64");

      // MIME 타입 추론
      let mimeType = "image/png";
      if (imageUrl.toLowerCase().includes(".jpg") || imageUrl.toLowerCase().includes(".jpeg")) {
        mimeType = "image/jpeg";
      }

      // Fallback 루프: 모델 → API Key 순서로 시도
      while (modelIdx < veoModels.length || apiKeyIdx < apiKeys.length - 1) {
        const modelId = veoModels[Math.min(modelIdx, veoModels.length - 1)];
        const apiKey = apiKeys[apiKeyIdx];

        // Veo API 엔드포인트 (predictLongRunning)
        const veoEndpoint = `${VEO_BASE_URL}/models/${modelId}:predictLongRunning`;

        $.export(`veo_attempt_${sceneIndex}`, `Model: ${modelId}, API Key: ${apiKeyIdx + 1}/${apiKeys.length}`);

        // durationSeconds: Veo 3.x는 4, 6, 8초만 가능
        let duration;
        if (this.video_duration <= 4) duration = 4;
        else if (this.video_duration <= 6) duration = 6;
        else duration = 8;

        const requestData = {
          instances: [{
            prompt: motionPrompt,
            image: {
              bytesBase64Encoded: imageBase64,
              mimeType: mimeType,
            },
          }],
          parameters: {
            aspectRatio: "9:16",
            durationSeconds: duration,
            personGeneration: "allow_adult",
          },
        };

        try {
          $.export(`veo_request_${sceneIndex}`, `Calling Veo ${modelId} (${duration}s)...`);

          const createResponse = await axios($, {
            method: "POST",
            url: veoEndpoint,
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": apiKey,
            },
            data: requestData,
          });

          // Long-running operation 응답
          const operationName = createResponse.name;
          if (!operationName) {
            throw new Error("Veo did not return operation name");
          }

          $.export(`veo_operation_${sceneIndex}`, operationName);

          // Operation 완료 대기
          let videoUrl = null;
          let attempts = 0;
          const maxAttempts = 72; // 6분 (Veo는 최대 6분)

          while (!videoUrl && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            const statusResponse = await axios($, {
              method: "GET",
              url: `${VEO_BASE_URL}/${operationName}`,
              headers: {
                "X-goog-api-key": apiKey,
              },
            });

            if (statusResponse.done) {
              if (statusResponse.error) {
                throw new Error(`Veo failed: ${statusResponse.error.message}`);
              }

              // 비디오 데이터 추출 (Google AI API 응답 형식)
              const response = statusResponse.response;

              // 형식 1: generateVideoResponse.generatedSamples (최신 형식)
              if (response?.generateVideoResponse?.generatedSamples?.length > 0) {
                const sample = response.generateVideoResponse.generatedSamples[0];
                if (sample.video?.uri) {
                  videoUrl = sample.video.uri;
                }
              }

              // 형식 2: generatedVideos
              if (!videoUrl && response?.generatedVideos?.length > 0) {
                const video = response.generatedVideos[0];
                if (video.video?.uri) {
                  videoUrl = video.video.uri;
                }
              }

              // 형식 3: videos
              if (!videoUrl && response?.videos?.length > 0) {
                videoUrl = response.videos[0].gcsUri || response.videos[0].uri;
              }

              // gs:// URL을 https:// URL로 변환
              if (videoUrl && videoUrl.startsWith("gs://")) {
                const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
                if (gsMatch) {
                  videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
                }
              }
            }

            attempts++;
            if (attempts % 6 === 0) {
              $.export(`veo_progress_${sceneIndex}`, `Waiting for Veo... (${attempts * 5}s)`);
            }
          }

          if (!videoUrl) {
            throw new Error(`Veo timeout after ${maxAttempts * 5}s (operation: ${operationName})`);
          }

          // 성공! 현재 모델/API Key 인덱스 업데이트 (다음 장면에서 사용)
          currentModelIndex = modelIdx;
          currentApiKeyIndex = apiKeyIdx;

          return { videoUrl, api: "veo", model: modelId, apiKeyIndex: apiKeyIdx, operationName };

        } catch (error) {
          const errorMsg = error.message || String(error);
          const status = error.response?.status;
          const responseData = error.response?.data;

          // Rate limit / Quota 초과 에러 체크
          const isQuotaError = errorMsg.includes("daily task limit") ||
                               errorMsg.includes("rate limit") ||
                               errorMsg.includes("quota exceeded") ||
                               errorMsg.includes("Quota exceeded") ||
                               errorMsg.includes("RESOURCE_EXHAUSTED") ||
                               status === 429;

          // 403 에러: API 활성화 필요
          const isApiDisabledError = status === 403 ||
                                     errorMsg.includes("SERVICE_DISABLED") ||
                                     errorMsg.includes("has not been used in project");

          $.export(`veo_error_${sceneIndex}_${modelIdx}_${apiKeyIdx}`,
            `${modelId} (key ${apiKeyIdx + 1}) failed: ${errorMsg.substring(0, 100)}`);

          if (isQuotaError) {
            // 한도 초과: 다음 모델 또는 API Key로 전환
            $.export(`veo_fallback_${sceneIndex}`, `Quota exceeded, trying next option...`);

            // 먼저 다음 모델 시도
            if (modelIdx < veoModels.length - 1) {
              modelIdx++;
              continue;
            }

            // 모든 모델 실패 시 다음 API Key 시도
            if (apiKeyIdx < apiKeys.length - 1) {
              apiKeyIdx++;
              modelIdx = 0; // 모델 인덱스 리셋
              $.export(`veo_api_key_switch_${sceneIndex}`, `Switching to backup API Key ${apiKeyIdx + 1}`);
              continue;
            }
          }

          if (isApiDisabledError) {
            $.export(`veo_api_disabled_${sceneIndex}`,
              `API Key ${apiKeyIdx + 1} disabled, trying next...`);

            if (apiKeyIdx < apiKeys.length - 1) {
              apiKeyIdx++;
              modelIdx = 0;
              continue;
            }
          }

          // 기타 에러: 다음 모델 시도
          if (modelIdx < veoModels.length - 1) {
            modelIdx++;
            continue;
          }

          // 다음 API Key 시도
          if (apiKeyIdx < apiKeys.length - 1) {
            apiKeyIdx++;
            modelIdx = 0;
            continue;
          }

          // 모든 시도 실패
          throw error;
        }
      }

      throw new Error("All Veo models and API keys exhausted");
    };

    // =====================
    // 모션 스타일 프리셋
    // =====================
    const motionPresets = {
      natural: {
        base: "natural subtle movement, realistic motion, smooth animation",
        camera: "gentle camera movement",
      },
      cinematic: {
        base: "cinematic motion, film-like movement, professional camera work",
        camera: "slow cinematic camera movement, depth of field shift",
      },
      dynamic: {
        base: "dynamic movement, energetic motion, lively animation",
        camera: "following camera, dynamic angles",
      },
      calm: {
        base: "very subtle movement, peaceful animation, minimal motion",
        camera: "static camera with very slow drift",
      },
      dramatic: {
        base: "dramatic movement, intense emotion, powerful motion",
        camera: "dramatic camera push, tension building",
      },
      cute: {
        base: "playful movement, bouncy animation, cheerful motion",
        camera: "gentle following camera, cute angles",
      },
    };

    // 카메라 무브먼트 프리셋
    const cameraPresets = {
      slow_zoom_in: "camera slowly zooming in on subject, gradual close-up",
      slow_zoom_out: "camera slowly zooming out, revealing scene",
      slow_pan: "camera slowly panning across scene, smooth horizontal movement",
      tracking: "camera smoothly tracking subject, following movement",
      static_subject: "static camera, subject moves naturally within frame",
      auto: null, // 장면별 자동 선택
    };

    // 콘텐츠 타입별 모션 가이드
    const contentMotion = {
      pet: {
        subject: "dog/cat breathing, ear twitching, tail wagging, subtle head movement, blinking eyes",
        environment: "soft wind effect on fur, natural light changes",
        keywords: ["living creature", "breathing", "alert", "curious"],
      },
      nature: {
        subject: "leaves swaying, water flowing, clouds drifting",
        environment: "wind movement, light rays, atmospheric particles",
        keywords: ["organic movement", "natural flow", "peaceful"],
      },
      portrait: {
        subject: "subtle breathing, slight head turn, natural blink, micro expressions",
        environment: "soft light shift, background blur variation",
        keywords: ["human motion", "breathing", "alive"],
      },
      food: {
        subject: "steam rising, sauce dripping, crispy texture movement",
        environment: "light highlighting, appetizing motion",
        keywords: ["appetizing", "fresh", "delicious"],
      },
      product: {
        subject: "slow rotation, light reflection change, surface detail reveal",
        environment: "studio lighting shift, professional presentation",
        keywords: ["showcase", "premium", "detail"],
      },
      general: {
        subject: "natural movement appropriate to scene content",
        environment: "ambient motion, realistic animation",
        keywords: ["realistic", "natural", "smooth"],
      },
    };

    // =====================
    // 장면별 모션 프롬프트 생성 함수
    // =====================
    const generateMotionPrompt = (image, index, totalImages, prevImage, nextImage) => {
      // 사용자 지정 프롬프트가 있으면 우선 사용
      if (this.default_prompt) {
        return this.default_prompt;
      }

      const motion = motionPresets[this.motion_style] || motionPresets.natural;
      const content = contentMotion[this.content_type] || contentMotion.general;

      // 카메라 무브먼트 결정
      let cameraMotion = cameraPresets[this.camera_movement];
      if (this.camera_movement === "auto") {
        // 자동 모드: 장면 위치에 따라 카메라 무브먼트 결정
        if (index === 0) {
          // 첫 장면: 줌인으로 시작
          cameraMotion = "camera slowly zooming in, establishing shot";
        } else if (index === totalImages - 1) {
          // 마지막 장면: 줌아웃으로 마무리
          cameraMotion = "camera slowly zooming out, closing shot";
        } else if (index % 2 === 0) {
          // 짝수 장면: 패닝
          cameraMotion = "gentle camera pan, smooth movement";
        } else {
          // 홀수 장면: 트래킹
          cameraMotion = "camera tracking subject, following motion";
        }
      }

      // 장면의 무드 기반 모션 조정
      const mood = image.mood || "";
      let moodMotion = "";
      if (mood.includes("happy") || mood.includes("excited") || mood.includes("playful")) {
        moodMotion = "energetic movement, lively animation";
      } else if (mood.includes("sad") || mood.includes("melancholy") || mood.includes("emotional")) {
        moodMotion = "slow emotional movement, contemplative motion";
      } else if (mood.includes("tense") || mood.includes("dramatic") || mood.includes("intense")) {
        moodMotion = "building tension, dramatic movement";
      } else if (mood.includes("calm") || mood.includes("peaceful") || mood.includes("serene")) {
        moodMotion = "very gentle movement, peaceful animation";
      }

      // 최종 프롬프트 조합
      const promptParts = [
        motion.base,
        content.subject,
        cameraMotion,
        moodMotion,
        "seamless loop-friendly motion",
        "high quality, professional video",
      ].filter(Boolean);

      return promptParts.join(", ");
    };

    $.export("status", `Generating ${images.length} video clips with Veo...`);
    $.export("motion_style", this.motion_style);
    $.export("content_type", this.content_type);

    // 통계
    const stats = { success: 0, failed: 0, models_used: {} };

    // 각 이미지에 대해 영상 생성
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const prevImage = i > 0 ? images[i - 1] : null;
      const nextImage = i < images.length - 1 ? images[i + 1] : null;

      // 장면별 최적화된 모션 프롬프트 생성
      const motionPrompt = generateMotionPrompt(image, i, images.length, prevImage, nextImage);

      try {
        $.export(`prompt_${i}`, `Scene ${i + 1}: ${motionPrompt.substring(0, 80)}...`);

        // Veo로 비디오 생성 (모델/API Key fallback 포함)
        const result = await generateWithVeo(image.url, motionPrompt, i);
        const { videoUrl, model: usedModel, apiKeyIndex } = result;

        stats.success++;
        stats.models_used[usedModel] = (stats.models_used[usedModel] || 0) + 1;
        $.export(`video_${i}_result`, `Generated with ${usedModel} (key ${apiKeyIndex + 1})`);

        // 영상 다운로드
        // Veo URL은 API 키가 필요함 (generativelanguage.googleapis.com)
        const isVeoUrl = videoUrl.includes("generativelanguage.googleapis.com");
        const downloadApiKey = apiKeys[apiKeyIndex] || this.gemini_api_key;
        const downloadHeaders = isVeoUrl ? { "X-goog-api-key": downloadApiKey } : {};

        const videoResponse = await axios($, {
          method: "GET",
          url: videoUrl,
          headers: downloadHeaders,
          responseType: "arraybuffer",
        });

        const videoBuffer = Buffer.from(videoResponse);
        const filename = `video_${String(i + 1).padStart(3, '0')}_${image.start}-${image.end}.mp4`;

        // 4. GCS 업로드
        const { google } = await import("googleapis");
        const { Readable } = await import("stream");

        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(this.google_cloud.$auth.key_json),
          scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
        });

        const storage = google.storage({ version: 'v1', auth });
        const objectName = `${this.folder_name}/${filename}`;

        const bufferStream = new Readable();
        bufferStream.push(videoBuffer);
        bufferStream.push(null);

        await storage.objects.insert({
          bucket: this.gcs_bucket_name,
          name: objectName,
          media: {
            mimeType: 'video/mp4',
            body: bufferStream,
          },
          requestBody: {
            name: objectName,
            contentType: 'video/mp4',
          },
        });

        const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

        generatedVideos.push({
          index: i,
          filename: filename,
          url: gcsUrl,
          start: image.start,
          end: image.end,
          duration: image.end - image.start,
          motion_prompt: motionPrompt,
          generated_by: usedModel, // 어떤 모델로 생성되었는지 기록
          api_key_index: apiKeyIndex,
        });

        $.export(`video_${i}`, `Generated: ${filename} (${usedModel})`);

      } catch (error) {
        stats.failed++;
        console.error(`Video ${i + 1} failed:`, error.message);
        $.export(`error_${i}`, error.message);
      }

      // Rate limit delay
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 결과 요약
    const summaryParts = [`Generated ${generatedVideos.length}/${images.length} clips with Veo`];
    Object.entries(stats.models_used).forEach(([model, count]) => {
      summaryParts.push(`${model}: ${count}`);
    });
    if (stats.failed > 0) summaryParts.push(`Failed: ${stats.failed}`);

    $.export("$summary", summaryParts.join(" | "));
    $.export("stats", stats);

    return {
      success: true,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      veo_config: {
        models: veoModels,
        api_keys_count: apiKeys.length,
        final_model_index: currentModelIndex,
        final_api_key_index: currentApiKeyIndex,
        image_style: this.image_style,
      },
      stats: stats,
      motion_settings: {
        style: this.motion_style,
        camera: this.camera_movement,
        content_type: this.content_type,
      },
      total_videos: generatedVideos.length,
      videos: generatedVideos,
    };
  },
});
