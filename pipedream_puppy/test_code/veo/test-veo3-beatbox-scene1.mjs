/**
 * Veo 3 Video Generator 테스트 - Beatbox Sample Scene 1
 * beatbox_sample 데이터를 기반으로 씬1 비디오 생성 테스트
 */

import fs from "fs";
import path from "path";

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// beatbox_sample 경로
const BEATBOX_SAMPLE_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/beatbox_sample";
const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

// 씬1 이미지 경로
const SCENE1_IMAGE_PATH = `${BEATBOX_SAMPLE_DIR}/image/씬1.png`;

// vedio_prompt_output.json에서 씬1 데이터 로드
async function loadScene1Data() {
  const videoPromptPath = `${BEATBOX_SAMPLE_DIR}/script/vedio_prompt_output.json`;
  const data = JSON.parse(fs.readFileSync(videoPromptPath, "utf-8"));

  // scenes 배열에서 video: 1인 씬 찾기
  const scene1 = data.$return_value.scenes.find(s => s.video === 1);
  return { scene1, fullData: data.$return_value };
}

// Veo 3 프롬프트 생성 (veo3-video-generator.mjs 로직과 동일 - 한국어 음성 지원)
function buildVeo3Prompt(scene) {
  // 기본 프롬프트 (vedio_prompt_output.json의 prompt 필드 사용)
  let basePrompt = scene.prompt || "8K cinematic video. Same puppy from reference image. Natural movements. No text. No watermarks.";

  // ★★★ 한국어 음성 지원: 대사가 있는 경우 한국어 대화 지시 추가 ★★★
  const narration = scene.narration || scene.dialogue?.script || "";
  const isInterviewQuestion = scene.scene_details?.is_interview_question || false;
  const hasKoreanDialogue = scene.has_narration && narration && !isInterviewQuestion;

  if (hasKoreanDialogue) {
    // 음성 스타일 결정
    let voiceStyle = "cute toddler girl voice";
    if (scene.voice_settings) {
      const mainVoice = scene.voice_settings[scene.character_name] || scene.voice_settings.main || scene.voice_settings["땅콩"];
      if (mainVoice?.type) {
        voiceStyle = mainVoice.type;
      }
    }

    // 감정 톤
    const emotionTone = scene.emotion?.primary || "happy";

    // 한국어 대사 프롬프트 추가
    basePrompt += ` [KOREAN DIALOGUE] The character speaks in Korean: "${narration}". Voice: ${voiceStyle}, ${emotionTone} tone. Language must be Korean (한국어). Perfect lip sync matching Korean syllables. Natural Korean pronunciation.`;
  }

  // 인터뷰어가 말하는 씬 (인터뷰 질문)
  if (isInterviewQuestion && narration) {
    basePrompt += ` [KOREAN INTERVIEWER VOICE] Off-screen interviewer speaks in Korean: "${narration}". Voice: Korean female news anchor, professional friendly tone. Language: Korean (한국어).`;
  }

  // mouth_shapes 정보가 있으면 추가
  if (scene.mouth_shapes && Object.keys(scene.mouth_shapes).length > 0 && hasKoreanDialogue) {
    const mouthShapeDescriptions = Object.entries(scene.mouth_shapes)
      .slice(0, 5)
      .map(([char, desc]) => `"${char}": ${desc}`)
      .join("; ");
    basePrompt += ` Korean lip sync guide: ${mouthShapeDescriptions}. Match mouth movements to these Korean syllable shapes.`;
  }

  // lip_sync_style 정보 추가
  if (scene.lip_sync_style) {
    const lsStyle = scene.lip_sync_style;
    if (lsStyle.type && lsStyle.mouth_movement) {
      basePrompt += ` Lip sync: ${lsStyle.type}. Mouth: ${lsStyle.mouth_movement}.`;
    }
  }

  return basePrompt;
}

// Duration 정규화 (Veo 3는 4, 6, 8초만 지원)
function normalizeDuration(d) {
  if (d <= 4) return 4;
  if (d <= 6) return 6;
  return 8;
}

