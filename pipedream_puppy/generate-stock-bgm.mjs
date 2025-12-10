import axios from 'axios';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// Input file path
const INPUT_JSON = 'stock-금리인하/script/narration.json';
const OUTPUT_DIR = 'stock-금리인하/audio';

// MusicAPI (Sonic) Configuration
const MUSICAPI_KEY = process.env.MUSICAPI_KEY;
const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1';

async function generateBGM() {
    if (!MUSICAPI_KEY) {
        console.error('❌ Error: MUSICAPI_KEY is not set.');
        console.error('Please run with: MUSICAPI_KEY=your_key node generate-stock-bgm.mjs');
        process.exit(1);
    }

    // 1. Read Input JSON
    if (!existsSync(INPUT_JSON)) {
        console.error(`Error: Input file not found at ${INPUT_JSON}`);
        return;
    }

    const rawData = readFileSync(INPUT_JSON, 'utf8');
    const scenes = JSON.parse(rawData);

    console.log(`Loaded ${scenes.length} scenes from ${INPUT_JSON}`);

    // 2. Prepare Output Directory
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 3. Analyze script content for BGM style
    // This is a stock/finance news script, so we need professional, serious BGM
    const scriptThemes = [
        "news-like background",
        "professional finance",
        "serious yet engaging",
        "stock market analysis",
        "business report ambience",
        "light tension",
        "dramatic undertones"
    ];

    const bgmTags = scriptThemes.join(", ");

    console.log('\n=== Generating BGM for Stock Script ===');
    console.log(`BGM Style: ${bgmTags}\n`);

    // 4. Request BGM generation
    try {
        const createResponse = await axios.post(
            `${MUSICAPI_BASE}/sonic/create`,
            {
                mv: 'sonic-v4-5',           // Model version
                make_instrumental: true,     // Instrumental only (no vocals)
                custom_mode: true,
                title: 'Stock_News_BGM',
                tags: bgmTags
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
        console.log(`Task created: ${taskId}`);
        console.log('Waiting for BGM generation (this may take 1-3 minutes)...\n');

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

            // Debug: Log full response to understand structure
            const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
            if (elapsedSec % 30 === 0 || elapsedSec < 10) {
                console.log(`\n[DEBUG ${elapsedSec}s] Full response:`, JSON.stringify(statusResponse.data, null, 2).substring(0, 500));
            }

            const taskStatus = statusResponse.data.status || statusResponse.data.state || 'unknown';
            process.stdout.write(`\r[${elapsedSec}s] Status: ${taskStatus}...`);

            if (taskStatus === 'complete' || taskStatus === 'completed' || taskStatus === 'succeeded') {
                console.log('\n\n✓ BGM Generation Complete!');

                const songs = statusResponse.data.data || statusResponse.data.clips || [];
                if (songs.length === 0) {
                    throw new Error('No songs in result');
                }

                // Download the first completed song
                for (let i = 0; i < songs.length; i++) {
                    const song = songs[i];
                    const audioUrl = song.audio_url || song.song_url || song.url;

                    if (audioUrl && !audioUrl.includes('audiopipe')) {
                        console.log(`\nDownloading BGM ${i + 1}...`);
                        console.log(`  URL: ${audioUrl}`);

                        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                        const outputPath = path.join(OUTPUT_DIR, `bgm_${i + 1}.mp3`);
                        writeFileSync(outputPath, audioResponse.data);
                        console.log(`  ✓ Saved to: ${outputPath}`);
                        console.log(`  Duration: ${song.duration || 'unknown'} seconds`);
                    }
                }

                console.log('\n=== BGM Generation Complete ===');
                return;
            } else if (taskStatus === 'failed' || taskStatus === 'error') {
                throw new Error(`Generation failed: ${statusResponse.data.error || 'Unknown error'}`);
            }
        }

        throw new Error('Generation timed out after 5 minutes');

    } catch (error) {
        console.error('\n✗ Failed to generate BGM:');
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error('  Details:', JSON.stringify(error.response.data));
        } else {
            console.error('  Error:', error.message);
        }
    }
}

generateBGM().catch(console.error);
