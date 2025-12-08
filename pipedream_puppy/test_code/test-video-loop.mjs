/**
 * 음성 길이에 맞춰 영상 반복 테스트
 * - 각 씬의 음성 길이 측정
 * - 음성이 영상보다 길면 영상을 반복(loop)
 * - 음성 길이에 맞춰 영상 자르기
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    console.error(`Duration error for ${filePath}:`, err.message);
    return 0;
  }
}

// ==========================================
// 영상 반복 + 음성 합성 함수
// ==========================================
async function loopVideoToMatchAudio(videoPath, audioPath, outputPath) {
  const videoDuration = await getDuration(videoPath);
  const audioDuration = await getDuration(audioPath);

  console.log(`  📹 Video: ${videoDuration.toFixed(2)}s, 🔊 Audio: ${audioDuration.toFixed(2)}s`);

  if (audioDuration <= videoDuration) {
    // 음성이 영상보다 짧거나 같으면 그냥 합성
    console.log(`  → 영상이 충분히 김, 단순 합성`);
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v -map 1:a -shortest "${outputPath}"`
    );
  } else {
    // 음성이 영상보다 길면 영상을 반복
    const loopCount = Math.ceil(audioDuration / videoDuration);
    console.log(`  → 음성이 더 김! 영상 ${loopCount}회 반복 (${videoDuration.toFixed(2)}s x ${loopCount} = ${(videoDuration * loopCount).toFixed(2)}s)`);

    // 방법 1: -stream_loop 사용 (영상 반복 후 음성 길이에 맞춤)
    await execAsync(
      `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -t ${audioDuration} -map 0:v -map 1:a "${outputPath}"`
    );
  }

  const outputDuration = await getDuration(outputPath);
  console.log(`  ✅ Output: ${outputDuration.toFixed(2)}s`);

  return { videoDuration, audioDuration, outputDuration };
}

// ==========================================
// 메인 함수
// ==========================================
async function main() {
  console.log("🎬 음성 길이에 맞춰 영상 반복 테스트\n");

  const baseDir = path.join(__dirname, "../stock_sample2");
  const videoDir = path.join(baseDir, "vedio");
  const audioDir = path.join(baseDir, "음성");
  const outputDir = path.join(baseDir, "temp_looped");

  // 출력 디렉토리 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 파일 목록
  const videoFiles = fs.readdirSync(videoDir)
    .filter(f => f.startsWith("video-") && f.endsWith(".mp4"))
    .sort();
  const audioFiles = fs.readdirSync(audioDir)
    .filter(f => f.startsWith("audio-") && f.endsWith(".mp3"))
    .sort();

  console.log(`📁 Videos: ${videoFiles.length}, Audios: ${audioFiles.length}\n`);

  const results = [];

  for (let i = 0; i < Math.min(videoFiles.length, audioFiles.length); i++) {
    const videoFile = videoFiles[i];
    const audioFile = audioFiles[i];
    const videoPath = path.join(videoDir, videoFile);
    const audioPath = path.join(audioDir, audioFile);
    const outputPath = path.join(outputDir, `looped_${i + 1}.mp4`);

    console.log(`[${i + 1}/${videoFiles.length}] ${videoFile} + ${audioFile}`);

    const result = await loopVideoToMatchAudio(videoPath, audioPath, outputPath);
    results.push({
      index: i + 1,
      video: videoFile,
      audio: audioFile,
      output: `looped_${i + 1}.mp4`,
      ...result
    });

    console.log("");
  }

  // 결과 요약
  console.log("=" .repeat(50));
  console.log("📊 결과 요약:\n");

  let totalVideoDuration = 0;
  let totalAudioDuration = 0;
  let totalOutputDuration = 0;

  results.forEach(r => {
    const status = r.audioDuration > r.videoDuration ? "🔄 반복됨" : "✅ 그대로";
    console.log(`  ${r.index}. ${status} | Video: ${r.videoDuration.toFixed(2)}s → Audio: ${r.audioDuration.toFixed(2)}s → Output: ${r.outputDuration.toFixed(2)}s`);
    totalVideoDuration += r.videoDuration;
    totalAudioDuration += r.audioDuration;
    totalOutputDuration += r.outputDuration;
  });

  console.log("\n  ─────────────────────────────────────────");
  console.log(`  총 원본 영상: ${totalVideoDuration.toFixed(2)}s`);
  console.log(`  총 음성: ${totalAudioDuration.toFixed(2)}s`);
  console.log(`  총 출력 영상: ${totalOutputDuration.toFixed(2)}s`);
  console.log(`\n  📂 출력 폴더: ${outputDir}`);

  return results;
}

// 실행
main().then(results => {
  console.log("\n🎉 완료!");
}).catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
