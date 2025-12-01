/**
 * Creatomate 비디오 합성 테스트
 * 기존 비디오 파일들을 사용해서 Creatomate 합성만 테스트
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
  CREATOMATE_API_KEY: process.env.CREATOMATE_API_KEY || '',
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// Creatomate 테스트
// =====================
async function testCreatomate() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎥 Creatomate 비디오 합성 테스트');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // API 키 확인
  if (!CONFIG.CREATOMATE_API_KEY) {
    console.error('❌ CREATOMATE_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  console.log(`🔑 CREATOMATE_API_KEY: ${CONFIG.CREATOMATE_API_KEY.substring(0, 15)}...`);

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, CONFIG.EXISTING_FOLDER);

  // 기존 비디오 파일 확인
  const hedraVideo = path.join(outputFolder, 'hedra_test_video.mp4');
  const veoVideo = path.join(outputFolder, 'veo_test_video.mp4');

  console.log(`📁 폴더: ${outputFolder}`);
  console.log(`📹 Hedra 비디오: ${fs.existsSync(hedraVideo) ? '✓' : '✗'}`);
  console.log(`📹 Veo 비디오: ${fs.existsSync(veoVideo) ? '✓' : '✗'}`);
  console.log();

  // 사용 가능한 비디오 목록
  const videos = [];
  if (fs.existsSync(hedraVideo)) {
    videos.push({ path: hedraVideo, duration: 5 });
  }
  if (fs.existsSync(veoVideo)) {
    videos.push({ path: veoVideo, duration: 5 });
  }

  if (videos.length === 0) {
    console.error('❌ 테스트할 비디오 파일이 없습니다. Hedra/Veo 테스트를 먼저 실행하세요.');
    process.exit(1);
  }

  try {
    // 1. 비디오 URL 준비 (Creatomate는 외부 URL만 지원)
    console.log('📤 [STEP 1] 비디오 URL 준비...');

    // 테스트용 공개 비디오 URL 사용 (Pexels sample video)
    // 실제 파이프라인에서는 Hedra가 반환한 URL을 직접 사용
    const testSampleVideoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    const testVideo = videos[0];
    console.log(`   로컬 비디오: ${path.basename(testVideo.path)}`);
    console.log(`   테스트 URL: ${testSampleVideoUrl.substring(0, 60)}...`);
    console.log('   (실제 파이프라인에서는 Hedra/Veo URL 사용)');
    console.log();

    const uploadedVideoUrl = testSampleVideoUrl;

    // 2. Creatomate Source 생성
    console.log('🎬 [STEP 2] Creatomate Source 생성...');

    const elements = [];

    // 배경
    elements.push({
      type: 'shape',
      shape: 'rectangle',
      width: '100%',
      height: '100%',
      fill_color: '#000000',
      time: 0,
    });

    // 비디오
    elements.push({
      type: 'video',
      source: uploadedVideoUrl,
      time: 0,
      duration: testVideo.duration,
      fit: 'contain',
    });

    // 테스트용 자막
    elements.push({
      type: 'text',
      text: '땅콩이 테스트 자막!',
      time: 1,
      duration: 3,
      width: '90%',
      x: '50%',
      y: '85%',
      x_anchor: '50%',
      y_anchor: '50%',
      font_family: 'Noto Sans KR',
      font_size: '5vw',
      font_weight: '700',
      fill_color: '#FFFFFF',
      background_color: 'rgba(0,0,0,0.6)',
      background_x_padding: '3%',
      background_y_padding: '2%',
      background_border_radius: '5%',
      text_align: 'center',
    });

    const creatomateSource = {
      output_format: 'mp4',
      width: 1080,
      height: 1920,
      frame_rate: 30,
      duration: testVideo.duration,
      elements,
    };

    console.log(`   요소: ${elements.length}개`);
    console.log(`   해상도: 1080x1920 (Shorts)`);
    console.log(`   길이: ${testVideo.duration}초`);
    console.log();

    // Source 파일 저장
    fs.writeFileSync(
      path.join(outputFolder, 'creatomate_test_source.json'),
      JSON.stringify(creatomateSource, null, 2)
    );

    // 3. Creatomate API 호출
    console.log('🚀 [STEP 3] Creatomate API 호출...');

    const createResponse = await axios.post('https://api.creatomate.com/v1/renders', {
      output_format: 'mp4',
      source: creatomateSource,
    }, {
      headers: {
        'Authorization': `Bearer ${CONFIG.CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const renderId = createResponse.data[0].id;
    console.log(`   Render ID: ${renderId}`);
    console.log();

    // 4. 완료 대기
    console.log('⏳ [STEP 4] 렌더링 완료 대기...');
    let renderUrl = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const status = await axios.get(`https://api.creatomate.com/v1/renders/${renderId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.CREATOMATE_API_KEY}` },
      });

      console.log(`   [${(i + 1) * 5}초] 상태: ${status.data.status}`);

      if (status.data.status === 'succeeded') {
        renderUrl = status.data.url;
        break;
      }
      if (status.data.status === 'failed') {
        console.error('❌ 렌더링 실패:', status.data.error_message);
        process.exit(1);
      }
    }

    if (!renderUrl) {
      console.error('❌ 타임아웃: 렌더링 완료 대기 중 시간 초과');
      process.exit(1);
    }

    // 5. 결과 다운로드
    console.log();
    console.log('📥 [STEP 5] 결과 다운로드...');
    console.log(`   URL: ${renderUrl}`);

    const videoResponse = await axios.get(renderUrl, { responseType: 'arraybuffer' });
    const outputBuffer = Buffer.from(videoResponse.data);
    const outputFilename = 'creatomate_test_output.mp4';
    const outputFilepath = path.join(outputFolder, outputFilename);
    fs.writeFileSync(outputFilepath, outputBuffer);

    console.log(`   ✅ 저장 완료: ${outputFilepath}`);
    console.log(`   파일 크기: ${(outputBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ Creatomate 테스트 성공!');
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

testCreatomate();
