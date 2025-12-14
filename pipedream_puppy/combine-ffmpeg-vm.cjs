/**
 * FFmpeg VM을 이용한 영상 합성 공통 스크립트
 *
 * 필수 폴더 구조:
 *   project_folder/
 *     ├── script/vedio_script.json   (스크립트)
 *     ├── video/                      (영상 파일들)
 *     ├── config.json                 (프로젝트 설정)
 *     └── output_url.txt              (결과 URL 저장)
 *
 * 사용법:
 *   node combine-ffmpeg-vm.cjs [프로젝트경로]
 *
 *   예시:
 *     node combine-ffmpeg-vm.cjs 조선-땅콩
 *     node combine-ffmpeg-vm.cjs ./스키장_땅콩
 *     node combine-ffmpeg-vm.cjs                 (현재 폴더)
 *
 * config.json 예시:
 *   {
 *     "project_name": "조선-땅콩",
 *     "project_id": "joseon_peanut",
 *     "title": {
 *       "korean": "조선 힙스터 댕댕이: 반전 일상 대공개!",
 *       "english": "Joseon Hipster Dog: A Day in the Life!"
 *     },
 *     "footer": {
 *       "korean": "땅콩이의 귀여운 하루 🐶",
 *       "english": "Pomeranian TtangKong Cute Day 🐶"
 *     },
 *     "bgm_url": "https://cdn1.suno.ai/xxx.mp3",
 *     "bgm_volume": 0.25,
 *     "scene_count": 7
 *   }
 */

const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// =====================================================
// 인자 파싱
// =====================================================
function parseArgs() {
  const args = process.argv.slice(2);
  let projectPath = process.cwd();

  if (args.length > 0 && !args[0].startsWith("-")) {
    projectPath = path.resolve(args[0]);
  }

  return { projectPath };
}

// =====================================================
// 프로젝트 설정 로드
// =====================================================
function loadProjectConfig(projectPath) {
  const configPath = path.join(projectPath, "config.json");

  if (!fs.existsSync(configPath)) {
    console.error(`config.json을 찾을 수 없습니다: ${configPath}`);
    console.error("\nconfig.json 예시:");
    console.error(JSON.stringify({
      project_name: "프로젝트명",
      project_id: "project_id",
      title: {
        korean: "한글 제목",
        english: "English Title"
      },
      footer: {
        korean: "푸터 한글",
        english: "Footer English"
      },
      bgm_url: "https://cdn1.suno.ai/xxx.mp3",
      bgm_volume: 0.25,
      scene_count: 7,
      subtitle_timing_mode: "timed"  // "timed" or "always"
    }, null, 2));
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

// =====================================================
// 스크립트 데이터 로드
// =====================================================
function loadScriptData(projectPath) {
  const scriptPath = path.join(projectPath, "script", "vedio_script.json");

  if (!fs.existsSync(scriptPath)) {
    console.error(`스크립트 파일을 찾을 수 없습니다: ${scriptPath}`);
    process.exit(1);
  }

  const scriptData = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  return scriptData.$return_value?.scenes || [];
}

// =====================================================
// 씬별 자막 매핑
// =====================================================
function getNarration(scenes, sceneIndex) {
  const scene = scenes.find(s => s.video === sceneIndex);
  if (!scene) return { narration: "", narration_english: "", timed_subtitles: null, profile_card: null, has_audio: true };

  // profile_card가 있으면 timed_subtitles 형태로 변환
  let profileCardSubtitles = null;
  if (scene.profile_card) {
    const pc = scene.profile_card;
    profileCardSubtitles = pc.items.map((item, idx) => ({
      start: pc.start_time + (idx * (pc.interval || 1.0)),
      end: pc.end_time || 8.0,
      korean: `${item.label}: ${item.value}`,
      english: item.english || '',
      position: 'right'  // 오른쪽 위치 플래그
    }));
    // 헤더 추가
    if (pc.header) {
      profileCardSubtitles.unshift({
        start: pc.start_time || 0.5,
        end: pc.end_time || 8.0,
        korean: `[${pc.header}]`,
        english: pc.header_english ? `[${pc.header_english}]` : '',
        position: 'right'
      });
    }
  }

  return {
    narration: scene.dialogue?.script || scene.narration || "",
    narration_english: scene.dialogue?.script_english || scene.narration_english || "",
    timed_subtitles: scene.timed_subtitles || profileCardSubtitles || null,
    profile_card: scene.profile_card || null,
    has_audio: scene.has_audio !== undefined ? scene.has_audio : true  // ★ 씬별 오디오 유무
  };
}

// =====================================================
// GCS 업로드
// =====================================================
async function uploadToGCS(localPath, gcsPath) {
  const storage = new Storage();
  const bucket = storage.bucket(GCS_BUCKET);

  console.log(`Uploading ${path.basename(localPath)} to gs://${GCS_BUCKET}/${gcsPath}...`);
  try {
    await bucket.upload(localPath, { destination: gcsPath });
  } catch (err) {
    console.error(`  [ERROR] Upload failed: ${err.message}`);
    throw err;
  }

  const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
  console.log(`  -> ${publicUrl}`);
  return publicUrl;
}

// =====================================================
// 영상 해상도 가져오기
// =====================================================
function getVideoResolution(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
      { encoding: "utf8" }
    ).trim();
    const [width, height] = output.split(",").map(Number);
    return { width, height };
  } catch (err) {
    console.error(`Failed to get resolution for ${videoPath}`);
    return { width: 720, height: 1280 }; // fallback (9:16 portrait)
  }
}

