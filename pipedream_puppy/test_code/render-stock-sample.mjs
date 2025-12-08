/**
 * Stock Sample → YouTube Shorts 렌더링
 * - 로컬에서 비디오 원본 오디오 제거
 * - VM 서버에서 YouTube 레이아웃 적용
 * - 자막 추가 (한글/영어)
 * - 음성 합성
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 설정
// ==========================================
const FFMPEG_API = "http://34.64.168.173:3000";
const GCS_BUCKET = "scene-image-generator-storage-mcp-test-457809";
const AUDIO_BUCKET = "shorts-audio-storage-mcp-test-457809";
const VIDEO_BUCKET = "shorts-videos-storage-mcp-test-457809";

const STOCK_SAMPLE_DIR = path.join(__dirname, "../stock_sample");
const TEMP_DIR = path.join(__dirname, "../stock_sample/temp");

// ==========================================
// 로컬 FFmpeg: 원본 오디오 → 무음 오디오로 교체
// (VM 서버가 오디오 스트림을 필요로 하므로 무음 트랙 추가)
// ==========================================
async function replaceAudioWithSilence(inputPath, outputPath) {
  // 원본 오디오 제거하고 무음 오디오 트랙 추가
  await execAsync(`ffmpeg -y -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -c:v copy -c:a aac -map 0:v -map 1:a -shortest "${outputPath}"`);
  return outputPath;
}

// ==========================================
// GCS 업로드 함수
// ==========================================
async function uploadToGCS(localPath, bucketName, gcsPath) {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  await bucket.upload(localPath, {
    destination: gcsPath,
    metadata: { contentType: getContentType(localPath) }
  });

  return `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.json': 'application/json'
  };
  return types[ext] || 'application/octet-stream';
}

// ==========================================
// 메인 함수
// ==========================================
async function main() {
  console.log("🎬 Stock Sample → YouTube Shorts 렌더링 시작\n");

  // temp 디렉토리 생성
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // 1. 자막 데이터 로드
  console.log("📝 [1/6] 자막 데이터 로드...");
  const scriptPath = path.join(STOCK_SAMPLE_DIR, "자막/script.json");
  const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  console.log(`   - ${scriptData.length}개 씬 자막 로드 완료`);

  // 2. 비디오 파일 확인
  console.log("\n📹 [2/6] 비디오 파일 확인...");
  const videoDir = path.join(STOCK_SAMPLE_DIR, "vedio");
  const videoFiles = fs.readdirSync(videoDir)
    .filter(f => f.endsWith('.mp4'))
    .sort();
  console.log(`   - ${videoFiles.length}개 비디오: ${videoFiles.join(', ')}`);

  // 3. 음성 파일 확인
  console.log("\n🎤 [3/6] 음성 파일 확인...");
  const audioDir = path.join(STOCK_SAMPLE_DIR, "음성");
  const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.wav') || f.endsWith('.mp3'));
  console.log(`   - ${audioFiles.length}개 음성: ${audioFiles.join(', ')}`);

  // 4. ★★★ 로컬에서 비디오 오디오 → 무음으로 교체 ★★★
  console.log("\n🔇 [4/6] 비디오 원본 오디오 → 무음으로 교체 (로컬 FFmpeg)...");
  const silentVideoPaths = [];
  for (const [idx, videoFile] of videoFiles.entries()) {
    const inputPath = path.join(videoDir, videoFile);
    const outputPath = path.join(TEMP_DIR, `silent_${videoFile}`);
    await replaceAudioWithSilence(inputPath, outputPath);
    silentVideoPaths.push({ index: idx + 1, path: outputPath, file: videoFile });
    console.log(`   ✅ ${videoFile} → 무음 오디오로 교체됨`);
  }

  // 5. GCS 업로드 (무음 비디오 + 음성)
  console.log("\n☁️ [5/6] GCS 업로드 (무음 비디오)...");
  const timestamp = Date.now();
  const folderName = `stock_sample_${timestamp}`;

  // 무음 비디오 업로드
  const videoUrls = [];
  for (const video of silentVideoPaths) {
    const gcsPath = `${folderName}/videos/silent_${video.file}`;
    const url = await uploadToGCS(video.path, GCS_BUCKET, gcsPath);
    videoUrls.push({ index: video.index, url, file: video.file });
    console.log(`   ✅ 비디오 ${video.index}: silent_${video.file}`);
  }

  // 음성 업로드
  let audioUrl = null;
  if (audioFiles.length > 0) {
    const audioFile = audioFiles[0];
    const localPath = path.join(audioDir, audioFile);
    const gcsPath = `${folderName}/audio/${audioFile}`;
    audioUrl = await uploadToGCS(localPath, AUDIO_BUCKET, gcsPath);
    console.log(`   ✅ 음성: ${audioFile}`);
  }

  // 6. FFmpeg VM에 렌더링 요청 (YouTube 레이아웃 적용)
  console.log("\n🎥 [6/6] FFmpeg VM 렌더링 요청 (YouTube 레이아웃)...");

  // 비디오 데이터 구성 (자막 포함)
  const videos = videoUrls.map((v, idx) => {
    const script = scriptData[idx] || {};
    return {
      index: v.index,
      url: v.url,
      duration: 8, // 각 비디오 8초
      narration: script.prompt?.한글자막 || script.original || "",
      narration_korean: script.prompt?.한글자막 || script.original || "",
      narration_english: script.prompt?.영어자막 || "",
      scene_type: "narration",
      speaker: "main"
    };
  });

  const renderPayload = {
    videos: videos,
    bgm_url: audioUrl, // 음성을 BGM으로 사용 (비디오는 무음이므로 음성만 들림)
    bgm_volume: 1.0,   // 음성이므로 볼륨 100%
    header_text: "SpaceX 기업가치 8000억 달러 돌파",
    header_text_english: "SpaceX Valuation Surpasses $800B",
    footer_text: "투자 뉴스",
    footer_text_english: "Investment News",
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 1080,
    height: 1920,
    output_bucket: VIDEO_BUCKET,
    output_path: `${folderName}/final_shorts.mp4`,
    folder_name: folderName
  };

  console.log("\n📤 렌더링 요청 데이터:");
  console.log(JSON.stringify({
    ...renderPayload,
    videos: renderPayload.videos.map(v => ({
      index: v.index,
      narration: v.narration?.substring(0, 30) + "...",
      narration_english: v.narration_english?.substring(0, 30) + "..."
    }))
  }, null, 2));

  try {
    const response = await fetch(`${FFMPEG_API}/render/puppy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(renderPayload)
    });

    const result = await response.json();

    if (result.success) {
      console.log("\n✅ 렌더링 완료!");
      console.log(`   📺 영상 URL: ${result.url}`);
      console.log(`   ⏱️ 총 길이: ${result.total_duration}초`);
      console.log(`   📊 성능:`, result.performance);
    } else {
      console.error("\n❌ 렌더링 실패:", result.error);
    }

    // temp 파일 정리
    console.log("\n🧹 임시 파일 정리...");
    for (const video of silentVideoPaths) {
      if (fs.existsSync(video.path)) {
        fs.unlinkSync(video.path);
      }
    }

    return result;

  } catch (error) {
    console.error("\n❌ API 요청 실패:", error.message);
    throw error;
  }
}

// 실행
main().then(result => {
  console.log("\n🎉 완료!");
  process.exit(0);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
