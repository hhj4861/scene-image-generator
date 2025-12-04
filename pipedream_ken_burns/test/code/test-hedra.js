/**
 * Hedra Lip Sync API 테스트 스크립트
 *
 * 사용법:
 *   node test-hedra.js
 */

import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const HEDRA_API_KEY = "sk_hedra_Wol7WbVDfGY89wBxcoHJm7pUVSA1ikTujy6p_VKJEax42knl1i85g-4xW9VhpgG1";
const HEDRA_API_BASE = "https://api.hedra.com/web-app/public";

// 테스트용 이미지 (분석한 보리 영상에서 추출한 프레임)
const TEST_IMAGE_PATH = "/tmp/shorts_analysis/frames/frame_001.jpg";

async function testHedraAPI() {
  console.log("🎬 Hedra Lip Sync API 테스트 시작\n");

  const headers = {
    "X-API-Key": HEDRA_API_KEY,
    "Content-Type": "application/json",
  };

  try {
    // =====================
    // 1. 모델 목록 조회
    // =====================
    console.log("1️⃣ 사용 가능한 모델 조회...");

    const modelsResponse = await axios.get(`${HEDRA_API_BASE}/models`, { headers });
    const models = modelsResponse.data;

    console.log(`   총 ${models.length}개 모델 발견\n`);

    // video/character 타입 모델만 필터링
    const videoModels = models.filter(m =>
      m.type === "video" ||
      m.type === "character" ||
      m.name?.toLowerCase().includes("character")
    );

    console.log("   📹 Video/Character 모델:");
    videoModels.forEach(m => {
      console.log(`      - ${m.name} (${m.id})`);
      console.log(`        Type: ${m.type}`);
      if (m.price_details) {
        console.log(`        Cost: ${m.price_details.credit_cost} credits/${m.price_details.billing_unit}`);
      }
      if (m.aspect_ratios) {
        console.log(`        Aspect Ratios: ${m.aspect_ratios.join(", ")}`);
      }
      console.log();
    });

    // =====================
    // 2. 크레딧 잔액 확인
    // =====================
    console.log("2️⃣ 크레딧 잔액 확인...");

    try {
      const creditsResponse = await axios.get(`${HEDRA_API_BASE}/credits`, { headers });
      console.log(`   💰 잔액: ${JSON.stringify(creditsResponse.data)}\n`);
    } catch (e) {
      console.log(`   ⚠️ 크레딧 조회 실패: ${e.response?.status || e.message}\n`);
    }

    // =====================
    // 3. 이미지 에셋 생성 테스트
    // =====================
    console.log("3️⃣ 이미지 에셋 생성 테스트...");

    try {
      const imageAssetResponse = await axios.post(
        `${HEDRA_API_BASE}/assets`,
        {
          name: `test_image_${Date.now()}.jpg`,
          type: "image",
        },
        { headers }
      );

      const imageAsset = imageAssetResponse.data;
      console.log(`   ✅ 이미지 에셋 생성 성공`);
      console.log(`      ID: ${imageAsset.id}`);
      console.log(`      Name: ${imageAsset.name}\n`);

      // =====================
      // 4. 이미지 업로드 테스트
      // =====================
      console.log("4️⃣ 이미지 업로드 테스트...");

      if (fs.existsSync(TEST_IMAGE_PATH)) {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(TEST_IMAGE_PATH));

        const uploadResponse = await axios.post(
          `${HEDRA_API_BASE}/assets/${imageAsset.id}/upload`,
          formData,
          {
            headers: {
              "X-API-Key": HEDRA_API_KEY,
              ...formData.getHeaders(),
            },
          }
        );

        console.log(`   ✅ 이미지 업로드 성공`);
        console.log(`      URL: ${uploadResponse.data?.asset?.url || "N/A"}\n`);

      } else {
        console.log(`   ⚠️ 테스트 이미지 없음: ${TEST_IMAGE_PATH}`);
        console.log(`      먼저 YouTube 영상 분석을 실행하세요.\n`);
      }

    } catch (e) {
      console.log(`   ❌ 에셋 생성/업로드 실패: ${e.response?.status || e.message}`);
      if (e.response?.data) {
        console.log(`      ${JSON.stringify(e.response.data)}\n`);
      }
    }

    console.log("✅ Hedra API 연결 테스트 완료!");
    console.log("\n📋 다음 단계:");
    console.log("   1. TTS 오디오 파일 준비 (ElevenLabs)");
    console.log("   2. 이미지 + 오디오로 영상 생성 테스트");
    console.log("   3. Pipedream 워크플로우에 통합");

  } catch (error) {
    console.error("❌ 에러 발생:", error.message);
    if (error.response?.data) {
      console.error("   응답:", JSON.stringify(error.response.data));
    }
  }
}

