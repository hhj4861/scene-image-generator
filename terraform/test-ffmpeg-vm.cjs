const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 스크립트 데이터 (씬004, 씬006 기반)
const scriptData = {
  title: { korean: "비트박스 천재견 땅콩의 반전", english: "Beatbox Genius Dog Peanut's Twist" },
  scenes: [
    {
      index: 4,
      segment_number: 4,
      duration: 6,
      scene_type: "performance_start",
      narration: "",
      narration_english: "",
      is_performance: true,
      performance_phase: "start",
      localFile: "씬004.mp4"
    },
    {
      index: 6,
      segment_number: 6,
      duration: 6,
      scene_type: "performance_resume",
      narration: "",
      narration_english: "",
      is_performance: true,
      performance_phase: "resume",
      localFile: "씬006.mp4"
    }
  ]
};

async function uploadToGCS(localPath, gcsPath) {
  const storage = new Storage();
  const bucket = storage.bucket(GCS_BUCKET);

  console.log(`Uploading ${localPath} to gs://${GCS_BUCKET}/${gcsPath}...`);
  await bucket.upload(localPath, { destination: gcsPath });

  const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
  console.log(`Uploaded: ${publicUrl}`);
  return publicUrl;
}

async function testFFmpegVM() {
  const testFolder = `test_ffmpeg_vm_${Date.now()}`;
  const videoDir = path.join(__dirname, "../pipedream_puppy/beatbox_sample/vedio");

  console.log("===========================================");
  console.log("FFmpeg VM API Test");
  console.log("===========================================\n");

  // 1. 영상 파일 GCS 업로드
  console.log("Step 1: Uploading videos to GCS...\n");
  const videos = [];

  for (const scene of scriptData.scenes) {
    const localPath = path.join(videoDir, scene.localFile);

    if (!fs.existsSync(localPath)) {
      console.error(`File not found: ${localPath}`);
      continue;
    }

    const gcsPath = `${testFolder}/${scene.localFile.replace(".mp4", "")}.mp4`;
    const url = await uploadToGCS(localPath, gcsPath);

    videos.push({
      url,
      index: scene.index,
      duration: scene.duration,
      narration: scene.narration,
      narration_english: scene.narration_english,
      is_performance: scene.is_performance,
      scene_type: scene.scene_type
    });
  }

  console.log(`\nUploaded ${videos.length} videos\n`);

  // 2. FFmpeg VM API 호출
  console.log("Step 2: Calling FFmpeg VM API...\n");

  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    header_text: scriptData.title.korean,
    footer_text: "땅콩이네",
    subtitle_enabled: true,
    subtitle_english_enabled: false,
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: `${testFolder}/final_shorts.mp4`,
    folder_name: testFolder
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
testFFmpegVM()
  .then(result => {
    console.log("\n\nTest completed successfully!");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n\nTest failed!");
    process.exit(1);
  });
