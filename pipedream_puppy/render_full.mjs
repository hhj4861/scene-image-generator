
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// --- DATA ---
const SCENES = [
    { file: "scene_000.mp4", duration: 4, kr: "존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!", en: "My beloved dog citizens! I will reveal the truth of the Hot Chocolate Gate!" },
    { file: "scene_001.mp4", duration: 6, kr: "땅콩 씨, 핫초코 게이트에 대한 음모론을 제기하셨는데요, 어떤 내용인가요?", en: "Mr. Ttang-kong, you've raised a conspiracy theory about the Hot Chocolate Gate. What is it?" },
    { file: "scene_002.mp4", duration: 6, kr: "범인은... 분명히 이 안에 있습니다! 핫초코를 훔쳐간 자, 반드시 찾아낼 겁니다!", en: "The culprit... is definitely among us! I will find whoever stole the hot chocolate!" },
    { file: "scene_003.mp4", duration: 4, kr: "그 날... 핫초코의 달콤한 향기가...", en: "That day... the sweet scent of hot chocolate..." },
    { file: "scene_004.mp4", duration: 6, kr: "", en: "" },
    { file: "scene_005.mp4", duration: 6, kr: "땅콩 씨, 혹시 핫초코를 드신 기억은 없으신가요?", en: "Mr. Ttang-kong, do you perhaps have no memory of drinking the hot chocolate?" },
    { file: "scene_006.mp4", duration: 6, kr: "아...아니요! 저는 결백합니다! 핫초코는 누가 훔쳐간 게 분명해요! 기억 안 나는 거야...", en: "N...No! I'm innocent! Someone must have stolen the hot chocolate! I don't remember..." },
    { file: "scene_007.mp4", duration: 4, kr: "에라 모르겠다! 그냥 맛있게 먹었으면 된 거 아니겠어요? 흐흐흐흐흐흐~", en: "Oh well, who cares! As long as it tasted good, right? Hehehehehe~" }
];

const HEADER_KR = "♨️땅콩♨️터졌다";
const HEADER_EN = "땅콩 SCANDAL";
const FOOTER = "땅콩속보🚨";

// --- PATHS ---
const BASE_DIR = path.resolve("pipedream_puppy/output");
const BGM_PATH = path.join(BASE_DIR, "bgm.mp3");
const FONT_PATH = path.join(BASE_DIR, "jalnan.ttf").replace(/\\/g, '/');
const OUTPUT_VIDEO = path.join(BASE_DIR, "full_movie.mp4");
const CONCAT_LIST_PATH = path.join(BASE_DIR, "concat_list.txt");
const FILTER_SCRIPT_PATH = path.join(BASE_DIR, "filter_script.txt");

// --- UTILS ---
const escape = (text) => text.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");

async function run() {
    console.log("🚀 Starting Full Video Render (Quotes + Escaped Commas)...");

    // 1. Create Concat List
    const concatContent = SCENES.map(s => `file '${path.join(BASE_DIR, s.file)}'`).join('\n');
    fs.writeFileSync(CONCAT_LIST_PATH, concatContent);
    console.log("✅ Concat list created.");

    // 2. Build Filter Graph content
    let filterGraph = `[1:a]volume=0.2[bgm];
[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out];
[0:v]drawtext=fontfile='${FONT_PATH}':text='${escape(HEADER_KR)}':fontcolor=white:fontsize=65:x=(w-text_w)/2:y=100:borderw=3:bordercolor=black:shadowx=2:shadowy=2,
drawtext=fontfile='${FONT_PATH}':text='${escape(HEADER_EN)}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=180:borderw=2:bordercolor=black:shadowx=1:shadowy=1,
drawtext=fontfile='${FONT_PATH}':text='${escape(FOOTER)}':fontcolor=yellow:fontsize=70:x=(w-text_w)/2:y=h-200:borderw=3:bordercolor=black:shadowx=2:shadowy=2`;

    let currentTime = 0;
    SCENES.forEach((scene) => {
        const start = currentTime;
        const end = currentTime + scene.duration;

        // Quotes around value AND escaped commas inside: enable='between(t\,0\,4)'
        const enableExpr = `between(t\\,${start}\\,${end})`;

        if (scene.kr && scene.kr.trim() !== "") {
            filterGraph += `,drawtext=fontfile='${FONT_PATH}':text='${escape(scene.kr)}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=h/2+280:borderw=2:bordercolor=black:shadowx=2:shadowy=2:enable='${enableExpr}'`;

            if (scene.en) {
                filterGraph += `,drawtext=fontfile='${FONT_PATH}':text='${escape(scene.en)}':fontcolor=yellow:fontsize=35:x=(w-text_w)/2:y=h/2+340:borderw=2:bordercolor=black:shadowx=2:shadowy=2:enable='${enableExpr}'`;
            }
        }
        currentTime += scene.duration;
    });

    filterGraph += `[v_out]`;

    fs.writeFileSync(FILTER_SCRIPT_PATH, filterGraph);
    console.log("✅ Filter script created.");

    // 3. Run FFmpeg
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${CONCAT_LIST_PATH}" -i "${BGM_PATH}" \
    -filter_complex_script "${FILTER_SCRIPT_PATH}" \
    -map "[v_out]" -map "[a_out]" -shortest \
    "${OUTPUT_VIDEO}"`;

    console.log("Executing FFmpeg...");
    exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            // console.error(stderr);
        } else {
            console.log("✅ Render Complete!");
            console.log(`Output: ${OUTPUT_VIDEO}`);
        }
    });
}

run();
