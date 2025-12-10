/**
 * render-aqst.mjs
 *
 * AQST 영상 렌더링 스크립트
 * - 원본 영상을 씬별 duration만큼 반복 재생
 * - TTS 음성 + BGM 믹싱
 * - 타이밍별 자막 (한국어 + 영어)
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
const BASE_DIR = '/Users/honghyeonjong/home/IdeaProjects/scene-image-generator/pipedream_puppy/stock_aqst';
const SCRIPT_PATH = path.join(BASE_DIR, 'script.json');
const VIDEO_DIR = path.join(BASE_DIR, 'vedio');
const AUDIO_DIR = path.join(BASE_DIR, 'audio');
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
 * subtitle_timing의 time 문자열을 파싱 (예: "0-2.5s" -> {start: 0, end: 2.5})
 */
function parseTimeRange(timeStr) {
    if (!timeStr) return { start: 0, end: 0 };
    // "0-2.5s" 또는 "10-13s" 형식
    const match = timeStr.match(/(\d+\.?\d*)-(\d+\.?\d*)s?/);
    if (match) {
        return {
            start: parseFloat(match[1]),
            end: parseFloat(match[2])
        };
    }
    return { start: 0, end: 0 };
}

/**
 * 원본 영상에서 오디오 제거 + duration만큼 루핑
 */
