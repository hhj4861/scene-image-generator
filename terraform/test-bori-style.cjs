const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 테스트 데이터 (보리 스타일 - 질문/답변 구조)
const testData = {
  channel_name: "땅콩이네",
  scenes: [
    {
      index: 1,
      question: "가방싸서 어디가세요?",
      question_english: "Where are you going with your packed bag?",
      answer: "할머니가 고구마랑 사과 준다고",
      answer_english: "Grandma gives me sweet potatoes and apples",
      localFile: "씬004.mp4"
    },
    {
      index: 2,
      question: "비상금 모아두세요?",
      question_english: "Do you keep emergency money saved up?",
      answer: "매일매일이 비상이에요",
      answer_english: "Every day is an emergency",
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

async function testBoriStyle() {
  const testFolder = `test_bori_style_${Date.now()}`;
  const videoDir = path.join(__dirname, "../pipedream_puppy/beatbox_sample/vedio");

  console.log("===========================================");
  console.log("Bori Style FFmpeg API Test");
  console.log("===========================================\n");
  console.log("Layout:");
  console.log("  ┌─────────────────┐");
  console.log("  │  상단: 질문      │");
  console.log("  │  (영어 번역)     │");
  console.log("  │  영상 (60%)     │");
  console.log("  │  하단: 답변      │");
  console.log("  │  (영어 번역)     │");
  console.log("  │  채널명         │");
  console.log("  └─────────────────┘\n");

  // 1. 영상 파일 GCS 업로드
  console.log("Step 1: Uploading videos to GCS...\n");
  const videos = [];

  for (const scene of testData.scenes) {
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
      question: scene.question,
      question_english: scene.question_english,
      answer: scene.answer,
      answer_english: scene.answer_english,
    });
  }

  console.log(`\nUploaded ${videos.length} videos\n`);

  // 2. FFmpeg VM API 호출 (Bori 스타일)
  console.log("Step 2: Calling FFmpeg VM API (/render/puppy)...\n");

  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    channel_name: testData.channel_name,
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: `${testFolder}/final_bori_style.mp4`,
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
        timeout: 600000
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n===========================================");
    console.log("SUCCESS!");
    console.log("===========================================");
    console.log(`Time elapsed: ${elapsed}s`);
    console.log(`Job ID: ${response.data.job_id}`);
    console.log(`Total duration: ${response.data.total_duration?.toFixed(1)}s`);
    console.log(`Render style: ${response.data.render_style}`);
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
testBoriStyle()
  .then(result => {
    console.log("\n\nTest completed successfully!");
    console.log("\nOpen this URL to view the result:");
    console.log(result.url);
    process.exit(0);
  })
  .catch(err => {
    console.error("\n\nTest failed!");
    process.exit(1);
  });
