/**
 * Hedra Owner 씬 테스트 - 고개 끄덕이는 강아지
 * speaker가 owner일 때 강아지는 말하지 않고 고개만 끄덕임
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  HEDRA_API_KEY: process.env.HEDRA_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
  VOICE_OWNER: 'BbsagRO6ohd8MKPS2Ob0',
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

const SCENE = {
  narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
};

// TTS 생성
async function generateTTS(text, voiceId, outputPath) {
  console.log(`   TTS 생성: "${text}"`);
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true }
    },
    {
      headers: { 'xi-api-key': CONFIG.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer'
    }
  );
  fs.writeFileSync(outputPath, Buffer.from(response.data));
  console.log(`   ✓ TTS 저장: ${(response.data.byteLength / 1024).toFixed(1)} KB`);
  return outputPath;
}

// Hedra 에셋 업로드
async function uploadHedraAsset(type, name, filePath) {
  const assetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
    name, type
  }, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
  });

  const buffer = fs.readFileSync(filePath);
  const formData = new FormData();
  const contentType = type === 'image' ? 'image/png' : 'audio/mpeg';
  formData.append('file', buffer, { filename: name, contentType });

  await axios.post(`https://api.hedra.com/web-app/public/assets/${assetResponse.data.id}/upload`, formData, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...formData.getHeaders() }
  });

  return assetResponse.data.id;
}

// Hedra 비디오 생성
async function generateHedraVideo(imageFile, audioFile, prompt, outputPath) {
  const imageAssetId = await uploadHedraAsset('image', 'image.png', imageFile);
  const audioAssetId = await uploadHedraAsset('audio', 'audio.mp3', audioFile);

  console.log(`   이미지 에셋: ${imageAssetId}`);
  console.log(`   오디오 에셋: ${audioAssetId}`);

  const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', {
    type: 'video',
    ai_model_id: HEDRA_CHARACTER_3_MODEL_ID,
    start_keyframe_id: imageAssetId,
    audio_id: audioAssetId,
    generated_video_inputs: {
      resolution: '720p',
      aspect_ratio: '9:16',
      text_prompt: prompt
    }
  }, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
  });

  console.log(`   생성 ID: ${genResponse.data.id}`);

  let videoUrl = null;
  for (let i = 0; i < 60; i++) {
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
      throw new Error(status.data.error_message || 'Generation failed');
    }
  }

  if (!videoUrl) throw new Error('Timeout');

  const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(videoResponse.data));
  return outputPath;
}

async function testNoddingPuppy() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Hedra 고개 끄덕이는 강아지 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  console.log(`📝 대사: "${SCENE.narration}"`);
  console.log();

  if (!CONFIG.HEDRA_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
    console.error('❌ API 키가 설정되지 않았습니다.');
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_002.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log();

  try {
    // 1. TTS 생성 (아빠 음성)
    console.log('🎤 [STEP 1] TTS 음성 생성 (아빠 음성)...');
    const audioPath = path.join(outputFolder, 'audio_nodding_test.mp3');
    await generateTTS(SCENE.narration, CONFIG.VOICE_OWNER, audioPath);
    console.log();

    // 2. Hedra로 영상 생성 (고개 끄덕이는 강아지)
    console.log('🎬 [STEP 2] Hedra 영상 생성 (고개 끄덕임)...');

    // 고개 끄덕이는 프롬프트 - 입은 다물고 고개만 움직임
    const hedraPrompt = `Cute Pomeranian puppy nodding head up and down, mouth closed, NOT talking, just nodding in agreement, happy expression, bright eyes, ears moving slightly, gentle head bobbing motion, listening attentively`;

    console.log(`   프롬프트: "${hedraPrompt.substring(0, 60)}..."`);

    const videoPath = path.join(outputFolder, 'hedra_nodding_puppy.mp4');
    await generateHedraVideo(imageFile, audioPath, hedraPrompt, videoPath);

    const stats = fs.statSync(videoPath);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ 고개 끄덕이는 강아지 테스트 완료!');
    console.log(`  📁 결과: ${videoPath}`);
    console.log(`  📊 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   메시지:', error.message);
    process.exit(1);
  }
}

testNoddingPuppy();
