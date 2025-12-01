/**
 * FFmpeg로 영상 합성 (고화질 로컬 처리)
 * - 여러 영상 연결
 * - 상단 타이틀 + 하단 채널명 + 자막 오버레이
 * - 1080x1920 Full HD 출력
 */

import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";

// =====================
// 설정
// =====================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 입력 영상 (단일 영상도 지원)
const INPUT_VIDEOS = [
  "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/voice_samples/Nov_30__1025_24s_202511302223_2o7ha.mp4"
];

const OUTPUT_DIR = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output";

// =====================
// 수동 설정 (자동 생성 대신 사용)
// =====================
const MANUAL_CONFIG = {
  title: null,  // null이면 AI가 바이럴 타이틀 생성
  channel_name: null,  // null이면 AI가 채널명 생성
  // 자막: 수동 지정
  subtitles: [
    // === 인사 + 소개 (1-6초) ===
    { start: 1.0, end: 2.5, text: "여러분 안녕하세요 땅콩입니다", text_english: "Hello everyone, I am Peanut" },
    { start: 2.5, end: 4.5, text: "오늘은 스시 먹방이에요", text_english: "Today is sushi mukbang" },
    { start: 4.5, end: 6.0, text: "드디어 먹어도 된대요", text_english: "Finally I can eat" },
    { start: 6.0, end: 8.0, text: "그럼 먹어볼게요", text_english: "Let me try it" },

    // === ASMR 초밥 (8-16초) ===
    { start: 8.0, end: 12.0, text: "냠냠냠...", text_english: "nom nom nom..." },
    { start: 12.0, end: 16.0, text: "으음~ 맛있다", text_english: "Mmm~ delicious" },

    // === ASMR 고구마튀김 (16-24초) ===
    { start: 16.0, end: 20.0, text: "바삭바삭...", text_english: "crispy crispy..." },
    { start: 20.0, end: 24.0, text: "고구마튀김 최고!", text_english: "Sweet potato tempura is the best!" },
  ],
};

// 스타일 설정 (이전 땅콩이 템플릿 + img.png 자막 스타일)
const PEANUT_STYLE = {
  // 출력 해상도
  width: 1080,
  height: 1920,

  // 영상 영역 (75%)
  video_height_percent: 75,

  // 상단 타이틀 (이전 템플릿: 크림색 + 갈색 외곽선)
  header: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 70,
    color: "0xFFF8E7",       // 크림색
    border_color: "0x8B4513", // 갈색 외곽선
    border_width: 4,
    y_percent: 6,
  },

  // 하단 채널명 (이전 템플릿: 코랄 오렌지 + 다크 브라운)
  footer: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 97,
    color: "0xFF7F50",       // 코랄 오렌지
    border_color: "0x5D3A1A", // 다크 브라운
    border_width: 5,
    y_percent: 93,
  },

  // 한글 자막 (흰색 + 검은 외곽선 - 가독성 향상)
  subtitle: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 50,
    color: "0xFFFFFF",       // 흰색
    border_color: "0x000000", // 검은색 외곽선
    border_width: 4,
    y_percent: 73,
  },

  // 영어 자막 (연한 노란색, 검은 외곽선)
  subtitle_english: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 30,
    color: "0xFFFF99",       // 연한 노란색
    border_color: "0x000000", // 검은색 외곽선
    border_width: 2,
    y_percent: 78,
  },

  // 인터뷰어 자막 (하늘색 + 검은 외곽선)
  subtitle_interviewer: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 50,
    color: "0x00FFFF",       // 시안(청록색) - 더 밝게
    border_color: "0x000000", // 검은색 외곽선
    border_width: 4,
    y_percent: 73,
  },
  subtitle_interviewer_english: {
    font: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    font_size: 30,
    color: "0x99FFFF",       // 연한 시안
    border_color: "0x000000", // 검은색 외곽선
    border_width: 2,
    y_percent: 78,
  },
};

// =====================
// 1. 영상 길이 확인
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
    return 8;
  }
}

