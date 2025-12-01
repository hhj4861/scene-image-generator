/**
 * MusicAPI BGM 생성 테스트
 * BGM 생성만 단독으로 테스트
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  MUSICAPI_KEY: process.env.MUSICAPI_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// BGM 테스트
// =====================
async function testBGM() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎵 MusicAPI BGM 생성 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // API 키 확인
  if (!CONFIG.MUSICAPI_KEY) {
    console.error('❌ MUSICAPI_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  console.log(`🔑 MUSICAPI_KEY: ${CONFIG.MUSICAPI_KEY.substring(0, 15)}...`);
  console.log();

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  try {
    const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1';
    const bgmTags = 'cute, playful, heartwarming, gentle, warm, background music';

    // 1. BGM 생성 요청
    console.log('🎶 [STEP 1] BGM 생성 요청...');
    console.log(`   태그: ${bgmTags}`);

    const createResponse = await axios.post(`${MUSICAPI_BASE}/sonic/create`, {
      mv: 'sonic-v4-5',
      make_instrumental: true,
      custom_mode: true,
      title: 'Shorts_BGM_Test',
      tags: bgmTags,
    }, {
      headers: {
        'Authorization': `Bearer ${CONFIG.MUSICAPI_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const taskId = createResponse.data.task_id;
    console.log(`   Task ID: ${taskId}`);
    console.log();

    // 2. 완료 대기
    console.log('⏳ [STEP 2] BGM 생성 대기...');
    let bgmUrl = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResponse = await axios.get(`${MUSICAPI_BASE}/sonic/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.MUSICAPI_KEY}` },
      });

      const songs = statusResponse.data.data || [];
      console.log(`   [${(i + 1) * 5}초] songs: ${songs.length}, status: ${statusResponse.data.status || 'unknown'}`);

      if (songs.length > 0) {
        console.log(`   첫 번째 곡 정보:`);
        console.log(`     - audio_url: ${songs[0].audio_url?.substring(0, 60) || 'N/A'}...`);
        console.log(`     - video_url: ${songs[0].video_url?.substring(0, 60) || 'N/A'}...`);
        console.log(`     - model_name: ${songs[0].model_name || 'N/A'}`);
      }

      if (songs.length > 0 && songs[0].audio_url && !songs[0].audio_url.includes('audiopipe')) {
        bgmUrl = songs[0].audio_url;
        break;
      }
    }

    if (!bgmUrl) {
      console.error('❌ 타임아웃: BGM 생성 완료 대기 중 시간 초과');
      process.exit(1);
    }

    // 3. BGM 다운로드
    console.log();
    console.log('📥 [STEP 3] BGM 다운로드...');
    console.log(`   URL: ${bgmUrl}`);

    const audioResponse = await axios.get(bgmUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioResponse.data);
    const bgmFilename = 'bgm_test.mp3';
    const bgmFilepath = path.join(outputFolder, bgmFilename);
    fs.writeFileSync(bgmFilepath, audioBuffer);

    console.log(`   ✅ 저장 완료: ${bgmFilepath}`);
    console.log(`   파일 크기: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ BGM 테스트 성공!');
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

testBGM();
