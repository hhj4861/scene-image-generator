/**
 * Ken Burns 효과 테스트
 * 정적 이미지 → 줌인/줌아웃 영상 변환
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEST_DIR = "/tmp/ken_burns_test";

// Ken Burns 효과 타입
const EFFECTS = {
  // 중앙에서 줌인
  zoom_in_center: {
    name: "Zoom In (Center)",
    filter: "zoompan=z='min(zoom+0.002,1.3)':d=FRAMES:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
  },
  // 중앙에서 줌아웃
  zoom_out_center: {
    name: "Zoom Out (Center)",
    filter: "zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.002))':d=FRAMES:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
  },
  // 위에서 아래로 패닝 + 줌인
  pan_down_zoom: {
    name: "Pan Down + Zoom",
    filter: "zoompan=z='min(zoom+0.001,1.15)':d=FRAMES:x='iw/2-(iw/zoom/2)':y='min(ih/zoom/2,y+3)':s=1080x1920:fps=30"
  },
  // 왼쪽에서 오른쪽으로 패닝
  pan_left_right: {
    name: "Pan Left to Right",
    filter: "zoompan=z='1.1':d=FRAMES:x='min(iw/zoom/2,x+4)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30"
  },
  // 얼굴 중심 줌인 (상단 1/3 지점)
  zoom_face: {
    name: "Zoom to Face (Top 1/3)",
    filter: "zoompan=z='min(zoom+0.002,1.4)':d=FRAMES:x='iw/2-(iw/zoom/2)':y='ih/3-(ih/zoom/2)':s=1080x1920:fps=30"
  }
};

async function testKenBurns() {
  // 테스트 디렉토리 생성
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // 테스트용 이미지 다운로드 (GCS에서 기존 이미지 사용)
  const testImageUrl = "https://storage.googleapis.com/scene-image-generator-storage-mcp-test-457809/origin/%E1%84%8B%E1%85%A5%E1%86%AF%E1%84%85%E1%85%AE%E1%86%A8%E1%84%86%E1%85%A1%E1%86%AF%E1%84%84%E1%85%A1%E1%86%BC%E1%84%8F%E1%85%A9%E1%86%BC%E1%84%8B%E1%85%B5.jpeg";
  const imagePath = path.join(TEST_DIR, "test_image.jpg");

  console.log("===========================================");
  console.log("Ken Burns Effect Test");
  console.log("===========================================\n");

  // 이미지 다운로드
  console.log("Downloading test image...");
  execSync(`curl -s -o "${imagePath}" "${testImageUrl}"`);
  console.log(`Image saved: ${imagePath}\n`);

  const duration = 5; // 5초
  const fps = 30;
  const frames = duration * fps;

  console.log(`Duration: ${duration}s, FPS: ${fps}, Frames: ${frames}\n`);

  // 각 효과 테스트
  for (const [key, effect] of Object.entries(EFFECTS)) {
    console.log(`Testing: ${effect.name}...`);

    const outputPath = path.join(TEST_DIR, `${key}.mp4`);
    const filter = effect.filter.replace(/FRAMES/g, frames);

    const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -vf "scale=4000:-1,${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p "${outputPath}" 2>&1`;

    try {
      execSync(cmd, { maxBuffer: 1024 * 1024 * 50 });
      const stats = fs.statSync(outputPath);
      console.log(`  ✓ Created: ${outputPath} (${(stats.size / 1024).toFixed(0)}KB)\n`);
    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}\n`);
    }
  }

  console.log("===========================================");
  console.log("Results saved in: " + TEST_DIR);
  console.log("===========================================");

  // 파일 목록 출력
  const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.mp4'));
  console.log("\nGenerated files:");
  files.forEach(f => console.log(`  - ${f}`));
}

testKenBurns().catch(console.error);
