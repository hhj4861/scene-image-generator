/**
 * Veo 3 Fast vs Hedra 프롬프트별 비교 테스트
 * 동일한 스크립트로 여러 프롬프트를 테스트해서 비교
 */

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  HEDRA_API_KEY: process.env.HEDRA_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

// 테스트할 대사
const SCRIPT = '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!';

// 프롬프트 변형들
const PROMPT_VARIANTS = [
  {
    name: 'baby_voice_lion_roar',
    veoPrompt: "A cute fluffy Pomeranian puppy talking with clear lip sync. Baby girl babbling voice, toddler-like cute innocent speech. The puppy says: '아빠! 땅콩이 사자후 보여줄까?' then makes a loud powerful lion ROAR sound '어흥!' then baby voice '내가 제일 쎄다!' Synchronized lip movements, expressive face, bright eyes, warm cozy living room",
    hedraPrompt: "A cute Pomeranian puppy talking naturally with precise lip sync, baby-like expressions, mouth opening and closing rhythmically, bright expressive eyes"
  },
  {
    name: 'cartoon_exaggerated',
    veoPrompt: "Animated cartoon Pomeranian puppy character with exaggerated mouth movements speaking Korean: '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!' Cute childlike voice, big expressive eyes, dramatic lion roar for '어흥', playful cartoon style animation",
    hedraPrompt: "Animated cartoon dog character talking, exaggerated mouth movements for speech, playful expressions, big eyes"
  },
  {
    name: 'realistic_natural',
    veoPrompt: "Realistic Pomeranian dog with natural mouth movements speaking: '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!' Natural lip sync, gentle head movements, realistic fur texture, warm lighting, cozy home environment",
    hedraPrompt: "Realistic Pomeranian dog with natural mouth movements, speaking naturally, subtle head tilts, natural facial expressions"
  },
  {
    name: 'emotional_expressive',
    veoPrompt: "Happy excited Pomeranian puppy expressing joy while saying: '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!' Cute excited voice, tail wagging energy, proud expression during lion roar, loving eyes, emotional connection",
    hedraPrompt: "Happy excited puppy talking with joy, expressive face, emotional expressions changing with speech, ears perked up"
  }
];

