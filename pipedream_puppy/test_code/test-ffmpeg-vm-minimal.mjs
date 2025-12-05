/**
 * FFmpeg VM 최소 테스트 - 1개 비디오만으로 테스트
 * 실행: node pipedream_puppy/test_code/test-ffmpeg-vm-minimal.mjs
 */

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251204_e9d28405_My_First_Winter_Job_";

// 1개 비디오만 테스트
const minimalPayload = {
  videos: [
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_000.mp4`,
      index: 0,
      duration: 4,
      narration: "아! 추워! 발 시려!",
      narration_korean: "아! 추워! 발 시려!",
      narration_english: "Ah! It's cold!",
      dialogue: {
        script: "아! 추워! 발 시려!",
        script_english: "Ah! It's cold!",
        interviewer: ""
      },
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
  output_path: `${FOLDER_NAME}/test_minimal_${Date.now()}.mp4`,
  folder_name: FOLDER_NAME
};

async function runTest() {
  console.log("🧪 FFmpeg VM 최소 테스트 (1개 비디오)");
  console.log("─".repeat(50));

  // 1. 헬스체크
  console.log("\n[1/2] VM 헬스체크...");
  const healthStart = Date.now();
  try {
    const res = await fetch(`${FFMPEG_VM_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    console.log(`✅ VM 응답 (${Date.now() - healthStart}ms):`, data);
  } catch (e) {
    console.error("❌ VM 연결 실패:", e.message);
    return;
  }

  // 2. 최소 렌더링 테스트
  console.log("\n[2/2] 1개 비디오 렌더링 테스트...");
  console.log(`📹 비디오: ${minimalPayload.videos[0].url.split('/').pop()}`);
  console.log(`⏱️  예상 duration: ${minimalPayload.videos[0].duration}초`);
  
  const startTime = Date.now();
  let lastLog = startTime;

  // 5초마다 진행상황 출력
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`⏳ ${elapsed}초 경과...`);
  }, 5000);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 300000); // 5분 타임아웃

    const response = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(minimalPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(progressInterval);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ 실패 (${response.status}): ${errorText}`);
      console.log(`⏱️  소요: ${elapsed}초`);
      return;
    }

    const result = await response.json();
    console.log(`\n✅ 성공! 소요 시간: ${elapsed}초`);
    console.log("📹 결과 URL:", result.url);
    
    // 성능 분석
    const videoDuration = minimalPayload.videos[0].duration;
    const ratio = (parseFloat(elapsed) / videoDuration).toFixed(2);
    console.log(`\n📊 성능 분석:`);
    console.log(`   - 비디오 길이: ${videoDuration}초`);
    console.log(`   - 렌더링 시간: ${elapsed}초`);
    console.log(`   - 배율: ${ratio}x (1x = 실시간)`);
    
    if (ratio > 10) {
      console.log(`\n⚠️  경고: 렌더링이 너무 느립니다! (${ratio}x)`);
      console.log("   가능한 원인:");
      console.log("   1. VM CPU/메모리 부족");
      console.log("   2. 비디오 다운로드 속도 문제");
      console.log("   3. GCS 업로드 속도 문제");
      console.log("   4. FFmpeg 설정 비효율");
    } else if (ratio > 5) {
      console.log(`\n⚡ 주의: 렌더링이 다소 느립니다 (${ratio}x)`);
    } else {
      console.log(`\n🚀 양호: 렌더링 속도 정상 (${ratio}x)`);
    }

  } catch (e) {
    clearInterval(progressInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (e.name === "AbortError") {
      console.error(`\n❌ 5분 타임아웃! (${elapsed}초)`);
      console.log("\n🔍 1개 비디오에 5분 이상 = VM 심각한 문제");
    } else {
      console.error(`\n❌ 오류 (${elapsed}초):`, e.message);
    }
  }
}

runTest();

