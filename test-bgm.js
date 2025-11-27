import 'dotenv/config';
import axios from 'axios';
import https from 'https';
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

// SSL 인증서 검증 비활성화 (Suno CDN 문제 해결)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// =====================
// 설정
// =====================
const MUSICAPI_KEY = process.env.MUSICAPI_KEY;
const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

// GCS 설정
const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
const GCS_BUCKET = "shorts-audio-storage-mcp-test-457809";

// =====================
// Scene Style Guide 예시 (Scene Image Generator 출력 시뮬레이션)
// =====================
const sampleStyleGuide = {
  art_style: "anime",
  mood_keywords: ["mysterious", "tense", "dramatic"],
  color_palette: "dark blue, deep shadows, moonlight",
  title: "midnight_adventure",
};

// =====================
// BGM 스타일 매핑 (Auto Mode)
// =====================
function generateBgmStyleFromScene(styleGuide) {
  const moodToBgmStyle = {
    happy: "upbeat, cheerful, positive, bright",
    joyful: "happy, celebratory, uplifting, fun",
    energetic: "high energy, driving, powerful, dynamic",
    excited: "exciting, fast-paced, thrilling, intense",
    playful: "fun, quirky, lighthearted, bouncy",
    calm: "peaceful, serene, gentle, soothing",
    peaceful: "tranquil, ambient, relaxing, soft",
    relaxing: "chill, laid-back, mellow, easy-going",
    serene: "peaceful, flowing, ethereal, ambient",
    dramatic: "cinematic, epic, orchestral, powerful",
    emotional: "heartfelt, touching, sentimental, moving",
    romantic: "lovely, tender, sweet, warm",
    melancholic: "sad, reflective, nostalgic, bittersweet",
    nostalgic: "retro, vintage, warm, reminiscent",
    mysterious: "dark, enigmatic, suspenseful, atmospheric",
    tense: "suspenseful, anxious, building, intense",
    dark: "moody, brooding, ominous, heavy",
    suspenseful: "thriller, tension, dramatic, edge",
    inspirational: "uplifting, motivational, hopeful, soaring",
    epic: "grand, orchestral, heroic, powerful",
    triumphant: "victorious, celebratory, majestic, bold",
    futuristic: "electronic, synth, sci-fi, modern",
    vintage: "retro, classic, old-school, warm",
    urban: "hip-hop, trap, street, modern",
    nature: "organic, acoustic, earthy, natural",
  };

  const artStyleToBgm = {
    anime: "j-pop inspired, bright, dynamic, youthful",
    photorealistic: "cinematic, film score, atmospheric",
    digital_art: "electronic, modern, synth, creative",
    watercolor: "soft, delicate, acoustic, gentle",
    "3d_render": "modern, electronic, playful, animated",
    oil_painting: "classical, orchestral, rich, dramatic",
    cinematic: "film score, epic, orchestral, dramatic",
  };

  const moodKeywords = styleGuide?.mood_keywords || [];
  const artStyle = styleGuide?.art_style || "";
  const colorPalette = styleGuide?.color_palette || "";

  let bgmElements = [];

  // 무드 키워드 처리
  for (const mood of moodKeywords) {
    const lowerMood = mood.toLowerCase();
    if (moodToBgmStyle[lowerMood]) {
      bgmElements.push(moodToBgmStyle[lowerMood]);
    } else {
      bgmElements.push(lowerMood);
    }
  }

  // 아트 스타일 처리
  const normalizedArtStyle = artStyle.toLowerCase().replace(/\s+/g, "_");
  if (artStyleToBgm[normalizedArtStyle]) {
    bgmElements.push(artStyleToBgm[normalizedArtStyle]);
  }

  // 색상 팔레트에서 분위기 추출
  if (colorPalette) {
    if (colorPalette.includes("dark") || colorPalette.includes("shadow")) {
      bgmElements.push("moody, atmospheric");
    }
    if (colorPalette.includes("bright") || colorPalette.includes("vibrant")) {
      bgmElements.push("bright, energetic");
    }
    if (colorPalette.includes("warm") || colorPalette.includes("golden")) {
      bgmElements.push("warm, cozy");
    }
    if (colorPalette.includes("cool") || colorPalette.includes("blue")) {
      bgmElements.push("cool, calm");
    }
  }

  if (bgmElements.length === 0) {
    bgmElements.push("upbeat, modern, background music");
  }

  const uniqueElements = [...new Set(bgmElements.join(", ").split(", "))];

  return {
    tags: uniqueElements.slice(0, 10).join(", "),
    description: `${uniqueElements.slice(0, 8).join(", ")} background music for short video`,
  };
}

