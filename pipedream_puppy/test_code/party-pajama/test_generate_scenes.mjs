import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY";
const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";
const ASPECT_RATIO = "9:16";

// Path to data
const SCRIPT_SAMPLE_DIR = path.join(__dirname, 'script_sample');
const IMAGE_SAMPLE_DIR = path.join(__dirname, 'image_sample');
const VIDEO_PROMPT_FILE = path.join(SCRIPT_SAMPLE_DIR, 'vedio_prompt.json');

// --- Helper Functions from veo3-video-generator.mjs ---

// Hangeul Vowel Mapping
const vowelMouthShapes = {
    0: "mouth wide open jaw drops",      // ㅏ
    1: "mouth open lips stretched",       // ㅐ
    2: "mouth wide open jaw drops",      // ㅑ
    3: "mouth open lips stretched",       // ㅒ
    4: "mouth medium open rounded",       // ㅓ
    5: "mouth open stretched",            // ㅔ
    6: "mouth medium open rounded",       // ㅕ
    7: "mouth open stretched",            // ㅖ
    8: "lips form round O",               // ㅗ
    9: "lips round then wide",            // ㅘ
    10: "lips round then stretched",      // ㅙ
    11: "lips round O shape",             // ㅚ
    12: "lips form round O",              // ㅛ
    13: "lips push forward round",        // ㅜ
    14: "lips forward then open",         // ㅝ
    15: "lips forward then stretched",    // ㅞ
    16: "lips push forward round",        // ㅟ
    17: "lips push forward round",        // ㅠ
    18: "lips stretch wide teeth close",  // ㅡ
    19: "lips stretch then sideways",     // ㅢ
    20: "lips stretch sideways teeth visible", // ㅣ
};

const extractMouthShapes = (text) => {
    if (!text) return "";
    let shapes = [];
    const uniqChars = [...new Set(text.split(''))];

    for (const char of uniqChars) {
        const code = char.charCodeAt(0);
        // Hangeul Syllable range: 0xAC00 ~ 0xD7A3
        if (code >= 0xAC00 && code <= 0xD7A3) {
            const vowelIndex = Math.floor(((code - 0xAC00) % 588) / 28);
            if (vowelMouthShapes[vowelIndex]) {
                shapes.push(`${char}=${vowelMouthShapes[vowelIndex]}`);
            }
        }
    }
    return shapes.slice(0, 10).join(", "); // Limit to top 10 unique chars
};

const calculateDurationFromNarration = (narration, baseDuration, isInterviewQuestion = false) => {
    if (!narration) return baseDuration;
    const syllableCount = narration.replace(/[^가-힣a-zA-Z0-9]/g, "").length;
    const syllablesPerSecond = isInterviewQuestion ? 6 : 5;
    const calculatedDuration = Math.ceil(syllableCount / syllablesPerSecond);
    if (calculatedDuration <= 4) return 4;
    if (calculatedDuration <= 6) return 6;
    return 8;
};

