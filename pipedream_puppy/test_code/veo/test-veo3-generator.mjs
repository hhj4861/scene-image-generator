/**
 * Veo 3 Fast Video Generator 테스트 (이미지 기반)
 * 이미지 + video_generation 정보로 영상 생성
 */

const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// 테스트용 이미지 (로컬 파일 또는 URL)
const TEST_IMAGE_PATH = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/image_sample/강아지샘플.jpeg";

// voice_styles (script-generator에서 생성)
const voiceStyles = {
  main: "cute adorable toddler girl voice, 2-3 years old, slow sweet innocent speech, baby talk",
  sub1: "warm gentle elderly woman voice, loving grandmother tone",
  sub2: "kind mature adult male voice, gentle father figure",
  sub3: "friendly adult female voice, caring and warm",
};

// 테스트 씬 데이터 (script-generator video_generation 출력 형식)
const testScene = {
  index: 1,
  start: 0,
  end: 8,
  duration: 8,
  image_url: TEST_IMAGE_PATH,

  // 대사 정보
  narration: "안녕하세요! 저는 귀여운 강아지 땅콩이에요!",
  has_narration: true,

  // 캐릭터 정보
  speaker: "main",
  character_name: "땅콩",

  // 음성 정보
  voice_type: "cute_toddler_girl",
  voice_style: voiceStyles.main,
  speaking_speed: "slow and cute",

  // 감정
  emotion: "happy",

  // 영상 프롬프트
  video_prompt: {
    character_action: "talking with perfectly synchronized lip movements",
    lip_sync: "yes",
    facial_expression: "happy excited",
    body_movement: "wagging tail, bouncy movements",
    camera_movement: "slow zoom in",
  },

  // 씬 디테일
  scene_details: {
    location: "indoor",
    background: "cozy living room with soft cushions and warm sunlight",
    weather: "none",
    lighting: "warm golden hour lighting",
    mood: "cheerful heartwarming",
  },

  // 오디오 디테일
  audio_details: {
    voice_style: voiceStyles.main,
    voice_type: "cute_toddler_girl",
    speaking_speed: "slow and cute",
    sound_effects: "soft paw sounds",
    background_sound: "gentle ambient music",
  },

  // Veo 3 프롬프트 생성용
  veo3_prompt_parts: {
    action: "talking with perfectly synchronized lip movements, mouth moving naturally to speech",
    expression: "happy excited expression",
    voice: voiceStyles.main,
    dialogue: "안녕하세요! 저는 귀여운 강아지 땅콩이에요!",
    camera: "slow zoom in",
    sound_effects: "soft paw sounds",
    ambient: "gentle ambient music",
  },
};

// Veo 3 프롬프트 생성 함수 (이미지 기반 - 동작/음성/립싱크 중심)
function buildVeo3Prompt(scene) {
  const parts = scene.veo3_prompt_parts || {};
  const videoPrompt = scene.video_prompt || {};
  const audioDetails = scene.audio_details || {};

  const hasNarration = scene.has_narration || !!(scene.narration && scene.narration.trim());
  const narration = scene.narration || "";

  const speaker = scene.speaker || "main";
  const voiceStyle = parts.voice || scene.voice_style || voiceStyles[speaker] || audioDetails.voice_style || "";

  // 동작 (립싱크 여부에 따라)
  const action = hasNarration
    ? (videoPrompt.character_action || "talking with perfectly synchronized lip movements, mouth opening and closing naturally matching the speech")
    : (videoPrompt.character_action || "natural subtle movements, gentle breathing, slight head movement");

  // 표정
  const expression = videoPrompt.facial_expression || parts.expression || `${scene.emotion || "happy"} expression`;

  // 몸 움직임
  const bodyMovement = videoPrompt.body_movement || (hasNarration ? "expressive gestures while talking" : "subtle natural movements");

  // 카메라
  const camera = videoPrompt.camera_movement || parts.camera || "static";

  // 효과음
  const soundEffects = audioDetails.sound_effects || parts.sound_effects || "";
  const ambient = audioDetails.background_sound || parts.ambient || "";

  // 프롬프트 구성 (이미지 기반이므로 캐릭터 외형/배경 설명 불필요)
  const promptParts = [];

  // 1. 동작 설명 (핵심!)
  promptParts.push(action);

  // 2. 표정
  promptParts.push(expression);

  // 3. 몸 움직임
  promptParts.push(bodyMovement);

  // 4. 대사 + 음성 스타일 (립싱크가 있을 때)
  if (hasNarration && narration) {
    if (voiceStyle) {
      promptParts.push(`speaking with ${voiceStyle}`);
    }
    promptParts.push(`saying "${narration}"`);
    promptParts.push("perfect lip sync, realistic mouth movements matching dialogue");
  }

  // 5. 카메라 무브먼트
  promptParts.push(`${camera} camera movement`);

  // 6. 효과음
  if (soundEffects) promptParts.push(`sound of ${soundEffects}`);
  if (ambient) promptParts.push(`ambient ${ambient}`);

  // 7. 품질
  promptParts.push("high quality, smooth animation, natural movement");

  return promptParts.filter(Boolean).join(", ");
}

