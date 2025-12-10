const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 플래그 처리: node combine-ffmpeg-vm.cjs origin
const USE_ORIGIN_SIZE = process.argv[2] === "origin";

// narration.json에서 자막 데이터 로드
const narrationPath = path.join(__dirname, "script", "narration.json");
const narrationData = JSON.parse(fs.readFileSync(narrationPath, "utf-8"));

// 씬별 자막 매핑
function getNarration(sceneIndex) {
  const scene = narrationData.find(s => s.scene === sceneIndex);
  if (!scene) return { narration: "", narration_english: "" };
  return {
    narration: scene.prompt["한글자막"] || scene.original || "",
    narration_english: scene.prompt["영어자막"] || ""
  };
}

// Stock 금리인하 스크립트 데이터
const scriptData = {
  title: {
    korean: "오늘 밤 Fed 발표, 이렇게 대응하세요!",
    english: "Fed Rate Decision Tonight: How to React"
  },
  // BGM URL - 생성된 BGM이 있으면 여기에 URL을 넣으세요
  bgm_url: null, // 현재 BGM 없음 (나레이션이 메인)
  // 씬 정보 (로컬 파일)
  scenes: [
    { index: 1, localFile: "씬1.mp4" },
    { index: 2, localFile: "씬2.mp4" },
    { index: 3, localFile: "씬3.mp4" },
    { index: 4, localFile: "씬4.mp4" },
    { index: 5, localFile: "씬5.mp4" },
    { index: 6, localFile: "씬6.mp4" }
  ]
};

// 나레이션 오디오 파일 경로
const NARRATION_AUDIO_DIR = path.join(__dirname, "audio");

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

// 원본 영상 해상도 가져오기
function getVideoResolution(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
      { encoding: "utf8" }
    ).trim();
    const [width, height] = output.split(",").map(Number);
    return { width, height };
  } catch (err) {
    console.error(`Failed to get resolution for ${videoPath}`);
    return { width: 1080, height: 1920 }; // fallback
  }
}

// 오디오 파일 길이 가져오기 (ffprobe 사용)
function getAudioDuration(audioPath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { encoding: "utf8" }
    ).trim();
    return parseFloat(output);
  } catch (err) {
    console.error(`Failed to get audio duration for ${audioPath}:`, err.message);
    return 8; // fallback: 8초
  }
}

