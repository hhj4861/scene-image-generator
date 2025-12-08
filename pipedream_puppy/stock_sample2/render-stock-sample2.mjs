/**
 * Stock Sample2 → YouTube Shorts 렌더링
 * - 비디오 원본 오디오 제거
 * - 씬별 음성 파일 합성 (음성 길이에 맞춰 영상 반복 재생)
 * - BGM 추가
 * - VM 서버에서 YouTube 레이아웃 + 타이밍별 자막 적용
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
// 오디오/비디오 길이 측정
// ==========================================
async function getMediaDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// ==========================================
// 설정
// ==========================================
const FFMPEG_API = "http://34.64.168.173:3000";
const GCS_BUCKET = "scene-image-generator-storage-mcp-test-457809";
const AUDIO_BUCKET = "shorts-audio-storage-mcp-test-457809";
const VIDEO_BUCKET = "shorts-videos-storage-mcp-test-457809";

const STOCK_SAMPLE_DIR = __dirname;
const TEMP_DIR = path.join(__dirname, "temp_render");

// ==========================================
// 비디오에 오디오 트랙이 있는지 확인
// ==========================================
async function hasAudioTrack(videoPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// ==========================================
// 로컬 FFmpeg: 비디오를 음성 길이에 맞춰 반복 재생 + 음성 합성
// ==========================================
async function loopVideoWithVoice(videoPath, voicePath, outputPath) {
  const videoDuration = await getMediaDuration(videoPath);
  const audioDuration = await getMediaDuration(voicePath);

  if (videoDuration <= 0 || audioDuration <= 0) {
    throw new Error(`Invalid duration: video=${videoDuration}s, audio=${audioDuration}s`);
  }

  console.log(`      📏 비디오: ${videoDuration.toFixed(2)}s, 음성: ${audioDuration.toFixed(2)}s`);

  if (videoDuration >= audioDuration) {
    // 비디오가 음성보다 길거나 같으면 그냥 합성 (음성 길이에 맞춰 자름)
    await execAsync(`ffmpeg -y -i "${videoPath}" -i "${voicePath}" -c:v libx264 -preset ultrafast -c:a aac -map 0:v -map 1:a -t ${audioDuration} "${outputPath}"`);
  } else {
    // 비디오가 음성보다 짧으면 반복 재생
    const loopCount = Math.ceil(audioDuration / videoDuration);
    console.log(`      🔁 비디오 ${loopCount}회 반복 필요`);

    // stream_loop으로 반복하고 음성 길이에 맞춰 자름
    await execAsync(`ffmpeg -y -stream_loop ${loopCount - 1} -i "${videoPath}" -i "${voicePath}" -c:v libx264 -preset ultrafast -c:a aac -map 0:v -map 1:a -t ${audioDuration} "${outputPath}"`);
  }

  return { outputPath, duration: audioDuration };
}

// ==========================================
// 로컬 FFmpeg: 비디오에 무음 오디오 추가
// ==========================================
async function addSilentAudio(videoPath, outputPath, duration = null) {
  const videoDuration = duration || await getMediaDuration(videoPath);
  await execAsync(`ffmpeg -y -i "${videoPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -c:v copy -c:a aac -map 0:v -map 1:a -t ${videoDuration} "${outputPath}"`);
  return { outputPath, duration: videoDuration };
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
  console.log("🎬 Stock Sample2 → YouTube Shorts 렌더링 시작\n");

  // temp 디렉토리 생성
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // 1. 자막 데이터 로드
  console.log("📝 [1/6] 자막 데이터 로드...");
  const scriptPath = path.join(STOCK_SAMPLE_DIR, "자막/script.json");
  const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  console.log(`   - 제목: ${scriptData.video_info.title}`);
  console.log(`   - ${scriptData.scenes.length}개 씬 로드 완료`);

  // 2. 파일 확인
  console.log("\n📹 [2/6] 파일 확인...");
  const videoDir = path.join(STOCK_SAMPLE_DIR, "vedio");
  const audioDir = path.join(STOCK_SAMPLE_DIR, "음성");
  const bgmDir = path.join(STOCK_SAMPLE_DIR, "bgm");

  const videoFiles = fs.readdirSync(videoDir).filter(f => /^video-\d+\.mp4$/.test(f)).sort();
  const audioFiles = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav')).sort();
  const bgmFiles = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3'));

  console.log(`   - 비디오: ${videoFiles.length}개 (${videoFiles.join(', ')})`);
  console.log(`   - 음성: ${audioFiles.length}개 (${audioFiles.join(', ')})`);
  console.log(`   - BGM: ${bgmFiles.length}개`);

  // 3. 비디오 + 음성 합성 (로컬) - 음성 길이에 맞춰 영상 반복 재생
  console.log("\n🔊 [3/7] 비디오 오디오 처리 (로컬 FFmpeg)...");
  const processedVideos = [];

  for (let i = 0; i < videoFiles.length; i++) {
    const videoFile = videoFiles[i];
    const videoPath = path.join(videoDir, videoFile);
    const outputPath = path.join(TEMP_DIR, `processed_${videoFile}`);

    // 해당 씬의 음성 파일 찾기 (video-1 → audio-1)
    const videoNum = videoFile.match(/video-(\d+)/)?.[1];
    const voiceFile = audioFiles.find(f => f.includes(`audio-${videoNum}`));

    console.log(`   📹 ${videoFile} 처리 중...`);

    let result;
    if (voiceFile) {
      // 음성 파일이 있으면 음성 길이에 맞춰 영상 반복 재생
      const voicePath = path.join(audioDir, voiceFile);
      result = await loopVideoWithVoice(videoPath, voicePath, outputPath);
      console.log(`   ✅ ${videoFile}: ${voiceFile} 합성 (${result.duration.toFixed(2)}s)`);
    } else {
      // 음성 파일 없음 → 원본 영상 + 무음
      result = await addSilentAudio(videoPath, outputPath);
      console.log(`   ⚠️ ${videoFile}: 음성 없음, 무음 오디오 추가 (${result.duration.toFixed(2)}s)`);
    }

    processedVideos.push({
      index: i + 1,
      path: outputPath,
      file: videoFile,
      scene: scriptData.scenes[i],
      duration: result.duration
    });
  }

  // 4. GCS 업로드
  console.log("\n☁️ [4/7] GCS 업로드...");
  const timestamp = Date.now();
  const folderName = `stock_sample2_${timestamp}`;

  const videoUrls = [];
  for (const video of processedVideos) {
    const gcsPath = `${folderName}/videos/processed_${video.file}`;
    const url = await uploadToGCS(video.path, GCS_BUCKET, gcsPath);
    videoUrls.push({
      index: video.index,
      url,
      scene: video.scene,
      duration: video.duration  // 실제 처리된 영상 길이 사용
    });
    console.log(`   ✅ 비디오 ${video.index}: processed_${video.file} (${video.duration.toFixed(2)}s)`);
  }

  // BGM 업로드
  let bgmUrl = null;
  if (bgmFiles.length > 0) {
    const bgmFile = bgmFiles[0];
    const bgmPath = path.join(bgmDir, bgmFile);
    const gcsPath = `${folderName}/bgm/${bgmFile}`;
    bgmUrl = await uploadToGCS(bgmPath, AUDIO_BUCKET, gcsPath);
    console.log(`   ✅ BGM: ${bgmFile}`);
  }

  // 5. 타이밍별 자막 생성 (씬 누적 시간 기준으로 변환)
  console.log("\n📝 [5/7] 타이밍별 자막 생성...");
  const timed_subtitles = [];
  let cumulativeTime = 0;

  for (const video of videoUrls) {
    const scene = video.scene;
    const sceneDuration = video.duration;

    // 씬의 원본 자막 시작/종료 시간 (MM:SS.ms 형식)
    if (scene?.subtitles) {
      for (const sub of scene.subtitles) {
        // 원본 시간을 초로 변환
        const parseTime = (timeStr) => {
          if (!timeStr) return 0;
          const parts = timeStr.split(':');
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseFloat(parts[1]) || 0;
          return minutes * 60 + seconds;
        };

        // 씬 내 상대 시간 계산 (씬 시작 기준)
        const sceneStartTime = parseTime(scene.duration_analysis?.start_time || "00:00.00");
        const subStartInScene = parseTime(sub.start_time) - sceneStartTime;
        const subEndInScene = parseTime(sub.end_time) - sceneStartTime;

        // 전체 영상 기준 절대 시간으로 변환
        const absoluteStart = cumulativeTime + subStartInScene;
        const absoluteEnd = cumulativeTime + subEndInScene;

        // 씬 길이를 초과하지 않도록 보정
        const clampedEnd = Math.min(absoluteEnd, cumulativeTime + sceneDuration);

        timed_subtitles.push({
          start_time: absoluteStart,
          end_time: clampedEnd,
          text_ko: sub.text_ko || "",
          text_en: sub.text_en || "",
          color: sub.color || "white"
        });

        console.log(`   📌 ${absoluteStart.toFixed(2)}s-${clampedEnd.toFixed(2)}s: "${sub.text_ko?.substring(0, 20)}..."`);
      }
    }

    cumulativeTime += sceneDuration;
  }

  console.log(`   총 ${timed_subtitles.length}개 자막 생성 완료`);

  // 6. FFmpeg VM에 렌더링 요청 (/render/shopping API 사용)
  console.log("\n🎥 [6/7] FFmpeg VM 렌더링 요청...");

  // 비디오 데이터 구성
  const videos = videoUrls.map((v) => ({
    index: v.index,
    url: v.url,
    duration: v.duration,
    scene_type: "narration",
    speaker: "main"
  }));

  const renderPayload = {
    videos: videos,
    bgm_url: bgmUrl,
    bgm_volume: 0.15,
    header_text: scriptData.video_info.title,
    header_text_english: scriptData.video_info.title_en,
    footer_text: "바이오 투자 정보",
    timed_subtitles: timed_subtitles,  // 타이밍별 자막 배열
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    use_original_audio: true,  // 이미 로컬에서 음성 합성됨
    width: 1080,
    height: 1920,
    output_bucket: VIDEO_BUCKET,
    output_path: `${folderName}/final_shorts.mp4`,
    folder_name: folderName
  };

  console.log("\n📤 렌더링 요청 데이터:");
  console.log(`   - 제목: ${renderPayload.header_text}`);
  console.log(`   - 비디오: ${videos.length}개`);
  console.log(`   - 타이밍 자막: ${timed_subtitles.length}개`);
  console.log(`   - BGM: ${bgmUrl ? '있음' : '없음'}`);

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

    // 7. temp 파일 정리
    console.log("\n🧹 [7/7] 임시 파일 정리...");
    for (const video of processedVideos) {
      if (fs.existsSync(video.path)) {
        fs.unlinkSync(video.path);
      }
    }
    console.log("   ✅ 정리 완료");

    return result;

  } catch (error) {
    console.error("\n❌ API 요청 실패:", error.message);
    throw error;
  }
}

// 실행
main().then(result => {
  console.log("\n🎉 완료!");
  if (result?.url) {
    console.log(`📺 최종 영상: ${result.url}`);
  }
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
