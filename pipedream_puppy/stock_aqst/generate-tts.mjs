import textToSpeech from '@google-cloud/text-to-speech';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// AQST 스크립트 한국어 텍스트 (30대 여성 아나운서 스타일)
const scenes = [
  {
    scene_id: 1,
    duration: 8,
    text: "투자 권유 아닙니다! 교육 목적 분석입니다. AQST 바이오 기업, 최신 공개 데이터로 분석해봤습니다. 차트부터 FDA 승인까지, 팩트만 전달합니다!"
  },
  {
    scene_id: 2,
    duration: 10,
    text: "현재가 6달러 10센트! 최근 저점 대비 15퍼센트 반등 중! 애널리스트 평균 목표가 10달러 30센트, 최고 목표가는 무려 12달러에서 15달러! 현재가 대비 최대 145퍼센트 상승 여력!"
  },
  {
    scene_id: 3,
    duration: 10,
    text: "최근 기관 투자 폭발적 증가! 주요 헤지펀드들이 대량 매수 중! 페일 파이어 캐피탈 34만주, 시오 캐피탈 55만주, 다이아메트릭 캐피탈 16만주, 커먼웰스 에쿼티 590만 달러 신규 진입! 기관 보유율 32.45퍼센트로 상승!"
  },
  {
    scene_id: 4,
    duration: 10,
    text: "FDA 승인 임박! PDUFA 날짜 2026년 1월 31일! 오늘 기준 52일만 남았습니다! FDA 자문위원회 면제 승인! 이는 승인 가능성 대폭 상승 신호! 제품명 아나필름, 혁신적 설하 에피네프린 필름! 미국 시장 규모 11억 달러, 2032년 20억 달러 전망!"
  },
  {
    scene_id: 5,
    duration: 10,
    text: "전략 투자 7천5백만 달러 확보! FDA 승인 시 실행되는 조건부 계약! 현금 보유액 1억 2천9백만 달러! 공모로 8천5백만 달러 추가 조달 완료! 캐나다 시장 진출도 진행 중! 신규 파이프라인 개발도 계속됩니다!"
  },
  {
    scene_id: 6,
    duration: 7,
    text: "공개된 시장 데이터! 숏 인터레스트 1천920만주! 약 16퍼센트 공매도! 데이즈 투 커버 약 6일! 풋콜 비율 0.08에서 0.20! 일반적으로 0.7 이하면 강세! AQST는 극도로 낮은 수준! 콜 옵션 압도적 우세! 옵션은 고위험입니다!"
  },
  {
    scene_id: 7,
    duration: 5,
    text: "SEC, FDA 공식 출처 기반! 여러분의 생각은? 댓글로 의견 남겨주세요! 좋아요와 구독 부탁드립니다! 다음 분석도 기대해주세요!"
  }
];

async function generateTTS() {
  const client = new textToSpeech.TextToSpeechClient();

  const outputDir = './audio';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log('=== AQST 음성 생성 시작 (30대 여성 아나운서 스타일) ===\n');

  for (const scene of scenes) {
    console.log(`씬 ${scene.scene_id} 생성 중... (${scene.duration}초 목표)`);

    // 1.2배속 고정 (자연스러운 뉴스 속도)
    const speakingRate = 1.2;

    const request = {
      input: { text: scene.text },
      voice: {
        languageCode: 'ko-KR',
        // Wavenet-A: 여성 목소리 (자연스럽고 전문적)
        name: 'ko-KR-Wavenet-A',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speakingRate,
        pitch: 0.5, // 약간 높은 톤 (아나운서 느낌)
        volumeGainDb: 0,
        effectsProfileId: ['headphone-class-device']
      }
    };

    try {
      const [response] = await client.synthesizeSpeech(request);
      const outputPath = path.join(outputDir, `scene${scene.scene_id}_voice.mp3`);
      writeFileSync(outputPath, response.audioContent, 'binary');
      console.log(`  ✓ ${outputPath} 생성 완료 (speakingRate: ${speakingRate.toFixed(2)})`);
    } catch (error) {
      console.error(`  ✗ 씬 ${scene.scene_id} 실패:`, error.message);
    }
  }

  // 전체 합친 버전도 생성
  console.log('\n전체 나레이션 생성 중...');
  const fullText = scenes.map(s => s.text).join(' ');

  const fullRequest = {
    input: { text: fullText },
    voice: {
      languageCode: 'ko-KR',
      name: 'ko-KR-Wavenet-A',
      ssmlGender: 'FEMALE'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.2, // 자연스러운 뉴스 속도
      pitch: 0.5,
      volumeGainDb: 0,
      effectsProfileId: ['headphone-class-device']
    }
  };

  try {
    const [response] = await client.synthesizeSpeech(fullRequest);
    const outputPath = path.join(outputDir, 'full_narration.mp3');
    writeFileSync(outputPath, response.audioContent, 'binary');
    console.log(`  ✓ ${outputPath} 생성 완료`);
  } catch (error) {
    console.error('  ✗ 전체 나레이션 실패:', error.message);
  }

  console.log('\n=== 음성 생성 완료 ===');
  console.log(`출력 폴더: ${path.resolve(outputDir)}`);
}

generateTTS().catch(console.error);
