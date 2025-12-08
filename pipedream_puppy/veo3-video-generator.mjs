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

    // ★★★ 특정 씬만 생성 (선택) ★★★
    scene_filter: {
      type: "string",
      label: "Scene Filter (Optional)",
      description: "특정 씬만 생성. 예: '0,2,4' 또는 '1-5' 또는 '0,3-6,9'. 비워두면 전체 생성.",
      optional: true,
    },
    manual_image_folder: {
      type: "string",
      label: "Manual Image Folder (GCS Path) - Optional",
      description: "이미지 생성 결과를 무시하고, 특정 GCS 폴더의 이미지를 사용하려면 입력하세요. (예: folder_name 또는 gs://bucket/folder_name). 파일명 순서대로 씬에 매핑됩니다.",
      optional: true,
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

    // =====================
    // 1-A. 수동 이미지 폴더 확인
    // =====================
    let manualImages = [];
    if (this.manual_image_folder) {
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const storage = google.storage({ version: "v1", auth });

      let bucketName = this.gcs_bucket_name;

      // ★★★ Smart Bucket Defaulting ★★★
      // If the current bucket is the default VIDEO output bucket (`shorts-videos...`), 
      // but we are looking for source IMAGES, default to the known IMAGE source bucket (`scene-image...`).
      // The user can still override this by including a bucket name in the path (e.g. "my-bucket/folder").
      if (bucketName === "shorts-videos-storage-mcp-test-457809") {
        bucketName = "scene-image-generator-storage-mcp-test-457809";
        $.export("status", `Defaulting manual image source to: ${bucketName}`);
      }

      let prefix = this.manual_image_folder;
      if (prefix.startsWith("gs://")) {
        const parts = prefix.replace("gs://", "").split("/");
        bucketName = parts[0];
        prefix = parts.slice(1).join("/");
      } else {
        // gs:// 없이 BucketName/Folder/Path 형식으로 입력했을 경우 처리 ("storage" 키워드 포함 시 버킷으로 간주)
        const parts = prefix.split("/");
        if (parts.length > 1) {
          const firstPart = parts[0];
          // 1. 현재 설정된 버킷명과 동일한 경우 (중복 입력)
          if (firstPart === this.gcs_bucket_name) {
            prefix = parts.slice(1).join("/");
          }
          // 2. 다른 버킷명인 경우 (프로젝트 규칙: "storage" 포함 가정)
          else if (firstPart.includes("storage") || firstPart.endsWith("457809")) {
            bucketName = firstPart;
            prefix = parts.slice(1).join("/");
            $.export("implicit_bucket_detected", bucketName);
          }
        }
      }
      if (!prefix.endsWith("/")) prefix += "/";

      $.export("status", `Listing images from ${bucketName}/${prefix}...`);

      try {
        const res = await storage.objects.list({ bucket: bucketName, prefix: prefix });
        const files = res.data.items || [];
        const imageFiles = files
          .filter(f => f.name.match(/\.(png|jpg|jpeg)$/i))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (imageFiles.length > 0) {
          manualImages = imageFiles.map((f, idx) => ({
            index: idx + 1,
            url: `https://storage.googleapis.com/${bucketName}/${f.name}`,
            filename: f.name.split('/').pop()
          }));
          $.export("manual_images_found", manualImages.length);
        } else {
          console.warn("No images found in manual folder.");
        }
      } catch (e) {
        throw new Error(`Manual image listing failed: ${e.message}`);
      }
    }

    // =====================
    // 1-B. Parsing Logic
    // =====================
    // images_data가 비어있어도 manual_image_folder가 있으면 통과
    if (!this.images_data && !manualImages.length) {
      throw new Error("images_data is empty AND no manual images found.");
    }

    let imagesData = {};
    if (this.images_data) {
      try {
        imagesData = typeof this.images_data === "string" ? JSON.parse(this.images_data) : this.images_data;
      } catch (e) {
        if (!manualImages.length) throw new Error(`Failed to parse images_data: ${e.message}`);
      }
    }

    let videoGenData;
    try {
      videoGenData = typeof this.video_generator_output === "string"
        ? JSON.parse(this.video_generator_output)
        : this.video_generator_output;
    } catch (e) {
      throw new Error(`Failed to parse video_generator_output: ${e.message}`);
    }

    // Image Scenes 결정 (수동 우선)
    const imageScenes = manualImages.length > 0 ? manualImages : (imagesData.scenes || []);
    const folderName = imagesData.folder_name || videoGenData.folder_name || (this.manual_image_folder ? this.manual_image_folder.replace(/\/$/, '') : "unknown_folder");

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
        resolution: videoScene.resolution || "1080p",

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
        // ★★★ narration_korean: 한글 자막용 (영어로 폴백하지 않음!) ★★★
        narration_korean: img.narration_korean || videoScene.dialogue?.script || "",
        narration_english: img.narration_english || videoScene.dialogue?.script_english || "",
        // ★★★ spoken_language: 영어 텍스트 자동 감지 ★★★
        spoken_language: (() => {
          if (img.spoken_language && img.spoken_language !== "korean") return img.spoken_language;
          const text = img.narration || "";
          const en = (text.match(/[a-zA-Z]/g) || []).length;
          const ko = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
          return en > ko * 2 && en > 10 ? "english" : (img.spoken_language || "korean");
        })(),
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

    // ★★★ 씬 필터링 (scene_filter가 지정된 경우) ★★★
    const parseSceneFilter = (filter) => {
      if (!filter || !filter.trim()) return null;
      const indexes = new Set();
      const parts = filter.split(",").map(p => p.trim());
      for (const part of parts) {
        if (part.includes("-")) {
          const [start, end] = part.split("-").map(n => parseInt(n.trim(), 10));
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) indexes.add(i);
          }
        } else {
          const num = parseInt(part, 10);
          if (!isNaN(num)) indexes.add(num);
        }
      }
      return indexes.size > 0 ? indexes : null;
    };

    const sceneFilterIndexes = parseSceneFilter(this.scene_filter);
    let filteredScenes = scenes;

    if (sceneFilterIndexes) {
      filteredScenes = scenes.filter(s => sceneFilterIndexes.has(s.index));
      $.export("scene_filter_applied", {
        filter: this.scene_filter,
        requested_indexes: Array.from(sceneFilterIndexes).sort((a, b) => a - b),
        matched_count: filteredScenes.length,
        original_count: scenes.length,
      });
    }

    $.export("matched_scenes", filteredScenes.length);

    // ★★★ 씬 자동 분할 (duration 기반 - puppy-video-generator에서 음절 기반으로 계산됨) ★★★
    // duration_seconds > 8 이면 분할 필요 (Veo 3 최대 8초)
    // duration_seconds 9-12 → 2분할, 13+ → 3분할
    let processedScenes = [];
    let splitCount = 0;
    for (const scene of filteredScenes) {
      const duration = scene.duration_seconds || scene.duration || 6;

      if (duration > 8) {
        // Duration이 너무 길면 분할 필요
        const splitResult = splitScene(scene);
        processedScenes.push(...splitResult);
        splitCount++;
        $.export(`auto_split_scene_${scene.index}`, `Duration: ${duration}초 > 8초 → Split into ${splitResult.length} parts`);
      } else {
        processedScenes.push(scene);
      }
    }

    if (splitCount > 0) {
      $.export("scenes_split_info", `${splitCount} scenes split (total: ${processedScenes.length} videos)`);
    }

    // Use processedScenes instead of filteredScenes for remaining processing
    filteredScenes = processedScenes;

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

    // ★★★ 씬 분할 기능 (대사 길이에 따라 2개 또는 3개로 동적 분할) ★★★
    // Veo 3는 4, 6, 8초만 지원. 4초 = 안정적인 립싱크
    // 20음절/4초 = 5음절/초 기준
    // 40음절 이상 → 2분할, 55음절 이상 → 3분할

    const shouldSplitScene = (narration) => {
      if (!narration) return false;
      const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
      return syllableCount > 20; // 20음절 이상 = 4초 이상 → 분할 검토
    };

    const splitScene = (scene) => {
      const fullNarration = scene.dialogue?.script || scene.narration || "";
      const syllableCount = fullNarration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
      const isInterviewQuestion = scene.scene_details?.is_interview_question || false;
      const syllablesPerSecond = isInterviewQuestion ? 6 : 5;

      // 분할 수 결정: 4초당 20음절 기준
      // 20-40음절 = 1개, 40-55음절 = 2개, 55+음절 = 3개
      let numParts = 1;
      if (syllableCount > 55) numParts = 3;
      else if (syllableCount > 40) numParts = 2;

      if (numParts === 1) {
        return [scene]; // No split needed
      }

      // Find split points
      const findSplitPoint = (text, targetPos) => {
        let point = text.indexOf('!', targetPos - 15);
        if (point === -1 || point > targetPos + 15) point = text.indexOf('.', targetPos - 15);
        if (point === -1 || point > targetPos + 15) point = text.indexOf(',', targetPos - 10);
        if (point === -1 || point > targetPos + 15) point = text.indexOf(' ', targetPos);
        if (point === -1) point = targetPos;
        return point;
      };

      const createScenePart = (narration, partLetter, originalScene) => {
        const scenePart = JSON.parse(JSON.stringify(originalScene));
        scenePart.narration = narration;
        scenePart.narration_korean = narration;
        if (scenePart.dialogue) {
          scenePart.dialogue.script = narration;
          scenePart.dialogue[originalScene.scene_details?.character_name || "땅콩"] = narration;
        }
        scenePart._split_part = partLetter;
        scenePart._original_index = originalScene.index;

        // Calculate duration for this part (4초 단위)
        const partSyllables = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
        scenePart.duration = 4; // 안정적인 립싱크를 위해 4초 고정
        scenePart.duration_seconds = 4;

        return scenePart;
      };

      if (numParts === 2) {
        const midPoint = Math.floor(fullNarration.length / 2);
        const splitPoint = findSplitPoint(fullNarration, midPoint);

        const narrationA = fullNarration.substring(0, splitPoint + 1).trim();
        const narrationB = fullNarration.substring(splitPoint + 1).trim();

        const sceneA = createScenePart(narrationA, 'a', scene);
        const sceneB = createScenePart(narrationB, 'b', scene);

        $.export(`split_scene_${scene.index}`, `Scene ${scene.index} split into 2: A="${narrationA.substring(0, 25)}..." B="${narrationB.substring(0, 25)}..."`);
        return [sceneA, sceneB];
      }

      // 3 parts
      const third1 = Math.floor(fullNarration.length / 3);
      const third2 = Math.floor(fullNarration.length * 2 / 3);
      const split1 = findSplitPoint(fullNarration, third1);
      const split2 = findSplitPoint(fullNarration, third2);

      const narrationA = fullNarration.substring(0, split1 + 1).trim();
      const narrationB = fullNarration.substring(split1 + 1, split2 + 1).trim();
      const narrationC = fullNarration.substring(split2 + 1).trim();

      const sceneA = createScenePart(narrationA, 'a', scene);
      const sceneB = createScenePart(narrationB, 'b', scene);
      const sceneC = createScenePart(narrationC, 'c', scene);

      $.export(`split_scene_${scene.index}`, `Scene ${scene.index} split into 3: A="${narrationA.substring(0, 20)}..." B="${narrationB.substring(0, 20)}..." C="${narrationC.substring(0, 20)}..."`);
      return [sceneA, sceneB, sceneC];
    };

    // ★★★ 액션 키워드 감지 및 매핑 (대사에서 동작 추출) ★★★
    const actionKeywordMap = {
      "핫팩 댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
      "핫팩댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
      "댄스": "dancing energetically with body moving rhythmically",
      "춤추": "dancing happily with cute moves",
      "춤을": "dancing with adorable swaying motions",
      "춤": "dancing with cute body movements",
      "흔들흔들": "swaying body side to side playfully",
      "흔들": "swaying body gently",
      "폴짝폴짝": "hopping repeatedly with joy, bouncing up and down energetically",
      "폴짝": "hopping cutely, bouncing with excitement",
      "뛰어다": "running and jumping around playfully",
      "뛰어": "jumping excitedly with energy",
      "점프": "jumping up high with enthusiasm",
      "깡충깡충": "hopping like a bunny, bouncing cutely",
      "깡충": "bouncing hop, cute jumping motion",
      "펄쩍": "leaping up suddenly, big jump",
      "빙글빙글": "spinning around playfully, twirling in circles",
      "빙글": "spinning in a circle, cute twirl",
      "돌아가": "turning around in circles",
      "돌아": "turning motion, spinning",
      "회전": "spinning in place, rotating playfully",
      "꼬리 흔": "wagging tail happily and energetically",
      "꼬리를 흔": "wagging tail with excitement",
      "꼬리가 흔": "tail wagging automatically with joy",
      "살랑살랑": "swaying tail or body gently, soft wagging",
      "달려": "running forward quickly with excitement",
      "뛰어가": "running towards something eagerly",
      "달리": "running with speed",
      "뒹굴뒹굴": "rolling around playfully on the ground",
      "뒹굴": "rolling over cutely",
      "앉아": "sitting down cutely",
      "누워": "lying down comfortably",
      "일어나": "standing up, getting up energetically",
      "벌떡": "jumping up suddenly, getting up quickly",
      "박수": "clapping front paws together cutely",
      "손 흔들": "waving paw in greeting",
      "동동": "stomping or tapping feet cutely",
      "고개를 갸웃": "tilting head cutely to the side",
      "갸웃": "cute head tilt, curious pose",
      "하품": "yawning adorably",
      "기지개": "stretching body, doing a stretch",
      "부르르": "shaking body, shivering motion",
      "신나서": "standing on hind legs with front paws raised high in celebration, cheering pose like saying ole",
      "신나": "jumping up with front paws raised high, ecstatic celebration",
      "올레": "raising front paws high in victory, celebrating enthusiastically",
      "만세": "standing on hind legs with both paws up, hooray pose",
      "아싸": "pumping fist (or paw) in the air, celebrating success",
      "야호": "jumping with paws up in the air, shouting with joy",
      // ★ 웃음 모션 추가 ★
      "웃음": "laughing out loud with mouth wide open, whole body shaking with laughter",
      "하하하": "laughing out loud with mouth open, whole body shaking with laughter",
      "하하": "laughing happily, open mouth smile",
      "호호호": "giggling cutely with paw covering mouth, refined laughter",
      "흐흐": "smirking slyly with slight grin, mischievous giggle",
      "흐흐흐": "smirking slyly with slight grin, playful mischievous giggle",
      "크크": "suppressed laughter, closed mouth smile",
      "끼끼": "high-pitched excited giggling, whole body shaking",
      "푸하하": "bursting out laughing, explosive laughter",
      "키득키득": "quiet giggling, shoulders bouncing with suppressed laughter",
      "콰당": "falling down dramatically, tumbling over with legs in the air, comedic collapse",
      "털썩": "flopping down exhausted, collapsing dramatically",
      "푸욱": "face planting into ground, falling forward",
      "데굴데굴": "rolling on the ground, tumbling around",
      "헉": "shocked freeze, wide eyes with jaw dropped",
    };

    const detectActionsFromNarration = (narration) => {
      if (!narration) return [];
      const detected = [];
      const sortedKeywords = Object.keys(actionKeywordMap).sort((a, b) => b.length - a.length);
      for (const keyword of sortedKeywords) {
        if (narration.includes(keyword)) {
          detected.push({ keyword, action: actionKeywordMap[keyword] });
        }
      }
      return detected;
    };

    // ★★★ 음절별 립싱크 타이밍 계산 함수 (NEW) ★★★
    const buildSyllableLipSyncTiming = (narration, duration, mouthShapes = {}) => {
      if (!narration) return "";

      // 한글 음절만 추출
      const koreanChars = narration.replace(/[^가-힣]/g, "").split("");
      const syllableCount = koreanChars.length;
      if (syllableCount === 0) return "";

      // 초당 음절 수 계산 (보통 5-7 음절/초, 느린 말투는 4-5)
      const syllablesPerSecond = Math.max(3, Math.min(7, syllableCount / (duration - 0.5)));
      const timePerSyllable = 1 / syllablesPerSecond;

      // 시간 구간별로 그룹화 (0.5초 단위)
      const segments = [];
      let currentTime = 0.5; // 0.5초는 침묵
      const segmentDuration = 0.5;

      for (let segStart = 0.5; segStart < duration; segStart += segmentDuration) {
        const segEnd = Math.min(segStart + segmentDuration, duration);
        const syllablesInSeg = Math.floor((segEnd - segStart) * syllablesPerSecond);
        const startIdx = Math.floor((segStart - 0.5) * syllablesPerSecond);
        const endIdx = Math.min(startIdx + syllablesInSeg, syllableCount);

        const segChars = koreanChars.slice(startIdx, endIdx).join("");
        if (segChars) {
          // 해당 음절들의 입모양 설명 추출
          const mouthDescs = [];
          for (const char of segChars.slice(0, 4)) { // 최대 4개
            if (mouthShapes[char]) {
              mouthDescs.push(`"${char}"=${mouthShapes[char]}`);
            }
          }
          segments.push(`${segStart.toFixed(1)}-${segEnd.toFixed(1)}s: "${segChars}" (${mouthDescs.join(", ") || "mouth moves matching syllables"})`);
        }
      }

      // 마지막에 웃음/감탄 표현이 있으면 추가
      if (/흐흐+|하하+|웃음/i.test(narration)) {
        segments.push(`${(duration - 1).toFixed(1)}-${duration}s: LAUGHING expression - mouth wide open, joyful giggling`);
      }

      return segments.join(". ");
    };

    const getVeo3Prompt = (scene) => {
      // ★★★ 기본 정보 추출 ★★★
      const narration = scene.dialogue?.script || scene.dialogue?.interviewer || scene.narration || "";
      const duration = scene.duration || 6;
      const speaker = scene.speaker || "main";
      const validCharacterSpeakers = ["main", "sub1", "sub2", "sub3"];
      const isInterviewerSpeaking = !validCharacterSpeakers.includes(speaker);
      const hasKoreanDialogue = scene.has_narration && narration && !isInterviewerSpeaking;

      // ★★★ 캐릭터 정보 ★★★
      const visibleCharacterKey = scene.interview_question_info?.visible_character || speaker;
      const speakerCharacter = characters[visibleCharacterKey] || characters[speaker] || {};
      const characterType = speakerCharacter.character_type || "animal";
      const isAnimalCharacter = characterType === "animal";

      // 캐릭터 상세 설명 (veo_script_sample 형식: 털 색상, 질감, 액세서리 상세)
      const getCharacterDescription = () => {
        const char = speakerCharacter;
        if (isAnimalCharacter) {
          const breed = char.breed || "dog";
          const furColor = char.fur_color || char.color || "fluffy";
          const furTexture = char.fur_texture || "fluffy";
          const accessories = char.accessories?.length ? char.accessories.join(", ") : "";
          const costume = char.costume || "";
          let desc = `${furColor} ${furTexture} ${breed}`;
          if (costume) desc += ` wearing ${costume}`;
          else if (accessories) desc += ` wearing ${accessories}`;
          return desc.trim();
        } else {
          const age = char.estimated_age_range || "";
          const gender = char.gender || "";
          const clothing = char.clothing || "";
          return `${age} ${gender} person${clothing ? ` wearing ${clothing}` : ""}`.trim();
        }
      };
      const characterDesc = getCharacterDescription();

      // ★★★ 타이밍 계산 (veo_script_sample 형식: 0-1초 침묵, 1-X초 인터뷰어, X-끝 캐릭터) ★★★
      const silenceEnd = 1.0;
      const interviewerEnd = isInterviewerSpeaking ? duration : Math.min(duration * 0.4, 3.5);
      const characterSpeechStart = isInterviewerSpeaking ? duration : interviewerEnd;
      const characterSpeechEnd = duration;

      // ★★★ 감정/표정 정보 ★★★
      const emotion = scene.emotion || "happy";
      const emotionExpressions = {
        happy: "happy cheerful expression with bright eyes",
        sad: "sad melancholic expression with droopy ears and teary eyes",
        angry: "angry frustrated expression with furrowed brows",
        scared: "scared worried expression with wide eyes and lowered ears",
        excited: "excited enthusiastic expression with sparkling eyes and perked ears",
        surprised: "surprised shocked expression with wide open eyes",
        worried: "worried anxious expression with furrowed brow",
        determined: "determined confident expression with focused eyes",
        proud: "proud confident expression with slight smirk and chin up",
      };
      const emotionDesc = emotionExpressions[emotion] || "natural expression";

      // ★★★ 첫 씬(Hook Scene) 여부 확인 ★★★
      const isHookScene = scene.is_hook_scene || scene.thumbnail_optimized || scene.index === 0;

      // ★★★ veo_script_sample 형식 기반 기본 프롬프트 ★★★
      let basePrompt = `[CRITICAL: ABSOLUTELY NO TEXT, NO SUBTITLES, NO CAPTIONS, NO WRITTEN CHARACTERS OF ANY KIND VISIBLE IN VIDEO] 1080p cinematic ${scriptFormat === "interview" ? "interview " : ""}video. Generate ONLY clean video with ZERO text on screen. Use the provided reference image as the exact visual base for the entire ${duration} seconds.`;

      // ★★★ 첫 씬 Hook 강조 (쇼츠 썸네일 역할) ★★★
      if (isHookScene) {
        basePrompt += ` [HOOK SCENE - THUMBNAIL IMPACT] This is the FIRST scene that viewers see - make it visually STRIKING and attention-grabbing! EXTREME CLOSE-UP of face, BRIGHT vibrant colors, HIGH CONTRAST, expressive sparkling eyes, dynamic engaging composition.`;
      }

      // 캐릭터 외형 설명
      basePrompt += ` A ${characterDesc} ${isAnimalCharacter ? "sits facing camera" : "faces camera"}.`;

      // ★★★ 시각적 연속성 (veo_script_sample visual_continuity 형식) ★★★
      basePrompt += ` The ${isAnimalCharacter ? "dog" : "character"} appearance must stay IDENTICAL to reference image from 0:00 to 0:0${duration}.`;
      basePrompt += ` VISUAL CONTINUITY: Same ${isAnimalCharacter ? "fur color, same face, same" : ""} appearance at 0:00, ${Math.floor(duration / 2)}:00, and ${duration}:00.`;

      // ★★★ 캐릭터 타입에 따른 일관성 프롬프트 (consistency_check 형식) ★★★
      if (isAnimalCharacter) {
        basePrompt += ` CONSISTENCY CHECK: ${characterDesc.split(" ")[0]} fur color must stay same throughout. No morphing. No distortion. No warping of face or body.`;
      } else {
        basePrompt += ` CONSISTENCY CHECK: Same clothing, same face throughout. No morphing. No distortion.`;
      }

      // ★★★ 깨진 한글/텍스트 제거 강조 (모든 씬에 적용) ★★★
      const noTextEmphasis = `ABSOLUTE CRITICAL RULE - NO TEXT ON SCREEN:
- NEVER generate subtitles or captions under any circumstance
- NEVER show ANY text, letters, characters, symbols, or writing visible in the video frame
- NEVER display Korean hangul characters (한글) on screen
- NEVER display Chinese characters on screen
- NEVER display Japanese characters on screen
- NEVER display English letters or words on screen
- NEVER display ANY garbled, corrupted, or broken text artifacts
- NEVER display random symbols that look like corrupted text
- NEVER add text overlays, watermarks, or labels
- NEVER show dialogue/speech as visible text
- NO text on microphone, props, clothing, or background
- The video must be 100% clean with ZERO text visible anywhere
- All dialogue is AUDIO ONLY - spoken words must never appear as text
- If you see ANY text appearing, regenerate without it
VIDEO MUST BE COMPLETELY TEXT-FREE.`;

      // ★★★ Safety Filter 회피를 위한 대사 순화 함수 ★★★
      const sanitizeNarration = (text) => {
        if (!text) return "";
        let safe = text;
        // 괄호 안 감정 표현 제거 (신나서), (당황), (분노) 등
        safe = safe.replace(/\([^)]*\)\s*/g, "");
        // 위험 단어 순화
        const replacements = [
          [/사생팬/g, "열성팬"], [/스토커/g, "팬"], [/유출/g, "공개"],
          [/가만 ?안 ?둬/g, "용서 못해"], [/죽[이여을]|죽겠/g, "혼내"],
          [/침해/g, "방해"], [/분노/g, "화남"], [/살인|살해/g, ""],
          [/폭력|폭행/g, ""], [/무서워/g, "놀라워"], [/공포/g, "놀람"],
          [/위협/g, "경고"], [/콩파민/g, "Kong-pa-min"],
        ];
        for (const [p, r] of replacements) safe = safe.replace(p, r);
        return safe.trim();
      };

      // ★★★ 퍼포먼스 씬 (비트박스 등) - BGM에 맞춰 입 움직임 ★★★
      const isPerformance = scene.is_performance || scene.scene_details?.is_performance;
      const perfInfo = scene.performance_info || {};
      const perfPhase = perfInfo.phase || scene.scene_details?.performance_phase;

      if (isPerformance && perfInfo.lip_sync_to === "bgm") {
        // 비트박스 퍼포먼스: BGM에 맞춰 입 움직임 (입모양 강조)
        basePrompt += ` ${characterDesc} performing beatbox on stage. IMPORTANT: Mouth opens and closes frequently and visibly to the beat. Exaggerated mouth movements - wide open then closed repeatedly. Rapid lip sync mimicking beatbox sounds "boots and cats". Head bobbing, body grooving to rhythm. Cool confident energetic expression. Background audio: beatbox rhythmic music playing loudly.`;
      }

      // ★★★ 한국어 대사가 있는 경우 - veo_script_sample 형식 (상세 립싱크 타이밍) ★★★
      if (hasKoreanDialogue && !isPerformance) {
        const emotionTone = scene.emotion || "happy";

        // Safety filter 회피 + 특수 음성 효과 처리
        const safeNarration = sanitizeNarration(narration);
        let voiceEffect = "";
        let endingExpression = "";

        // "콩파민" - 빠른 기계음으로 처리
        if (narration.includes("콩파민")) {
          voiceEffect = " Fast robotic voice effect. Quick mechanical speech.";
        }

        // ★★★ 웃음소리 패턴 - veo_script_sample scene3 형식 (상세 웃음 표현) ★★★
        if (/헤헤+|히히+|하하+|ㅎㅎ+|hehe|haha|호호+|흐흐+|크크+|ㅋㅋ+|푸하하/i.test(narration)) {
          endingExpression = isAnimalCharacter
            ? ` LAUGH EXPRESSION at end: Adorable soft baby giggling burst with LOW-PITCHED cooing sounds - eyes squint tight, whole face laughing, open happy laughing mouth showing teeth, can't stop laughing. Soft gentle baby chuckling. Rapid open-close-open mouth pattern for laughter. Uncontrollable cute infant giggling with low soft voice.`
            : " Shows warm laughing expression with natural wide smile and happy eyes.";
        }

        // ★★★ 울음소리 패턴 - 우는 표정 추가 ★★★
        if (/흑흑|엉엉|흐흑|ㅠㅠ|ㅜㅜ|훌쩍/i.test(narration)) {
          endingExpression = isAnimalCharacter
            ? " CRYING EXPRESSION: Sad crying face with watery teary eyes, droopy ears lowered down, furrowed sad eyebrows, whimpering look. Eyes glistening with tears. Looks very sad and upset."
            : " Shows sad expression with teary eyes and sorrowful look.";
        }

        // ★★★ 꼬리 흔들기 패턴 - veo_script_sample 형식 (동작 강조) ★★★
        if (/꼬리.*흔들|tail.*wag/i.test(narration) && isAnimalCharacter) {
          endingExpression += " TAIL WAG ACTION: Dog's tail wags happily and energetically back and forth throughout the scene. Visible excited tail wagging motion. Fast happy tail movement visible in frame.";
        }

        // ★★★ 고개 끄덕임/젓기 패턴 ★★★
        if (/고개.*끄덕|네네|넵|알겠/i.test(narration)) endingExpression += " HEAD NOD: Head moves up and down in agreement, nodding motion.";
        if (/고개.*저|아니|싫어|안 ?해/i.test(narration)) endingExpression += " HEAD SHAKE: Head moves side to side in disagreement.";

        // ★★★ 자신감/뿌듯함 패턴 (veo_script_sample scene2 훗 형식) ★★★
        if (/훗|흥|쯧|후후/i.test(narration)) {
          endingExpression += isAnimalCharacter
            ? " PROUD EXPRESSION at end: Proud smug look with slight nose up, confident smirk, short proud huff through nose. Baby superiority expression."
            : " Shows proud confident expression with slight smirk.";
        }

        // ★★★ 감정별 목소리 톤 매핑 (veo_script_sample voice_settings 형식) ★★★
        const emotionVoiceTone = {
          angry: "angry frustrated voice tone with intensity",
          sad: "sad melancholic voice tone with sorrow, slightly disappointed",
          scared: "scared trembling voice tone with fear",
          excited: "excited enthusiastic voice tone with energy, sparkling",
          happy: "happy cheerful voice tone, bright",
          surprised: "surprised shocked voice tone",
          worried: "worried anxious voice tone",
          determined: "determined strong confident voice tone",
          proud: "proud confident tone with slight smugness",
        };
        const voiceTone = emotionVoiceTone[emotionTone] || "natural expressive voice tone";

        // ★★★ puppy-video-generator에서 전달된 mouth_shapes 사용 ★★★
        const mouthShapes = scene.mouth_shapes || {};
        const mouthShapesDesc = Object.keys(mouthShapes).length > 0
          ? `MOUTH SHAPES FOR THIS DIALOGUE: ${Object.entries(mouthShapes).slice(0, 8).map(([char, desc]) => `${char}=${desc}`).join(", ")}.`
          : `KOREAN MOUTH SHAPES: 아/야/가 = mouth wide open jaw drops, 오/요/고 = lips form small round O, 우/유/구 = lips round forward, 이/의/기 = lips stretch sideways.`;

        // ★★★ puppy-video-generator에서 전달된 lip_sync_style 사용 ★★★
        const lipSyncStyle = scene.lip_sync_style || {};
        const lipSyncMethod = lipSyncStyle.method || "Minimal mouth animation on static image";
        const lipSyncType = lipSyncStyle.type || "Subtle talking photo style";

        // ★★★ puppy-video-generator에서 전달된 lip_sync_timing 사용 ★★★
        const lipSyncTiming = scene.lip_sync_timing || {};
        const timingDesc = Object.keys(lipSyncTiming).length > 0
          ? Object.entries(lipSyncTiming).map(([time, info]) => {
            if (typeof info === "object") return `${time}: ${info.mouth || info.text || ""}`;
            return `${time}: ${info}`;
          }).join(". ")
          : "";

        // ★★★ puppy-video-generator에서 전달된 voice_settings 사용 ★★★
        const sceneVoiceSettings = scene.voice_settings || {};
        const speakerVoice = sceneVoiceSettings[scene.character_name] || sceneVoiceSettings[speaker] || {};
        const voiceType = speakerVoice.type || (speaker === "main"
          ? "Korean baby infant voice, 1-2 years old, low-pitched adorable tone"
          : "natural Korean voice");
        const voiceCharacteristics = speakerVoice.characteristics || "babbling cooing speech with slight lisp";
        const laughStyle = speakerVoice.laugh_style || "adorable baby giggling";

        // ★★★ 대사에서 액션 감지 ★★★
        const detectedActions = detectActionsFromNarration(narration);
        const actionPrompt = detectedActions.length > 0
          ? ` IMPORTANT CHARACTER ACTION: ${characterDesc} is ${detectedActions.map(a => a.action).join(", ")} while speaking.`
          : "";

        // ★★★ 캐릭터 타입별 음성 + 립싱크 프롬프트 (puppy-video-generator 데이터 사용) ★★★
        // ★★★ NEW: 음절별 립싱크 타이밍 생성 ★★★
        const syllableTiming = buildSyllableLipSyncTiming(narration, duration, mouthShapes);

        if (isAnimalCharacter) {
          basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence dog waiting, ${characterSpeechStart}-${characterSpeechEnd}sec ${characterDesc.toLowerCase()} speaks Korean dialogue.`;
          basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): ${voiceType}, ${voiceCharacteristics}, ${voiceTone}: "${safeNarration}".`;
          basePrompt += actionPrompt; // ★ 감지된 액션 추가
          basePrompt += ` LIP SYNC STYLE: ${lipSyncType}. ${lipSyncMethod}. ${mouthShapesDesc}`;
          // ★★★ NEW: 음절별 상세 타이밍 추가 ★★★
          if (syllableTiming) {
            basePrompt += ` SYLLABLE-BY-SYLLABLE LIP SYNC TIMING: ${syllableTiming}.`;
          } else if (timingDesc) {
            basePrompt += ` TIMING DETAIL: ${timingDesc}.`;
          }
          basePrompt += ` CRITICAL: Dog's mouth MUST move continuously throughout speech, matching each Korean syllable precisely. Open-close-open pattern for continuous talking. Visible jaw movement. NOT static face. Do NOT regenerate dog image during speech.`;
          basePrompt += ` IMPORTANT: NO barking. NO woof sounds. Only super cute low-pitched baby Korean speech. ${emotionTone} expression. DO NOT show dialogue as text on screen.${voiceEffect}${endingExpression}`;
        } else {
          basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence, ${characterSpeechStart}-${characterSpeechEnd}sec speaks Korean: "${safeNarration}".`;
          basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): ${voiceType}. LIP SYNC: ${lipSyncType}. ${lipSyncMethod}. ${mouthShapesDesc}`;
          basePrompt += actionPrompt; // ★ 감지된 액션 추가
          if (timingDesc) basePrompt += ` TIMING: ${timingDesc}.`;
          basePrompt += ` DO NOT show dialogue as text on screen.${voiceEffect}${endingExpression}`;
        }
      }

      // ★★★ 퍼포먼스 브레이크 (콩파민 등 짧은 외침) ★★★
      if (isPerformance && perfPhase === "break" && narration) {
        const safeNarration = sanitizeNarration(narration);
        // 빠른 기계음 외침
        basePrompt += ` ${characterDesc} suddenly stops and shouts "${safeNarration}!" in fast robotic mechanical voice. Quick short exclamation. Dramatic pause moment. Confident smirk expression.`;
      }

      // ★★★ 인터뷰어가 말하는 씬 - veo_script_sample 형식 (상세 타이밍) ★★★
      // (speaker가 "interviewer"일 때만. main이 직접 질문하는 경우는 대사 처리됨)
      if (isInterviewerSpeaking && narration) {
        const safeInterviewerNarration = sanitizeNarration(narration);
        // veo_script_sample dialogue.timing 형식
        basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence ${isAnimalCharacter ? "dog" : "character"} waiting, ${silenceEnd}-${duration}sec interviewer audio with ${isAnimalCharacter ? "dog" : "character"} mouth CLOSED.`;

        if (isAnimalCharacter) {
          // veo_script_sample voice_settings.interviewer 형식
          basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): Off-screen Korean female news anchor 30s, professional friendly tone says: "${safeInterviewerNarration}". DO NOT show this dialogue as text or subtitles on screen.`;
          // 마이크 설명 (텍스트 완전 제거)
          basePrompt += ` A simple plain solid BLACK microphone (completely clean surface, NO text, NO logos, NO labels, NO writing, NO Korean characters, NO markings whatsoever) is held near the ${characterDesc.toLowerCase()}'s mouth from the side, interview style.`;
          // 캐릭터 반응 (veo_script_sample visual_continuity 형식)
          basePrompt += ` ${characterDesc.toUpperCase()} LISTENING POSE: Mouth MUST stay completely CLOSED and STILL entire time. NO lip movement at all. NO mouth opening. Only listens with curious interested expression - ears perked up attentively, slight cute head tilt, bright curious eyes. Mouth stays SHUT from 0:00 to 0:0${duration}. IMPORTANT: Dog's mouth does NOT move during this scene.`;
        } else {
          basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): Off-screen Korean female interviewer professional friendly tone: "${safeInterviewerNarration}". DO NOT show this dialogue as text on screen.`;
          basePrompt += ` ${characterDesc} LISTENING POSE: Listens attentively with interested expression. Natural listening pose. Mouth stays CLOSED entire time - NO lip movement.`;
        }
      }

      // ★★★ 영상 마지막 표정 - veo_script_sample visual_continuity 형식 ★★★
      if (!isInterviewerSpeaking) {
        if (isAnimalCharacter) {
          basePrompt += ` ENDING EXPRESSION at ${duration}sec: ${characterDesc.toLowerCase()} must show a happy smiling expression with a cute grin, bright eyes.`;
        } else {
          basePrompt += ` ENDING EXPRESSION at ${duration}sec: ${characterDesc.toLowerCase()} must show a warm pleasant expression.`;
        }
      }

      // ★★★ OUTPUT 설정 (veo_script_sample output 형식) ★★★
      basePrompt += ` OUTPUT: Clean video only. ${noTextEmphasis}`;

      return basePrompt;
    };

    // ★★★ Duration 계산 함수 (대사 길이 고려) ★★★
    const getOptimalDuration = (scene) => {
      // dialogue.script 우선 사용, 그 다음 interviewer, 마지막으로 narration
      const narration = scene.dialogue?.script || scene.dialogue?.interviewer || scene.narration || "";
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
          const responseData = error.response?.data;

          // ★★★ 쿼터 초과 확인 (강화) ★★★
          const isQuotaError = status === 429 ||
            errorMsg.includes("RESOURCE_EXHAUSTED") ||
            errorMsg.includes("quota") ||
            errorMsg.includes("rate limit") ||
            responseData?.error?.code === 429 ||
            responseData?.error?.status === "RESOURCE_EXHAUSTED";

          if (isQuotaError) {
            $.export(`quota_error_${i}`, `Quota exceeded on API key ${currentApiKeyIndex + 1}: ${errorMsg.substring(0, 100)}`);

            if (currentApiKeyIndex < apiKeys.length - 1) {
              currentApiKeyIndex++;
              $.export(`api_key_switch_${i}`, `Switched to backup API key ${currentApiKeyIndex + 1}`);
              scene._retried = false; // 새 API 키로 재시도 횟수 리셋
              i--;
              await new Promise(r => setTimeout(r, 5000));
              continue;
            } else {
              // 모든 API 키 소진 - 30초 후 첫 번째 키로 재시도
              if (!scene._allKeysExhausted) {
                scene._allKeysExhausted = true;
                currentApiKeyIndex = 0;
                $.export(`all_keys_exhausted_${i}`, `All API keys exhausted, waiting 30s then retrying with key 1`);
                i--;
                await new Promise(r => setTimeout(r, 30000));
                continue;
              }
            }
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

              const bufferStream = new Readable({ read() { } });
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
                narration_korean: scene.narration_korean,  // ★ 한글 자막용
                narration_english: scene.narration_english,
                spoken_language: scene.spoken_language,  // ★ 캐릭터 언어
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

    $.export("status", `Generating ${filteredScenes.length} videos with Veo 3...`);

    // 요청 제출 (filteredScenes 사용)
    const operations = await submitAllRequests(filteredScenes);
    $.export("submitted", `${operations.filter(o => o.operationName).length}/${filteredScenes.length} submitted`);

    // 완료 대기
    const results = await waitForAllOperations(operations);
    results.sort((a, b) => a.index - b.index);

    const successVideos = results.filter(r => r.success);
    const failedVideos = results.filter(r => !r.success);

    // 총 duration 계산
    const totalDuration = successVideos.reduce((sum, v) => sum + (v.duration || 0), 0);

    $.export("$summary", `Generated ${successVideos.length}/${filteredScenes.length} videos (${totalDuration}s)${sceneFilterIndexes ? ` [filtered: ${this.scene_filter}]` : ""}`);

    // ★★★ 바이럴 타이틀 생성은 별도 단계(Puppy_Viral_Title_Generator)로 분리됨 ★★★

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

      // ★★★ 바이럴 타이틀은 별도 단계(Puppy_Viral_Title_Generator)에서 생성됨 ★★★

      // veo_script_sample 글로벌 설정
      resolution: "1080p",
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
