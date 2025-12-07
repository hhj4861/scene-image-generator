
import fetch from 'node-fetch';

const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const NGROK_URL = "https://c291f72591a0.ngrok-free.app";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251205_ngrok_render";

// Data from user request
const SCENES = [
    { file: "scene_000.mp4", duration: 4, kr: "존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!", en: "My beloved dog citizens! I will reveal the truth of the Hot Chocolate Gate!", type: "interview_answer", speaker: "main", char: "땅콩" },
    { file: "scene_001.mp4", duration: 6, kr: "땅콩 씨, 핫초코 게이트에 대한 음모론을 제기하셨는데요, 어떤 내용인가요?", en: "Mr. Ttang-kong, you've raised a conspiracy theory about the Hot Chocolate Gate. What is it?", type: "interview_question", speaker: "interviewer", char: "인터뷰어" },
    { file: "scene_002.mp4", duration: 6, kr: "범인은... 분명히 이 안에 있습니다! 핫초코를 훔쳐간 자, 반드시 찾아낼 겁니다!", en: "The culprit... is definitely among us! I will find whoever stole the hot chocolate!", type: "interview_answer", speaker: "main", char: "땅콩" },
    { file: "scene_003.mp4", duration: 4, kr: "그 날... 핫초코의 달콤한 향기가...", en: "That day... the sweet scent of hot chocolate...", type: "interview_answer", speaker: "main", char: "땅콩" },
    { file: "scene_004.mp4", duration: 6, kr: "", en: "", type: "flashback", speaker: "main", char: "땅콩" },
    { file: "scene_005.mp4", duration: 6, kr: "땅콩 씨, 혹시 핫초코를 드신 기억은 없으신가요?", en: "Mr. Ttang-kong, do you perhaps have no memory of drinking the hot chocolate?", type: "interview_question", speaker: "interviewer", char: "인터뷰어" },
    { file: "scene_006.mp4", duration: 6, kr: "아...아니요! 저는 결백합니다! 핫초코는 누가 훔쳐간 게 분명해요! 기억 안 나는 거야...", en: "N...No! I'm innocent! Someone must have stolen the hot chocolate! I don't remember...", type: "interview_answer", speaker: "main", char: "땅콩" },
    { file: "scene_007.mp4", duration: 4, kr: "에라 모르겠다! 그냥 맛있게 먹었으면 된 거 아니겠어요? 흐흐흐흐흐흐~", en: "Oh well, who cares! As long as it tasted good, right? Hehehehehe~", type: "interview_answer", speaker: "main", char: "땅콩" }
];

const PROXY_VIDEOS = SCENES.map((s, i) => ({
    url: `${NGROK_URL}/${s.file}`,
    index: i,
    duration: s.duration,
    narration: s.kr,
    narration_korean: s.kr,
    narration_english: s.en,
    dialogue: {
        script: s.kr,
        script_english: s.en,
        interviewer: s.speaker === 'interviewer' ? s.kr : ""
    },
    spoken_language: "korean",
    scene_type: s.type,
    is_interview_question: s.speaker === 'interviewer',
    speaker: s.speaker,
    character_name: s.char
}));

// REMOVED EMOJIS HERE
const payload = {
    videos: PROXY_VIDEOS,
    bgm_url: `${NGROK_URL}/bgm.mp3`,
    bgm_volume: 0.2,
    header_text: "[속보] 땅콩 대폭로 : 핫초코 게이트의 전말 ㅋㅋ",
    header_text_english: "[BREAKING] Ttang-kong Exposed : The Truth of Hot Chocolate Gate",
    footer_text: "", // Empty for local overlay
    footer_color: "#FF8C00", // (Ignored by VM likely, but leaving it)
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: `${FOLDER_NAME}/final_shorts_vm_clean.mp4`, // New output filename
    folder_name: FOLDER_NAME
};

async function callVM() {
    console.log("🚀 Calling FFmpeg VM (Clean Text)...");
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
        console.log("✅ VM Response:", JSON.stringify(json, null, 2));
        console.log(`\n🎉 Final Video URL: ${json.url}`);
    } catch (err) {
        console.error("❌ Failed to call VM:", err.message);
    }
}

callVM();
