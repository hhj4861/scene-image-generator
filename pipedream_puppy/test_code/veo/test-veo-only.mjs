/**
 * Veo 모션 비디오 생성 테스트
 * 기존 이미지를 사용해서 Veo I2V 비디오 생성만 테스트
 * @google/genai SDK 사용
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// Veo 테스트
// =====================
async function testVeo() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo 3 Fast I2V (Image to Video) 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // API 키 확인
  if (!CONFIG.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  console.log(`🔑 GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY.substring(0, 15)}...`);

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);

  // 기존 파일 확인 (owner 씬 - scene_002)
  const imageFile = path.join(outputFolder, 'scene_002.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log();

  try {
    // 1. Gemini AI 클라이언트 초기화
    console.log('📤 [STEP 1] Gemini AI 클라이언트 초기화...');
    const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

    // 이미지를 base64로 변환
    const imageBuffer = fs.readFileSync(imageFile);
    const imageBase64 = imageBuffer.toString('base64');
    console.log(`   이미지 크기: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
    console.log();

    // 2. Veo API 호출 (Gemini Veo Image to Video)
    console.log('🎬 [STEP 2] Veo 3 Fast 비디오 생성 요청...');

    const prompt = "A cute fluffy Pomeranian puppy talking with clear lip sync mouth movements. Baby girl babbling voice, toddler-like cute innocent speech. The puppy opens and closes its mouth naturally while saying: '아빠! 땅콩이 사자후 보여줄까?' then makes a loud powerful lion ROAR sound '어흥!' then continues with baby voice '내가 제일 쎄다!' Synchronized lip movements, expressive face, bright eyes, warm cozy living room";

    console.log(`   모델: veo-3.0-fast-generate-001`);
    console.log(`   프롬프트: ${prompt.substring(0, 50)}...`);
    console.log(`   duration: 4초 (Veo 3 Fast)`);
    console.log(`   aspectRatio: 9:16`);

    let operation = await ai.models.generateVideos({
      model: 'veo-3.0-fast-generate-001',
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/png',
      },
      config: {
        aspectRatio: '9:16',
        durationSeconds: 4,
      },
    });

    console.log(`   Operation 시작됨`);
    console.log();

    // 3. 완료 대기
    console.log('⏳ [STEP 3] 비디오 생성 대기...');
    let pollCount = 0;

    while (!operation.done) {
      await new Promise(r => setTimeout(r, 5000));
      pollCount++;
      console.log(`   [${pollCount * 5}초] 대기 중...`);

      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });

      if (pollCount > 120) {
        console.error('❌ 타임아웃: 비디오 생성 완료 대기 중 시간 초과');
        process.exit(1);
      }
    }

    console.log(`   ✅ 생성 완료!`);
    console.log();

    // 4. 비디오 저장
    console.log('📥 [STEP 4] 비디오 저장...');

    if (operation.response?.generatedVideos?.length > 0) {
      const videoFile = operation.response.generatedVideos[0].video;
      const videoFilename = 'veo3_fast_test_video.mp4';
      const videoFilepath = path.join(outputFolder, videoFilename);

      await ai.files.download({
        file: videoFile,
        downloadPath: videoFilepath,
      });

      const stats = fs.statSync(videoFilepath);
      console.log(`   ✅ 저장 완료: ${videoFilepath}`);
      console.log(`   파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('   응답 구조:', JSON.stringify(operation.response, null, 2).substring(0, 500));
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Veo 3 Fast 테스트 완료!');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   메시지:', error.message);
    if (error.response) {
      console.error('   응답 데이터:', JSON.stringify(error.response, null, 2));
    }
    process.exit(1);
  }
}

testVeo();