async function combineVideos() {
  const testFolder = `stock_fed_${Date.now()}`;
  const videoDir = path.join(__dirname, "video");

  console.log("===========================================");
  console.log("Stock 금리인하 - Video Combine with FFmpeg VM");
  console.log(`Mode: ${USE_ORIGIN_SIZE ? "ORIGIN SIZE" : "1080x1920 (default)"}`);
  console.log("===========================================\n");

  // 1. 영상 파일 GCS 업로드 (오디오 길이 기반 duration 설정)
  console.log("Step 1: Uploading videos to GCS (with audio-synced duration)...\n");
  const videos = [];

  for (const scene of scriptData.scenes) {
    const localPath = path.join(videoDir, scene.localFile);

    if (!fs.existsSync(localPath)) {
      console.error(`  [SKIP] File not found: ${scene.localFile}`);
      continue;
    }

    const gcsPath = `${testFolder}/scene${scene.index}.mp4`;
    const url = await uploadToGCS(localPath, gcsPath);

    const { narration, narration_english } = getNarration(scene.index);

    // 씬별 오디오 파일에서 duration 계산
    const sceneAudioPath = path.join(NARRATION_AUDIO_DIR, `scene_${scene.index}_narration.mp3`);
    let sceneDuration = 8; // 기본값
    if (fs.existsSync(sceneAudioPath)) {
      sceneDuration = getAudioDuration(sceneAudioPath);
      console.log(`  Scene ${scene.index}: Audio duration = ${sceneDuration.toFixed(2)}s`);
    }

    // 씬별 오디오 업로드
    let sceneAudioUrl = null;
    if (fs.existsSync(sceneAudioPath)) {
      const audioGcsPath = `${testFolder}/audio_scene${scene.index}.mp3`;
      sceneAudioUrl = await uploadToGCS(sceneAudioPath, audioGcsPath);
    }

    videos.push({
      url,
      index: scene.index,
      duration: sceneDuration, // 오디오 길이 기반 duration
      narration: narration,
      narration_english: narration_english,
      tts_audio_url: sceneAudioUrl, // 씬별 TTS 오디오
      is_performance: false,
      scene_type: "narration"
    });
  }

  console.log(`\n  Uploaded ${videos.length} videos\n`);

  // 2. 전체 나레이션 오디오 업로드 (백업용)
  console.log("Step 2: Uploading full narration audio...\n");
  const fullNarrationPath = path.join(NARRATION_AUDIO_DIR, "full_narration.mp3");
  let fullNarrationUrl = null;
  if (fs.existsSync(fullNarrationPath)) {
    const audioGcsPath = `${testFolder}/full_narration.mp3`;
    fullNarrationUrl = await uploadToGCS(fullNarrationPath, audioGcsPath);
  } else {
    console.warn("  [WARN] full_narration.mp3 not found!");
  }


  // origin 모드일 경우 첫 번째 영상의 해상도 사용
  let outputWidth = 1080;
  let outputHeight = 1920;

  if (USE_ORIGIN_SIZE) {
    const firstVideoPath = path.join(videoDir, scriptData.scenes[0].localFile);
    const resolution = getVideoResolution(firstVideoPath);
    outputWidth = resolution.width;
    outputHeight = resolution.height;
    console.log(`  Using origin size: ${outputWidth}x${outputHeight}\n`);
  }

  // 3. FFmpeg VM API 호출
  console.log("Step 3: Calling FFmpeg VM API...\n");

  // 9:16 세로 모드용 레이아웃 설정 (조선-땅콩 스타일)
  const fontScale = outputWidth / 720; // 720 기준 스케일

  // 세로(9:16) 레이아웃: 여백 충분히 확보
  const headerY = 80;              // 상단 여백
  const headerHeight = 140;        // 헤더 영역 (한글+영어)
  const videoAreaY = 350;          // 영상 시작 Y 고정
  const videoAreaHeight = 650;     // 영상 높이
  const videoEndY = videoAreaY + videoAreaHeight;  // 1000

  const videoToFooterGap = 40;     // 영상-푸터 사이 여백
  const footerHeight = 80;         // 푸터 영역
  const footerY = videoEndY + videoToFooterGap;  // 1020

  // 레이아웃 설정
  const layoutConfig = {
    video_area: {
      x: 0,
      y: videoAreaY,
      width: outputWidth,
      height: videoAreaHeight
    },
    header_area: {
      y: headerY,
      height: headerHeight
    },
    subtitle_area: {
      y: videoEndY - 160, // 영상 하단에 자막 (840)
      height: 140,
      single_line: false,
      max_lines: 2
    },
    footer_area: {
      y: footerY,
      height: footerHeight
    },
    font_scale: fontScale
  };

  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    header_text: scriptData.title.korean,
    header_text_english: scriptData.title.english,
    footer_text: "📊 주식 분석 채널 구독하기",
    footer_text_english: "📊 Subscribe for Stock Analysis",
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    bgm_url: fullNarrationUrl, // 전체 나레이션을 BGM 대신 사용
    bgm_volume: 1.0, // 나레이션은 100% 볼륨
    narration_url: fullNarrationUrl, // 나레이션 전용 필드 (VM에서 지원하는 경우)
    width: outputWidth,
    height: outputHeight,
    use_origin_size: true,
    origin_layout: layoutConfig,
    output_bucket: GCS_BUCKET,
    output_path: `${testFolder}/final_stock_fed.mp4`,
    folder_name: testFolder,
    // 폰트 스타일 설정 (조선-땅콩 스타일)
    font_settings: {
      header_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(32 * fontScale),
        color: "white",
        border_width: Math.round(2 * fontScale),
        border_color: "black"
      },
      header_english: {
        font: "NotoSerif-Regular",
        size: Math.round(16 * fontScale),
        color: "white",
        border_width: Math.round(1 * fontScale),
        border_color: "black"
      },
      subtitle_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(36 * fontScale),
        color: "white",
        border_width: Math.round(3 * fontScale),
        border_color: "black"
      },
      subtitle_english: {
        font: "NotoSerif-Regular",
        size: Math.round(24 * fontScale),
        color: "white",
        border_width: Math.round(2 * fontScale),
        border_color: "black"
      }
    }
  };

  console.log("Request payload:");
  console.log(JSON.stringify(requestPayload, null, 2));
  console.log("\n");

  try {
    console.log("Sending request to FFmpeg VM...");
    const startTime = Date.now();

    const response = await axios.post(
      `${FFMPEG_VM_URL}/render/puppy`,
      requestPayload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 600000 // 10분
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n===========================================");
    console.log("SUCCESS!");
    console.log("===========================================");
    console.log(`Time elapsed: ${elapsed}s`);
    console.log(`Job ID: ${response.data.job_id}`);
    console.log(`Total duration: ${response.data.total_duration?.toFixed(1)}s`);
    console.log(`Output URL: ${response.data.url}`);
    console.log("\nStats:", JSON.stringify(response.data.stats, null, 2));

    // 로컬에 결과 URL 저장
    const resultPath = path.join(__dirname, "output_url.txt");
    fs.writeFileSync(resultPath, response.data.url);
    console.log(`\nOutput URL saved to: ${resultPath}`);

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
combineVideos()
  .then(result => {
    console.log("\n\nVideo combine completed successfully!");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n\nVideo combine failed!");
    process.exit(1);
  });

