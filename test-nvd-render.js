/**
 * test-nvd-render.js
 *
 * stock_nvd 폴더의 영상, 음성, 자막을 VM FFmpeg 서버로 조합하는 테스트 코드
 * - 로컬 비디오 파일 사용 (씬1~씬5.mp4)
 * - 로컬 나레이션 파일 사용
 * - 로컬 BGM 파일 사용
 * - 각 씬의 timing만큼 영상 반복 재생
 * - 자막 타이밍에 맞춰 표시
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Storage } from '@google-cloud/storage';

const execAsync = promisify(exec);

// VM 서버 주소
const FFMPEG_SERVER_URL = process.env.FFMPEG_SERVER_URL || 'http://34.64.168.173:3000';

// 파일 경로
const BASE_DIR = '/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/stock_nvd';
const SCRIPT_PATH = path.join(BASE_DIR, 'script', '자막.json');
const VIDEO_DIR = path.join(BASE_DIR, 'vedio');
const NARRATION_DIR = path.join(BASE_DIR, 'narration');
const BGM_DIR = path.join(BASE_DIR, 'bgm');
const TEMP_DIR = path.join(BASE_DIR, 'temp_processed');

// GCS 설정
const OUTPUT_BUCKET = 'shorts-videos-storage-mcp-test-457809';

// GCS 클라이언트
const storage = new Storage();

/**
 * GCS에 파일 업로드
 */
async function uploadToGCS(filePath, bucket, gcsPath) {
    await storage.bucket(bucket).upload(filePath, {
        destination: gcsPath,
        metadata: { contentType: filePath.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4' }
    });

    return `https://storage.googleapis.com/${bucket}/${gcsPath}`;
}

/**
 * timing 문자열 파싱 (예: "0-8s" -> {start: 0, end: 8, duration: 8})
 */
function parseTiming(timingStr) {
    if (!timingStr) return { start: 0, end: 5, duration: 5 };
    const match = timingStr.match(/(\d+)-(\d+)s?/);
    if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        return { start, end, duration: end - start };
    }
    return { start: 0, end: 5, duration: 5 };
}

/**
 * 원본 영상에서 오디오 제거 + duration만큼 루핑
 */
async function processVideos(scenes) {
    console.log('\n🔇 Processing videos (loop to duration + add silent audio)...');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const processedVideos = [];

    for (const scene of scenes) {
        const sceneNum = scene.scene_number;
        const timing = parseTiming(scene.timing);
        const targetDuration = timing.duration;

        // 비디오 파일명: 씬1.mp4, 씬2.mp4, ...
        const videoFileName = `씬${sceneNum}.mp4`;
        const inputPath = path.join(VIDEO_DIR, videoFileName);
        const outputPath = path.join(TEMP_DIR, `processed_scene_${sceneNum}.mp4`);

        if (!fs.existsSync(inputPath)) {
            console.warn(`   ⚠️ Video file not found: ${videoFileName}`);
            continue;
        }

        // FFmpeg: 루핑(-stream_loop) + 길이 제한(-t) + 무음 오디오 추가
        const cmd = `ffmpeg -y -stream_loop -1 -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -t ${targetDuration} -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 23 -c:a aac -shortest "${outputPath}"`;

        console.log(`   Scene ${sceneNum}: ${videoFileName} -> ${targetDuration}s (silent audio track)`);

        try {
            await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });
            processedVideos.push({
                sceneNum,
                path: outputPath,
                duration: targetDuration,
                startTime: timing.start
            });
            console.log(`     ✅ Created: processed_scene_${sceneNum}.mp4`);
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }
    }

    return processedVideos;
}

/**
 * 메인 실행 함수 - 나레이션 + BGM 사용
 */
