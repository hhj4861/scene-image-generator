/**
 * Universal Puppy Video Render Script
 * 동적으로 다양한 프로젝트를 렌더링할 수 있는 통합 스크립트
 * 
 * Usage:
 *   node render_puppy_video.mjs --project=low-birth --ngrok=https://xxx.ngrok-free.app
 *   node render_puppy_video.mjs --project=party-pajama --ngrok=https://xxx.ngrok-free.app
 *   node render_puppy_video.mjs --config=./custom_config.json --ngrok=https://xxx.ngrok-free.app
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PARSE COMMAND LINE ARGS ---
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    acc[key] = value;
    return acc;
}, {});

// --- DEFAULT CONFIG ---
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";

// Try to get ngrok URL from args, env, or auto-detect
async function getNgrokUrl() {
    if (args.ngrok) return args.ngrok;
    if (process.env.NGROK_URL) return process.env.NGROK_URL;

    // Try to auto-detect from ngrok API
    try {
        const res = await fetch('http://localhost:4040/api/tunnels');
        const data = await res.json();
        if (data.tunnels?.[0]?.public_url) {
            return data.tunnels[0].public_url;
        }
    } catch (e) {
        // ngrok not running or not accessible
    }
    return null;
}

// --- PROJECT CONFIGS ---
const PROJECT_CONFIGS = {
    'low-birth': {
        name: 'Low Birth Rate',
        localPath: 'test_code/low-birth', // relative to script location
        ngrokPath: 'pipedream_puppy/test_code/low-birth', // relative to ngrok root
        videoDir: 'generated_videos',
        scriptFile: 'script/final_video_order.json',
        header: '[댕댕] 땅콩이의 충격적인 저출산 대책 ㅋㅋ',
        headerEn: "🐶 Puppy's SHOCKING Solution to Low Birth Rate LOL",
        footer: '구독하면 귀여운 애기 생김',
        bgm: 'https://cdn1.suno.ai/2bc13c1d-4541-4eab-aa2c-e4e92c3808ed.mp3',
        bgmVolume: 0.2
    },
    'party-pajama': {
        name: 'Party Pajama',
        localPath: 'test_code/party-pajama',
        ngrokPath: 'pipedream_puppy/test_code/party-pajama',
        videoDir: 'script_sample/generated_videos',
        scriptFile: 'script_sample/vedio_prompt.json',
        header: '땅콩이의 특별한 파자마 파티',
        headerEn: "Peanut's Special Pajama Party",
        footer: '땅콩속보🚨',
        bgm: 'https://cdn1.suno.ai/9a0604be-6f66-41b1-be78-3022ab188833.mp3',
        bgmVolume: 0.2
    }
};

// --- LOAD CONFIG ---
async function loadConfig() {
    let config;

    if (args.config) {
        // Load from custom config file
        const configPath = path.resolve(args.config);
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`📄 Loaded config from: ${configPath}`);
    } else if (args.project && PROJECT_CONFIGS[args.project]) {
        config = PROJECT_CONFIGS[args.project];
        console.log(`📦 Using project config: ${args.project}`);
    } else {
        console.log('\n❌ ERROR: Please specify a project or config file');
        console.log('\nAvailable projects:');
        Object.keys(PROJECT_CONFIGS).forEach(p => {
            console.log(`  --project=${p} : ${PROJECT_CONFIGS[p].name}`);
        });
        console.log('\nOr use custom config:');
        console.log('  --config=./path/to/config.json');
        process.exit(1);
    }

    // Override with command line args
    if (args.header) config.header = args.header;
    if (args.headerEn) config.headerEn = args.headerEn;
    if (args.footer) config.footer = args.footer;
    if (args.bgm) config.bgm = args.bgm;
    if (args.bgmVolume) config.bgmVolume = parseFloat(args.bgmVolume);

    return config;
}

// --- LOAD VIDEO ORDER ---
function loadVideoOrder(config) {
    const scriptPath = path.join(__dirname, config.localPath, config.scriptFile);
    const data = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));

    // Handle different script formats
    if (data.video_order) {
        return data.video_order; // final_video_order.json format
    } else if (data.$return_value?.scenes) {
        return data.$return_value.scenes; // vedio_prompt.json format
    } else if (data.scenes) {
        return data.scenes;
    }

    throw new Error(`Unknown script format in ${scriptPath}`);
}

// --- VERIFY SUBTITLES ---
function verifySubtitles(videoOrder) {
    console.log('\n📋 Verifying Subtitles...');
    let allValid = true;

    videoOrder.forEach((scene, i) => {
        const hasKorean = !!(scene.narration_korean || scene.dialogue?.script || scene.narration);
        const hasEnglish = !!(scene.narration_english || scene.dialogue?.script_english);
        const file = scene.file || `scene_${scene.index || i}.mp4`;

        const koreanText = scene.narration_korean || scene.dialogue?.script || scene.narration || '';
        const englishText = scene.narration_english || scene.dialogue?.script_english || '';

        console.log(`  [${i}] ${file}`);
        console.log(`      KR: ${hasKorean ? '✅' : '❌'} ${koreanText.substring(0, 40)}...`);
        console.log(`      EN: ${hasEnglish ? '✅' : '❌'} ${englishText.substring(0, 40)}...`);

        if (!hasKorean || !hasEnglish) {
            allValid = false;
        }
    });

    return allValid;
}

// --- STRIP PARENTHESES CONTENT ---
// Remove text inside parentheses (e.g., "(신나서)" -> "")
function stripParentheses(text) {
    if (!text) return '';
    // Remove content in parentheses and trim extra spaces (but preserve newlines)
    return text
        .replace(/\([^)]*\)/g, '')  // Remove (content)
        .replace(/[ \t]+/g, ' ')    // Collapse multiple spaces/tabs (NOT newlines)
        .replace(/\n /g, '\n')      // Remove space after newline
        .replace(/ \n/g, '\n')      // Remove space before newline
        .trim();
}

// --- BUILD VIDEOS ARRAY ---
function buildVideosArray(videoOrder, config, ngrokUrl) {
    return videoOrder.map((scene, i) => {
        const file = scene.file || `scene_${scene.index || i + 1}.mp4`;
        const videoPath = `${config.ngrokPath}/${config.videoDir}/${file}`;

        // Get raw text and strip parentheses for subtitles
        const rawKorean = scene.narration_korean || scene.dialogue?.script || scene.narration || '';
        const rawEnglish = scene.narration_english || scene.dialogue?.script_english || '';
        const cleanKorean = stripParentheses(rawKorean);
        const cleanEnglish = stripParentheses(rawEnglish);

        return {
            url: `${ngrokUrl}/${videoPath}`,
            index: i,
            duration: scene.duration_seconds || scene.duration || 4,
            narration: cleanKorean,
            narration_korean: cleanKorean,
            narration_english: cleanEnglish,
            dialogue: {
                script: cleanKorean,
                script_english: cleanEnglish,
                interviewer: scene.dialogue?.interviewer || ''
            },
            spoken_language: scene.spoken_language || 'korean',
            scene_type: scene.scene_type || scene.scene_details?.scene_type || 'interview_answer',
            is_interview_question: scene.is_interview_question || scene.scene_details?.is_interview_question || false,
            speaker: scene.speaker || scene.scene_details?.speaker || 'main',
            character_name: scene.character_name || scene.scene_details?.character_name || '땅콩'
        };
    });
}

// --- MAIN ---
async function main() {
    console.log('🚀 Universal Puppy Video Render\n');

    // Load config
    const config = await loadConfig();
    console.log(`📜 Header: ${config.header}`);
    console.log(`📜 Header (EN): ${config.headerEn}`);
    console.log(`📜 Footer: ${config.footer}`);
    console.log(`🎵 BGM: ${config.bgm}`);

    // Get ngrok URL
    const ngrokUrl = await getNgrokUrl();
    if (!ngrokUrl) {
        console.error('\n❌ ERROR: ngrok URL not found!');
        console.error('   Run: ngrok http 8081');
        console.error('   Then: node render_puppy_video.mjs --project=xxx --ngrok=https://xxx.ngrok-free.app');
        process.exit(1);
    }
    console.log(`🔗 ngrok: ${ngrokUrl}`);

    // Load video order
    const videoOrder = loadVideoOrder(config);
    console.log(`📹 Found ${videoOrder.length} scenes`);

    // Verify subtitles
    const subtitlesValid = verifySubtitles(videoOrder);
    if (!subtitlesValid) {
        console.warn('\n⚠️ Warning: Some subtitles are missing!');
    }

    // Build videos array
    const videos = buildVideosArray(videoOrder, config, ngrokUrl);

    // ★★★ 디버그: 자막 개행 확인 ★★★
    console.log('\n📋 Subtitle Debug (checking newlines):');
    videos.slice(0, 3).forEach((v, i) => {
        console.log(`  Scene ${i}: KR has \\n: ${v.narration_korean.includes('\n')}, EN has \\n: ${v.narration_english.includes('\n')}`);
        if (v.narration_korean.includes('\n')) {
            console.log(`    KR text: ${JSON.stringify(v.narration_korean)}`);
        }
    });

    // Calculate total duration
    const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
    console.log(`\n✅ Total scenes: ${videos.length}`);
    console.log(`⏱️ Total duration: ${totalDuration}s`);

    // Build folder name
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const projectName = args.project || 'custom';
    const folderName = `${date}_${projectName}_render`;

    // Build payload
    const payload = {
        videos: videos,
        bgm_url: config.bgm,
        bgm_volume: config.bgmVolume || 0.2,
        header_text: config.header,
        header_text_english: config.headerEn,
        footer_text: config.footer,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${folderName}/final_video.mp4`,
        folder_name: folderName
    };

    // Call VM
    console.log('\n🔗 Calling FFmpeg VM...');
    console.log(`Endpoint: ${FFMPEG_VM_URL}/render/puppy`);

    try {
        const res = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`VM Error (${res.status}): ${txt}`);
        }

        const json = await res.json();
        console.log('\n✅ VM Response:', JSON.stringify(json, null, 2));
        console.log(`\n🎉 Final Video URL: ${json.url}`);
    } catch (err) {
        console.error('❌ Failed to call VM:', err.message);
        process.exit(1);
    }
}

main();
