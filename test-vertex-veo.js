import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';

const PROJECT_ID = 'mcp-test-457809';
const LOCATION = 'us-central1';
const GCS_BUCKET = 'shorts-videos-storage-mcp-test-457809';
const credentialsPath = './google-credentials.json';

// 테스트할 모델들
const MODELS_TO_TEST = [
  'veo-2.0-generate-001',
];

async function testVertexVeo() {
  console.log("═".repeat(60));
  console.log("🎬 Vertex AI Video Generation 테스트");
  console.log("═".repeat(60));

  // 서비스 계정 인증
  if (!fs.existsSync(credentialsPath)) {
    console.error("❌ google-credentials.json 파일이 없습니다.");
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const authClient = await auth.getClient();
  const accessToken = await authClient.getAccessToken();

  console.log(`\n📋 Project: ${PROJECT_ID}`);
  console.log(`📍 Location: ${LOCATION}`);
  console.log(`🔑 Service Account: ${credentials.client_email}`);

  // 각 모델 테스트
  console.log("\n" + "─".repeat(60));
  console.log("🔍 모델별 API 테스트");
  console.log("─".repeat(60));

  const testPrompt = "A cute Shiba Inu dog looking at camera, subtle breathing motion, photorealistic, 4K quality";

  for (const model of MODELS_TO_TEST) {
    console.log(`\n🔄 모델: ${model}`);

    // predict 엔드포인트 테스트
    console.log(`   🔧 predict 엔드포인트 테스트...`);

    const requestData = {
      instances: [{
        prompt: testPrompt,
      }],
      parameters: {
        aspectRatio: "9:16",
        sampleCount: 1,
      },
    };

    // Veo 모델인 경우 추가 파라미터
    if (model.includes("veo")) {
      requestData.parameters.durationSeconds = 5;
      requestData.parameters.enhancePrompt = true;
    }

    try {
      const response = await fetch(
        `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        }
      );

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText.substring(0, 200) };
      }

      if (response.ok) {
        console.log(`   ✅ API 호출 성공!`);

        // Long-running operation인 경우
        if (responseData.name) {
          console.log(`   📋 Operation 시작: ${responseData.name}`);
          console.log(`   → 비동기 작업이 시작됨 (비디오 생성 중...)`);

          // Operation 상태 확인 (최대 10초만)
          console.log(`   ⏳ Operation 상태 확인 중...`);
          for (let i = 0; i < 2; i++) {
            await new Promise(r => setTimeout(r, 5000));

            const opResponse = await fetch(
              `https://${LOCATION}-aiplatform.googleapis.com/v1/${responseData.name}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken.token}`,
                },
              }
            );

            const opData = await opResponse.json();
            console.log(`   → 상태: done=${opData.done || false}`);

            if (opData.done) {
              if (opData.error) {
                console.log(`   ❌ Operation 실패: ${opData.error.message}`);
              } else {
                console.log(`   ✅ Operation 완료!`);
                console.log(`   → Response: ${JSON.stringify(opData.response || {}).substring(0, 200)}`);
              }
              break;
            }
          }
        }

        // 동기 응답인 경우 (Imagen)
        if (responseData.predictions) {
          console.log(`   📋 동기 응답 받음`);
          console.log(`   → predictions: ${responseData.predictions.length}개`);

          if (responseData.predictions[0]?.bytesBase64Encoded) {
            console.log(`   → 이미지 생성됨 (Base64)`);
          }
          if (responseData.predictions[0]?.video) {
            console.log(`   → 비디오 생성됨!`);
          }
        }

      } else {
        console.log(`   ❌ API 실패 (${response.status})`);

        if (response.status === 429) {
          console.log(`   → ⚠️ 할당량 초과 (Quota exceeded)`);
          console.log(`   → GCP Console에서 할당량 증가 요청 필요`);
        } else if (response.status === 404) {
          console.log(`   → 모델 또는 엔드포인트 없음`);
        } else if (response.status === 403) {
          console.log(`   → 권한 없음 - IAM 설정 확인 필요`);
        }

        if (responseData.error?.message) {
          console.log(`   → ${responseData.error.message.substring(0, 150)}`);
        }
      }

    } catch (error) {
      console.log(`   ❌ 요청 에러: ${error.message}`);
    }
  }

  // 결과 요약
  console.log("\n" + "═".repeat(60));
  console.log("📋 결과 요약");
  console.log("═".repeat(60));
  console.log(`
Vertex AI Veo 상태:
- veo-2.0-generate-001: 모델 존재, 할당량 제한 있을 수 있음
- imagen-3.0-generate-001: 이미지 생성용 (비디오 X)
- imagegeneration@006: Imagen 3 (이미지 생성용)

비디오 생성 대안:
1. GCP Console에서 Veo 할당량 증가 요청
   → https://console.cloud.google.com/iam-admin/quotas?project=${PROJECT_ID}

2. Runway API를 primary로 사용, Veo를 fallback으로 설정

3. 다른 비디오 생성 API 고려:
   - Kling AI
   - Luma AI (Dream Machine)
   - Pika Labs
  `);
}

testVertexVeo().catch(console.error);
