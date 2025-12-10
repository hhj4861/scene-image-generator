import axios from 'axios';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

// Input file path
const INPUT_JSON = 'stock-금리인하/script/narration.json';
const OUTPUT_DIR = 'stock-금리인하/audio';

// ElevenLabs Configuration
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = 'sf8Bpb1IU97NI9BHSMRf'; // User's selected voice from ElevenLabs library
const MODEL_ID = 'eleven_multilingual_v2'; // Required for Korean

async function generateStockNarration() {
    if (!API_KEY) {
        console.error('❌ Error: ELEVENLABS_API_KEY is not set.');
        console.error('Please run with: ELEVENLABS_API_KEY=your_key node generate-stock-narration.mjs');
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

    // 3. Concatenate all scene texts into a single full text
    const fullText = scenes.map(s => s.original).join(' ');
    console.log(`\nFull narration text length: ${fullText.length} characters`);

    console.log('=== Generating Full Narration (ElevenLabs: Rachel / Professional Stable Tone) ===\n');

    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            {
                text: fullText,
                model_id: MODEL_ID,
                voice_settings: {
                    stability: 0.8,           // Higher = more stable, professional
                    similarity_boost: 0.9,     // Higher = closer to original voice
                    style: 0.0,                // Lower = more neutral/professional
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 120000 // 2 minutes timeout for longer audio
            }
        );

        const outputPath = path.join(OUTPUT_DIR, 'full_narration.mp3');
        writeFileSync(outputPath, response.data);
        console.log(`✓ Full narration saved to: ${outputPath}`);
        console.log(`  File size: ${(response.data.length / 1024).toFixed(1)} KB`);

    } catch (error) {
        console.error('✗ Failed to generate full narration:');
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error('  Details:', JSON.stringify(error.response.data));
        } else {
            console.error('  Error:', error.message);
        }
    }

    console.log('\n=== Generation Complete ===');
    console.log(`Files saved to: ${path.resolve(OUTPUT_DIR)}`);
}

generateStockNarration().catch(console.error);

