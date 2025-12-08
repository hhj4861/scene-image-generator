/**
 * FFmpeg VM 성능 비교 테스트
 * - 로컬 최적화 서버 (3001) vs 기존 VM 서버 (3000)
 * 
 * 실행: node pipedream_puppy/test_code/test-ffmpeg-compare.mjs [local|vm|both]
 */

const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251204_e9d28405_My_First_Winter_Job_";

const SERVERS = {
  local: { url: "http://localhost:3001", name: "로컬 최적화" },
  vm: { url: "http://34.64.168.173:3000", name: "기존 VM" }
};

// 1개 비디오 테스트 (빠른 테스트용)
const singleVideoPayload = {
  videos: [
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_000.mp4`,
      index: 0,
      duration: 4,
      narration: "아! 추워! 발 시려!",
      narration_korean: "아! 추워! 발 시려!",
      narration_english: "Ah! It's cold!",
      dialogue: { script: "아! 추워! 발 시려!", script_english: "Ah! It's cold!", interviewer: "" },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    }
  ],
  bgm_url: null,
  bgm_volume: 0.2,
  header_text: "테스트",
  header_text_english: "TEST",
  footer_text: "땅콩TV📺",
  subtitle_enabled: true,
  subtitle_english_enabled: true,
  width: 1080,
  height: 1920,
  output_bucket: GCS_BUCKET,
  output_path: `${FOLDER_NAME}/test_compare_${Date.now()}.mp4`,
  folder_name: FOLDER_NAME
};

// 3개 비디오 테스트 (중간 테스트용)
const threeVideoPayload = {
  ...singleVideoPayload,
  videos: [
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_000.mp4`,
      index: 0, duration: 4,
      narration: "아! 추워! 발 시려! 못 참아! 으앙!",
      narration_korean: "아! 추워! 발 시려! 못 참아! 으앙!",
      narration_english: "Ah! It's cold! My paws are freezing!",
      dialogue: { script: "아! 추워! 발 시려!", script_english: "Ah! It's cold!", interviewer: "" },
      spoken_language: "korean", scene_type: "interview_answer", speaker: "main", character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_001.mp4`,
      index: 1, duration: 6,
      narration: "땅콩 씨, 오늘 날씨가 많이 춥죠?",
      narration_korean: "땅콩 씨, 오늘 날씨가 많이 춥죠?",
      narration_english: "Mr. TtangKong, it's very cold today?",
      dialogue: { script: "땅콩 씨, 오늘 날씨가 많이 춥죠?", script_english: "Mr. TtangKong, it's cold?", interviewer: "땅콩 씨, 오늘 날씨가 많이 춥죠?" },
      spoken_language: "korean", scene_type: "interview_question", is_interview_question: true, speaker: "interviewer", character_name: "인터뷰어"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_002.mp4`,
      index: 2, duration: 6,
      narration: "네! 견생 처음이에요! 발이 너무 시려워서!",
      narration_korean: "네! 견생 처음이에요! 발이 너무 시려워서!",
      narration_english: "Yes! It's my first time! My paws are so cold!",
      dialogue: { script: "네! 견생 처음이에요!", script_english: "Yes! It's my first time!", interviewer: "" },
      spoken_language: "korean", scene_type: "interview_answer", speaker: "main", character_name: "땅콩"
    }
  ],
  output_path: `${FOLDER_NAME}/test_compare_3vid_${Date.now()}.mp4`,
};