// =====================================================
// 영상 파일 목록 생성
// =====================================================
function getVideoFiles(videoDir, sceneCount, config) {
  const files = [];

  // config.json에 video_file_pattern이 있으면 사용
  const customPattern = config?.video_file_pattern;

  // 0-indexed인지 1-indexed인지 확인
  const startIndex = fs.existsSync(path.join(videoDir, "scene0.mp4")) ||
    fs.existsSync(path.join(videoDir, "씬0.mp4")) ? 0 : 1;
  const endIndex = startIndex === 0 ? sceneCount - 1 : sceneCount;

  for (let i = startIndex; i <= endIndex; i++) {
    // 다양한 파일명 패턴 지원
    const patterns = [
      `scene${i}_veo3_json.mp4`,
      `scene${i}_veo3.mp4`,
      `scene${i}.mp4`,
      `씬${i}.mp4`  // Korean pattern
    ];

    // Custom pattern from config
    if (customPattern) {
      patterns.unshift(customPattern.replace('{index}', i));
    }

    for (const pattern of patterns) {
      const filePath = path.join(videoDir, pattern);
      if (fs.existsSync(filePath)) {
        files.push({ index: i + (startIndex === 0 ? 1 : 0), localFile: pattern, path: filePath });
        break;
      }
    }
  }

  return files;
}

