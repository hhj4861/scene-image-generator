import 'dotenv/config';
import axios from 'axios';

const VEO_API_KEY = process.env.VEO_API_KEY;

async function testVeoAPI() {
  console.log("═".repeat(60));
  console.log("🎬 Google Veo API 테스트");
  console.log("═".repeat(60));

  if (!VEO_API_KEY) {
    console.error("❌ VEO_API_KEY가 .env에 없습니다.");
    process.exit(1);
  }

  console.log(`\n🔑 API Key: ${VEO_API_KEY.substring(0, 10)}...`);

  // 1. 먼저 사용 가능한 모델 목록 확인
  console.log("\n📋 사용 가능한 모델 확인 중...");

  try {
    const modelsResponse = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${VEO_API_KEY}`
    );

    const videoModels = modelsResponse.data.models?.filter(m =>
      m.name.includes('veo') ||
      m.supportedGenerationMethods?.includes('generateVideo')
    ) || [];

    console.log(`\n✅ 총 ${modelsResponse.data.models?.length || 0}개 모델 발견`);

    if (videoModels.length > 0) {
      console.log("\n🎥 비디오 생성 가능 모델:");
      videoModels.forEach(m => {
        console.log(`   - ${m.name}`);
        console.log(`     Methods: ${m.supportedGenerationMethods?.join(', ')}`);
      });
    } else {
      console.log("\n⚠️ Veo 모델이 목록에 없습니다. 직접 호출 테스트...");
    }

    // 모든 모델 이름 출력 (디버깅용)
    console.log("\n📜 전체 모델 목록:");
    modelsResponse.data.models?.forEach(m => {
      console.log(`   ${m.name}`);
    });

  } catch (error) {
    console.error("❌ 모델 목록 조회 실패:", error.response?.data || error.message);
  }

  // 2. Veo API 직접 호출 테스트 (텍스트 → 비디오)
  console.log("\n" + "─".repeat(60));
  console.log("🎬 Veo Text-to-Video 테스트...");

  const testPrompt = "A cute Shiba Inu dog looking at camera, subtle breathing motion, photorealistic, 4K quality";

  // 여러 엔드포인트 시도
  const endpoints = [
    {
      name: "Veo 2.0 generateVideo",
      url: `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateVideo?key=${VEO_API_KEY}`,
      data: {
        contents: [{ parts: [{ text: testPrompt }] }],
        generationConfig: { aspectRatio: "9:16" }
      }
    },
    {
      name: "Imagen Video",
      url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${VEO_API_KEY}`,
      data: {
        instances: [{ prompt: testPrompt }],
        parameters: { aspectRatio: "9:16" }
      }
    },
    {
      name: "generateContent (video)",
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${VEO_API_KEY}`,
      data: {
        contents: [{ parts: [{ text: `Generate a video: ${testPrompt}` }] }]
      }
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🔄 시도: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url.split('?')[0]}`);

    try {
      const response = await axios.post(endpoint.url, endpoint.data, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      console.log("✅ 성공!");
      console.log("   Response:", JSON.stringify(response.data).substring(0, 500));

      // operation name이 있으면 비동기 작업
      if (response.data.name) {
        console.log(`   Operation: ${response.data.name}`);
        console.log("   → Long-running operation 시작됨. 폴링 필요.");
      }

      return response.data;

    } catch (error) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.message;

      console.log(`❌ 실패 (${status}): ${errorMsg}`);

      if (error.response?.data) {
        console.log("   Full error:", JSON.stringify(error.response.data).substring(0, 300));
      }
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("💡 참고: Veo API는 아직 제한된 프리뷰일 수 있습니다.");
  console.log("   - Vertex AI 방식 시도 필요할 수 있음");
  console.log("   - 또는 waitlist 등록 필요");
  console.log("═".repeat(60));
}

testVeoAPI().catch(console.error);
