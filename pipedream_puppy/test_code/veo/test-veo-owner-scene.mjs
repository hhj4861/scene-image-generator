/**
 * Veo Owner 씬 테스트
 * speaker가 owner일 때 강아지는 말하지 않고 그냥 웃고 있는 영상
 * Veo로 영상 생성 후 아빠 TTS 음성 합성
 */

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
  VOICE_OWNER: 'BbsagRO6ohd8MKPS2Ob0',
};

// 테스트할 씬 데이터
const SCENE = {
  index: 2,
  speaker: 'owner',
  narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
  emotion: 'amused',
  puppy_pose: 'looking up at camera with happy smile',
  background: 'cozy living room with soft lighting',
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

// Veo로 영상 생성 (입 안 움직임, 그냥 웃는 강아지)
async function generateVeoVideo(ai, imageFile, prompt, outputPath) {
  console.log(`   Veo 영상 생성 요청...`);
  console.log(`   프롬프트: "${prompt.substring(0, 60)}..."`);

  const imageBuffer = fs.readFileSync(imageFile);
  const imageBase64 = imageBuffer.toString('base64');

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
      includeAudio: false,
    },
  });

  console.log(`   Operation 시작됨`);

  let pollCount = 0;
  while (!operation.done) {
    await new Promise(r => setTimeout(r, 5000));
    pollCount++;
    console.log(`   [${pollCount * 5}초] 대기 중...`);
    operation = await ai.operations.getVideosOperation({ operation });
    if (pollCount > 60) throw new Error('Veo 타임아웃');
  }

  if (operation.response?.generatedVideos?.length > 0) {
    await ai.files.download({
      file: operation.response.generatedVideos[0].video,
      downloadPath: outputPath,
    });
    const stats = fs.statSync(outputPath);
    console.log(`   ✓ Veo 영상 저장: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    return outputPath;
  }
  throw new Error('Veo 응답에 비디오 없음');
}

// FFmpeg로 영상과 음성 합성
function combineVideoAudio(videoPath, audioPath, outputPath) {
  console.log(`   FFmpeg 합성 중...`);
  const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
  console.log(`   ✓ 합성 완료`);
  return outputPath;
}

async function testOwnerScene() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo Owner 씬 테스트');
  console.log('  (강아지는 그냥 웃고만 있고, 아빠 음성 합성)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  console.log('📝 씬 정보:');
  console.log(`   speaker: ${SCENE.speaker}`);
  console.log(`   narration: "${SCENE.narration}"`);
  console.log(`   emotion: ${SCENE.emotion}`);
  console.log(`   puppy_pose: ${SCENE.puppy_pose}`);
  console.log();

  if (!CONFIG.GEMINI_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
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
    const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

    // 1. TTS 생성 (아빠 음성)
    console.log('🎤 [STEP 1] TTS 음성 생성 (아빠 음성)...');
    const audioPath = path.join(outputFolder, 'audio_owner_veo.mp3');
    await generateTTS(SCENE.narration, CONFIG.VOICE_OWNER, audioPath);
    console.log();

    // 2. Veo로 영상 생성 (입 안 움직이고 그냥 웃는 강아지)
    console.log('🎬 [STEP 2] Veo 영상 생성 (웃는 강아지, 입 안 움직임)...');

    // 강아지가 말하지 않고 그냥 웃고 있는 프롬프트
    const veoPrompt = `A cute fluffy Pomeranian puppy with a happy smile, ${SCENE.puppy_pose}, mouth closed in a gentle smile, NOT talking, NOT opening mouth, just smiling happily, bright expressive eyes, ears perked up, subtle happy movements, tail wagging energy, ${SCENE.background}`;

    const veoVideoPath = path.join(outputFolder, 'veo_owner_scene_no_talk.mp4');
    await generateVeoVideo(ai, imageFile, veoPrompt, veoVideoPath);
    console.log();

    // 3. FFmpeg로 합성
    console.log('🔗 [STEP 3] 영상 + 아빠 음성 합성...');
    const finalVideoPath = path.join(outputFolder, 'veo_owner_scene_final.mp4');
    combineVideoAudio(veoVideoPath, audioPath, finalVideoPath);

    const stats = fs.statSync(finalVideoPath);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Owner 씬 테스트 완료!');
    console.log(`  📁 결과: ${finalVideoPath}`);
    console.log(`  📊 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   메시지:', error.message);
    process.exit(1);
  }
}

testOwnerScene();