// =====================
// 2. Gemini로 영상 분석
// =====================
async function analyzeVideosWithGemini(videoPaths) {
  console.log("📹 Gemini로 영상들 분석 중...");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  // gemini-2.0-flash-exp: 더 정확한 음성 인식
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const videoContents = videoPaths.map((videoPath) => {
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBase64 = videoBuffer.toString("base64");
    return {
      inlineData: {
        mimeType: "video/mp4",
        data: videoBase64,
      },
    };
  });

  // 총 영상 길이 계산
  const totalDuration = videoPaths.reduce((sum, vp) => sum + getVideoDuration(vp), 0);

  const prompt = `영상 분석 후 바이럴 콘텐츠 정보를 생성해주세요.

영상 길이: ${totalDuration.toFixed(1)}초

★★★ 바이럴 타이틀 규칙 ★★★
- 클릭을 부르는 자극적이고 재밌는 제목!
- 15자 이내
- ㅋㅋㅋ, ;;, ?! 등 인터넷 밈 활용
- 예시: "스시 처음 먹어본 댕댕이 반응ㅋㅋ", "먹방 중 멈출 수 없는 강아지", "이 표정 실화임??"

★★★ 채널명 규칙 ★★★
- 8자 이내
- 영상 컨셉에 맞는 재밌는 이름
- 예시: "땅콩TV", "먹방땅콩", "땅콩일상", "댕댕스타"

★★★ 자막 규칙 ★★★
- 실제 음성 전사
- 자막당 10-15자
- 이모지 금지

JSON만 출력:
{
  "summary": "요약",
  "title": "바이럴되는 자극적 타이틀",
  "channel_name": "채널명",
  "subtitles": [
    {"start": 0.5, "end": 2.5, "text": "대사", "text_english": "English"}
  ],
  "mood": "funny",
  "keywords": ["키워드"]
}`;

  try {
    const result = await model.generateContent([{ text: prompt }, ...videoContents]);
    const responseText = result.response.text();
    console.log("Gemini 응답:", responseText.substring(0, 500));

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // 자막 타이밍 스케일링 (Gemini가 영상 속도를 잘못 분석하는 경우 보정)
      if (parsed.subtitles && parsed.subtitles.length > 0) {
        const lastSubEnd = Math.max(...parsed.subtitles.map(s => s.end || 0));

        // 마지막 자막이 영상 길이보다 길면 스케일링 적용
        if (lastSubEnd > totalDuration * 1.1) {
          const scale = totalDuration / lastSubEnd;
          console.log(`⚠️ 자막 타이밍 보정: ${lastSubEnd.toFixed(1)}초 → ${totalDuration.toFixed(1)}초 (scale: ${scale.toFixed(2)})`);

          parsed.subtitles = parsed.subtitles.map(sub => ({
            ...sub,
            start: Math.round(sub.start * scale * 100) / 100,
            end: Math.round(sub.end * scale * 100) / 100,
          }));
        }
      }

      return parsed;
    }
    throw new Error("JSON 파싱 실패");
  } catch (error) {
    console.error("Gemini 분석 실패:", error.message);
    return {
      summary: "귀여운 강아지 영상",
      title: "땅콩이 일상",
      channel_name: "땅콩TV",
      subtitles: [],
      mood: "cute",
      keywords: ["강아지", "귀여움"],
    };
  }
}

// =====================
// 3. 이모티콘 제거 함수
// =====================
function removeEmojis(text) {
  if (!text) return "";
  // 이모티콘 유니코드 범위 제거
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")  // 이모티콘
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")  // 기호 및 픽토그램
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")  // 교통/지도
    .replace(/[\u{1F700}-\u{1F77F}]/gu, "")  // 연금술 기호
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, "")  // 기하학적 도형
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, "")  // 보조 화살표
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")  // 보조 기호
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")  // 체스
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")  // 기호 및 픽토그램 확장
    .replace(/[\u{2600}-\u{26FF}]/gu, "")    // 기타 기호
    .replace(/[\u{2700}-\u{27BF}]/gu, "")    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")    // 변형 선택자
    .replace(/[\u{200D}]/gu, "")              // Zero Width Joiner
    .trim();
}

