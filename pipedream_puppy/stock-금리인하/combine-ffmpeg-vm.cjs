/**
 * Stock 금리인하 → YouTube Shorts 렌더링
 * - 비디오를 음성 길이에 맞춰 반복 재생
 * - 씬별 음성 파일 합성
 * - 타이밍별 자막 적용
 */

const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { promisify } = require("util");
const { exec } = require("child_process");
const axios = require("axios");

const execAsync = promisify(exec);

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

const TEMP_DIR = path.join(__dirname, "temp_render");

// ==========================================
// 오디오/비디오 길이 측정
// ==========================================
async function getMediaDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// ==========================================
// 로컬 FFmpeg: 비디오를 음성 길이에 맞춰 반복 재생 + 음성 합성
// ==========================================
async function loopVideoWithVoice(videoPath, voicePath, outputPath) {
  const videoDuration = await getMediaDuration(videoPath);
  const audioDuration = await getMediaDuration(voicePath);

  if (videoDuration <= 0 || audioDuration <= 0) {
    throw new Error(`Invalid duration: video=${videoDuration}s, audio=${audioDuration}s`);
  }

  console.log(`      📏 비디오: ${videoDuration.toFixed(2)}s, 음성: ${audioDuration.toFixed(2)}s`);

  if (videoDuration >= audioDuration) {
    // 비디오가 음성보다 길거나 같으면 그냥 합성 (음성 길이에 맞춰 자름)
    await execAsync(`ffmpeg -y -i "${videoPath}" -i "${voicePath}" -c:v libx264 -preset ultrafast -c:a aac -map 0:v -map 1:a -t ${audioDuration} "${outputPath}"`);
  } else {
    // 비디오가 음성보다 짧으면 반복 재생
    const loopCount = Math.ceil(audioDuration / videoDuration);
    console.log(`      🔁 비디오 ${loopCount}회 반복 필요`);

    // stream_loop으로 반복하고 음성 길이에 맞춰 자름
    await execAsync(`ffmpeg -y -stream_loop ${loopCount - 1} -i "${videoPath}" -i "${voicePath}" -c:v libx264 -preset ultrafast -c:a aac -map 0:v -map 1:a -t ${audioDuration} "${outputPath}"`);
  }

  return { outputPath, duration: audioDuration };
}

// ==========================================
// GCS 업로드 함수
// ==========================================
async function uploadToGCS(localPath, gcsPath) {
  const storage = new Storage();
  const bucket = storage.bucket(GCS_BUCKET);

  console.log(`Uploading ${path.basename(localPath)} to gs://${GCS_BUCKET}/${gcsPath}...`);
  try {
    await bucket.upload(localPath, { destination: gcsPath });
  } catch (err) {
    console.error(`  [ERROR] Upload failed: ${err.message}`);
    throw err;
  }

  const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
  console.log(`  -> ${publicUrl}`);
  return publicUrl;
}