// 전체 Lip Sync 생성 테스트 (이미지 + 오디오 → 영상)
async function testFullLipSync(imageUrl, audioUrl) {
  console.log("\n🎬 Full Lip Sync 생성 테스트\n");

  const headers = {
    "X-API-Key": HEDRA_API_KEY,
    "Content-Type": "application/json",
  };

  try {
    // 1. 모델 ID 가져오기
    console.log("1️⃣ 모델 조회...");
    const modelsResponse = await axios.get(`${HEDRA_API_BASE}/models`, { headers });
    const models = modelsResponse.data;
    const characterModel = models.find(m =>
      m.type === "character" || m.name?.toLowerCase().includes("character")
    );

    if (!characterModel) {
      throw new Error("Character 모델을 찾을 수 없습니다");
    }
    console.log(`   모델: ${characterModel.name} (${characterModel.id})\n`);

    // 2. 이미지 에셋 생성 & 업로드
    console.log("2️⃣ 이미지 에셋 생성...");
    const imageAssetRes = await axios.post(
      `${HEDRA_API_BASE}/assets`,
      { name: "test_image.jpg", type: "image" },
      { headers }
    );
    const imageAsset = imageAssetRes.data;
    console.log(`   ID: ${imageAsset.id}`);

    // 이미지 다운로드 & 업로드
    const imageData = await axios.get(imageUrl, { responseType: "arraybuffer" });

    const formData = new FormData();
    formData.append("file", Buffer.from(imageData.data), { filename: "image.jpg" });

    await axios.post(
      `${HEDRA_API_BASE}/assets/${imageAsset.id}/upload`,
      formData,
      {
        headers: {
          "X-API-Key": HEDRA_API_KEY,
          ...formData.getHeaders(),
        },
      }
    );
    console.log("   ✅ 이미지 업로드 완료\n");

    // 3. 오디오 에셋 생성 & 업로드
    console.log("3️⃣ 오디오 에셋 생성...");
    const audioAssetRes = await axios.post(
      `${HEDRA_API_BASE}/assets`,
      { name: "test_audio.mp3", type: "audio" },
      { headers }
    );
    const audioAsset = audioAssetRes.data;
    console.log(`   ID: ${audioAsset.id}`);

    const audioData = await axios.get(audioUrl, { responseType: "arraybuffer" });

    const audioFormData = new FormData();
    audioFormData.append("file", Buffer.from(audioData.data), { filename: "audio.mp3" });

    await axios.post(
      `${HEDRA_API_BASE}/assets/${audioAsset.id}/upload`,
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
        start_keyframe_id: imageAsset.id,
        audio_id: audioAsset.id,
        generated_video_inputs: {
          aspect_ratio: "9:16",
        },
      },
      { headers }
    );

    const generation = generationRes.data;
    console.log(`   Generation ID: ${generation.id}`);
    console.log(`   Asset ID: ${generation.asset_id}\n`);

    // 5. 완료 대기
    console.log("5️⃣ 생성 완료 대기 중...");
    let status = "pending";
    let resultUrl = null;

    while (!["complete", "error"].includes(status)) {
      await new Promise(r => setTimeout(r, 5000));

      const statusRes = await axios.get(
        `${HEDRA_API_BASE}/generations/${generation.id}/status`,
        { headers }
      );
      const statusData = statusRes.data;

      status = statusData.status;
      const progress = Math.round((statusData.progress || 0) * 100);
      process.stdout.write(`\r   진행률: ${progress}% - ${status}    `);

      if (status === "complete") {
        resultUrl = statusData.url;
      } else if (status === "error") {
        throw new Error(statusData.error_message || "생성 실패");
      }
    }

    console.log("\n\n✅ 영상 생성 완료!");
    console.log(`   URL: ${resultUrl}`);

    return resultUrl;

  } catch (error) {
    console.error("\n❌ 에러:", error.message);
    if (error.response?.data) {
      console.error("   응답:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// 메인 실행
testHedraAPI();

// 전체 테스트 실행 (이미지/오디오 URL이 있을 때)
// testFullLipSync(
//   "https://storage.googleapis.com/bucket/image.jpg",
//   "https://storage.googleapis.com/bucket/audio.mp3"
// );

export { testHedraAPI, testFullLipSync };
