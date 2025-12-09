/**
 * test-snp500-render.js
 *
 * stock_snp500 폴더의 영상, 음성, 자막을 VM FFmpeg 서버로 조합하는 테스트 코드
 * - 원본 영상 오디오 제거
 * - Music API로 뉴스 분위기 BGM 생성
 * - 각 씬의 duration만큼 영상 반복 재생
 * - 자막 타이밍에 맞춰 표시
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Storage } from '@google-cloud/storage';

const execAsync = promisify(exec);

// VM 서버 주소
const FFMPEG_SERVER_URL = process.env.FFMPEG_SERVER_URL || 'http://34.64.168.173:3000';

// Music API 설정
const MUSICAPI_KEY = '6478c0c303251ea0c5bd237bba4d6695';
const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1';

// 파일 경로
const BASE_DIR = '/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/stock_snp500';
const SCRIPT_PATH = path.join(BASE_DIR, 'script', '자막.json');
const VIDEO_DIR = path.join(BASE_DIR, 'video');
const AUDIO_DIR = path.join(BASE_DIR, '음성');
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
 * duration 문자열을 초로 변환 (예: "5s" -> 5)
 */
function parseDuration(durationStr) {
    if (!durationStr) return 5;
    const match = durationStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 5;
}

/**
 * 시간 문자열을 초로 변환 (예: "00:00:05.000" -> 5, "00:01:12.000" -> 72)
 */
function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    // HH:MM:SS.ms 형식 파싱
    const match = timeStr.match(/(\d+):(\d+):(\d+)\.?(\d*)/);
    if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        const ms = parseInt(match[4]) || 0;
        return hours * 3600 + minutes * 60 + seconds + ms / 1000;
    }
    // MM:SS.ms 형식 파싱
    const match2 = timeStr.match(/(\d+):(\d+)\.?(\d*)/);
    if (match2) {
        const minutes = parseInt(match2[1]) || 0;
        const seconds = parseInt(match2[2]) || 0;
        const ms = parseInt(match2[3]) || 0;
        return minutes * 60 + seconds + ms / 1000;
    }
    return parseFloat(timeStr) || 0;
}

/**
 * Music API로 뉴스 분위기 BGM 생성
 */
