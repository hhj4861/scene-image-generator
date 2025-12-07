import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const TITLE_FOOTER_JSON = path.join(__dirname, 'script_sample', 'script.json');
const VIDEO_PROMPT_JSON = path.join(__dirname, 'script_sample', 'vedio_prompt.json');
const VIDEO_DIR = path.join(__dirname, 'script_sample', 'generated_videos');
const BGM_PATH = path.join(__dirname, 'bgm.mp3');
const FONT_PATH = '/Users/admin/Desktop/workSpace/socar/scene-image-generator/pipedream_puppy/output/jalnan.ttf';
const OUTPUT_VIDEO = path.join(__dirname, 'party_pajama_shorts.mp4');
const CONCAT_LIST_PATH = path.join(__dirname, 'concat_list.txt');
const FILTER_SCRIPT_PATH = path.join(__dirname, 'filter_script.txt');

// --- UTILS ---
const escape = (text) => {
    if (!text) return "";
    // Sanitize single quotes to avoid parsing issues for now
    return text.replace(/'/g, "").replace(/:/g, "\\:").replace(/,/g, "\\,");
};

async function run() {
    console.log("🚀 Starting Party Pajama Shorts Render...");

    // 1. Load Data
    const scriptData = JSON.parse(fs.readFileSync(TITLE_FOOTER_JSON, 'utf8'));
    const promptData = JSON.parse(fs.readFileSync(VIDEO_PROMPT_JSON, 'utf8'));

    // Extract Metadata
    // Try to find titles. 
    // scriptData.$return_value.title or scriptData.title
    const titleObj = scriptData.$return_value?.title || scriptData.title || {};
    const HEADER_KR = titleObj.korean || "파자마 파티";
    const HEADER_EN = titleObj.english || "Pajama Party";
    const FOOTER = "땅콩속보🚨"; // Default footer as requested by template style

    console.log(`Title KR: ${HEADER_KR}`);
    console.log(`Title EN: ${HEADER_EN}`);

    // Extract Scenes
    const scenesRaw = promptData.$return_value?.scenes || promptData.scenes || [];
    const SCENES = scenesRaw.map((s, i) => ({
        file: `scene_${i + 1}.mp4`, // test_generate_scenes.mjs saved as scene_1.mp4
        duration: s.duration_seconds || 6, // Default to 6 if missing
        kr: s.narration || s.narration_korean || "",
        en: s.narration_english || ""
    }));

    console.log(`Found ${SCENES.length} scenes.`);

    // 2. Create Concat List
    const concatContent = SCENES.map(s => `file '${path.join(VIDEO_DIR, s.file)}'`).join('\n');
    fs.writeFileSync(CONCAT_LIST_PATH, concatContent);
    console.log("✅ Concat list created at:", CONCAT_LIST_PATH);

    // 3. Build Filter Graph
    // Logic adapted from render_final_puppy.mjs: Linear chain with commas

    // Audio mixing remains separate
    let filterGraph = `[1:a]volume=0.2[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out];`;

    // Start Video Chain
    // We will build a single chain: [0:v]drawtext=...,drawtext=...,drawtext=...[v_out]
    let videoFilters = [];

    // Common style options to keep things clean
    // Common style options to keep things clean
    const fontOpt = `fontfile='${FONT_PATH}'`;
    const borderOpt = `borderw=3:bordercolor=black`; // Unquoted color
    const shadowOpt = `shadowx=2:shadowy=2`;
    const enShadowOpt = `shadowx=1:shadowy=1`;
    const centerOpt = `x=(w-text_w)/2`;

    // Order: shadows -> fontsize -> fontcolor -> pos -> text -> border -> fontfile (SAFE TERMINATOR)
    // 1. Header KR
    videoFilters.push(`drawtext=${shadowOpt}:fontsize=65:fontcolor=white:${centerOpt}:y=100:text='${escape(HEADER_KR)}':${borderOpt}:${fontOpt}`);

    // 2. Header EN
    videoFilters.push(`drawtext=${enShadowOpt}:fontsize=40:fontcolor=white:${centerOpt}:y=180:text='${escape(HEADER_EN)}':borderw=2:bordercolor=black:${fontOpt}`);

    // 3. Footer
    videoFilters.push(`drawtext=${shadowOpt}:fontsize=70:fontcolor=yellow:${centerOpt}:y=h-200:text='${escape(FOOTER)}':${borderOpt}:${fontOpt}`);

    // 4. Subtitles
    let currentTime = 0;
    SCENES.forEach((scene) => {
        const start = currentTime;
        const end = currentTime + scene.duration;
        // Verify: In filter_complex_script, backslashes ARE needed for commas inside quotes?
        // Step 1536 failed with "No such filter: 0", so yes, commas MUST be escaped.
        const enableExpr = `between(t\\,${start}\\,${end})`;

        // Subtitles (Korean)
        if (scene.kr && scene.kr.trim() !== "") {
            videoFilters.push(`drawtext=${shadowOpt}:enable='${enableExpr}':fontsize=50:fontcolor=white:${centerOpt}:y=h/2+280:text='${escape(scene.kr)}':borderw=2:bordercolor=black:${fontOpt}`);
        }

        // Subtitles (English)
        if (scene.en && scene.en.trim() !== "") {
            videoFilters.push(`drawtext=${shadowOpt}:enable='${enableExpr}':fontsize=35:fontcolor=yellow:${centerOpt}:y=h/2+340:text='${escape(scene.en)}':borderw=2:bordercolor=black:${fontOpt}`);
        }

        currentTime += scene.duration;
    });

    // Join all video filters with commas and wrap with input/output labels
    filterGraph += `[0:v]${videoFilters.join(',')}[v_out]`;

    fs.writeFileSync(FILTER_SCRIPT_PATH, filterGraph);
    console.log("✅ Filter script created at:", FILTER_SCRIPT_PATH);

    // 4. Run FFmpeg
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${CONCAT_LIST_PATH}" -i "${BGM_PATH}" \
    -filter_complex_script "${FILTER_SCRIPT_PATH}" \
    -map "[v_out]" -map "[a_out]" -shortest \
    "${OUTPUT_VIDEO}"`;

    console.log("Executing FFmpeg...");
    exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(stderr);
        } else {
            console.log("✅ Render Complete!");
            console.log(`Output: ${OUTPUT_VIDEO}`);
        }
    });
}

run();
