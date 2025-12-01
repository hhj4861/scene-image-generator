/**
 * LipSync.studio API 테스트
 * 동물 전용 립싱크 API
 *
 * API 문서: https://lipsync.studio/api-platform
 * - Base URL: https://lipsync.studio/api/v1
 * - 인증: Bearer token (sk_XXXX_YYYY)
 * - 엔드포인트: /lipsync-image
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  LIPSYNC_API_KEY: process.env.LIPSYNC_API_KEY || '',  // sk_XXXX_YYYY 형식
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',
};

const LIPSYNC_BASE_URL = 'https://lipsync.studio/api/v1';

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

// 파일을 base64로 변환
function fileToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

// LipSync.studio API 호출
async function generateLipsyncVideo(imageFile, audioFile, outputPath) {
  console.log('   LipSync.studio API 호출...');

  // base64로 변환
  const imageBase64 = fileToBase64(imageFile);
  const audioBase64 = fileToBase64(audioFile);

  // 이미지 확장자 확인
  const imageExt = path.extname(imageFile).toLowerCase();
  const imageMimeType = imageExt === '.png' ? 'image/png' : 'image/jpeg';

  // 오디오 확장자 확인
  const audioExt = path.extname(audioFile).toLowerCase();
  const audioMimeType = audioExt === '.mp3' ? 'audio/mpeg' : 'audio/wav';

  const requestBody = {
    image: `data:${imageMimeType};base64,${imageBase64}`,
    audio: `data:${audioMimeType};base64,${audioBase64}`,
    // 옵션 설정 (formState)
    formState: {
      aspect_ratio: '9:16',
      guidance_scale: 7.5,  // 기본값
      // animal lipsync 특화 설정이 있다면 추가
    }
  };

  try {
    // 1. 립싱크 요청
    const createResponse = await axios.post(`${LIPSYNC_BASE_URL}/lipsync-image`, requestBody, {
      headers: {
        'Authorization': `Bearer ${CONFIG.LIPSYNC_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const requestId = createResponse.data.requestId;
    console.log(`   Request ID: ${requestId}`);

    // 2. 결과 폴링
    let videoUrl = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResponse = await axios.get(`${LIPSYNC_BASE_URL}/jobs/${requestId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.LIPSYNC_API_KEY}` }
      });

      const status = statusResponse.data.status;
      console.log(`   [${(i + 1) * 5}초] 상태: ${status}`);

      if (status === 'completed') {
        videoUrl = statusResponse.data.result?.url || statusResponse.data.url;
        break;
      }
      if (status === 'failed') {
        throw new Error(statusResponse.data.error || 'LipSync 생성 실패');
      }
    }

    if (!videoUrl) throw new Error('타임아웃');

    // 3. 결과 다운로드
    console.log(`   다운로드: ${videoUrl}`);
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(outputPath, Buffer.from(videoResponse.data));
    console.log(`   ✓ 저장: ${(videoResponse.data.byteLength / 1024 / 1024).toFixed(2)} MB`);

    return outputPath;

  } catch (error) {
    if (error.response) {
      console.error('   API 오류:', error.response.status, error.response.data);
    }
    throw error;
  }
}

async function testLipsyncStudio() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 LipSync.studio API 테스트');
  console.log('  (동물 전용 립싱크)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.LIPSYNC_API_KEY) {
    console.error('❌ LIPSYNC_API_KEY가 설정되지 않았습니다.');
    console.log();
    console.log('💡 LipSync.studio API 키 획득 방법:');
    console.log('   1. https://lipsync.studio 방문');
    console.log('   2. 계정 생성 및 로그인');
    console.log('   3. API 메뉴에서 API 키 발급');
    console.log('   4. 환경변수 설정: export LIPSYNC_API_KEY="sk_XXXX_YYYY"');
    console.log();
    console.log('📋 가격:');
    console.log('   - Basic: $29.99/월 (900 크레딧)');
    console.log('   - Standard: $49.99/월 (1,800 크레딧)');
    console.log('   - Pro: $99.99/월 (3,600 크레딧)');
    process.exit(1);
  }

  if (!CONFIG.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  const imageFile = path.join(outputFolder, 'scene_001.png');

  if (!fs.existsSync(imageFile)) {
    console.error('❌ 이미지 파일이 없습니다:', imageFile);
    process.exit(1);
  }

  console.log(`📁 이미지: ${imageFile}`);
  console.log(`🔑 API Key: ${CONFIG.LIPSYNC_API_KEY.substring(0, 10)}...`);
  console.log();

  try {
    // 1. TTS 생성
    console.log('🎤 [STEP 1] TTS 음성 생성...');
    const puppyScript = '아빠! 나 땅콩이야! 사랑해!';
    const audioPath = path.join(outputFolder, 'audio_lipsync_test.mp3');
    await generateTTS(puppyScript, CONFIG.VOICE_PUPPY, audioPath);
    console.log();

    // 2. LipSync.studio로 영상 생성
    console.log('🎬 [STEP 2] LipSync.studio 영상 생성...');
    const outputPath = path.join(outputFolder, 'lipsync_studio_result.mp4');
    await generateLipsyncVideo(imageFile, audioPath, outputPath);
    console.log();

    const stats = fs.statSync(outputPath);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ LipSync.studio 테스트 완료!');
    console.log(`  📁 결과: ${outputPath}`);
    console.log(`  📊 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ 오류 발생:');
    console.error('   메시지:', error.message);
    process.exit(1);
  }
}

testLipsyncStudio();
