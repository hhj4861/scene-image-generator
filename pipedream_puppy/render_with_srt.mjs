
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// --- DATA (Fallback from verify) ---
const SCENES = [
    { file: "scene_000.mp4", duration: 4, kr: "존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!", en: "My beloved dog citizens! I will reveal the truth of the Hot Chocolate Gate!" },
    { file: "scene_001.mp4", duration: 6, kr: "땅콩 씨, 핫초코 게이트에 대한 음모론을 제기하셨는데요, 어떤 내용인가요?", en: "Mr. Ttang-kong, you've raised a conspiracy theory about the Hot Chocolate Gate. What is it?" },
    { file: "scene_002.mp4", duration: 6, kr: "범인은... 분명히 이 안에 있습니다! 핫초코를 훔쳐간 자, 반드시 찾아낼 겁니다!", en: "The culprit... is definitely among us! I will find whoever stole the hot chocolate!" },
    { file: "scene_003.mp4", duration: 4, kr: "그 날... 핫초코의 달콤한 향기가...", en: "That day... the sweet scent of hot chocolate..." },
    { file: "scene_004.mp4", duration: 6, kr: "", en: "" }, // Flashback
    { file: "scene_005.mp4", duration: 6, kr: "땅콩 씨, 혹시 핫초코를 드신 기억은 없으신가요?", en: "Mr. Ttang-kong, do you perhaps have no memory of drinking the hot chocolate?" },
    { file: "scene_006.mp4", duration: 6, kr: "아...아니요! 저는 결백합니다! 핫초코는 누가 훔쳐간 게 분명해요! 기억 안 나는 거야...", en: "N...No! I'm innocent! Someone must have stolen the hot chocolate! I don't remember..." },
    { file: "scene_007.mp4", duration: 4, kr: "에라 모르겠다! 그냥 맛있게 먹었으면 된 거 아니겠어요? 흐흐흐흐흐흐~", en: "Oh well, who cares! As long as it tasted good, right? Hehehehehe~" }
];

const HEADER_KR = "[속보] 땅콩 대폭로 : 핫초코 게이트의 전말 ㅋㅋ";
const HEADER_EN = "[BREAKING] Ttang-kong Exposed : The Truth of Hot Chocolate Gate";
const FOOTER = "멍스타 뉴스";
const FOOTER_COLOR = "0xFF8C00"; // FFmpeg hex color format (0xRRGGBB) or string 'darkorange'
// Note: FFmpeg fontcolor accepts hex like '0xFF8C00' or '#FF8C00' depending on version. 
// Safest is to use the hex literal 0xFF8C00 or a web color if supported. 
// Let's use standard hex string styling if supported, or just the color name 'darkorange' (which matches standard web colors closely)
// But specific hex #FF8C00 is requested. FFmpeg drawtext uses 'fontcolor=0xFF8C00' (with 0x prefix often preferred) or '#FF8C00'.

// --- PATHS ---
const BASE_DIR = path.resolve("pipedream_puppy/output");
const BGM_PATH = path.join(BASE_DIR, "bgm.mp3");
const FONT_PATH = path.join(BASE_DIR, "jalnan.ttf").replace(/\\/g, '/');
const OUTPUT_VIDEO = path.join(BASE_DIR, "final_result_srt.mp4");
const CONCAT_LIST_PATH = path.join(BASE_DIR, "concat_list.txt");
const SRT_PATH = path.join(BASE_DIR, "subtitles.srt");

// --- UTILS ---
const escapeFilter = (text) => text.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");

// Helper to format time for SRT (00:00:00,000)
function formatSrtTime(seconds) {
    const pad = (num, size) => ('000' + num).slice(-size);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

async function run() {
    console.log("🚀 Starting Render with SRT...");

    // 1. Create Concat List
    const concatContent = SCENES.map(s => `file '${path.join(BASE_DIR, s.file)}'`).join('\n');
    fs.writeFileSync(CONCAT_LIST_PATH, concatContent);

    // 2. Generate SRT Content
    let srtContent = "";
    let currentTime = 0;

    SCENES.forEach((scene, index) => {
        const start = currentTime;
        const end = currentTime + scene.duration;

        if (scene.kr && scene.kr.trim() !== "") {
            srtContent += `${index + 1}\n`;
            srtContent += `${formatSrtTime(start)} --> ${formatSrtTime(end)}\n`;
            // Using HTML tags for colors: White for KR, Yellow for EN
            srtContent += `<font color="#FFFFFF" size="18">${scene.kr}</font>\n`;
            if (scene.en) {
                srtContent += `<font color="#FFFF00" size="12">${scene.en}</font>`;
            }
            srtContent += `\n\n`;
        }
        currentTime += scene.duration;
    });

    fs.writeFileSync(SRT_PATH, srtContent);
    console.log(`✅ SRT created at ${SRT_PATH}`);

    // 3. Build FFmpeg Command
    // Complex Filter:
    // [1:a]volume=0.2[bgm]; [0:a][bgm]amix...[a_out] (Audio)
    // [0:v]drawtext=HEADER,drawtext=FOOTER,subtitles=SRT[v_out] (Video)

    // We need to escape the SRT path for the filter arg
    const srtPathEscaped = SRT_PATH.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

    // NOTE: subtitles filter fontsdir option or force_style might be needed for custom font.
    // Try force_style with Fontname=Jalnan. If Jalnan is not a system font, it might fail to load.
    // But 'subtitles' filter handles simple styling well.
    // Alignment=2 (Bottom Center), MarginV=30 (Vertical Margin)

    const cmd = `ffmpeg -y -f concat -safe 0 -i "${CONCAT_LIST_PATH}" -i "${BGM_PATH}" \
    -filter_complex "\
[1:a]volume=0.2[bgm]; \
[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out]; \
[0:v]drawtext=fontfile='${FONT_PATH}':text='${escapeFilter(HEADER_KR)}':fontcolor=white:fontsize=65:x=(w-text_w)/2:y=100:borderw=3:bordercolor=black:shadowx=2:shadowy=2,\
drawtext=fontfile='${FONT_PATH}':text='${escapeFilter(HEADER_EN)}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=180:borderw=2:bordercolor=black:shadowx=1:shadowy=1,\
drawtext=fontfile='${FONT_PATH}':text='${escapeFilter(FOOTER)}':fontcolor=${FOOTER_COLOR}:fontsize=70:x=(w-text_w)/2:y=h-200:borderw=3:bordercolor=black:shadowx=2:shadowy=2,\
subtitles=filename='${srtPathEscaped}':force_style='Alignment=2,MarginV=250,BorderStyle=1,Outline=2,Shadow=1'[v_out] \
" \
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
