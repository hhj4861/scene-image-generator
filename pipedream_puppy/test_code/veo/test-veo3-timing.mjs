/**
 * Veo 3 Video Generator 시간 측정 테스트
 * 여러 씬을 연속으로 생성하며 시간 측정
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

function calculateDurationFromNarration(narration) {
  if (!narration) return 6;
  const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
  const calculatedDuration = Math.ceil(syllableCount / 4) + 1;
  if (calculatedDuration <= 4) return 4;
  if (calculatedDuration <= 6) return 6;
  return 8;
}

function buildVeo3Prompt(scene) {
  const narration = scene.narration || scene.dialogue?.script || "";
  const isInterviewQuestion = scene.scene_details?.is_interview_question || false;
  const hasKoreanDialogue = scene.has_narration && narration && !isInterviewQuestion;

  let prompt = `8K cinematic video. Cute Pomeranian dog in cow costume on concert stage with colorful lights. `;
  const noTextEmphasis = "IMPORTANT: No Korean text. No Chinese characters. No Japanese text. No Asian characters on any objects. No text on microphone. No text on props. No letters. No writing. Clean props without any text.";

  if (hasKoreanDialogue) {
    const emotionTone = scene.emotion?.primary || "happy";
    prompt += `Dog speaks Korean dialogue with cute voice: "${narration}". ${emotionTone} expression. Language: Korean. Lip sync to speech. `;
  }

  if (isInterviewQuestion && narration) {
    prompt += `Off-screen Korean female interviewer voice says: "${narration}". Dog MUST keep mouth completely closed and still. No lip movement. No mouth opening. Dog only listens with curious expression, ears perked, slight head tilt. Mouth stays shut the entire time. `;
  }

  prompt += `No text. No subtitles. No captions. No watermarks. ${noTextEmphasis}`;
  return prompt;
}

function getOptimalDuration(scene) {
  const narration = scene.narration || scene.dialogue?.script || "";
  if (narration && scene.has_narration) {
    return calculateDurationFromNarration(narration);
  }
  return 6;
}

async function submitRequest(imagePath, prompt, duration, apiKey) {
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
  return data.name; // operation name
}

async function pollOperation(operationName, apiKey) {
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
        return { success: false, error: statusData.error.message };
      }

      const result = statusData.response;
      const raiFiltered = result?.generateVideoResponse?.raiMediaFilteredCount || 0;
      if (raiFiltered > 0) {
        return { success: false, error: "Safety filtered" };
      }

      let videoUrl = null;
      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      }

      return { success: true, videoUrl, pollAttempts: attempts };
    }
  }

  return { success: false, error: "Timeout", pollAttempts: attempts };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("Veo 3 Video Generator 시간 측정 테스트");
  console.log("=".repeat(70));

  // 테스트할 씬들 (4, 5, 6번 - 퍼포먼스 씬)
  const scenesToTest = [4, 5, 6];
  const timingResults = [];

  for (const sceneNum of scenesToTest) {
    const scene = await loadSceneData(sceneNum);
    const imagePath = `${BEATBOX_SAMPLE_DIR}/image/씬${sceneNum}.png`;

    if (!fs.existsSync(imagePath)) {
      console.log(`\n씬${sceneNum}: 이미지 없음, 스킵`);
      continue;
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`씬${sceneNum} 테스트 시작`);
    console.log(`  - 타입: ${scene.scene_details?.scene_type}`);
    console.log(`  - 대사: ${scene.narration?.substring(0, 30) || "(없음)"}...`);

    const prompt = buildVeo3Prompt(scene);
    const duration = getOptimalDuration(scene);
    console.log(`  - Duration: ${duration}초`);

    // 시간 측정 시작
    const submitStartTime = Date.now();

    try {
      // 1. 요청 제출
      const operationName = await submitRequest(imagePath, prompt, duration, apiKey);
      const submitEndTime = Date.now();
      const submitTime = (submitEndTime - submitStartTime) / 1000;

      console.log(`  - 요청 제출 시간: ${submitTime.toFixed(2)}초`);
      console.log(`  - Operation: ${operationName}`);

      // 2. 완료 대기
      const pollStartTime = Date.now();
      const result = await pollOperation(operationName, apiKey);
      const pollEndTime = Date.now();
      const pollTime = (pollEndTime - pollStartTime) / 1000;

      const totalTime = (pollEndTime - submitStartTime) / 1000;

      if (result.success) {
        console.log(`  - 폴링 시간: ${pollTime.toFixed(2)}초 (${result.pollAttempts}회 시도)`);
        console.log(`  - 총 소요 시간: ${totalTime.toFixed(2)}초`);
        console.log(`  - 결과: 성공`);

        timingResults.push({
          scene: sceneNum,
          submitTime,
          pollTime,
          totalTime,
          pollAttempts: result.pollAttempts,
          duration,
          success: true,
        });
      } else {
        console.log(`  - 결과: 실패 - ${result.error}`);
        timingResults.push({
          scene: sceneNum,
          submitTime,
          pollTime,
          totalTime,
          success: false,
          error: result.error,
        });
      }

    } catch (error) {
      console.log(`  - 결과: 에러 - ${error.message}`);
      timingResults.push({
        scene: sceneNum,
        success: false,
        error: error.message,
      });
    }
  }

  // 결과 요약
  console.log(`\n${"=".repeat(70)}`);
  console.log("시간 측정 결과 요약");
  console.log("=".repeat(70));

  const successResults = timingResults.filter(r => r.success);

  if (successResults.length > 0) {
    const avgSubmitTime = successResults.reduce((sum, r) => sum + r.submitTime, 0) / successResults.length;
    const avgPollTime = successResults.reduce((sum, r) => sum + r.pollTime, 0) / successResults.length;
    const avgTotalTime = successResults.reduce((sum, r) => sum + r.totalTime, 0) / successResults.length;
    const avgPollAttempts = successResults.reduce((sum, r) => sum + r.pollAttempts, 0) / successResults.length;

    console.log(`\n성공한 요청: ${successResults.length}/${timingResults.length}`);
    console.log(`\n평균 시간:`);
    console.log(`  - 요청 제출: ${avgSubmitTime.toFixed(2)}초`);
    console.log(`  - 폴링 대기: ${avgPollTime.toFixed(2)}초 (평균 ${avgPollAttempts.toFixed(1)}회 시도)`);
    console.log(`  - 총 소요: ${avgTotalTime.toFixed(2)}초`);

    console.log(`\n개별 결과:`);
    for (const r of timingResults) {
      if (r.success) {
        console.log(`  씬${r.scene}: 제출 ${r.submitTime.toFixed(2)}초, 폴링 ${r.pollTime.toFixed(2)}초, 총 ${r.totalTime.toFixed(2)}초 (${r.duration}초 영상)`);
      } else {
        console.log(`  씬${r.scene}: 실패 - ${r.error}`);
      }
    }

    // REQUEST_DELAY_MS 권장 값
    console.log(`\n${"=".repeat(70)}`);
    console.log("REQUEST_DELAY_MS 분석");
    console.log("=".repeat(70));
    console.log(`\n현재 설정: 3000ms (3초)`);
    console.log(`평균 요청 제출 시간: ${(avgSubmitTime * 1000).toFixed(0)}ms`);

    if (avgSubmitTime < 2) {
      console.log(`\n권장: REQUEST_DELAY_MS를 2000ms로 줄여도 됩니다.`);
      console.log(`  - 요청 제출이 빠르므로 딜레이를 줄여 전체 처리 시간을 단축할 수 있습니다.`);
    } else if (avgSubmitTime > 5) {
      console.log(`\n권장: REQUEST_DELAY_MS를 5000ms로 늘리세요.`);
      console.log(`  - 요청 제출 시간이 길어 API 부하가 있을 수 있습니다.`);
    } else {
      console.log(`\n권장: 현재 REQUEST_DELAY_MS (3000ms)가 적절합니다.`);
    }

  } else {
    console.log("\n모든 요청이 실패했습니다.");
  }
}

main();
