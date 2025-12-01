/**
 * YouTube Shorts 업로드 테스트
 * - Gemini로 영상 분석 → AI SEO 최적화 → YouTube 업로드
 * - 2번째 채널에 업로드
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import readline from "readline";

// =====================
// 설정
// =====================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// YouTube OAuth 설정 (JSON 파일에서 로드)
const OAUTH_JSON_PATH = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/voice_samples/client_secret_918255600833-59uodvth0eshd2bpenj24gp0vq0q1fns.apps.googleusercontent.com.json";
const oauthConfig = JSON.parse(fs.readFileSync(OAUTH_JSON_PATH, "utf8")).installed;

const YOUTUBE_CLIENT_ID = oauthConfig.client_id;
const YOUTUBE_CLIENT_SECRET = oauthConfig.client_secret;
const YOUTUBE_REDIRECT_URI = oauthConfig.redirect_uris[0];

// 토큰 저장 경로
const TOKEN_PATH = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_code/youtube_tokens.json";

// 입력 영상 (최신 생성 파일)
const INPUT_VIDEO = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output/peanut_style_1764483366883.mp4";

// 분석 결과 (이전 단계에서 생성됨)
const ANALYSIS_RESULT_PATH = "/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/test_output/analysis_result.json";

// =====================
// 1. YouTube OAuth 인증
// =====================
async function getYouTubeAuth() {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI
  );

  // 저장된 토큰 확인
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oauth2Client.setCredentials(tokens);

    // 토큰 만료 확인 및 갱신
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      console.log("🔄 토큰 갱신 중...");
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));
        console.log("✅ 토큰 갱신 완료");
      } catch (error) {
        console.log("❌ 토큰 갱신 실패, 재인증 필요");
        return await authorizeNewToken(oauth2Client);
      }
    }

    return oauth2Client;
  }

  // 새로운 인증 필요
  return await authorizeNewToken(oauth2Client);
}

async function authorizeNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
    ],
    prompt: "consent", // 항상 refresh_token 받기
  });

  console.log("\n🔐 YouTube 인증이 필요합니다.");
  console.log("아래 URL을 브라우저에서 열고 인증해주세요:\n");
  console.log(authUrl);
  console.log("\n인증 후 리다이렉트된 URL의 'code' 파라미터 값을 입력해주세요.");
  console.log("(예: http://localhost:3000/oauth2callback?code=XXXXXX 에서 XXXXXX 부분)\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise((resolve) => {
    rl.question("Authorization code: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // 토큰 저장
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("✅ 토큰 저장 완료:", TOKEN_PATH);

  return oauth2Client;
}

// =====================
// 2. 채널 목록 가져오기
// =====================
async function getChannels(auth) {
  const youtube = google.youtube({ version: "v3", auth });

  const response = await youtube.channels.list({
    part: ["snippet", "contentDetails", "statistics"],
    mine: true,
  });

  return response.data.items || [];
}

// =====================
// 3. AI SEO 최적화 (Gemini 사용)
// =====================
async function optimizeWithAI(analysisResult) {
  console.log("🤖 AI SEO 최적화 중...");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `당신은 YouTube Shorts SEO 전문가입니다. 아래 영상 정보를 바탕으로 바이럴을 위한 최적화된 메타데이터를 생성해주세요.

## 영상 정보:
- 제목: ${analysisResult.title}
- 요약: ${analysisResult.summary}
- 채널명: ${analysisResult.channel_name}
- 분위기: ${analysisResult.mood}
- 키워드: ${analysisResult.keywords?.join(", ")}

## 최적화 규칙:
1. **제목 (title)**:
   - 한국어 + 이모지 조합
   - 호기심 유발 (클릭베이트 스타일)
   - 100자 이내
   - #Shorts 포함

2. **설명 (description)**:
   - 첫 2줄에 훅 (핵심 내용)
   - 관련 해시태그 5-10개
   - 채널 구독 유도 문구
   - 500자 이내

3. **태그 (tags)**:
   - 고검색량 키워드 우선
   - 강아지/반려견 관련 필수
   - 트렌딩 키워드 포함
   - 15-20개

4. **해시태그 (hashtags)**:
   - 영상 내용 관련 5개
   - 바이럴 키워드 3개
   - 채널명 해시태그

## 출력 형식 (JSON):
{
  "optimized_title": "최적화된 제목 #Shorts",
  "optimized_description": "최적화된 설명",
  "tags": ["태그1", "태그2", ...],
  "hashtags": ["#해시태그1", "#해시태그2", ...],
  "thumbnail_text": "썸네일 텍스트 (2-4 단어)",
  "seo_score": 85,
  "viral_potential": "high",
  "optimization_notes": "최적화 요약"
}

JSON만 반환해주세요.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("AI 최적화 실패:", error.message);
  }

  // 기본값 반환
  return {
    optimized_title: `${analysisResult.title} #Shorts`,
    optimized_description: `${analysisResult.summary}\n\n#강아지 #반려견 #귀여움 #${analysisResult.channel_name?.replace(/\s+/g, "")} #Shorts`,
    tags: ["강아지", "반려견", "puppy", "dog", "귀여움", "cute", "shorts", "쇼츠"],
    hashtags: ["#강아지", "#반려견", "#귀여움", "#쇼츠", "#Shorts"],
    seo_score: 70,
    viral_potential: "medium",
  };
}

// =====================
// 4. YouTube 업로드
// =====================
async function uploadToYouTube(auth, videoPath, metadata, channelIndex = 1) {
  console.log("📤 YouTube 업로드 시작...");

  const youtube = google.youtube({ version: "v3", auth });

  // 채널 정보 확인
  const channels = await getChannels(auth);
  console.log(`\n📺 연결된 채널 목록 (${channels.length}개):`);
  channels.forEach((ch, i) => {
    console.log(`  ${i + 1}. ${ch.snippet.title} (구독자: ${ch.statistics.subscriberCount})`);
  });

  if (channels.length === 0) {
    throw new Error("연결된 YouTube 채널이 없습니다.");
  }

  // 채널 선택 (인덱스는 1부터 시작)
  const selectedChannel = channels[Math.min(channelIndex - 1, channels.length - 1)];
  console.log(`\n✅ 선택된 채널: ${selectedChannel.snippet.title}`);

  // 영상 파일 읽기
  const videoBuffer = fs.readFileSync(videoPath);
  const fileSize = videoBuffer.length;
  console.log(`📁 영상 크기: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // Tags 처리 (500자 제한)
  let tags = metadata.tags || [];
  let tagsString = tags.join(",");
  if (tagsString.length > 500) {
    const shortenedTags = [];
    let currentLength = 0;
    for (const tag of tags) {
      if (currentLength + tag.length + 1 <= 500) {
        shortenedTags.push(tag);
        currentLength += tag.length + 1;
      } else break;
    }
    tags = shortenedTags;
  }

  // 스트림 생성
  const { Readable } = await import("stream");
  const videoStream = new Readable({ read() {} });
  videoStream.push(videoBuffer);
  videoStream.push(null);

  // 업로드 실행
  const uploadResponse = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: metadata.optimized_title.substring(0, 100),
        description: metadata.optimized_description.substring(0, 5000),
        tags: tags,
        categoryId: "15", // Pets & Animals
        defaultLanguage: "ko",
      },
      status: {
        privacyStatus: "public", // public, unlisted, private
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: "video/mp4",
      body: videoStream,
    },
  });

  const videoId = uploadResponse.data.id;
  return {
    video_id: videoId,
    shorts_url: `https://www.youtube.com/shorts/${videoId}`,
    watch_url: `https://www.youtube.com/watch?v=${videoId}`,
    studio_url: `https://studio.youtube.com/video/${videoId}/edit`,
    channel: selectedChannel.snippet.title,
  };
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log("🚀 YouTube Shorts 업로드 테스트 시작\n");

  // 1. 분석 결과 로드
  let analysisResult;
  if (fs.existsSync(ANALYSIS_RESULT_PATH)) {
    analysisResult = JSON.parse(fs.readFileSync(ANALYSIS_RESULT_PATH, "utf8"));
    console.log("📊 분석 결과 로드:");
    console.log(`  - 제목: ${analysisResult.title}`);
    console.log(`  - 채널: ${analysisResult.channel_name}`);
  } else {
    // 기본값
    analysisResult = {
      title: "귀여운 땅콩이의 하루",
      summary: "귀여운 강아지가 운동하는 영상",
      channel_name: "땅콩이의 하루",
      mood: "cute",
      keywords: ["강아지", "운동", "귀여움"],
    };
  }

  // 2. OAuth 설정 확인
  console.log(`📋 OAuth Client ID: ${YOUTUBE_CLIENT_ID.substring(0, 20)}...`);
  console.log(`📋 Redirect URI: ${YOUTUBE_REDIRECT_URI}`);

  // 3. YouTube 인증
  console.log("\n🔐 YouTube 인증 중...");
  const auth = await getYouTubeAuth();

  // 4. AI SEO 최적화
  const optimizedMetadata = await optimizeWithAI(analysisResult);
  console.log("\n📝 최적화된 메타데이터:");
  console.log(`  - 제목: ${optimizedMetadata.optimized_title}`);
  console.log(`  - SEO 점수: ${optimizedMetadata.seo_score}`);
  console.log(`  - 바이럴 잠재력: ${optimizedMetadata.viral_potential}`);
  console.log(`  - 태그 수: ${optimizedMetadata.tags?.length || 0}`);

  // 5. YouTube 업로드 (2번째 채널)
  const result = await uploadToYouTube(auth, INPUT_VIDEO, optimizedMetadata, 2);

  console.log("\n✨ 업로드 완료!");
  console.log(`  - 채널: ${result.channel}`);
  console.log(`  - Shorts URL: ${result.shorts_url}`);
  console.log(`  - Watch URL: ${result.watch_url}`);
  console.log(`  - Studio URL: ${result.studio_url}`);

  // 결과 저장
  const resultPath = path.join(path.dirname(INPUT_VIDEO), "upload_result.json");
  fs.writeFileSync(resultPath, JSON.stringify({
    ...result,
    metadata: optimizedMetadata,
    uploaded_at: new Date().toISOString(),
  }, null, 2));
  console.log(`\n💾 결과 저장: ${resultPath}`);
}

main().catch(console.error);