async function generateNewsBGM() {
    console.log('\n🎵 Generating news-style BGM with Music API...');

    const requestBody = {
        mv: 'sonic-v4-5',
        make_instrumental: true,
        custom_mode: true,
        title: 'News_BGM',
        tags: 'news, corporate, professional, modern, serious, broadcast, cinematic, orchestral, business, documentary'
    };

    console.log('   Tags:', requestBody.tags);

    const response = await axios.post(
        `${MUSICAPI_BASE}/sonic/create`,
        requestBody,
        {
            headers: {
                'Authorization': `Bearer ${MUSICAPI_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    if (!response.data.task_id) {
        throw new Error(`Failed to create music task: ${JSON.stringify(response.data)}`);
    }

    console.log('   Task ID:', response.data.task_id);
    return response.data.task_id;
}

/**
 * Music API 태스크 완료 대기
 */
async function waitForMusicTask(taskId, maxWaitSeconds = 300) {
    console.log('\n⏳ Waiting for BGM generation... (max 5 min)');

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
                    headers: { 'Authorization': `Bearer ${MUSICAPI_KEY}` }
                }
            );

            const data = response.data;
            const songs = data.data || [];

            if (songs.length > 0) {
                const song = songs[0];
                const isComplete = song.state === 'complete' ||
                    song.state === 'completed' ||
                    song.state === 'succeeded' ||
                    (song.duration && song.duration > 0 && song.audio_url && !song.audio_url.includes('audiopipe'));

                console.log(`   [${elapsed}s] State: ${song.state}, Duration: ${song.duration}s`);

                if (isComplete && song.audio_url) {
                    console.log('   ✅ BGM generation complete!');
                    return songs;
                }
            }
        } catch (error) {
            console.log(`   [${elapsed}s] Polling... (${error.message})`);
        }
    }

    throw new Error(`BGM generation timed out after ${maxWaitSeconds} seconds`);
}

/**
 * 원본 영상에서 오디오 제거 + duration만큼 루핑
 */
async function processVideos(scenes, videoFiles) {
    console.log('\n🔇 Processing videos (loop to duration + add silent audio)...');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const processedVideos = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneId = scene.scene_id;
        const targetDuration = parseDuration(scene.duration);
        const videoFile = videoFiles[i];

        if (!videoFile) {
            console.warn(`   ⚠️ No video file for scene ${sceneId}`);
            continue;
        }

        const inputPath = path.join(VIDEO_DIR, videoFile);
        const outputPath = path.join(TEMP_DIR, `processed_scene_${sceneId}.mp4`);

        // FFmpeg: 루핑(-stream_loop) + 길이 제한(-t) + 무음 오디오 추가 (서버가 [i:a] 스트림을 요구함)
        const cmd = `ffmpeg -y -stream_loop -1 -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -t ${targetDuration} -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 23 -c:a aac -shortest "${outputPath}"`;

        console.log(`   Scene ${sceneId}: ${videoFile} -> ${targetDuration}s (silent audio track)`);

        try {
            await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });
            processedVideos.push({
                sceneId,
                path: outputPath,
                duration: targetDuration,
                sceneName: scene.scene_name
            });
            console.log(`     ✅ Created: processed_scene_${sceneId}.mp4`);
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }
    }

    return processedVideos;
}

/**
 * 메인 실행 함수
 */
async function main() {
    console.log('='.repeat(60));
    console.log('🎬 SNP500 Video Composition with News BGM');
    console.log('='.repeat(60));

    // 1. 자막 스크립트 로드
    console.log('\n📖 Loading script...');
    const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf-8'));
    const scenes = scriptData.scenes;
    console.log(`   Found ${scenes.length} scenes`);

    // 2. 비디오 파일 목록
    const videoFiles = fs.readdirSync(VIDEO_DIR)
        .filter(f => f.endsWith('.mp4'))
        .sort();
    console.log(`   Video files: ${videoFiles.join(', ')}`);

    // 3. 나레이션 오디오 확인
    const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
    const narrationFile = audioFiles[0];
    console.log(`   Narration: ${narrationFile}`);

    // 4. Music API로 뉴스 BGM 생성 (병렬 시작)
    const bgmTaskId = await generateNewsBGM();

    // 5. 로컬에서 영상 처리 (오디오 제거 + 루핑)
    const processedVideos = await processVideos(scenes, videoFiles);

    if (processedVideos.length === 0) {
        throw new Error('No videos processed');
    }

    // 6. BGM 생성 완료 대기
    const bgmSongs = await waitForMusicTask(bgmTaskId);
    const bgmUrl = bgmSongs[0]?.audio_url;

    if (!bgmUrl) {
        throw new Error('No BGM URL received');
    }

    console.log(`\n🎵 BGM URL: ${bgmUrl}`);

    // 7. 처리된 영상들을 GCS에 업로드
    console.log('\n📤 Uploading processed videos to GCS...');

    const videoUrls = [];
    const uploadPromises = processedVideos.map(async (video) => {
        const gcsPath = `test/snp500/processed/processed_scene_${video.sceneId}.mp4`;
        const url = await uploadToGCS(video.path, OUTPUT_BUCKET, gcsPath);
        videoUrls.push({
            index: video.sceneId - 1,
            url: url,
            duration: video.duration,
            scene_id: video.sceneId,
            scene_name: video.sceneName
        });
        console.log(`   ✅ Scene ${video.sceneId} -> ${url}`);
    });

    // 나레이션 업로드
    let narrationUrl = null;
    if (narrationFile) {
        const narrationPath = path.join(AUDIO_DIR, narrationFile);
        const gcsNarrationPath = `test/snp500/audio/narration_${Date.now()}.mp3`;
        narrationUrl = await uploadToGCS(narrationPath, OUTPUT_BUCKET, gcsNarrationPath);
        console.log(`   ✅ Narration -> ${narrationUrl}`);
    }

    await Promise.all(uploadPromises);

    // index 기준 정렬
    videoUrls.sort((a, b) => a.index - b.index);

    // 8. timed_subtitles 생성 (시간을 초 단위로 변환)
    console.log('\n📝 Building timed subtitles...');
    const timedSubtitles = [];

    for (const scene of scenes) {
        if (scene.subtitles) {
            for (const sub of scene.subtitles) {
                timedSubtitles.push({
                    start_time: parseTimeToSeconds(sub.start),
                    end_time: parseTimeToSeconds(sub.end),
                    text_ko: sub.korean,
                    text_en: sub.english,
                    color: 'white'
                });
            }
        }
    }

    console.log(`   Total subtitles: ${timedSubtitles.length}`);
    if (timedSubtitles.length > 0) {
        console.log(`   First: ${timedSubtitles[0].start_time}s - ${timedSubtitles[0].end_time}s`);
        console.log(`   Last: ${timedSubtitles[timedSubtitles.length-1].start_time}s - ${timedSubtitles[timedSubtitles.length-1].end_time}s`);
    }

    // 9. 총 재생 시간 계산
    const totalDuration = processedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`   Total duration: ${totalDuration}s`);

    // 10. FFmpeg 서버에 렌더링 요청
    // 주의: 현재 서버는 영상 오디오를 concat하므로
    // 나레이션을 사용하려면 서버 수정이 필요
    // 대안: BGM + 나레이션을 미리 믹싱하거나, BGM만 사용

    const payload = {
        videos: videoUrls,
        bgm_url: bgmUrl, // 뉴스 BGM
        bgm_volume: 0.3, // BGM 볼륨 (나레이션 대비)
        use_original_audio: false, // 원본 비디오 오디오 사용 안함 (오디오가 제거된 영상)
        header_text: scriptData.video_info.title,
        header_text_english: 'S&P 500 2026 Analysis',
        footer_text: 'Stock Market',
        footer_text_english: 'Subscribe for updates',
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        timed_subtitles: timedSubtitles,
        width: 1080,
        height: 1920,
        output_bucket: OUTPUT_BUCKET,
        output_path: `test/snp500/final_snp500_news_${Date.now()}.mp4`,
        folder_name: 'snp500_news'
    };

    console.log('\n🚀 Sending render request to FFmpeg server...');
    console.log(`   Server: ${FFMPEG_SERVER_URL}`);
    console.log(`   Videos: ${videoUrls.length}`);
    console.log(`   BGM: ${bgmUrl.substring(0, 50)}...`);

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

        // 임시 파일 정리
        console.log('\n🧹 Cleaning up temp files...');
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    } catch (error) {
        console.error('\n❌ Render failed:', error.response?.data || error.message);
    }
}

/**
 * 나레이션 + BGM 믹싱 버전
 * Suno CDN이 로컬에서 차단되므로, 나레이션을 GCS에 업로드하고
 * 서버에서 BGM과 함께 처리하도록 함
 */
async function mainWithNarrationMix() {
    console.log('='.repeat(60));
    console.log('🎬 SNP500 Video with Narration + News BGM');
    console.log('='.repeat(60));

    // 1. 자막 스크립트 로드
    console.log('\n📖 Loading script...');
    const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf-8'));
    const scenes = scriptData.scenes;

    // 2. 비디오/오디오 파일
    const videoFiles = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.mp4')).sort();
    const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
    const narrationFile = audioFiles[0];

    // 3. BGM 생성 시작 (병렬)
    const bgmTaskId = await generateNewsBGM();

    // 4. 영상 처리 (오디오 제거 + 루핑)
    const processedVideos = await processVideos(scenes, videoFiles);

    // 5. BGM 완료 대기
    const bgmSongs = await waitForMusicTask(bgmTaskId);
    const bgmUrl = bgmSongs[0]?.audio_url;

    console.log(`\n🎵 BGM URL: ${bgmUrl}`);
    console.log('   ⚠️ Suno CDN blocks local downloads, BGM URL will be sent to server directly');

    // 6. 나레이션 업로드
    console.log('\n📤 Uploading narration to GCS...');
    const narrationPath = path.join(AUDIO_DIR, narrationFile);
    const gcsNarrationPath = `test/snp500/audio/narration_${Date.now()}.mp3`;
    const narrationUrl = await uploadToGCS(narrationPath, OUTPUT_BUCKET, gcsNarrationPath);
    console.log(`   ✅ Narration -> ${narrationUrl}`);

    // 7. 영상 업로드
    console.log('\n📤 Uploading processed videos...');
    const videoUrls = [];

    for (const video of processedVideos) {
        const gcsPath = `test/snp500/processed/scene_${video.sceneId}_${Date.now()}.mp4`;
        const url = await uploadToGCS(video.path, OUTPUT_BUCKET, gcsPath);
        videoUrls.push({
            index: video.sceneId - 1,
            url: url,
            duration: video.duration,
            scene_id: video.sceneId
        });
        console.log(`   ✅ Scene ${video.sceneId}`);
    }

    videoUrls.sort((a, b) => a.index - b.index);

    // 8. 자막 데이터 (시간을 초 단위로 변환, 1초 앞당김 - 음성 싱크 보정)
    const SUBTITLE_OFFSET = -1.5; // 자막을 1.5초 앞당김 (음성보다 늦게 표시되는 문제 해결)
    const timedSubtitles = [];
    for (const scene of scenes) {
        if (scene.subtitles) {
            for (const sub of scene.subtitles) {
                const startTime = Math.max(0, parseTimeToSeconds(sub.start) + SUBTITLE_OFFSET);
                const endTime = Math.max(0, parseTimeToSeconds(sub.end) + SUBTITLE_OFFSET);
                timedSubtitles.push({
                    start_time: startTime,
                    end_time: endTime,
                    text_ko: sub.korean,
                    text_en: sub.english,
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

    // 9. 서버 렌더링 요청
    // 나레이션을 메인 오디오로, BGM을 배경음악으로 사용
    // 현재 서버는 영상 오디오를 concat하므로, 나레이션을 BGM 슬롯에 넣고
    // BGM은 별도로 처리할 수 없음
    // 대안: 나레이션만 사용하고 BGM은 생략, 또는 서버 수정 필요

    const payload = {
        videos: videoUrls,
        bgm_url: narrationUrl, // 나레이션을 BGM 슬롯에 (영상에 오디오가 없으므로)
        bgm_volume: 1.0, // 나레이션 볼륨 100%
        use_original_audio: false, // 원본 비디오 오디오 사용 안함 (오디오가 제거된 영상)
        header_text: scriptData.video_info.title,
        header_text_english: 'S&P 500 2026 Forecast',
        footer_text: 'Market Analysis',
        footer_text_english: 'Subscribe & Like',
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        timed_subtitles: timedSubtitles,
        width: 1080,
        height: 1920,
        output_bucket: OUTPUT_BUCKET,
        output_path: `test/snp500/final_with_narration_${Date.now()}.mp4`,
        folder_name: 'snp500_narration'
    };

    console.log('\n🚀 Sending render request...');
    console.log(`   Server: ${FFMPEG_SERVER_URL}`);
    console.log(`   Videos: ${videoUrls.length}`);
    console.log(`   Audio: Narration only (BGM skipped due to Suno CDN block)`);

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
    console.log('\n🧹 Cleaning up...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

// 실행 모드 선택
const args = process.argv.slice(2);
const useNarration = args.includes('--with-narration');

if (useNarration) {
    console.log('Mode: With Narration + BGM Mix\n');
    mainWithNarrationMix().catch(console.error);
} else {
    console.log('Mode: BGM Only (no narration)\n');
    main().catch(console.error);
}