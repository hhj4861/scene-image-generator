/**
 * 씬 6, 8 Veo 3 영상 생성 테스트
 * - 쿼터 문제로 실패한 씬 재생성
 */

import fs from "fs";
import path from "path";

const GEMINI_API_KEY = "AIzaSyBAetgB-_9XwtEgvm4mJ49LYYL-z6legts";
const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

const OUTPUT_DIR = "/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/test_output";

// 씬 6, 8 데이터
const scenes = [
  {
    index: 6,
    prompt: `8K cinematic video. French Bulldog, solid black short smooth coat, dark brown round wide-set eyes, black nose, large bat-like erect ears, flat wrinkled face with short snout, compact muscular stocky body, small size, wearing grey ribbed shirt and gold chain necklace. Press conference stage with reporters and cameras. Bright professional lighting. French Bulldog speaks Korean dialogue with cute voice: "흠... 그, 그게... 뼈다귀 간식... 맛있어요!". panicked embarrassed expression. Language: Korean. IMPORTANT: Precise lip sync - mouth movements must match the speech audio exactly. Mouth opens when speaking, closes between words. Natural talking motion. CRITICAL: NO barking sounds. NO dog barking. Only cute human-like Korean speech voice. No animal sounds. CRITICAL: Maintain consistent French Bulldog appearance throughout. No morphing. No distortion. IMPORTANT: At the end, french bulldog shows embarrassed cute grin. CRITICAL: No text. No subtitles. No captions. No watermarks.`,
    duration: 4,
    narration: "(당황하며) 흠... 그, 그게... 뼈다귀 간식... 맛있어요!",
    character: "버터 (French Bulldog)",
  },
  {
    index: 8,
    prompt: `8K cinematic video. French Bulldog, solid black short smooth coat, dark brown round wide-set eyes, black nose, large bat-like erect ears, flat wrinkled face with short snout, compact muscular stocky body, small size, wearing grey ribbed shirt and gold chain necklace. Press conference stage with reporters and cameras. Bright professional lighting. French Bulldog speaks Korean dialogue with determined voice: "댕글마켓! 다시는 우리 강아지들 정보에 손대지 마! 안 그러면... 앙! 물어버릴 거야!". angry fierce expression. Language: Korean. IMPORTANT: Precise lip sync - mouth movements must match the speech audio exactly. Mouth opens when speaking, closes between words. Natural talking motion. CRITICAL: NO barking sounds. NO dog barking. Only cute human-like Korean speech voice. No animal sounds. CRITICAL: Maintain consistent French Bulldog appearance throughout. No morphing. No distortion. IMPORTANT: At the end, french bulldog shows determined fierce expression. CRITICAL: No text. No subtitles. No captions. No watermarks.`,
    duration: 8,
    narration: "(심각한 표정으로) 댕글마켓! 다시는 우리 강아지들 정보에 손대지 마! 안 그러면... 앙! 물어버릴 거야!",
    character: "버터 (French Bulldog)",
  },
];

