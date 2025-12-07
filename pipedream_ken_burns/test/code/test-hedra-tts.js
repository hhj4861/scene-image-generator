/**
 * Hedra Lip Sync 테스트 (Hedra 내장 TTS 사용)
 * 이미지 + 텍스트 → 입이 움직이는 영상 생성
 */

import axios from "axios";
import fs from "fs";
import FormData from "form-data";

// API 설정
const HEDRA_API_KEY = process.env.HEDRA_API_KEY || "YOUR_HEDRA_API_KEY";
const HEDRA_API_BASE = "https://api.hedra.com/web-app/public";

// 테스트 이미지 (보리 영상에서 추출)
const TEST_IMAGE_PATH = "/tmp/shorts_analysis/frames/frame_001.jpg";
const OUTPUT_DIR = "/tmp/shorts_analysis";

async function getAvailableVoices(headers) {
  console.log("   음성 목록 조회 중...");

  // assets에서 voice 타입 조회
  try {
    const assetsResponse = await axios.get(`${HEDRA_API_BASE}/assets?type=voice`, { headers });
    if (assetsResponse.data?.length > 0) {
      console.log(`   사용자 음성: ${assetsResponse.data.length}개`);
      return assetsResponse.data;
    }
  } catch (e) {
    console.log(`   사용자 음성 조회 실패: ${e.message}`);
  }

  // 기본 음성 목록 시도
  try {
    const voicesResponse = await axios.get(`${HEDRA_API_BASE}/voices`, { headers });
    if (voicesResponse.data?.length > 0) {
      console.log(`   기본 음성: ${voicesResponse.data.length}개`);
      return voicesResponse.data;
    }
  } catch (e) {
    console.log(`   기본 음성 조회 실패: ${e.message}`);
  }

  return [];
}

async function createVoiceFromAudio(headers) {
  console.log("   새 음성 생성 중 (Voice Clone)...");

  // 오디오 샘플 필요 - 여기서는 스킵
  return null;
}

async function createLipSyncVideoWithTTS(imagePath, text) {
  console.log("\n🎬 Hedra Lip Sync 영상 생성 (내장 TTS)\n");

  const headers = {
    "X-API-Key": HEDRA_API_KEY,
    "Content-Type": "application/json",
  };

  // 1. 모델 조회
  console.log("1️⃣ 모델 조회...");
  const modelsResponse = await axios.get(`${HEDRA_API_BASE}/models`, { headers });

  const characterModel = modelsResponse.data.find(m =>
    m.name?.includes("Character 3") || m.name?.includes("character")
  );

  console.log(`   Character 모델: ${characterModel?.name || 'Not found'}`);

  if (!characterModel) {
    throw new Error("Character 3 모델을 찾을 수 없습니다");
  }

  // 2. 음성 조회
  console.log("\n2️⃣ 음성 조회...");
  const voices = await getAvailableVoices(headers);

  let voiceId = null;

  if (voices.length > 0) {
    // 첫 번째 음성 사용
    voiceId = voices[0].id;
    console.log(`   선택된 음성: ${voices[0].name || voices[0].id}`);
  } else {
    console.log("   ⚠️ 사용 가능한 음성이 없습니다");
    console.log("   Hedra 대시보드에서 음성을 생성하거나 업로드해주세요");
    console.log("   https://app.hedra.com/");

    // 기본 UUID 시도 (문서 예제에서 가져온 것)
    console.log("\n   기본 음성 ID로 시도...");
  }

  // 3. 이미지 에셋 생성 & 업로드
  console.log("\n3️⃣ 이미지 업로드...");
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

  // 4. TTS 생성 요청
  console.log("4️⃣ TTS 생성 요청...");
  console.log(`   텍스트: "${text}"`);

  if (!voiceId) {
    // 음성이 없으면 먼저 voice asset 조회
    const listAssetsRes = await axios.get(`${HEDRA_API_BASE}/assets`, { headers });
    const voiceAssets = listAssetsRes.data?.filter(a => a.type === "voice") || [];

    if (voiceAssets.length > 0) {
      voiceId = voiceAssets[0].id;
      console.log(`   발견된 음성 에셋: ${voiceAssets[0].name || voiceId}`);
    } else {
      throw new Error("사용 가능한 음성이 없습니다. Hedra 대시보드에서 음성을 생성해주세요.");
    }
  }

  console.log(`   Voice ID: ${voiceId}`);

  const ttsResponse = await axios.post(
    `${HEDRA_API_BASE}/generations`,
    {
      type: "text_to_speech",
      text_to_speech: {
        voice_id: voiceId,
        text: text,
        stability: 0.5,
        speed: 1.0,
      },
    },
    { headers }
  );

  const ttsGenId = ttsResponse.data.id;
  const ttsAssetId = ttsResponse.data.asset_id;
  console.log(`   TTS 생성 ID: ${ttsGenId}`);
  console.log(`   TTS 에셋 ID: ${ttsAssetId}`);

  // TTS 완료 대기
  console.log("   TTS 생성 대기 중...");
  let ttsStatus = "pending";
  let audioUrl = null;

  while (!["complete", "error"].includes(ttsStatus)) {
    await new Promise(r => setTimeout(r, 3000));

    const statusRes = await axios.get(
      `${HEDRA_API_BASE}/generations/${ttsGenId}/status`,
      { headers }
    );

    ttsStatus = statusRes.data.status;
    process.stdout.write(`\r   TTS 상태: ${ttsStatus}        `);

    if (ttsStatus === "complete") {
      audioUrl = statusRes.data.url;
    } else if (ttsStatus === "error") {
      throw new Error(statusRes.data.error_message || "TTS 생성 실패");
    }
  }
  console.log(`\n   ✅ TTS 생성 완료: ${audioUrl}\n`);

  // 5. 영상 생성 요청
  console.log("5️⃣ 영상 생성 요청...");
  const generationRes = await axios.post(
    `${HEDRA_API_BASE}/generations`,
    {
      type: "video",
      ai_model_id: characterModel.id,
      start_keyframe_id: imageAssetId,
      audio_id: ttsAssetId,
      generated_video_inputs: {
        aspect_ratio: "9:16",
        resolution: "720p",
        text_prompt: "A cute dog talking naturally with precise lip sync, mouth movements matching speech",
      },
    },
    { headers }
  );

  const generationId = generationRes.data.id;
  console.log(`   생성 ID: ${generationId}\n`);

  // 6. 완료 대기
  console.log("6️⃣ 영상 생성 대기 중...");
  let status = "pending";
  let resultUrl = null;
  let attempts = 0;
  const maxAttempts = 120;

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

  // 7. 영상 다운로드
  console.log("7️⃣ 영상 다운로드...");
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
  console.log("  🎬 Hedra Lip Sync 테스트 (내장 TTS)");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // 이미지 확인
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      throw new Error(`테스트 이미지가 없습니다: ${TEST_IMAGE_PATH}`);
    }
    console.log(`📸 입력 이미지: ${TEST_IMAGE_PATH}`);

    const testText = "Hello! My name is Bori. Nice to meet you!";

    const videoPath = await createLipSyncVideoWithTTS(TEST_IMAGE_PATH, testText);

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
