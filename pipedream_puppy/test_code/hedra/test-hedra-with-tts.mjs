/**
 * Hedra Character 3 + ElevenLabs TTS 통합 테스트
 * 새로운 음성 ID로 TTS를 생성하고 Hedra로 역동적인 영상 생성
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
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),

  // 새로운 음성 ID
  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',   // 아기 여자아이 귀여운 음성 (YouTube 6초 클론)
  VOICE_OWNER: 'BbsagRO6ohd8MKPS2Ob0',   // 아빠 음성
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

// =====================
// TTS 생성
// =====================
async function generateTTS(text, voiceId, outputPath) {
  console.log(`   TTS 생성: "${text.substring(0, 30)}..." (voice: ${voiceId.substring(0, 10)}...)`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true
      }
    },
    {
      headers: {
        'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer'
    }
  );

  fs.writeFileSync(outputPath, Buffer.from(response.data));
  console.log(`   ✓ 저장: ${path.basename(outputPath)} (${(response.data.byteLength / 1024).toFixed(1)} KB)`);
  return outputPath;
}

// =====================
// Hedra 테스트
// =====================
async function testHedraWithTTS() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Hedra + TTS 통합 테스트 (역동적 영상)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // API 키 확인
  if (!CONFIG.HEDRA_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
    console.error('❌ HEDRA_API_KEY 또는 ELEVENLABS_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  console.log(`🔑 HEDRA_API_KEY: ${CONFIG.HEDRA_API_KEY.substring(0, 15)}...`);
  console.log(`🔑 ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY.substring(0, 15)}...`);
  console.log(`🎤 강아지 음성: ${CONFIG.VOICE_PUPPY}`);
  console.log(`🎤 아빠 음성: ${CONFIG.VOICE_OWNER}`);

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_001.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log();

  try {
    // 1. TTS 생성 (강아지 대사)
    console.log('🎤 [STEP 1] TTS 생성...');
    const puppyScript = '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!';
    const audioPath = path.join(outputFolder, 'audio_dynamic_test.mp3');
    await generateTTS(puppyScript, CONFIG.VOICE_PUPPY, audioPath);
    console.log();

    // 2. Hedra 모델 확인
    console.log('📋 [STEP 2] Hedra 모델 확인...');
    const modelsResponse = await axios.get('https://api.hedra.com/web-app/public/models', {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
    });

    const character3Model = modelsResponse.data?.find(m =>
      m.name?.includes('Character 3') || m.requires_audio_input === true
    );

    const modelId = character3Model?.id || HEDRA_CHARACTER_3_MODEL_ID;
    console.log(`   모델 ID: ${modelId}`);
    console.log(`   모델 이름: ${character3Model?.name || 'Hedra Character 3'}`);
    console.log();

    // 3. 이미지 업로드
    console.log('📤 [STEP 3] 이미지 업로드...');
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

    // 4. 오디오 업로드
    console.log('📤 [STEP 4] 오디오 업로드...');
    const audioAssetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
      name: 'audio_dynamic_test.mp3',
      type: 'audio'
    }, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
    });

    const audioBuffer = fs.readFileSync(audioPath);
    const audioFormData = new FormData();
    audioFormData.append('file', audioBuffer, { filename: 'audio_dynamic_test.mp3', contentType: 'audio/mpeg' });

    await axios.post(`https://api.hedra.com/web-app/public/assets/${audioAssetResponse.data.id}/upload`, audioFormData, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...audioFormData.getHeaders() }
    });

    console.log(`   오디오 에셋 ID: ${audioAssetResponse.data.id}`);
    console.log();

    // 5. 비디오 생성 요청 (역동적인 프롬프트)
    console.log('🎬 [STEP 5] 비디오 생성 요청 (역동적 프롬프트)...');
    // 립싱크에 최적화된 프롬프트 - 입을 계속 벌리지 않고 말하는 것처럼 자연스럽게
    const dynamicPrompt = 'A cute Pomeranian puppy talking naturally with precise lip sync matching audio, mouth opening and closing rhythmically to match speech, subtle head tilts and nods, bright expressive eyes, ears perked up, natural facial expressions changing with emotion, slight head movement when emphasizing words';

    const requestData = {
      type: 'video',
      ai_model_id: modelId,
      start_keyframe_id: imageAssetResponse.data.id,
      audio_id: audioAssetResponse.data.id,
      generated_video_inputs: {
        resolution: '720p',
        aspect_ratio: '9:16',
        text_prompt: dynamicPrompt
      }
    };

    console.log(`   프롬프트: ${dynamicPrompt.substring(0, 80)}...`);

    const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', requestData, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
    });

    console.log(`   생성 ID: ${genResponse.data.id}`);
    console.log();

    // 6. 완료 대기
    console.log('⏳ [STEP 6] 비디오 생성 대기...');
    let videoUrl = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const status = await axios.get(`https://api.hedra.com/web-app/public/generations/${genResponse.data.id}/status`, {
        headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
      });

      console.log(`   [${(i + 1) * 5}초] 상태: ${status.data.status}`);

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

    // 7. 비디오 다운로드
    console.log();
    console.log('📥 [STEP 7] 비디오 다운로드...');
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    const videoFilename = 'hedra_dynamic_test.mp4';
    const videoFilepath = path.join(outputFolder, videoFilename);
    fs.writeFileSync(videoFilepath, Buffer.from(videoResponse.data));

    console.log(`   ✅ 저장 완료: ${videoFilepath}`);
    console.log(`   파일 크기: ${(videoResponse.data.byteLength / 1024 / 1024).toFixed(2)} MB`);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Hedra + TTS 테스트 성공!');
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

testHedraWithTTS();
