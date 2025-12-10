/**
 * FFmpeg로 Beatbox Sample 영상 합성 (땅콩이 템플릿)
 * - pipedream_puppy/beatbox_sample/vedio 영상들 연결
 * - vedio_prompt_output.json 기반 자막 생성
 * - 상단 타이틀 + 하단 채널명 + 자막 오버레이
 * - 1080x1920 Full HD 출력
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// =====================
// 설정
// =====================
const BEATBOX_SAMPLE_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/beatbox_sample";
const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

// 땅콩이 스타일 설정 (노란색 계열, 편안한 분위기)
const PEANUT_STYLE = {
  // 출력 해상도
  width: 1080,
  height: 1920,

  // 영상 영역 (65% - 이전 설정 복원)
  video_height_percent: 65,

  // 상단 타이틀 (밝은 주황/노랑 글씨, 진한 외곽선 - 배경 박스 없음)
  header: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 72,           // 약간 줄여서 깨짐 방지
    color: "0xFFA500",       // 밝은 주황색 (Orange) - 글씨에 색상
    border_color: "0x000000", // 검은색 외곽선 (가독성 UP)
    border_width: 5,         // 두꺼운 외곽선
    shadow_color: "0x333333", // 그림자 효과
    y_percent: 4,            // 상단 검은 배경 영역
    max_chars_per_line: 12,  // 2줄 처리용
  },

  // 상단 영어 서브타이틀 (한글 타이틀 아래)
  header_english: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 36,
    color: "0xFFD700",       // 골드 (Gold) - 영어 타이틀
    border_color: "0x000000",
    border_width: 3,
    y_offset: 85,            // 한글 타이틀 아래 오프셋
  },

  // 하단 채널명 (밝은 주황 글씨, 진한 외곽선 - 배경 박스 없음)
  footer: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 65,           // 약간 줄여서 깨짐 방지
    color: "0xFFA500",       // 밝은 주황색 - 글씨에 색상
    border_color: "0x000000", // 검은색 외곽선
    border_width: 5,         // 두꺼운 외곽선
    y_percent: 92,           // 더 아래로 (자막과 충분한 간격)
  },

  // 한글 자막 (부드러운 노란색 + 검은 외곽선, 영상 하단부)
  subtitle: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 46,           // 약간 줄임
    color: "0xFFFFFF",       // 흰색 (가독성 최고)
    border_color: "0x000000", // 검은색 외곽선
    border_width: 4,
    y_percent: 70,           // 위로 올림 (영상 하단부)
  },

  // 영어 자막 (크림색, 한글 자막 바로 아래)
  subtitle_english: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 32,           // 줄여서 공간 확보
    color: "0xE0E0E0",       // 연한 회색 (부드러운 흰색)
    border_color: "0x000000",
    border_width: 3,
    y_percent: 76,           // 한글 자막 바로 아래 (푸터 위)
  },

  // 인터뷰어 자막 (부드러운 하늘색)
  subtitle_interviewer: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 46,
    color: "0x87CEEB",       // 스카이블루 (눈 편안)
    border_color: "0x000000",
    border_width: 4,
    y_percent: 70,           // 위로 올림
  },
  subtitle_interviewer_english: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 32,
    color: "0xE0E0E0",       // 연한 회색
    border_color: "0x000000",
    border_width: 3,
    y_percent: 76,           // 위로 올림
  },
};

// =====================
// 영상 길이 확인
// =====================
function getVideoDuration(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf8" }
    );
    return parseFloat(result.trim());
  } catch (error) {
    console.error(`영상 길이 확인 실패: ${videoPath}`);
    return 6;
  }
}

// =====================
// 이모티콘 제거
// =====================
function removeEmojis(text) {
  if (!text) return "";
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F700}-\u{1F77F}]/gu, "")
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, "")
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .trim();
}

// =====================
// 텍스트 이스케이프 (ffmpeg용)
// =====================
function escapeText(text) {
  const cleanText = removeEmojis(text);
  return cleanText
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// =====================
// 자막 텍스트 정리 (콩파민 제외, 2~3줄 처리)
// =====================
const MAX_CHARS_PER_LINE = 14; // 한글 한 줄 최대 글자 수
const MAX_CHARS_PER_LINE_ENG = 25; // 영문 한 줄 최대 글자 수 (화면에 맞게)

function cleanSubtitleText(text) {
  if (!text) return "";
  // 콩파민 제거
  let cleaned = text.replace(/콩파민[!！]?/g, "").trim();
  // 연속된 공백 제거
  cleaned = cleaned.replace(/\s+/g, " ");
  // "... " 등 정리
  cleaned = cleaned.replace(/\.{2,}\s*/g, "... ");
  return cleaned;
}

