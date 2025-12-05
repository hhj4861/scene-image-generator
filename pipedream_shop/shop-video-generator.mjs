/**
 * Shopping Shorts Generator Client
 * 실행: node pipedream_shop/shop-video-generator.mjs
 */

const FFMPEG_VM_URL = process.env.FFMPEG_VM_URL || "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "shop_demo_" + Date.now();

// 샘플 상품 데이터: "초강력 핸디 선풍기"
const productData = {
    name: "🌪️ 스톰 윈드 핸디 선풍기",
    name_english: "Storm Wind Handy Fan",
    price: "19,900원",
    selling_point: "오늘만 이 가격! 50% 할인!",
    videos: [
        {
            // 실제로는 제품 영상 URL이어야 하지만, 테스트용으로 기존 리소스 활용
            // (화면이 꽉 차는 세로 영상이 좋음)
            url: "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/20251204_e9d28405_My_First_Winter_Job_/scene_000.mp4",
            index: 0,
            duration: 5,
            narration: "무더운 여름, 아직도 부채질 하세요?",
            transcription: "Still using a fan in this hot summer?",
        },
        {
            url: "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/20251204_e9d28405_My_First_Winter_Job_/scene_001.mp4",
            index: 1,
            duration: 5,
            narration: "스톰 윈드 선풍기는 항공 모터 기술로 3배 더 시원합니다!",
            transcription: "Storm Window Fan is 3x cooler with aero-motor tech!",
        },
        {
            url: "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/20251204_e9d28405_My_First_Winter_Job_/scene_002.mp4",
            index: 2,
            duration: 5,
            narration: "게다가 대용량 배터리로 하루 종일 걱정 끝!",
            transcription: "Plus, all-day cooling with massive battery life!",
        },
        {
            url: "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/20251204_e9d28405_My_First_Winter_Job_/scene_006.mp4",
            index: 3,
            duration: 5,
            narration: "지금 구매하면 1+1 혜택까지! 놓치지 마세요!",
            transcription: "Buy now and get 1+1 deal! Don't miss out!",
        }
    ]
};

async function generateShopVideo() {
    console.log("🚀 Shopping Shorts 생성 시작...");
    console.log(`📦 상품명: ${productData.name}`);

    const payload = {
        videos: productData.videos,
        bgm_url: null, // BGM 없음 (테스트)
        bgm_volume: 0.3,
        title_text: productData.name,
        sub_title_text: productData.name_english,
        cta_text: `${productData.price} | ${productData.selling_point}`,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${FOLDER_NAME}/final_shop_video.mp4`,
        folder_name: FOLDER_NAME
    };

    try {
        // 1. 헬스체크
        const healthRes = await fetch(`${FFMPEG_VM_URL}/health`);
        const health = await healthRes.json();
        console.log("✅ 서버 상태:", health);

        // 2. 렌더링 요청
        console.log("📤 렌더링 요청 중...");
        const startTime = Date.now();
        const res = await fetch(`${FFMPEG_VM_URL}/render/shop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`렌더링 실패 (${res.status}): ${err}`);
        }

        const result = await res.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("────────────────────────────────────────");
        console.log("🎉 영상 생성 완료!");
        console.log(`⏱️ 소요 시간: ${elapsed}초`);
        console.log(`🔗 영상 URL: ${result.url}`);
        console.log("────────────────────────────────────────");

    } catch (e) {
        console.error("❌ 오류 발생:", e.message);
    }
}

generateShopVideo();
