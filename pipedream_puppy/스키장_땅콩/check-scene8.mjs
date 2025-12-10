import fs from 'fs';

const scriptData = JSON.parse(fs.readFileSync('./script/vedio_script.json', 'utf-8'));
const scenes = scriptData.$return_value?.scenes || [];
const characters = scriptData.$return_value?.characters || {};

const scene8 = scenes.find(s => s.video === 8);

// buildVeoScript 로직 재현 (동작 관련)
const sceneDetails = scene8.scene_details || {};
const lipSyncStyle = scene8.lip_sync_style || {};
const dialogue = scene8.dialogue || {};
const videoPrompt = scene8.video_prompt || {};
const detectedActions = scene8.detected_actions || [];

const characterName = sceneDetails.character_name || "땅콩";
const narration = dialogue.script || dialogue[characterName] || "";
const hasNarration = narration && narration.trim().length > 0;
const duration = scene8.duration_seconds || 6;

const characterDesc = "The dog in the reference image";

// 특수 동작 (detected_actions에서 추출)
const specialActions = detectedActions.map(a => a.action).join(", ");
const characterAction = videoPrompt.character_action || "";
const bodyMovement = videoPrompt.body_movement || "";
const actionDescription = [characterAction, bodyMovement, specialActions].filter(Boolean).join(". ");

const isInterviewQuestion = sceneDetails.scene_type === "interview_question" || lipSyncStyle.dog_speaks === false;
const dogSpeaks = lipSyncStyle.dog_speaks === true && hasNarration && !isInterviewQuestion;

console.log('=== 씬8 동작 분석 ===');
console.log('');
console.log('대사:', narration);
console.log('');
console.log('=== 동작 관련 변수 ===');
console.log('characterAction:', characterAction);
console.log('bodyMovement:', bodyMovement);
console.log('specialActions:', specialActions);
console.log('');
console.log('=== 최종 actionDescription ===');
console.log(actionDescription);
console.log('');
console.log('=== 씬 타입 판단 ===');
console.log('isInterviewQuestion:', isInterviewQuestion);
console.log('dogSpeaks:', dogSpeaks);
console.log('');

// 프롬프트 생성
let basePrompt;
if (isInterviewQuestion && hasNarration) {
  basePrompt = `인터뷰 질문 씬 (입 닫힘)`;
} else if (dogSpeaks) {
  basePrompt = `1080p cinematic video. ${characterDesc} speaking in Korean. The DOG speaks directly to camera with Korean baby infant voice, 2-3 years old, low-pitched adorable tone. NO interviewer. NO adult voice. NO off-screen voice. ONLY the baby puppy voice speaks.${actionDescription ? ` IMPORTANT ACTION: ${actionDescription}.` : ""} Use the provided reference image as the exact visual base for the entire ${duration} seconds. The dog appearance must stay identical to reference image. No text overlays. No subtitles. No captions. No watermarks.`;
} else {
  basePrompt = `기타 씬`;
}

console.log('=== 생성될 프롬프트 ===');
console.log(basePrompt);
