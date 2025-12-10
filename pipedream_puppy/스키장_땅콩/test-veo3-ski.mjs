/**
 * 스키장 땅콩 - Veo 3 영상 생성 테스트 (Enhanced Version)
 * veo3-video-generator.mjs 로직 기반으로 개선됨
 *
 * 주요 기능:
 * - 동작/입모양/립싱크 상세 반영
 * - 텍스트/워터마크 완전 제거 강조
 * - 한글 대사 → 영어 액션 매핑
 * - 음절별 립싱크 타이밍
 *
 * 사용법:
 *   node test-veo3-ski.mjs [씬번호]
 *   예: node test-veo3-ski.mjs 1    (1번 씬만 생성)
 *       node test-veo3-ski.mjs      (전체 씬 목록 출력)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// 스크립트 로드
const scriptPath = path.join(__dirname, 'script', 'vedio_script.json');
const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
// 스크립트 구조: $return_value.scenes 배열 사용
const scenes = scriptData.$return_value?.scenes || [];
const characters = scriptData.$return_value?.characters || {};
const voiceSettings = scriptData.$return_value?.voice_settings || {};

// 이미지 폴더
const imageDir = path.join(__dirname, 'image');
const outputDir = path.join(__dirname, 'video');

// 출력 폴더 생성
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// =====================================================
// 텍스트/워터마크 금지 프롬프트 (최강화 버전)
// =====================================================
const NO_TEXT_EMPHASIS = `STRICTLY FORBIDDEN - NO TEXT ALLOWED:
- no subtitles
- no captions
- no text overlay
- no Korean characters
- no letters
- no words
- no writing
- no watermarks
Clean video only. Audio speech only. Text-free output required.`;

// =====================================================
// 액션 키워드 매핑 (한글 대사 → 영어 동작)
// =====================================================
const ACTION_KEYWORD_MAP = {
  // 춤/흔들기
  "핫팩 댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
  "핫팩댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
  "댄스": "dancing energetically with body moving rhythmically",
  "춤추": "dancing happily with cute moves",
  "춤을": "dancing with adorable swaying motions",
  "춤": "dancing with cute body movements",
  "흔들흔들": "swaying body side to side playfully",
  "흔들": "swaying body gently",

  // 점프/뛰기
  "폴짝폴짝": "hopping repeatedly with joy, bouncing up and down energetically",
  "폴짝": "hopping cutely, bouncing with excitement",
  "뛰어다": "running and jumping around playfully",
  "뛰어": "jumping excitedly with energy",
  "점프": "jumping up high with enthusiasm",
  "깡충깡충": "hopping like a bunny, bouncing cutely",
  "깡충": "bouncing hop, cute jumping motion",
  "펄쩍": "leaping up suddenly, big jump",

  // 회전/돌기
  "빙글빙글": "spinning around playfully, twirling in circles",
  "빙글": "spinning in a circle, cute twirl",
  "돌아가": "turning around in circles",
  "돌아": "turning motion, spinning",
  "회전": "spinning in place, rotating playfully",

  // 꼬리
  "꼬리 흔": "wagging tail happily and energetically",
  "꼬리를 흔": "wagging tail with excitement",
  "꼬리가 흔": "tail wagging automatically with joy",
  "살랑살랑": "swaying tail or body gently, soft wagging",

  // 달리기
  "달려": "running forward quickly with excitement",
  "뛰어가": "running towards something eagerly",
  "달리": "running with speed",

  // 구르기/눕기
  "뒹굴뒹굴": "rolling around playfully on the ground",
  "뒹굴": "rolling over cutely",
  "앉아": "sitting down cutely",
  "누워": "lying down comfortably",
  "일어나": "standing up, getting up energetically",
  "벌떡": "jumping up suddenly, getting up quickly",

  // 제스처
  "박수": "clapping front paws together cutely",
  "손 흔들": "waving paw in greeting",
  "동동": "stomping or tapping feet cutely",
  "고개를 갸웃": "tilting head cutely to the side",
  "갸웃": "cute head tilt, curious pose",
  "하품": "yawning adorably",
  "기지개": "stretching body, doing a stretch",
  "부르르": "shaking body, shivering motion",

  // 기쁨/축하
  "신나서": "standing on hind legs with front paws raised high in celebration, cheering pose",
  "신나": "jumping up with front paws raised high, ecstatic celebration",
  "올레": "raising front paws high in victory, celebrating enthusiastically",
  "만세": "standing on hind legs with both paws up, hooray pose",
  "아싸": "pumping fist (or paw) in the air, celebrating success",
  "야호": "jumping with paws up in the air, shouting with joy",

  // 웃음
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

  // 넘어짐/충격
  "콰당": "falling down dramatically, tumbling over with legs in the air, comedic collapse",
  "털썩": "flopping down exhausted, collapsing dramatically",
  "푸욱": "face planting into ground, falling forward",
  "데굴데굴": "rolling on the ground, tumbling around",
  "헉": "shocked freeze, wide eyes with jaw dropped",

  // 스키 관련 (추가)
  "스키": "skiing down the slope with proper ski stance",
  "엉덩이": "sliding on bottom/butt, butt-skiing down the slope",
  "미끄러": "sliding smoothly, gliding motion",
  "눈": "playing in the snow, snow interaction",
  "눈싸움": "throwing snowballs playfully",
  "눈사람": "building a snowman",
};

// =====================================================
// 감정별 표정 매핑
// =====================================================
const EMOTION_EXPRESSIONS = {
  happy: "happy cheerful expression with bright sparkling eyes and cute smile",
  sad: "sad melancholic expression with droopy ears and teary eyes",
  angry: "angry frustrated expression with furrowed brows",
  scared: "scared worried expression with wide eyes and lowered ears",
  excited: "excited enthusiastic expression with sparkling eyes and perked ears",
  surprised: "surprised shocked expression with wide open eyes and raised eyebrows",
  worried: "worried anxious expression with furrowed brow",
  determined: "determined confident expression with focused eyes",
  proud: "proud confident expression with slight smirk and chin up",
  nervous: "nervous anxious expression with slight trembling",
  curious: "curious interested expression with head tilted and perked ears",
};

// =====================================================
// 감정별 음성 톤 매핑
// =====================================================
const EMOTION_VOICE_TONE = {
  happy: "happy cheerful voice tone, bright and joyful",
  sad: "sad melancholic voice tone with sorrow",
  angry: "angry frustrated voice tone with intensity",
  scared: "scared trembling voice tone with fear",
  excited: "excited enthusiastic voice tone with energy, sparkling",
  surprised: "surprised shocked voice tone",
  worried: "worried anxious voice tone",
  determined: "determined strong confident voice tone",
  proud: "proud confident tone with slight smugness",
  nervous: "nervous shaky voice tone",
  curious: "curious inquisitive voice tone",
};

// =====================================================
// 한글 입모양 매핑 (립싱크용)
// =====================================================
const KOREAN_MOUTH_SHAPES = `KOREAN MOUTH SHAPES for accurate lip sync:
- 아/야/가/나/다/라/마/바/사/자/차/카/타/파/하 = mouth wide OPEN, jaw drops down
- 오/요/고/노/도/로/모/보/소/조/초/코/토/포/호 = lips form small round O shape
- 우/유/구/누/두/루/무/부/수/주/추/쿠/투/푸/후 = lips round forward, pursed
- 이/의/기/니/디/리/미/비/시/지/치/키/티/피/히 = lips stretch sideways, wide smile shape
- 에/예/게/네/데/레/메/베/세/제/체/케/테/페/헤 = mouth slightly open, relaxed
- 으 = lips slightly parted, neutral position`;

// =====================================================
// 대사에서 액션 감지
// =====================================================
function detectActionsFromNarration(narration) {
  if (!narration) return [];
  const detected = [];
  const sortedKeywords = Object.keys(ACTION_KEYWORD_MAP).sort((a, b) => b.length - a.length);
  for (const keyword of sortedKeywords) {
    if (narration.includes(keyword)) {
      detected.push({ keyword, action: ACTION_KEYWORD_MAP[keyword] });
    }
  }
  return detected;
}

// =====================================================
// 음절별 립싱크 타이밍 생성
// =====================================================
function buildSyllableLipSyncTiming(narration, duration) {
  if (!narration) return "";

  // 한글 음절만 추출
  const koreanChars = narration.replace(/[^가-힣]/g, "").split("");
  const syllableCount = koreanChars.length;
  if (syllableCount === 0) return "";

  // 초당 음절 수 계산 (보통 5-6 음절/초)
  const syllablesPerSecond = Math.max(3, Math.min(7, syllableCount / (duration - 0.5)));

  // 시간 구간별로 그룹화 (0.5초 단위)
  const segments = [];
  const segmentDuration = 0.5;

  for (let segStart = 0.5; segStart < duration; segStart += segmentDuration) {
    const segEnd = Math.min(segStart + segmentDuration, duration);
    const startIdx = Math.floor((segStart - 0.5) * syllablesPerSecond);
    const syllablesInSeg = Math.floor((segEnd - segStart) * syllablesPerSecond);
    const endIdx = Math.min(startIdx + syllablesInSeg, syllableCount);

    const segChars = koreanChars.slice(startIdx, endIdx).join("");
    if (segChars) {
      segments.push(`${segStart.toFixed(1)}-${segEnd.toFixed(1)}s: "${segChars}" (mouth moves matching syllables)`);
    }
  }

  // 웃음 표현 추가
  if (/흐흐+|하하+|웃음|ㅋㅋ/i.test(narration)) {
    segments.push(`${(duration - 0.5).toFixed(1)}-${duration}s: LAUGHING expression - mouth wide open, joyful giggling`);
  }

  return segments.join(". ");
}

// =====================================================
// Veo 3 프롬프트 생성 (JSON 구조 기반 - veo_script_sample 참고)
// =====================================================
function buildVeo3Prompt(scene) {
  // ★ 스크립트의 모든 관련 데이터 추출
  const sceneDetails = scene.scene_details || {};
  const lipSyncStyle = scene.lip_sync_style || {};
  const lipSyncTiming = scene.lip_sync_timing || {};
  const mouthShapes = scene.mouth_shapes || {};
  const visualContinuity = scene.visual_continuity || {};
  const videoPrompt = scene.video_prompt || {};
  const audioDetails = scene.audio_details || {};
  const ttsInfo = scene.tts_info || {};
  const dialogue = scene.dialogue || {};
  const consistencyCheck = scene.consistency_check || {};
  const interviewQuestionInfo = scene.interview_question_info || {};
  const actionsSummary = scene.actions_summary || {};

  // 대사 정보
  const characterName = sceneDetails.character_name || "땅콩";
  const narration = dialogue.script || dialogue[characterName] || "";
  const hasNarration = narration && narration.trim().length > 0;
  const duration = scene.duration_seconds || 6;
  const emotion = scene.emotion?.primary || sceneDetails.mood || "happy";

  // 캐릭터 정보 (스크립트에서 가져오기)
  const charAppearance = scene.character_appearance || {};
  const mainChar = characters.main || {};
  const furColor = charAppearance.fur_color || mainChar.fur_color || "golden cream with brown ears";
  const breed = charAppearance.breed || mainChar.breed || "Pomeranian";
  const accessories = charAppearance.accessories || mainChar.accessories || ["pink bow tie"];
  const characterDesc = `adorable ${furColor} fluffy ${breed} puppy with ${accessories.join(", ")}`;

  // ★ 립싱크 여부 판단
  const isInterviewQuestion = sceneDetails.scene_type === "interview_question" || lipSyncStyle.dog_speaks === false;
  const dogSpeaks = lipSyncStyle.dog_speaks === true && hasNarration && !isInterviewQuestion;

  // ★ JSON 구조 생성 (veo_script_sample 형식)
  const veoScript = {
    video: scene.video || 1,
    title: `스키장 땅콩 - 씬 ${scene.video}`,
    duration: `${duration} seconds`,
    resolution: "1080p",

    // 기본 프롬프트 (간략하게)
    prompt: `1080p cinematic interview video. Use the provided reference image as the exact visual base for the entire ${duration} seconds. A ${characterDesc} in a snowy ski resort setting. The dog appearance must stay identical to reference image from 0:00 to ${duration}:00. No text overlays. No subtitles. No captions. No watermarks.`,

    // 대사/타이밍 정보
    dialogue: {
      timing: {},
      audio_only: true
    },

    // 음성 설정
    voice_settings: {},

    // 시각적 일관성
    visual_continuity: {
      instruction: visualContinuity.instruction || `Same visual appearance for all ${duration} seconds`
    },

    // 립싱크 스타일
    lip_sync_style: {
      type: lipSyncStyle.type || "Subtle talking photo style",
      method: lipSyncStyle.method || "Minimal mouth animation on static image",
      dog_speaks: dogSpeaks
    },

    // 일관성 체크
    consistency_check: {
      fur_color: consistencyCheck.fur_color || `${furColor} must stay same at all times`,
      accessories: consistencyCheck.accessories || `${accessories.join(", ")} must be visible throughout`,
      background: "Ski resort background must look same throughout"
    },

    // 동작
    actions: {
      character_action: videoPrompt.character_action || "",
      body_movement: videoPrompt.body_movement || "",
      facial_expression: videoPrompt.facial_expression || EMOTION_EXPRESSIONS[emotion] || ""
    },

    // 출력 설정 (필수 금지 항목)
    output: {
      format: "Clean video only",
      text_overlays: false,
      subtitles: false,
      captions: false,
      watermarks: false
    },

    // ★ 필수 금지 항목 (CRITICAL)
    strictly_forbidden: {
      text: "NO text of any kind - no Korean, no English, no characters",
      subtitles: "NO subtitles or captions on screen",
      watermarks: "NO watermarks or logos",
      overlays: "NO text overlays or graphics"
    }
  };

  // ★ 대사/타이밍 설정 (인터뷰 질문 vs 답변)
  if (isInterviewQuestion && hasNarration) {
    // 인터뷰어 질문 씬 - 강아지 입 닫힘
    veoScript.dialogue.timing = {
      [`0.0_to_${duration}_sec`]: "Interviewer audio, dog mouth COMPLETELY CLOSED"
    };
    veoScript.dialogue.interviewer = narration;
    veoScript.dialogue.ddangkong_action = "Listening with closed mouth, gentle head nods only";

    veoScript.voice_settings.interviewer = {
      type: "Korean female news anchor, 30s, professional friendly tone"
    };

    veoScript.lip_sync_style = {
      type: "NO LIP SYNC - Dog is listening",
      method: "Dog mouth stays COMPLETELY CLOSED",
      dog_speaks: false,
      mouth_state: "CLOSED",
      allowed_movements: ["head_nod", "head_tilt", "ear_twitch", "eye_blink", "tail_wag"],
      forbidden_movements: ["mouth_open", "lip_movement", "jaw_movement", "tongue_visible"]
    };

    veoScript.visual_continuity[`0.0_to_${duration}_sec`] = {
      dog: "Same as reference, mouth CLOSED",
      mouth: "CLOSED - lips together, no opening",
      expression: interviewQuestionInfo.interviewee_expression || "curious, attentive, listening"
    };

  } else if (dogSpeaks) {
    // 강아지 대답 씬 - 립싱크 활성화
    const sceneVoiceSettings = scene.voice_settings?.[characterName] || voiceSettings.main || {};

    veoScript.dialogue.timing = lipSyncTiming || {
      "0.0_to_0.5_sec": "Silence, preparing to speak",
      [`0.5_to_${duration}_sec`]: "Ddangkong speaks with lip sync"
    };
    veoScript.dialogue.ddangkong = narration;
    veoScript.dialogue.audio_required = true; // ★ 음성 필수

    // ★ 음성 설정 (필수)
    veoScript.voice_settings.ddangkong = {
      type: sceneVoiceSettings.type || "Korean baby girl, 2-3 years old toddler voice",
      tone: audioDetails.voice_tone || emotion,
      characteristics: sceneVoiceSettings.characteristics || "very slow speech, cute baby talk",
      laugh_style: sceneVoiceSettings.laugh_style || "Adorable baby giggling",
      tts_voice: ttsInfo.tts_voice || "Korean baby toddler",
      audio_must_be_heard: true // ★ 음성 반드시 들려야 함
    };

    // ★ 립싱크 설정 (필수)
    veoScript.lip_sync_style.dog_speaks = true;
    veoScript.lip_sync_style.mouth_movement = lipSyncStyle.mouth_movement || "Small natural opening and closing matching Korean syllables";
    veoScript.lip_sync_style.face = "Keep same expression, only mouth area moves slightly";
    veoScript.lip_sync_style.lip_sync_required = true; // ★ 립싱크 필수

    // ★ mouth_shapes (필수 - 음절별 입모양)
    if (Object.keys(mouthShapes).length > 0) {
      veoScript.lip_sync_style.mouth_shapes = mouthShapes;
    } else {
      // 기본 한글 입모양 규칙
      veoScript.lip_sync_style.korean_mouth_rules = {
        "아/야/가/나/다/라/마/바/사": "mouth wide OPEN, jaw drops",
        "오/요/고/노/도/로/모/보/소": "lips form round O shape",
        "우/유/구/누/두/루/무/부/수": "lips round forward, pursed",
        "이/의/기/니/디/리/미/비/시": "lips stretch sideways, wide smile",
        "에/예/게/네/데/레/메/베/세": "mouth slightly open, relaxed"
      };
    }

    veoScript.visual_continuity["0.0_to_0.5_sec"] = {
      dog: "Same as reference",
      mouth: "Closed, preparing"
    };
    veoScript.visual_continuity[`0.5_to_${duration}_sec`] = {
      dog: "Same fur color, same face, same appearance",
      mouth: "Subtle open and close for lip sync - MUST MOVE",
      change_only: "Mouth movement for speaking",
      lip_sync_active: true
    };

  } else {
    // 대사 없는 씬
    veoScript.dialogue.timing = {
      [`0.0_to_${duration}_sec`]: "No dialogue, natural movement only"
    };

    veoScript.lip_sync_style = {
      type: "No lip sync",
      mouth_state: "CLOSED or natural",
      dog_speaks: false
    };
  }

  // ★ 카메라/배경 정보
  const sceneEnv = scene.scene_environment || sceneDetails || {};
  veoScript.camera = {
    movement: videoPrompt.camera_movement || sceneEnv.camera || "static",
    background: sceneEnv.background || sceneDetails.background || "Snowy ski resort",
    lighting: sceneEnv.lighting || sceneDetails.lighting || "Bright sunlight"
  };

  // ★ JSON을 문자열로 변환하여 프롬프트로 반환
  return JSON.stringify(veoScript, null, 2);
}

// Veo 3 API 호출
async function generateWithVeo3(imagePath, prompt, duration, apiKey) {
  console.log("\n=== Veo 3 요청 ===");
  console.log("Image:", imagePath);
  console.log("Duration:", duration, "초");
  console.log("\n--- 프롬프트 (상세) ---");
  console.log(prompt);
  console.log("--- 프롬프트 끝 ---\n");

  // 이미지 읽기
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = imagePath.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

  console.log("Image size:", imageBuffer.length, "bytes, MIME:", mimeType);

  const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      instances: [{
        prompt: prompt,
        image: {
          bytesBase64Encoded: imageBase64,
          mimeType: mimeType,
        },
      }],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: duration,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Veo 3 request failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log("Operation started:", data.name);

  // 완료 대기
  const operationName = data.name;
  let videoUrl = null;
  let attempts = 0;
  const maxAttempts = 72; // 6분 대기

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;

    const statusResponse = await fetch(`${VEO_BASE_URL}/${operationName}`, {
      headers: { "X-goog-api-key": apiKey },
    });

    const statusData = await statusResponse.json();

    if (statusData.done) {
      if (statusData.error) {
        throw new Error(`Veo 3 failed: ${statusData.error.message}`);
      }

      const result = statusData.response;

      // URL 추출
      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      } else if (result?.generatedVideos?.length > 0) {
        videoUrl = result.generatedVideos[0].video?.uri;
      }

      // gs:// → https://
      if (videoUrl?.startsWith("gs://")) {
        const match = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
        if (match) {
          videoUrl = `https://storage.googleapis.com/${match[1]}/${match[2]}`;
        }
      }

      break;
    }

    if (attempts % 6 === 0) {
      console.log(`Waiting... (${attempts * 5}s)`);
    }
  }

  return videoUrl;
}

// 영상 다운로드
async function downloadVideo(videoUrl, outputPath, apiKey) {
  console.log("Downloading video...");

  const response = await fetch(videoUrl, {
    headers: { "X-goog-api-key": apiKey },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const videoBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(videoBuffer));
  console.log("Video saved to:", outputPath);
  console.log("File size:", videoBuffer.byteLength, "bytes");

  return outputPath;
}

// 씬 목록 출력
function printSceneList() {
  console.log("\n=== 스키장 땅콩 씬 목록 (Enhanced Version) ===\n");
  console.log("총", scenes.length, "개 씬\n");

  scenes.forEach((scene, idx) => {
    const num = scene.video || idx + 1;
    const duration = scene.duration_seconds || 4;
    const speaker = scene.scene_details?.speaker || "main";
    const characterName = scene.scene_details?.character_name || "땅콩";
    const emotion = scene.emotion?.primary || "happy";
    const lipSync = scene.lip_sync_style?.dog_speaks ? "yes" : "no";
    const dialogue = scene.dialogue || {};
    const narrationText = dialogue.script || dialogue[characterName] || "";
    const narration = narrationText
      ? (narrationText.length > 40 ? narrationText.substring(0, 40) + "..." : narrationText)
      : "(대사 없음)";
    const imagePath = path.join(imageDir, `segment_number${num}.png`);
    const imageExists = fs.existsSync(imagePath) ? "✅" : "❌";

    // 감지된 액션
    const detectedActions = detectActionsFromNarration(narrationText);
    const actionStr = detectedActions.length > 0
      ? detectedActions.map(a => a.keyword).join(", ")
      : "(없음)";

    console.log(`[${num}] ${imageExists} ${duration}초 | ${characterName} | ${emotion} | 립싱크:${lipSync}`);
    console.log(`    대사: ${narration}`);
    console.log(`    감지된 액션: ${actionStr}`);
    console.log("");
  });

  console.log("사용법: node test-veo3-ski.mjs [씬번호]");
  console.log("  예: node test-veo3-ski.mjs 1");
}

// 특정 씬 생성
async function generateScene(sceneNumber) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  const scene = scenes.find(s => s.video === sceneNumber);

  if (!scene) {
    console.error(`씬 ${sceneNumber}을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const imagePath = path.join(imageDir, `segment_number${sceneNumber}.png`);

  if (!fs.existsSync(imagePath)) {
    console.error(`이미지를 찾을 수 없습니다: ${imagePath}`);
    process.exit(1);
  }

  const dialogue = scene.dialogue || {};
  const sceneDetails = scene.scene_details || {};
  const characterName = sceneDetails.character_name || "땅콩";
  const narrationText = dialogue.script || dialogue[characterName] || "";
  const duration = scene.duration_seconds || 6;

  console.log("\n" + "=".repeat(60));
  console.log(`씬 ${sceneNumber} 영상 생성 (Enhanced Version)`);
  console.log("=".repeat(60));

  console.log("\n씬 정보:");
  console.log("  Duration:", duration, "초");
  console.log("  캐릭터:", characterName);
  console.log("  Scene Type:", sceneDetails.scene_type || "interview_answer");
  console.log("  Emotion:", scene.emotion?.primary || "happy");
  console.log("  립싱크:", scene.lip_sync_style?.dog_speaks ? "yes" : "no");
  console.log("  대사:", narrationText || "(없음)");

  // 감지된 액션
  const detectedActions = detectActionsFromNarration(narrationText);
  if (detectedActions.length > 0) {
    console.log("  감지된 액션:", detectedActions.map(a => `${a.keyword} → ${a.action.substring(0, 30)}...`).join("\n                 "));
  }

  console.log("  이미지:", imagePath);

  // 프롬프트 생성 (Enhanced)
  const prompt = buildVeo3Prompt(scene);

  // 영상 생성
  try {
    const videoUrl = await generateWithVeo3(
      imagePath,
      prompt,
      duration,
      apiKey
    );

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      // 다운로드
      const outputPath = path.join(outputDir, `scene${sceneNumber}_veo3_enhanced.mp4`);
      await downloadVideo(videoUrl, outputPath, apiKey);

      console.log("\n완료!");
      return outputPath;
    } else {
      console.log("\n=== 실패: 비디오 URL을 받지 못함 ===");
    }
  } catch (error) {
    console.error("\n=== 에러 ===");
    console.error(error.message);
  }
}

// 메인
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 씬 목록 출력
    printSceneList();
  } else {
    // 특정 씬 생성
    const sceneNumber = parseInt(args[0], 10);

    if (isNaN(sceneNumber) || sceneNumber < 1 || sceneNumber > scenes.length) {
      console.error(`유효한 씬 번호를 입력해주세요 (1-${scenes.length})`);
      process.exit(1);
    }

    await generateScene(sceneNumber);
  }
}

main();
