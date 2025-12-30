import axios from 'axios';

// =====================
// 설정
// =====================
const MUSICAPI_KEY = process.env.MUSICAPI_KEY || "6478c0c303251ea0c5bd237bba4d6695";
const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

// =====================
// 생일 축하 BGM 스타일
// =====================
const birthdayBgmStyle = {
  tags: "happy birthday celebration, cheerful festive, cute adorable, warm heartfelt, playful bouncy, family love, puppy cute, gentle joyful, celebratory upbeat, sweet emotional",
  description: "Happy birthday celebration music for grandma, cute puppy birthday video, warm family moments, cheerful and heartfelt 64 second short video"
};

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
    title: "Birthday_BGM",
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

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await axios.get(
        `${MUSICAPI_BASE}/sonic/task/${taskId}`,
        {
          headers: { "Authorization": `Bearer ${MUSICAPI_KEY}` },
        }
      );

      const data = response.data;
      const status = data.status || data.state || data.data?.[0]?.status;
      console.log(`   [${elapsed}s] Status: ${status}`);

      if (status === "complete" || status === "completed" || status === "success" || status === "succeeded") {
        return data;
      } else if (status === "failed" || status === "error" || status === "FAILED") {
        throw new Error(`Music generation failed: ${data.error || data.message || "Unknown error"}`);
      }

      // data 배열에서 개별 곡 상태 확인
      const songs = data.data || data.clips || [];
      if (Array.isArray(songs) && songs.length > 0) {
        const firstItem = songs[0];
        const isComplete = firstItem.state === "complete" ||
                          firstItem.state === "completed" ||
                          firstItem.state === "succeeded" ||
                          firstItem.streaming_status === "complete" ||
                          (firstItem.duration && firstItem.duration > 0 && !firstItem.audio_url?.includes('audiopipe'));

        if (isComplete && (firstItem.audio_url || firstItem.audioUrl)) {
          console.log(`   ✅ 음악 생성 완료! (state: ${firstItem.state}, duration: ${firstItem.duration}s)`);
          return data;
        }
      }
    } catch (error) {
      console.log(`   [${elapsed}s] Error: ${error.message}`);
    }
  }

  throw new Error(`Music generation timed out after ${maxWaitSeconds} seconds`);
}

// =====================
// 메인 함수
// =====================
async function generateBirthdayBGM() {
  console.log("═".repeat(60));
  console.log("🎂 생일 축하 BGM Generator");
  console.log("═".repeat(60));

  // API 키 확인
  if (!MUSICAPI_KEY) {
    console.error("❌ MUSICAPI_KEY가 .env 파일에 설정되지 않았습니다.");
    process.exit(1);
  }

  try {
    console.log("\n🎨 BGM 스타일:");
    console.log("   Tags:", birthdayBgmStyle.tags);

    // 1. 음악 생성 요청
    const taskId = await generateMusic(birthdayBgmStyle.tags);
    console.log("   Task ID:", taskId);

    // 2. 생성 완료 대기
    const result = await waitForTask(taskId);

    // 3. 결과 처리
    const songs = result.data || result.songs || result.clips || [];
    console.log(`\n✅ 음악 생성 완료! (${songs.length}곡)`);

    const generatedSongs = songs.map((song, index) => ({
      index,
      id: song.id || song.clip_id,
      title: song.title || `Birthday_BGM_${index + 1}`,
      audio_url: song.audio_url || song.audioUrl || song.song_path || song.song_url || song.url,
      duration: song.duration,
    }));

    // 4. 결과 출력
    console.log("\n" + "═".repeat(60));
    console.log("🎵 생성된 BGM URLs");
    console.log("═".repeat(60));

    for (const song of generatedSongs) {
      console.log(`\n   🎵 ${song.title}`);
      console.log(`      Duration: ${song.duration}s`);
      console.log(`      URL: ${song.audio_url}`);
    }

    // 5. config.json 업데이트용 출력
    console.log("\n" + "═".repeat(60));
    console.log("📝 config.json에 사용할 bgm_url:");
    console.log("═".repeat(60));
    console.log(`\n   "bgm_url": "${generatedSongs[0]?.audio_url}"`);

    if (generatedSongs[1]) {
      console.log(`   "bgm_url_alt": "${generatedSongs[1]?.audio_url}"`);
    }

    return {
      success: true,
      bgm_url: generatedSongs[0]?.audio_url,
      bgm_url_alt: generatedSongs[1]?.audio_url,
      songs: generatedSongs,
    };

  } catch (error) {
    console.error("\n❌ BGM 생성 실패:", error.message);
    throw error;
  }
}

// 실행
generateBirthdayBGM()
  .then(result => {
    console.log("\n" + "═".repeat(60));
    console.log("✅ 생일 BGM 생성 완료!");
    console.log("═".repeat(60));
  })
  .catch(error => {
    console.error("\n❌ 실패");
    process.exit(1);
  });