const actionKeywordMap = {
    "핫팩 댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
    "핫팩댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
    "댄스": "dancing energetically with body moving rhythmically",
    "춤추": "dancing happily with cute moves",
    "춤을": "dancing with adorable swaying motions",
    "춤": "dancing with cute body movements",
    "흔들흔들": "swaying body side to side playfully",
    "흔들": "swaying body gently",
    "폴짝폴짝": "hopping repeatedly with joy, bouncing up and down energetically",
    "폴짝": "hopping cutely, bouncing with excitement",
    "뛰어다": "running and jumping around playfully",
    "뛰어": "jumping excitedly with energy",
    "점프": "jumping up high with enthusiasm",
    "깡충깡충": "hopping like a bunny, bouncing cutely",
    "깡충": "bouncing hop, cute jumping motion",
    "펄쩍": "leaping up suddenly, big jump",
    "빙글빙글": "spinning around playfully, twirling in circles",
    "빙글": "spinning in a circle, cute twirl",
    "돌아가": "turning around in circles",
    "돌아": "turning motion, spinning",
    "회전": "spinning in place, rotating playfully",
    "꼬리 흔": "wagging tail happily and energetically",
    "꼬리를 흔": "wagging tail with excitement",
    "꼬리가 흔": "tail wagging automatically with joy",
    "살랑살랑": "swaying tail or body gently, soft wagging",
    "달려": "running forward quickly with excitement",
    "뛰어가": "running towards something eagerly",
    "달리": "running with speed",
    "뒹굴뒹굴": "rolling around playfully on the ground",
    "뒹굴": "rolling over cutely",
    "앉아": "sitting down cutely",
    "누워": "lying down comfortably",
    "일어나": "standing up, getting up energetically",
    "벌떡": "jumping up suddenly, getting up quickly",
    "박수": "clapping front paws together cutely",
    "손 흔들": "waving paw in greeting",
    "동동": "stomping or tapping feet cutely",
    "고개를 갸웃": "tilting head cutely to the side",
    "갸웃": "cute head tilt, curious pose",
    "하품": "yawning adorably",
    "기지개": "stretching body, doing a stretch",
    "부르르": "shaking body, shivering motion",
};

const detectActionsFromNarration = (narration) => {
    if (!narration) return [];
    const detected = [];
    const sortedKeywords = Object.keys(actionKeywordMap).sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
        if (narration.includes(keyword)) {
            detected.push({ keyword, action: actionKeywordMap[keyword] });
        }
    }
    return detected;
};

const sanitizeNarration = (text) => {
    if (!text) return "";
    let safe = text;
    safe = safe.replace(/\([^)]*\)\s*/g, "");
    const replacements = [
        [/사생팬/g, "열성팬"], [/스토커/g, "팬"], [/유출/g, "공개"],
        [/가만 ?안 ?둬/g, "용서 못해"], [/죽[이여을]|죽겠/g, "혼내"],
        [/침해/g, "방해"], [/분노/g, "화남"], [/살인|살해/g, ""],
        [/폭력|폭행/g, ""], [/무서워/g, "놀라워"], [/공포/g, "놀람"],
        [/위협/g, "경고"], [/콩파민/g, "Kong-pa-min"],
    ];
    for (const [p, r] of replacements) safe = safe.replace(p, r);
    return safe.trim();
};

