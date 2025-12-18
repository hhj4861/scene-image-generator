/**
 * 땅콩이와버터 2화 렌더링 테스트
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 로컬 파일 경로
const BASE_DIR = "/Users/admin/Desktop/workSpace/scene-image-generator-new/pipedream_puppy/땅콩이와버터/2화";

// config 읽기
const config = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));

// 실제 비디오 duration (모두 8초)
const VIDEO_DURATION = 8;
const SCENE_COUNT = 10;

// config.json의 timed_subtitles 사용 (color 포함)

async function uploadVideoToGCS(localPath, gcsPath) {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  const cmd = `/opt/homebrew/share/google-cloud-sdk/bin/gsutil cp "${localPath}" "gs://${GCS_BUCKET}/${gcsPath}"`;
  console.log(`📤 Uploading: ${path.basename(localPath)}`);
  await execPromise(cmd);
  return `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
}

async function renderPuppyVideo() {
  console.log("🎬 땅콩이와버터 2화 렌더링\n");
  console.log("=".repeat(60));

  const folderName = "peanut-butter-ep2";

  // 1. 비디오 파일 GCS 업로드
  console.log("\n📤 비디오 파일 GCS 업로드 중...");
  const videos = [];

  for (let i = 1; i <= SCENE_COUNT; i++) {
    const localPath = path.join(BASE_DIR, "video", `Scene_${i}.mp4`);
    const gcsPath = `${folderName}/scene_${String(i).padStart(2, '0')}.mp4`;

    const url = await uploadVideoToGCS(localPath, gcsPath);

    videos.push({
      url: url,
      index: i,
      original_index: i,
      has_audio: true, // 원본 영상 오디오 사용
      duration: VIDEO_DURATION
    });
  }

  console.log(`✅ ${videos.length}개 비디오 업로드 완료`);

  // 2. config.json의 timed_subtitles 사용 (절대 시간, color 포함)
  const totalDuration = SCENE_COUNT * VIDEO_DURATION;

  // config.timed_subtitles를 그대로 사용 (이미 절대 시간)
  const mergedSubtitles = (config.timed_subtitles || []).map(sub => ({
    start_time: sub.start_time,
    end_time: sub.end_time,
    text_ko: sub.text_ko,
    text_en: sub.text_en,
    color: sub.color || null, // color 속성 전달
    position: sub.position || "center"
  }));

  console.log(`\n📝 자막 (${mergedSubtitles.length}개):`);
  for (const sub of mergedSubtitles) {
    const colorInfo = sub.color ? ` [${sub.color}]` : '';
    console.log(`  ${sub.start_time}s ~ ${sub.end_time}s${colorInfo}: "${sub.text_ko}"`);
  }

  console.log(`\n총 영상 길이: ${totalDuration}초`);
  console.log(`총 자막 수: ${mergedSubtitles.length}개`);

  // 3. 씬별 오디오 맵 (원본 영상 오디오 사용)
  let audioMapCumTime = 0;
  const sceneAudioMap = videos.map((v, idx) => {
    const startTime = audioMapCumTime;
    audioMapCumTime += VIDEO_DURATION;
    return {
      scene_index: idx + 1,
      original_scene: v.index,
      start_time: startTime,
      end_time: audioMapCumTime,
      has_audio: true, // 원본 영상 오디오 사용
      duration: VIDEO_DURATION
    };
  });

  // 4. 레이아웃 설정 (config.layout 사용)
  const layoutConfig = {
    video_area: {
      x: 0,
      y: config.layout?.video_area_y || 160,
      width: 720,
      height: config.layout?.video_area_height || 850
    },
    header_area: {
      y: config.layout?.header_y || 300,
      height: config.layout?.header_height || 120,
      single_line: true,
      max_lines: 1
    },
    subtitle_area: {
      y: config.layout?.subtitle_y || 860,
      height: 100,
      single_line: false
    },
    footer_area: {
      y: config.layout?.footer_y || 950,
      height: config.layout?.footer_height || 100
    },
    font_scale: 1,
    force_vertical: true
  };

  console.log(`\n📐 Layout: video_y=${layoutConfig.video_area.y}, subtitle_y=${layoutConfig.subtitle_area.y}, footer_y=${layoutConfig.footer_area.y}`);

  // 5. API 요청 페이로드
  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    header_text: config.title.korean,
    header_text_english: config.title.english,
    footer_text: config.footer.korean,
    footer_text_english: config.footer.english,
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    subtitle_timing_mode: "timed",
    timed_subtitles: mergedSubtitles,
    bgm_url: null, // BGM 비활성화 - 원본 영상 오디오만 사용
    bgm_volume: 0,
    bgm_volume_no_audio: 0,
    scene_audio_map: sceneAudioMap,
    width: 720,
    height: 1280,
    use_origin_size: true,
    force_vertical: true,
    video_scale_mode: "fit",
    origin_layout: layoutConfig,
    output_bucket: GCS_BUCKET,
    output_path: `${folderName}/final_peanut_butter_ep2.mp4`,
    folder_name: folderName,
    font_settings: config.font_settings
  };

  console.log(`\n📤 FFmpeg VM API 요청 중...`);
  console.log(`🌐 URL: ${FFMPEG_VM_URL}/render/puppy`);
  console.log(`🎵 BGM: ${config.bgm_url}`);

  try {
    const startTime = Date.now();
    const response = await axios.post(
      `${FFMPEG_VM_URL}/render/puppy`,
      requestPayload,
      { timeout: 600000 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log("✅ SUCCESS!");
    console.log("=".repeat(60));
    console.log(`⏱️ Time elapsed: ${elapsed}s`);
    console.log(`🔗 Output URL: ${response.data.url}`);

    return response.data;

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    if (error.response?.data) {
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// 실행
renderPuppyVideo().catch(console.error);