// Veo 3 API 호출 (이미지 기반)
async function generateWithVeo3(imagePath, prompt, duration, apiKey) {
  console.log("\n=== Veo 3 Fast 요청 시작 ===");
  console.log("Model:", MODEL_ID);
  console.log("Image:", imagePath);
  console.log("Duration:", duration, "seconds");
  console.log("Prompt:", prompt.substring(0, 300) + (prompt.length > 300 ? "..." : ""));
  console.log("");

  // 이미지 읽기
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = imagePath.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
  console.log("Image size:", imageBuffer.length, "bytes, MIME:", mimeType);

  const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

  // API 요청
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
  const maxAttempts = 72; // 최대 6분 대기

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
      console.log("Response keys:", Object.keys(result || {}));

      // URL 추출 (여러 형식 지원)
      if (result?.generateVideoResponse?.generatedSamples?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedSamples[0].video?.uri;
      } else if (result?.generateVideoResponse?.generatedVideos?.length > 0) {
        videoUrl = result.generateVideoResponse.generatedVideos[0].video?.uri;
      } else if (result?.generatedVideos?.length > 0) {
        videoUrl = result.generatedVideos[0].video?.uri;
      }

      // 안전 필터 체크
      const raiFiltered = result?.generateVideoResponse?.raiMediaFilteredCount || 0;
      if (raiFiltered > 0) {
        console.warn("Warning: Some content was filtered by safety checks");
      }

      // gs:// → https:// 변환
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
  console.log("\nDownloading video from:", videoUrl.substring(0, 100) + "...");

  // Veo URL인 경우 API 키 필요
  const isVeoUrl = videoUrl.includes("generativelanguage.googleapis.com");
  const headers = isVeoUrl ? { "X-goog-api-key": apiKey } : {};

  const response = await fetch(videoUrl, { headers, redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const videoBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(videoBuffer));

  console.log("Video saved to:", outputPath);
  console.log("File size:", videoBuffer.byteLength, "bytes");

  return outputPath;
}

// 메인 테스트
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY 환경변수를 설정해주세요");
    console.error("Usage: GEMINI_API_KEY=your_key node test-veo3-beatbox-scene1.mjs");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Veo 3 Video Generator 테스트 - Beatbox Sample Scene 1");
  console.log("=".repeat(60));

  // 1. 씬1 데이터 로드
  console.log("\n[1] Loading Scene 1 data from beatbox_sample...");
  const { scene1, fullData } = await loadScene1Data();

  console.log("\n씬1 정보:");
  console.log("  - Title:", scene1.title);
  console.log("  - Duration:", scene1.duration_seconds, "seconds");
  console.log("  - Scene Type:", scene1.scene_details?.scene_type);
  console.log("  - Is Interview Question:", scene1.scene_details?.is_interview_question);
  console.log("  - Narration:", scene1.narration?.substring(0, 50) + "...");
  console.log("  - Lip Sync Style:", scene1.lip_sync_style?.type);

  // 2. 프롬프트 생성
  console.log("\n[2] Building Veo 3 prompt...");
  const prompt = buildVeo3Prompt(scene1);
  console.log("\nGenerated Prompt:");
  console.log("-".repeat(40));
  console.log(prompt);
  console.log("-".repeat(40));

  // 3. Duration 정규화
  const duration = normalizeDuration(scene1.duration_seconds || 6);
  console.log("\n[3] Normalized duration:", duration, "seconds");

  // 4. 이미지 확인
  console.log("\n[4] Checking image file...");
  if (!fs.existsSync(SCENE1_IMAGE_PATH)) {
    console.error("Error: Image not found:", SCENE1_IMAGE_PATH);
    process.exit(1);
  }
  const imageStats = fs.statSync(SCENE1_IMAGE_PATH);
  console.log("  - Image path:", SCENE1_IMAGE_PATH);
  console.log("  - Image size:", imageStats.size, "bytes");

  // 5. 출력 디렉토리 확인/생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log("  - Created output directory:", OUTPUT_DIR);
  }

  // 6. Veo 3 API 호출
  console.log("\n[5] Generating video with Veo 3...");
  try {
    const videoUrl = await generateWithVeo3(SCENE1_IMAGE_PATH, prompt, duration, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      // 7. 비디오 다운로드
      const outputPath = path.join(OUTPUT_DIR, "beatbox_scene1_veo3.mp4");
      await downloadVideo(videoUrl, outputPath, apiKey);

      console.log("\n" + "=".repeat(60));
      console.log("테스트 완료!");
      console.log("=".repeat(60));
      console.log("\n결과:");
      console.log("  - Video URL:", videoUrl);
      console.log("  - Local file:", outputPath);
    } else {
      console.log("\n=== 실패: 비디오 URL을 받지 못함 ===");
    }
  } catch (error) {
    console.error("\n=== 에러 발생 ===");
    console.error("Error:", error.message);
    if (error.message.includes("RESOURCE_EXHAUSTED")) {
      console.error("\nAPI 쿼터가 초과되었습니다. 나중에 다시 시도하거나 다른 API 키를 사용하세요.");
    } else if (error.message.includes("raiMediaFiltered") || error.message.includes("safety")) {
      console.error("\n안전 필터에 의해 콘텐츠가 차단되었습니다. 프롬프트를 수정해 보세요.");
    }
    process.exit(1);
  }
}

main();
