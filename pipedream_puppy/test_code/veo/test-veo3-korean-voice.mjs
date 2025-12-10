/**
 * Veo 3 Video Generator 테스트 - 한국어 음성 테스트
 * 프롬프트에 한국어 대사를 직접 포함하여 한국어 음성 생성 테스트
 */

import fs from "fs";
import path from "path";

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// beatbox_sample 경로
const BEATBOX_SAMPLE_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/beatbox_sample";
const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

// 씬2 이미지 (강아지가 말하는 씬)
const SCENE2_IMAGE_PATH = `${BEATBOX_SAMPLE_DIR}/image/씬2.png`;

// 한국어 음성용 프롬프트 빌더
function buildKoreanVoicePrompt(narration, emotion = "happy") {
  // 방법 1: 한국어로 직접 대사 지정 + 언어 명시
  const prompt = `
8K cinematic video. Cute Pomeranian dog in cow costume speaking Korean dialogue.

[DIALOGUE IN KOREAN]
The dog says: "${narration}"

[VOICE SETTINGS]
- Language: Korean (한국어)
- Voice: Cute young girl voice, 2-3 years old toddler
- Tone: ${emotion}, adorable, innocent
- Speaking speed: Slow and cute

[VISUAL]
- Dog looking directly at camera
- Mouth movements synchronized with Korean speech
- ${emotion} expression
- Slight head movements while talking
- Concert stage background with colorful lights

[IMPORTANT]
- Speak in Korean language, NOT English
- 한국어로 말해야 함
- Natural Korean pronunciation
- Lip sync to Korean syllables

No text. No watermarks. No subtitles.
`.trim();

  return prompt;
}

// 방법 2: 영어 설명 + 한국어 대사 직접 포함
function buildKoreanVoicePromptV2(narration, emotion = "happy") {
  return `8K cinematic video of a cute Pomeranian dog in a cow costume on a concert stage with colorful lights. The dog speaks Korean dialogue with a cute toddler girl voice. The dog says in Korean: "${narration}". Voice tone is ${emotion} and adorable. Perfect lip sync matching Korean syllables. The dog looks at the camera with ${emotion} expression. Mouth moves naturally to Korean speech. Language must be Korean (한국어). No English. No text overlays. No watermarks.`;
}

// 방법 3: 한국어 프롬프트 사용
function buildKoreanPromptV3(narration, emotion = "행복한") {
  return `8K 시네마틱 영상. 무대 위 소 코스튬을 입은 귀여운 포메라니안 강아지가 카메라를 보며 한국어로 말합니다. 대사: "${narration}". 목소리: 2-3세 귀여운 여자아이 목소리, ${emotion} 톤. 입 모양이 한국어 발음에 맞춰 자연스럽게 움직입니다. 무대 조명이 반짝이는 배경. 자막 없음. 워터마크 없음.`;
}

// Duration 정규화
function normalizeDuration(d) {
  if (d <= 4) return 4;
  if (d <= 6) return 6;
  return 8;
}

// Veo 3 API 호출
async function generateWithVeo3(imagePath, prompt, duration, apiKey) {
  console.log("\n=== Veo 3 요청 시작 ===");
  console.log("Image:", imagePath);
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
  console.log("\nOperation started:", data.name);

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
      console.log("\n=== Operation 완료 ===");

      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      } else if (result?.generateVideoResponse?.generatedVideos?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedVideos[0].video?.uri;
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
      console.log(`Waiting... (${attempts * 5}s elapsed)`);
    }
  }

  return videoUrl;
}

// 비디오 다운로드
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

// 메인 테스트
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  // 테스트할 한국어 대사 (씬2의 대사)
  const koreanNarration = "어릴 때부터 둠칫둠칫! 제 안의 흥을 주체할 수 없었어요!";

  // 프롬프트 방법 선택 (1, 2, 3)
  const method = parseInt(process.env.METHOD || "2");

  console.log("=".repeat(60));
  console.log("Veo 3 한국어 음성 테스트");
  console.log("=".repeat(60));
  console.log("\n테스트 대사:", koreanNarration);
  console.log("프롬프트 방법:", method);

  // 이미지 확인
  const imagePath = SCENE2_IMAGE_PATH;
  if (!fs.existsSync(imagePath)) {
    // 씬2가 없으면 씬1 사용
    console.log("씬2 이미지 없음, 씬1 사용");
  }

  // 실제 사용할 이미지 (씬1 또는 씬2)
  const actualImagePath = fs.existsSync(imagePath)
    ? imagePath
    : `${BEATBOX_SAMPLE_DIR}/image/씬1.png`;

  // 프롬프트 생성
  let prompt;
  switch (method) {
    case 1:
      prompt = buildKoreanVoicePrompt(koreanNarration, "excited");
      break;
    case 2:
      prompt = buildKoreanVoicePromptV2(koreanNarration, "excited");
      break;
    case 3:
      prompt = buildKoreanPromptV3(koreanNarration, "신나는");
      break;
    default:
      prompt = buildKoreanVoicePromptV2(koreanNarration, "excited");
  }

  // 출력 디렉토리
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    const videoUrl = await generateWithVeo3(actualImagePath, prompt, 4, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      const outputPath = path.join(OUTPUT_DIR, `beatbox_korean_voice_method${method}.mp4`);
      await downloadVideo(videoUrl, outputPath, apiKey);

      console.log("\n" + "=".repeat(60));
      console.log("테스트 완료! 영상을 확인하여 한국어 음성이 나오는지 확인하세요.");
      console.log("=".repeat(60));
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
