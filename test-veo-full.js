import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const VEO_API_KEY = process.env.VEO_API_KEY;
const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';

// 테스트용 이미지 (GCS에 있는 이미지 URL 또는 로컬 이미지)
const TEST_IMAGE_URL = 'https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/test_images/shiba_inu.png';

async function testVeoFull() {
  console.log("═".repeat(60));
  console.log("🎬 Veo API 전체 테스트 (이미지 → 비디오)");
  console.log("═".repeat(60));

  if (!VEO_API_KEY) {
    console.error("❌ VEO_API_KEY가 .env에 없습니다.");
    process.exit(1);
  }

  console.log(`\n🔑 API Key: ${VEO_API_KEY.substring(0, 15)}...`);
  console.log(`🎬 Model: ${MODEL}`);

  // 1. 테스트 이미지 준비
  console.log("\n" + "─".repeat(60));
  console.log("📷 테스트 이미지 준비...");

  let imageBase64;
  let mimeType = "image/png";

  try {
    // 샘플 이미지 생성 (간단한 컬러 이미지)
    // 실제로는 GCS의 이미지를 사용
    const response = await axios.get(TEST_IMAGE_URL, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    imageBase64 = Buffer.from(response.data).toString('base64');
    console.log(`   ✅ 이미지 다운로드 완료 (${(imageBase64.length / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.log(`   ⚠️ 이미지 다운로드 실패: ${error.message}`);
    console.log("   → 샘플 이미지 사용");

    // 작은 샘플 이미지 (빨간색 1x1 PNG)
    imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  // 2. Veo API 호출
  console.log("\n" + "─".repeat(60));
  console.log("🚀 Veo API 호출...");

  const testPrompt = "A cute Shiba Inu dog looking at camera with curious expression, subtle breathing motion, ear twitching slightly, photorealistic, cinematic lighting, 4K quality";

  const requestData = {
    instances: [{
      prompt: testPrompt,
      image: {
        bytesBase64Encoded: imageBase64,
        mimeType: mimeType,
      },
    }],
    parameters: {
      aspectRatio: "9:16",
      durationSeconds: 6,  // 정수! 유효값: 4, 6, 8
      personGeneration: "allow_adult",
    },
  };

  const endpoint = `${VEO_BASE_URL}/models/${MODEL}:predictLongRunning?key=${VEO_API_KEY}`;

  console.log(`   📡 Endpoint: ${endpoint.split('?')[0]}`);
  console.log(`   📝 Prompt: "${testPrompt.substring(0, 50)}..."`);

  try {
    const startTime = Date.now();

    const createResponse = await axios.post(endpoint, requestData, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    const operationName = createResponse.data.name;
    console.log(`   ✅ Operation 시작: ${operationName}`);

    // 3. Operation 완료 대기
    console.log("\n" + "─".repeat(60));
    console.log("⏳ 비디오 생성 대기 중...");

    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 72; // 6분

    while (!videoUrl && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   ⏱️  ${elapsed}s 경과 (${attempts}/${maxAttempts})...`);

      try {
        const statusResponse = await axios.get(
          `${VEO_BASE_URL}/${operationName}?key=${VEO_API_KEY}`
        );

        if (statusResponse.data.done) {
          console.log("\n   ✅ Operation 완료!");

          if (statusResponse.data.error) {
            console.log(`   ❌ 에러: ${statusResponse.data.error.message}`);
            break;
          }

          const response = statusResponse.data.response;
          console.log("\n   📋 Response 구조:");
          console.log(`   ${JSON.stringify(response, null, 2).substring(0, 500)}`);

          // 형식 1: generateVideoResponse.generatedSamples (최신)
          if (response?.generateVideoResponse?.generatedSamples?.length > 0) {
            const sample = response.generateVideoResponse.generatedSamples[0];
            if (sample.video?.uri) {
              videoUrl = sample.video.uri;
              console.log("\n   🎥 Video URL (generatedSamples):");
            }
          }

          // 형식 2: generatedVideos
          if (!videoUrl && response?.generatedVideos?.length > 0) {
            const video = response.generatedVideos[0];
            if (video.video?.uri) {
              videoUrl = video.video.uri;
              console.log("\n   🎥 Video URL (generatedVideos):");
            }
          }

          // 형식 3: videos
          if (!videoUrl && response?.videos?.length > 0) {
            videoUrl = response.videos[0].gcsUri || response.videos[0].uri;
            console.log("\n   🎥 Video URL (videos):");
          }

          break;
        }
      } catch (pollError) {
        console.log(`\n   ⚠️ 상태 조회 에러: ${pollError.message}`);
      }
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);

    if (videoUrl) {
      console.log("\n" + "═".repeat(60));
      console.log("🎉 비디오 생성 완료!");
      console.log("═".repeat(60));
      console.log(`   📹 URL: ${videoUrl}`);
      console.log(`   ⏱️  총 시간: ${totalTime}초`);
    } else {
      console.log("\n" + "═".repeat(60));
      console.log("❌ 비디오 생성 실패 또는 타임아웃");
      console.log("═".repeat(60));
      console.log(`   ⏱️  총 시간: ${totalTime}초`);
    }

  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;

    console.log(`\n   ❌ API 호출 실패 (${status})`);

    if (errorData?.error) {
      console.log(`   → ${errorData.error.message}`);
      console.log(`   → Code: ${errorData.error.code}`);
    } else {
      console.log(`   → ${error.message}`);
    }
  }
}

testVeoFull().catch(console.error);
