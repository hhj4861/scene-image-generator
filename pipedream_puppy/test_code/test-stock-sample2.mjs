import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = new Storage();
const bucket = storage.bucket("shorts-videos-storage-mcp-test-457809");
const folderName = "stock_sample2_" + Date.now();
const baseDir = path.join(__dirname, "../stock_sample2");
const tempDir = path.join(baseDir, "temp_render");

// ==========================================
// 미디어 길이 측정 함수
// ==========================================
async function getDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim());
  } catch (err) {
    return 0;
  }
}

// ==========================================
// 영상 반복 + 음성 합성 함수 (음성 길이에 맞춤)
// ==========================================
async function loopVideoToMatchAudio(videoPath, audioPath, outputPath) {
  const videoDuration = await getDuration(videoPath);
  const audioDuration = await getDuration(audioPath);

  if (audioDuration <= videoDuration) {
    // 음성이 영상보다 짧거나 같으면 그냥 합성
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v -map 1:a -shortest "${outputPath}"`
    );
    return { videoDuration, audioDuration, looped: false };
  } else {
    // 음성이 영상보다 길면 영상을 반복
    await execAsync(
      `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -t ${audioDuration} -map 0:v -map 1:a "${outputPath}"`
    );
    return { videoDuration, audioDuration, looped: true };
  }
}

async function main() {
  // 임시 디렉토리 생성
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // script.json 로드
  const script = JSON.parse(fs.readFileSync(path.join(baseDir, "자막/script.json"), "utf8"));
  console.log("📝 Title:", script.video_info.title);

  // 비디오/음성 파일 목록
  const videoDir = path.join(baseDir, "vedio");
  const audioDir = path.join(baseDir, "음성");
  const videoFiles = fs.readdirSync(videoDir).filter(f => f.startsWith("video-") && f.endsWith(".mp4")).sort();
  const audioFiles = fs.readdirSync(audioDir).filter(f => f.startsWith("audio-") && f.endsWith(".mp3")).sort();

  console.log("\n🎬 [1/4] 비디오+음성 합성 (음성 길이에 맞춰 영상 반복)...");
  const processedVideos = [];

  for (let i = 0; i < videoFiles.length; i++) {
    const videoFile = videoFiles[i];
    const audioFile = audioFiles[i];
    const videoPath = path.join(videoDir, videoFile);
    const audioPath = path.join(audioDir, audioFile);
    const outputPath = path.join(tempDir, `processed_${i+1}.mp4`);

    const result = await loopVideoToMatchAudio(videoPath, audioPath, outputPath);
    processedVideos.push({ index: i+1, path: outputPath, scene: script.scenes[i] });

    const status = result.looped ? `🔄 반복 (${result.videoDuration.toFixed(1)}s → ${result.audioDuration.toFixed(1)}s)` : "✅";
    console.log(`  ${status} ${videoFile} + ${audioFile}`);
  }

  console.log("\n☁️ [2/4] GCS 업로드...");
  const videoUrls = [];
  for (const v of processedVideos) {
    const gcsPath = `${folderName}/videos/processed_${v.index}.mp4`;
    await bucket.upload(v.path, { destination: gcsPath, metadata: { contentType: "video/mp4" } });
    videoUrls.push({ index: v.index, url: `https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/${gcsPath}`, scene: v.scene });
    console.log(`  ✅ processed_${v.index}.mp4`);
  }

  // BGM 업로드
  const bgmDir = path.join(baseDir, "bgm");
  const bgmFiles = fs.readdirSync(bgmDir).filter(f => f.endsWith(".mp3"));
  let bgmUrl = null;
  if (bgmFiles.length > 0) {
    const bgmPath = path.join(bgmDir, bgmFiles[0]);
    const bgmGcsPath = `${folderName}/bgm/${bgmFiles[0]}`;
    await bucket.upload(bgmPath, { destination: bgmGcsPath, metadata: { contentType: "audio/mpeg" } });
    bgmUrl = `https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/${bgmGcsPath}`;
    console.log(`  ✅ BGM: ${bgmFiles[0]}`);
  }

  console.log("\n📋 [3/4] timed_subtitles 생성...");
  const timedSubtitles = [];
  for (const scene of script.scenes) {
    if (scene.subtitles) {
      for (const sub of scene.subtitles) {
        timedSubtitles.push({
          start_time: sub.start_time,
          end_time: sub.end_time,
          text_ko: sub.text_ko,
          text_en: sub.text_en,
          color: sub.color || "white"
        });
      }
    }
  }
  console.log(`  자막 수: ${timedSubtitles.length}`);

  console.log("\n🎥 [4/4] VM 렌더링 요청...");
  const payload = {
    videos: videoUrls.map(v => ({ index: v.index, url: v.url })),
    bgm_url: bgmUrl,
    bgm_volume: 0.15,
    header_text: script.video_info.title,
    header_text_english: script.video_info.title_en,
    footer_text: "바이오 투자 정보",
    footer_text_english: "Biotech Investment",
    timed_subtitles: timedSubtitles,
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 1080,
    height: 1920,
    output_bucket: "shorts-videos-storage-mcp-test-457809",
    output_path: `${folderName}/final_shorts.mp4`,
    folder_name: folderName
  };

  const result = await fetch("http://34.64.168.173:3000/render/puppy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(r => r.json());

  // 임시 파일 정리
  for (const v of processedVideos) {
    if (fs.existsSync(v.path)) fs.unlinkSync(v.path);
  }

  console.log("\n✅ 결과:", JSON.stringify(result, null, 2));
}

main().catch(err => console.error("Error:", err.message));