// Veo 3 API 호출 (이미지 기반 - 로컬 파일 또는 URL 지원)
async function generateWithVeo3(imagePath, prompt, apiKey) {
  const fs = await import("fs");

  console.log("\n=== Veo 3 Fast 요청 (이미지 기반) ===");
  console.log("Model:", MODEL_ID);
  console.log("Image:", imagePath);
  console.log("Prompt:", prompt);
  console.log("");

  let imageBase64;
  let mimeType;

  // 로컬 파일인지 URL인지 확인
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    // URL에서 다운로드
    console.log("Downloading image from URL...");
    const imageResponse = await fetch(imagePath);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    imageBase64 = Buffer.from(imageBuffer).toString("base64");
    mimeType = imagePath.toLowerCase().includes(".jpg") || imagePath.toLowerCase().includes(".jpeg")
      ? "image/jpeg" : "image/png";
    console.log("Image size:", imageBuffer.byteLength, "bytes, MIME:", mimeType);
  } else {
    // 로컬 파일 읽기
    console.log("Reading local image file...");
    const imageBuffer = fs.readFileSync(imagePath);
    imageBase64 = imageBuffer.toString("base64");
    mimeType = imagePath.toLowerCase().includes(".jpg") || imagePath.toLowerCase().includes(".jpeg")
      ? "image/jpeg" : "image/png";
    console.log("Image size:", imageBuffer.length, "bytes, MIME:", mimeType);
  }

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
        durationSeconds: 8,
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

// 메인 테스트
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY 환경변수를 설정해주세요");
    process.exit(1);
  }

  // 테스트 이미지 경로 (환경변수로 덮어쓰기 가능)
  const imagePath = process.env.TEST_IMAGE_PATH || TEST_IMAGE_PATH;
  testScene.image_url = imagePath;

  console.log("=== Veo 3 Fast Video Generator 테스트 (이미지 기반) ===\n");
  console.log("테스트 이미지:", imagePath);

  // 1. 프롬프트 생성 테스트
  const prompt = buildVeo3Prompt(testScene);
  console.log("\nGenerated Prompt:");
  console.log(prompt);
  console.log("\n" + "=".repeat(50) + "\n");

  // 2. API 호출 테스트
  try {
    const videoUrl = await generateWithVeo3(imagePath, prompt, apiKey);

    if (videoUrl) {
      console.log("\n=== 성공! ===");
      console.log("Video URL:", videoUrl);

      // 영상 다운로드
      console.log("\nDownloading video...");
      const videoResponse = await fetch(videoUrl, {
        headers: { "X-goog-api-key": apiKey },
        redirect: "follow",
      });

      if (videoResponse.ok) {
        const fs = await import("fs");
        const videoBuffer = await videoResponse.arrayBuffer();
        const outputPath = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output/veo3_image_based_test.mp4";
        fs.writeFileSync(outputPath, Buffer.from(videoBuffer));
        console.log("Video saved to:", outputPath);
        console.log("File size:", videoBuffer.byteLength, "bytes");
      }
    } else {
      console.log("\n=== 실패: 비디오 URL을 받지 못함 ===");
    }
  } catch (error) {
    console.error("\n=== 에러 ===");
    console.error(error.message);
  }
}

main();
