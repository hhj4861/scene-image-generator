import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';

const VEO_API_KEY = process.env.VEO_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// 테스트용 샘플 이미지 (작은 1x1 PNG)
const SAMPLE_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// 사용 가능한 Veo 모델들
const VEO_MODELS = [
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.0-generate-001',
  'veo-2.0-generate-001',
];

async function testVeoGenAI() {
  console.log("═".repeat(60));
  console.log("🎬 Google AI Veo API 테스트 (generativelanguage.googleapis.com)");
  console.log("═".repeat(60));

  if (!VEO_API_KEY) {
    console.error("❌ VEO_API_KEY가 .env에 없습니다.");
    process.exit(1);
  }

  console.log(`\n🔑 API Key: ${VEO_API_KEY.substring(0, 15)}...`);
  console.log(`🌐 Base URL: ${BASE_URL}`);

  // 1. 사용 가능한 모델 목록 확인
  console.log("\n" + "─".repeat(60));
  console.log("📋 사용 가능한 모델 확인...");

  try {
    const modelsResponse = await axios.get(
      `${BASE_URL}/models?key=${VEO_API_KEY}`
    );

    const models = modelsResponse.data.models || [];
    const veoModels = models.filter(m =>
      m.name?.includes('veo') ||
      m.supportedGenerationMethods?.includes('generateVideo')
    );

    console.log(`\n✅ 총 ${models.length}개 모델 발견`);

    if (veoModels.length > 0) {
      console.log("\n🎥 Veo/비디오 관련 모델:");
      veoModels.forEach(m => {
        console.log(`   - ${m.name}`);
        console.log(`     Methods: ${m.supportedGenerationMethods?.join(', ') || 'N/A'}`);
      });
    } else {
      console.log("\n⚠️ Veo 모델이 목록에 없습니다.");
      console.log("   모델 목록 샘플:");
      models.slice(0, 10).forEach(m => {
        console.log(`   - ${m.name}`);
      });
    }

  } catch (error) {
    console.error("❌ 모델 목록 조회 실패:", error.response?.data?.error?.message || error.message);
  }

  // 2. 각 Veo 모델 직접 호출 테스트
  console.log("\n" + "─".repeat(60));
  console.log("🔄 Veo 모델 직접 호출 테스트...");

  const testPrompt = "A cute Shiba Inu dog looking at camera, subtle breathing motion";

  for (const model of VEO_MODELS) {
    console.log(`\n🎬 모델: ${model}`);

    // predictLongRunning 엔드포인트 시도
    const endpoint = `${BASE_URL}/models/${model}:predictLongRunning?key=${VEO_API_KEY}`;

    const requestData = {
      instances: [{
        prompt: testPrompt,
        image: {
          bytesBase64Encoded: SAMPLE_IMAGE_BASE64,
          mimeType: "image/png",
        },
      }],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: 4,
      },
    };

    try {
      console.log(`   📡 Endpoint: ${endpoint.split('?')[0]}`);

      const response = await axios.post(endpoint, requestData, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      console.log(`   ✅ 성공!`);

      if (response.data.name) {
        console.log(`   📋 Operation: ${response.data.name}`);
        console.log(`   → Long-running operation 시작됨!`);

        // Operation 상태 확인 (5초 대기)
        console.log(`   ⏳ Operation 상태 확인 중...`);
        await new Promise(r => setTimeout(r, 5000));

        try {
          const opResponse = await axios.get(
            `${BASE_URL}/${response.data.name}?key=${VEO_API_KEY}`
          );
          console.log(`   → done: ${opResponse.data.done || false}`);
          if (opResponse.data.error) {
            console.log(`   → error: ${opResponse.data.error.message}`);
          }
        } catch (opError) {
          console.log(`   → Operation 조회: ${opError.response?.status || opError.message}`);
        }
      }

      console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);

    } catch (error) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.message;

      console.log(`   ❌ 실패 (${status}): ${errorMsg.substring(0, 100)}`);

      if (status === 404) {
        console.log(`   → 모델이 존재하지 않거나 API에서 지원하지 않음`);
      } else if (status === 403) {
        console.log(`   → API Key에 Veo 접근 권한이 없을 수 있음`);
      } else if (status === 429) {
        console.log(`   → 할당량 초과`);
      }
    }

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 1000));
  }

  // 3. generateVideo 엔드포인트 시도
  console.log("\n" + "─".repeat(60));
  console.log("🔄 generateVideo 엔드포인트 테스트...");

  for (const model of ['veo-3.1-generate-preview', 'veo-2.0-generate-001']) {
    console.log(`\n🎬 모델: ${model} (generateVideo)`);

    const endpoint = `${BASE_URL}/models/${model}:generateVideo?key=${VEO_API_KEY}`;

    const requestData = {
      contents: [{
        parts: [
          { text: testPrompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: SAMPLE_IMAGE_BASE64,
            },
          },
        ],
      }],
      generationConfig: {
        aspectRatio: "9:16",
      },
    };

    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      console.log(`   ✅ 성공!`);
      console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);

    } catch (error) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.message;
      console.log(`   ❌ 실패 (${status}): ${errorMsg.substring(0, 100)}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n" + "═".repeat(60));
  console.log("📋 요약");
  console.log("═".repeat(60));
  console.log(`
Veo API 상태:
- Google AI (generativelanguage.googleapis.com) 방식 테스트 완료
- Veo 모델이 API 목록에 없으면 Waitlist 등록 필요할 수 있음
- https://aistudio.google.com/ 에서 Veo 액세스 확인

대안:
1. Vertex AI 방식 시도 (GCP 프로젝트 필요)
2. Runway API 사용 (현재 primary)
3. Kling AI 추가
  `);
}

testVeoGenAI().catch(console.error);
