/**
 * Full Video Combine Test
 * 8개 씬 영상을 새 레이아웃으로 조합
 */

import fetch from 'node-fetch';

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = `low_birth_full_${Date.now()}`;

const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate";
const FOOTER_TEXT = "땅콩";  // 채널명

// 씬별 자막 데이터
const SCENES = [
    {
        file: "scene_0.mp4",
        narration_korean: "여러분! 제가 드디어 저출산 문제 해결책을 찾았어요!",
        narration_english: "Everyone! I finally found a solution to the low birth rate problem!"
    },
    {
        file: "scene_1.mp4",
        narration_korean: "바로 저처럼 귀여운 강아지를 키우는 거예요!",
        narration_english: "It's raising a cute puppy like me!"
    },
    {
        file: "scene_2.mp4",
        narration_korean: "강아지는 아이보다 키우기 쉽고 돈도 덜 들어요",
        narration_english: "Puppies are easier to raise and cost less than children"
    },
    {
        file: "scene_3a.mp4",
        narration_korean: "학원비도 없고 대학 등록금도 없죠!",
        narration_english: "No tutoring fees and no college tuition!"
    },
    {
        file: "scene_3b.mp4",
        narration_korean: "그리고 저는 항상 귀엽잖아요",
        narration_english: "And I'm always cute, right?"
    },
    {
        file: "scene_3c.mp4",
        narration_korean: "사춘기도 없고 반항도 안 해요!",
        narration_english: "No puberty and no rebellion!"
    },
    {
        file: "scene_4.mp4",
        narration_korean: "어때요? 완벽한 해결책이죠?",
        narration_english: "How about it? Perfect solution, right?"
    },
    {
        file: "scene_5.mp4",
        narration_korean: "구독하고 좋아요 누르면 귀여운 아기가 생겨요!",
        narration_english: "Subscribe and like for a cute baby!"
    }
];

const GCS_BASE_URL = `https://storage.googleapis.com/${GCS_BUCKET}/low_birth_full_test`;

console.log("🚀 Full Video Combine Test (New Layout)");
console.log(`📂 Folder: ${FOLDER_NAME}`);
console.log(`📹 Scenes: ${SCENES.length}\n`);

async function main() {
    const videos = SCENES.map((scene, index) => ({
        url: `${GCS_BASE_URL}/${scene.file}`,
        index: index,
        duration: 4,
        narration: scene.narration_korean,
        narration_korean: scene.narration_korean,
        narration_english: scene.narration_english,
        dialogue: {
            script: scene.narration_korean,
            script_english: scene.narration_english,
        },
        speaker: "main",
        character_name: "땅콩"
    }));

    const payload = {
        videos: videos,
        bgm_url: null,
        bgm_volume: 0,
        header_text: HEADER_TEXT,
        header_text_english: HEADER_TEXT_EN,
        footer_text: FOOTER_TEXT,
        footer_text_english: "",  // 채널명만 (영문 없음)
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${FOLDER_NAME}/final_full.mp4`,
        folder_name: FOLDER_NAME
    };

    console.log("🔧 Calling FFmpeg VM...\n");

    try {
        const startTime = Date.now();

        const response = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 600000  // 10분 타임아웃
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`FFmpeg VM Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("===========================================");
        console.log("✅ SUCCESS!");
        console.log("===========================================");
        console.log(`⏱️  Time: ${elapsed}s`);
        console.log(`📹 Output: ${result.url}`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

main();