// =====================
// Veo 3 Fast 생성
// =====================
async function generateVeo(ai, imageBase64, prompt, outputPath) {
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

  while (!operation.done) {
    await new Promise(r => setTimeout(r, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.response?.generatedVideos?.length > 0) {
    await ai.files.download({
      file: operation.response.generatedVideos[0].video,
      downloadPath: outputPath,
    });
    return true;
  }
  return false;
}

// =====================
// ElevenLabs TTS 생성
// =====================
async function generateTTS(text, outputPath) {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.VOICE_PUPPY}`,
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

// =====================
// Hedra 에셋 업로드
// =====================
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

// =====================
// Hedra 비디오 생성
// =====================
async function generateHedra(imageFile, audioFile, prompt, outputPath) {
  const imageAssetId = await uploadHedraAsset('image', 'image.png', imageFile);
  const audioAssetId = await uploadHedraAsset('audio', 'audio.mp3', audioFile);

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
  return true;
}

// =====================
// 메인 테스트
// =====================
async function runComparison() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo 3 Fast vs Hedra 프롬프트별 비교 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();
  console.log(`📝 테스트 대사: "${SCRIPT}"`);
  console.log();

  // API 키 확인
  const hasVeo = !!CONFIG.GEMINI_API_KEY;
  const hasHedra = !!CONFIG.HEDRA_API_KEY && !!CONFIG.ELEVENLABS_API_KEY;

  console.log(`🔑 Veo 3 Fast: ${hasVeo ? '✅ 사용 가능' : '❌ API 키 없음'}`);
  console.log(`🔑 Hedra: ${hasHedra ? '✅ 사용 가능' : '❌ API 키 없음'}`);
  console.log();

  if (!hasVeo && !hasHedra) {
    console.error('❌ 최소 하나의 API 키가 필요합니다.');
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_002.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  // Veo용 이미지 준비
  const imageBuffer = fs.readFileSync(imageFile);
  const imageBase64 = imageBuffer.toString('base64');

  // Hedra용 TTS 준비
  let audioFile = null;
  if (hasHedra) {
    console.log('🎤 TTS 생성 중...');
    audioFile = path.join(outputFolder, 'comparison_audio.mp3');
    await generateTTS(SCRIPT, audioFile);
    console.log('   ✅ TTS 완료');
    console.log();
  }

  // Gemini AI 클라이언트
  let ai = null;
  if (hasVeo) {
    ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
  }

  const results = [];

  // 각 프롬프트 변형 테스트
  for (const variant of PROMPT_VARIANTS) {
    console.log('───────────────────────────────────────────────────────────');
    console.log(`📌 프롬프트: ${variant.name}`);
    console.log('───────────────────────────────────────────────────────────');

    const result = { name: variant.name, veo: null, hedra: null };

    // Veo 3 Fast 테스트
    if (hasVeo) {
      console.log(`\n🎬 [Veo 3 Fast] 생성 중...`);
      console.log(`   프롬프트: ${variant.veoPrompt.substring(0, 60)}...`);
      try {
        const startTime = Date.now();
        const veoOutput = path.join(outputFolder, `compare_veo_${variant.name}.mp4`);
        await generateVeo(ai, imageBase64, variant.veoPrompt, veoOutput);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const stats = fs.statSync(veoOutput);
        console.log(`   ✅ 완료: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${duration}초)`);
        result.veo = { file: veoOutput, size: stats.size, time: duration };
      } catch (error) {
        console.log(`   ❌ 실패: ${error.message}`);
        result.veo = { error: error.message };
      }
    }

    // Hedra 테스트
    if (hasHedra) {
      console.log(`\n🎭 [Hedra] 생성 중...`);
      console.log(`   프롬프트: ${variant.hedraPrompt.substring(0, 60)}...`);
      try {
        const startTime = Date.now();
        const hedraOutput = path.join(outputFolder, `compare_hedra_${variant.name}.mp4`);
        await generateHedra(imageFile, audioFile, variant.hedraPrompt, hedraOutput);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const stats = fs.statSync(hedraOutput);
        console.log(`   ✅ 완료: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${duration}초)`);
        result.hedra = { file: hedraOutput, size: stats.size, time: duration };
      } catch (error) {
        console.log(`   ❌ 실패: ${error.message}`);
        result.hedra = { error: error.message };
      }
    }

    results.push(result);
    console.log();
  }

  // 결과 요약
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  console.log('┌─────────────────────────┬───────────────────┬───────────────────┐');
  console.log('│ 프롬프트                │ Veo 3 Fast        │ Hedra             │');
  console.log('├─────────────────────────┼───────────────────┼───────────────────┤');

  for (const r of results) {
    const veoStatus = r.veo?.file ? `✅ ${r.veo.time}초` : (r.veo?.error ? '❌ 실패' : '⏭️ 스킵');
    const hedraStatus = r.hedra?.file ? `✅ ${r.hedra.time}초` : (r.hedra?.error ? '❌ 실패' : '⏭️ 스킵');
    console.log(`│ ${r.name.padEnd(23)} │ ${veoStatus.padEnd(17)} │ ${hedraStatus.padEnd(17)} │`);
  }

  console.log('└─────────────────────────┴───────────────────┴───────────────────┘');
  console.log();

  // 비용 비교
  console.log('💰 비용 비교 (4초 영상 기준):');
  console.log('   Veo 3 Fast: $1.60 (비디오+오디오 포함)');
  console.log('   Hedra: ~$0.50 + TTS ~$0.01 = ~$0.51');
  console.log();
  console.log('📁 출력 파일 위치:', outputFolder);
  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ 비교 테스트 완료!');
  console.log('═══════════════════════════════════════════════════════════');
}

runComparison().catch(console.error);