async function main() {
    console.log('='.repeat(60));
    console.log('🎬 NVD (Nvidia) Video Composition with Narration');
    console.log('='.repeat(60));

    // 1. 자막 스크립트 로드
    console.log('\n📖 Loading script...');
    const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf-8'));
    const scenes = scriptData.scenes;
    console.log(`   Found ${scenes.length} scenes`);
    console.log(`   Title: ${scriptData.title_ko}`);
    console.log(`   Total duration: ${scriptData.total_duration}`);

    // 2. 나레이션 파일 확인
    const narrationFiles = fs.readdirSync(NARRATION_DIR).filter(f => f.endsWith('.mp3'));
    const narrationFile = narrationFiles[0];
    console.log(`   Narration: ${narrationFile}`);

    // 3. BGM 파일 확인
    const bgmFiles = fs.readdirSync(BGM_DIR).filter(f => f.endsWith('.mp3'));
    const bgmFile = bgmFiles[0];
    console.log(`   BGM: ${bgmFile}`);

    // 4. 영상 처리 (오디오 제거 + 루핑)
    const processedVideos = await processVideos(scenes);

    if (processedVideos.length === 0) {
        throw new Error('No videos processed');
    }

    // 5. 파일들 GCS 업로드
    console.log('\n📤 Uploading files to GCS...');

    // 나레이션 업로드
    const narrationPath = path.join(NARRATION_DIR, narrationFile);
    const gcsNarrationPath = `test/nvd/audio/narration_${Date.now()}.mp3`;
    const narrationUrl = await uploadToGCS(narrationPath, OUTPUT_BUCKET, gcsNarrationPath);
    console.log(`   ✅ Narration -> ${narrationUrl}`);

    // BGM 업로드 (나중에 믹싱 가능하도록)
    const bgmPath = path.join(BGM_DIR, bgmFile);
    const gcsBgmPath = `test/nvd/audio/bgm_${Date.now()}.mp3`;
    const bgmUrl = await uploadToGCS(bgmPath, OUTPUT_BUCKET, gcsBgmPath);
    console.log(`   ✅ BGM -> ${bgmUrl}`);

    // 영상 업로드
    const videoUrls = [];
    for (const video of processedVideos) {
        const gcsPath = `test/nvd/processed/scene_${video.sceneNum}_${Date.now()}.mp4`;
        const url = await uploadToGCS(video.path, OUTPUT_BUCKET, gcsPath);
        videoUrls.push({
            index: video.sceneNum - 1,
            url: url,
            duration: video.duration,
            scene_id: video.sceneNum
        });
        console.log(`   ✅ Scene ${video.sceneNum}`);
    }

    videoUrls.sort((a, b) => a.index - b.index);

    // 6. 자막 데이터 (이미 초 단위)
    const SUBTITLE_OFFSET = -1.5; // 자막을 1.5초 앞당김
    const timedSubtitles = [];

    for (const scene of scenes) {
        if (scene.subtitles) {
            for (const sub of scene.subtitles) {
                const startTime = Math.max(0, sub.start + SUBTITLE_OFFSET);
                const endTime = Math.max(0, sub.end + SUBTITLE_OFFSET);
                timedSubtitles.push({
                    start_time: startTime,
                    end_time: endTime,
                    text_ko: sub.text_ko,
                    text_en: sub.text_en,
                    color: 'white'
                });
            }
        }
    }

    console.log(`\n📝 Timed subtitles: ${timedSubtitles.length} (offset: ${SUBTITLE_OFFSET}s)`);
    if (timedSubtitles.length > 0) {
        console.log(`   First: ${timedSubtitles[0].start_time}s - ${timedSubtitles[0].end_time}s`);
        console.log(`   Last: ${timedSubtitles[timedSubtitles.length-1].start_time}s - ${timedSubtitles[timedSubtitles.length-1].end_time}s`);
    }

    // 7. 총 재생 시간
    const totalDuration = processedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`   Total video duration: ${totalDuration}s`);

    // 8. 서버 렌더링 요청
    const payload = {
        videos: videoUrls,
        bgm_url: narrationUrl, // 나레이션을 BGM 슬롯에 (영상에 오디오가 없으므로)
        bgm_volume: 1.0,
        use_original_audio: false,
        header_text: scriptData.title_ko,
        header_text_english: scriptData.title_en,
        footer_text: 'Nvidia Stock News',
        footer_text_english: 'Subscribe & Like',
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        timed_subtitles: timedSubtitles,
        width: 1080,
        height: 1920,
        output_bucket: OUTPUT_BUCKET,
        output_path: `test/nvd/final_nvd_${Date.now()}.mp4`,
        folder_name: 'nvd_news'
    };

    console.log('\n🚀 Sending render request...');
    console.log(`   Server: ${FFMPEG_SERVER_URL}`);
    console.log(`   Videos: ${videoUrls.length}`);
    console.log(`   Audio: Narration (BGM uploaded but not mixed)`);

    try {
        const response = await axios.post(
            `${FFMPEG_SERVER_URL}/render/puppy`,
            payload,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 600000
            }
        );

        console.log('\n' + '='.repeat(60));
        console.log('✅ Render complete!');
        console.log('='.repeat(60));
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.url) {
            console.log(`\n🎬 Final video: ${response.data.url}`);
        }

    } catch (error) {
        console.error('\n❌ Render failed:', error.response?.data || error.message);
    }

    // 정리
    console.log('\n🧹 Cleaning up temp files...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

// 실행
main().catch(console.error);
