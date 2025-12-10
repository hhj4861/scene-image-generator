import fs from 'fs';

const scriptData = JSON.parse(fs.readFileSync('./script/vedio_script.json', 'utf-8'));
const scenes = scriptData.$return_value?.scenes || [];
const characters = scriptData.$return_value?.characters || {};

function buildVeoScript(scene) {
  const sceneDetails = scene.scene_details || {};
  const lipSyncStyle = scene.lip_sync_style || {};
  const dialogue = scene.dialogue || {};

  const characterName = sceneDetails.character_name || '땅콩';
  const narration = dialogue.script || dialogue[characterName] || '';
  const hasNarration = narration && narration.trim().length > 0;
  const duration = scene.duration_seconds || 6;

  const charAppearance = scene.character_appearance || {};
  const mainChar = characters.main || {};
  const furColor = charAppearance.fur_color || mainChar.fur_color || 'golden cream with brown ears';
  const breed = charAppearance.breed || mainChar.breed || 'Pomeranian';
  const accessories = charAppearance.accessories || mainChar.accessories || ['pink bow tie'];
  const characterDesc = `adorable ${furColor} fluffy ${breed} puppy wearing ${accessories.join(', ')}`;

  const isInterviewQuestion = sceneDetails.scene_type === 'interview_question' || lipSyncStyle.dog_speaks === false;
  const dogSpeaks = lipSyncStyle.dog_speaks === true && hasNarration && !isInterviewQuestion;

  let promptType;
  if (isInterviewQuestion && hasNarration) {
    promptType = 'INTERVIEW_QUESTION (입 닫힘 명시)';
  } else if (dogSpeaks) {
    promptType = 'DOG_SPEAKS (립싱크)';
  } else {
    promptType = 'OTHER (기타)';
  }

  return {
    sceneNum: scene.video,
    scene_type: sceneDetails.scene_type,
    lip_sync_dog_speaks: lipSyncStyle.dog_speaks,
    isInterviewQuestion,
    dogSpeaks,
    hasNarration,
    promptType,
    characterDesc: characterDesc.substring(0, 80) + '...'
  };
}

const scene2 = scenes.find(s => s.video === 2);
const scene7 = scenes.find(s => s.video === 7);

console.log('=== 씬2 ===');
console.log(JSON.stringify(buildVeoScript(scene2), null, 2));

console.log('\n=== 씬7 ===');
console.log(JSON.stringify(buildVeoScript(scene7), null, 2));

// 실제 차이점 확인
console.log('\n=== 원본 데이터 상세 비교 ===');
console.log('\n[character_appearance.accessories]');
console.log('씬2:', scene2.character_appearance?.accessories);
console.log('씬7:', scene7.character_appearance?.accessories);

console.log('\n[video_prompt]');
console.log('씬2:', JSON.stringify(scene2.video_prompt, null, 2));
console.log('씬7:', JSON.stringify(scene7.video_prompt, null, 2));

console.log('\n[prompt 필드 (원본)]');
console.log('씬2:', scene2.prompt?.substring(0, 200) + '...');
console.log('씬7:', scene7.prompt?.substring(0, 200) + '...');