async function testServer(serverKey, payload) {
  const server = SERVERS[serverKey];
  console.log(`\n${"═".repeat(50)}`);
  console.log(`🧪 테스트: ${server.name} (${server.url})`);
  console.log(`📹 비디오 수: ${payload.videos.length}개`);
  console.log(`${"═".repeat(50)}`);

  // 헬스체크
  try {
    const healthRes = await fetch(`${server.url}/health`, { signal: AbortSignal.timeout(5000) });
    const healthData = await healthRes.json();
    console.log(`✅ 서버 상태: ${JSON.stringify(healthData)}`);
  } catch (e) {
    console.error(`❌ 서버 연결 실패: ${e.message}`);
    return null;
  }

  // 렌더링 테스트
  const startTime = Date.now();
  let lastLog = startTime;
  
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`⏳ ${elapsed}초 경과...`);
  }, 10000);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분 타임아웃

    const response = await fetch(`${server.url}/render/puppy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(progressInterval);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 실패 (${response.status}): ${errorText}`);
      return { server: serverKey, success: false, time: parseFloat(elapsed), error: errorText };
    }

    const result = await response.json();
    const totalDuration = payload.videos.reduce((sum, v) => sum + v.duration, 0);
    const ratio = (parseFloat(elapsed) / totalDuration).toFixed(2);

    console.log(`\n✅ 성공!`);
    console.log(`⏱️  소요 시간: ${elapsed}초`);
    console.log(`📹 비디오 길이: ${totalDuration}초`);
    console.log(`📊 배율: ${ratio}x (1x = 실시간)`);
    
    if (result.performance) {
      console.log(`\n📈 상세 성능:`);
      console.log(`   - 다운로드: ${result.performance.download_time_seconds}초`);
      console.log(`   - 렌더링: ${result.performance.render_time_seconds}초`);
      console.log(`   - 업로드: ${result.performance.upload_time_seconds}초`);
    }

    console.log(`🔗 결과 URL: ${result.url}`);

    return {
      server: serverKey,
      serverName: server.name,
      success: true,
      time: parseFloat(elapsed),
      duration: totalDuration,
      ratio: parseFloat(ratio),
      url: result.url,
      performance: result.performance
    };

  } catch (e) {
    clearInterval(progressInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ 오류 (${elapsed}초): ${e.message}`);
    return { server: serverKey, success: false, time: parseFloat(elapsed), error: e.message };
  }
}

async function runComparison(mode = "local", videoCount = 1) {
  console.log("🔬 FFmpeg 성능 비교 테스트");
  console.log(`📋 모드: ${mode}`);
  console.log(`📹 비디오 수: ${videoCount}개`);

  const payload = videoCount === 1 ? singleVideoPayload : threeVideoPayload;
  payload.output_path = `${FOLDER_NAME}/test_${mode}_${videoCount}vid_${Date.now()}.mp4`;

  const results = [];

  if (mode === "local" || mode === "both") {
    const localResult = await testServer("local", payload);
    if (localResult) results.push(localResult);
  }

  if (mode === "vm" || mode === "both") {
    // 다른 output_path 사용
    const vmPayload = { ...payload, output_path: `${FOLDER_NAME}/test_vm_${videoCount}vid_${Date.now()}.mp4` };
    const vmResult = await testServer("vm", vmPayload);
    if (vmResult) results.push(vmResult);
  }

  // 결과 비교
  if (results.length > 1) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📊 성능 비교 결과`);
    console.log(`${"═".repeat(50)}`);
    
    results.forEach(r => {
      if (r.success) {
        console.log(`${r.serverName}: ${r.time}초 (${r.ratio}x)`);
      } else {
        console.log(`${r.serverName}: 실패 - ${r.error}`);
      }
    });

    const successResults = results.filter(r => r.success);
    if (successResults.length === 2) {
      const [local, vm] = successResults[0].server === "local" 
        ? [successResults[0], successResults[1]] 
        : [successResults[1], successResults[0]];
      
      const improvement = ((vm.time - local.time) / vm.time * 100).toFixed(1);
      const speedup = (vm.time / local.time).toFixed(2);
      
      console.log(`\n🚀 최적화 효과:`);
      console.log(`   - 속도 향상: ${speedup}x 빠름`);
      console.log(`   - 시간 단축: ${improvement}%`);
    }
  }

  return results;
}

// 실행
const args = process.argv.slice(2);
const mode = args[0] || "local"; // local, vm, both
const videoCount = parseInt(args[1]) || 1; // 1 또는 3

runComparison(mode, videoCount);




