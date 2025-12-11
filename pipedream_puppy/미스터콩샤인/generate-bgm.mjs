import axios from 'axios';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input file path
const INPUT_JSON = path.join(__dirname, 'script/narration.json');
const OUTPUT_DIR = path.join(__dirname, 'audio');

// MusicAPI (Sonic) Configuration
const MUSICAPI_KEY = process.env.MUSICAPI_KEY;
const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1';

async function generateBGM() {
    if (!MUSICAPI_KEY) {
        console.error('❌ Error: MUSICAPI_KEY is not set.');
        console.error('Please run with: MUSICAPI_KEY=your_key node generate-bgm.mjs');
        process.exit(1);
    }

    // 1. Read Input JSON
    if (!existsSync(INPUT_JSON)) {
        console.error(`Error: Input file not found at ${INPUT_JSON}`);
        return;
    }

    const rawData = readFileSync(INPUT_JSON, 'utf8');
    const narrationData = JSON.parse(rawData);

    console.log('=================================================');
    console.log('🎬 미스터 땅샤인 BGM Generator');
    console.log('=================================================');
    console.log(`Title: ${narrationData.video_title}`);
    console.log(`Duration: ${narrationData.total_duration}`);
    console.log('');

    // 2. Prepare Output Directory
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 3. Analyze script content for BGM style
    // 미스터 땅샤인 (Mr. Sunshine parody) - K-Drama OST style
    // 조선시대 배경 + 로맨틱 드라마 + 귀환 스토리
    const bgmStyleTags = [
        // 메인 무드
        "Korean drama OST style",
        "emotional cinematic",
        "epic romantic",

        // 조선시대 느낌
        "traditional Korean elements",
        "gayageum subtle hints",

        // 드라마틱 요소
        "dramatic heroic",
        "nostalgic longing",
        "hopeful beginning",

        // 분위기
        "orchestral sentimental",
        "piano strings emotional",
        "sunrise hopeful mood",

        // 기술적 요소
        "soft crescendo build",
        "40 second short form"
    ];

    const bgmTags = bgmStyleTags.join(", ");
    const bgmTitle = "Mr_Ttangshine_OST_Ep1";
    const bgmDescription = `
Korean drama OST for "Mr. Ttangshine Episode 1 - Return of the Joseon Dog".
A Pomeranian dog named Eugene returns to Joseon after many years abroad.
He explores the changed streets, realizes it's snack time, and meets the elegant Aesin.
The music should evoke:
- Dramatic return/homecoming feeling at the beginning
- Nostalgic curiosity while exploring
- Cute comedic moment for snack time realization
- Romantic tension when meeting Aesin
Style: Korean drama OST, emotional, orchestral with subtle traditional Korean instruments.
Duration: 40 seconds, suitable for YouTube Shorts/Reels.
`.trim();

    console.log('🎵 BGM Style Configuration:');
    console.log(`   Tags: ${bgmTags.substring(0, 100)}...`);
    console.log(`   Title: ${bgmTitle}`);
    console.log('');
    console.log('📝 Content Summary:');
    console.log('   - Scene 1: Dramatic return to Joseon');
    console.log('   - Scene 2: Nostalgic exploration');
    console.log('   - Scene 3: Comedic snack time realization');
    console.log('   - Scene 4: Adventure to snack shop');
    console.log('   - Scene 5: Romantic first meeting');
    console.log('');

    // 4. Request BGM generation
    try {
        console.log('🎼 Requesting BGM generation from MusicAPI...');

        const createResponse = await axios.post(
            `${MUSICAPI_BASE}/sonic/create`,
            {
                mv: 'sonic-v4-5',           // Model version
                make_instrumental: true,     // Instrumental only (no vocals)
                custom_mode: true,
                title: bgmTitle,
                tags: bgmTags,
                prompt: bgmDescription       // 상세 설명 추가
            },
            {
                headers: {
                    'Authorization': `Bearer ${MUSICAPI_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!createResponse.data.task_id) {
            throw new Error(`Failed to create task: ${JSON.stringify(createResponse.data)}`);
        }

        const taskId = createResponse.data.task_id;
        console.log(`✓ Task created: ${taskId}`);
        console.log('⏳ Waiting for BGM generation (this may take 1-3 minutes)...\n');

        // 5. Poll for completion
        const maxWaitMs = 300000; // 5 minutes
        const pollInterval = 5000; // 5 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            const statusResponse = await axios.get(
                `${MUSICAPI_BASE}/sonic/task/${taskId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${MUSICAPI_KEY}`
                    }
                }
            );

            const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

            // Debug output every 30 seconds
            if (elapsedSec % 30 === 0 && elapsedSec > 0) {
                console.log(`\n[DEBUG ${elapsedSec}s] Response preview:`,
                    JSON.stringify(statusResponse.data, null, 2).substring(0, 300));
            }

            const taskStatus = statusResponse.data.status || statusResponse.data.state || 'unknown';
            process.stdout.write(`\r[${elapsedSec}s] Status: ${taskStatus}...`);

            if (taskStatus === 'complete' || taskStatus === 'completed' || taskStatus === 'succeeded') {
                console.log('\n\n✅ BGM Generation Complete!');

                const songs = statusResponse.data.data || statusResponse.data.clips || [];
                if (songs.length === 0) {
                    throw new Error('No songs in result');
                }

                // Save result info
                const resultPath = path.join(OUTPUT_DIR, 'bgm_result.json');
                writeFileSync(resultPath, JSON.stringify(statusResponse.data, null, 2));
                console.log(`✓ Result saved to: ${resultPath}`);

                // Download the completed songs
                for (let i = 0; i < songs.length; i++) {
                    const song = songs[i];
                    const audioUrl = song.audio_url || song.song_url || song.url;

                    if (audioUrl && !audioUrl.includes('audiopipe')) {
                        console.log(`\n📥 Downloading BGM ${i + 1}...`);
                        console.log(`   URL: ${audioUrl}`);

                        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                        const outputPath = path.join(OUTPUT_DIR, `bgm_mr_ttangshine_${i + 1}.mp3`);
                        writeFileSync(outputPath, audioResponse.data);
                        console.log(`   ✓ Saved to: ${outputPath}`);
                        console.log(`   Duration: ${song.duration || 'unknown'} seconds`);
                    }
                }

                console.log('\n=================================================');
                console.log('🎉 BGM Generation Complete!');
                console.log('=================================================');
                console.log(`Output directory: ${OUTPUT_DIR}`);
                return;

            } else if (taskStatus === 'failed' || taskStatus === 'error') {
                throw new Error(`Generation failed: ${statusResponse.data.error || 'Unknown error'}`);
            }
        }

        throw new Error('Generation timed out after 5 minutes');

    } catch (error) {
        console.error('\n❌ Failed to generate BGM:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error('   Details:', JSON.stringify(error.response.data));
        } else {
            console.error('   Error:', error.message);
        }
    }
}

// Run
generateBGM();
