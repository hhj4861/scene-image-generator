const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// 플래그 처리: node combine-ffmpeg-vm.cjs origin
const USE_ORIGIN_SIZE = process.argv[2] === "origin";

// narration.json에서 자막 데이터 로드
const narrationPath = path.join(__dirname, "script", "narration.json");
const narrationData = JSON.parse(fs.readFileSync(narrationPath, "utf-8"));

// 미스터 땅샤인 스크립트 데이터
const scriptData = {
    title: {
        korean: narrationData.video_title,
        english: narrationData.video_title_en
    },
    // BGM URL - MusicAPI로 생성한 K-Drama OST
    bgm_url: "https://cdn1.suno.ai/dc77e406-d668-4a62-a888-20196ae40e50.mp3",
    scenes: [
        { index: 0, localFile: "씬0.mp4" },
        { index: 1, localFile: "씬1.mp4" },
        { index: 2, localFile: "씬2.mp4" },
        { index: 3, localFile: "씬3.mp4" },
        { index: 4, localFile: "씬4.mp4" },
        { index: 5, localFile: "씬5.mp4" }
    ]
};

// 씬별 자막 매핑 (narration.json의 subtitles 배열에서 추출)
function getNarration(sceneIndex) {
    // narration.json은 scene 1부터 시작 (씬0은 제목, 씬1~씬5)
    const sceneData = narrationData.subtitles[sceneIndex];
    if (!sceneData) return { narration: "", narration_english: "" };

    // 해당 씬의 첫 번째 대사를 사용
    const entries = sceneData.subtitle_entries || [];
    if (entries.length === 0) return { narration: "", narration_english: "" };

    // 모든 대사를 합쳐서 반환
    const koreanTexts = entries.map(e => e.korean || "").filter(t => t).join(" ");
    const englishTexts = entries.map(e => e.english || "").filter(t => t).join(" ");

    return {
        narration: koreanTexts,
        narration_english: englishTexts
    };
}

// timed_subtitles 생성 (정확한 시간 동기화)
function buildTimedSubtitles() {
    const timedSubtitles = [];

    // 씬별 시작 시간 계산 (각 씬 8초 기준)
    const sceneDurations = [8, 8, 8, 8, 8, 8]; // 씬0~5: 각 8초
    let sceneStartTime = 0;

    for (let sceneIdx = 0; sceneIdx < narrationData.subtitles.length; sceneIdx++) {
        const sceneData = narrationData.subtitles[sceneIdx];
        const entries = sceneData.subtitle_entries || [];

        for (const entry of entries) {
            const startTime = sceneStartTime + parseFloat(entry.start_time);
            const endTime = sceneStartTime + parseFloat(entry.end_time);

            timedSubtitles.push({
                start_time: startTime,
                end_time: endTime,
                text_ko: entry.korean || "",
                text_en: entry.english || ""
            });
        }

        // 다음 씬 시작 시간 업데이트
        if (sceneIdx < sceneDurations.length) {
            sceneStartTime += sceneDurations[sceneIdx];
        }
    }

    return timedSubtitles;
}

async function uploadToGCS(localPath, gcsPath) {
    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);

    console.log(`Uploading ${path.basename(localPath)} to gs://${GCS_BUCKET}/${gcsPath}...`);
    try {
        await bucket.upload(localPath, { destination: gcsPath });
    } catch (err) {
        console.error(`  [ERROR] Upload failed: ${err.message}`);
        throw err;
    }

    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
    console.log(`  -> ${publicUrl}`);
    return publicUrl;
}

// 원본 영상 해상도 가져오기
function getVideoResolution(videoPath) {
    try {
        const output = execSync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
            { encoding: "utf8" }
        ).trim();
        const [width, height] = output.split(",").map(Number);
        return { width, height };
    } catch (err) {
        console.error(`Failed to get resolution for ${videoPath}`);
        return { width: 1080, height: 1920 }; // fallback
    }
}

