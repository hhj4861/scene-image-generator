import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Veo 3 Video Generator",
  description: "Puppy Video Generator 출력 기반 Veo 3로 씬별 영상 생성",

  props: {
    // Image Generator 출력 (이미지 URL 포함)
    images_data: {
      type: "string",
      label: "Image Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Gemini_Image_Generator.$return_value)}}",
    },

    // Puppy Video Generator 출력 (비디오 프롬프트 정보)
    video_generator_output: {
      type: "string",
      label: "Puppy Video Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Video_Generator.$return_value)}}",
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

    // ★★★ 디버깅: 원본 입력 확인 ★★★
    $.export("debug_raw_images_data", typeof this.images_data === "string"
      ? this.images_data.substring(0, 500)
      : JSON.stringify(this.images_data).substring(0, 500));

    $.export("debug_raw_video_data", typeof this.video_generator_output === "string"
      ? this.video_generator_output.substring(0, 500)
      : JSON.stringify(this.video_generator_output).substring(0, 500));

    // images_data가 비어있거나 없는 경우 체크
    if (!this.images_data) {
      throw new Error("images_data is empty or undefined. Check if Image Generator step ran successfully and the step name matches.");
    }

    let imagesData;
    try {
      imagesData = typeof this.images_data === "string"
        ? JSON.parse(this.images_data)
        : this.images_data;
    } catch (e) {
      throw new Error(`Failed to parse images_data: ${e.message}. Raw: ${String(this.images_data).substring(0, 200)}`);
    }

    let videoGenData;
    try {
      videoGenData = typeof this.video_generator_output === "string"
        ? JSON.parse(this.video_generator_output)
        : this.video_generator_output;
    } catch (e) {
      throw new Error(`Failed to parse video_generator_output: ${e.message}`);
    }

    // ★★★ 디버깅: 파싱된 데이터 구조 확인 ★★★
    $.export("debug_imagesData_keys", Object.keys(imagesData || {}));
    $.export("debug_videoGenData_keys", Object.keys(videoGenData || {}));

    // Image Generator 출력에서 씬 이미지 정보
    const imageScenes = imagesData.scenes || [];
    const folderName = imagesData.folder_name || videoGenData.folder_name;

    // Puppy Video Generator 출력에서 비디오 생성 정보
    const videoScenes = videoGenData.scenes || [];
    const contentType = videoGenData.content_type || "satire";
    const contentTypeConfig = videoGenData.content_type_config || {};
    const scriptFormat = videoGenData.script_format || "interview";
    const characters = videoGenData.characters || imagesData.characters || {};
    const bgmInfo = videoGenData.bgm || imagesData.bgm || {};

    $.export("input_info", {
      folder_name: folderName,
      image_scenes: imageScenes.length,
      video_scenes: videoScenes.length,
      content_type: contentType,
      script_format: scriptFormat,
    });

    if (!imageScenes.length) {
      // 더 상세한 에러 메시지
      throw new Error(`No image scenes found. imagesData.scenes is ${JSON.stringify(imagesData.scenes)}. Available keys: ${Object.keys(imagesData || {}).join(", ")}. Check Pipedream step name: should be "Gemini_Image_Generator"`);
    }

    // ★★★ 이미지와 비디오 씬 매칭 (veo_script_sample JSON 형식 기반) ★★★
    const scenes = imageScenes.map((img) => {
      const imgIndex = img.index;
      // puppy-video-generator의 video 필드로 매칭
      const videoScene = videoScenes.find(s => s.video === imgIndex) || {};

      return {
        // 이미지 정보
        index: imgIndex,
        image_url: img.url,

        // ★★★ veo_script_sample 형식의 JSON 데이터 ★★★
        // 핵심: puppy-video-generator에서 생성된 prompt 사용
        veo3_prompt: videoScene.prompt || "",
        title: videoScene.title || `Scene ${imgIndex}`,
        duration: videoScene.duration_seconds || img.duration || 6,
        resolution: videoScene.resolution || "8K",

        // 대화 정보 (veo_script_sample 형식)
        dialogue: videoScene.dialogue || {
          script: img.narration || "",
          audio_only: true,
        },

        // 음성 설정 (veo_script_sample 형식)
        voice_settings: videoScene.voice_settings || {},

        // 시각적 연속성 (veo_script_sample 형식)
        visual_continuity: videoScene.visual_continuity || {},

        // 립싱크 스타일 (veo_script_sample 형식)
        lip_sync_style: videoScene.lip_sync_style || null,

        // 립싱크 타이밍 (veo_script_sample 형식)
        lip_sync_timing: videoScene.lip_sync_timing || null,

        // ★★★ 한글 입모양 매핑 (Veo 3 립싱크 참고용) ★★★
        mouth_shapes: videoScene.mouth_shapes || null,

        // 일관성 체크 (veo_script_sample 형식)
        consistency_check: videoScene.consistency_check || {},

        // 출력 설정 (veo_script_sample 형식)
        output: videoScene.output || {
          format: "Clean video only",
          text_overlays: false,
          subtitles: false,
        },

        // 대사 정보 (기존 호환성)
        narration: img.narration || videoScene.dialogue?.script || "",
        narration_english: img.narration_english || videoScene.dialogue?.script_english || "",
        has_narration: img.has_narration ?? !!(img.narration || videoScene.dialogue?.script),
        speaker: img.speaker || videoScene.scene_details?.speaker || "main",
        character_name: img.character_name || videoScene.scene_details?.character_name || "",

        // 씬 타입 정보
        scene_type: img.scene_type || videoScene.scene_details?.scene_type || "narration",
        emotion: videoScene.emotion?.primary || img.emotion || "happy",
        is_interview_question: img.is_interview_question || videoScene.scene_details?.is_interview_question || false,

        // 퍼포먼스 정보
        is_performance: img.is_performance || videoScene.scene_details?.is_performance || false,
        performance_type: img.performance_type || videoScene.scene_details?.performance_type || null,
        performance_phase: img.performance_phase || videoScene.scene_details?.performance_phase || null,
        performance_info: videoScene.performance_info || null,

        // ★★★ TTS 정보 (puppy-video-generator에서 전달) ★★★
        tts_info: videoScene.tts_info || {
          tts_enabled: !!(img.has_narration && !img.is_interview_question),
          tts_voice: null,
          voice_effect: null,
          dog_lip_sync: !!(img.has_narration && !img.is_interview_question),
        },

        // 씬 환경 정보
        scene_details: img.scene_details || videoScene.scene_details || {},
        scene_environment: videoScene.scene_environment || {},

        // 오디오 정보
        audio_details: img.audio_details || {},
      };
    });

    $.export("matched_scenes", scenes.length);

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
    // 3. Veo 3 프롬프트 (한국어 음성 지원)
    // =====================
    // puppy-video-generator.mjs가 veo_script_sample 형식의 JSON을 생성
    // 한국어 대사가 있는 경우 한국어 음성으로 생성되도록 프롬프트 수정

    // ★★★ 한국어 대사 길이 기반 duration 계산 (초당 약 5-6음절) ★★★
    const calculateDurationFromNarration = (narration, baseDuration, isInterviewQuestion = false) => {
      if (!narration) return baseDuration;

      // 한국어 음절 수 계산 (공백, 특수문자 제외)
      const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;

      // 인터뷰어 질문은 더 빠르게 말함 (초당 6음절), 강아지 대사는 느림 (초당 5음절)
      const syllablesPerSecond = isInterviewQuestion ? 6 : 5;
      const calculatedDuration = Math.ceil(syllableCount / syllablesPerSecond);

      // Veo 3 지원 duration: 4, 6, 8초
      if (calculatedDuration <= 4) return 4;
      if (calculatedDuration <= 6) return 6;
      return 8;
    };

    const getVeo3Prompt = (scene) => {
      // ★★★ 한국어 음성 지원 + 자막/텍스트 제거 (간결한 프롬프트) ★★★
      // 인터뷰어 대사는 dialogue.interviewer 우선 사용
      const narration = scene.dialogue?.interviewer || scene.narration || scene.dialogue?.script || "";
      const hasKoreanDialogue = scene.has_narration && narration && !scene.is_interview_question;

      // 기본 프롬프트 (puppy-video-generator에서 생성된 것 또는 기본값)
      let basePrompt = scene.veo3_prompt || "8K cinematic video. Same puppy from reference image. Natural movements.";

      // ★★★ 깨진 한글/텍스트 제거 강조 (모든 씬에 적용) ★★★
      const noTextEmphasis = "IMPORTANT: No Korean text. No Chinese characters. No Japanese text. No Asian characters on any objects. No text on microphone. No text on props. No letters. No writing. Clean props without any text.";

      // ★★★ 퍼포먼스 씬 (비트박스 등) - BGM에 맞춰 입 움직임 ★★★
      const isPerformance = scene.is_performance || scene.scene_details?.is_performance;
      const perfInfo = scene.performance_info || {};
      const perfPhase = perfInfo.phase || scene.scene_details?.performance_phase;

      if (isPerformance && perfInfo.lip_sync_to === "bgm") {
        // 비트박스 퍼포먼스: BGM에 맞춰 입 움직임 (입모양 강조)
        basePrompt += ` Dog performing beatbox on stage. IMPORTANT: Mouth opens and closes frequently and visibly to the beat. Exaggerated mouth movements - wide open then closed repeatedly. Rapid lip sync mimicking beatbox sounds "boots and cats". Head bobbing, body grooving to rhythm. Cool confident energetic expression. Background audio: beatbox rhythmic music playing loudly.`;
      }

      // 한국어 대사가 있는 경우 (강아지가 말하는 씬)
      if (hasKoreanDialogue && !isPerformance) {
        const emotionTone = scene.emotion || "happy";

        // ★★★ Safety filter 회피 + 특수 음성 효과 처리 ★★★
        let safeNarration = narration;
        let voiceEffect = "";

        // "콩파민" - 빠른 기계음으로 처리
        if (narration.includes("콩파민")) {
          safeNarration = narration.replace(/콩파민/g, "Kong-pa-min");
          voiceEffect = " Fast robotic voice effect. Quick mechanical speech.";
        }

        // 간결한 한국어 음성 프롬프트 추가
        basePrompt += ` Dog speaks Korean dialogue with cute voice: "${safeNarration}". ${emotionTone} expression. Language: Korean. Lip sync to speech.${voiceEffect}`;
      }

      // ★★★ 퍼포먼스 브레이크 (콩파민 등 짧은 외침) ★★★
      if (isPerformance && perfPhase === "break" && narration) {
        let safeNarration = narration;
        if (narration.includes("콩파민")) {
          safeNarration = "Kong-pa-min";
        }
        // 빠른 기계음 외침
        basePrompt += ` Dog suddenly stops and shouts "${safeNarration}!" in fast robotic mechanical voice. Quick short exclamation. Dramatic pause moment. Confident smirk expression.`;
      }

      // 인터뷰어가 말하는 씬 (인터뷰 질문) - 강아지는 듣고만 있음, 마이크가 강아지 입 근처에 보임
      if (scene.is_interview_question && narration) {
        basePrompt += ` Off-screen Korean female interviewer voice says: "${narration}". A plain black microphone without any text or logos is held near the dog's mouth from the side, interview style. ${noTextEmphasis} Dog MUST keep mouth completely closed and still. No lip movement. No mouth opening. Dog only listens with curious expression, ears perked, slight head tilt. Mouth stays shut the entire time.`;
      }

      // ★★★ 모든 영상 마지막에 웃는 표정 ★★★
      basePrompt += ` IMPORTANT: At the end of the video, dog must show a happy smiling expression with a cute grin.`;

      // ★★★ 자막/텍스트 제거 (최종 강화) ★★★
      basePrompt += ` CRITICAL: No text. No subtitles. No captions. No watermarks. No on-screen text of any kind. ${noTextEmphasis}`;

      return basePrompt;
    };

    // ★★★ Duration 계산 함수 (대사 길이 고려) ★★★
    const getOptimalDuration = (scene) => {
      // 인터뷰어 대사는 dialogue.interviewer 우선 사용
      const narration = scene.dialogue?.interviewer || scene.narration || scene.dialogue?.script || "";
      const baseDuration = scene.duration || 6;
      const isInterviewQuestion = scene.is_interview_question || scene.scene_details?.is_interview_question;

      if (narration && scene.has_narration) {
        return calculateDurationFromNarration(narration, baseDuration, isInterviewQuestion);
      }

      // 기본 정규화
      if (baseDuration <= 4) return 4;
      if (baseDuration <= 6) return 6;
      return 8;
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
    // 5. 요청 제출 (순차)
    // =====================
    const REQUEST_DELAY_MS = 3000;

    const submitAllRequests = async (items) => {
      const operations = [];

      for (let i = 0; i < items.length; i++) {
        $.export(`submit_progress`, `Submitting scene ${i + 1}/${items.length}...`);

        const scene = items[i];
        try {
          if (!scene.image_url) {
            operations.push({ index: i, error: `Scene ${i + 1} has no image URL`, scene });
            continue;
          }

          // Veo 3 프롬프트 (puppy-video-generator에서 생성된 것 사용)
          const prompt = getVeo3Prompt(scene);
          $.export(`prompt_${i}`, prompt.substring(0, 200));

          // 이미지 다운로드 후 base64 변환
          const imageResponse = await axios($, {
            method: "GET",
            url: scene.image_url,
            responseType: "arraybuffer",
          });
          const imageBase64 = Buffer.from(imageResponse).toString("base64");
          const mimeType = scene.image_url.toLowerCase().includes(".jpg") ? "image/jpeg" : "image/png";

          // Duration 계산 (대사 길이 고려하여 최적화)
          const duration = getOptimalDuration(scene);
          const apiKey = apiKeys[currentApiKeyIndex];
          const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

          // Veo 3 요청
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
            operations.push({ index: i, operationName, apiKey, scene, prompt, duration });
            $.export(`operation_${i}`, operationName);
          }

        } catch (error) {
          const errorMsg = error.message || String(error);
          const status = error.response?.status;

          // 쿼터 초과 확인
          const isQuotaError = status === 429 || errorMsg.includes("RESOURCE_EXHAUSTED");

          if (isQuotaError && currentApiKeyIndex < apiKeys.length - 1) {
            currentApiKeyIndex++;
            $.export(`api_key_switch_${i}`, `Switched to API key ${currentApiKeyIndex + 1}`);
            i--;
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }

          // 안전 필터 에러 확인
          const isSafetyError = errorMsg.includes("raiMediaFiltered") || errorMsg.includes("safety");
          if (isSafetyError && !scene._simplified) {
            scene._simplified = true;
            i--;
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          // 1회 재시도
          if (!scene._retried) {
            scene._retried = true;
            i--;
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }

          operations.push({ index: i, error: errorMsg.substring(0, 200), scene });
        }

        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }
      return operations;
    };

    // =====================
    // 6. 완료 대기 (병렬)
    // =====================
    const waitForAllOperations = async (operations) => {
      $.export(`polling_status`, `Waiting for ${operations.filter(o => o.operationName).length} videos...`);

      const pollOperation = async (op) => {
        if (op.error) {
          return { success: false, index: op.index, error: op.error, narration: op.scene?.narration };
        }

        const { operationName, apiKey, scene, prompt, index, duration } = op;
        let attempts = 0;
        const maxAttempts = 72;

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
                return { success: false, index, error: statusResponse.error.message, narration: scene.narration };
              }

              const response = statusResponse.response;
              const genVideoResp = response?.generateVideoResponse;

              // 안전 필터 체크
              const raiFiltered = genVideoResp?.raiMediaFilteredCount || 0;
              if (raiFiltered > 0) {
                return { success: false, index, error: "Safety filtered", narration: scene.narration };
              }

              // 비디오 URL 추출
              let videoUrl = null;
              if (genVideoResp?.generatedSamples?.length > 0) {
                videoUrl = genVideoResp.generatedSamples[0].video?.uri;
              } else if (genVideoResp?.generatedVideos?.length > 0) {
                videoUrl = genVideoResp.generatedVideos[0].video?.uri;
              } else if (response?.generatedVideos?.length > 0) {
                videoUrl = response.generatedVideos[0].video?.uri;
              }

              // gs:// → https:// 변환
              if (videoUrl?.startsWith("gs://")) {
                const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
                if (gsMatch) {
                  videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
                }
              }

              if (!videoUrl) {
                return { success: false, index, error: "No video URL", narration: scene.narration };
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
              const filename = `scene_${String(index).padStart(3, "0")}.mp4`;
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
                duration: duration,

                // veo_script_sample 형식 필드
                title: scene.title,
                resolution: scene.resolution,
                dialogue: scene.dialogue,
                voice_settings: scene.voice_settings,
                visual_continuity: scene.visual_continuity,
                lip_sync_style: scene.lip_sync_style,
                consistency_check: scene.consistency_check,
                output: scene.output,

                // 대사 정보
                narration: scene.narration,
                narration_english: scene.narration_english,
                has_narration: scene.has_narration,
                speaker: scene.speaker,
                character_name: scene.character_name,

                // 씬 타입 정보
                scene_type: scene.scene_type,
                emotion: scene.emotion,
                is_interview_question: scene.is_interview_question,

                // 퍼포먼스 정보
                is_performance: scene.is_performance,
                performance_type: scene.performance_type,
                performance_phase: scene.performance_phase,
                performance_info: scene.performance_info,

                // ★★★ TTS 정보 ★★★
                tts_info: scene.tts_info,

                // 기타
                has_audio: true,
                prompt: prompt.substring(0, 300),
              };
            }
          } catch (pollError) {
            // 폴링 에러는 무시하고 재시도
          }
        }

        return { success: false, index, error: "Timeout", narration: scene.narration };
      };

      return Promise.all(operations.map(pollOperation));
    };

    $.export("status", `Generating ${scenes.length} videos with Veo 3...`);

    // 요청 제출
    const operations = await submitAllRequests(scenes);
    $.export("submitted", `${operations.filter(o => o.operationName).length}/${scenes.length} submitted`);

    // 완료 대기
    const results = await waitForAllOperations(operations);
    results.sort((a, b) => a.index - b.index);

    const successVideos = results.filter(r => r.success);
    const failedVideos = results.filter(r => !r.success);

    // 총 duration 계산
    const totalDuration = successVideos.reduce((sum, v) => sum + (v.duration || 0), 0);

    $.export("$summary", `Generated ${successVideos.length}/${scenes.length} videos (${totalDuration}s)`);

    // veo_script_sample 형식의 메타데이터 추출
    const globalVoiceSettings = videoGenData.voice_settings || {};
    const interviewBackground = videoGenData.interview_background || null;
    const overallStyle = videoGenData.overall_style || "photorealistic";

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      model: MODEL_ID,
      total_videos: successVideos.length,
      total_duration_seconds: totalDuration,
      failed_count: failedVideos.length,

      // 콘텐츠 타입 정보
      content_type: contentType,
      content_type_config: contentTypeConfig,
      script_format: scriptFormat,

      // 캐릭터/BGM 정보
      characters: characters,
      bgm: bgmInfo,

      // veo_script_sample 글로벌 설정
      resolution: "8K",
      format: "Clean video only",
      overall_style: overallStyle,
      voice_settings: globalVoiceSettings,
      interview_background: interviewBackground,

      // 출력 설정 (veo_script_sample 형식)
      output_settings: {
        format: "Clean video only",
        text_overlays: false,
        subtitles: false,
        captions: false,
        watermarks: false,
      },

      // 결과
      videos: successVideos,
      failed: failedVideos,
      video_urls: successVideos.map(v => v.url),

      // 원본 스크립트 참조
      script_reference: videoGenData.script_reference || {},
    };
  },
});
