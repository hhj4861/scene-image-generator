/**
 * 두 개의 영상을 조합하여 Creatomate 템플릿 적용 테스트
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import { Readable } from "stream";

// =====================
// 설정
// =====================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CREATOMATE_API_KEY = process.env.CREATOMATE_API_KEY || "5bad4e3eb03b4fb391fc5b0085bb8a05d7abab1be8b8c1b88bde1c29a175f4f5f230cbede093b2cdd3575740655cc262";

// 입력 영상 (두 개)
const INPUT_VIDEOS = [
  "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/voice_samples/___202511301627_8z3p6.mp4",
  "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/voice_samples/_video_style__202511301628_sniww.mp4"
];

const OUTPUT_DIR = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output";

// GCS 설정
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const GCS_KEY_PATH = "/Users/admin/Downloads/mcp-test-457809-ac40560e68e7.json";

// 땅콩이 스타일 설정
const PEANUT_STYLE = {
  header: {
    font_family: "Black Han Sans",
    font_size: "6.5 vw",
    fill_color: "#FFF8E7",
    stroke_color: "#8B4513",
    stroke_width: "1.8 vw",
    y: "6%",
    height: "15%",
  },
  subtitle: {
    font_family: "Noto Sans KR",
    font_size: "5 vw",
    font_weight: "700",
    fill_color: "#FFFAF0",
    stroke_color: "#4A3728",
    stroke_width: "1.2 vw",
    y: "76%",
  },
  subtitle_english: {
    font_family: "Noto Sans",
    font_size: "3.2 vw",
    font_weight: "500",
    fill_color: "#E8E8E8",
    stroke_color: "#3D3D3D",
    stroke_width: "0.8 vw",
    y: "83%",
  },
  footer: {
    font_family: "Black Han Sans",
    font_size: "9 vw",
    fill_color: "#FF7F50",
    stroke_color: "#5D3A1A",
    stroke_width: "2.2 vw",
    y: "93%",
  },
  video: {
    width: "100%",
    height: "75%",
    y: "50%",
  },
};

// =====================
// 1. 영상 길이 확인
// =====================
async function getVideoDuration(videoPath) {
  const { execSync } = await import("child_process");
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf8" }
    );
    return parseFloat(result.trim());
  } catch (error) {
    console.error(`영상 길이 확인 실패: ${videoPath}`);
    return 8; // 기본값
  }
}

// =====================
// 2. Gemini로 영상 분석
// =====================
async function analyzeVideosWithGemini(videoPaths) {
  console.log("📹 Gemini로 영상들 분석 중...");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // 모든 영상을 base64로 변환
  const videoContents = videoPaths.map((videoPath, idx) => {
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBase64 = videoBuffer.toString("base64");
    return {
      inlineData: {
        mimeType: "video/mp4",
        data: videoBase64,
      },
    };
  });

  const prompt = `당신은 바이럴 콘텐츠 전문가입니다. 이 ${videoPaths.length}개의 영상을 분석해서 하나의 콘텐츠로 만들어주세요!

★★★ 바이럴 콘텐츠 규칙 ★★★

1. **타이틀**: 클릭을 부르는 자극적이고 재밌는 제목
   - 예: "헬창 강아지한테 운동 혼나는 중ㅋㅋㅋ", "PT받다 잠든 강아지 레전드"
   - 이모지 1-2개 허용, ㅋㅋㅋ, ;;; 등 인터넷 밈 활용

2. **하단 채널명 (footer_text)**: 영상 컨셉에 맞는 재밌는 이름 (땅콩이 포함 필수!)
   - 예: "땅콩이 헬스장", "땅콩PT", "땅콩이 트레이너"
   - 단순한 "땅콩이네" 같은 밋밋한 이름 금지!

3. **자막**: 각 영상별로 재미있는 자막 생성
   - 영상1의 자막은 start: 0부터 시작
   - 영상2의 자막은 영상1 길이 이후부터 시작
   - 의성어/의태어 적극 활용

★★★ 자막 규칙 (중요!) ★★★
- 자막은 절대 시간이 겹치면 안 됩니다!
- 영상이 연결되므로 전체 스토리를 고려해서 자막 생성

JSON 형식:
{
  "summary": "전체 영상 요약",
  "title": "바이럴 타이틀",
  "channel_name": "재밌는 채널명 (땅콩이 포함)",
  "video_durations": [영상1길이, 영상2길이],
  "subtitles": [
    {"start": 0, "end": 2, "text": "첫번째 자막", "text_english": "First subtitle", "video_index": 0},
    {"start": 8, "end": 10, "text": "두번째 영상 자막", "text_english": "Second video subtitle", "video_index": 1}
  ],
  "mood": "funny",
  "keywords": ["키워드1", "키워드2"]
}

JSON만 반환해주세요.`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      ...videoContents,
    ]);

    const responseText = result.response.text();
    console.log("Gemini 응답:", responseText.substring(0, 500));

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error("JSON 파싱 실패");
  } catch (error) {
    console.error("Gemini 분석 실패:", error.message);
    return {
      summary: "귀여운 강아지 영상",
      title: "땅콩이의 하루 브이로그🐶",
      channel_name: "땅콩이 일상",
      subtitles: [],
      mood: "cute",
      keywords: ["강아지", "귀여움"],
    };
  }
}

// =====================
// 3. GCS에 영상 업로드
// =====================
async function uploadToGCS(videoPath, index) {
  console.log(`☁️ GCS에 영상 ${index + 1} 업로드 중...`);

  const keyJson = JSON.parse(fs.readFileSync(GCS_KEY_PATH, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
  });

  const storage = google.storage({ version: "v1", auth });

  const videoBuffer = fs.readFileSync(videoPath);
  const filename = `test_creatomate/combine_${index}_${Date.now()}.mp4`;

  const bufferStream = new Readable({ read() {} });
  bufferStream.push(videoBuffer);
  bufferStream.push(null);

  await storage.objects.insert({
    bucket: GCS_BUCKET,
    name: filename,
    media: { mimeType: "video/mp4", body: bufferStream },
    requestBody: { name: filename, contentType: "video/mp4" },
  });

  const gcsUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`;
  console.log(`✅ 업로드 완료: ${gcsUrl}`);
  return gcsUrl;
}

// =====================
// 4. Creatomate 렌더링 (두 영상 조합)
// =====================
async function renderWithCreatomate(videoUrls, videoDurations, analysisResult) {
  console.log("🎬 Creatomate 렌더링 시작...");

  const { title, channel_name, subtitles } = analysisResult;
  const totalDuration = videoDurations.reduce((a, b) => a + b, 0);

  console.log(`📊 영상 정보:`);
  console.log(`  - 영상1: ${videoDurations[0]}초`);
  console.log(`  - 영상2: ${videoDurations[1]}초`);
  console.log(`  - 총 길이: ${totalDuration}초`);

  const elements = [];

  // 1. 검은 배경
  elements.push({
    type: "shape",
    shape: "rectangle",
    width: "100%",
    height: "100%",
    fill_color: "#000000",
    time: 0,
  });

  // 2. 첫 번째 비디오
  elements.push({
    type: "video",
    source: videoUrls[0],
    time: 0,
    duration: videoDurations[0],
    width: PEANUT_STYLE.video.width,
    height: PEANUT_STYLE.video.height,
    x: "50%",
    y: PEANUT_STYLE.video.y,
    x_anchor: "50%",
    y_anchor: "50%",
    fit: "cover",
  });

  // 3. 두 번째 비디오 (첫 번째 이후에 시작)
  elements.push({
    type: "video",
    source: videoUrls[1],
    time: videoDurations[0],
    duration: videoDurations[1],
    width: PEANUT_STYLE.video.width,
    height: PEANUT_STYLE.video.height,
    x: "50%",
    y: PEANUT_STYLE.video.y,
    x_anchor: "50%",
    y_anchor: "50%",
    fit: "cover",
  });

  // 4. 오디오 (두 영상 모두)
  elements.push({
    type: "audio",
    source: videoUrls[0],
    time: 0,
    duration: videoDurations[0],
    volume: "100%",
  });

  elements.push({
    type: "audio",
    source: videoUrls[1],
    time: videoDurations[0],
    duration: videoDurations[1],
    volume: "100%",
  });

  // 5. 상단 타이틀
  elements.push({
    type: "text",
    text: title,
    time: 0,
    duration: totalDuration,
    width: "95%",
    height: PEANUT_STYLE.header.height,
    x: "50%",
    y: PEANUT_STYLE.header.y,
    x_anchor: "50%",
    y_anchor: "0%",
    x_alignment: "50%",
    y_alignment: "50%",
    font_family: PEANUT_STYLE.header.font_family,
    font_size: PEANUT_STYLE.header.font_size,
    font_weight: "400",
    fill_color: PEANUT_STYLE.header.fill_color,
    stroke_color: PEANUT_STYLE.header.stroke_color,
    stroke_width: PEANUT_STYLE.header.stroke_width,
    text_align: "center",
    line_height: "120%",
  });

  // 6. 하단 채널명
  elements.push({
    type: "text",
    text: channel_name,
    time: 0,
    duration: totalDuration,
    width: "100%",
    x: "50%",
    y: PEANUT_STYLE.footer.y,
    x_anchor: "50%",
    y_anchor: "50%",
    x_alignment: "50%",
    font_family: PEANUT_STYLE.footer.font_family,
    font_size: PEANUT_STYLE.footer.font_size,
    font_weight: "400",
    fill_color: PEANUT_STYLE.footer.fill_color,
    stroke_color: PEANUT_STYLE.footer.stroke_color,
    stroke_width: PEANUT_STYLE.footer.stroke_width,
    text_align: "center",
    line_height: "115%",
  });

  // 7. 자막 처리
  if (subtitles && subtitles.length > 0) {
    const sortedSubs = [...subtitles].sort((a, b) => (a.start || 0) - (b.start || 0));
    const nonOverlappingSubs = [];
    let lastEnd = 0;

    for (const sub of sortedSubs) {
      let startTime = Math.max(sub.start || 0, lastEnd);
      let endTime = sub.end || (startTime + 2);

      if (endTime - startTime < 1) endTime = startTime + 1;
      if (startTime >= totalDuration) continue;
      if (endTime > totalDuration) endTime = totalDuration;

      nonOverlappingSubs.push({ ...sub, start: startTime, end: endTime });
      lastEnd = endTime;
    }

    console.log("📝 자막 타이밍:");
    nonOverlappingSubs.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.start.toFixed(1)}-${s.end.toFixed(1)}초] ${s.text?.substring(0, 20)}...`);
    });

    for (const sub of nonOverlappingSubs) {
      // 한글 자막
      if (sub.text) {
        elements.push({
          type: "text",
          text: sub.text,
          time: sub.start,
          duration: sub.end - sub.start,
          width: "95%",
          x: "50%",
          y: PEANUT_STYLE.subtitle.y,
          x_anchor: "50%",
          y_anchor: "50%",
          font_family: PEANUT_STYLE.subtitle.font_family,
          font_size: PEANUT_STYLE.subtitle.font_size,
          font_weight: PEANUT_STYLE.subtitle.font_weight,
          fill_color: PEANUT_STYLE.subtitle.fill_color,
          stroke_color: PEANUT_STYLE.subtitle.stroke_color,
          stroke_width: PEANUT_STYLE.subtitle.stroke_width,
          text_align: "center",
          line_height: "125%",
        });
      }

      // 영어 자막
      if (sub.text_english) {
        elements.push({
          type: "text",
          text: sub.text_english,
          time: sub.start,
          duration: sub.end - sub.start,
          width: "95%",
          x: "50%",
          y: PEANUT_STYLE.subtitle_english.y,
          x_anchor: "50%",
          y_anchor: "50%",
          font_family: PEANUT_STYLE.subtitle_english.font_family,
          font_size: PEANUT_STYLE.subtitle_english.font_size,
          font_weight: PEANUT_STYLE.subtitle_english.font_weight,
          fill_color: PEANUT_STYLE.subtitle_english.fill_color,
          stroke_color: PEANUT_STYLE.subtitle_english.stroke_color,
          stroke_width: PEANUT_STYLE.subtitle_english.stroke_width,
          text_align: "center",
        });
      }
    }
  }

  // Creatomate API 호출
  console.log("📤 Creatomate API 호출 중...");
  console.log(`Elements 수: ${elements.length}`);

  const createResponse = await axios({
    method: "POST",
    url: "https://api.creatomate.com/v1/renders",
    headers: {
      Authorization: `Bearer ${CREATOMATE_API_KEY}`,
      "Content-Type": "application/json",
    },
    data: {
      output_format: "mp4",
      // ★ 고화질 설정
      render_scale: 1,  // 1 = 원본 크기 유지
      max_width: 1080,
      max_height: 1920,
      source: {
        output_format: "mp4",
        width: 1080,
        height: 1920,
        frame_rate: 30,
        duration: totalDuration,
        // ★ 비트레이트 설정 (높은 품질)
        video_bit_rate: "8 Mbps",
        pixel_format: "yuv420p",
        elements,
      },
    },
  });

  const renderId = createResponse.data[0].id;
  console.log(`Render ID: ${renderId}`);

  // 완료 대기
  let renderUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`⏳ 렌더링 대기 중... (${(i + 1) * 5}초)`);

    const statusResponse = await axios({
      method: "GET",
      url: `https://api.creatomate.com/v1/renders/${renderId}`,
      headers: { Authorization: `Bearer ${CREATOMATE_API_KEY}` },
    });

    if (statusResponse.data.status === "succeeded") {
      renderUrl = statusResponse.data.url;
      console.log("✅ 렌더링 완료!");
      break;
    }

    if (statusResponse.data.status === "failed") {
      throw new Error(`렌더링 실패: ${statusResponse.data.error_message}`);
    }
  }

  if (!renderUrl) throw new Error("렌더링 타임아웃");
  return renderUrl;
}

// =====================
// 5. 결과 다운로드
// =====================
async function downloadResult(url, outputPath) {
  console.log("📥 결과 다운로드 중...");

  const response = await axios({
    method: "GET",
    url,
    responseType: "arraybuffer",
  });

  fs.writeFileSync(outputPath, Buffer.from(response.data));
  console.log(`✅ 저장 완료: ${outputPath}`);
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log("🚀 두 영상 조합 Creatomate 테스트 시작\n");

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. 영상 길이 확인
  console.log("📏 영상 길이 확인 중...");
  const videoDurations = [];
  for (const videoPath of INPUT_VIDEOS) {
    const duration = await getVideoDuration(videoPath);
    videoDurations.push(duration);
    console.log(`  - ${path.basename(videoPath)}: ${duration.toFixed(1)}초`);
  }

  // 2. Gemini로 영상 분석
  const analysisResult = await analyzeVideosWithGemini(INPUT_VIDEOS);
  analysisResult.video_durations = videoDurations;

  console.log("\n📊 분석 결과:");
  console.log(`  - 타이틀: ${analysisResult.title}`);
  console.log(`  - 채널명: ${analysisResult.channel_name}`);
  console.log(`  - 자막 수: ${analysisResult.subtitles?.length || 0}`);

  // 분석 결과 저장
  const analysisPath = path.join(OUTPUT_DIR, "combine_analysis_result.json");
  fs.writeFileSync(analysisPath, JSON.stringify(analysisResult, null, 2));

  // 3. GCS에 영상 업로드
  const videoUrls = [];
  for (let i = 0; i < INPUT_VIDEOS.length; i++) {
    const url = await uploadToGCS(INPUT_VIDEOS[i], i);
    videoUrls.push(url);
  }

  // 4. Creatomate 렌더링
  const renderUrl = await renderWithCreatomate(videoUrls, videoDurations, analysisResult);
  console.log(`\n🎥 렌더링 URL: ${renderUrl}`);

  // 5. 결과 다운로드
  const outputPath = path.join(OUTPUT_DIR, `combined_peanut_${Date.now()}.mp4`);
  await downloadResult(renderUrl, outputPath);

  console.log("\n✨ 완료!");
  console.log(`  - 입력1: ${INPUT_VIDEOS[0]}`);
  console.log(`  - 입력2: ${INPUT_VIDEOS[1]}`);
  console.log(`  - 출력: ${outputPath}`);
  console.log(`  - 타이틀: ${analysisResult.title}`);
  console.log(`  - 채널명: ${analysisResult.channel_name}`);
}

main().catch(console.error);
