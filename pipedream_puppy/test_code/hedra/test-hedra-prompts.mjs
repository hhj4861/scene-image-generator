/**
 * Hedra 다양한 프롬프트 변형 테스트
 * 여러 프롬프트를 테스트해서 최적의 립싱크 결과를 찾음
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
  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

// 테스트할 프롬프트 목록
const PROMPT_VARIANTS = [
  {
    name: 'emotion_happy',
    prompt: 'happy excited puppy talking with joy, expressive face'
  },
  {
    name: 'mouth_focus',
    prompt: 'dog opening and closing mouth naturally while speaking, mouth movements synced to audio'
  },
  {
    name: 'cartoon_style',
    prompt: 'animated cartoon dog character talking, exaggerated mouth movements for speech'
  },
  {
    name: 'realistic_dog',
    prompt: 'realistic Pomeranian dog with natural mouth movements, speaking naturally'
  }
];

async function generateTTS(text, voiceId, outputPath) {
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
  return outputPath;
}

async function uploadAsset(type, name, filePath) {
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

async function generateVideo(imageAssetId, audioAssetId, prompt, outputPath) {
  const requestData = {
    type: 'video',
    ai_model_id: HEDRA_CHARACTER_3_MODEL_ID,
    start_keyframe_id: imageAssetId,
    audio_id: audioAssetId,
    generated_video_inputs: {
      resolution: '720p',
      aspect_ratio: '9:16',
      text_prompt: prompt
    }
  };

  const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', requestData, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
  });

  // 완료 대기
  let videoUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await axios.get(`https://api.hedra.com/web-app/public/generations/${genResponse.data.id}/status`, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
    });

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

async function testPromptVariants() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Hedra 프롬프트 변형 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.HEDRA_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
    console.error('❌ API 키가 설정되지 않았습니다.');
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_001.png');

  // TTS 생성
  console.log('🎤 TTS 생성...');
  const puppyScript = '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!';
  const audioPath = path.join(outputFolder, 'audio_prompt_test.mp3');
  await generateTTS(puppyScript, CONFIG.VOICE_PUPPY, audioPath);
  console.log('   ✓ TTS 완료');
  console.log();

  // 에셋 업로드 (한 번만)
  console.log('📤 에셋 업로드...');
  const imageAssetId = await uploadAsset('image', 'scene_001.png', imageFile);
  const audioAssetId = await uploadAsset('audio', 'audio_prompt_test.mp3', audioPath);
  console.log(`   이미지: ${imageAssetId}`);
  console.log(`   오디오: ${audioAssetId}`);
  console.log();

  // 각 프롬프트 테스트
  const results = [];
  for (const variant of PROMPT_VARIANTS) {
    console.log(`🎬 테스트: ${variant.name}`);
    console.log(`   프롬프트: "${variant.prompt.substring(0, 50)}..."`);

    try {
      const outputPath = path.join(outputFolder, `hedra_${variant.name}.mp4`);

      // 새로운 에셋 업로드 (Hedra는 각 생성마다 새 에셋 필요)
      const newImageAssetId = await uploadAsset('image', 'scene_001.png', imageFile);
      const newAudioAssetId = await uploadAsset('audio', 'audio_prompt_test.mp3', audioPath);

      await generateVideo(newImageAssetId, newAudioAssetId, variant.prompt, outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`   ✅ 완료: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      results.push({ name: variant.name, success: true, file: outputPath });
    } catch (error) {
      console.log(`   ❌ 실패: ${error.message}`);
      results.push({ name: variant.name, success: false, error: error.message });
    }
    console.log();
  }

  // 결과 요약
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 테스트 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`  ${status} ${result.name}: ${result.success ? result.file : result.error}`);
  }
}

testPromptVariants().catch(console.error);