// =====================================================
// 메인 함수
// =====================================================
async function combineVideos() {
  const { projectPath } = parseArgs();

  // 프로젝트 경로 확인
  if (!fs.existsSync(projectPath)) {
    console.error(`프로젝트 경로를 찾을 수 없습니다: ${projectPath}`);
    process.exit(1);
  }

  // 설정 및 스크립트 로드
  const config = loadProjectConfig(projectPath);
  const scenes = loadScriptData(projectPath);
  const videoDir = path.join(projectPath, "video");

  const projectId = config.project_id || path.basename(projectPath).replace(/[^a-zA-Z0-9]/g, "_");
  const testFolder = `${projectId}_${Date.now()}`;

  console.log("=".repeat(60));
  console.log(`${config.project_name || "Project"} - Video Combine with FFmpeg VM`);
  console.log("=".repeat(60));
  console.log(`\n프로젝트: ${projectPath}`);
  console.log(`폴더 ID: ${testFolder}\n`);

  // 1. 영상 파일 확인 및 GCS 업로드
  console.log("Step 1: Uploading videos to GCS...\n");

  const videoFiles = getVideoFiles(videoDir, config.scene_count || scenes.length, config);
  const videos = [];

  for (const file of videoFiles) {
    if (!fs.existsSync(file.path)) {
      console.error(`  [SKIP] File not found: ${file.localFile}`);
      continue;
    }

    const gcsPath = `${testFolder}/scene${file.index}.mp4`;
    const url = await uploadToGCS(file.path, gcsPath);

    const { narration, narration_english, timed_subtitles, profile_card, has_audio } = getNarration(scenes, file.index);

    // ★ video 객체에는 씬별 자막과 profile_card, has_audio 포함 ★
    // 전체 영상 기준 자막은 requestPayload.timed_subtitles에서 처리
    videos.push({
      url,
      index: file.index,
      narration: narration,
      narration_english: narration_english,
      timed_subtitles: timed_subtitles || null,
      profile_card: profile_card,  // 프로필 카드 정보 추가
      has_audio: has_audio,  // ★ 씬별 오디오 유무 (BGM 볼륨 조절용)
      is_performance: false,
      scene_type: "interview"
    });
  }

  console.log(`\n  Uploaded ${videos.length} videos\n`);

  if (videos.length === 0) {
    console.error("No videos found to combine!");
    process.exit(1);
  }

  // 첫 번째 영상의 해상도 확인
  const firstVideoPath = videoFiles[0]?.path;
  let outputWidth = 720;
  let outputHeight = 1280;
  let sourceWidth = 720;
  let sourceHeight = 1280;

  if (firstVideoPath && fs.existsSync(firstVideoPath)) {
    const resolution = getVideoResolution(firstVideoPath);
    sourceWidth = resolution.width;
    sourceHeight = resolution.height;

    // force_vertical: true면 16:9를 9:16으로 변환
    if (config.force_vertical && sourceWidth > sourceHeight) {
      outputWidth = 720;
      outputHeight = 1280;
      console.log(`  Source: ${sourceWidth}x${sourceHeight} (landscape) → Output: ${outputWidth}x${outputHeight} (portrait)`);
    } else {
      outputWidth = resolution.width;
      outputHeight = resolution.height;
    }
  }
  console.log(`  Output size: ${outputWidth}x${outputHeight}\n`);

  // 2. FFmpeg VM API 호출
  console.log("Step 2: Calling FFmpeg VM API...\n");

  // 9:16 세로 모드용 레이아웃 설정
  const fontScale = outputWidth / 720;

  // config.json에 layout 설정이 있으면 사용, 없으면 기본값 (test-scene2-3.cjs 기준)
  const configLayout = config.layout || {};
  const headerY = configLayout.header_y ?? 150;
  const headerHeight = configLayout.header_height ?? 80;
  const videoAreaY = configLayout.video_area_y ?? 130;
  const videoAreaHeight = configLayout.video_area_height ?? 800;
  const subtitleY = configLayout.subtitle_y ?? 850;
  const footerY = configLayout.footer_y ?? 900;
  const footerHeight = configLayout.footer_height ?? 80;

  const layoutConfig = {
    video_area: {
      x: 0,
      y: videoAreaY,
      width: outputWidth,
      height: videoAreaHeight
    },
    header_area: {
      y: headerY,
      height: headerHeight,
      single_line: true,
      max_lines: 1
    },
    subtitle_area: {
      y: subtitleY,
      height: 100,
      single_line: false
    },
    footer_area: {
      y: footerY,
      height: footerHeight
    },
    font_scale: fontScale,
    force_vertical: config.force_vertical || false
  };

  // config.json에 font_settings 설정이 있으면 사용, 없으면 기본값
  const configFontSettings = config.font_settings || {};

  const fontSettings = {
    header_korean: {
      font: configFontSettings.header_korean?.font || "NanumSquareRoundOTFEB",
      size: configFontSettings.header_korean?.size || Math.round(50 * fontScale),
      max_lines: configFontSettings.header_korean?.max_lines ?? 1
    },
    header_english: {
      font: configFontSettings.header_english?.font || "NotoSerif-Regular",
      size: configFontSettings.header_english?.size || Math.round(25 * fontScale),
      y_offset: configFontSettings.header_english?.y_offset ?? 90
    },
    subtitle_korean: {
      font: configFontSettings.subtitle_korean?.font || "NanumSquareRoundOTFEB",
      size: configFontSettings.subtitle_korean?.size || Math.round(25 * fontScale),
      max_lines: configFontSettings.subtitle_korean?.max_lines ?? 1
    },
    subtitle_english: {
      font: configFontSettings.subtitle_english?.font || "NotoSerif-Regular",
      size: configFontSettings.subtitle_english?.size || Math.round(18 * fontScale),
      max_lines: configFontSettings.subtitle_english?.max_lines ?? 1
    },
    footer_korean: {
      size: configFontSettings.footer_korean?.size || Math.round(45 * fontScale)
    },
    footer_english: {
      size: configFontSettings.footer_english?.size || Math.round(20 * fontScale),
      y_offset: configFontSettings.footer_english?.y_offset ?? 60
    }
  };

  // ★★★ 프로필 카드 기본 설정 (config에서 읽거나 기본값 사용) ★★★
  const PROFILE_CARD_CONFIG = config.profile_card_config || {
    baseY: 450,           // 시작 Y 위치
    lineHeight: 40,       // 각 항목 간격
    headerFontSize: 30,   // 헤더 폰트 크기
    itemFontSize: 20,     // 항목 폰트 크기
    maxChars: 30,         // 줄당 최대 글자
    rightMargin: 30       // 오른쪽 여백
  };

  // ★ config.json의 timed_subtitles + profile_card 병합된 최종 자막 생성 ★
  // position이 'right'인 경우 right_margin 추가
  let mergedTimedSubtitles = config.timed_subtitles 
    ? config.timed_subtitles.map(sub => ({
        ...sub,
        right_margin: sub.right_margin || (sub.position === 'right' ? PROFILE_CARD_CONFIG.rightMargin : undefined)
      }))
    : [];
  
  // profile_card를 timed_subtitles로 변환하여 병합

  for (const video of videos) {
    if (video.profile_card) {
      const pc = video.profile_card;
      const sceneDuration = 8;
      const sceneStartTime = (video.index - 1) * sceneDuration;
      
      // 프로필 카드 커스텀 설정 (있으면 사용, 없으면 기본값)
      const baseY = pc.base_y || PROFILE_CARD_CONFIG.baseY;
      const lineHeight = pc.line_height || PROFILE_CARD_CONFIG.lineHeight;
      const headerFontSize = pc.header_font_size || PROFILE_CARD_CONFIG.headerFontSize;
      const itemFontSize = pc.item_font_size || PROFILE_CARD_CONFIG.itemFontSize;
      const maxChars = pc.max_chars || PROFILE_CARD_CONFIG.maxChars;
      const rightMargin = pc.right_margin || PROFILE_CARD_CONFIG.rightMargin;
      
      // 헤더 추가 (개별 설정 가능)
      const startTime = pc.start_time || 0.5;
      const endTime = pc.end_time || 8;
      
      if (pc.header) {
        mergedTimedSubtitles.push({
          start_time: sceneStartTime + (pc.header_start_time || startTime),
          end_time: sceneStartTime + (pc.header_end_time || endTime),
          text_ko: pc.header.startsWith('[') ? pc.header : `[${pc.header}]`,
          text_en: pc.header_english || '',
          position: pc.position || 'right',
          y_offset: pc.header_y_offset || baseY,
          font_size: pc.header_font_size || headerFontSize,
          max_chars: pc.header_max_chars || maxChars,
          right_margin: rightMargin
        });
      }
      
      // 아이템들 추가 (각 아이템별 개별 설정 가능)
      if (pc.items) {
        pc.items.forEach((item, idx) => {
          const itemStart = item.start_time 
            ? sceneStartTime + item.start_time 
            : sceneStartTime + startTime + ((idx + 1) * (pc.interval || 1.5));
          const itemEnd = item.end_time 
            ? sceneStartTime + item.end_time 
            : sceneStartTime + endTime;
          const itemYOffset = item.y_offset || (baseY + 20 + (lineHeight * (idx + 1)));
          const itemFontSizeOverride = item.font_size || itemFontSize;
          const itemMaxChars = item.max_chars || maxChars;
          
          mergedTimedSubtitles.push({
            start_time: itemStart,
            end_time: itemEnd,
            text_ko: `${item.label}: ${item.value}`,
            text_en: item.english || '',
            position: item.position || pc.position || 'right',
            y_offset: itemYOffset,
            font_size: itemFontSizeOverride,
            max_chars: itemMaxChars,
            right_margin: item.right_margin || rightMargin
          });
        });
      }
      
      console.log(`  [Scene ${video.index}] Added profile card subtitles`);
    }
  }
  
  // 시간순 정렬
  mergedTimedSubtitles.sort((a, b) => a.start_time - b.start_time);
  console.log(`  Total merged subtitles: ${mergedTimedSubtitles.length}`);

  // ★★★ 씬별 오디오 정보 (BGM 구간별 볼륨 조절용) ★★★
  const sceneDuration = 8;  // 각 씬 기본 길이 (초)
  const sceneAudioMap = videos.map(v => ({
    scene_index: v.index,
    start_time: (v.index - 1) * sceneDuration,
    end_time: v.index * sceneDuration,
    has_audio: v.has_audio
  }));
  console.log(`  Scene audio map:`, JSON.stringify(sceneAudioMap, null, 2));

  const requestPayload = {
    videos: videos.sort((a, b) => a.index - b.index),
    header_text: config.title?.korean || config.project_name || "제목",
    header_text_english: config.title?.english || "",
    footer_text: config.footer?.korean || "",
    footer_text_english: config.footer?.english || "",
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    subtitle_timing_mode: config.subtitle_timing_mode || "timed",
    timed_subtitles: mergedTimedSubtitles.length > 0 ? mergedTimedSubtitles : null,  // ★ 최상위에 추가
    bgm_url: config.bgm_url || "",
    bgm_volume: config.bgm_volume || 0.2,           // 원본 오디오 있을 때 BGM 볼륨
    bgm_volume_no_audio: config.bgm_volume_no_audio || 0.8,  // 원본 오디오 없을 때 BGM 볼륨
    scene_audio_map: sceneAudioMap,  // ★ 씬별 오디오 유무 (구간별 BGM 볼륨 조절용)
    width: outputWidth,
    height: outputHeight,
    use_origin_size: true,
    force_vertical: config.force_vertical || false,
    video_scale_mode: config.video_scale_mode || "fit",
    origin_layout: layoutConfig,
    output_bucket: GCS_BUCKET,
    output_path: `${testFolder}/final_${projectId}.mp4`,
    folder_name: testFolder,
    font_settings: fontSettings
  };

  console.log("Request payload:");
  console.log(JSON.stringify(requestPayload, null, 2));
  console.log("\n");

  try {
    console.log("Sending request to FFmpeg VM...");
    const startTime = Date.now();

    const response = await axios.post(
      `${FFMPEG_VM_URL}/render/puppy`,
      requestPayload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 600000 // 10분
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log("SUCCESS!");
    console.log("=".repeat(60));
    console.log(`Time elapsed: ${elapsed}s`);
    console.log(`Job ID: ${response.data.job_id}`);
    console.log(`Total duration: ${response.data.total_duration?.toFixed(1)}s`);
    console.log(`Output URL: ${response.data.url}`);
    console.log("\nStats:", JSON.stringify(response.data.stats, null, 2));

    // 결과 URL 저장
    const resultPath = path.join(projectPath, "output_url.txt");
    fs.writeFileSync(resultPath, response.data.url);
    console.log(`\nOutput URL saved to: ${resultPath}`);

    return response.data;

  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("ERROR!");
    console.error("=".repeat(60));
    console.error("Message:", error.message);
    if (error.response?.data) {
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// 실행
combineVideos()
  .then(result => {
    console.log("\n\nVideo combine completed successfully!");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n\nVideo combine failed!");
    process.exit(1);
  });
