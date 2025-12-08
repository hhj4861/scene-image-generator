/**
 * Stock Sample → YouTube Shorts 로컬 렌더링
 * - 비디오 원본 오디오 제거
 * - 음성 파일만 사용
 * - 자막 추가 (한글/영어)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STOCK_SAMPLE_DIR = path.join(__dirname, "../stock_sample");
const OUTPUT_DIR = path.join(__dirname, "../stock_sample/output");

// 폰트 경로 (macOS)
const FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc";

async function main() {
  console.log("🎬 Stock Sample → YouTube Shorts 로컬 렌더링\n");

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 자막 데이터 로드
  console.log("📝 [1/4] 자막 데이터 로드...");
  const scriptPath = path.join(STOCK_SAMPLE_DIR, "자막/script.json");
  const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  console.log(`   - ${scriptData.length}개 씬 자막 로드 완료`);

  // 2. 파일 경로 설정
  const videoDir = path.join(STOCK_SAMPLE_DIR, "vedio");
  const audioDir = path.join(STOCK_SAMPLE_DIR, "음성");

  const videoFiles = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4')).sort();
  const audioFile = fs.readdirSync(audioDir).find(f => f.endsWith('.wav') || f.endsWith('.mp3'));

  console.log(`   - 비디오: ${videoFiles.length}개`);
  console.log(`   - 음성: ${audioFile}`);

  // 3. 비디오 합치기 (무음으로)
  console.log("\n🎥 [2/4] 비디오 합치기 (원본 오디오 제거)...");

  // concat 리스트 파일 생성
  const concatListPath = path.join(OUTPUT_DIR, "concat_list.txt");
  const concatList = videoFiles.map(f => `file '${path.join(videoDir, f)}'`).join('\n');
  fs.writeFileSync(concatListPath, concatList);

  const mergedVideoPath = path.join(OUTPUT_DIR, "merged_silent.mp4");

  // 비디오만 합치기 (오디오 제거: -an)
  await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -an -c:v copy "${mergedVideoPath}"`);
  console.log("   ✅ 비디오 합치기 완료 (오디오 제거됨)");

  // 4. 9:16 비율로 변환 + 자막 추가
  console.log("\n📐 [3/4] 9:16 변환 + 자막 추가...");

  const audioPath = path.join(audioDir, audioFile);
  const outputPath = path.join(OUTPUT_DIR, "final_shorts_voice.mp4");

  // 자막 필터 생성
  const subtitleFilters = [];
  let currentTime = 0;
  const SCENE_DURATION = 8; // 각 씬 8초

  for (const [idx, script] of scriptData.entries()) {
    const startTime = currentTime + 0.3;
    const endTime = currentTime + SCENE_DURATION - 0.3;

    const korText = escapeFFmpegText(script.prompt?.한글자막 || script.original || "");
    const engText = escapeFFmpegText(script.prompt?.영어자막 || "");

    // 한글 자막 (중앙 하단)
    if (korText) {
      subtitleFilters.push(
        `drawtext=text='${korText}':fontfile='${FONT_PATH}':fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.70:enable='between(t,${startTime},${endTime})'`
      );
    }

    // 영어 자막 (한글 아래)
    if (engText) {
      subtitleFilters.push(
        `drawtext=text='${engText}':fontfile='${FONT_PATH}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.76:enable='between(t,${startTime},${endTime})'`
      );
    }

    currentTime += SCENE_DURATION;
  }

  // 헤더/푸터
  const headerKor = escapeFFmpegText("SpaceX 기업가치 8000억 달러 돌파");
  const headerEng = escapeFFmpegText("SpaceX Valuation Surpasses $800B");
  const footer = escapeFFmpegText("투자 뉴스");

  subtitleFilters.push(
    `drawtext=text='${headerKor}':fontfile='${FONT_PATH}':fontsize=52:fontcolor=0xF5DEB3:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.08`,
    `drawtext=text='${headerEng}':fontfile='${FONT_PATH}':fontsize=32:fontcolor=0xAAAAAA:borderw=3:bordercolor=0x222222:x=(w-text_w)/2:y=h*0.14`,
    `drawtext=text='${footer}':fontfile='${FONT_PATH}':fontsize=56:fontcolor=0x8B7355:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.85`
  );

  // FFmpeg 명령 실행
  // 16:9 → 9:16 변환: scale하고 fit (검은 여백, crop 없음)
  const filterComplex = `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,${subtitleFilters.join(',')}[outv]`;

  const ffmpegCmd = `ffmpeg -y -i "${mergedVideoPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest "${outputPath}"`;

  console.log("   실행 중...");
  try {
    await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 100 });
    console.log("   ✅ 렌더링 완료!");
  } catch (error) {
    console.error("   ❌ FFmpeg 오류:", error.message);
    // 자막 없이 다시 시도
    console.log("   🔄 자막 없이 재시도...");
    const simpleCmd = `ffmpeg -y -i "${mergedVideoPath}" -i "${audioPath}" -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[outv]" -map "[outv]" -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest "${outputPath}"`;
    await execAsync(simpleCmd, { maxBuffer: 1024 * 1024 * 100 });
    console.log("   ✅ 렌더링 완료 (자막 제외)");
  }

  // 5. 결과 확인
  console.log("\n📊 [4/4] 결과 확인...");
  const stats = fs.statSync(outputPath);
  const { stdout: durationOut } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);

  console.log(`   📺 출력 파일: ${outputPath}`);
  console.log(`   📦 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ⏱️ 영상 길이: ${parseFloat(durationOut).toFixed(2)}초`);

  // GCS 업로드
  console.log("\n☁️ GCS 업로드...");
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket("shorts-videos-storage-mcp-test-457809");
  const gcsPath = `stock_sample_voice_${Date.now()}/final_shorts_voice.mp4`;

  await bucket.upload(outputPath, {
    destination: gcsPath,
    metadata: { contentType: "video/mp4" }
  });

  const publicUrl = `https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/${gcsPath}`;
  console.log(`   ✅ 업로드 완료: ${publicUrl}`);

  return { outputPath, publicUrl };
}

function escapeFFmpegText(text) {
  if (!text) return "";
  return text
    .replace(/'/g, "\u2019")  // 작은따옴표 → 유니코드
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

main().then(result => {
  console.log("\n🎉 완료!");
  console.log(`📺 영상 URL: ${result.publicUrl}`);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
