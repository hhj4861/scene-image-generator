/**
 * FFmpeg VM 타임아웃 테스트 스크립트
 * 실행: node pipedream_puppy/test_code/test-ffmpeg-vm.mjs
 */

const FFMPEG_VM_URL = process.env.FFMPEG_VM_URL || "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251204_e9d28405_My_First_Winter_Job_";

// 테스트용 입력 데이터
const testPayload = {
  videos: [
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_000.mp4`,
      index: 0,
      duration: 4,
      narration: "아! 추워! 발 시려! 못 참아! 으앙!",
      narration_korean: "아! 추워! 발 시려! 못 참아! 으앙!",
      narration_english: "Ah! It's cold! My paws are freezing! I can't take it! Wah!",
      dialogue: {
        script: "아! 추워! 발 시려! 못 참아! 으앙!",
        script_english: "Ah! It's cold! My paws are freezing! I can't take it! Wah!",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_001.mp4`,
      index: 1,
      duration: 6,
      narration: "땅콩 씨, 오늘 날씨가 많이 춥죠? 혹한기 알바는 처음이신가요?",
      narration_korean: "땅콩 씨, 오늘 날씨가 많이 춥죠? 혹한기 알바는 처음이신가요?",
      narration_english: "Mr. TtangKong, it's very cold today, isn't it? Is this your first time working in such cold weather?",
      dialogue: {
        script: "땅콩 씨, 오늘 날씨가 많이 춥죠? 혹한기 알바는 처음이신가요?",
        script_english: "Mr. TtangKong, it's very cold today, isn't it? Is this your first time working in such cold weather?",
        interviewer: "땅콩 씨, 오늘 날씨가 많이 춥죠? 혹한기 알바는 처음이신가요?"
      },
      spoken_language: "korean",
      scene_type: "interview_question",
      is_interview_question: true,
      speaker: "interviewer",
      character_name: "인터뷰어"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_002.mp4`,
      index: 2,
      duration: 6,
      narration: "네! 견생 처음이에요! 발이 너무 시려워서 핫팩 댄스라도 춰야 할 판이에요! 핫팩 댄스! 핫팩 댄스!",
      narration_korean: "네! 견생 처음이에요! 발이 너무 시려워서 핫팩 댄스라도 춰야 할 판이에요! 핫팩 댄스! 핫팩 댄스!",
      narration_english: "Yes! It's my first time in dog life! My paws are so cold, I might have to do the hot pack dance! Hot pack dance! Hot pack dance!",
      dialogue: {
        script: "네! 견생 처음이에요! 발이 너무 시려워서 핫팩 댄스라도 춰야 할 판이에요! 핫팩 댄스! 핫팩 댄스!",
        script_english: "Yes! It's my first time in dog life! My paws are so cold, I might have to do the hot pack dance! Hot pack dance! Hot pack dance!",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_003.mp4`,
      index: 3,
      duration: 4,
      narration: "혹시 발을 따뜻하게 해 줄 털 부츠 같은 건 없으신가요?",
      narration_korean: "혹시 발을 따뜻하게 해 줄 털 부츠 같은 건 없으신가요?",
      narration_english: "Do you perhaps have fur boots to keep your paws warm?",
      dialogue: {
        script: "혹시 발을 따뜻하게 해 줄 털 부츠 같은 건 없으신가요?",
        script_english: "Do you perhaps have fur boots to keep your paws warm?",
        interviewer: "혹시 발을 따뜻하게 해 줄 털 부츠 같은 건 없으신가요?"
      },
      spoken_language: "korean",
      scene_type: "interview_question",
      is_interview_question: true,
      speaker: "interviewer",
      character_name: "인터뷰어"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_004.mp4`,
      index: 4,
      duration: 6,
      narration: "털 부츠요? 할미가 예전에 사줬었는데... 음...",
      narration_korean: "털 부츠요? 할미가 예전에 사줬었는데... 음...",
      narration_english: "Fur boots? Grandma bought them for me a while ago... Hmm...",
      dialogue: {
        script: "털 부츠요? 할미가 예전에 사줬었는데... 음...",
        script_english: "Fur boots? Grandma bought them for me a while ago... Hmm...",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_005.mp4`,
      index: 5,
      duration: 4,
      narration: "(회상하며) 아! 맞다!",
      narration_korean: "(회상하며) 아! 맞다!",
      narration_english: "(Remembering) Ah! That's right!",
      dialogue: {
        script: "(회상하며) 아! 맞다!",
        script_english: "(Remembering) Ah! That's right!",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_006.mp4`,
      index: 6,
      duration: 6,
      narration: "(회상하며) 털 부츠 신고 눈밭에서 폴짝폴짝 뛰었었는데! 엄청 따뜻했거든요!",
      narration_korean: "(회상하며) 털 부츠 신고 눈밭에서 폴짝폴짝 뛰었었는데! 엄청 따뜻했거든요!",
      narration_english: "(Remembering) I used to hop and jump in the snow wearing fur boots! It was so warm!",
      dialogue: {
        script: "(회상하며) 털 부츠 신고 눈밭에서 폴짝폴짝 뛰었었는데! 엄청 따뜻했거든요!",
        script_english: "(Remembering) I used to hop and jump in the snow wearing fur boots! It was so warm!",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "flashback",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_007.mp4`,
      index: 7,
      duration: 6,
      narration: "...근데 있잖아요... 사실은 발이 시린 게 아니었어요! 젤리 패드가 녹아서 끈적거리는 거였어요! 으앙!",
      narration_korean: "...근데 있잖아요... 사실은 발이 시린 게 아니었어요! 젤리 패드가 녹아서 끈적거리는 거였어요! 으앙!",
      narration_english: "...But you know what? It wasn't that my paws were cold! My jelly pads melted and they are sticky! Wah!",
      dialogue: {
        script: "...근데 있잖아요... 사실은 발이 시린 게 아니었어요! 젤리 패드가 녹아서 끈적거리는 거였어요! 으앙!",
        script_english: "...But you know what? It wasn't that my paws were cold! My jelly pads melted and they are sticky! Wah!",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    },
    {
      url: `https://storage.googleapis.com/${GCS_BUCKET}/${FOLDER_NAME}/scene_008.mp4`,
      index: 8,
      duration: 6,
      narration: "끈적거려! 으아아앙! 이거 억울해! 흐흐흐흐흐흐~",
      narration_korean: "끈적거려! 으아아앙! 이거 억울해! 흐흐흐흐흐흐~",
      narration_english: "It's sticky! Waaah! This is unfair! Hehehehehe~",
      dialogue: {
        script: "끈적거려! 으아아앙! 이거 억울해! 흐흐흐흐흐흐~",
        script_english: "It's sticky! Waaah! This is unfair! Hehehehehe~",
        interviewer: ""
      },
      spoken_language: "korean",
      scene_type: "interview_answer",
      speaker: "main",
      character_name: "땅콩"
    }
  ],
  bgm_url: null,
  bgm_volume: 0.2,
  header_text: "땅콩 터짐ㅋㅋ",
  header_text_english: "TTANGKONG MOMENT",
  footer_text: "땅콩NEWS📺",
  subtitle_enabled: true,
  subtitle_english_enabled: true,
  width: 1080,
  height: 1920,
  output_bucket: GCS_BUCKET,
  output_path: `${FOLDER_NAME}/final_shorts_test.mp4`,
  folder_name: FOLDER_NAME
};

async function testFFmpegVM() {
  console.log("🚀 FFmpeg VM 테스트 시작");
  console.log(`📍 VM URL: ${FFMPEG_VM_URL}`);
  console.log(`📁 Folder: ${FOLDER_NAME}`);
  console.log(`🎬 Videos: ${testPayload.videos.length}개`);
  console.log(`⏱️  Total Duration: ${testPayload.videos.reduce((sum, v) => sum + v.duration, 0)}초`);
  console.log("─".repeat(50));

  // 1. 먼저 VM 헬스체크
  console.log("\n[1/3] VM 헬스체크...");
  try {
    const healthRes = await fetch(`${FFMPEG_VM_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(10000) // 10초 타임아웃
    });
    const healthData = await healthRes.json();
    console.log("✅ VM 상태:", healthData);
  } catch (e) {
    console.error("❌ VM 헬스체크 실패:", e.message);
    console.log("⚠️  VM이 실행중인지 확인하세요!");
    return;
  }

  // 2. 비디오 URL 접근 테스트 (첫 번째 비디오만)
  console.log("\n[2/3] 비디오 URL 접근 테스트...");
  try {
    const videoUrl = testPayload.videos[0].url;
    const videoRes = await fetch(videoUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000)
    });
    console.log(`✅ 비디오 접근 가능: ${videoRes.status} (${videoUrl.substring(0, 80)}...)`);
  } catch (e) {
    console.error("❌ 비디오 URL 접근 실패:", e.message);
    console.log("⚠️  GCS 버킷 권한을 확인하세요!");
  }

  // 3. FFmpeg 렌더링 요청
  console.log("\n[3/3] FFmpeg 렌더링 요청...");
  console.log("📤 요청 페이로드 크기:", JSON.stringify(testPayload).length, "bytes");

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("\n⏰ 15분 타임아웃 도달! 요청 취소...");
      controller.abort();
    }, 900000); // 15분

    // 진행 상황 로깅 (10초마다)
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`⏳ 진행중... ${elapsed}초 경과`);
    }, 10000);

    const response = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(progressInterval);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ 렌더링 실패 (${response.status}): ${errorText}`);
      console.log(`⏱️  소요 시간: ${elapsed}초`);
      return;
    }

    const result = await response.json();
    console.log("\n✅ 렌더링 성공!");
    console.log(`⏱️  소요 시간: ${elapsed}초`);
    console.log("📹 결과:", JSON.stringify(result, null, 2));

  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (e.name === "AbortError") {
      console.error(`\n❌ 타임아웃 발생! (${elapsed}초 경과)`);
    } else {
      console.error(`\n❌ 요청 오류 (${elapsed}초 경과):`, e.message);
    }

    console.log("\n📋 디버깅 정보:");
    console.log("  - VM URL:", FFMPEG_VM_URL);
    console.log("  - 비디오 개수:", testPayload.videos.length);
    console.log("  - 총 duration:", testPayload.videos.reduce((sum, v) => sum + v.duration, 0), "초");
  }
}

// 실행
testFFmpegVM();

