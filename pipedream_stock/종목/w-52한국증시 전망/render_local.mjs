/**
 * W52 한국증시 전망 로컬 렌더링 스크립트
 *
 * 사용법: node render_local.mjs
 */

import { Storage } from "@google-cloud/storage";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// 설정
// =====================================================
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const RENDER_ENDPOINT = "/render/puppy";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 프로젝트 설정
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const FOLDER_NAME = `${config.project_id}_${Date.now()}`;
const VIDEO_DIR = path.join(__dirname, "video");

console.log(`\n${"#".repeat(60)}`);
console.log(`# W52 한국증시 전망 렌더링`);
console.log(`${"#".repeat(60)}\n`);

// =====================================================
// GCS 업로드 함수
// =====================================================
async function uploadToGCS(localPath, gcsPath) {
  const storage = new Storage();
  const bucket = storage.bucket(GCS_BUCKET);

  console.log(`   📤 업로드: ${path.basename(localPath)} → gs://${GCS_BUCKET}/${gcsPath}`);

  await bucket.upload(localPath, {
    destination: gcsPath,
    metadata: {
      contentType: "video/mp4",
    },
  });

  return `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
}

// =====================================================
// 메인 함수
// =====================================================
async function main() {
  const sceneCount = config.scene_count;
  console.log(`📂 폴더: ${FOLDER_NAME}`);
  console.log(`🎥 씬 수: ${sceneCount}`);

  // ==========================================
  // Phase 1: GCS에 비디오 업로드
  // ==========================================
  console.log(`\n📤 Phase 1: GCS에 비디오 업로드\n`);

  const videos = [];

  for (let i = 1; i <= sceneCount; i++) {
    const videoFile = `scene${i}.mp4`;
    const localPath = path.join(VIDEO_DIR, videoFile);

    if (!fs.existsSync(localPath)) {
      console.log(`   ⚠️ 파일 없음: ${videoFile}`);
      continue;
    }

    const fileSize = fs.statSync(localPath).size;
    if (fileSize < 1000) {
      console.log(`   ⚠️ 파일 손상: ${videoFile} (${fileSize} bytes)`);
      continue;
    }

    try {
      const gcsPath = `${FOLDER_NAME}/${videoFile}`;
      const url = await uploadToGCS(localPath, gcsPath);
      videos.push({
        url: url,
        has_audio: true,
      });
      console.log(`   ✅ Scene ${i}: ${url}`);
    } catch (e) {
      console.log(`   ❌ 업로드 실패: ${e.message}`);
    }
  }

  console.log(`\n✅ ${videos.length}개 비디오 업로드 완료\n`);

  // ==========================================
  // Phase 2: VM 렌더링 요청
  // ==========================================
  console.log(`📹 Phase 2: VM 렌더링 요청\n`);

  // 자막 데이터
  const timedSubtitles = config.timed_subtitles || [];
  const hasEnglishSubtitles = timedSubtitles.some(s => s.text_en?.trim());

  // scene_audio_map 생성 (모든 씬에 오디오 있음)
  // 각 비디오의 duration을 가져와서 scene_audio_map 구성
  const sceneAudioMap = [];
  let cumulativeTime = 0;

  // 비디오 duration 계산을 위해 ffprobe 사용
  const videoDurations = [];
  for (let i = 1; i <= sceneCount; i++) {
    const videoFile = `scene${i}.mp4`;
    const localPath = path.join(VIDEO_DIR, videoFile);
    if (fs.existsSync(localPath)) {
      // ffprobe로 duration 가져오기
      try {
        const duration = parseFloat(
          execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${localPath}"`)
            .toString()
            .trim()
        );
        videoDurations.push(duration);
      } catch (e) {
        videoDurations.push(10); // 기본값
      }
    }
  }

  for (let i = 0; i < videos.length; i++) {
    const duration = videoDurations[i] || 10;
    sceneAudioMap.push({
      scene_index: i + 1,
      original_scene: i + 1,
      start_time: cumulativeTime,
      end_time: cumulativeTime + duration,
      has_audio: true,
      duration: duration,
    });
    cumulativeTime += duration;
  }

  // 레이아웃 설정 (VM 서버 형식)
  const layout = config.layout || {};
  const layoutConfig = {
    video_area: { x: 0, y: layout.video_area_y || 200, width: 720, height: layout.video_area_height || 850 },
    header_area: { y: layout.header_y || 220, height: layout.header_height || 120, single_line: true, max_lines: 1 },
    subtitle_area: { y: layout.subtitle_y || 900, height: 100, single_line: false },
    footer_area: { y: layout.footer_y || 950, height: layout.footer_height || 100 },
    font_scale: 1.0,
    force_vertical: true,
  };

  // 폰트 설정
  const fontSettings = config.font_settings || {};

  // 프로필 카드 설정
  const profileCardConfig = config.profile_card_config || null;

  const requestPayload = {
    videos: videos,
    header_text: config.title?.korean || "",
    header_text_english: config.title?.english || "",
    footer_text: config.footer?.korean || "",
    footer_text_english: config.footer?.english || "",
    subtitle_enabled: true,
    subtitle_english_enabled: hasEnglishSubtitles,
    subtitle_timing_mode: config.subtitle_timing_mode || "timed",
    timed_subtitles: timedSubtitles,
    bgm_url: config.bgm_url || "",
    bgm_volume: config.bgm_volume || 0.1,
    bgm_volume_no_audio: config.bgm_volume_no_audio || 0.5,
    scene_audio_map: sceneAudioMap,
    width: 720,
    height: 1280,
    use_origin_size: true,
    force_vertical: config.force_vertical !== false,
    video_scale_mode: config.video_scale_mode || "fit",
    origin_layout: layoutConfig,
    output_bucket: GCS_BUCKET,
    output_path: `${FOLDER_NAME}/final_${config.project_id}.mp4`,
    folder_name: FOLDER_NAME,
    font_settings: fontSettings,
    profile_card_config: profileCardConfig,
  };

  console.log(`📤 VM 렌더링 요청 중...`);
  console.log(`🌐 URL: ${FFMPEG_VM_URL}${RENDER_ENDPOINT}`);
  console.log(`📹 비디오 수: ${videos.length}개`);
  console.log(`📝 자막 수: ${timedSubtitles.length}개`);

  try {
    const startTime = Date.now();
    const response = await axios({
      url: `${FFMPEG_VM_URL}${RENDER_ENDPOINT}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: requestPayload,
      timeout: 600000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ 렌더링 완료!`);
    console.log(`⏱️ 소요 시간: ${elapsed}초`);
    console.log(`🔗 Output URL: ${response.data.url}`);

    // output_url.txt에 저장
    fs.writeFileSync(
      path.join(__dirname, "output_url.txt"),
      response.data.url + "\n"
    );
    console.log(`\n📝 output_url.txt에 저장됨`);

    return {
      success: true,
      output_url: response.data.url,
      elapsed: elapsed,
    };

  } catch (e) {
    console.error(`❌ 렌더링 실패: ${e.message}`);
    if (e.response?.data) {
      console.error(`   응답:`, JSON.stringify(e.response.data, null, 2));
    }
    return {
      success: false,
      error: e.message,
    };
  }
}

main().catch(console.error);