async function generateVideo(scene) {
  console.log(`\n🎬 씬 ${scene.index} 생성 시작...`);
  console.log(`   캐릭터: ${scene.character}`);
  console.log(`   대사: ${scene.narration}`);
  console.log(`   길이: ${scene.duration}초`);

  const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

  try {
    // 1. 요청 제출 (이미지 없이 프롬프트만)
    console.log(`   📤 Veo 3 요청 제출 중...`);

    const createResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        instances: [{
          prompt: scene.prompt,
        }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: scene.duration,
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`API Error ${createResponse.status}: ${errorText}`);
    }

    const createData = await createResponse.json();
    const operationName = createData.name;

    if (!operationName) {
      throw new Error("No operation name returned");
    }
    console.log(`   ✅ 요청 성공: ${operationName}`);

    // 2. 완료 대기 (폴링)
    console.log(`   ⏳ 생성 대기 중...`);
    let result = null;
    const maxAttempts = 72; // 6분
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000)); // 5초 대기
      attempts++;

      try {
        const statusResponse = await fetch(`${VEO_BASE_URL}/${operationName}`, {
          headers: { "X-goog-api-key": GEMINI_API_KEY },
        });

        const statusData = await statusResponse.json();

        if (statusData.done) {
          if (statusData.error) {
            throw new Error(`Generation failed: ${statusData.error.message}`);
          }
          result = statusData;
          break;
        }

        if (attempts % 6 === 0) {
          console.log(`   ... ${attempts * 5}초 경과`);
        }
      } catch (pollError) {
        console.log(`   ⚠️ 폴링 에러 (재시도): ${pollError.message}`);
      }
    }

    if (!result) {
      throw new Error("Generation timeout");
    }

    // 3. 비디오 URL 추출
    const response = result.response;
    const genVideoResp = response?.generateVideoResponse;

    // 안전 필터 체크
    const raiFiltered = genVideoResp?.raiMediaFilteredCount || 0;
    if (raiFiltered > 0) {
      throw new Error("Safety filtered");
    }

    let videoUrl = null;
    if (genVideoResp?.generatedSamples?.length > 0) {
      videoUrl = genVideoResp.generatedSamples[0].video?.uri;
    } else if (genVideoResp?.generatedVideos?.length > 0) {
      videoUrl = genVideoResp.generatedVideos[0].video?.uri;
    } else if (response?.generatedVideos?.length > 0) {
      videoUrl = response.generatedVideos[0].video?.uri;
    }

    if (!videoUrl) {
      throw new Error("No video URL in response");
    }

    // gs:// → https:// 변환
    if (videoUrl.startsWith("gs://")) {
      const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
      if (gsMatch) {
        videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
      }
    }

    console.log(`   🎉 생성 완료!`);
    console.log(`   📹 URL: ${videoUrl}`);

    // 4. 다운로드 및 저장
    const isVeoUrl = videoUrl.includes("generativelanguage.googleapis.com");
    const downloadHeaders = isVeoUrl ? { "X-goog-api-key": GEMINI_API_KEY } : {};

    const videoResponse = await fetch(videoUrl, { headers: downloadHeaders });
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    const outputPath = path.join(OUTPUT_DIR, `danggle_scene${scene.index}_veo3.mp4`);
    fs.writeFileSync(outputPath, videoBuffer);
    console.log(`   💾 저장 완료: ${outputPath}`);

    return {
      success: true,
      index: scene.index,
      url: videoUrl,
      localPath: outputPath,
    };

  } catch (error) {
    console.error(`   ❌ 에러: ${error.message}`);

    // 쿼터 에러 체크
    if (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")) {
      console.error(`   ⚠️ 쿼터 초과! 다른 API 키로 재시도 필요`);
    }

    return {
      success: false,
      index: scene.index,
      error: error.message,
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("🎬 댕글마켓 풍자 - 씬 6, 8 Veo 3 영상 생성");
  console.log("=".repeat(60));

  // 출력 디렉토리 확인
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];

  for (const scene of scenes) {
    const result = await generateVideo(scene);
    results.push(result);

    // 씬 사이 딜레이
    if (scene.index !== scenes[scenes.length - 1].index) {
      console.log("\n   ⏸️ 다음 씬 전 3초 대기...");
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // 결과 요약
  console.log("\n" + "=".repeat(60));
  console.log("📊 결과 요약");
  console.log("=".repeat(60));

  const successCount = results.filter(r => r.success).length;
  console.log(`성공: ${successCount}/${results.length}`);

  for (const result of results) {
    if (result.success) {
      console.log(`  ✅ 씬 ${result.index}: ${result.localPath}`);
    } else {
      console.log(`  ❌ 씬 ${result.index}: ${result.error}`);
    }
  }
}

main().catch(console.error);
