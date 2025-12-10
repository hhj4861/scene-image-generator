/**
 * Veo 3 Video Generator 테스트 - Beatbox Sample Scene 4, 5
 */

import fs from "fs";
import path from "path";

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

const BEATBOX_SAMPLE_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/beatbox_sample";
const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

async function loadSceneData(sceneNum) {
  const videoPromptPath = `${BEATBOX_SAMPLE_DIR}/script/vedio_prompt_output.json`;
  const data = JSON.parse(fs.readFileSync(videoPromptPath, "utf-8"));
  const scene = data.$return_value.scenes.find(s => s.video === sceneNum);
  return scene;
}

function calculateDurationFromNarration(narration, isInterviewQuestion = false) {
  if (!narration) return 6;
  const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
  // 인터뷰어 질문은 더 빠르게 말함 (초당 6음절), 강아지 대사는 느림 (초당 5음절)
  const syllablesPerSecond = isInterviewQuestion ? 6 : 5;
  const calculatedDuration = Math.ceil(syllableCount / syllablesPerSecond);
  console.log(`  - 음절 수: ${syllableCount}, 초당 ${syllablesPerSecond}음절, 계산된 duration: ${calculatedDuration}초`);
  if (calculatedDuration <= 4) return 4;
  if (calculatedDuration <= 6) return 6;
  return 8;
}

// veo3-video-generator.mjs와 동일한 프롬프트 생성
function buildVeo3Prompt(scene) {
  // dialogue.script 우선 사용, 그 다음 interviewer, 마지막으로 narration
  const narration = scene.dialogue?.script || scene.dialogue?.interviewer || scene.narration || "";
  const isInterviewQuestion = scene.scene_details?.is_interview_question || false;
  const hasKoreanDialogue = scene.has_narration && narration && !isInterviewQuestion;

  let prompt = `8K cinematic video. Cute Pomeranian dog in cow costume on concert stage with colorful lights. CRITICAL: Maintain consistent dog appearance throughout the entire video. No morphing. No distortion. No warping of the dog's face or body. Dog must look natural and cute in every frame. `;
  const noTextEmphasis = "CRITICAL: Absolutely NO text overlays. NO subtitles. NO captions. NO Korean characters. NO Chinese characters. NO Japanese characters. NO any Asian text. NO letters of any kind visible on screen. NO text on microphone. NO text on props. NO watermarks. NO broken text. NO garbled characters. NO corrupted fonts. NO glitched text. Clean video without any text, writing, or character artifacts.";

  // 퍼포먼스 씬 (비트박스 등) - BGM에 맞춰 입 움직임
  const isPerformance = scene.scene_details?.is_performance;
  const perfInfo = scene.performance_info || {};
  const perfPhase = perfInfo.phase || scene.scene_details?.performance_phase;

  if (isPerformance && perfInfo.lip_sync_to === "bgm") {
    // 비트박스 퍼포먼스: BGM에 맞춰 입 움직임 (입모양 강조)
    prompt += `Dog performing beatbox on stage. IMPORTANT: Mouth opens and closes frequently and visibly to the beat. Exaggerated mouth movements - wide open then closed repeatedly. Rapid lip sync mimicking beatbox sounds "boots and cats". Head bobbing, body grooving to rhythm. Cool confident energetic expression. Background audio: beatbox rhythmic music playing loudly. `;
  }

  // 한국어 대사가 있는 경우 (강아지가 말하는 씬) - 퍼포먼스가 아닐 때
  if (hasKoreanDialogue && !isPerformance) {
    const emotionTone = scene.emotion?.primary || "happy";

    let safeNarration = narration;
    let voiceEffect = "";
    let endingExpression = "";

    // "콩파민" - 빠른 기계음으로 처리
    if (narration.includes("콩파민")) {
      safeNarration = narration.replace(/콩파민/g, "Kong-pa-min");
      voiceEffect = " Fast robotic voice effect. Quick mechanical speech.";
    }

    // "헤헤헤헤헤" - 웃는 표정 추가
    if (narration.includes("헤헤헤헤헤")) {
      endingExpression = " During 'hehehehehe' part, dog shows adorable laughing expression with squinted eyes and wide happy smile.";
    }

    prompt += `Dog speaks Korean dialogue with cute voice: "${safeNarration}". ${emotionTone} expression. Language: Korean. IMPORTANT: Precise lip sync - mouth movements must match the speech audio exactly. Mouth opens when speaking, closes between words. Natural talking motion. CRITICAL: NO barking sounds. NO dog barking. NO "woof" or "bark" sounds. Only cute human-like Korean speech voice. No animal sounds.${voiceEffect}${endingExpression} `;
  }

  // 퍼포먼스 브레이크 (콩파민 등 짧은 외침)
  if (isPerformance && perfPhase === "break" && narration) {
    let safeNarration = narration;
    if (narration.includes("콩파민")) {
      safeNarration = "Kong-pa-min";
    }
    // 빠른 기계음 외침
    prompt += `Dog suddenly stops and shouts "${safeNarration}!" in fast robotic mechanical voice. Quick short exclamation. Dramatic pause moment. Confident smirk expression. `;
  }

  // 인터뷰어 질문 시 - 마이크가 강아지 입 근처에 보임
  if (isInterviewQuestion && narration) {
    prompt += `Off-screen Korean female interviewer voice says: "${narration}". A plain black microphone without any text or logos is held near the dog's mouth from the side, interview style. ${noTextEmphasis} Dog MUST keep mouth completely closed and still. No lip movement. No mouth opening. Dog only listens with curious expression, ears perked, slight head tilt. Mouth stays shut the entire time. `;
  }

  // 모든 영상 마지막에 웃는 표정
  prompt += `IMPORTANT: At the end of the video, dog must show a happy smiling expression with a cute grin. `;

  // 자막/텍스트 제거 (최종 강화)
  prompt += `CRITICAL: No text. No subtitles. No captions. No watermarks. No on-screen text of any kind. ${noTextEmphasis}`;
  return prompt;
}