// ==========================================
// 메인 함수
// ==========================================
async function main() {
  console.log("🎬 Stock 금리인하 → YouTube Shorts 렌더링 시작\n");

  const videoDir = path.join(__dirname, "video");
  const audioDir = path.join(__dirname, "audio");
  const scriptPath = path.join(__dirname, "script", "narration.json");

  // temp 디렉토리 생성
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // 1. 자막 데이터 로드
  console.log("📝 [1/6] 자막 데이터 로드...");
  const narrationData = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  console.log(`   - ${narrationData.length}개 씬 로드 완료`);

  // 2. 씬 정보 설정
  const scenes = [
    { index: 1, videoFile: "씬1.mp4", audioFile: "scene_1_narration.mp3" },
    { index: 2, videoFile: "씬2.mp4", audioFile: "scene_2_narration.mp3" },
    { index: 3, videoFile: "씬3.mp4", audioFile: "scene_3_narration.mp3" },
    { index: 4, videoFile: "씬4.mp4", audioFile: "scene_4_narration.mp3" },
    { index: 5, videoFile: "씬5.mp4", audioFile: "scene_5_narration.mp3" },
    { index: 6, videoFile: "씬6.mp4", audioFile: "scene_6_narration.mp3" },
  ];

  // 3. 비디오 + 음성 합성 (로컬) - 음성 길이에 맞춰 영상 반복 재생
  console.log("\n🔊 [2/6] 비디오 + 음성 합성 (로컬 FFmpeg)...");
  const processedVideos = [];

  for (const scene of scenes) {
    const videoPath = path.join(videoDir, scene.videoFile);
    const audioPath = path.join(audioDir, scene.audioFile);
    const outputPath = path.join(TEMP_DIR, `processed_scene${scene.index}.mp4`);

    if (!fs.existsSync(videoPath)) {
      console.log(`   ⚠️ [SKIP] Video not found: ${scene.videoFile}`);
      continue;
    }

    if (!fs.existsSync(audioPath)) {
      console.log(`   ⚠️ [SKIP] Audio not found: ${scene.audioFile}`);
      continue;
    }

    console.log(`   📹 씬${scene.index} 처리 중...`);
    const result = await loopVideoWithVoice(videoPath, audioPath, outputPath);
    console.log(`   ✅ 씬${scene.index}: ${result.duration.toFixed(2)}s 완료`);

    processedVideos.push({
      index: scene.index,
      path: outputPath,
      duration: result.duration,
      narration: narrationData.find(n => n.scene === scene.index)
    });
  }

  // 4. GCS 업로드
  console.log("\n☁️ [3/6] GCS 업로드...");
  const timestamp = Date.now();
  const folderName = `stock_fed_${timestamp}`;

  const videoUrls = [];
  for (const video of processedVideos) {
    const gcsPath = `${folderName}/processed_scene${video.index}.mp4`;
    const url = await uploadToGCS(video.path, gcsPath);
    videoUrls.push({
      index: video.index,
      url,
      duration: video.duration,
      narration: video.narration
    });
  }

  // 5. 타이밍별 자막 생성 (씬 누적 시간 기준)
  console.log("\n📝 [4/6] 타이밍별 자막 생성...");
  const timed_subtitles = [];
  let cumulativeTime = 0;

  for (const video of videoUrls) {
    const narration = video.narration;
    const sceneDuration = video.duration;

    if (narration && narration.subtitles) {
      // 새 형식: 각 씬에 여러 개의 자막이 있음
      for (const sub of narration.subtitles) {
        const absoluteStart = cumulativeTime + sub.start_time;
        const absoluteEnd = cumulativeTime + sub.end_time;

        timed_subtitles.push({
          start_time: absoluteStart,
          end_time: absoluteEnd,
          text_ko: sub.text_ko || "",
          text_en: sub.text_en || "",
          color: "white"
        });

        console.log(`   📌 ${absoluteStart.toFixed(2)}s - ${absoluteEnd.toFixed(2)}s: "${sub.text_ko.substring(0, 30)}..."`);
      }
    }

    cumulativeTime += sceneDuration;
  }

  console.log(`   총 ${timed_subtitles.length}개 자막 생성, 총 길이: ${cumulativeTime.toFixed(2)}s`);

  // 6. FFmpeg VM에 렌더링 요청
  console.log("\n🎥 [5/6] FFmpeg VM 렌더링 요청...");

  // 비디오 데이터 구성
  const videos = videoUrls.map((v) => ({
    index: v.index,
    url: v.url,
    duration: v.duration,
    scene_type: "narration",
    speaker: "main"
  }));

  // 9:16 레이아웃 설정
  const outputWidth = 1080;
  const outputHeight = 1920;

  // 레이아웃 계산 (상단 여백 줄이고, 영상-푸터 간격 80px)
  const headerY = 100;              // 헤더 시작: 100px
  const headerHeight = 130;         // 헤더 영역 (한글+영어)
  const videoAreaY = 250;           // 영상 시작: 250px (헤더와 가까이)
  const footerHeight = 120;         // 푸터 높이
  const footerY = 1670;             // 푸터 시작: 1670px (80 위로)
  const videoFooterGap = 80;        // 영상-푸터 간격
  const videoAreaHeight = footerY - videoFooterGap - videoAreaY;  // 1340px
  const subtitleY = 1470;           // 자막 위치: 1470px (80 위로)

  const layoutConfig = {
    video_area: { x: 0, y: videoAreaY, width: outputWidth, height: videoAreaHeight },
    header_area: { y: headerY, height: headerHeight },
    subtitle_area: { y: subtitleY, height: 180, single_line: false, max_lines: 2 },
    footer_area: { y: footerY, height: footerHeight },
    font_scale: 1
  };

  const renderPayload = {
    videos: videos,
    header_text: "오늘 밤 Fed 발표, 이렇게 대응하세요!",
    header_text_english: "Fed Rate Decision Tonight: How to React",
    footer_text: "주식 분석 채널 구독하기",
    footer_text_english: "Subscribe for Stock Analysis",
    timed_subtitles: timed_subtitles,  // 타이밍별 자막 배열
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    use_original_audio: true,  // 이미 로컬에서 음성 합성됨
    width: outputWidth,
    height: outputHeight,
    use_origin_size: true,
    origin_layout: layoutConfig,
    output_bucket: GCS_BUCKET,
    output_path: `${folderName}/final_stock_fed.mp4`,
    folder_name: folderName,
    font_settings: {
      header_korean: { font: "NanumSquareRoundOTFEB", size: 80, color: "white", border_width: 5, border_color: "black" },
      header_english: { font: "NotoSerif-Regular", size: 42, color: "white", border_width: 3, border_color: "black" },
      subtitle_korean: { font: "NanumSquareRoundOTFEB", size: 63, color: "white", border_width: 6, border_color: "black" },
      subtitle_english: { font: "NotoSerif-Regular", size: 39, color: "white", border_width: 4, border_color: "black" }
    }
  };

  console.log("\n📤 렌더링 요청 데이터:");
  console.log(`   - 비디오: ${videos.length}개`);
  console.log(`   - 타이밍 자막: ${timed_subtitles.length}개`);
  console.log(`   - 총 길이: ${cumulativeTime.toFixed(2)}s`);

  try {
    const response = await axios.post(`${FFMPEG_VM_URL}/render/puppy`, renderPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 600000
    });

    console.log("\n===========================================");
    console.log("SUCCESS!");
    console.log("===========================================");
    console.log(`Time elapsed: ${response.data.elapsed || "N/A"}`);
    console.log(`Total duration: ${response.data.total_duration}s`);
    console.log(`Output URL: ${response.data.url}`);

    // 로컬에 결과 URL 저장
    const resultPath = path.join(__dirname, "output_url.txt");
    fs.writeFileSync(resultPath, response.data.url);
    console.log(`\nOutput URL saved to: ${resultPath}`);

    // 7. temp 파일 정리
    console.log("\n🧹 [6/6] 임시 파일 정리...");
    for (const video of processedVideos) {
      if (fs.existsSync(video.path)) {
        fs.unlinkSync(video.path);
      }
    }
    console.log("   ✅ 정리 완료");

    return response.data;

  } catch (error) {
    console.error("\n===========================================");
    console.error("ERROR!");
    console.error("===========================================");
    console.error("Message:", error.message);
    if (error.response?.data) {
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// 실행
main().then(result => {
  console.log("\n🎉 완료!");
  if (result?.url) {
    console.log(`📺 최종 영상: ${result.url}`);
  }
  process.exit(0);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
