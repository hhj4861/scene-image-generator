const { Storage } = require("@google-cloud/storage");
const axios = require("axios");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 테스트 데이터 (이미지 URL + 질문/답변)
const testScenes = [
  {
    index: 1,
    image_url: "https://storage.googleapis.com/scene-image-generator-storage-mcp-test-457809/origin/%E1%84%8B%E1%85%A5%E1%86%AF%E1%84%85%E1%85%AE%E1%86%A8%E1%84%86%E1%85%A1%E1%86%AF%E1%84%84%E1%85%A1%E1%86%BC%E1%84%8F%E1%85%A9%E1%86%BC%E1%84%8B%E1%85%B5.jpeg",
    duration: 6,
    effect: "zoom_in_center",
    question: "가방싸서 어디가세요?",
    question_english: "Where are you going with your packed bag?",
    answer: "할머니가 고구마랑 사과 준다고",
    answer_english: "Grandma gives me sweet potatoes and apples"
  },
  {
    index: 2,
    image_url: "https://storage.googleapis.com/scene-image-generator-storage-mcp-test-457809/origin/%E1%84%8B%E1%85%A5%E1%86%AF%E1%84%85%E1%85%AE%E1%86%A8%E1%84%86%E1%85%A1%E1%86%AF%E1%84%84%E1%85%A1%E1%86%BC%E1%84%8F%E1%85%A9%E1%86%BC%E1%84%8B%E1%85%B5.jpeg",
    duration: 6,
    effect: "zoom_out_center",
    question: "비상금 모아두세요?",
    question_english: "Do you keep emergency money saved up?",
    answer: "매일매일이 비상이에요",
    answer_english: "Every day is an emergency"
  },
  {
    index: 3,
    image_url: "https://storage.googleapis.com/scene-image-generator-storage-mcp-test-457809/origin/%E1%84%8B%E1%85%A5%E1%86%AF%E1%84%85%E1%85%AE%E1%86%A8%E1%84%86%E1%85%A1%E1%86%AF%E1%84%84%E1%85%A1%E1%86%BC%E1%84%8F%E1%85%A9%E1%86%BC%E1%84%8B%E1%85%B5.jpeg",
    duration: 6,
    effect: "zoom_face",
    question: "뚝섬말고 투썸",
    question_english: "Not Ttukseom, but Twosome",
    answer: "뚝섬이 아니라 투썸이래요",
    answer_english: "It's not Ttukseom, it's Twosome"
  }
];

async function testKenBurns() {
  const testFolder = `test_ken_burns_${Date.now()}`;
  const outputPath = `${testFolder}/final_ken_burns.mp4`;

  console.log("===========================================");
  console.log("Ken Burns FFmpeg API Test");
  console.log("===========================================\n");
  console.log("이미지 → Ken Burns 효과 → 자막 합성\n");

  const requestPayload = {
    scenes: testScenes,
    channel_name: "땅콩이네",
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: outputPath,
    folder_name: testFolder
  };

  console.log("Request payload:");
  console.log(JSON.stringify(requestPayload, null, 2));
  console.log("\n");

  try {
    console.log("Sending request to FFmpeg VM (/render/ken-burns)...");
    const startTime = Date.now();

    const response = await axios.post(
      `${FFMPEG_VM_URL}/render/ken-burns`,
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
    console.log(`\nOutput URL: ${response.data.url}`);
    console.log("\nEffects used:", response.data.stats?.effects_used);

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

testKenBurns()
  .then(result => {
    console.log("\n\nTest completed!");
    console.log("View result: " + result.url);
    process.exit(0);
  })
  .catch(err => {
    console.error("\nTest failed!");
    process.exit(1);
  });
