/**
 * 이미지 생성 테스트 - 강아지 + 할머니 레퍼런스 이미지 기반
 *
 * 테스트 목표:
 * 1. 강아지 1마리만 일관되게 생성
 * 2. 할머니 모습도 레퍼런스 이미지 기반으로 생성
 * 3. 6개 씬에서 캐릭터 일관성 확인
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
  IMAGE_SAMPLE_DIR: path.join(__dirname, 'image_sample'),
};

// 테스트 씬 데이터
const TEST_SCENES = [
  {
    index: 1,
    speaker: 'puppy',
    narration: '할미! 땅콩이 사자후 보여줄까? 어흥!',
    emotion: 'excited',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'playful',
    },
  },
  {
    index: 2,
    speaker: 'owner',
    narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
    emotion: 'amused',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'heartwarming',
    },
  },
  {
    index: 3,
    speaker: 'puppy',
    narration: '에헤헤... 이번엔 미어캣! 땅콩이 미어캣도 잘해!',
    emotion: 'proud',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'playful',
    },
  },
  {
    index: 4,
    speaker: 'owner',
    narration: '그래, 땅콩이 미어캣처럼 두리번두리번 해봐!',
    emotion: 'encouraging',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'playful',
    },
  },
  {
    index: 5,
    speaker: 'owner',
    narration: '우와~ 우리 땅콩이 미어캣 진짜 잘한다! 간식 줄까?',
    emotion: 'happy',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'heartwarming',
    },
  },
  {
    index: 6,
    speaker: 'puppy',
    narration: '간식?! 땅콩이 간식 좋아! 냠냠냠! 할미 사랑해!',
    emotion: 'excited',
    scene_details: {
      location: 'indoor',
      background: 'cozy living room with warm lighting',
      weather: 'none',
      lighting: 'warm soft',
      mood: 'loving',
    },
  },
];

// Gemini로 이미지 분석
async function analyzeImage(imagePath, apiKey) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    {
      contents: [{
        parts: [
          { text: `Analyze this image and create a detailed prompt for regenerating it consistently. Return JSON only:
{
  "description": "detailed physical description",
  "image_generation_prompt": "detailed prompt for consistent image generation in English"
}` },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    },
    {
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    }
  );

  let content = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// Imagen 4로 이미지 생성
async function generateImage(prompt, apiKey, outputPath) {
  console.log(`   프롬프트: "${prompt.substring(0, 80)}..."`);

  const response = await axios.post(
    'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict',
    {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '9:16',
        personGeneration: 'allow_adult',
      },
    },
    {
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  if (response.data.predictions?.[0]?.bytesBase64Encoded) {
    const imageBuffer = Buffer.from(response.data.predictions[0].bytesBase64Encoded, 'base64');
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`   ✓ 저장: ${outputPath}`);
    return true;
  }
  return false;
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🖼️  이미지 생성 테스트 (강아지 + 할머니 레퍼런스)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // 출력 폴더 생성
  const testFolder = path.join(CONFIG.OUTPUT_DIR, `test_image_${Date.now()}`);
  fs.mkdirSync(testFolder, { recursive: true });
  console.log(`📁 출력 폴더: ${testFolder}`);
  console.log();

  // 1. 레퍼런스 이미지 분석
  console.log('🔍 [STEP 1] 레퍼런스 이미지 분석...');

  const puppyImagePath = path.join(CONFIG.IMAGE_SAMPLE_DIR, '강아지샘플.jpeg');
  const ownerImagePath = path.join(CONFIG.IMAGE_SAMPLE_DIR, '할머니샘플.jpeg');

  let puppyAnalysis, ownerAnalysis;

  try {
    console.log('   강아지 이미지 분석 중...');
    puppyAnalysis = await analyzeImage(puppyImagePath, CONFIG.GEMINI_API_KEY);
    console.log(`   ✓ 강아지: ${puppyAnalysis?.description?.substring(0, 50)}...`);
  } catch (e) {
    console.error('   ❌ 강아지 분석 실패:', e.message);
    puppyAnalysis = {
      description: 'Pomeranian puppy',
      image_generation_prompt: 'cute Pomeranian puppy with golden cream fluffy fur, small black nose, bright dark eyes, wearing grey knitted sweater, adorable and expressive',
    };
  }

  try {
    console.log('   할머니 이미지 분석 중...');
    ownerAnalysis = await analyzeImage(ownerImagePath, CONFIG.GEMINI_API_KEY);
    console.log(`   ✓ 할머니: ${ownerAnalysis?.description?.substring(0, 50)}...`);
  } catch (e) {
    console.error('   ❌ 할머니 분석 실패:', e.message);
    ownerAnalysis = {
      description: 'Asian woman',
      image_generation_prompt: 'middle-aged Asian woman with long black hair, wearing plaid hat and blue sleeveless top, warm gentle expression',
    };
  }

  console.log();
  console.log('📝 분석 결과:');
  console.log(`   강아지 프롬프트: ${puppyAnalysis?.image_generation_prompt?.substring(0, 80)}...`);
  console.log(`   할머니 프롬프트: ${ownerAnalysis?.image_generation_prompt?.substring(0, 80)}...`);
  console.log();

  // 2. 씬별 이미지 생성
  console.log('🎨 [STEP 2] 씬별 이미지 생성...');
  console.log();

  const puppyPrompt = puppyAnalysis?.image_generation_prompt || 'cute Pomeranian puppy with golden cream fluffy fur';
  const ownerPrompt = ownerAnalysis?.image_generation_prompt || 'middle-aged Asian woman with long black hair';

  // ★ 일관성 강제 프롬프트
  const consistencyPrompt = `CRITICAL: Generate EXACTLY ONE single puppy in the image. The puppy must be: ${puppyPrompt}. DO NOT add any other dogs or animals. Only ONE puppy.`;

  for (const scene of TEST_SCENES) {
    console.log(`📸 씬 ${scene.index}: ${scene.speaker} - "${scene.narration.substring(0, 20)}..."`);

    const sceneDetails = scene.scene_details;
    const locationInfo = sceneDetails.location === 'outdoor'
      ? `outdoor setting, ${sceneDetails.weather || 'sunny'} weather`
      : 'indoor setting';

    let finalPrompt;

    if (scene.speaker === 'puppy') {
      // 강아지만 등장 (할머니 없음)
      finalPrompt = `${consistencyPrompt}, single puppy alone, ${scene.emotion} expression, ${sceneDetails.background}, ${locationInfo}, ${sceneDetails.lighting} lighting, ${sceneDetails.mood} atmosphere, photorealistic, 8k, professional pet photography, DSLR quality, sharp focus`;
    } else {
      // 주인(할머니) + 강아지 함께 등장
      finalPrompt = `${ownerPrompt} with ${puppyPrompt}, EXACTLY ONE puppy only, woman holding or near the single puppy, ${scene.emotion} expression, ${sceneDetails.background}, ${locationInfo}, ${sceneDetails.lighting} lighting, ${sceneDetails.mood} atmosphere, photorealistic, 8k, professional photography, DSLR quality, sharp focus`;
    }

    const outputPath = path.join(testFolder, `scene_${String(scene.index).padStart(3, '0')}.png`);

    try {
      await generateImage(finalPrompt, CONFIG.GEMINI_API_KEY, outputPath);
    } catch (e) {
      console.error(`   ❌ 실패: ${e.message}`);
    }

    console.log();

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ 테스트 완료!');
  console.log(`  📁 결과 폴더: ${testFolder}`);
  console.log('═══════════════════════════════════════════════════════════');
}

runTest().catch(console.error);