async function processVideos(scenes) {
    console.log('\n🔇 Processing videos (loop to duration + add silent audio)...');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // 비디오 파일 목록
    const videoFiles = fs.readdirSync(VIDEO_DIR)
        .filter(f => f.endsWith('.mp4'))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            return numA - numB;
        });

    console.log(`   Video files found: ${videoFiles.join(', ')}`);

    const processedVideos = [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneId = scene.scene_id;
        const targetDuration = scene.duration_seconds;

        // 비디오 파일 매칭 (씬5는 씬4 재사용)
        // 비디오 파일: [씬1, 씬2, 씬3, 씬4, 씬6, 씬7] (씬5 없음)
        // 인덱스:      [0,   1,   2,   3,   4,   5]
        let videoFileIndex;
        if (sceneId <= 4) {
            videoFileIndex = sceneId - 1; // 씬1->0, 씬2->1, 씬3->2, 씬4->3
        } else if (sceneId === 5) {
            videoFileIndex = 3; // 씬4 재사용
        } else {
            videoFileIndex = sceneId - 2; // 씬6->4, 씬7->5
        }
        let videoFile = videoFiles[videoFileIndex] || videoFiles[videoFiles.length - 1];

        if (!videoFile) {
            console.warn(`   ⚠️ No video file for scene ${sceneId}, skipping`);
            continue;
        }

        const inputPath = path.join(VIDEO_DIR, videoFile);
        const outputPath = path.join(TEMP_DIR, `processed_scene_${sceneId}.mp4`);

        // FFmpeg: 루핑(-stream_loop) + 길이 제한(-t) + 무음 오디오 추가
        const cmd = `ffmpeg -y -stream_loop -1 -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -t ${targetDuration} -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 23 -c:a aac -shortest "${outputPath}"`;

        console.log(`   Scene ${sceneId}: ${videoFile} -> ${targetDuration}s`);

        try {
            await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });
            processedVideos.push({
                sceneId,
                path: outputPath,
                duration: targetDuration
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
    console.log('🎬 AQST Video Composition with Narration + BGM');
    console.log('='.repeat(60));

    // 1. 스크립트 로드
    console.log('\n📖 Loading script...');
    const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf-8'));
    const scenes = scriptData.scenes;
    console.log(`   Found ${scenes.length} scenes`);
    console.log(`   Total duration: ${scriptData.video_metadata.total_duration_seconds}s`);

    // 2. 나레이션 파일 확인 (full_narration.mp3 사용)
    const narrationFile = 'full_narration.mp3';
    const narrationPath = path.join(AUDIO_DIR, narrationFile);
    if (!fs.existsSync(narrationPath)) {
        throw new Error(`Narration file not found: ${narrationPath}`);
    }
    console.log(`   Narration: ${narrationFile}`);

    // 3. BGM 파일 확인
    const bgmFiles = fs.readdirSync(BGM_DIR).filter(f => f.endsWith('.mp3'));
    const bgmFile = bgmFiles[0];
    const bgmPath = bgmFile ? path.join(BGM_DIR, bgmFile) : null;
    console.log(`   BGM: ${bgmFile || 'None'}`);

    // 4. 영상 처리 (오디오 제거 + 루핑)
    const processedVideos = await processVideos(scenes);

    if (processedVideos.length === 0) {
        throw new Error('No videos processed');
    }

    // 5. 처리된 영상들을 GCS에 업로드
    console.log('\n📤 Uploading processed videos to GCS...');

    const timestamp = Date.now();
    const videoUrls = [];

    for (const video of processedVideos) {
        const gcsPath = `aqst_render/processed/scene_${video.sceneId}_${timestamp}.mp4`;
        const url = await uploadToGCS(video.path, OUTPUT_BUCKET, gcsPath);
        videoUrls.push({
            index: video.sceneId - 1,
            url: url,
            duration: video.duration,
            scene_id: video.sceneId
        });
        console.log(`   ✅ Scene ${video.sceneId} -> uploaded`);
    }

    // 나레이션 업로드
    const gcsNarrationPath = `aqst_render/audio/narration_${timestamp}.mp3`;
    const narrationUrl = await uploadToGCS(narrationPath, OUTPUT_BUCKET, gcsNarrationPath);
    console.log(`   ✅ Narration -> uploaded`);

    // BGM 업로드 (있으면)
    let bgmUrl = null;
    if (bgmPath) {
        const gcsBgmPath = `aqst_render/audio/bgm_${timestamp}.mp3`;
        bgmUrl = await uploadToGCS(bgmPath, OUTPUT_BUCKET, gcsBgmPath);
        console.log(`   ✅ BGM -> uploaded`);
    }

    // index 기준 정렬
    videoUrls.sort((a, b) => a.index - b.index);

    // 6. timed_subtitles 생성 (script.json의 subtitle_timing 사용)
    console.log('\n📝 Building timed subtitles...');
    const timedSubtitles = [];

    for (const scene of scenes) {
        if (scene.subtitle_timing) {
            for (const sub of scene.subtitle_timing) {
                const timeRange = parseTimeRange(sub.time);
                timedSubtitles.push({
                    start_time: timeRange.start,
                    end_time: timeRange.end,
                    text_ko: sub.text_ko,
                    text_en: sub.text_en,
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

    // 7. 총 재생 시간 계산
    const totalDuration = processedVideos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`   Total video duration: ${totalDuration}s`);

    // 8. FFmpeg 서버에 렌더링 요청
    const payload = {
        videos: videoUrls,
        bgm_url: narrationUrl, // 나레이션을 메인 오디오로 사용
        bgm_volume: 1.0, // 나레이션 볼륨 100%
        use_original_audio: false, // 원본 비디오 오디오 사용 안함
        header_text: 'AQST 심층분석',
        header_text_english: 'FDA D-52 Analysis',
        footer_text: '바이오 투자 정보',
        footer_text_english: 'Bio Investment Info',
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        timed_subtitles: timedSubtitles,
        width: 1080,
        height: 1920,
        // 레이아웃 설정 - 자막을 위로, 푸터 아래로
        use_origin_size: true,
        origin_layout: {
            video_area: {
                x: 0,
                y: 350,   // 상단 영문과 영상 사이 여백 증가 (260 -> 290)
                width: 1080,
                height: 1160  // 영상 높이 조정
            },
            header_area: {
                y: 180,   // 상단 한글 위 여백 증가 (110 -> 130)
                height: 120
            },
            subtitle_area: {
                y: 1350,  // 자막 Y 위치
                height: 200,
                single_line: false,
                max_lines: 2
            },
            footer_area: {
                y: 1550,  // 푸터와 영상 사이 여백 감소 (1600 -> 1550)
                height: 80
            },
            font_scale: 1
        },
        // 폰트 설정 - 자막 크기 키움
        font_settings: {
            header_korean: {
                font: "NanumSquareRoundOTFEB",
                size: 42,  // 헤더 한글 폰트 크기 증가
                color: "white",
                border_width: 2,
                border_color: "black"
            },
            header_english: {
                font: "NotoSerif-Regular",
                size: 18,
                color: "white",
                border_width: 1,
                border_color: "black"
            },
            subtitle_korean: {
                font: "NanumSquareRoundOTFEB",
                size: 55,  // 자막 한글 폰트 크기 증가 (50 -> 55)
                color: "white",
                border_width: 4,
                border_color: "black"
            },
            subtitle_english: {
                font: "NotoSerif-Regular",
                size: 35,  // 자막 영문 폰트 크기 증가 (30 -> 35)
                color: "white",
                border_width: 3,
                border_color: "black"
            }
        },
        output_bucket: OUTPUT_BUCKET,
        output_path: `aqst_render/final_aqst_${timestamp}.mp4`,
        folder_name: 'aqst_render'
    };

    console.log('\n🚀 Sending render request to FFmpeg server...');
    console.log(`   Server: ${FFMPEG_SERVER_URL}`);
    console.log(`   Videos: ${videoUrls.length}`);
    console.log(`   Subtitles: ${timedSubtitles.length}`);

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

main().catch(console.error);
