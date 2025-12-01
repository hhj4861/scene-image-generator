import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Veo 3 Video Generator (Image + Audio)",
  description: "이미지 기반 Veo 3 Fast 영상 생성 (음성+립싱크 포함)",

  props: {
    // Image Generator 출력 (이미지 URL 포함)
    images_data: {
      type: "string",
      label: "Image Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Gemini_Image_Generator.$return_value.scenes)}}",
    },

    // Script Generator 출력 (video_generation 정보)
    script_data: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
    },

    // Gemini API Key
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google AI Studio API Key (Veo 3 접근용)",
      secret: true,
    },

    // Backup API Key
    gemini_api_key_backup: {
      type: "string",
      label: "Backup Gemini API Key (Optional)",
      description: "한도 초과 시 자동 전환",
      secret: true,
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

    // 영상 설정
    video_duration: {
      type: "integer",
      label: "Video Duration (seconds)",
      default: 8,
      description: "각 씬 영상 길이 (4, 6, 8초)",
    },

    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts/Reels)", value: "9:16" },
        { label: "16:9 (YouTube)", value: "16:9" },
      ],
      default: "9:16",
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 1. 입력 파싱
    // =====================
    const images = typeof this.images_data === "string"
      ? JSON.parse(this.images_data)
      : this.images_data;

    const scriptData = typeof this.script_data === "string"
      ? JSON.parse(this.script_data)
      : this.script_data;

    const folderName = scriptData.folder_name;
    const videoScenes = scriptData.video_generation?.scenes || [];
    const voiceStyles = scriptData.video_generation?.voice_styles || {};

    if (!images.length) {
      throw new Error("No images found in input data");
    }

    // 이미지와 video_generation 씬 매칭 (index 기준)
    // Image Generator 출력에 이미 narration, speaker 등이 있으므로 우선 사용
    // video_generation에서 추가 정보(voice_style, veo3_prompt_parts 등) 보완
    const scenes = images.map((img) => {
      const imgIndex = img.index;
      const videoScene = videoScenes.find(s => s.index === imgIndex) || {};

      // ★ 인터뷰 질문인지 확인
      const isInterviewQuestion = img.is_interview_question ||
        videoScene.scene_details?.is_interview_question ||
        img.scene_type === "interview_question" ||
        img.speaker === "interviewer";

      return {
        // 이미지 기본 정보
        index: imgIndex,
        image_url: img.url,
        start: img.start,
        end: img.end,
        duration: img.duration,

        // 대사/음성 정보 (이미지에서 가져오고, video_generation으로 보완)
        narration: img.narration || videoScene.narration || "",
        has_narration: !!(img.narration || videoScene.narration),
        speaker: img.speaker || videoScene.speaker || "main",
        voice_type: img.voice_type || videoScene.voice_type || "cute_toddler_girl",
        voice_style: videoScene.voice_style || voiceStyles[img.speaker || "main"] || "",

        // 감정/씬 정보 (감정 변화 포함)
        emotion: img.emotion || videoScene.emotion || "happy",
        emotion_transition: img.emotion_transition || videoScene.emotion_transition || null,
        scene_details: img.scene_details || videoScene.scene_details || {},

        // video_generation 전용 정보
        video_prompt: videoScene.video_prompt || {},
        audio_details: {
          ...(videoScene.audio_details || {}),
          // Script Generator에서 오는 새 필드들 명시적으로 매핑
          voice_style: videoScene.audio_details?.voice_style || "",
          voice_tone: videoScene.audio_details?.voice_tone || "",
          sound_effects: videoScene.audio_details?.sound_effects || [],
          ambient_sound: videoScene.audio_details?.ambient_sound || "",
          background_music_mood: videoScene.audio_details?.background_music_mood || "",
        },
        veo3_prompt_parts: videoScene.veo3_prompt_parts || {},

        // ★ 액션 큐 (씬 전환, 캐릭터 상호작용, 환경 변화)
        action_cues: img.action_cues || videoScene.action_cues || {},

        // ★ 새로운 필드들 (인터뷰 형식 지원)
        is_interview_question: isInterviewQuestion,
        interview_question_info: videoScene.interview_question_info || null,
        lip_sync_style: videoScene.lip_sync_style || null,
        voice_settings: videoScene.voice_settings || {},
        korean_mouth_shapes: videoScene.korean_mouth_shapes || null,
        character_appearance: img.character_appearance || videoScene.character_appearance || {},
        scene_environment: img.scene_environment || videoScene.scene_environment || {},
      };
    });

    $.export("input_images", images.length);
    $.export("input_video_scenes", videoScenes.length);
    $.export("matched_scenes", scenes.length);
    $.export("folder_name", folderName);

    // 누락된 씬 경고
    if (images.length !== videoScenes.length) {
      const imageIndices = images.map(i => i.index);
      const videoIndices = videoScenes.map(v => v.index);
      const missing = videoIndices.filter(i => !imageIndices.includes(i));
      if (missing.length > 0) {
        $.export("warning_missing_images", `Missing image for scenes: ${missing.join(", ")}`);
      }
    }

    // =====================
    // 2. API 설정
    // =====================
    const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    const MODEL_ID = "veo-3.0-fast-generate-001";

    const apiKeys = [this.gemini_api_key];
    if (this.gemini_api_key_backup) {
      apiKeys.push(this.gemini_api_key_backup);
    }

    let currentApiKeyIndex = 0;

    // Duration 정규화 (Veo 3는 4, 6, 8초만 지원)
    const normalizeDuration = (d) => {
      if (d <= 4) return 4;
      if (d <= 6) return 6;
      return 8;
    };

    // =====================
    // 3. Veo 3 프롬프트 생성 함수 (이미지 기반 - 동작/음성/립싱크/효과음 중심)
    // =====================

    // ★ 안전 필터 우회: 자극적인 표현 정화
    const sanitizeText = (text) => {
      if (!text) return "";
      return text
        // 동물 관련 위험 표현 제거
        .replace(/사자/g, "용감한 강아지")
        .replace(/호랑이/g, "씩씩한 강아지")
        .replace(/맹수/g, "귀여운 동물")
        .replace(/으르렁/g, "멍멍")
        .replace(/포효/g, "짖는")
        // 공격적 표현 제거
        .replace(/공격/g, "다가가")
        .replace(/무섭/g, "용감")
        .replace(/싸우/g, "놀")
        .replace(/때리/g, "만지")
        .replace(/죽/g, "쓰러지")
        // 효과음 정화
        .replace(/lion roar/gi, "playful bark")
        .replace(/thunder/gi, "gentle rumble")
        .replace(/explosion/gi, "pop sound")
        .replace(/scream/gi, "excited sound")
        .replace(/growl/gi, "cute puppy sound");
    };

    const buildVeo3Prompt = (scene) => {
      // ★ 인터뷰 질문인지 확인 (강아지는 듣기만 함)
      const isInterviewQuestion = scene.is_interview_question;

      // ★ 안전 필터로 실패 후 간소화 모드 (캐릭터/배경 일관성 유지!)
      if (scene._simplified) {
        const hasNarration = scene.has_narration || !!(scene.narration && scene.narration.trim());
        const narration = sanitizeText(scene.narration || "");

        // 씬 정보에서 캐릭터/배경 정보 추출 (일관성 유지)
        const sceneDetails = scene.scene_details || {};
        const videoPrompt = scene.video_prompt || {};

        // 캐릭터 정보 유지 (이미지 기반이므로 간단히)
        const character = sceneDetails.character_description ||
          videoPrompt.character_description ||
          "the same puppy from the image";

        // 배경 정보 유지
        const background = sceneDetails.background ||
          videoPrompt.background ||
          "same background setting";

        // 간소화된 프롬프트 (자극적 표현 제거, 일관성 유지)
        const simpleParts = [
          `${character}, maintaining exact same appearance`,
          `${background}, consistent environment`,
          "gentle natural movements",
          // ★ 인터뷰 질문: 강아지는 듣기만 (립싱크 없음)
          isInterviewQuestion
            ? "listening attentively, curious expression, mouth CLOSED, occasional subtle nod"
            : (hasNarration ? `speaking: "${narration}"` : "calm breathing"),
          "happy expression, adorable, family-friendly, cinematic quality"
        ];
        return simpleParts.join(", ");
      }

      // ★ 인터뷰 질문: 강아지가 듣는 표정 전용 프롬프트
      if (isInterviewQuestion) {
        const sceneDetails = scene.scene_details || {};
        const background = sceneDetails.background || scene.scene_environment?.background || "interview studio background";

        return [
          "the same puppy from the image, maintaining exact same appearance",
          "listening attentively to the interviewer",
          "curious expression, head slightly tilted, ears perked up",
          "mouth CLOSED - no talking, no lip movement",
          "occasional subtle nod, gentle blinking, ears twitching",
          `${background}, consistent environment`,
          "cinematic quality, smooth animation"
        ].join(", ");
      }

      // veo3_prompt_parts가 있으면 활용
      const parts = scene.veo3_prompt_parts || {};
      const videoPrompt = scene.video_prompt || {};
      const audioDetails = scene.audio_details || {};
      const actionCues = scene.action_cues || parts.action_cues || {};

      const hasNarration = scene.has_narration || !!(scene.narration && scene.narration.trim());
      const narration = sanitizeText(scene.narration || "");

      // 음성 스타일 (voiceStyles에서 가져오기)
      const speaker = scene.speaker || "main";
      const voiceStyle = parts.voice || scene.voice_style || voiceStyles[speaker] || audioDetails.voice_style || "";
      const voiceTone = parts.voice_tone || audioDetails.voice_tone || "";

      // 동작 (립싱크 여부에 따라)
      let action = hasNarration
        ? (videoPrompt.character_action || "talking with perfectly synchronized lip movements, mouth opening and closing naturally matching the speech")
        : (videoPrompt.character_action || "natural subtle movements, gentle breathing, slight head movement");

      // 캐릭터 상호작용이 있으면 동작에 추가
      const characterInteraction = parts.character_interaction || actionCues.character_interaction || videoPrompt.interaction_with_others || "";
      if (characterInteraction) {
        action = `${characterInteraction}, ${action}`;
      }

      // 표정 (감정 변화 포함)
      let expression = videoPrompt.facial_expression || parts.expression || `${scene.emotion || "happy"} expression`;
      const emotionTransition = parts.expression_change || scene.emotion_transition || "";
      if (emotionTransition) {
        expression = `${expression}, emotion changing from ${emotionTransition}`;
      }

      // 몸 움직임
      const bodyMovement = videoPrompt.body_movement || (hasNarration ? "expressive gestures while talking" : "subtle natural movements");

      // 카메라
      const camera = videoPrompt.camera_movement || parts.camera || "static";

      // 특수 효과 (비, 낙엽 등)
      const specialEffects = parts.special_effects || videoPrompt.special_effects || "";

      // 씬 전환 / 환경 변화
      const sceneTransition = parts.scene_transition || actionCues.scene_transition || "";
      const environmentalChange = parts.environmental_change || actionCues.environmental_change || "";

      // ★ 코미디 효과음 (배열 처리) - 정화 적용
      let soundEffects = parts.sound_effects || audioDetails.sound_effects || [];
      if (Array.isArray(soundEffects)) {
        soundEffects = soundEffects.map(s => sanitizeText(s)).filter(Boolean).join(", ");
      } else {
        soundEffects = sanitizeText(soundEffects);
      }

      // ★ 환경음 (빗소리, 바람소리 등)
      const ambient = parts.ambient || audioDetails.ambient_sound || audioDetails.background_sound || "";

      // ★ 배경음악 분위기
      const bgmMood = audioDetails.background_music_mood || "";

      // 프롬프트 구성 (이미지 기반이므로 캐릭터 외형/배경 설명 불필요)
      const promptParts = [];

      // 1. 씬 전환 / 환경 변화 (있으면 먼저 - 드라마틱하게)
      if (sceneTransition) {
        promptParts.push(`[Scene transition: ${sceneTransition}]`);
      }
      if (environmentalChange) {
        promptParts.push(`[Environment: ${environmentalChange}]`);
      }

      // 2. 동작 설명 (핵심!)
      promptParts.push(action);

      // 3. 표정
      promptParts.push(expression);

      // 4. 몸 움직임
      promptParts.push(bodyMovement);

      // 5. 대사 + 음성 스타일 (립싱크가 있을 때)
      if (hasNarration && narration) {
        // 음성 스타일 + 톤 지정 (더 상세하게)
        if (voiceStyle || voiceTone) {
          const voiceDesc = [voiceStyle, voiceTone].filter(Boolean).join(", ");
          promptParts.push(`voice style: ${voiceDesc}`);
        }
        // 대사는 따옴표로 감싸서 음성 생성 유도
        promptParts.push(`dialogue: "${narration}"`);
        // 립싱크 강조
        promptParts.push("perfect lip sync with realistic mouth movements");
      }

      // 6. ★ 코미디 효과음 (중요! - lion roar, epic whoosh 등)
      if (soundEffects) {
        promptParts.push(`[SOUND EFFECTS: ${soundEffects}]`);
      }

      // 7. 환경음
      if (ambient) {
        promptParts.push(`[AMBIENT: ${ambient}]`);
      }

      // 8. 특수 효과 (비주얼)
      if (specialEffects) {
        promptParts.push(`[VISUAL FX: ${specialEffects}]`);
      }

      // 9. 카메라 무브먼트
      if (camera && camera !== "static") {
        promptParts.push(`${camera} camera`);
      }

      // 10. 품질
      promptParts.push("cinematic quality, smooth animation");

      return promptParts.filter(Boolean).join(", ");
    };

    // =====================
    // 4. GCS 업로드 준비
    // =====================
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });

    const storage = google.storage({ version: "v1", auth });

    // =====================
    // 6. 병렬 처리 (속도 최적화)
    // =====================
    // 요청을 순차로 보내되(RPM 대응), 폴링은 병렬로 처리하여 속도 향상
    const REQUEST_DELAY_MS = 3000; // 요청 간 3초 딜레이 (RPM 완화)

    // Phase 1: 모든 요청을 순차로 보내고 operation name만 수집
    const submitAllRequests = async (items) => {
      const operations = [];
      for (let i = 0; i < items.length; i++) {
        $.export(`submit_progress`, `Submitting scene ${i + 1}/${items.length}...`);

        const scene = items[i];
        try {
          // 이미지 URL 확인
          if (!scene.image_url) {
            operations.push({ index: i, error: `Scene ${i + 1} has no image URL`, scene });
            continue;
          }

          // Veo 3 프롬프트 생성
          const prompt = buildVeo3Prompt(scene);
          $.export(`prompt_${i}`, prompt.substring(0, 200));

          // 이미지 다운로드 후 base64 변환
          const imageResponse = await axios($, {
            method: "GET",
            url: scene.image_url,
            responseType: "arraybuffer",
          });
          const imageBase64 = Buffer.from(imageResponse).toString("base64");
          let mimeType = "image/png";
          if (scene.image_url.toLowerCase().includes(".jpg") || scene.image_url.toLowerCase().includes(".jpeg")) {
            mimeType = "image/jpeg";
          }

          const duration = normalizeDuration(this.video_duration);
          const apiKey = apiKeys[currentApiKeyIndex];
          const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

          // Veo 3 요청 (비동기 작업 시작)
          const createResponse = await axios($, {
            method: "POST",
            url: endpoint,
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": apiKey,
            },
            data: {
              instances: [{
                prompt: prompt,
                image: { bytesBase64Encoded: imageBase64, mimeType },
              }],
              parameters: { aspectRatio: this.aspect_ratio, durationSeconds: duration },
            },
          });

          const operationName = createResponse.name;
          if (!operationName) {
            operations.push({ index: i, error: "No operation name returned", scene, prompt });
          } else {
            operations.push({ index: i, operationName, apiKey, scene, prompt });
            $.export(`operation_${i}`, operationName);
          }

        } catch (error) {
          const errorMsg = error.message || String(error);
          const status = error.response?.status;
          const responseData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 300) : "";

          // ★ 쿼터 초과 (429) 확인
          const isQuotaError = status === 429 ||
            errorMsg.includes("rate limit") ||
            errorMsg.includes("RESOURCE_EXHAUSTED") ||
            errorMsg.includes("quota") ||
            errorMsg.includes("exceeded");

          // ★ 안전 필터 에러 확인 (raiMediaFiltered)
          const isSafetyError = errorMsg.includes("raiMediaFiltered") ||
            responseData.includes("raiMediaFiltered") ||
            errorMsg.includes("safety") ||
            errorMsg.includes("blocked");

          if (isQuotaError) {
            // 쿼터 초과 시 다음 API 키로 전환 시도
            if (currentApiKeyIndex < apiKeys.length - 1) {
              currentApiKeyIndex++;
              $.export(`api_key_switch_${i}`, `Switched to API key ${currentApiKeyIndex + 1}`);
              i--; // 재시도
              await new Promise(r => setTimeout(r, 5000));
              continue;
            }
            // 더 이상 API 키가 없으면 실패 기록 (재시도 안 함)
            operations.push({ index: i, error: `Quota exceeded: ${errorMsg.substring(0, 100)}`, scene, isQuotaError: true });
          } else if (isSafetyError) {
            // ★ 안전 필터 에러: 프롬프트 간소화 후 1회 재시도
            $.export(`safety_retry_${i}`, `Safety filter triggered, retrying with simplified prompt...`);
            scene._simplified = true; // 간소화 플래그
            i--; // 재시도
            await new Promise(r => setTimeout(r, 2000));
            continue;
          } else {
            // ★ 기타 에러: 1회 재시도
            if (!scene._retried) {
              $.export(`retry_${i}`, `Retrying scene ${i + 1} after error: ${errorMsg.substring(0, 50)}`);
              scene._retried = true;
              i--;
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
            operations.push({ index: i, error: errorMsg.substring(0, 200), scene });
          }
        }

        // 다음 요청 전 짧은 딜레이 (RPM 대응)
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }
      return operations;
    };

    // Phase 2: 모든 operation 완료 대기 (병렬)
    const waitForAllOperations = async (operations) => {
      $.export(`polling_status`, `Waiting for ${operations.filter(o => o.operationName).length} videos to complete...`);

      const pollOperation = async (op) => {
        if (op.error) {
          return { success: false, index: op.index, error: op.error, narration: op.scene?.narration };
        }

        const { operationName, apiKey, scene, prompt, index } = op;
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 72; // 6분

        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          attempts++;

          try {
            const statusResponse = await axios($, {
              method: "GET",
              url: `${VEO_BASE_URL}/${operationName}`,
              headers: { "X-goog-api-key": apiKey },
            });

            if (statusResponse.done) {
              if (statusResponse.error) {
                const errMsg = statusResponse.error.message || JSON.stringify(statusResponse.error);
                // ★ 안전 필터 에러인지 확인
                const isSafetyFiltered = errMsg.includes("raiMediaFiltered") ||
                  errMsg.includes("safety") ||
                  errMsg.includes("blocked");
                return {
                  success: false,
                  index,
                  error: isSafetyFiltered ? `Safety filtered: ${errMsg.substring(0, 100)}` : errMsg,
                  narration: scene.narration,
                  isSafetyFiltered
                };
              }

              const response = statusResponse.response;
              const genVideoResp = response?.generateVideoResponse;

              // ★ 안전 필터로 인한 빈 결과 체크
              const raiFiltered = genVideoResp?.raiMediaFilteredCount || response?.raiMediaFilteredCount || 0;
              if (raiFiltered > 0) {
                const reasons = genVideoResp?.raiMediaFilteredReasons || response?.raiMediaFilteredReasons || [];
                return {
                  success: false,
                  index,
                  error: `Safety filtered (${raiFiltered}): ${reasons.join(", ") || "content policy violation"}`,
                  narration: scene.narration,
                  isSafetyFiltered: true
                };
              }

              // 비디오 URL 추출
              if (genVideoResp?.generatedSamples?.length > 0) {
                const sample = genVideoResp.generatedSamples[0];
                videoUrl = sample.video?.uri || sample.uri || sample.video?.gcsUri;
              } else if (genVideoResp?.generatedVideos?.length > 0) {
                const video = genVideoResp.generatedVideos[0];
                videoUrl = video.video?.uri || video.uri || video.gcsUri;
              } else if (genVideoResp?.video) {
                videoUrl = genVideoResp.video.uri || genVideoResp.video.gcsUri;
              } else if (response?.generatedVideos?.length > 0) {
                videoUrl = response.generatedVideos[0].video?.uri || response.generatedVideos[0].uri;
              } else if (response?.videos?.length > 0) {
                videoUrl = response.videos[0].gcsUri || response.videos[0].uri;
              } else if (response?.video?.uri) {
                videoUrl = response.video.uri;
              }

              // gs:// → https:// 변환
              if (videoUrl?.startsWith("gs://")) {
                const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
                if (gsMatch) {
                  videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
                }
              }

              if (!videoUrl) {
                const debugInfo = JSON.stringify({ keys: Object.keys(genVideoResp || {}) }).substring(0, 200);
                return { success: false, index, error: `No video URL: ${debugInfo}`, narration: scene.narration };
              }

              // 영상 다운로드 및 GCS 업로드
              const isVeoUrl = videoUrl.includes("generativelanguage.googleapis.com");
              const downloadHeaders = isVeoUrl ? { "X-goog-api-key": apiKey } : {};

              const videoResponse = await axios($, {
                method: "GET",
                url: videoUrl,
                headers: downloadHeaders,
                responseType: "arraybuffer",
              });

              const videoBuffer = Buffer.from(videoResponse);
              const filename = `scene_${String(index + 1).padStart(3, "0")}_${scene.start}-${scene.end}.mp4`;
              const objectName = `${folderName}/${filename}`;

              const bufferStream = new Readable({ read() {} });
              bufferStream.push(videoBuffer);
              bufferStream.push(null);

              await storage.objects.insert({
                bucket: this.gcs_bucket_name,
                name: objectName,
                media: { mimeType: "video/mp4", body: bufferStream },
                requestBody: { name: objectName, contentType: "video/mp4" },
              });

              const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

              return {
                success: true,
                index,
                filename,
                url: gcsUrl,
                start: scene.start,
                end: scene.end,
                duration: scene.duration,
                narration: scene.narration,
                narration_english: scene.narration_english || "",
                speaker: scene.speaker,
                has_audio: true,
                prompt: prompt.substring(0, 300),
              };
            }
          } catch (pollError) {
            // 폴링 에러는 무시하고 재시도
            if (attempts % 12 === 0) {
              $.export(`poll_retry_${index}`, `Retrying... (${attempts * 5}s)`);
            }
          }
        }

        return { success: false, index, error: `Timeout after ${maxAttempts * 5}s`, narration: scene.narration };
      };

      // 모든 operation 병렬 폴링
      return Promise.all(operations.map(pollOperation));
    };

    $.export("status", `Generating ${scenes.length} videos with Veo 3 Fast (optimized parallel)...`);

    // Phase 1: 요청 제출 (순차, 짧은 딜레이)
    const operations = await submitAllRequests(scenes);
    $.export("submitted", `${operations.filter(o => o.operationName).length}/${scenes.length} requests submitted`);

    // Phase 2: 완료 대기 (병렬)
    const results = await waitForAllOperations(operations);

    // 결과 정렬
    results.sort((a, b) => a.index - b.index);

    // 통계
    const successVideos = results.filter(r => r.success);
    const failedVideos = results.filter(r => !r.success);

    $.export("$summary",
      `Generated ${successVideos.length}/${scenes.length} videos with Veo 3 Fast | ` +
      `Failed: ${failedVideos.length}`
    );

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      model: MODEL_ID,
      total_videos: successVideos.length,
      failed_count: failedVideos.length,
      videos: successVideos,
      failed: failedVideos,
      // 다음 단계(Creatomate)용
      video_urls: successVideos.map(v => v.url),
    };
  },
});