function getOptimalDuration(scene) {
  // dialogue.script 우선 사용
  const narration = scene.dialogue?.script || scene.dialogue?.interviewer || scene.narration || "";
  const isInterviewQuestion = scene.scene_details?.is_interview_question;
  if (narration && scene.has_narration) {
    return calculateDurationFromNarration(narration, isInterviewQuestion);
  }
  return 6;
}

async function generateWithVeo3(imagePath, prompt, duration, apiKey) {
  console.log("\n=== Veo 3 Fast 요청 시작 ===");
  console.log("Duration:", duration, "seconds");
  console.log("Prompt:");
  console.log("-".repeat(50));
  console.log(prompt);
  console.log("-".repeat(50));

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = imagePath.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

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
        image: { bytesBase64Encoded: imageBase64, mimeType },
      }],
      parameters: { aspectRatio: "9:16", durationSeconds: duration },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Veo 3 request failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log("\nOperation started:", data.name);

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
      console.log("\n=== Operation 완료 ===");

      const raiFiltered = result?.generateVideoResponse?.raiMediaFilteredCount || 0;
      if (raiFiltered > 0) {
        console.log("Warning: Content was filtered by safety checks:", raiFiltered);
        const reasons = result?.generateVideoResponse?.raiMediaFilteredReasons || [];
        console.log("Reasons:", reasons);
        return null;
      }

      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      }

      break;
    }

    if (attempts % 6 === 0) {
      console.log(`Waiting... (${attempts * 5}s elapsed)`);
    }
  }

  return videoUrl;
}

async function downloadVideo(videoUrl, outputPath, apiKey) {
  console.log("\nDownloading video...");
  const isVeoUrl = videoUrl.includes("generativelanguage.googleapis.com");
  const headers = isVeoUrl ? { "X-goog-api-key": apiKey } : {};
  const response = await fetch(videoUrl, { headers, redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const videoBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(videoBuffer));
  console.log("Video saved to:", outputPath);
  console.log("File size:", (videoBuffer.byteLength / 1024 / 1024).toFixed(2), "MB");
  return outputPath;
}

async function testScene(sceneNum, apiKey) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`씬${sceneNum} 테스트 시작`);
  console.log("=".repeat(60));

  const scene = await loadSceneData(sceneNum);
  const imagePath = `${BEATBOX_SAMPLE_DIR}/image/씬${sceneNum}.png`;

  if (!fs.existsSync(imagePath)) {
    console.log(`이미지 없음: ${imagePath}`);
    return false;
  }

  console.log("\n씬 정보:");
  console.log("  - Title:", scene.title);
  console.log("  - Scene Type:", scene.scene_details?.scene_type);
  console.log("  - Is Interview Question:", scene.scene_details?.is_interview_question);
  console.log("  - Script:", scene.dialogue?.script || "(없음)");
  console.log("  - Narration (legacy):", scene.narration || "(없음)");
  console.log("  - Has Narration:", scene.has_narration);

  const prompt = buildVeo3Prompt(scene);
  const duration = getOptimalDuration(scene);
  console.log("  - Final duration:", duration, "seconds");

  try {
    const videoUrl = await generateWithVeo3(imagePath, prompt, duration, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      const outputPath = path.join(OUTPUT_DIR, `beatbox_scene${sceneNum}_korean_veo3.mp4`);
      await downloadVideo(videoUrl, outputPath, apiKey);
      return true;
    } else {
      console.log("\n=== 실패 (Safety filtered 또는 URL 없음) ===");
      return false;
    }
  } catch (error) {
    console.error("\n=== 에러 ===");
    console.error(error.message);
    return false;
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  // 테스트할 씬 번호 (커맨드라인 인자로 받음)
  const sceneNum = parseInt(process.argv[2] || "4");

  console.log("=".repeat(60));
  console.log(`Veo 3 Video Generator 테스트 - Scene ${sceneNum}`);
  console.log("=".repeat(60));

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const success = await testScene(sceneNum, apiKey);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`테스트 완료: ${success ? "성공" : "실패"}`);
  console.log("=".repeat(60));
}

main();
