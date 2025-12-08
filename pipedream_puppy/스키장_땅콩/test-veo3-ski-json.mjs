/**
 * 스키장 땅콩 - Veo 3 영상 생성 테스트 (JSON 구조 버전)
 * veo_script_sample 형식 기반
 *
 * 필수 항목:
 * - 텍스트/자막/워터마크 금지
 * - 립싱크/입모양 (dog_speaks=true일 때)
 * - 음성 (voice_settings)
 *
 * 사용법:
 *   GEMINI_API_KEY=xxx node test-veo3-ski.mjs [씬번호]
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
const scenes = scriptData.$return_value?.scenes || [];
const characters = scriptData.$return_value?.characters || {};
const globalVoiceSettings = scriptData.$return_value?.voice_settings || {};

// 폴더 설정
const imageDir = path.join(__dirname, 'image');
const outputDir = path.join(__dirname, 'video');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// =====================================================
// 감정별 표정 매핑
// =====================================================
const EMOTION_EXPRESSIONS = {
  happy: "happy cheerful expression with bright sparkling eyes",
  sad: "sad melancholic expression with droopy ears",
  angry: "angry frustrated expression with furrowed brows",
  scared: "scared worried expression with wide eyes",
  excited: "excited enthusiastic expression with sparkling eyes",
  surprised: "surprised shocked expression with wide open eyes",
  embarrassed: "embarrassed shy expression, slightly blushing",
  worried: "worried anxious expression with furrowed brow",
  determined: "determined confident expression with focused eyes",
  proud: "proud confident expression with slight smirk",
  curious: "curious interested expression with head tilted",
};

// =====================================================
// 대사 키워드 기반 동작 감지
// =====================================================
function detectKeywordActions(narration) {
  if (!narration) return [];

  const actions = [];

  // 부끄러움 관련
  if (/부끄럽|부끄럽개|부끄러|창피|쑥스럽|민망/.test(narration)) {
    actions.push({
      keyword: "부끄러움",
      movements: [
        "covers face with both front paws shyly",
        "looks down avoiding eye contact",
        "ears flatten back against head",
        "body shrinks smaller, hunching shoulders",
        "turns head slightly to the side",
        "eyes dart away nervously then peek back"
      ],
      timing: "throughout the scene, especially when saying the shy words"
    });
  }

  // 웃음 관련
  if (/하하|헤헤|히히|호호|흐흐|ㅎㅎ|ㅋㅋ|웃/.test(narration)) {
    actions.push({
      keyword: "웃음",
      movements: [
        "whole body shakes with laughter",
        "eyes squint tight from laughing",
        "mouth opens wide showing teeth",
        "head tilts back while laughing"
      ]
    });
  }

  // 신남/기쁨 관련
  if (/신나|기뻐|좋아|야호|아싸|올레/.test(narration)) {
    actions.push({
      keyword: "기쁨",
      movements: [
        "jumps up excitedly",
        "tail wags energetically",
        "front paws raised in celebration",
        "bouncing with joy"
      ]
    });
  }

  // 슬픔/울음 관련
  if (/슬퍼|울|흑흑|엉엉|ㅠㅠ|ㅜㅜ/.test(narration)) {
    actions.push({
      keyword: "슬픔",
      movements: [
        "ears droop down sadly",
        "teary watery eyes",
        "head hangs low",
        "whimpering posture"
      ]
    });
  }

  // 놀람 관련
  if (/헉|깜짝|놀라|엇|어머/.test(narration)) {
    actions.push({
      keyword: "놀람",
      movements: [
        "eyes go wide suddenly",
        "ears perk up alert",
        "body freezes momentarily",
        "jumps back slightly startled"
      ]
    });
  }

  // 자랑/뿌듯 관련
  if (/자랑|뿌듯|대단|잘했|훗/.test(narration)) {
    actions.push({
      keyword: "자랑",
      movements: [
        "chin lifts up proudly",
        "chest puffs out",
        "smug confident smirk",
        "nose up in the air slightly"
      ]
    });
  }

  return actions;
}

// =====================================================
// JSON 스크립트 생성 (veo_script_sample 형식)
// =====================================================
function buildVeoScript(scene) {
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
  const detectedActions = scene.detected_actions || [];

  // 기본 정보
  const characterName = sceneDetails.character_name || "땅콩";
  const narration = dialogue.script || dialogue[characterName] || "";
  const hasNarration = narration && narration.trim().length > 0;
  const duration = scene.duration_seconds || 6;
  const emotion = scene.emotion?.primary || sceneDetails.mood || "happy";

  // 캐릭터 외형
  const charAppearance = scene.character_appearance || {};
  const mainChar = characters.main || {};
  const furColor = charAppearance.fur_color || mainChar.fur_color || "golden cream with brown ears";
  const breed = charAppearance.breed || mainChar.breed || "Pomeranian";
  const accessories = charAppearance.accessories || mainChar.accessories || ["ski goggles", "colorful ski suit"];
  const characterDesc = `adorable ${furColor} fluffy ${breed} puppy wearing ${accessories.join(", ")}`;

  // 특수 동작 (detected_actions에서 추출)
  const specialActions = detectedActions.map(a => a.action).join(", ");
  const characterAction = videoPrompt.character_action || "";
  const bodyMovement = videoPrompt.body_movement || "";
  const actionDescription = [characterAction, bodyMovement, specialActions].filter(Boolean).join(". ");

  // 립싱크 여부 판단
  const isInterviewQuestion = sceneDetails.scene_type === "interview_question" || lipSyncStyle.dog_speaks === false;
  const dogSpeaks = lipSyncStyle.dog_speaks === true && hasNarration && !isInterviewQuestion;

  // ★ 프롬프트 생성 (씬 타입별 분기)
  let basePrompt;
  if (isInterviewQuestion && hasNarration) {
    // 인터뷰어 질문 씬 - 강아지 입 완전히 닫힘
    basePrompt = `1080p cinematic video. A ${characterDesc} is ONLY LISTENING to off-screen interviewer voice in a snowy ski resort setting. CRITICAL: Dog mouth MUST stay COMPLETELY CLOSED throughout entire ${duration} seconds. NO lip movement. NO mouth opening. NO jaw movement. The dog shows gentle head nods, ear twitches, and curious listening expression while keeping mouth firmly closed. Use the provided reference image as the exact visual base. The dog appearance must stay identical to reference image. No text overlays. No subtitles. No captions. No watermarks.`;
  } else if (dogSpeaks) {
    // 강아지 대답 씬 - 립싱크
    basePrompt = `1080p cinematic video. A ${characterDesc} speaking in Korean in a snowy ski resort setting. The DOG speaks directly to camera with Korean baby infant voice, 2-3 years old, low-pitched adorable tone. NO interviewer. NO adult voice. NO off-screen voice. ONLY the baby puppy voice speaks.${actionDescription ? ` IMPORTANT ACTION: ${actionDescription}.` : ""} Use the provided reference image as the exact visual base for the entire ${duration} seconds. The dog appearance must stay identical to reference image. No text overlays. No subtitles. No captions. No watermarks.`;
  } else {
    // 기타 씬 (플래시백 등)
    basePrompt = `1080p cinematic video. Use the provided reference image as the exact visual base for the entire ${duration} seconds. A ${characterDesc} in a snowy ski resort setting.${actionDescription ? ` IMPORTANT ACTION: ${actionDescription}.` : ""} The dog appearance must stay identical to reference image from 0:00 to ${duration}:00. No text overlays. No subtitles. No captions. No watermarks.`;
  }

  // ★ JSON 구조 생성
  const veoScript = {
    video: scene.video || 1,
    title: `스키장 땅콩 - Scene ${scene.video}`,
    duration: `${duration} seconds`,
    resolution: "1080p",

    // 기본 프롬프트
    prompt: basePrompt,

    // 대사 정보
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
      character_action: characterAction,
      body_movement: bodyMovement,
      facial_expression: videoPrompt.facial_expression || EMOTION_EXPRESSIONS[emotion] || EMOTION_EXPRESSIONS.happy,
      keyword_actions: detectKeywordActions(narration), // ★ 대사 키워드 기반 동작
      detected_actions: detectedActions // ★ 스크립트에서 감지된 특수 동작
    },

    // 카메라/배경
    camera: {
      movement: videoPrompt.camera_movement || "static",
      background: sceneDetails.background || "Snowy ski resort",
      lighting: sceneDetails.lighting || "Bright sunlight"
    },

    // ★ 필수 금지 항목 (CRITICAL)
    strictly_forbidden: {
      text: "NO text of any kind - no Korean, no English, no characters",
      subtitles: "NO subtitles or captions on screen",
      watermarks: "NO watermarks or logos",
      overlays: "NO text overlays or graphics"
    },

    // 출력 설정
    output: {
      format: "Clean video only",
      text_overlays: false,
      subtitles: false,
      captions: false,
      watermarks: false
    }
  };

  // =====================================================
  // 씬 타입별 설정
  // =====================================================

  if (isInterviewQuestion && hasNarration) {
    // ★ 인터뷰어 질문 씬 - 강아지 입 닫힘
    veoScript.dialogue.timing = {
      [`0.0_to_${duration}_sec`]: "Interviewer audio plays, dog mouth stays COMPLETELY CLOSED"
    };
    veoScript.dialogue.interviewer = narration;
    veoScript.dialogue.ddangkong_action = "Listening with closed mouth, gentle head nods only";

    veoScript.voice_settings.interviewer = {
      type: "Korean female news anchor, 30s, professional friendly tone",
      audio_required: true
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
      dog: "Same as reference image, mouth CLOSED entire time",
      mouth: "CLOSED - lips together, no opening at all",
      expression: interviewQuestionInfo.interviewee_expression || "curious, attentive, listening intently"
    };

  } else if (dogSpeaks) {
    // ★ 강아지 대답 씬 - 립싱크 필수
    const sceneVoiceSettings = scene.voice_settings?.[characterName] || globalVoiceSettings.main || {};

    veoScript.dialogue.timing = lipSyncTiming || {
      "0.0_to_0.5_sec": "Silence, dog preparing to speak",
      [`0.5_to_${duration}_sec`]: "Dog speaks Korean with lip sync"
    };
    veoScript.dialogue[characterName] = narration;
    veoScript.dialogue.audio_required = true;
    veoScript.dialogue.speaker = characterName;
    veoScript.dialogue.no_interviewer = true; // ★ 인터뷰어 없음 명시

    // ★ 음성 설정 (필수) - 캐릭터 이름으로 키 설정
    veoScript.voice_settings[characterName] = {
      type: sceneVoiceSettings.type || "Korean baby infant voice, 2-3 years old, low-pitched adorable tone",
      tone: audioDetails.voice_tone || emotion,
      characteristics: sceneVoiceSettings.characteristics || "very slow speech, babbling pronunciation, cute baby talk",
      laugh_style: sceneVoiceSettings.laugh_style || "Adorable baby giggling, soft cooing laughter",
      tts_voice: ttsInfo.tts_voice || "Korean baby toddler girl",
      audio_must_be_heard: true,
      only_speaker: true // ★ 이 캐릭터만 말함
    };

    // ★ 인터뷰어 음성 명시적 금지
    veoScript.voice_settings.interviewer = {
      enabled: false,
      note: "NO interviewer voice in this scene - dog speaks alone"
    };

    // ★ 립싱크 설정 (필수)
    veoScript.lip_sync_style = {
      type: lipSyncStyle.type || "Subtle talking photo style",
      method: lipSyncStyle.method || "Minimal mouth animation on static image",
      dog_speaks: true,
      lip_sync_required: true,
      mouth_movement: lipSyncStyle.mouth_movement || "Small natural opening and closing matching Korean syllables",
      face: "Keep same expression, only mouth area moves slightly"
    };

    // ★ mouth_shapes (필수)
    if (Object.keys(mouthShapes).length > 0) {
      veoScript.lip_sync_style.mouth_shapes = mouthShapes;
    } else {
      veoScript.lip_sync_style.korean_mouth_rules = {
        "아/야/가/나/다/라/마/바/사/자/차/카/타/파/하": "mouth wide OPEN, jaw drops down",
        "오/요/고/노/도/로/모/보/소/조/초/코/토/포/호": "lips form small round O shape",
        "우/유/구/누/두/루/무/부/수/주/추/쿠/투/푸/후": "lips round forward, pursed",
        "이/의/기/니/디/리/미/비/시/지/치/키/티/피/히": "lips stretch sideways, wide smile shape",
        "에/예/게/네/데/레/메/베/세/제/체/케/테/페/헤": "mouth slightly open, relaxed"
      };
    }

    veoScript.visual_continuity["0.0_to_0.5_sec"] = {
      dog: "Same as reference",
      mouth: "Closed, preparing to speak"
    };
    veoScript.visual_continuity[`0.5_to_${duration}_sec`] = {
      dog: "Same fur color, same face, same appearance",
      mouth: "Subtle open and close for lip sync - MUST MOVE when speaking",
      change_only: "Mouth movement for speaking",
      lip_sync_active: true
    };

  } else {
    // 대사 없는 씬
    veoScript.dialogue.timing = {
      [`0.0_to_${duration}_sec`]: "No dialogue, natural idle movement only"
    };

    veoScript.lip_sync_style = {
      type: "No lip sync needed",
      dog_speaks: false,
      mouth_state: "CLOSED or natural resting"
    };

    veoScript.visual_continuity[`0.0_to_${duration}_sec`] = {
      dog: "Same as reference, natural idle animation",
      mouth: "Closed, natural resting position"
    };
  }

  return veoScript;
}

// =====================================================
// Veo 3 API 호출
// =====================================================
async function generateWithVeo3(imagePath, veoScript, duration, apiKey) {
  const prompt = JSON.stringify(veoScript, null, 2);

  console.log("\n=== Veo 3 요청 (JSON 구조) ===");
  console.log("Image:", imagePath);
  console.log("Duration:", duration, "초");
  console.log("\n--- JSON 프롬프트 ---");
  console.log(prompt);
  console.log("--- JSON 프롬프트 끝 ---\n");

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
  const maxAttempts = 72;

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

      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      } else if (result?.generatedVideos?.length > 0) {
        videoUrl = result.generatedVideos[0].video?.uri;
      }

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

// =====================================================
// 영상 다운로드
// =====================================================
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

// =====================================================
// 씬 목록 출력
// =====================================================
function printSceneList() {
  console.log("\n=== 스키장 땅콩 씬 목록 (JSON 구조 버전) ===\n");
  console.log("총", scenes.length, "개 씬\n");

  scenes.forEach((scene, idx) => {
    const num = scene.video || idx + 1;
    const duration = scene.duration_seconds || 4;
    const sceneDetails = scene.scene_details || {};
    const lipSyncStyle = scene.lip_sync_style || {};
    const characterName = sceneDetails.character_name || "땅콩";
    const sceneType = sceneDetails.scene_type || "interview_answer";
    const dogSpeaks = lipSyncStyle.dog_speaks;
    const dialogue = scene.dialogue || {};
    const narrationText = dialogue.script || dialogue[characterName] || "";
    const narration = narrationText
      ? (narrationText.length > 35 ? narrationText.substring(0, 35) + "..." : narrationText)
      : "(대사 없음)";
    const imagePath = path.join(imageDir, `segment_number${num}.png`);
    const imageExists = fs.existsSync(imagePath) ? "✅" : "❌";

    const typeLabel = sceneType === "interview_question" ? "질문(입닫힘)" : (dogSpeaks ? "답변(립싱크)" : "기타");

    console.log(`[${num}] ${imageExists} ${duration}초 | ${typeLabel} | ${characterName}`);
    console.log(`    대사: ${narration}`);
    console.log("");
  });

  console.log("사용법: GEMINI_API_KEY=xxx node test-veo3-ski.mjs [씬번호]");
}

// =====================================================
// 특정 씬 생성
// =====================================================
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

  const duration = scene.duration_seconds || 6;
  const sceneDetails = scene.scene_details || {};
  const lipSyncStyle = scene.lip_sync_style || {};
  const sceneType = sceneDetails.scene_type || "interview_answer";
  const dogSpeaks = lipSyncStyle.dog_speaks;

  console.log("\n" + "=".repeat(60));
  console.log(`씬 ${sceneNumber} 영상 생성 (JSON 구조 버전)`);
  console.log("=".repeat(60));

  console.log("\n씬 정보:");
  console.log("  Duration:", duration, "초");
  console.log("  Scene Type:", sceneType);
  console.log("  Dog Speaks:", dogSpeaks);
  console.log("  이미지:", imagePath);

  // JSON 스크립트 생성
  const veoScript = buildVeoScript(scene);

  // 영상 생성
  try {
    const videoUrl = await generateWithVeo3(imagePath, veoScript, duration, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      const outputPath = path.join(outputDir, `scene${sceneNumber}_veo3_json.mp4`);
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

// =====================================================
// 메인
// =====================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printSceneList();
  } else {
    const sceneNumber = parseInt(args[0], 10);

    if (isNaN(sceneNumber) || sceneNumber < 1 || sceneNumber > scenes.length) {
      console.error(`유효한 씬 번호를 입력해주세요 (1-${scenes.length})`);
      process.exit(1);
    }

    await generateScene(sceneNumber);
  }
}

main();