// 자막 줄 나누기 (maxLines로 최대 줄 수 지정 가능)
function splitSubtitleLines(text, maxLines = 2) {
  const cleaned = cleanSubtitleText(text);
  if (!cleaned) return [];

  // 글자 수가 짧으면 1줄
  if (cleaned.length <= MAX_CHARS_PER_LINE) {
    return [cleaned];
  }

  // 2줄 처리
  if (maxLines === 2 || cleaned.length <= MAX_CHARS_PER_LINE * 2) {
    const mid = Math.ceil(cleaned.length / 2);
    let splitIdx = cleaned.lastIndexOf(" ", mid);
    if (splitIdx === -1 || splitIdx < 5) {
      splitIdx = cleaned.indexOf(" ", mid);
    }
    if (splitIdx === -1) {
      splitIdx = mid;
    }

    const line1 = cleaned.substring(0, splitIdx).trim();
    const line2 = cleaned.substring(splitIdx).trim();

    if (line2) {
      return [line1, line2];
    }
    return [line1];
  }

  // 3줄 처리
  const thirdLen = Math.ceil(cleaned.length / 3);
  let split1 = cleaned.lastIndexOf(" ", thirdLen);
  if (split1 === -1 || split1 < 5) split1 = cleaned.indexOf(" ", thirdLen);
  if (split1 === -1) split1 = thirdLen;

  let split2 = cleaned.lastIndexOf(" ", thirdLen * 2);
  if (split2 === -1 || split2 <= split1 + 3) split2 = cleaned.indexOf(" ", thirdLen * 2);
  if (split2 === -1 || split2 <= split1) split2 = thirdLen * 2;

  const line1 = cleaned.substring(0, split1).trim();
  const line2 = cleaned.substring(split1, split2).trim();
  const line3 = cleaned.substring(split2).trim();

  const lines = [line1];
  if (line2) lines.push(line2);
  if (line3) lines.push(line3);
  return lines;
}

// 상단 타이틀 2줄 처리
function splitHeaderLines(text, maxChars = 12) {
  if (!text) return [];
  const cleaned = removeEmojis(text).trim();

  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  // 2줄로 나누기
  const mid = Math.ceil(cleaned.length / 2);
  let splitIdx = cleaned.lastIndexOf(" ", mid);
  if (splitIdx === -1 || splitIdx < 4) {
    splitIdx = cleaned.indexOf(" ", mid);
  }
  if (splitIdx === -1) {
    splitIdx = mid;
  }

  const line1 = cleaned.substring(0, splitIdx).trim();
  const line2 = cleaned.substring(splitIdx).trim();

  if (line2) {
    return [line1, line2];
  }
  return [line1];
}

// 영문 자막 줄 나누기 (25자 이상이면 강제 2줄)
function splitEnglishSubtitleLines(text) {
  if (!text) return [];
  const cleaned = text.trim();

  // 25자 이하면 1줄
  if (cleaned.length <= 25) {
    return [cleaned];
  }

  // 25자 초과면 강제 2줄로 분리 (중간 지점 공백 기준)
  const mid = Math.ceil(cleaned.length / 2);
  let splitIdx = cleaned.lastIndexOf(" ", mid);
  if (splitIdx === -1 || splitIdx < 10) {
    splitIdx = cleaned.indexOf(" ", mid);
  }
  if (splitIdx === -1) {
    splitIdx = mid;
  }

  const line1 = cleaned.substring(0, splitIdx).trim();
  const line2 = cleaned.substring(splitIdx).trim();

  return [line1, line2].filter(l => l.length > 0);
}

// =====================
// 스크립트 데이터 로드
// =====================
function loadScriptData() {
  const scriptPath = path.join(BEATBOX_SAMPLE_DIR, "script", "vedio_prompt_output.json");
  const data = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  return data.$return_value;
}

