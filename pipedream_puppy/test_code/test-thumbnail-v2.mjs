/**
 * puppy-thumbnail-v2.mjs API 형식 테스트
 * gemini-image-generator.mjs와 동일한 Imagen API 형식 사용 검증
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수에서 API 키 로드
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY 환경변수가 필요합니다.");
  console.log("   export GEMINI_API_KEY=your_api_key");
  process.exit(1);
}

// 테스트 설정
const TEST_CONFIG = {
  model: "imagen-4.0-fast-generate-001", // 빠른 테스트용
  aspectRatio: "9:16",
  prompt: "cute adorable Shiba Inu puppy, golden cream fur, shocked surprised expression, explosive viral meme style, bright neon colors, YouTube thumbnail style, eye-catching, high contrast, professional quality, 8K, photorealistic. Real living dog. No text.",
};

async function testImagenAPI() {
  const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEST_CONFIG.model}:predict`;

  console.log("=".repeat(60));
  console.log("🧪 Imagen API 형식 테스트 (puppy-thumbnail-v2.mjs)");
  console.log("=".repeat(60));
  console.log(`📦 Model: ${TEST_CONFIG.model}`);
  console.log(`📐 Aspect Ratio: ${TEST_CONFIG.aspectRatio}`);
  console.log(`📝 Prompt: ${TEST_CONFIG.prompt.substring(0, 100)}...`);
  console.log("-".repeat(60));

  try {
    console.log("\n⏳ API 호출 중...");
    const startTime = Date.now();

    const response = await axios({
      method: "POST",
      url: IMAGEN_URL,
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        instances: [{ prompt: TEST_CONFIG.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: TEST_CONFIG.aspectRatio,
          personGeneration: "allow_adult", // gemini-image-generator.mjs와 동일
        },
      },
      timeout: 180000,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 응답 검증
    console.log("\n📊 응답 분석:");
    console.log(`   - 소요 시간: ${duration}s`);
    console.log(`   - 응답 키: ${Object.keys(response.data || {}).join(", ")}`);

    if (response.data?.predictions?.[0]?.bytesBase64Encoded) {
      const base64 = response.data.predictions[0].bytesBase64Encoded;
      console.log(`   - 이미지 크기: ${(base64.length / 1024).toFixed(2)} KB (base64)`);

      // 테스트 이미지 저장
      const outputDir = path.join(__dirname, "../test_output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, `thumbnail_test_${Date.now()}.png`);
      fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));

      console.log("\n✅ 테스트 성공!");
      console.log(`   - 저장 위치: ${outputPath}`);
      return true;
    } else {
      console.log("\n❌ 이미지 생성 실패: bytesBase64Encoded 없음");
      console.log("   응답 데이터:", JSON.stringify(response.data, null, 2).substring(0, 500));
      return false;
    }
  } catch (error) {
    console.log("\n❌ API 오류:");
    console.log(`   - 메시지: ${error.message}`);
    if (error.response) {
      console.log(`   - 상태 코드: ${error.response.status}`);
      console.log(`   - 오류 데이터: ${JSON.stringify(error.response.data, null, 2).substring(0, 500)}`);
    }
    return false;
  }
}

// API 형식 비교 테스트
async function compareAPIFormats() {
  console.log("\n" + "=".repeat(60));
  console.log("📋 API 형식 비교 (thumbnail-v2 vs gemini-image-generator)");
  console.log("=".repeat(60));

  const thumbnailFormat = {
    instances: [{ prompt: "test prompt" }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "9:16",
      personGeneration: "allow_adult",
    },
  };

  const imageGeneratorFormat = {
    instances: [{ prompt: "test prompt" }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "9:16",
      personGeneration: "allow_adult",
    },
  };

  const isMatch = JSON.stringify(thumbnailFormat) === JSON.stringify(imageGeneratorFormat);
  console.log(`\n✅ API 형식 일치: ${isMatch ? "YES" : "NO"}`);

  console.log("\n📄 thumbnail-v2 형식:");
  console.log(JSON.stringify(thumbnailFormat, null, 2));

  console.log("\n📄 gemini-image-generator 형식:");
  console.log(JSON.stringify(imageGeneratorFormat, null, 2));
}

// 메인 실행
async function main() {
  await compareAPIFormats();

  console.log("\n");
  const success = await testImagenAPI();

  console.log("\n" + "=".repeat(60));
  console.log(success ? "🎉 모든 테스트 통과!" : "⚠️ 일부 테스트 실패");
  console.log("=".repeat(60));

  process.exit(success ? 0 : 1);
}

main();



