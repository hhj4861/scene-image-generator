/**
 * 스키장 땅콩 - 썸네일 이미지 생성 테스트
 * puppy-thumbnail-v2.mjs 로직 기반
 *
 * 사용법:
 *   GEMINI_API_KEY=xxx node test-thumbnail.mjs [스타일]
 *
 *   스타일 옵션:
 *   - viral (기본): 바이럴/밈 스타일
 *   - cute: 귀여움/하트 스타일
 *   - news: 뉴스/속보 스타일
 *   - dramatic: 드라마틱/영화 스타일
 *
 *   예: node test-thumbnail.mjs viral
 *       node test-thumbnail.mjs cute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Imagen API 설정
const IMAGEN_MODELS = {
  ultra: "imagen-4.0-ultra-generate-001",
  standard: "imagen-4.0-generate-001",
  fast: "imagen-4.0-fast-generate-001",
};

const IMAGEN_MODEL = IMAGEN_MODELS.standard; // 기본값: standard
const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;

// 출력 폴더
const outputDir = path.join(__dirname, 'thumbnail');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// =====================================================
// 스키장 땅콩 캐릭터 프롬프트
// =====================================================
const DANGGLE_CHARACTER_PROMPT = `cute adorable brown fluffy Pomeranian puppy with round sparkling eyes, wearing colorful ski gear with goggles on head, fluffy brown fur, small cute nose, happy cheerful expression`;

// =====================================================
// 썸네일 스타일별 프롬프트
// =====================================================
const STYLE_PROMPTS = {
  viral: {
    style: "explosive viral meme style, bright neon colors, dynamic action pose, snowy ski slope background",
    mood: "shocking, funny, over-the-top reaction, surprised expression with mouth open",
    colors: "bright yellow, hot pink, electric blue highlights, white snow sparkles",
  },
  cute: {
    style: "kawaii adorable style, soft pastel colors, sparkles and hearts, cozy winter atmosphere",
    mood: "heartwarming, sweet, lovable, innocent happy expression with sparkling eyes",
    colors: "soft pink, baby blue, cream white, golden sparkles, fluffy snow",
  },
  news: {
    style: "breaking news broadcast style, dramatic lighting, urgent ski resort atmosphere",
    mood: "serious but satirical, newsroom feel, confident determined expression",
    colors: "red alert colors, white snow, professional blue sky background",
  },
  dramatic: {
    style: "cinematic dramatic style, emotional sunset lighting on ski mountain, movie poster feel",
    mood: "intense, emotional, epic adventure story, contemplative heroic expression",
    colors: "deep contrast, warm orange sunset glow, cool blue snow shadows",
  },
};

// =====================================================
// 텍스트 금지 강조 (동일하게 적용)
// =====================================================
const NO_TEXT_RULES = `Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. Real fur. Real animal. No text. No signs. No banners. No letters. No words. No writing. No Korean characters. No English text. Clean image without any text elements.`;

// =====================================================
// 썸네일 프롬프트 생성
// =====================================================
function buildThumbnailPrompt(style) {
  const selectedStyle = STYLE_PROMPTS[style] || STYLE_PROMPTS.viral;

  return `${DANGGLE_CHARACTER_PROMPT}, ${selectedStyle.mood}, ${selectedStyle.style}, ${selectedStyle.colors}, YouTube thumbnail style, eye-catching, high contrast, clean background, professional quality, 1080p, photorealistic, ultra detailed. ${NO_TEXT_RULES}`;
}

// =====================================================
// 간소화된 프롬프트 (재시도용)
// =====================================================
function buildSimplifiedPrompt(style) {
  const selectedStyle = STYLE_PROMPTS[style] || STYLE_PROMPTS.viral;

  return `${DANGGLE_CHARACTER_PROMPT}, ${selectedStyle.mood}, YouTube thumbnail style, eye-catching, high contrast, professional quality, 1080p, photorealistic. Real living dog. No text.`;
}

// =====================================================
// Imagen API 호출
// =====================================================
async function generateImage(prompt, apiKey, aspectRatio = "9:16") {
  console.log("\n=== Imagen API 요청 ===");
  console.log("Model:", IMAGEN_MODEL);
  console.log("Aspect Ratio:", aspectRatio);
  console.log("\n--- 프롬프트 ---");
  console.log(prompt);
  console.log("--- 프롬프트 끝 ---\n");

  const response = await fetch(IMAGEN_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio,
        personGeneration: "allow_adult",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Imagen API failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;

  if (!imageBase64) {
    throw new Error("No image data in response");
  }

  return imageBase64;
}

// =====================================================
// 이미지 저장
// =====================================================
function saveImage(imageBase64, style) {
  const timestamp = Date.now();
  const filename = `thumbnail_${style}_${timestamp}.png`;
  const outputPath = path.join(outputDir, filename);

  const imageBuffer = Buffer.from(imageBase64, "base64");
  fs.writeFileSync(outputPath, imageBuffer);

  console.log("\n=== 이미지 저장 완료 ===");
  console.log("파일:", outputPath);
  console.log("크기:", imageBuffer.length, "bytes");

  return outputPath;
}

// =====================================================
// 메인 함수
// =====================================================
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY 환경변수를 설정해주세요");
    console.error("예: GEMINI_API_KEY=xxx node test-thumbnail.mjs viral");
    process.exit(1);
  }

  // 스타일 인자 파싱
  const args = process.argv.slice(2);
  const style = args[0] || "viral";
  const validStyles = Object.keys(STYLE_PROMPTS);

  if (!validStyles.includes(style)) {
    console.error(`유효하지 않은 스타일: ${style}`);
    console.error(`사용 가능한 스타일: ${validStyles.join(", ")}`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`스키장 땅콩 썸네일 생성 (스타일: ${style})`);
  console.log("=".repeat(60));

  // 1차 시도: 전체 프롬프트
  let imageBase64 = null;
  const fullPrompt = buildThumbnailPrompt(style);

  try {
    console.log("\n[1차 시도] 전체 프롬프트로 생성 중...");
    imageBase64 = await generateImage(fullPrompt, apiKey);
  } catch (error) {
    console.error("1차 시도 실패:", error.message);
  }

  // 2차 시도: 간소화된 프롬프트
  if (!imageBase64) {
    const simplifiedPrompt = buildSimplifiedPrompt(style);
    try {
      console.log("\n[2차 시도] 간소화된 프롬프트로 재시도 중...");
      imageBase64 = await generateImage(simplifiedPrompt, apiKey);
    } catch (error) {
      console.error("2차 시도 실패:", error.message);
      process.exit(1);
    }
  }

  // 이미지 저장
  if (imageBase64) {
    const outputPath = saveImage(imageBase64, style);
    console.log("\n=== 완료! ===");
    console.log(`썸네일이 생성되었습니다: ${outputPath}`);
  } else {
    console.error("\n=== 실패 ===");
    console.error("이미지 생성에 실패했습니다.");
    process.exit(1);
  }
}

// 스타일 목록 출력 함수
function printStyleList() {
  console.log("\n=== 사용 가능한 스타일 ===\n");
  for (const [key, value] of Object.entries(STYLE_PROMPTS)) {
    console.log(`[${key}]`);
    console.log(`  분위기: ${value.mood.substring(0, 50)}...`);
    console.log(`  스타일: ${value.style.substring(0, 50)}...`);
    console.log("");
  }
}

// 도움말
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
스키장 땅콩 썸네일 생성 테스트

사용법:
  GEMINI_API_KEY=xxx node test-thumbnail.mjs [스타일]

스타일 옵션:
  viral     - 바이럴/밈 스타일 (기본값)
  cute      - 귀여움/하트 스타일
  news      - 뉴스/속보 스타일
  dramatic  - 드라마틱/영화 스타일

예시:
  node test-thumbnail.mjs viral
  node test-thumbnail.mjs cute
  GEMINI_API_KEY=your-key node test-thumbnail.mjs dramatic
`);
  printStyleList();
  process.exit(0);
}

main();
