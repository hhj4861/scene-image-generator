const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 플래그 처리: node combine-ffmpeg-vm.cjs origin
const USE_ORIGIN_SIZE = process.argv[2] === "origin";

// vedio_script.json에서 자막 데이터 로드
const vedioScriptPath = path.join(__dirname, "script", "vedio_script.json");
const vedioScriptData = JSON.parse(fs.readFileSync(vedioScriptPath, "utf-8"));
const vedioScenes = vedioScriptData.$return_value?.scenes || [];

// 씬별 자막 매핑
function getNarration(sceneIndex) {
  const scene = vedioScenes.find(s => s.video === sceneIndex);
  if (!scene) return { narration: "", narration_english: "" };
  return {
    narration: scene.dialogue?.script || "",
    narration_english: scene.dialogue?.script_english || ""
  };
}

// 스키장 땅콩 스크립트 데이터
const scriptData = {
  title: {
    korean: "스키장 인싸견의 최후 ㅋㅋ 엉덩이스키로 셀럽 등극",
    english: "Ski Resort Dog Celebrity 😂 Butt-Sliding Fame"
  },
  bgm_url: "https://cdn1.suno.ai/a66a5a1e-0029-48a5-b431-b96b9fe47d5e.mp3",
  scenes: [
    { index: 1, localFile: "scene1_veo3_json.mp4" },
    { index: 2, localFile: "scene2_veo3_json.mp4" },
    { index: 3, localFile: "scene3_veo3_json.mp4" },
    { index: 4, localFile: "scene4_veo3_json.mp4" },
    { index: 5, localFile: "scene5_veo3_json.mp4" },
    { index: 6, localFile: "scene6_veo3_json.mp4" },
    { index: 7, localFile: "scene7_veo3_json.mp4" },
    { index: 8, localFile: "scene8_veo3_json.mp4" },
    { index: 9, localFile: "scene9_veo3_json.mp4" }
  ]
};

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

async function combineVideos() {
  const testFolder = `ski_peanut_${Date.now()}`;
  const videoDir = path.join(__dirname, "video");

  console.log("===========================================");
  console.log("스키장 땅콩 - Video Combine with FFmpeg VM");
  console.log(`Mode: ${USE_ORIGIN_SIZE ? "ORIGIN SIZE" : "1080x1920 (default)"}`);
  console.log("===========================================\n");

  // 1. 영상 파일 GCS 업로드
  console.log("Step 1: Uploading videos to GCS...\n");
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
    videos.push({
      url,
      index: scene.index,
      duration: scene.duration,
      narration: narration,
      narration_english: narration_english,
      is_performance: false,
      scene_type: "interview"
    });
  }

  console.log(`\n  Uploaded ${videos.length} videos\n`);

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

  // 2. FFmpeg VM API 호출
  console.log("Step 2: Calling FFmpeg VM API...\n");

  // 레이아웃 및 폰트 스케일 설정
  const fontScale = USE_ORIGIN_SIZE ? (outputWidth / 1080) : 1;

  // 새 레이아웃: 상단여백 복원 + 자막 영상내부 + 푸터 위로 올림
  const headerY = 110; // 상단 여백 추가 (80 → 110: 한글타이틀 더 아래로)
  const headerHeight = 120; // 헤더 영역 (한글+영문)
  const headerGap = 30; // 헤더-영상 간격
  const videoAreaY = headerY + headerHeight + headerGap; // 영상 시작: 200px
  const footerHeight = 80; // 푸터 영역 높이
  const footerY = 1550; // 푸터 위치: 위로 올림 (1750 → 1550)
  const videoEndY = footerY - 50; // 영상 끝: 1700px
  const videoAreaHeight = videoEndY - videoAreaY; // 영상 높이: 1500px

  // 레이아웃 설정
  const layoutConfig = {
    video_area: {
      x: 0,
      y: videoAreaY,
      width: outputWidth,
      height: videoAreaHeight
    },
    header_area: {
      y: headerY, // 상단 여백 적용
      height: headerHeight
    },
    subtitle_area: {
      y: 1350, // 자막 위치 (1400 → 1350)
      height: 150,
      single_line: false, // 자막 두 줄 표기
      max_lines: 2 // 최대 2줄로 제한
    },
    footer_area: {
      y: footerY, // 영상 아래 100px
      height: footerHeight
    },
    font_scale: fontScale
  };

  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    header_text: scriptData.title.korean,
    header_text_english: scriptData.title.english,
    footer_text: "땅콩이의 귀여운 하루 🐶",
    footer_text_english: "Pomeranian TtangKong Cute Day 🐶",
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    bgm_url: scriptData.bgm_url,
    bgm_volume: 0.25,
    width: outputWidth,
    height: outputHeight,
    use_origin_size: true,  // origin_layout 적용을 위해 항상 true
    origin_layout: layoutConfig,        // 레이아웃 설정 (영상 크기 확대)
    output_bucket: GCS_BUCKET,
    output_path: `${testFolder}/final_ski_peanut.mp4`,
    folder_name: testFolder,
    // 폰트 스타일 설정 (origin 모드일 때 스케일 적용)
    font_settings: {
      header_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(36 * fontScale),  // 52 -> 36 (더 작게)
        color: "white",
        border_width: Math.round(2 * fontScale),
        border_color: "black"
      },
      header_english: {
        font: "NotoSerif-Regular",
        size: Math.round(16 * fontScale),  // 28 -> 16 (한 줄에 표시)
        color: "white",
        border_width: Math.round(1 * fontScale),
        border_color: "black"
      },
      subtitle_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(50 * fontScale),  // 55 → 50: 폰트 크기 5 줄임
        color: "white",
        border_width: Math.round(4 * fontScale),
        border_color: "black"
      },
      subtitle_english: {
        font: "NotoSerif-Regular",
        size: Math.round(30 * fontScale),  // 35 → 30: 폰트 크기 5 줄임
        color: "white",
        border_width: Math.round(3 * fontScale),
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
