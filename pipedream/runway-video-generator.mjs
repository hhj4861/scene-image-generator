import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Video Generator (Runway + Veo)",
  description: "Generate videos from images using Runway Gen-3 or Google Veo 3 with automatic fallback",

  props: {
    // 입력 데이터
    images: {
      type: "string",
      label: "Images JSON",
      description: "JSON array of image objects with url, start, end, prompt, mood fields",
    },

    // 이미지 스타일 (API 선택에 영향)
    image_style: {
      type: "string",
      label: "Image Style",
      description: "이미지 스타일 - 실사 계열은 Veo 우선 사용",
      options: [
        { label: "실사 (Ultra Realistic) → Veo 우선", value: "ultra_realistic" },
        { label: "스톡 포토 (Stock Photo) → Veo 우선", value: "stock_photo" },
        { label: "야생동물 사진 (Wildlife) → Veo 우선", value: "wildlife" },
        { label: "인물 사진 (Portrait) → Veo 우선", value: "portrait" },
        { label: "시네마틱 (Cinematic) → Veo 우선", value: "cinematic" },
        { label: "애니메이션 (Anime) → Runway 우선", value: "anime" },
        { label: "디지털 아트 (Digital Art) → Runway 우선", value: "digital_art" },
        { label: "3D 렌더 (3D Render) → Runway 우선", value: "3d_render" },
        { label: "수채화 (Watercolor) → Runway 우선", value: "watercolor" },
        { label: "유화 (Oil Painting) → Runway 우선", value: "oil_painting" },
      ],
      default: "ultra_realistic",
    },

    // 비디오 생성 API 선택
    preferred_api: {
      type: "string",
      label: "Preferred API",
      description: "우선 사용할 API (실패 시 자동으로 다른 API 사용)",
      options: [
        { label: "Runway Gen-3 (권장)", value: "runway" },
        { label: "Google Veo 3.1", value: "veo" },
      ],
      default: "runway",
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

    // Runway API 설정
    runway_api_key: {
      type: "string",
      label: "Runway API Key",
      secret: true,
      optional: true,
    },

    // Google AI Studio API Key (Gemini/Veo 공용)
    gemini_api_key: {
      type: "string",
      label: "Google AI (Gemini) API Key",
      description: "Google AI Studio API Key - Gemini와 Veo 모두 사용 (https://aistudio.google.com)",
      secret: true,
      optional: true,
    },
    veo_model: {
      type: "string",
      label: "Veo Model",
      description: "사용할 Veo 모델",
      options: [
        { label: "Veo 3.1 (최신, 권장)", value: "veo-3.1-generate-preview" },
        { label: "Veo 3.1 Fast (빠른 생성)", value: "veo-3.1-fast-generate-preview" },
        { label: "Veo 3.0", value: "veo-3.0-generate-001" },
        { label: "Veo 2.0", value: "veo-2.0-generate-001" },
      ],
      default: "veo-3.1-generate-preview",
      optional: true,
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
      description: "Duration of each video clip (5 or 10 seconds)",
    },
  },

  async run({ steps, $ }) {
    const images = typeof this.images === 'string' ? JSON.parse(this.images) : this.images;

    const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";
    const generatedVideos = [];

    // =====================
    // API 사용 가능 여부 체크
    // =====================
    const runwayAvailable = !!this.runway_api_key;
    const veoAvailable = !!this.gemini_api_key;

    // 사용 가능한 API 목록
    const availableApis = [];
    if (runwayAvailable) availableApis.push("runway");
    if (veoAvailable) availableApis.push("veo");

    // API 우선순위 결정
    let primaryApi = this.preferred_api || "runway";
    let fallbackApis = [];

    // 선택한 API가 사용 불가능하면 다른 것으로 전환
    if (!availableApis.includes(primaryApi)) {
      primaryApi = availableApis[0];
    }

    // fallback API 설정 (primary 제외한 나머지)
    fallbackApis = availableApis.filter(api => api !== primaryApi);

    // 사용 가능한 API가 없으면 에러
    if (availableApis.length === 0) {
      throw new Error("No video generation API configured. Please provide Runway API Key, Kling API Key, or Veo Project ID.");
    }

    $.export("api_selection", {
      primary: primaryApi,
      fallbacks: fallbackApis,
      available: availableApis,
      image_style: this.image_style,
    });

    // =====================
    // Runway API 호출 함수
    // =====================
    const generateWithRunway = async (imageUrl, motionPrompt) => {
      const createResponse = await axios($, {
        method: "POST",
        url: `${RUNWAY_API_URL}/image_to_video`,
        headers: {
          "Authorization": `Bearer ${this.runway_api_key}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        data: {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: motionPrompt,
          duration: this.video_duration,
          ratio: "768:1280",
        },
      });

      const taskId = createResponse.id;

      // 작업 완료 대기
      let videoUrl = null;
      let attempts = 0;
      const maxAttempts = 60;

      while (!videoUrl && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await axios($, {
          method: "GET",
          url: `${RUNWAY_API_URL}/tasks/${taskId}`,
          headers: {
            "Authorization": `Bearer ${this.runway_api_key}`,
            "X-Runway-Version": "2024-11-06",
          },
        });

        if (statusResponse.status === "SUCCEEDED") {
          videoUrl = statusResponse.output[0];
        } else if (statusResponse.status === "FAILED") {
          throw new Error(`Runway task failed: ${statusResponse.failure || 'Unknown error'}`);
        }

        attempts++;
      }

      if (!videoUrl) {
        throw new Error(`Runway timeout (task: ${taskId})`);
      }

      return { videoUrl, api: "runway", taskId };
    };

    // =====================
    // Google Veo API 호출 함수 (Google AI Studio)
    // =====================
    const generateWithVeo = async (imageUrl, motionPrompt) => {
      const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
      const modelId = this.veo_model || "veo-3.1-generate-preview";

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

      // Veo API 엔드포인트 (predictLongRunning)
      const veoEndpoint = `${VEO_BASE_URL}/models/${modelId}:predictLongRunning?key=${this.gemini_api_key}`;

      $.export(`veo_model`, modelId);

      // 요청 데이터 구성 (Google AI API 형식)
      // durationSeconds: 정수! 유효값 4, 6, 8 (Veo 2.0은 5, 6, 7, 8)
      let duration;
      if (modelId.includes("veo-2.0")) {
        // Veo 2.0: 5-8초
        duration = Math.max(5, Math.min(8, this.video_duration));
      } else {
        // Veo 3.x: 4, 6, 8초만 가능
        if (this.video_duration <= 4) duration = 4;
        else if (this.video_duration <= 6) duration = 6;
        else duration = 8;
      }

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
        $.export(`veo_request`, `Calling Veo ${modelId} (${duration}s)...`);

        const createResponse = await axios($, {
          method: "POST",
          url: veoEndpoint,
          headers: {
            "Content-Type": "application/json",
          },
          data: requestData,
        });

        // Long-running operation 응답
        const operationName = createResponse.name;
        if (!operationName) {
          throw new Error("Veo did not return operation name");
        }

        $.export(`veo_operation`, operationName);

        // Operation 완료 대기
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 72; // 6분 (Veo는 최대 6분)

        while (!videoUrl && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));

          const statusResponse = await axios($, {
            method: "GET",
            url: `${VEO_BASE_URL}/${operationName}?key=${this.gemini_api_key}`,
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
              const match = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
              if (match) {
                videoUrl = `https://storage.googleapis.com/${match[1]}/${match[2]}`;
              }
            }
          }

          attempts++;
          if (attempts % 6 === 0) {
            $.export(`veo_progress`, `Waiting for Veo... (${attempts * 5}s)`);
          }
        }

        if (!videoUrl) {
          throw new Error(`Veo timeout after ${maxAttempts * 5}s (operation: ${operationName})`);
        }

        return { videoUrl, api: "veo", model: modelId, operationName };

      } catch (error) {
        const errorMsg = error.message || String(error);
        const status = error.response?.status;
        const responseData = error.response?.data;

        $.export(`veo_error`, `Veo failed (${status}): ${errorMsg.substring(0, 150)}`);

        if (responseData) {
          $.export(`veo_error_detail`, JSON.stringify(responseData).substring(0, 300));
        }

        throw error;
      }
    };

    // =====================
    // 비디오 생성 함수 (fallback 포함)
    // =====================
    const generateVideo = async (imageUrl, motionPrompt, sceneIndex) => {
      // primary + fallbacks
      const apis = [primaryApi, ...fallbackApis];

      let lastError = null;

      for (const api of apis) {
        try {
          $.export(`attempt_${sceneIndex}`, `Trying ${api.toUpperCase()}...`);

          if (api === "runway") {
            return await generateWithRunway(imageUrl, motionPrompt);
          } else if (api === "veo") {
            return await generateWithVeo(imageUrl, motionPrompt);
          }
        } catch (error) {
          lastError = error;
          const errorMsg = error.message || String(error);

          // Rate limit / Quota 에러 체크
          const isRateLimitError = errorMsg.includes("daily task limit") ||
                                   errorMsg.includes("rate limit") ||
                                   errorMsg.includes("quota exceeded") ||
                                   errorMsg.includes("Quota exceeded") ||
                                   error.response?.status === 429;

          $.export(`error_${sceneIndex}_${api}`, `${api} failed: ${errorMsg.substring(0, 100)}`);

          if (isRateLimitError) {
            $.export(`fallback_${sceneIndex}`, `${api} rate limited, switching to next API...`);
          }

          // 다음 API 시도
          if (apis.indexOf(api) < apis.length - 1) {
            continue;
          }
        }
      }

      throw lastError || new Error("All video APIs failed");
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

    $.export("status", `Generating ${images.length} video clips (Primary: ${primaryApi.toUpperCase()})...`);
    $.export("motion_style", this.motion_style);
    $.export("content_type", this.content_type);

    // API 사용 통계
    const apiStats = { runway: 0, veo: 0, failed: 0 };

    // 각 이미지에 대해 영상 생성
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const prevImage = i > 0 ? images[i - 1] : null;
      const nextImage = i < images.length - 1 ? images[i + 1] : null;

      // 장면별 최적화된 모션 프롬프트 생성
      const motionPrompt = generateMotionPrompt(image, i, images.length, prevImage, nextImage);

      try {
        $.export(`prompt_${i}`, `Scene ${i + 1}: ${motionPrompt.substring(0, 80)}...`);

        // 비디오 생성 (fallback 포함)
        const result = await generateVideo(image.url, motionPrompt, i);
        const { videoUrl, api: usedApi } = result;

        apiStats[usedApi]++;
        $.export(`video_${i}_api`, `Generated with ${usedApi.toUpperCase()}`);

        // 영상 다운로드
        const videoResponse = await axios($, {
          method: "GET",
          url: videoUrl,
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
          generated_by: usedApi, // 어떤 API로 생성되었는지 기록
        });

        $.export(`video_${i}`, `Generated: ${filename} (${usedApi})`);

      } catch (error) {
        apiStats.failed++;
        console.error(`Video ${i + 1} failed:`, error.message);
        $.export(`error_${i}`, error.message);
      }

      // Rate limit delay
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 결과 요약
    const summaryParts = [`Generated ${generatedVideos.length}/${images.length} clips`];
    if (apiStats.runway > 0) summaryParts.push(`Runway: ${apiStats.runway}`);
    if (apiStats.veo > 0) summaryParts.push(`Veo: ${apiStats.veo}`);
    if (apiStats.failed > 0) summaryParts.push(`Failed: ${apiStats.failed}`);

    $.export("$summary", summaryParts.join(" | "));
    $.export("api_stats", apiStats);

    return {
      success: true,
      folder_name: this.folder_name,
      bucket: this.gcs_bucket_name,
      api_config: {
        primary: primaryApi,
        fallbacks: fallbackApis,
        available: availableApis,
        image_style: this.image_style,
      },
      api_stats: apiStats,
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
