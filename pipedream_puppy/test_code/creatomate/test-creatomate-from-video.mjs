/**
 * 영상 기반 Creatomate 템플릿 테스트
 * - Gemini로 영상 분석하여 자막/타이틀/채널명 자동 생성
 * - GCS에 영상 업로드 후 Creatomate로 땅콩이 스타일 템플릿 적용
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

const INPUT_VIDEO = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/voice_samples/___202511301435_tr650.mp4";
const OUTPUT_DIR = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output";

// GCS 설정
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const GCS_KEY_PATH = "/Users/admin/Downloads/mcp-test-457809-ac40560e68e7.json";

// 땅콩이 스타일 설정
const PEANUT_STYLE = {
  header: {
    font_family: "Black Han Sans",
    font_size: "6.5 vw",  // 잘림 방지를 위해 축소
    fill_color: "#FFF8E7",
    stroke_color: "#8B4513",
    stroke_width: "1.8 vw",
    y: "6%",  // 상단 위치
    height: "15%",  // 여러 줄 허용
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
    font_size: "9 vw",  // 7 → 9 (더 크게)
    fill_color: "#FF7F50",
    stroke_color: "#5D3A1A",
    stroke_width: "2.2 vw",  // 외곽선도 키움
    y: "93%",  // 하단 위치
  },
  // 영상 크기 설정
  video: {
    width: "100%",
    height: "75%",  // 100% → 75% (영상 크기 축소)
    y: "50%",  // 중앙 배치
  },
};

// =====================
// 1. Gemini로 영상 분석 및 자막/타이틀 생성
// =====================
async function analyzeVideoWithGemini(videoPath) {
  console.log("📹 Gemini로 영상 분석 중...");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // 영상 파일을 base64로 읽기
  const videoBuffer = fs.readFileSync(videoPath);
  const videoBase64 = videoBuffer.toString("base64");

  const prompt = `당신은 바이럴 콘텐츠 전문가입니다. 이 영상을 분석해서 MZ세대가 열광할 콘텐츠로 만들어주세요!

★★★ 바이럴 콘텐츠 규칙 ★★★

1. **타이틀**: 클릭을 부르는 자극적이고 재밌는 제목
   - 예: "헬창 강아지한테 운동 혼나는 중ㅋㅋㅋ", "PT받다 잠든 강아지 레전드", "강아지가 나보다 운동 잘함;;;"
   - 이모지 1-2개 허용
   - ㅋㅋㅋ, ㅠㅠ, ;;; 등 인터넷 밈 활용

2. **하단 채널명 (footer_text)**: 영상 컨셉에 맞는 재밌는 이름 (땅콩이 포함 필수!)
   - 예: "땅콩이 헬스장", "땅콩PT", "땅콩이 트레이너", "땅콩이 코치", "땅콩이 gym"
   - 영상 내용과 연결되는 위트있는 이름으로!
   - 단순한 "땅콩이네" 같은 밋밋한 이름 금지!

3. **자막**: 재미있고 감정이 살아있는 자막
   - 의성어/의태어 적극 활용 (헉, 엥?, 뭐야ㅋㅋ)
   - 드라마틱한 표현

★★★ 자막 규칙 (중요!) ★★★
- 자막은 절대 시간이 겹치면 안 됩니다!
- 각 자막의 end 시간이 다음 자막의 start 시간보다 작거나 같아야 합니다

JSON 형식:
{
  "summary": "영상 요약",
  "title": "바이럴 타이틀 (재밌고 클릭 유도)",
  "channel_name": "영상 컨셉에 맞는 재밌는 채널명 (땅콩이 포함)",
  "subtitles": [
    {"start": 0, "end": 2, "text": "재밌는 자막", "text_english": "English subtitle"}
  ],
  "mood": "cute/funny/emotional",
  "keywords": ["키워드1", "키워드2"]
}

영상에 음성이 없으면 영상 내용을 바탕으로 재밌는 자막을 생성해주세요.
JSON만 반환해주세요.`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: "video/mp4",
          data: videoBase64,
        },
      },
    ]);

    const responseText = result.response.text();
    console.log("Gemini 응답:", responseText.substring(0, 500));

    // JSON 파싱
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error("JSON 파싱 실패");
  } catch (error) {
    console.error("Gemini 분석 실패:", error.message);

    // 기본값 반환
    return {
      summary: "귀여운 강아지 영상",
      title: "오늘의 땅콩이",
      channel_name: "땅콩이네",
      subtitles: [
        { start: 0, end: 8, text: "안녕하세요~", text_english: "Hello~" },
      ],
      mood: "cute",
      keywords: ["강아지", "귀여움", "일상"],
    };
  }
}

// =====================
// 2. GCS에 영상 업로드
// =====================
async function uploadToGCS(videoPath) {
  console.log("☁️ GCS에 영상 업로드 중...");

  const keyJson = JSON.parse(fs.readFileSync(GCS_KEY_PATH, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
  });

  const storage = google.storage({ version: "v1", auth });

  const videoBuffer = fs.readFileSync(videoPath);
  const filename = `test_creatomate/input_${Date.now()}.mp4`;

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
// 3. Creatomate 렌더링
// =====================
async function renderWithCreatomate(videoUrl, analysisResult) {
  console.log("🎬 Creatomate 렌더링 시작...");

  const { title, channel_name, subtitles } = analysisResult;
  const totalDuration = 8; // 8초 영상

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

  // 2. 메인 비디오 (축소 크기, 중앙 배치)
  elements.push({
    type: "video",
    source: videoUrl,
    time: 0,
    duration: totalDuration,
    width: PEANUT_STYLE.video.width,
    height: PEANUT_STYLE.video.height,
    x: "50%",
    y: PEANUT_STYLE.video.y,
    x_anchor: "50%",
    y_anchor: "50%",
    fit: "cover",
  });

  // 3. 오디오 (원본 영상에서)
  elements.push({
    type: "audio",
    source: videoUrl,
    time: 0,
    duration: totalDuration,
    volume: "100%",
  });

  // 4. 상단 타이틀 (땅콩이 스타일 - 센터 정렬, 여러 줄 허용)
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
    y_anchor: "0%",  // 상단 기준
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

  // 5. 하단 채널명 (땅콩이 스타일 - 센터 정렬)
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

  // 6. 자막 (땅콩이 스타일) - 겹치지 않도록 정렬
  // 자막 시간순 정렬 및 겹침 제거
  const sortedSubs = [...subtitles].sort((a, b) => (a.start || 0) - (b.start || 0));
  const nonOverlappingSubs = [];
  let lastEnd = 0;

  for (const sub of sortedSubs) {
    let startTime = Math.max(sub.start || 0, lastEnd);
    let endTime = sub.end || (startTime + 2);

    // 최소 1초 보장
    if (endTime - startTime < 1) {
      endTime = startTime + 1;
    }

    // 영상 길이 초과 방지
    if (startTime >= totalDuration) continue;
    if (endTime > totalDuration) endTime = totalDuration;

    nonOverlappingSubs.push({
      ...sub,
      start: startTime,
      end: endTime,
    });
    lastEnd = endTime;
  }

  console.log("📝 자막 타이밍 조정:");
  nonOverlappingSubs.forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.start.toFixed(1)}-${s.end.toFixed(1)}초] ${s.text?.substring(0, 20)}...`);
  });

  for (const sub of nonOverlappingSubs) {
    const startTime = sub.start;
    const duration = sub.end - sub.start;

    // 한글 자막
    if (sub.text) {
      elements.push({
        type: "text",
        text: sub.text,
        time: startTime,
        duration: duration,
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
        time: startTime,
        duration: duration,
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
      render_scale: 1,
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

  if (!renderUrl) {
    throw new Error("렌더링 타임아웃");
  }

  return renderUrl;
}

// =====================
// 3. 결과 다운로드
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
  console.log("🚀 영상 기반 Creatomate 템플릿 테스트 시작\n");

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Gemini로 영상 분석
  const analysisResult = await analyzeVideoWithGemini(INPUT_VIDEO);
  console.log("\n📊 분석 결과:");
  console.log(`  - 타이틀: ${analysisResult.title}`);
  console.log(`  - 채널명: ${analysisResult.channel_name}`);
  console.log(`  - 자막 수: ${analysisResult.subtitles?.length || 0}`);
  console.log(`  - 분위기: ${analysisResult.mood}`);
  console.log(`  - 키워드: ${analysisResult.keywords?.join(", ")}`);

  // 분석 결과 저장
  const analysisPath = path.join(OUTPUT_DIR, "analysis_result.json");
  fs.writeFileSync(analysisPath, JSON.stringify(analysisResult, null, 2));
  console.log(`\n💾 분석 결과 저장: ${analysisPath}`);

  // 2. GCS에 영상 업로드
  const videoUrl = await uploadToGCS(INPUT_VIDEO);

  // 3. Creatomate 렌더링
  const renderUrl = await renderWithCreatomate(videoUrl, analysisResult);
  console.log(`\n🎥 렌더링 URL: ${renderUrl}`);

  // 3. 결과 다운로드
  const outputPath = path.join(OUTPUT_DIR, `peanut_style_${Date.now()}.mp4`);
  await downloadResult(renderUrl, outputPath);

  console.log("\n✨ 완료!");
  console.log(`  - 입력: ${INPUT_VIDEO}`);
  console.log(`  - 출력: ${outputPath}`);
  console.log(`  - 타이틀: ${analysisResult.title}`);
  console.log(`  - 채널명: ${analysisResult.channel_name}`);
}

main().catch(console.error);