const getVeo3Prompt = (scene, characters) => {
    const narration = scene.dialogue?.script || scene.dialogue?.interviewer || scene.narration || "";
    const duration = scene.duration_seconds || scene.duration || 6;
    const speaker = scene.speaker || "main";
    const validCharacterSpeakers = ["main", "sub1", "sub2", "sub3"];
    const isInterviewerSpeaking = !validCharacterSpeakers.includes(speaker);
    const hasKoreanDialogue = scene.has_narration && narration && !isInterviewerSpeaking;

    const visibleCharacterKey = scene.interview_question_info?.visible_character || speaker;
    const speakerCharacter = characters[visibleCharacterKey] || characters[speaker] || {};
    const characterType = speakerCharacter.character_type || "animal";
    const isAnimalCharacter = characterType === "animal";

    const getCharacterDescription = () => {
        const char = speakerCharacter;
        if (isAnimalCharacter) {
            const breed = char.breed || "dog";
            const furColor = char.fur_color || char.color || "fluffy";
            const furTexture = char.fur_texture || "fluffy";
            const accessories = char.accessories?.length ? char.accessories.join(", ") : "";
            const costume = char.costume || "";
            let desc = `${furColor} ${furTexture} ${breed}`;
            if (costume) desc += ` wearing ${costume}`;
            else if (accessories) desc += ` wearing ${accessories}`;
            return desc.trim();
        } else {
            const age = char.estimated_age_range || "";
            const gender = char.gender || "";
            const clothing = char.clothing || "";
            return `${age} ${gender} person${clothing ? ` wearing ${clothing}` : ""}`.trim();
        }
    };
    const characterDesc = getCharacterDescription();

    const silenceEnd = 1.0;
    const interviewerEnd = isInterviewerSpeaking ? duration : Math.min(duration * 0.4, 3.5);
    const characterSpeechStart = isInterviewerSpeaking ? duration : interviewerEnd;
    const characterSpeechEnd = duration;

    let emotion = scene.emotion?.primary || scene.emotion || "happy";

    // START MANUAL OVERRIDE FOR SCENE 5 & 6
    if (scene.index === 4 || (scene.dialogue && scene.dialogue.script && scene.dialogue.script.includes("누가 내 옷"))) { // Scene 5
        emotion = "embarrassed";
    }
    if (scene.index === 5 || (scene.dialogue && scene.dialogue.script && scene.dialogue.script.includes("내가 입어서"))) { // Scene 6
        emotion = "surprised";
    }
    // END MANUAL OVERRIDE

    const emotionExpressions = {
        happy: "happy cheerful expression with bright eyes",
        sad: "sad melancholic expression with droopy ears and teary eyes",
        angry: "angry frustrated expression with furrowed brows",
        scared: "scared worried expression with wide eyes and lowered ears",
        excited: "excited enthusiastic expression with sparkling eyes and perked ears",
        surprised: "surprised shocked expression with wide open eyes, mouth slightly open in gasp",
        worried: "worried anxious expression with furrowed brow",
        determined: "determined confident expression with focused eyes",
        proud: "proud confident expression with slight smirk and chin up",
        embarrassed: "embarrassed flustered expression, avoiding eye contact, shy look, ears slightly back",
    };

    const emotionDesc = emotionExpressions[emotion] || "natural expression";
    const expressionPrompt = ` CHARACTER EXPRESSION: ${emotionDesc}.`;

    const isHookScene = scene.is_hook_scene || scene.thumbnail_optimized || scene.index === 1; // Assuming index 1 is first scene
    const scriptFormat = scene.script_format || "interview";

    let basePrompt = `[CRITICAL: ABSOLUTELY NO TEXT, NO SUBTITLES, NO CAPTIONS, NO WRITTEN CHARACTERS OF ANY KIND VISIBLE IN VIDEO] 8K cinematic ${scriptFormat === "interview" ? "interview " : ""}video. Generate ONLY clean video with ZERO text on screen. Use the provided reference image as the exact visual base for the entire ${duration} seconds.`;

    if (isHookScene) {
        basePrompt += ` [HOOK SCENE - THUMBNAIL IMPACT] This is the FIRST scene that viewers see - make it visually STRIKING and attention-grabbing! EXTREME CLOSE-UP of face, BRIGHT vibrant colors, HIGH CONTRAST, expressive sparkling eyes, dynamic engaging composition.`;
    }

    basePrompt += ` A ${characterDesc} ${isAnimalCharacter ? "sits facing camera" : "faces camera"}.${expressionPrompt}`;
    basePrompt += ` The ${isAnimalCharacter ? "dog" : "character"} appearance must stay IDENTICAL to reference image from 0:00 to 0:0${duration}.`;
    basePrompt += ` VISUAL CONTINUITY: Same ${isAnimalCharacter ? "fur color, same face, same" : ""} appearance at 0:00, ${Math.floor(duration / 2)}:00, and ${duration}:00.`;

    if (isAnimalCharacter) {
        basePrompt += ` CONSISTENCY CHECK: ${characterDesc.split(" ")[0]} fur color must stay same throughout. No morphing. No distortion. No warping of face or body.`;
    } else {
        basePrompt += ` CONSISTENCY CHECK: Same clothing, same face throughout. No morphing. No distortion.`;
    }

    const noTextEmphasis = `ABSOLUTE CRITICAL RULE - NO TEXT ON SCREEN:
- NEVER generate subtitles or captions under any circumstance
- NEVER show ANY text, letters, characters, symbols, or writing visible in the video frame
- NEVER display Korean hangul characters (한글) on screen
- NEVER display Chinese characters on screen
- NEVER display Japanese characters on screen
- NEVER display English letters or words on screen
- NEVER display ANY garbled, corrupted, or broken text artifacts
- NEVER display random symbols that look like corrupted text
- NEVER add text overlays, watermarks, or labels
- NEVER show dialogue/speech as visible text
- NO text on microphone, props, clothing, or background
- The video must be 100% clean with ZERO text visible anywhere
- All dialogue is AUDIO ONLY - spoken words must never appear as text
- If you see ANY text appearing, regenerate without it
- VIDEO MUST BE COMPLETELY TEXT-FREE.`;

    const isPerformance = scene.is_performance || scene.scene_details?.is_performance;
    const perfInfo = scene.performance_info || {};
    const perfPhase = perfInfo.phase || scene.scene_details?.performance_phase;

    if (isPerformance && perfInfo.lip_sync_to === "bgm") {
        basePrompt += ` ${characterDesc} performing beatbox on stage. IMPORTANT: Mouth opens and closes frequently and visibly to the beat. Exaggerated mouth movements - wide open then closed repeatedly. Rapid lip sync mimicking beatbox sounds "boots and cats". Head bobbing, body grooving to rhythm. Cool confident energetic expression. Background audio: beatbox rhythmic music playing loudly.`;
    }

    if (hasKoreanDialogue && !isPerformance) {
        const emotionTone = emotion || "happy";
        const safeNarration = sanitizeNarration(narration);
        let voiceEffect = "";
        let endingExpression = "";

        if (narration.includes("콩파민")) {
            voiceEffect = " Fast robotic voice effect. Quick mechanical speech.";
        }

        if (/헤헤+|히히+|하하+|ㅎㅎ+|hehe|haha|호호+|흐흐+|크크+|ㅋㅋ+|푸하하/i.test(narration)) {
            endingExpression = isAnimalCharacter
                ? ` LAUGH EXPRESSION at end: Adorable soft baby giggling burst with LOW-PITCHED cooing sounds - eyes squint tight, whole face laughing, open happy laughing mouth showing teeth, can't stop laughing. Soft gentle baby chuckling. Rapid open-close-open mouth pattern for laughter. Uncontrollable cute infant giggling with low soft voice.`
                : " Shows warm laughing expression with natural wide smile and happy eyes.";
        }

        if (/흑흑|엉엉|흐흑|ㅠㅠ|ㅜㅜ|훌쩍/i.test(narration)) {
            endingExpression = isAnimalCharacter
                ? " CRYING EXPRESSION: Sad crying face with watery teary eyes, droopy ears lowered down, furrowed sad eyebrows, whimpering look. Eyes glistening with tears. Looks very sad and upset."
                : " Shows sad expression with teary eyes and sorrowful look.";
        }

        if (/꼬리.*흔들|tail.*wag/i.test(narration) && isAnimalCharacter) {
            endingExpression += " TAIL WAG ACTION: Dog's tail wags happily and energetically back and forth throughout the scene. Visible excited tail wagging motion. Fast happy tail movement visible in frame.";
        }

        if (/고개.*끄덕|네네|넵|알겠/i.test(narration)) endingExpression += " HEAD NOD: Head moves up and down in agreement, nodding motion.";
        if (/고개.*저|아니|싫어|안 ?해/i.test(narration)) endingExpression += " HEAD SHAKE: Head moves side to side in disagreement.";

        if (/훗|흥|쯧|후후/i.test(narration)) {
            endingExpression += isAnimalCharacter
                ? " PROUD EXPRESSION at end: Proud smug look with slight nose up, confident smirk, short proud huff through nose. Baby superiority expression."
                : " Shows proud confident expression with slight smirk.";
        }

        const emotionVoiceTone = {
            angry: "angry frustrated voice tone with intensity",
            sad: "sad melancholic voice tone with sorrow, slightly disappointed",
            scared: "scared trembling voice tone with fear",
            excited: "excited enthusiastic voice tone with energy, sparkling",
            happy: "happy cheerful voice tone, bright",
            surprised: "surprised shocked high-pitched voice tone, gasping",
            worried: "worried anxious voice tone",
            determined: "determined strong confident voice tone",
            proud: "proud confident tone with slight smugness",
            embarrassed: "embarrassed shaky voice tone, flustered, hesitant speech",
        };
        const voiceTone = emotionVoiceTone[emotionTone] || "natural expressive voice tone";

        // Generate mouth shapes dynamically for better sync
        const calculatedMouthShapes = extractMouthShapes(narration);
        const mouthShapesDesc = calculatedMouthShapes
            ? `MOUTH SHAPES FOR THIS DIALOGUE: ${calculatedMouthShapes}.`
            : `KOREAN MOUTH SHAPES: 아/야/가 = mouth wide open jaw drops, 오/요/고 = lips form small round O, 우/유/구 = lips round forward, 이/의/기 = lips stretch sideways.`;

        const lipSyncStyle = scene.lip_sync_style || {};
        const lipSyncMethod = lipSyncStyle.method || "Minimal mouth animation on static image";
        const lipSyncType = lipSyncStyle.type || "Subtle talking photo style";

        const lipSyncTiming = scene.lip_sync_timing || {};
        const timingDesc = Object.keys(lipSyncTiming).length > 0
            ? Object.entries(lipSyncTiming).map(([time, info]) => {
                if (typeof info === "object") return `${time}: ${info.mouth || info.text || ""}`;
                return `${time}: ${info}`;
            }).join(". ")
            : "";

        const sceneVoiceSettings = scene.voice_settings || {};
        const speakerVoice = sceneVoiceSettings[scene.character_name] || sceneVoiceSettings[speaker] || {};
        const voiceType = speakerVoice.type || (speaker === "main"
            ? "Korean baby infant voice, 1-2 years old, low-pitched adorable tone"
            : "natural Korean voice");
        const voiceCharacteristics = speakerVoice.characteristics || "babbling cooing speech with slight lisp";

        const detectedActions = detectActionsFromNarration(narration);
        const actionPrompt = detectedActions.length > 0
            ? ` IMPORTANT CHARACTER ACTION: ${characterDesc} is ${detectedActions.map(a => a.action).join(", ")} while speaking.`
            : "";

        if (isAnimalCharacter) {
            basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence dog waiting, ${characterSpeechStart}-${characterSpeechEnd}sec ${characterDesc.toLowerCase()} speaks Korean dialogue.`;
            basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): ${voiceType}, ${voiceCharacteristics}, ${voiceTone}: "${safeNarration}".`;
            basePrompt += actionPrompt;
            basePrompt += ` LIP SYNC STYLE: ${lipSyncType}. ${lipSyncMethod}. ${mouthShapesDesc}`;
            if (timingDesc) basePrompt += ` TIMING DETAIL: ${timingDesc}.`;
            basePrompt += ` Mouth MUST move precisely matching each Korean syllable. Continuous mouth movement - NOT static. Visible jaw movement. Face keeps same expression, only mouth area moves. Do NOT regenerate dog image during speech.`;
            basePrompt += ` IMPORTANT: NO barking. NO woof sounds. Only super cute low-pitched baby Korean speech. ${emotionTone} expression. DO NOT show dialogue as text on screen.${voiceEffect}${endingExpression}`;
        } else {
            basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence, ${characterSpeechStart}-${characterSpeechEnd}sec speaks Korean: "${safeNarration}".`;
            basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): ${voiceType}. LIP SYNC: ${lipSyncType}. ${lipSyncMethod}. ${mouthShapesDesc}`;
            basePrompt += actionPrompt;
            if (timingDesc) basePrompt += ` TIMING: ${timingDesc}.`;
            basePrompt += ` DO NOT show dialogue as text on screen.${voiceEffect}${endingExpression}`;
        }
    }

    if (isPerformance && perfPhase === "break" && narration) {
        const safeNarration = sanitizeNarration(narration);
        basePrompt += ` ${characterDesc} suddenly stops and shouts "${safeNarration}!" in fast robotic mechanical voice. Quick short exclamation. Dramatic pause moment. Confident smirk expression.`;
    }

    if (isInterviewerSpeaking && narration) {
        const safeInterviewerNarration = sanitizeNarration(narration);
        basePrompt += ` DIALOGUE TIMING: 0.0-${silenceEnd}sec silence ${isAnimalCharacter ? "dog" : "character"} waiting, ${silenceEnd}-${duration}sec interviewer audio with ${isAnimalCharacter ? "dog" : "character"} mouth CLOSED.`;

        if (isAnimalCharacter) {
            basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): Off-screen Korean female news anchor 30s, professional friendly tone says: "${safeInterviewerNarration}". DO NOT show this dialogue as text or subtitles on screen.`;
            basePrompt += ` A simple plain solid BLACK microphone (completely clean surface, NO text, NO logos, NO labels, NO writing, NO Korean characters, NO markings whatsoever) is held near the ${characterDesc.toLowerCase()}'s mouth from the side, interview style.`;
            basePrompt += ` ${characterDesc.toUpperCase()} LISTENING POSE: Mouth MUST stay completely CLOSED and STILL entire time. NO lip movement at all. NO mouth opening. Only listens with curious interested expression - ears perked up attentively, slight cute head tilt, bright curious eyes. Mouth stays SHUT from 0:00 to 0:0${duration}. IMPORTANT: Dog's mouth does NOT move during this scene.`;
        } else {
            basePrompt += ` VOICE (AUDIO ONLY - NO SUBTITLES): Off-screen Korean female interviewer professional friendly tone: "${safeInterviewerNarration}". DO NOT show this dialogue as text on screen.`;
            basePrompt += ` ${characterDesc} LISTENING POSE: Listens attentively with interested expression. Natural listening pose. Mouth stays CLOSED entire time - NO lip movement.`;
        }
    }

    if (!isInterviewerSpeaking) {
        if (isAnimalCharacter) {
            basePrompt += ` ENDING EXPRESSION at ${duration}sec: ${characterDesc.toLowerCase()} must show a happy smiling expression with a cute grin, bright eyes.`;
        } else {
            basePrompt += ` ENDING EXPRESSION at ${duration}sec: ${characterDesc.toLowerCase()} must show a warm pleasant expression.`;
        }
    }

    basePrompt += ` OUTPUT: Clean video only. ${noTextEmphasis}`;

    return basePrompt;
};

