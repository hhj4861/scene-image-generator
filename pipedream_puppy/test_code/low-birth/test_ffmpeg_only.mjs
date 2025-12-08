/**
 * FFmpeg Only Test - 기존 GCS 영상으로 레이아웃만 테스트
 */

import fetch from 'node-fetch';

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = `test_ffmpeg_${Date.now()}`;

// 기존에 생성된 9:16 영상 사용 (720x1280 세로)
const SOURCE_VIDEO_URL = "https://storage.googleapis.com/shorts-videos-storage-mcp-test-457809/test_9x16/source_9x16.mp4";

const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate";
const FOOTER_TEXT = "구독하면 귀여운 애기 생김";
const FOOTER_TEXT_EN = "Subscribe for cute babies";

const SCENE_DATA = {
    narration_korean: "여러분! 제가 드디어 저출산 문제 해결책을 찾았어요!",
    narration_english: "Everyone! I finally found a solution to the low birth rate problem!"
};

console.log("🚀 FFmpeg Only Test (Using existing 16:9 video)");
console.log(`📂 Folder: ${FOLDER_NAME}`);
console.log(`📹 Source: ${SOURCE_VIDEO_URL}\n`);

async function main() {
    const payload = {
        videos: [{
            url: SOURCE_VIDEO_URL,
            index: 0,
            duration: 4,
            narration: SCENE_DATA.narration_korean,
            narration_korean: SCENE_DATA.narration_korean,
            narration_english: SCENE_DATA.narration_english,
            dialogue: {
                script: SCENE_DATA.narration_korean,
                script_english: SCENE_DATA.narration_english,
            },
            speaker: "main",
            character_name: "땅콩"
        }],
        bgm_url: null,
        bgm_volume: 0,
        header_text: HEADER_TEXT,
        header_text_english: HEADER_TEXT_EN,
        footer_text: FOOTER_TEXT,
        footer_text_english: FOOTER_TEXT_EN,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${FOLDER_NAME}/final_test.mp4`,
        folder_name: FOLDER_NAME
    };

    console.log("🔧 Calling FFmpeg VM...\n");

    try {
        const startTime = Date.now();

        const response = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 300000
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
