/**
 * Veo + 기존 TTS 단일 테스트
 * 기존 이미지와 오디오를 활용해서 Veo 립싱크 테스트
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // 기존 테스트 폴더
  TEST_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// TTS 길이 확인 (ffprobe)
function getAudioDuration(audioPath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    return parseFloat(result.toString().trim());
  } catch (e) {
    console.log('   ffprobe 실패, 기본값 5초 사용');
    return 5;
  }
}

// Veo로 영상 생성
async function generateVeoVideo(imageFile, prompt, durationSeconds, outputPath) {
  console.log(`   Veo 영상 생성 요청...`);
  console.log(`   프롬프트: "${prompt}"`);
  console.log(`   길이: ${durationSeconds}초`);

  const imageBuffer = fs.readFileSync(imageFile);
  const imageBase64 = imageBuffer.toString('base64');

  const requestBody = {
    instances: [{
      prompt: prompt,
      image: {
        bytesBase64Encoded: imageBase64,
        mimeType: 'image/png'
      }
    }],
    parameters: {
      aspectRatio: '9:16',
      sampleCount: 1,
      durationSeconds: Math.max(5, Math.min(8, Math.ceil(durationSeconds))),
      personGeneration: 'dont_allow',
      negativePrompt: 'text, watermark, letters, subtitles, captions, words, typography, writing, characters, logo, label, title, credits, UI, overlay, banner, sign'
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning`;

  const response = await axios.post(endpoint, requestBody, {
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': CONFIG.GEMINI_API_KEY }
  });

  const operationName = response.data.name;
  console.log(`   Operation: ${operationName}`);

  // 완료 대기
  let videoResult = null;
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const statusResponse = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      { headers: { 'X-goog-api-key': CONFIG.GEMINI_API_KEY } }
    );

    const status = statusResponse.data;
    console.log(`   [${(i + 1) * 5}초] done: ${status.done || false}`);

    if (status.done) {
      if (status.error) {
        throw new Error(JSON.stringify(status.error));
      }
      videoResult = status.response;
      break;
    }
  }

  if (!videoResult) throw new Error('Veo 타임아웃');

  // 비디오 저장
  const samples = videoResult.generateVideoResponse?.generatedSamples || videoResult.generatedSamples;
  if (samples && samples.length > 0) {
    const videoData = samples[0].video;
    if (videoData?.bytesBase64Encoded) {
      const videoBuffer = Buffer.from(videoData.bytesBase64Encoded, 'base64');
      fs.writeFileSync(outputPath, videoBuffer);
      console.log(`   ✓ Veo 영상 저장: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      return outputPath;
    } else if (videoData?.uri) {
      const videoResponse = await axios.get(videoData.uri, {
        responseType: 'arraybuffer',
        headers: { 'X-goog-api-key': CONFIG.GEMINI_API_KEY }
      });
      fs.writeFileSync(outputPath, Buffer.from(videoResponse.data));
      console.log(`   ✓ Veo 영상 저장: ${(videoResponse.data.byteLength / 1024 / 1024).toFixed(2)} MB`);
      return outputPath;
    }
  }

  throw new Error('Veo 응답에 비디오 없음');
}

// FFmpeg로 영상과 음성 합성
function combineVideoAudio(videoPath, audioPath, outputPath) {
  console.log(`   FFmpeg 합성 중...`);
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

async function testVeoSingle() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo 단일 테스트 (기존 이미지/오디오 활용)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.TEST_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_001.png');
  const audioFile = path.join(outputFolder, 'audio_001.mp3');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일 없음:', imageFile);
    process.exit(1);
  }
  if (!fs.existsSync(audioFile)) {
    console.error('❌ 오디오 파일 없음:', audioFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log(`🎵 오디오: ${audioFile}`);
  console.log();

  // 오디오 길이 확인
  const audioDuration = getAudioDuration(audioFile);
  console.log(`🎤 오디오 길이: ${audioDuration.toFixed(2)}초`);
  console.log();

  try {
    // 기존 잘 작동했던 프롬프트 (텍스트 관련 제거 - negativePrompt로 처리)
    const veoPrompt = `A cute fluffy Pomeranian puppy talking and speaking with mouth opening and closing naturally, the dog is looking at the camera with bright expressive eyes, mouth movements as if speaking Korean words, subtle head tilts, warm cozy living room background, high quality animation, clean frame`;

    console.log('🎬 [STEP 1] Veo 영상 생성...');
    console.log(`   프롬프트: "${veoPrompt.substring(0, 80)}..."`);

    const veoVideoPath = path.join(outputFolder, 'veo_single_test_raw.mp4');
    await generateVeoVideo(imageFile, veoPrompt, audioDuration, veoVideoPath);
    console.log();

    // FFmpeg 합성
    console.log('🔗 [STEP 2] FFmpeg 합성...');
    const finalVideoPath = path.join(outputFolder, 'veo_single_test_final.mp4');
    combineVideoAudio(veoVideoPath, audioFile, finalVideoPath);

    const finalStats = fs.statSync(finalVideoPath);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ 테스트 완료!');
    console.log(`  📁 원본 영상: ${veoVideoPath}`);
    console.log(`  📁 합성 영상: ${finalVideoPath}`);
    console.log(`  📊 크기: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류:');
    console.error('   상태 코드:', error.response?.status);
    console.error('   응답:', JSON.stringify(error.response?.data, null, 2));
    console.error('   메시지:', error.message);
    process.exit(1);
  }
}

testVeoSingle();