// --- Polling Helper ---

async function pollOperation(operationName) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${API_KEY}`;
    console.log(`Polling operation: ${operationName}`);

    while (true) {
        try {
            const response = await axios.get(url);
            const data = response.data;

            if (data.done) {
                if (data.error) {
                    throw new Error(`Operation failed: ${JSON.stringify(data.error)}`);
                }
                return data.response.generateVideoResponse.generatedSamples[0].video.uri;
            }

            console.log(`Still processing ${operationName}... waiting 5s`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (e) {
            console.error(`Polling error: ${e.message}`);
            throw e;
        }
    }
}

async function downloadVideo(uri, outputPath) {
    // Use API key if URI is from Google API directly, though usually it's a signed link or public
    // The URI format seen: https://generativelanguage.googleapis.com/v1beta/files/...:download?alt=media
    // It likely needs the API Key appended if not present? Actually the previous output URI didn't have key.
    // But standard googleapis usually need Auth. Let's try downloading with API Key appended if it's the API domain.

    let downloadUrl = uri;
    // Temporary: Add key if not present and it's a googleapis.com URL without query params (safe check)
    // Actually, let's just try downloading. If 403, we append key.

    console.log(`Downloading video to ${outputPath}...`);
    try {
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            headers: { "x-goog-api-key": API_KEY } // Add header to be safe
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) {
        console.error(`Download failed: ${e.message}`);
    }
}

// --- Main Script ---

async function run() {
    console.log("Loading prompts from:", VIDEO_PROMPT_FILE);
    if (!fs.existsSync(VIDEO_PROMPT_FILE)) {
        console.error("vedio_prompt.json not found!");
        process.exit(1);
    }

    const promptData = JSON.parse(fs.readFileSync(VIDEO_PROMPT_FILE, 'utf8'));
    const promptValue = promptData.$return_value || promptData;
    const scenes = promptValue.scenes || [];
    const characters = promptValue.characters || {};

    console.log(`Found ${scenes.length} scenes.`);

    const imageFiles = fs.readdirSync(IMAGE_SAMPLE_DIR)
        .filter(f => f.match(/\.(png|jpg|jpeg)$/i))
        .sort();

    console.log(`Found ${imageFiles.length} images.`);

    // Create output directory for videos
    const outputDir = path.join(SCRIPT_SAMPLE_DIR, 'generated_videos');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // To save quota, perform sequentially with 2 RPM limit (30s+ delay)
    for (let i = 0; i < scenes.length; i++) {
        // RPM-based throttling: 2 requests per minute.
        // We already have a loop. We just need to ensure we don't fire too fast.
        // RPD is 8, so we can run all 6 scenes.

        const scene = scenes[i];
        const imageFile = imageFiles[i];

        // Check if output exists to save quota
        const expectedOutputPath = path.join(outputDir, `scene_${i + 1}.mp4`);

        // Force regeneration for Scene 5 (scene_004) and Scene 6 (scene_005)
        const isTargetScene = imageFile.includes('scene_004') || imageFile.includes('scene_005');

        if (fs.existsSync(expectedOutputPath) && !isTargetScene) {
            console.log(`\n=== Scene ${i + 1} already exists, skipping to save quota. ===`);
            continue;
        }

        if (!imageFile) {
            console.warn(`No image for Scene ${i + 1}, skipping...`);
            continue;
        }

        // Explicitly filter for requested scenes (Scene 5 and 6)
        if (!imageFile.includes('scene_004') && !imageFile.includes('scene_005')) {
            console.log(`Skipping ${imageFile} (not in target list)...`);
            continue;
        }

        const imagePath = path.join(IMAGE_SAMPLE_DIR, imageFile);
        console.log(`\n=== Processing Scene ${i + 1} (${imageFile}) ===`);

        const veoPrompt = getVeo3Prompt(scene, characters);
        // console.log(`[GENERATED PROMPT]:\n${veoPrompt.substring(0, 300)}...`);

        // Prepare API Call
        const imageBuffer = fs.readFileSync(imagePath);
        const imageBase64 = imageBuffer.toString('base64');
        const mimeType = imageFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const duration = calculateDurationFromNarration(scene.narration || "", scene.duration || 6, scene.is_interview_question);

        const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

        try {
            console.log(`Submitting to Veo 3 API (Duration: ${duration}s)...`);
            const response = await axios.post(
                endpoint,
                {
                    instances: [{
                        prompt: veoPrompt,
                        image: { bytesBase64Encoded: imageBase64, mimeType },
                    }],
                    parameters: { aspectRatio: ASPECT_RATIO, durationSeconds: duration },
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-goog-api-key": API_KEY,
                    },
                }
            );

            console.log(`[SUBMITTED] Operation Name: ${response.data.name}`);

            // Poll immediately
            const videoUri = await pollOperation(response.data.name);
            console.log(`[GENERATED] Video URI: ${videoUri}`);

            const outputPath = path.join(outputDir, `scene_${i + 1}.mp4`);
            await downloadVideo(videoUri, outputPath);
            console.log(`[SAVED] ${outputPath}`);

        } catch (error) {
            console.error(`[ERROR] Failed to submit/poll scene ${i + 1}:`);
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
            } else {
                console.error(error.message);
            }
        }

        // Safety delay for RPM limit (2 RPM = 30s interval + buffer)
        if (i < scenes.length - 1) {
            console.log("Waiting 35 seconds to respect rate limit (2 RPM)...");
            await new Promise(resolve => setTimeout(resolve, 35000));
        }
    }
}

run();