// =====================
// 4. 텍스트 이스케이프 (ffmpeg용)
// =====================
function escapeText(text) {
  // 먼저 이모티콘 제거
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
// 4. FFmpeg 합성
// =====================
async function combineWithFFmpeg(videoInfos, videoDurations, analysisResult, outputPath) {
  console.log("🎬 FFmpeg 합성 시작...");

  const { title, channel_name, subtitles } = analysisResult;
  const totalDuration = videoDurations.reduce((a, b) => a + b, 0);

  // 임시 파일들
  const tempDir = path.join(OUTPUT_DIR, "temp_ffmpeg");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Step 1: 각 영상을 같은 해상도/코덱으로 변환
  console.log("📐 영상 정규화 중...");
  const normalizedVideos = [];

  for (let i = 0; i < videoInfos.length; i++) {
    const normalizedPath = path.join(tempDir, `normalized_${i}.mp4`);

    // 영상을 1080x1920으로 변환, 중앙 75% 영역에 배치
    const videoHeight = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.video_height_percent / 100);
    const videoY = Math.round((PEANUT_STYLE.height - videoHeight) / 2);

    const cmd = `ffmpeg -y -i "${videoInfos[i]}" \
      -vf "scale=1080:${videoHeight}:force_original_aspect_ratio=decrease,pad=1080:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
      -c:v libx264 -preset fast -crf 18 \
      -c:a aac -b:a 192k -ar 44100 -ac 2 \
      -r 30 \
      "${normalizedPath}" 2>&1`;

    console.log(`  - 영상 ${i + 1} 정규화...`);
    execSync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    normalizedVideos.push(normalizedPath);
  }

  // Step 2: 영상 연결
  console.log("🔗 영상 연결 중...");
  const concatListPath = path.join(tempDir, "concat_list.txt");
  const concatContent = normalizedVideos.map(v => `file '${v}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  const concatenatedPath = path.join(tempDir, "concatenated.mp4");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatenatedPath}" 2>&1`,
    { maxBuffer: 50 * 1024 * 1024 });

  // Step 3: 검은 배경 + 영상 배치 + 텍스트 오버레이
  console.log("🎨 텍스트 오버레이 적용 중...");

  const videoHeight = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.video_height_percent / 100);
  const videoY = Math.round((PEANUT_STYLE.height - videoHeight) / 2);

  // y 위치 계산 (% → 픽셀)
  const headerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.header.y_percent / 100);
  const footerY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.footer.y_percent / 100);
  const subtitleY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.subtitle.y_percent / 100);
  const subtitleEnglishY = Math.round(PEANUT_STYLE.height * PEANUT_STYLE.subtitle_english.y_percent / 100);

  // 자막 필터 생성
  let subtitleFilters = "";
  if (subtitles && subtitles.length > 0) {
    const sortedSubs = [...subtitles].sort((a, b) => a.start - b.start);

    sortedSubs.forEach((sub) => {
      // 원본 타이밍 그대로 사용 (강제 조정 제거)
      let startTime = sub.start || 0;
      let endTime = sub.end || (startTime + 2);

      // 영상 길이 범위 내로 제한
      if (startTime >= totalDuration) return;
      if (endTime > totalDuration) endTime = totalDuration;
      if (startTime < 0) startTime = 0;

      const isInterviewer = sub.speaker === "interviewer";

      // 스타일 선택 (인터뷰어 vs 땅콩이)
      const subStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer : PEANUT_STYLE.subtitle;
      const subEngStyle = isInterviewer ? PEANUT_STYLE.subtitle_interviewer_english : PEANUT_STYLE.subtitle_english;
      const baseSubY = Math.round(PEANUT_STYLE.height * subStyle.y_percent / 100);
      const baseEngY = Math.round(PEANUT_STYLE.height * subEngStyle.y_percent / 100);

      // 한글 자막 (개행 처리: \n으로 분리하여 각각 drawtext)
      const textLines = (sub.text || "").split("\n");
      const lineHeight = subStyle.font_size + 10;
      // 2줄일 경우 위로 올려서 중앙 정렬
      const startY = textLines.length > 1 ? baseSubY - lineHeight / 2 : baseSubY;

      textLines.forEach((line, idx) => {
        const escapedLine = escapeText(line);
        if (escapedLine) {
          const lineY = startY + (idx * lineHeight);
          subtitleFilters += `,drawtext=text='${escapedLine}':fontfile='${subStyle.font}':fontsize=${subStyle.font_size}:fontcolor=${subStyle.color}:borderw=${subStyle.border_width}:bordercolor=${subStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${startTime},${endTime})'`;
        }
      });

      // 영어 자막 (개행 처리)
      const engLines = (sub.text_english || "").split("\n");
      const engLineHeight = subEngStyle.font_size + 5;
      // 한글 자막 줄 수에 따라 영어 자막 위치 조정
      const engStartY = baseEngY + ((textLines.length - 1) * lineHeight / 2);

      engLines.forEach((line, idx) => {
        const escapedLine = escapeText(line);
        if (escapedLine) {
          const lineY = engStartY + (idx * engLineHeight);
          subtitleFilters += `,drawtext=text='${escapedLine}':fontfile='${subEngStyle.font}':fontsize=${subEngStyle.font_size}:fontcolor=${subEngStyle.color}:borderw=${subEngStyle.border_width}:bordercolor=${subEngStyle.border_color}:x=(w-text_w)/2:y=${lineY}:enable='between(t,${startTime},${endTime})'`;
        }
      });
    });
  }

  const escapedChannel = escapeText(channel_name || "");

  // 타이틀 2줄 처리
  const titleLines = (title || "").split(/\\n|\n/);
  const titleLine1 = escapeText(titleLines[0] || "");
  const titleLine2 = escapeText(titleLines[1] || "");
  const headerY2 = headerY + PEANUT_STYLE.header.font_size + 10; // 두 번째 줄 위치

  // 타이틀 필터 (1줄 또는 2줄)
  let titleFilter = "";
  if (titleLine1) {
    titleFilter += `drawtext=text='${titleLine1}':fontfile='${PEANUT_STYLE.header.font}':fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${headerY}`;
  }
  if (titleLine2) {
    titleFilter += `,drawtext=text='${titleLine2}':fontfile='${PEANUT_STYLE.header.font}':fontsize=${PEANUT_STYLE.header.font_size}:fontcolor=${PEANUT_STYLE.header.color}:borderw=${PEANUT_STYLE.header.border_width}:bordercolor=${PEANUT_STYLE.header.border_color}:x=(w-text_w)/2:y=${headerY2}`;
  }

  // 최종 필터 (y 위치에 계산된 픽셀 값 사용)
  const filterComplex = `
    color=black:s=${PEANUT_STYLE.width}x${PEANUT_STYLE.height}:d=${totalDuration}[bg];
    [1:v]scale=${PEANUT_STYLE.width}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${PEANUT_STYLE.width}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[video];
    [bg][video]overlay=0:${videoY}[combined];
    [combined]${titleFilter},drawtext=text='${escapedChannel}':fontfile='${PEANUT_STYLE.footer.font}':fontsize=${PEANUT_STYLE.footer.font_size}:fontcolor=${PEANUT_STYLE.footer.color}:borderw=${PEANUT_STYLE.footer.border_width}:bordercolor=${PEANUT_STYLE.footer.border_color}:x=(w-text_w)/2:y=${footerY}${subtitleFilters}[out]
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
  execSync(finalCmd, { maxBuffer: 50 * 1024 * 1024 });

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
  console.log("🚀 FFmpeg 영상 합성 테스트 시작\n");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 영상 길이 확인
  console.log("📏 영상 길이 확인 중...");
  const videoDurations = INPUT_VIDEOS.map((v, i) => {
    const duration = getVideoDuration(v);
    console.log(`  - ${path.basename(v)}: ${duration.toFixed(1)}초`);
    return duration;
  });

  // 2. Gemini로 영상 분석 (자막만)
  const analysisResult = await analyzeVideosWithGemini(INPUT_VIDEOS);

  // 수동 설정 적용 (MANUAL_CONFIG가 있으면 덮어쓰기)
  const finalResult = {
    ...analysisResult,
    title: MANUAL_CONFIG.title || analysisResult.title,
    channel_name: MANUAL_CONFIG.channel_name || analysisResult.channel_name,
    subtitles: MANUAL_CONFIG.subtitles || analysisResult.subtitles,
  };

  console.log("\n📊 최종 설정:");
  console.log(`  - 타이틀: ${finalResult.title}`);
  console.log(`  - 채널명: ${finalResult.channel_name}`);
  console.log(`  - 자막 수: ${finalResult.subtitles?.length || 0}`);

  // 분석 결과 저장
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "ffmpeg_analysis_result.json"),
    JSON.stringify(finalResult, null, 2)
  );

  // 3. FFmpeg 합성
  const outputPath = path.join(OUTPUT_DIR, `ffmpeg_combined_${Date.now()}.mp4`);
  await combineWithFFmpeg(INPUT_VIDEOS, videoDurations, finalResult, outputPath);

  // 4. 결과 확인
  const result = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,bit_rate -of json "${outputPath}"`,
    { encoding: "utf8" }
  );
  const videoInfo = JSON.parse(result).streams[0];

  console.log("\n✨ 완료!");
  console.log(`  - 출력: ${outputPath}`);
  console.log(`  - 해상도: ${videoInfo.width}x${videoInfo.height}`);
  console.log(`  - 비트레이트: ${(videoInfo.bit_rate / 1000000).toFixed(1)} Mbps`);
  console.log(`  - 타이틀: ${analysisResult.title}`);
  console.log(`  - 채널명: ${analysisResult.channel_name}`);
}

main().catch(console.error);