// =====================
// MusicAPI 음악 생성
// =====================
async function generateMusic(tags) {
  console.log("\n🎵 MusicAPI 음악 생성 요청...");
  console.log("   Tags:", tags);

  const requestBody = {
    mv: "sonic-v4-5",
    make_instrumental: true,
    custom_mode: true,
    title: "Shorts_BGM",
    tags: tags,
  };

  const response = await axios.post(
    `${MUSICAPI_BASE}/sonic/create`,
    requestBody,
    {
      headers: {
        "Authorization": `Bearer ${MUSICAPI_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.data.task_id) {
    throw new Error(`Failed to create music task: ${JSON.stringify(response.data)}`);
  }

  return response.data.task_id;
}

// =====================
// 태스크 상태 확인 (폴링)
// =====================
async function waitForTask(taskId, maxWaitSeconds = 300) {
  console.log("\n⏳ 음악 생성 대기 중... (최대 5분)");
  console.log(`   Task ID: ${taskId}`);

  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  const pollInterval = 5000;

  // 시도할 엔드포인트 목록
  const endpoints = [
    { method: 'GET', url: `${MUSICAPI_BASE}/sonic/task/${taskId}` },
    { method: 'GET', url: `${MUSICAPI_BASE}/sonic/${taskId}` },
    { method: 'POST', url: `${MUSICAPI_BASE}/sonic/query`, data: { task_id: taskId } },
    { method: 'GET', url: `${MUSICAPI_BASE}/generate/record-info?taskId=${taskId}` },
  ];

  let workingEndpoint = null;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // 첫 번째 반복에서 각 엔드포인트 테스트
    if (!workingEndpoint && elapsed <= 10) {
      for (const ep of endpoints) {
        try {
          console.log(`   Testing: ${ep.method} ${ep.url}`);
          const response = ep.method === 'GET'
            ? await axios.get(ep.url, {
                headers: { "Authorization": `Bearer ${MUSICAPI_KEY}` },
              })
            : await axios.post(ep.url, ep.data, {
                headers: {
                  "Authorization": `Bearer ${MUSICAPI_KEY}`,
                  "Content-Type": "application/json",
                },
              });

          console.log(`   ✅ Response:`, JSON.stringify(response.data).substring(0, 300));
          workingEndpoint = ep;
          break;
        } catch (error) {
          console.log(`   ❌ ${ep.method} ${ep.url}: ${error.response?.status || error.message}`);
        }
      }

      if (!workingEndpoint) {
        console.log("\n   ⚠️ 모든 엔드포인트 실패. callback 방식으로 전환...");
        // callback이 없으면 일정 시간 후 task_id로 재시도
        continue;
      }
    }

    // 작동하는 엔드포인트로 상태 확인
    if (workingEndpoint) {
      try {
        const response = workingEndpoint.method === 'GET'
          ? await axios.get(workingEndpoint.url, {
              headers: { "Authorization": `Bearer ${MUSICAPI_KEY}` },
            })
          : await axios.post(workingEndpoint.url, workingEndpoint.data, {
              headers: {
                "Authorization": `Bearer ${MUSICAPI_KEY}`,
                "Content-Type": "application/json",
              },
            });

        const data = response.data;
        const status = data.status || data.state || data.data?.[0]?.status;
        console.log(`   [${elapsed}s] Status: ${status}`);

        if (status === "complete" || status === "completed" || status === "success" || status === "SUCCESS" || status === "succeeded") {
          return data;
        } else if (status === "failed" || status === "error" || status === "FAILED") {
          throw new Error(`Music generation failed: ${data.error || data.message || "Unknown error"}`);
        }

        // 더 자세한 상태 출력
        if (data.data && Array.isArray(data.data) && data.data[0]) {
          const song = data.data[0];
          console.log(`      -> Song state: ${song.state}, streaming: ${song.streaming_status}, duration: ${song.duration}`);
        }

        // data 배열에 결과가 있는지 확인 (state가 complete이고 duration이 있어야 완료)
        const songs = data.data || data.clips || [];
        if (Array.isArray(songs) && songs.length > 0) {
          const firstItem = songs[0];
          // state가 complete/succeeded이거나 streaming_status가 complete이어야 함
          const isComplete = firstItem.state === "complete" ||
                            firstItem.state === "completed" ||
                            firstItem.state === "succeeded" ||
                            firstItem.streaming_status === "complete" ||
                            (firstItem.duration && firstItem.duration > 0 && !firstItem.audio_url?.includes('audiopipe'));

          if (isComplete && (firstItem.audio_url || firstItem.audioUrl)) {
            console.log(`   ✅ 음악 생성 완료! (state: ${firstItem.state}, duration: ${firstItem.duration}s)`);
            return data;
          } else if (firstItem.audio_url) {
            console.log(`   ⏳ 아직 생성 중... (state: ${firstItem.state}, duration: ${firstItem.duration})`);
          }
        }
      } catch (error) {
        console.log(`   [${elapsed}s] Error: ${error.message}`);
      }
    }
  }

  throw new Error(`Music generation timed out after ${maxWaitSeconds} seconds`);
}

// =====================
// GCS 업로드
// =====================
async function uploadToGCS(songs) {
  console.log("\n☁️  GCS 업로드 중...");

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  });

  const storage = google.storage({ version: 'v1', auth });

  // 폴더명 생성 (yyyymmddhhmmsss 형식)
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0") +
    String(now.getMilliseconds()).padStart(3, "0");
  const folderName = `bgm_${timestamp}`;

  const uploadedFiles = [];

  for (const song of songs) {
    try {
      console.log(`   Downloading: ${song.title}...`);
      console.log(`   URL: ${song.audio_url}`);

      // audiopipe URL은 스킵 (스트리밍 전용)
      if (song.audio_url.includes('audiopipe.suno.ai')) {
        console.log(`   ⚠️ 스트리밍 URL 스킵 (아직 처리 중)`);
        continue;
      }

      // Node.js native https로 다운로드 (CloudFront WAF 우회)
      const audioBuffer = await new Promise((resolve, reject) => {
        const urlObj = new URL(song.audio_url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          rejectUnauthorized: false,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        };

        const req = https.request(options, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });

        req.on('error', reject);
        req.setTimeout(120000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      });
      const filename = `${song.title.replace(/[^a-zA-Z0-9_]/g, "_")}.mp3`;
      const objectName = `${folderName}/${filename}`;

      console.log(`   Uploading: ${filename}...`);

      const bufferStream = new Readable();
      bufferStream.push(audioBuffer);
      bufferStream.push(null);

      await storage.objects.insert({
        bucket: GCS_BUCKET,
        name: objectName,
        media: {
          mimeType: 'audio/mpeg',
          body: bufferStream,
        },
        requestBody: {
          name: objectName,
          contentType: 'audio/mpeg',
        },
      });

      const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${objectName}`;

      uploadedFiles.push({
        filename,
        original_url: song.audio_url,
        gcs_url: publicUrl,
        duration: song.duration,
      });

      console.log(`   ✅ Uploaded: ${publicUrl}`);
    } catch (error) {
      console.error(`   ❌ Failed: ${song.title}`);
      console.error(`      Error: ${error.message}`);
      if (error.response) {
        console.error(`      Status: ${error.response.status}`);
        console.error(`      URL: ${error.config?.url}`);
        console.error(`      Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
  }

  // metadata.json 업로드
  const metadata = {
    generated_at: new Date().toISOString(),
    folder: folderName,
    model: "sonic-v4-5",
    mode: "auto",
    instrumental: true,
    songs: uploadedFiles,
  };

  const metadataStream = new Readable();
  metadataStream.push(JSON.stringify(metadata, null, 2));
  metadataStream.push(null);

  await storage.objects.insert({
    bucket: GCS_BUCKET,
    name: `${folderName}/metadata.json`,
    media: {
      mimeType: 'application/json',
      body: metadataStream,
    },
  });

  return {
    folder_name: folderName,
    folder_url: `https://storage.googleapis.com/${GCS_BUCKET}/${folderName}/`,
    files: uploadedFiles,
  };
}

// =====================
// 메인 테스트 함수
// =====================
async function testBGMGenerator() {
  console.log("═".repeat(60));
  console.log("🎵 BGM Generator 테스트");
  console.log("═".repeat(60));

  // API 키 확인
  if (!MUSICAPI_KEY) {
    console.error("❌ MUSICAPI_KEY가 .env 파일에 설정되지 않았습니다.");
    console.log("\n.env 파일에 다음을 추가하세요:");
    console.log("MUSICAPI_KEY=your_api_key_here");
    process.exit(1);
  }

  try {
    // 1. Scene Style Guide 기반 BGM 스타일 생성 (Auto Mode)
    console.log("\n📊 Scene Style Guide 분석:");
    console.log("   Art Style:", sampleStyleGuide.art_style);
    console.log("   Mood Keywords:", sampleStyleGuide.mood_keywords.join(", "));
    console.log("   Color Palette:", sampleStyleGuide.color_palette);

    const bgmStyle = generateBgmStyleFromScene(sampleStyleGuide);
    console.log("\n🎨 생성된 BGM 스타일:");
    console.log("   Tags:", bgmStyle.tags);
    console.log("   Description:", bgmStyle.description);

    // 2. 음악 생성 요청
    const taskId = await generateMusic(bgmStyle.tags);
    console.log("   Task ID:", taskId);

    // 3. 생성 완료 대기
    const result = await waitForTask(taskId);

    // 4. 결과 처리
    const songs = result.data || result.songs || result.clips || [];
    console.log(`\n✅ 음악 생성 완료! (${songs.length}곡)`);

    // 디버깅: 원본 응답 출력
    console.log("\n   📋 원본 응답 데이터:");
    console.log(JSON.stringify(songs[0], null, 2).substring(0, 1000));

    const generatedSongs = songs.map((song, index) => ({
      index,
      id: song.id || song.clip_id,
      title: song.title || `BGM_${index + 1}`,
      // 다양한 URL 필드 확인
      audio_url: song.audio_url || song.audioUrl || song.song_path || song.song_url || song.url,
      stream_url: song.stream_url || song.streamUrl,
      duration: song.duration,
    }));

    for (const song of generatedSongs) {
      console.log(`\n   🎵 ${song.title}`);
      console.log(`      Duration: ${song.duration}s`);
      console.log(`      URL: ${song.audio_url}`);
    }

    // 5. 결과 요약 (Suno CDN URL 직접 사용)
    // 참고: Suno CDN이 Node.js 요청을 차단하여 GCS 업로드 불가
    // Creatomate는 서버에서 직접 Suno CDN에 접근 가능

    console.log("\n" + "═".repeat(60));
    console.log("📁 결과 요약");
    console.log("═".repeat(60));
    console.log(`   총 ${generatedSongs.length}곡 생성됨`);
    console.log(`   ⚠️ Suno CDN URL 직접 사용 (GCS 업로드 생략)`);

    // 6. 최종 결과 반환 (Creatomate에서 사용할 형식)
    const finalResult = {
      success: true,
      task_id: taskId,
      model: "sonic-v4-5",
      mode: "auto",
      instrumental: true,
      auto_analysis: {
        generated_tags: bgmStyle.tags,
        generated_description: bgmStyle.description,
      },
      songs: generatedSongs,
      // Suno CDN URL 직접 사용
      bgm_url: generatedSongs[0]?.audio_url,
      bgm_url_alt: generatedSongs[1]?.audio_url,
    };

    console.log("\n📤 Creatomate 연동용 출력:");
    console.log(`   bgm_url: ${generatedSongs[0]?.audio_url}`);
    console.log(`   bgm_url_alt: ${generatedSongs[1]?.audio_url}`);
    console.log(`   bgm_volume: "20"`);

    return finalResult;

  } catch (error) {
    console.error("\n❌ 테스트 실패:", error.message);
    if (error.response) {
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// 실행
testBGMGenerator()
  .then(result => {
    console.log("\n" + "═".repeat(60));
    console.log("✅ BGM Generator 테스트 완료!");
    console.log("═".repeat(60));
  })
  .catch(error => {
    console.error("\n❌ 테스트 실패");
    process.exit(1);
  });
