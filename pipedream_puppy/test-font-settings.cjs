const axios = require("axios");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";

async function testFontSettings() {
  console.log("Testing font_settings with extreme values...\n");
  
  const payload = {
    videos: [{
      url: "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/santa_rally_1765468137448/scene1.mp4",
      index: 1,
      narration: "이것은 아주 긴 자막 텍스트입니다 줄바꿈이 어떻게 되는지 테스트합니다",
      narration_english: "This is a very long subtitle text to test line breaks",
      is_performance: false,
      scene_type: "interview"
    }],
    header_text: "이것은 아주 긴 헤더 텍스트입니다 줄바꿈 테스트",
    header_text_english: "This is a very long header text for line break test",
    footer_text: "푸터 테스트",
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 720,
    height: 1280,
    output_bucket: "shorts-videos-storage-mcp-test-457809",
    output_path: "test_font/test_max_lines.mp4",
    folder_name: "test_font",
    font_settings: {
      header_korean: { size: 50, max_chars_per_line: 8 },  // 한 줄에 8글자만
      header_english: { size: 25 },
      subtitle_korean: { size: 30, max_lines: 2 },         // 최대 2줄
      subtitle_english: { size: 15 },
      footer_korean: { size: 30 },
      footer_english: { size: 15 }
    }
  };

  console.log("Sending font_settings:", JSON.stringify(payload.font_settings, null, 2));
  
  try {
    const response = await axios.post(
      `${FFMPEG_VM_URL}/render/puppy`,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 300000 }
    );
    
    console.log("\nSUCCESS!");
    console.log("Output URL:", response.data.url);
    console.log("\n줄 수 제한 테스트:");
    console.log("- 헤더: max_chars_per_line=8 (8글자마다 줄바꿈)");
    console.log("- 자막: max_lines=2 (최대 2줄)");
    console.log("영상을 확인해주세요.");
  } catch (error) {
    console.error("Error:", error.message);
    if (error.response?.data) console.error("Response:", error.response.data);
  }
}

testFontSettings();
