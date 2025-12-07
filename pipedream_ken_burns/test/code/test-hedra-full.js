/**
 * Hedra Lip Sync 전체 테스트
 * 이미지 + TTS 오디오 → 입이 움직이는 영상 생성
 */

import axios from "axios";
import fs from "fs";
import FormData from "form-data";

// API 설정
const HEDRA_API_KEY = process.env.HEDRA_API_KEY || "YOUR_HEDRA_API_KEY";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "YOUR_ELEVENLABS_API_KEY";
const HEDRA_API_BASE = "https://api.hedra.com/web-app/public";

// 테스트 이미지 (보리 영상에서 추출)
const TEST_IMAGE_PATH = "/tmp/shorts_analysis/frames/frame_001.jpg";
const OUTPUT_DIR = "/tmp/shorts_analysis";

async function generateTTS(text, voiceId = "EXAVITQu4vr4xnSDxMaL") {
  console.log(`🎤 TTS 생성 중: "${text}"`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    }
  );

  const audioPath = `${OUTPUT_DIR}/test_tts.mp3`;
  fs.writeFileSync(audioPath, Buffer.from(response.data));
  console.log(`   ✅ TTS 저장: ${audioPath} (${(response.data.byteLength / 1024).toFixed(1)} KB)`);

  return audioPath;
}

async function createLipSyncVideo(imagePath, audioPath) {
  console.log("\n🎬 Hedra Lip Sync 영상 생성 시작\n");

  const headers = {
    "X-API-Key": HEDRA_API_KEY,
    "Content-Type": "application/json",
  };

  // 1. Character 3 모델 찾기
  console.log("1️⃣ 모델 조회...");
  const modelsResponse = await axios.get(`${HEDRA_API_BASE}/models`, { headers });
  const characterModel = modelsResponse.data.find(m =>
    m.name?.includes("Character 3") || m.name?.includes("character")
  );

  if (!characterModel) {
    throw new Error("Character 3 모델을 찾을 수 없습니다");
  }
  console.log(`   모델: ${characterModel.name} (${characterModel.id})`);
  console.log(`   가격: ${characterModel.price_details?.credit_cost} credits/${characterModel.price_details?.billing_unit}\n`);

  // 2. 이미지 에셋 생성 & 업로드
  console.log("2️⃣ 이미지 업로드...");
  const imageAssetRes = await axios.post(
    `${HEDRA_API_BASE}/assets`,
    { name: "test_image.jpg", type: "image" },
    { headers }
  );
  const imageAssetId = imageAssetRes.data.id;
  console.log(`   에셋 ID: ${imageAssetId}`);

  const imageFormData = new FormData();
  imageFormData.append("file", fs.createReadStream(imagePath));

  await axios.post(
    `${HEDRA_API_BASE}/assets/${imageAssetId}/upload`,
    imageFormData,
    {
      headers: {
        "X-API-Key": HEDRA_API_KEY,
        ...imageFormData.getHeaders(),
      },
    }
  );
  console.log("   ✅ 이미지 업로드 완료\n");

  // 3. 오디오 에셋 생성 & 업로드
  console.log("3️⃣ 오디오 업로드...");
  const audioAssetRes = await axios.post(
    `${HEDRA_API_BASE}/assets`,
    { name: "test_audio.mp3", type: "audio" },
    { headers }
  );
  const audioAssetId = audioAssetRes.data.id;
  console.log(`   에셋 ID: ${audioAssetId}`);

  const audioFormData = new FormData();
  audioFormData.append("file", fs.createReadStream(audioPath));

  await axios.post(
    `${HEDRA_API_BASE}/assets/${audioAssetId}/upload`,
    audioFormData,
    {
      headers: {
        "X-API-Key": HEDRA_API_KEY,
        ...audioFormData.getHeaders(),
      },
    }
  );
  console.log("   ✅ 오디오 업로드 완료\n");

  // 4. 영상 생성 요청
  console.log("4️⃣ 영상 생성 요청...");
  const generationRes = await axios.post(
    `${HEDRA_API_BASE}/generations`,
    {
      type: "video",
      ai_model_id: characterModel.id,
      start_keyframe_id: imageAssetId,
      audio_id: audioAssetId,
      generated_video_inputs: {
        aspect_ratio: "9:16",
        resolution: "720p",
        text_prompt: "A cute dog talking naturally with precise lip sync, mouth opening and closing to match speech, subtle head movements, expressive eyes",
      },
    },
    { headers }
  );

  const generationId = generationRes.data.id;
  console.log(`   생성 ID: ${generationId}\n`);

  // 5. 완료 대기
  console.log("5️⃣ 생성 완료 대기 중...");
  let status = "pending";
  let resultUrl = null;
  let attempts = 0;
  const maxAttempts = 120; // 10분

  while (!["complete", "error"].includes(status) && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    const statusRes = await axios.get(
      `${HEDRA_API_BASE}/generations/${generationId}/status`,
      { headers }
    );
    const statusData = statusRes.data;

    status = statusData.status;
    const progress = Math.round((statusData.progress || 0) * 100);
    process.stdout.write(`\r   [${attempts * 5}초] 진행률: ${progress}% - ${status}        `);

    if (status === "complete") {
      resultUrl = statusData.url;
    } else if (status === "error") {
      throw new Error(statusData.error_message || "생성 실패");
    }
  }

  if (!resultUrl) {
    throw new Error("생성 시간 초과");
  }

  console.log("\n");

  // 6. 영상 다운로드
  console.log("6️⃣ 영상 다운로드...");
  const videoResponse = await axios.get(resultUrl, { responseType: "arraybuffer" });
  const outputPath = `${OUTPUT_DIR}/hedra_lipsync_result.mp4`;
  fs.writeFileSync(outputPath, Buffer.from(videoResponse.data));

  const fileSizeMB = (videoResponse.data.byteLength / 1024 / 1024).toFixed(2);
  console.log(`   ✅ 저장 완료: ${outputPath}`);
  console.log(`   파일 크기: ${fileSizeMB} MB`);

  return outputPath;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🎬 Hedra Lip Sync 전체 테스트");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // 이미지 확인
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      throw new Error(`테스트 이미지가 없습니다: ${TEST_IMAGE_PATH}`);
    }
    console.log(`📸 입력 이미지: ${TEST_IMAGE_PATH}\n`);

    // 1. TTS 생성
    const testText = "안녕하세요! 저는 보리예요. 오늘 날씨가 정말 좋아요!";
    const audioPath = await generateTTS(testText);

    // 2. Lip Sync 영상 생성
    const videoPath = await createLipSyncVideo(TEST_IMAGE_PATH, audioPath);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ✅ 테스트 성공!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n📺 결과 영상: ${videoPath}`);
    console.log("\n다음 명령으로 영상을 확인하세요:");
    console.log(`   open ${videoPath}`);

  } catch (error) {
    console.error("\n❌ 에러:", error.message);
    if (error.response?.data) {
      console.error("   응답:", JSON.stringify(error.response.data));
    }
    process.exit(1);
  }
}

main();