// =====================
// 영상 파일 목록 로드 (커스텀 순서: 씬5를 씬3 뒤에 삽입)
// =====================
// 원하는 순서: 1, 2, 3, 5, 4, 6, 7, 8 (씬5를 씬3 뒤, 씬4 앞에)
const CUSTOM_SCENE_ORDER = [1, 2, 3, 5, 4, 6, 7, 8];

function loadVideoFiles() {
  const vedioDir = path.join(BEATBOX_SAMPLE_DIR, "vedio");
  const allFiles = fs.readdirSync(vedioDir)
    .filter(f => f.endsWith(".mp4"));

  // 커스텀 순서대로 파일 정렬
  const orderedFiles = [];
  for (const sceneNum of CUSTOM_SCENE_ORDER) {
    const fileName = allFiles.find(f => {
      const num = parseInt(f.match(/(\d+)/)?.[1] || "0");
      return num === sceneNum;
    });
    if (fileName) {
      orderedFiles.push(path.join(vedioDir, fileName));
    }
  }

  return orderedFiles;
}

// =====================
// 자막 데이터 생성 (커스텀 순서 기반)
// =====================
function generateSubtitles(scriptData, videoDurations) {
  const scenes = scriptData.scenes || [];
  const subtitles = [];
  let currentTime = 0;

  // 커스텀 순서대로 자막 생성
  for (let videoIdx = 0; videoIdx < CUSTOM_SCENE_ORDER.length; videoIdx++) {
    const sceneNum = CUSTOM_SCENE_ORDER[videoIdx];
    const scene = scenes.find(s => s.video === sceneNum);

    if (!scene) continue;

    const duration = videoDurations[videoIdx] || scene.duration_seconds || 6;

    // 대사 가져오기 - script 필드 우선 사용
    const dialogue = scene.dialogue || {};
    let narration = dialogue.script || dialogue.interviewer || dialogue["땅콩"] || scene.narration || "";
    const narrationEnglish = dialogue.script_english || scene.narration_english || "";

    // 인터뷰 질문인지 확인
    const isInterviewQuestion = scene.scene_details?.is_interview_question ||
                                 scene.scene_details?.scene_type === "interview_question";

    // 퍼포먼스 브레이크 (콩파민 등)는 자막 표시
    const isPerformanceNoSub = scene.scene_details?.is_performance &&
                               !scene.narration &&
                               !dialogue.script &&
                               !dialogue.interviewer &&
                               !dialogue["땅콩"];

    // 씬3은 긴 문장이므로 3줄 처리 플래그
    const maxLines = (sceneNum === 3) ? 3 : 2;

    if (narration && !isPerformanceNoSub) {
      subtitles.push({
        start: currentTime + 0.3,
        end: currentTime + duration - 0.3,
        text: narration,
        text_english: narrationEnglish,
        speaker: isInterviewQuestion ? "interviewer" : "main",
        scene_index: sceneNum,
        max_lines: maxLines,
      });
    }

    currentTime += duration;
  }

  return subtitles;
}

