/**
 * 씬 6 전용 테스트 - 똥꼬스키 동작 + 립싱크 + 음성
 * 스크립트 정보 포함
 */

import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const API_KEY = "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

// 씬6용 레퍼런스 이미지
const sampleImagePath = "./스키장_땅콩/image/segment_number6.png";
const imageBuffer = fs.readFileSync(sampleImagePath);
const base64Image = imageBuffer.toString("base64");

// 씬6 스크립트 정보
const SCENE6_DATA = {
  narration: "그리고 나서 혼자타는데...결국 엉덩이스키로 내려왔지 모에요",
  narration_english: "And then I rode alone... in the end, I came down with butt skiing",
  duration_seconds: 6,

  voice_settings: {
    type: "Korean baby infant voice, 2-3 years old, low-pitched adorable tone",
    characteristics: "very slow speech, babbling pronunciation, slight lisp, baby talk with soft low voice",
    emotion: "amused"
  },

  mouth_shapes: {
    "그": "lips stretch wide teeth close",
    "리": "lips stretch sideways teeth visible",
    "고": "lips form round O",
    "나": "mouth wide open jaw drops",
    "서": "mouth medium open rounded",
    "혼": "lips form round O",
    "자": "mouth wide open jaw drops",
    "타": "mouth wide open jaw drops",
    "는": "lips stretch wide teeth close",
    "데": "mouth open stretched",
    "결": "mouth medium open rounded",
    "국": "lips push forward round",
    "엉": "mouth medium open rounded",
    "덩": "mouth medium open rounded",
    "이": "lips stretch sideways teeth visible",
    "스": "lips stretch wide teeth close",
    "키": "lips stretch sideways teeth visible",
    "로": "lips form round O",
    "내": "mouth open lips stretched",
    "려": "mouth medium open rounded",
    "왔": "lips round then wide",
    "지": "lips stretch sideways teeth visible",
    "모": "lips form round O",
    "에": "mouth open stretched",
    "요": "lips form round O"
  },

  detected_action: {
    action: "Dog SCOOTING on bottom - sitting position with butt on snowy ground, hind legs extended forward, using front paws to pull body forward while butt drags on snow. Like a dog scratching its bottom on the floor. NO standing, NO walking normally, NO skis on feet.",
    pose: "SITTING with butt on ground, NOT standing on four legs",
    leg_position: "Hind legs extended FORWARD in front of body, front legs walking",
    movement: "Scooting forward by pulling with front paws while butt slides on snow"
  },

  forbidden_actions: [
    "DO NOT stand up on four legs",
    "DO NOT walk normally",
    "DO NOT wear skis or any ski equipment",
    "DO NOT remove goggles or ski suit"
  ],

  character: {
    breed: "Pomeranian",
    accessories: ["orange helmet with ski goggles attached", "cow-print ski jacket"]
  }
};

// mouth_shapes를 요약하여 프롬프트에 포함
const mouthShapesSummary = `Mouth shapes for lip sync:
- Wide lips (그,는,스): lips stretch wide, teeth close
- Sideways (리,이,키,지): lips stretch sideways, teeth visible
- Round O (고,혼,로,모,요): lips form round O
- Open wide (나,자,타): mouth wide open, jaw drops
- Medium open (서,결,엉,덩,려): mouth medium open, rounded
- Open stretched (데,내,에): mouth open, lips stretched
- Push forward (국): lips push forward round
- Round then wide (왔): lips round then wide`;

// 완성된 프롬프트
const FULL_PROMPT = `VIDEO SCENE: A golden Pomeranian puppy at a snowy ski resort.

CHARACTER APPEARANCE (MUST MATCH REFERENCE IMAGE EXACTLY):
- Golden Pomeranian puppy
- Wearing ORANGE HELMET with ski goggles attached on top
- Wearing cow-print (black and white spotted) ski jacket
- ALL CLOTHING MUST STAY ON throughout the video

ACTION - BUTT SCOOTING (엉덩이스키):
${SCENE6_DATA.detected_action.action}
- ${SCENE6_DATA.detected_action.pose}
- ${SCENE6_DATA.detected_action.leg_position}
- ${SCENE6_DATA.detected_action.movement}

FORBIDDEN:
${SCENE6_DATA.forbidden_actions.map(f => `- ${f}`).join('\n')}

VOICE AND LIP SYNC:
The dog speaks in Korean: "${SCENE6_DATA.narration}"
Voice style: ${SCENE6_DATA.voice_settings.type}
Voice characteristics: ${SCENE6_DATA.voice_settings.characteristics}
Emotion: ${SCENE6_DATA.voice_settings.emotion}

${mouthShapesSummary}

TIMING:
- 0.0 to 0.5 sec: Dog in position, mouth closed
- 0.5 to 6.0 sec: Dog speaks with lip sync while scooting

Background: Snowy ski resort slope with mountains.`;

async function generateScene6() {
  console.log("=== 씬 6 똥꼬스키 테스트 (립싱크 포함) ===");
  console.log("API Key:", API_KEY.substring(0, 20) + "...");
  console.log("\n프롬프트:\n", FULL_PROMPT);
  console.log("\n생성 시작...");

  try {
    let operation = await ai.models.generateVideos({
      model: "veo-3.0-fast-generate-001",
      prompt: FULL_PROMPT,
      image: {
        imageBytes: base64Image,
        mimeType: "image/png",
      },
      config: {
        aspectRatio: "9:16",
        numberOfVideos: 1,
        durationSeconds: SCENE6_DATA.duration_seconds,
      },
    });

    console.log("Operation 생성됨:", operation.name);

    while (!operation.done) {
      console.log("대기중... (10초)");
      await new Promise((r) => setTimeout(r, 10000));
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });
    }

    console.log("생성 완료!");

    if (operation.response?.generatedVideos?.length > 0) {
      const video = operation.response.generatedVideos[0];
      if (video.video?.uri) {
        const response = await fetch(video.video.uri);
        const buffer = await response.arrayBuffer();

        const outputPath = `./스키장_땅콩/video/scene6_test_${Date.now()}.mp4`;
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        console.log(`저장됨: ${outputPath}`);
        console.log(`크기: ${buffer.byteLength} bytes`);
      }
    } else {
      console.log("영상 생성 실패");
      console.log(JSON.stringify(operation, null, 2));
    }
  } catch (error) {
    console.error("에러:", error.message);
    console.error(error);
  }
}

generateScene6();
