import fs from 'fs';

const scriptData = JSON.parse(fs.readFileSync('./script/vedio_script.json', 'utf-8'));
const scenes = scriptData.$return_value?.scenes || [];
const characters = scriptData.$return_value?.characters || {};

// buildVeoScript 로직 재현 (수정된 버전)
function buildVeoScript(scene) {
  const sceneDetails = scene.scene_details || {};
  const lipSyncStyle = scene.lip_sync_style || {};
  const dialogue = scene.dialogue || {};

  const characterName = sceneDetails.character_name || '땅콩';
  const narration = dialogue.script || dialogue[characterName] || '';
  const hasNarration = narration && narration.trim().length > 0;
  const duration = scene.duration_seconds || 6;

  // ★ 수정됨: 캐릭터 외형 설명 제거
  const characterDesc = 'The dog in the reference image';

  const isInterviewQuestion = sceneDetails.scene_type === 'interview_question' || lipSyncStyle.dog_speaks === false;
  const dogSpeaks = lipSyncStyle.dog_speaks === true && hasNarration && !isInterviewQuestion;

  // 프롬프트 생성
  let basePrompt;
  if (isInterviewQuestion && hasNarration) {
    basePrompt = `1080p cinematic video. ${characterDesc} is ONLY LISTENING to off-screen interviewer voice. CRITICAL: Dog mouth MUST stay COMPLETELY CLOSED throughout entire ${duration} seconds. NO lip movement. NO mouth opening. NO jaw movement. The dog shows gentle head nods, ear twitches, and curious listening expression while keeping mouth firmly closed. Use the provided reference image as the exact visual base. The dog appearance must stay identical to reference image. No text overlays. No subtitles. No captions. No watermarks.`;
  } else if (dogSpeaks) {
    basePrompt = `1080p cinematic video. ${characterDesc} speaking in Korean...`;
  } else {
    basePrompt = `1080p cinematic video. Use the provided reference image as the exact visual base for the entire ${duration} seconds. ${characterDesc}. The dog appearance must stay identical to reference image from 0:00 to ${duration}:00. No text overlays. No subtitles. No captions. No watermarks.`;
  }

  return {
    sceneNum: scene.video,
    scene_type: sceneDetails.scene_type,
    dog_speaks: lipSyncStyle.dog_speaks,
    isInterviewQuestion,
    dogSpeaks,
    hasNarration,
    prompt: basePrompt
  };
}

const scene7 = scenes.find(s => s.video === 7);
const result = buildVeoScript(scene7);

console.log('=== 수정된 buildVeoScript 결과 (씬7) ===');
console.log(JSON.stringify(result, null, 2));

console.log('\n=== 생성될 프롬프트 ===');
console.log(result.prompt);

console.log('\n=== 충돌 분석 ===');
console.log('1. 원본 prompt 필드 (사용 안함): 캐릭터 외형 포함 - 무시됨');
console.log('2. character_appearance.base (사용 안함): 캐릭터 외형 포함 - 무시됨');
console.log('3. 새 프롬프트: "The dog in the reference image" 사용 - OK');

// 원본 데이터에서 충돌 가능한 필드 체크
console.log('\n=== 원본 데이터 충돌 가능 필드 ===');
console.log('visual_continuity.2_to_4_sec.dog:', scene7.visual_continuity?.['2_to_4_sec']?.dog);