// =====================
// FFmpeg 합성
// =====================
async function combineWithFFmpeg(videoFiles, videoDurations, scriptData, outputPath) {
  console.log("🎬 FFmpeg 합성 시작...");

  // 바이럴 타이틀 (클릭 유도)
  const title = "도파민 말고 콩파민! 신예 비트박서 댕댕이";
  const channelName = "비트 까는 땅콩이";
  const subtitles = generateSubtitles(scriptData, videoDurations);
  const totalDuration = videoDurations.reduce((a, b) => a + b, 0);

  console.log(`\n📊 합성 정보:`);
  console.log(`  - 타이틀: ${title}`);
  console.log(`  - 채널명: ${channelName}`);
  console.log(`  - 영상 수: ${videoFiles.length}`);
  console.log(`  - 총 길이: ${totalDuration.toFixed(1)}초`);
  console.log(`  - 자막 수: ${subtitles.length}`);

  // 임시 디렉토리
  const tempDir = path.join(OUTPUT_DIR, "temp_ffmpeg");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Step 1: 각 영상을 같은 해상도/코덱으로 변환
  console.log("\n📐 영상 정규화 중...");
  const normalizedVideos = [];
  const videoHeight = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.video_height_percent / 100);

  for (let i = 0; i < videoFiles.length; i++) {
    const normalizedPath = path.join(tempDir, `normalized_${i}.mp4`);

    const cmd = `ffmpeg -y -i "${videoFiles[i]}" \
      -vf "scale=1080:${videoHeight}:force_original_aspect_ratio=decrease,pad=1080:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
      -c:v libx264 -preset fast -crf 18 \
      -c:a aac -b:a 192k -ar 44100 -ac 2 \
      -r 30 \
      "${normalizedPath}" 2>&1`;

    console.log(`  - 씬${i + 1} 정규화...`);
    try {
      execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
      normalizedVideos.push(normalizedPath);
    } catch (error) {
      console.error(`  ❌ 씬${i + 1} 정규화 실패:`, error.message);
    }
  }

  // Step 2: 영상 연결
  console.log("\n🔗 영상 연결 중...");
  const concatListPath = path.join(tempDir, "concat_list.txt");
  const concatContent = normalizedVideos.map(v => `file '${v}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  const concatenatedPath = path.join(tempDir, "concatenated.mp4");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}" 2>&1`,
    { maxBuffer: 50 * 1024 * 1024 });

  // Step 3: 텍스트 오버레이 적용
  console.log("\n🎨 텍스트 오버레이 적용 중...");

  const videoY = Math.round((PEANUT_STYLE.height - videoHeight) / 2);
  const headerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.header.y_percent / 100);
  const footerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.footer.y_percent / 100);

  // 자막 필터 생성 (2~3줄 처리)
  let subtitleFilters = "";
  if (subtitles && subtitles.length > 0) {
    subtitles.forEach((sub) => {
      let startTime = sub.start || 0;
      let endTime = sub.end || (startTime + 2);

      if (startTime >= totalDuration) return;
      if (endTime > totalDuration) endTime = totalDuration;
      if (startTime < 0) startTime = 0;

      const isInterviewer = sub.speaker === "interviewer";
      const maxLines = sub.max_lines || 2;

      // 스타일 선택
      const subStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer : PEANUT_STYLE.subtitle;
      const subEngStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer_english : PEANUT_STYLE.subtitle_english;
      const baseSubY = Math.round(PEANUT_STYLE.height * subStyle.y_percent / 100);
      const baseEngY = Math.round(PEANUT_STYLE.height * subEngStyle.y_percent / 100);
      const lineHeight = subStyle.font_size + 8;
      const engLineHeight = subEngStyle.font_size + 5;

      // 한글 자막 (2~3줄 처리)
      const korLines = splitSubtitleLines(sub.text || "", maxLines);
      if (korLines.length > 0) {
        // 여러 줄일 때 위치 조정 (위로 올림)
        const korStartY = korLines.length > 1 ? baseSubY - ((korLines.length - 1) * lineHeight / 2) : baseSubY;

        korLines.forEach((line, idx) => {
          let escapedLine = escapeText(line);
          if (idx === 0 && isInterviewer) {
            escapedLine = `Q\\: ${escapedLine}`;
          }
          const lineY = korStartY + (idx * lineHeight);
          subtitleFilters += `,drawtext=text='${escapedLine}':fontfile='${subStyle.font}':fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${startTime},${endTime})'`;
        });
      }

      // 영어 자막 (길면 2줄 처리)
      const engLines = splitEnglishSubtitleLines(sub.text_english || "");
      if (engLines.length > 0) {
        // 한글 자막 바로 아래에 영어 자막 (고정 위치 사용, 푸터와 겹치지 않도록)
        const korLineCount = korLines.length || 1;
        // 한글 자막 마지막 줄 위치 + 여백
        const lastKorLineY = (korLines.length > 1 ? baseSubY - ((korLines.length - 1) * lineHeight / 2) : baseSubY) + ((korLineCount - 1) * lineHeight);
        const engStartY = lastKorLineY + lineHeight + 5; // 한글 자막 아래 5px 여백

        // 푸터 위치와 충돌 체크 (푸터 Y 위치의 90% 지점까지만 허용)
        const footerSafeY = Math.round(PEANUT_STYLE.height * (PEANUT_STYLE.footer.y_percent - 8) / 100);

        engLines.forEach((line, idx) => {
          let escapedLine = escapeText(line);
          if (idx === 0 && isInterviewer) {
            escapedLine = `Q\\: ${escapedLine}`;
          }
          let lineY = engStartY + (idx * engLineHeight);
          // 푸터와 겹치면 위로 조정
          if (lineY > footerSafeY) {
            lineY = footerSafeY - ((engLines.length - 1 - idx) * engLineHeight);
          }
          subtitleFilters += `,drawtext=text='${escapedLine}':fontfile='${subEngStyle.font}':fontsize=${subEngStyle.font_size}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${startTime},${endTime})'`;
        });
      }
    });
  }

  // 상단 타이틀 (2줄 처리)
  const titleLines = splitHeaderLines(title || "", PEANUT_STYLE.header.max_chars_per_line || 12);
  const titleLineHeight = PEANUT_STYLE.header.font_size + 10;
  let headerFilters = "";
  if (titleLines.length > 0) {
    const titleStartY = titleLines.length > 1 ? headerY : headerY;
    titleLines.forEach((line, idx) => {
      const escapedLine = escapeText(line);
      const lineY = titleStartY + (idx * titleLineHeight);
      headerFilters += `drawtext=text='${escapedLine}':fontfile='${PEANUT_STYLE.header.font}':fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${lineY},`;
    });
  }

  const escapedChannel = escapeText(channelName || "");

  // 최종 필터
  const filterComplex = `
    color=black:s=${PEANUT_STYLE.width}x${PEANUT_STYLE.height}:d=${totalDuration}[bg];
    [1:v]scale=${PEANUT_STYLE.width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${PEANUT_STYLE.width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
    [bg][video]overlay=0:${videoY}[combined];
    [combined]${headerFilters}drawtext=text='${escapedChannel}':fontfile='${PEANUT_STYLE.footer.font}':fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}${subtitleFilters}[out]
  `.replace(/\n/g, "").replace(/\s+/g, " ").trim();

  const finalCmd = `ffmpeg -y \
    -f lavfi -i "color=black:s=${PEANUT_STYLE.width}x${PEANUT_STYLE.height}:d=${totalDuration}" \
    -i "${concatenatedPath}" \
    -filter_complex "${filterComplex}" \
    -map "[out]" -map 1:a \
    -c:v libx264 -preset slow -crf 18 \
    -c:a aac -b:a 192k \
    -shortest \
    "${outputPath}" 2>&1`;

  console.log("🎥 최종 렌더링 중...");
  execSync(finalCmd, { maxBuffer: 100 * 1024 * 1024 });

  // 임시 파일 정리
  console.log("🧹 임시 파일 정리...");
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log("✅ FFmpeg 합성 완료!");
  return outputPath;
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log("🚀 Beatbox Sample FFmpeg 영상 합성 시작\n");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 스크립트 데이터 로드
  console.log("📄 스크립트 데이터 로드 중...");
  const scriptData = loadScriptData();
  console.log(`  - 폴더명: ${scriptData.folder_name}`);
  console.log(`  - 씬 수: ${scriptData.total_scenes}`);

  // 2. 영상 파일 로드
  console.log("\n📁 영상 파일 로드 중...");
  const videoFiles = loadVideoFiles();
  console.log(`  - 발견된 영상: ${videoFiles.length}개`);
  videoFiles.forEach((f, i) => console.log(`    ${i + 1}. ${path.basename(f)}`));

  // 3. 영상 길이 확인
  console.log("\n📏 영상 길이 확인 중...");
  const videoDurations = videoFiles.map((v, i) => {
    const duration = getVideoDuration(v);
    console.log(`  - 씬${i + 1}: ${duration.toFixed(1)}초`);
    return duration;
  });

  // 4. FFmpeg 합성
  const outputPath = path.join(OUTPUT_DIR, `beatbox_combined_${Date.now()}.mp4`);
  await combineWithFFmpeg(videoFiles, videoDurations, scriptData, outputPath);

  // 5. 결과 확인
  const result = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,bit_rate -of json "${outputPath}"`,
    { encoding: "utf8" }
  );
  const videoInfo = JSON.parse(result).streams[0];

  console.log("\n✨ 완료!");
  console.log(`  - 출력: ${outputPath}`);
  console.log(`  - 해상도: ${videoInfo.width}x${videoInfo.height}`);
  console.log(`  - 비트레이트: ${(videoInfo.bit_rate / 1000000).toFixed(1)} Mbps`);
}

main().catch(console.error);
