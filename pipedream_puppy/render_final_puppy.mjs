
import { exec } from 'child_process';
import path from 'path';

// --- CONFIGURATION ---
const VIDEO_FILENAME = "scene_000.mp4"; // Corrected to scene_000.mp4
const BGM_FILENAME = "bgm.mp3";
const FONT_FILENAME = "jalnan.ttf";
const OUTPUT_FILENAME = "final_result.mp4";

// Resolve detailed absolute paths
const BASE_DIR = path.resolve("pipedream_puppy/output");
const VIDEO_PATH = path.join(BASE_DIR, VIDEO_FILENAME);
const BGM_PATH = path.join(BASE_DIR, BGM_FILENAME);
const FONT_PATH = path.join(BASE_DIR, FONT_FILENAME);
const OUTPUT_VIDEO = path.join(BASE_DIR, OUTPUT_FILENAME);

// --- TEXT --- 
const HEADER_TEXT = "♨️땅콩♨️터졌다";
const FOOTER_TEXT = "땅콩속보🚨";
const NARRATION_TEXT = "존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!";

// --- STYLING ---
const FONT_SIZE_HEADER = 65;
const FONT_SIZE_FOOTER = 70;
const FONT_SIZE_SUB = 55;
const COLOR_HEADER = "white";
const COLOR_FOOTER = "yellow";
const COLOR_SUB = "white";
const BORDER_COLOR = "black";
const BORDER_WIDTH = 3;

function renderVideo() {
    console.log(`🎬 Starting Final Render...`);
    console.log(`Input Video: ${VIDEO_PATH}`);
    console.log(`Input BGM: ${BGM_PATH}`);
    console.log(`Font: ${FONT_PATH}`);
    console.log(`Output: ${OUTPUT_VIDEO}`);

    const escape = (text) => text.replace(/'/g, "\\'").replace(/:/g, "\\:");

    // Use absolute paths in FFmpeg command
    const cmd = `ffmpeg -y \
    -i "${VIDEO_PATH}" \
    -i "${BGM_PATH}" \
    -filter_complex "\
    [1:a]volume=0.3[bgm]; \
    [0:v]drawtext=fontfile='${FONT_PATH}':text='${escape(HEADER_TEXT)}':fontcolor=${COLOR_HEADER}:fontsize=${FONT_SIZE_HEADER}:x=(w-text_w)/2:y=120:borderw=${BORDER_WIDTH}:bordercolor=${BORDER_COLOR}:shadowx=2:shadowy=2,\
    drawtext=fontfile='${FONT_PATH}':text='${escape(FOOTER_TEXT)}':fontcolor=${COLOR_FOOTER}:fontsize=${FONT_SIZE_FOOTER}:x=(w-text_w)/2:y=h-250:borderw=${BORDER_WIDTH}:bordercolor=${BORDER_COLOR}:shadowx=2:shadowy=2,\
    drawtext=fontfile='${FONT_PATH}':text='${escape(NARRATION_TEXT)}':fontcolor=${COLOR_SUB}:fontsize=${FONT_SIZE_SUB}:x=(w-text_w)/2:y=h/2+300:borderw=${BORDER_WIDTH}:bordercolor=${BORDER_COLOR}:shadowx=2:shadowy=2[v] \
    " \
    -map "[v]" -map "[bgm]" -shortest \
    "${OUTPUT_VIDEO}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ FFmpeg Error: ${error.message}`);
            console.error(`Stderr: ${stderr}`);
            return;
        }
        console.log(`✅ Final Rendering Complete!`);
        console.log(`Output: ${OUTPUT_VIDEO}`);
    });
}

renderVideo();
