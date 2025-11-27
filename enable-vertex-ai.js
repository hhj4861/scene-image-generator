import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs';

const PROJECT_ID = 'mcp-test-457809';
const credentialsPath = './google-credentials.json';

async function enableVertexAI() {
  console.log("═".repeat(60));
  console.log("🚀 Vertex AI API 활성화");
  console.log("═".repeat(60));

  // 서비스 계정 인증
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/service.management',
    ],
  });

  const authClient = await auth.getClient();
  const accessToken = await authClient.getAccessToken();

  console.log(`\n📋 Project: ${PROJECT_ID}`);
  console.log(`🔑 Service Account: ${credentials.client_email}`);

  // 1. 현재 활성화된 서비스 확인
  console.log("\n🔍 현재 활성화된 API 확인 중...");

  try {
    const serviceusage = google.serviceusage({ version: 'v1', auth });

    const listResponse = await serviceusage.services.list({
      parent: `projects/${PROJECT_ID}`,
      filter: 'state:ENABLED',
      pageSize: 200,
    });

    const enabledServices = listResponse.data.services || [];
    const vertexEnabled = enabledServices.some(s => s.name?.includes('aiplatform.googleapis.com'));

    console.log(`   총 ${enabledServices.length}개 API 활성화됨`);

    if (vertexEnabled) {
      console.log("   ✅ Vertex AI (aiplatform.googleapis.com) 이미 활성화됨!");
    } else {
      console.log("   ⚠️ Vertex AI 비활성화 상태");
    }

    // AI 관련 서비스 확인
    const aiServices = enabledServices.filter(s =>
      s.name?.includes('ai') ||
      s.name?.includes('ml') ||
      s.name?.includes('vision') ||
      s.name?.includes('video')
    );

    if (aiServices.length > 0) {
      console.log("\n   🤖 AI 관련 활성화된 API:");
      aiServices.forEach(s => {
        const name = s.name?.split('/').pop();
        console.log(`      - ${name}`);
      });
    }

  } catch (error) {
    console.error("❌ 서비스 목록 조회 실패:", error.message);
  }

  // 2. Vertex AI API 활성화
  console.log("\n" + "─".repeat(60));
  console.log("🔧 Vertex AI API 활성화 시도...");

  try {
    const serviceusage = google.serviceusage({ version: 'v1', auth });

    const enableResponse = await serviceusage.services.enable({
      name: `projects/${PROJECT_ID}/services/aiplatform.googleapis.com`,
    });

    console.log("✅ Vertex AI API 활성화 요청 성공!");

    if (enableResponse.data.name) {
      console.log(`   Operation: ${enableResponse.data.name}`);

      // 작업 완료 대기
      console.log("   ⏳ 활성화 완료 대기 중...");

      let done = false;
      let attempts = 0;

      while (!done && attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));

        try {
          const opResponse = await serviceusage.operations.get({
            name: enableResponse.data.name,
          });

          done = opResponse.data.done || false;
          if (done) {
            if (opResponse.data.error) {
              console.log(`   ❌ 활성화 실패: ${opResponse.data.error.message}`);
            } else {
              console.log("   ✅ Vertex AI API 활성화 완료!");
            }
          }
        } catch (e) {
          // operation 조회 실패해도 계속
        }
        attempts++;
      }
    }

  } catch (error) {
    if (error.message?.includes('already enabled') || error.code === 409) {
      console.log("✅ Vertex AI API 이미 활성화되어 있습니다!");
    } else {
      console.error("❌ 활성화 실패:", error.message);
      if (error.response?.data) {
        console.error("   Detail:", JSON.stringify(error.response.data).substring(0, 300));
      }
    }
  }

  // 3. Veo 모델 접근 테스트
  console.log("\n" + "─".repeat(60));
  console.log("🎬 Veo 모델 접근 테스트...");

  try {
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Vertex AI 접근 성공!");

      const models = data.models || data.publisherModels || [];
      const videoModels = models.filter(m =>
        m.name?.toLowerCase().includes('veo') ||
        m.name?.toLowerCase().includes('video')
      );

      if (videoModels.length > 0) {
        console.log("\n   🎥 비디오 생성 모델:");
        videoModels.forEach(m => console.log(`      - ${m.name}`));
      }
    } else {
      const error = await response.text();
      console.log(`❌ Vertex AI 접근 실패 (${response.status}): ${error.substring(0, 200)}`);
    }

  } catch (error) {
    console.error("❌ Veo 테스트 실패:", error.message);
  }

  // 4. 직접 Veo API 호출 테스트
  console.log("\n" + "─".repeat(60));
  console.log("🎬 Veo API 직접 호출 테스트...");

  const veoEndpoints = [
    'veo-2.0-generate-001',
    'veo-001',
    'imagegeneration@006',
  ];

  for (const model of veoEndpoints) {
    console.log(`\n🔄 모델: ${model}`);

    try {
      const response = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/${model}:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instances: [{ prompt: "A cute dog" }],
            parameters: { aspectRatio: "9:16" },
          }),
        }
      );

      const data = await response.text();

      if (response.ok) {
        console.log(`   ✅ 성공! Response: ${data.substring(0, 200)}`);
      } else {
        console.log(`   ❌ 실패 (${response.status}): ${data.substring(0, 150)}`);
      }

    } catch (error) {
      console.log(`   ❌ 에러: ${error.message}`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("📋 요약");
  console.log("═".repeat(60));
  console.log(`
Vertex AI Veo 사용 방법:
1. GCP Console에서 직접 활성화 필요할 수 있음
   → https://console.cloud.google.com/vertex-ai/model-garden?project=${PROJECT_ID}

2. Veo 모델 검색 후 "Enable" 클릭

3. Pipedream에서 설정:
   veo_project_id: "${PROJECT_ID}"
   veo_location: "us-central1"
  `);
}

enableVertexAI().catch(console.error);
