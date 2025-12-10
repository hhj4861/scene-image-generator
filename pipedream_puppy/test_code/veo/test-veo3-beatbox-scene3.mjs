/**
 * Veo 3 Video Generator 테스트 - Beatbox Sample Scene 3
 * 인터뷰어가 질문하는 씬 (한국어 음성 테스트)
 */

import fs from "fs";
import path from "path";

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

const BEATBOX_SAMPLE_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/beatbox_sample";
const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

const SCENE3_IMAGE_PATH = `${BEATBOX_SAMPLE_DIR}/image/씬3.png`;

async function loadScene3Data() {
  const videoPromptPath = `${BEATBOX_SAMPLE_DIR}/script/vedio_prompt_output.json`;
  const data = JSON.parse(fs.readFileSync(videoPromptPath, "utf-8"));
  const scene3 = data.$return_value.scenes.find(s => s.video === 3);
  return { scene3, fullData: data.$return_value };
}

// 한국어 대사 길이 기반 duration 계산
function calculateDurationFromNarration(narration, baseDuration) {
  if (!narration) return baseDuration;
  const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
  const syllablesPerSecond = 4;
  const calculatedDuration = Math.ceil(syllableCount / syllablesPerSecond) + 1;
  console.log(`  - 음절 수: ${syllableCount}, 계산된 duration: ${calculatedDuration}초`);
  if (calculatedDuration <= 4) return 4;
  if (calculatedDuration <= 6) return 6;
  return 8;
}

// Veo 3 프롬프트 생성 (veo3-video-generator.mjs와 동일)
function buildVeo3Prompt(scene) {
  const narration = scene.narration || scene.dialogue?.script || "";
  const isInterviewQuestion = scene.scene_details?.is_interview_question || false;
  const hasKoreanDialogue = scene.has_narration && narration && !isInterviewQuestion;

  let prompt = `8K cinematic video. Cute Pomeranian dog in cow costume on concert stage with colorful lights. `;

  // 깨진 한글/텍스트 제거 강조
  const noTextEmphasis = "IMPORTANT: No Korean text. No Chinese characters. No Japanese text. No Asian characters on any objects. No text on microphone. No text on props. No letters. No writing. Clean props without any text.";

  if (hasKoreanDialogue) {
    const emotionTone = scene.emotion?.primary || "happy";
    prompt += `Dog speaks Korean dialogue with cute voice: "${narration}". ${emotionTone} expression. Language: Korean. Lip sync to speech. `;
  }

  // 인터뷰어 질문 시 - 강아지 입 절대 움직이지 않음
  if (isInterviewQuestion && narration) {
    prompt += `Off-screen Korean female interviewer voice says: "${narration}". Dog MUST keep mouth completely closed and still. No lip movement. No mouth opening. Dog only listens with curious expression, ears perked, slight head tilt. Mouth stays shut the entire time. `;
  }

  // 자막/텍스트 제거 (강화)
  prompt += `No text. No subtitles. No captions. No watermarks. ${noTextEmphasis}`;
  return prompt;
}

// Duration 계산
function getOptimalDuration(scene) {
  const narration = scene.narration || scene.dialogue?.script || "";
  const baseDuration = scene.duration_seconds || 6;
  if (narration && scene.has_narration) {
    return calculateDurationFromNarration(narration, baseDuration);
  }
  if (baseDuration <= 4) return 4;
  if (baseDuration <= 6) return 6;
  return 8;
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
        return null;
      }

      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      } else if (result?.generateVideoResponse?.generatedVideos?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedVideos[0].video?.uri;
      } else if (result?.generatedVideos?.length > 0) {
        videoUrl = result.generatedVideos[0].video?.uri;
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

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Veo 3 Video Generator 테스트 - Beatbox Sample Scene 3");
  console.log("=".repeat(60));

  console.log("\n[1] Loading Scene 3 data...");
  const { scene3 } = await loadScene3Data();

  console.log("\n씬3 정보:");
  console.log("  - Title:", scene3.title);
  console.log("  - Duration:", scene3.duration_seconds, "seconds");
  console.log("  - Scene Type:", scene3.scene_details?.scene_type);
  console.log("  - Is Interview Question:", scene3.scene_details?.is_interview_question);
  console.log("  - Narration:", scene3.narration);
  console.log("  - Has Narration:", scene3.has_narration);

  console.log("\n[2] Building Veo 3 prompt...");
  const prompt = buildVeo3Prompt(scene3);

  console.log("\n[3] Calculating optimal duration...");
  const duration = getOptimalDuration(scene3);
  console.log("  - Final duration:", duration, "seconds");

  if (!fs.existsSync(SCENE3_IMAGE_PATH)) {
    console.error("Error: Image not found:", SCENE3_IMAGE_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("\n[4] Generating video with Veo 3...");
  try {
    const videoUrl = await generateWithVeo3(SCENE3_IMAGE_PATH, prompt, duration, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      const outputPath = path.join(OUTPUT_DIR, "beatbox_scene3_korean_veo3.mp4");
      await downloadVideo(videoUrl, outputPath, apiKey);

      console.log("\n" + "=".repeat(60));
      console.log("테스트 완료!");
      console.log("=".repeat(60));
      console.log("\n대사:", scene3.narration);
    } else {
      console.log("\n=== 실패 ===");
    }
  } catch (error) {
    console.error("\n=== 에러 ===");
    console.error(error.message);
    process.exit(1);
  }
}

main();
