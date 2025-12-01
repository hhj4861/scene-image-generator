/**
 * Veo 3 Fast + TTS 조합 테스트
 * 1. Veo 3 Fast로 강아지가 말하는 것처럼 입을 움직이는 영상 생성 (음성 없이)
 * 2. ElevenLabs TTS로 음성 생성
 * 3. FFmpeg로 영상과 음성 합성
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
  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',
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

// TTS 길이 확인 (ffprobe)
function getAudioDuration(audioPath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    return parseFloat(result.toString().trim());
  } catch (e) {
    console.log('   ffprobe 실패, 기본값 4초 사용');
    return 4;
  }
}

// Veo 3 Fast로 영상 생성 (음성 없이, 입 움직임만)
async function generateVeoVideo(ai, imageFile, prompt, outputPath) {
  console.log(`   Veo 3 Fast 영상 생성 요청...`);
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
      includeAudio: false, // 오디오 없이 영상만 생성
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

  // 영상에 새 오디오 추가 (-shortest: 더 짧은 스트림에 맞춤)
  const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`   ✓ 합성 완료: ${outputPath}`);
    return outputPath;
  } catch (e) {
    console.error('   FFmpeg 오류:', e.message);
    throw e;
  }
}

async function testVeoTtsCombine() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo 3 Fast + TTS 조합 테스트');
  console.log('  (Veo로 입 움직임 영상 생성 → TTS 음성 합성)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.GEMINI_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
    console.error('❌ GEMINI_API_KEY 또는 ELEVENLABS_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log(`🔑 GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY.substring(0, 15)}...`);
  console.log(`🔑 ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY.substring(0, 15)}...`);

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_002.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log();

  try {
    // Gemini AI 클라이언트 초기화
    const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

    // 1. TTS 생성
    console.log('🎤 [STEP 1] TTS 음성 생성...');
    const puppyScript = '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!';
    const audioPath = path.join(outputFolder, 'audio_veo_tts_test.mp3');
    await generateTTS(puppyScript, CONFIG.VOICE_PUPPY, audioPath);

    // TTS 길이 확인
    const audioDuration = getAudioDuration(audioPath);
    console.log(`   음성 길이: ${audioDuration.toFixed(2)}초`);
    console.log();

    // 2. Veo 3 Fast로 영상 생성 (입 움직임 프롬프트, 음성 없이)
    console.log('🎬 [STEP 2] Veo 3 Fast 영상 생성 (입 움직임, 음성 없음)...');

    // 강아지가 말하는 것처럼 입을 움직이는 프롬프트
    const veoPrompt = `A cute fluffy Pomeranian puppy talking with clear lip sync mouth movements. Baby girl babbling voice style movements. The puppy opens and closes its mouth naturally while speaking, synchronized lip movements, expressive face, bright eyes, warm cozy living room`;

    const veoVideoPath = path.join(outputFolder, 'veo3_talking_dog_no_audio.mp4');
    await generateVeoVideo(ai, imageFile, veoPrompt, veoVideoPath);
    console.log();

    // 3. FFmpeg로 합성
    console.log('🔗 [STEP 3] 영상 + TTS 음성 합성...');
    const finalVideoPath = path.join(outputFolder, 'veo3_tts_combined.mp4');
    combineVideoAudio(veoVideoPath, audioPath, finalVideoPath);

    const finalStats = fs.statSync(finalVideoPath);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Veo 3 Fast + TTS 테스트 완료!');
    console.log(`  📁 결과: ${finalVideoPath}`);
    console.log(`  📊 크기: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log();
    console.log('  💰 비용 비교:');
    console.log('     - Veo 3 Fast (영상만): $0.80 (4초 × $0.20)');
    console.log('     - Veo 3 Fast (영상+오디오): $1.60 (4초 × $0.40)');
    console.log('     - 이 방식: ~$0.81 (Veo $0.80 + TTS ~$0.01)');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   메시지:', error.message);
    if (error.response) {
      console.error('   응답 데이터:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testVeoTtsCombine();
