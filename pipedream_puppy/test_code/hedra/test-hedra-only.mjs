/**
 * Hedra Character 3 립싱크 테스트
 * 기존 이미지와 오디오 파일을 사용해서 Hedra 비디오 생성만 테스트
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  HEDRA_API_KEY: process.env.HEDRA_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

// =====================
// Hedra 테스트
// =====================
async function testHedra() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Hedra Character 3 립싱크 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // API 키 확인
  if (!CONFIG.HEDRA_API_KEY) {
    console.error('❌ HEDRA_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  console.log(`🔑 HEDRA_API_KEY: ${CONFIG.HEDRA_API_KEY.substring(0, 15)}...`);

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);

  // 기존 파일 확인
  const imageFile = path.join(outputFolder, 'scene_001.png');
  const audioFile = path.join(outputFolder, 'audio_001.mp3');

  if (!fs.existsSync(imageFile) || !fs.existsSync(audioFile)) {
    console.error('❌ 이미지 또는 오디오 파일이 없습니다.');
    console.error(`   이미지: ${fs.existsSync(imageFile) ? '✓' : '✗'} ${imageFile}`);
    console.error(`   오디오: ${fs.existsSync(audioFile) ? '✓' : '✗'} ${audioFile}`);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log(`🎵 오디오: ${audioFile}`);
  console.log();

  try {
    // 1. 모델 확인
    console.log('📋 [STEP 1] Hedra 모델 확인...');
    const modelsResponse = await axios.get('https://api.hedra.com/web-app/public/models', {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
    });

    const character3Model = modelsResponse.data?.find(m =>
      m.name?.includes('Character 3') || m.requires_audio_input === true
    );

    const modelId = character3Model?.id || HEDRA_CHARACTER_3_MODEL_ID;
    console.log(`   모델 ID: ${modelId}`);
    console.log(`   모델 이름: ${character3Model?.name || 'Hedra Character 3'}`);
    console.log(`   오디오 필수: ${character3Model?.requires_audio_input}`);
    console.log(`   durations: ${JSON.stringify(character3Model?.durations)}`);
    console.log();

    // 2. 이미지 업로드
    console.log('📤 [STEP 2] 이미지 업로드...');
    const imageAssetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
      name: 'scene_001.png',
      type: 'image'
    }, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
    });

    const imageBuffer = fs.readFileSync(imageFile);
    const imageFormData = new FormData();
    imageFormData.append('file', imageBuffer, { filename: 'scene_001.png', contentType: 'image/png' });

    await axios.post(`https://api.hedra.com/web-app/public/assets/${imageAssetResponse.data.id}/upload`, imageFormData, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...imageFormData.getHeaders() }
    });

    console.log(`   이미지 에셋 ID: ${imageAssetResponse.data.id}`);
    console.log();

    // 3. 오디오 업로드
    console.log('📤 [STEP 3] 오디오 업로드...');
    const audioAssetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
      name: 'audio_001.mp3',
      type: 'audio'
    }, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
    });

    const audioBuffer = fs.readFileSync(audioFile);
    const audioFormData = new FormData();
    audioFormData.append('file', audioBuffer, { filename: 'audio_001.mp3', contentType: 'audio/mpeg' });

    await axios.post(`https://api.hedra.com/web-app/public/assets/${audioAssetResponse.data.id}/upload`, audioFormData, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...audioFormData.getHeaders() }
    });

    console.log(`   오디오 에셋 ID: ${audioAssetResponse.data.id}`);
    console.log();

    // 4. 비디오 생성 요청
    console.log('🎬 [STEP 4] 비디오 생성 요청...');
    const requestData = {
      type: 'video',
      ai_model_id: modelId,
      start_keyframe_id: imageAssetResponse.data.id,
      audio_id: audioAssetResponse.data.id,
      generated_video_inputs: {
        resolution: '720p',
        aspect_ratio: '9:16',
        // 립싱크에 최적화된 프롬프트 - 입을 계속 벌리지 않고 말하는 것처럼 자연스럽게
        text_prompt: 'A cute Pomeranian puppy talking naturally with precise lip sync matching audio, mouth opening and closing rhythmically to match speech, subtle head tilts and nods, bright expressive eyes, ears perked up, natural facial expressions changing with emotion'
      }
    };

    console.log('   요청 데이터:', JSON.stringify(requestData, null, 2));

    const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', requestData, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
    });

    console.log(`   생성 ID: ${genResponse.data.id}`);
    console.log();

    // 5. 완료 대기
    console.log('⏳ [STEP 5] 비디오 생성 대기...');
    let videoUrl = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const status = await axios.get(`https://api.hedra.com/web-app/public/generations/${genResponse.data.id}/status`, {
        headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
      });

      console.log(`   [${i * 5}초] 상태: ${status.data.status}`);

      if (status.data.status === 'complete') {
        videoUrl = status.data.url || status.data.download_url;
        break;
      }
      if (status.data.status === 'error') {
        console.error('❌ 생성 실패:', status.data.error_message || status.data);
        process.exit(1);
      }
    }

    if (!videoUrl) {
      console.error('❌ 타임아웃: 비디오 생성 완료 대기 중 시간 초과');
      process.exit(1);
    }

    // 6. 비디오 다운로드
    console.log();
    console.log('📥 [STEP 6] 비디오 다운로드...');
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    const videoFilename = 'hedra_test_video.mp4';
    const videoFilepath = path.join(outputFolder, videoFilename);
    fs.writeFileSync(videoFilepath, Buffer.from(videoResponse.data));

    console.log(`   ✅ 저장 완료: ${videoFilepath}`);
    console.log(`   파일 크기: ${(videoResponse.data.byteLength / 1024 / 1024).toFixed(2)} MB`);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Hedra 테스트 성공!');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   상태 코드:', error.response?.status);
    console.error('   응답 데이터:', JSON.stringify(error.response?.data, null, 2));
    console.error('   메시지:', error.message);
    process.exit(1);
  }
}

testHedra();