async function combineVideos() {
    const testFolder = `mr_ttangshine_${Date.now()}`;
    const videoDir = path.join(__dirname, "video");

    console.log("===========================================");
    console.log("🎬 미스터 땅샤인 - Video Combine with FFmpeg VM");
    console.log(`Mode: ${USE_ORIGIN_SIZE ? "ORIGIN SIZE" : "1080x1920 (default)"}`);
    console.log("===========================================\n");

    // 1. 영상 파일 GCS 업로드
    console.log("Step 1: Uploading videos to GCS...\n");
    const videos = [];

    for (const scene of scriptData.scenes) {
        const localPath = path.join(videoDir, scene.localFile);

        if (!fs.existsSync(localPath)) {
            console.error(`  [SKIP] File not found: ${scene.localFile}`);
            continue;
        }

        const gcsPath = `${testFolder}/scene${scene.index}.mp4`;
        const url = await uploadToGCS(localPath, gcsPath);

        const { narration, narration_english } = getNarration(scene.index);
        videos.push({
            url,
            index: scene.index,
            narration: narration,
            narration_english: narration_english,
            is_performance: false,
            scene_type: "drama"
        });
    }

    console.log(`\n  Uploaded ${videos.length} videos\n`);

    // origin 모드일 경우 첫 번째 영상의 해상도 사용
    let outputWidth = 1080;
    let outputHeight = 1920;

    if (USE_ORIGIN_SIZE) {
        const firstVideoPath = path.join(videoDir, scriptData.scenes[0].localFile);
        const resolution = getVideoResolution(firstVideoPath);
        outputWidth = resolution.width;
        outputHeight = resolution.height;
        console.log(`  Using origin size: ${outputWidth}x${outputHeight}\n`);
    }

    // 2. timed_subtitles 생성
    console.log("Step 2: Building timed subtitles...\n");
    const timedSubtitles = buildTimedSubtitles();
    console.log(`  Generated ${timedSubtitles.length} timed subtitles`);

    // 자막 미리보기 출력
    timedSubtitles.slice(0, 5).forEach(sub => {
        console.log(`   📌 ${sub.start_time.toFixed(1)}s - ${sub.end_time.toFixed(1)}s: "${sub.text_ko.substring(0, 30)}..."`);
    });
    if (timedSubtitles.length > 5) {
        console.log(`   ... and ${timedSubtitles.length - 5} more`);
    }
    console.log("");

    // 3. FFmpeg VM API 호출
    console.log("Step 3: Calling FFmpeg VM API...\n");

    // 레이아웃 및 폰트 스케일 설정
    const fontScale = USE_ORIGIN_SIZE ? (outputWidth / 1080) : 1;

    // 미스터 땅샤인 레이아웃 (드라마틱한 느낌)
    const headerY = 80;
    const headerHeight = 120;
    const headerGap = 30;
    const videoAreaY = headerY + headerHeight + headerGap;
    const footerHeight = 100;
    const footerY = 1550;  // 1700에서 위로 올림
    const videoEndY = footerY - 80;
    const videoAreaHeight = videoEndY - videoAreaY;

    // 레이아웃 설정
    const layoutConfig = {
        video_area: {
            x: 0,
            y: videoAreaY,
            width: outputWidth,
            height: videoAreaHeight
        },
        header_area: {
            y: headerY,
            height: headerHeight
        },
        subtitle_area: {
            y: 1400,
            height: 180,
            single_line: false,
            max_lines: 2
        },
        footer_area: {
            y: footerY,
            height: footerHeight
        },
        font_scale: fontScale
    };

    const requestPayload = {
        videos: videos.sort((a, b) => a.index - b.index),
        header_text: scriptData.title.korean,
        header_text_english: scriptData.title.english,
        footer_text: "미스터 땅샤인 🐕✨",
        footer_text_english: "Mr. Ttangshine 🐕✨",
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        timed_subtitles: timedSubtitles,  // 정확한 시간 자막
        bgm_url: scriptData.bgm_url,
        bgm_volume: 0.3,
        width: outputWidth,
        height: outputHeight,
        use_origin_size: true,
        origin_layout: layoutConfig,
        output_bucket: GCS_BUCKET,
        output_path: `${testFolder}/final_mr_ttangshine.mp4`,
        folder_name: testFolder,
        font_settings: {
            header_korean: {
                font: "NanumSquareRoundOTFEB",
                size: Math.round(40 * fontScale),
                color: "white",
                border_width: Math.round(3 * fontScale),
                border_color: "black"
            },
            header_english: {
                font: "NotoSerif-Regular",
                size: Math.round(18 * fontScale),
                color: "white",
                border_width: Math.round(2 * fontScale),
                border_color: "black"
            },
            subtitle_korean: {
                font: "NanumSquareRoundOTFEB",
                size: Math.round(104 * fontScale),  // 52 → 104 (2배)
                color: "#FFE4B5",  // 드라마 느낌의 따뜻한 색상
                border_width: Math.round(6 * fontScale),
                border_color: "#3D2817"
            },
            subtitle_english: {
                font: "NotoSerif-Regular",
                size: Math.round(60 * fontScale),  // 30 → 60 (2배)
                color: "white",
                border_width: Math.round(4 * fontScale),
                border_color: "black"
            }
        }
    };

    console.log("Request summary:");
    console.log(`  - Videos: ${videos.length}`);
    console.log(`  - Timed subtitles: ${timedSubtitles.length}`);
    console.log(`  - BGM: ${scriptData.bgm_url ? "Yes" : "No"}`);
    console.log(`  - Output size: ${outputWidth}x${outputHeight}`);
    console.log("\n");

    try {
        console.log("Sending request to FFmpeg VM...");
        const startTime = Date.now();

        const response = await axios.post(
            `${FFMPEG_VM_URL}/render/puppy`,
            requestPayload,
            {
                headers: { "Content-Type": "application/json" },
                timeout: 600000 // 10분
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("\n===========================================");
        console.log("✅ SUCCESS!");
        console.log("===========================================");
        console.log(`Time elapsed: ${elapsed}s`);
        console.log(`Job ID: ${response.data.job_id}`);
        console.log(`Total duration: ${response.data.total_duration?.toFixed(1)}s`);
        console.log(`Output URL: ${response.data.url}`);
        console.log("\nStats:", JSON.stringify(response.data.stats, null, 2));

        // 로컬에 결과 URL 저장
        const resultPath = path.join(__dirname, "output_url.txt");
        fs.writeFileSync(resultPath, response.data.url);
        console.log(`\nOutput URL saved to: ${resultPath}`);

        return response.data;

    } catch (error) {
        console.error("\n===========================================");
        console.error("❌ ERROR!");
        console.error("===========================================");
        console.error("Message:", error.message);
        if (error.response?.data) {
            console.error("Response:", JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

// 실행
combineVideos()
    .then(result => {
        console.log("\n\n🎉 Video combine completed successfully!");
        process.exit(0);
    })
    .catch(err => {
        console.error("\n\n❌ Video combine failed!");
        process.exit(1);
    });
