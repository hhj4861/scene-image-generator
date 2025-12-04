import { axios } from "@pipedream/platform";

/**
 * Ken Burns FFmpeg Render Component
 * 이미지 → Ken Burns 효과 영상 변환 후 자막 합성
 */
export default defineComponent({
  name: "Ken Burns FFmpeg Render",
  description: "이미지에 Ken Burns 효과를 적용하고 자막을 합성하여 최종 쇼츠 영상 생성",

  props: {
    // FFmpeg VM 설정
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM API URL",
      default: "http://34.64.168.173:3000",
    },

    // 입력 데이터
    scenes: {
      type: "string",
      label: "Scenes Data (JSON)",
      description: `씬 데이터 배열 (JSON 형식). 각 씬에 image_url, question, answer 등 포함.
예시: [{"index":1,"image_url":"https://...","question":"질문","answer":"답변"}]`,
    },

    // Ken Burns 효과 설정
    ken_burns_effect: {
      type: "string",
      label: "Ken Burns Effect",
      description: "적용할 Ken Burns 효과 타입",
      options: [
        { label: "줌인 (중앙)", value: "zoom_in_center" },
        { label: "줌아웃 (중앙)", value: "zoom_out_center" },
        { label: "위→아래 패닝 + 줌", value: "pan_down_zoom" },
        { label: "왼→오른쪽 패닝", value: "pan_left_right" },
        { label: "얼굴 줌인 (상단 1/3)", value: "zoom_face" },
        { label: "랜덤 (씬마다 다르게)", value: "random" },
      ],
      default: "zoom_in_center",
    },

    // 씬 설정
    scene_duration: {
      type: "integer",
      label: "Scene Duration (seconds)",
      description: "각 씬의 기본 길이 (초)",
      default: 6,
      min: 3,
      max: 15,
    },

    // 채널명
    channel_name: {
      type: "string",
      label: "Channel Name",
      description: "영상 하단에 표시될 채널명",
      default: "땅콩이네",
    },

    // BGM
    bgm_url: {
      type: "string",
      label: "BGM URL (Optional)",
      description: "배경 음악 URL",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM Volume",
      description: "BGM 볼륨 (0.0 ~ 1.0)",
      default: "0.2",
      optional: true,
    },

    // 출력 설정
    output_bucket: {
      type: "string",
      label: "GCS Output Bucket",
      default: "shorts-videos-storage-mcp-test-457809",
    },
    folder_name: {
      type: "string",
      label: "Output Folder Name",
      description: "출력 폴더명 (비워두면 자동 생성)",
      optional: true,
    },
  },

  async run({ $ }) {
    // 1. 입력 파싱
    let scenes;
    try {
      scenes = typeof this.scenes === "string" ? JSON.parse(this.scenes) : this.scenes;
    } catch (e) {
      throw new Error(`Invalid scenes JSON: ${e.message}`);
    }

    if (!scenes || !scenes.length) {
      throw new Error("No scenes provided");
    }

    $.export("input_scene_count", scenes.length);

    // 2. 폴더명 생성
    const folderName = this.folder_name || `ken_burns_${Date.now()}`;
    const outputPath = `${folderName}/final_ken_burns.mp4`;

    // 3. Ken Burns 효과 매핑
    const effects = ["zoom_in_center", "zoom_out_center", "pan_down_zoom", "pan_left_right", "zoom_face"];
    const getEffect = (index) => {
      if (this.ken_burns_effect === "random") {
        return effects[index % effects.length];
      }
      return this.ken_burns_effect;
    };

    // 4. 씬 데이터 정규화
    const normalizedScenes = scenes.map((scene, i) => ({
      index: scene.index || (i + 1),
      image_url: scene.image_url || scene.url,
      duration: scene.duration || this.scene_duration,
      effect: scene.effect || getEffect(i),
      question: scene.question || scene.dialogue?.interviewer || "",
      question_english: scene.question_english || scene.dialogue?.interviewer_english || "",
      answer: scene.answer || scene.dialogue?.script || scene.narration || "",
      answer_english: scene.answer_english || scene.dialogue?.script_english || scene.narration_english || "",
    }));

    $.export("normalized_scenes", normalizedScenes);

    // 5. API 요청
    const requestPayload = {
      scenes: normalizedScenes.sort((a, b) => a.index - b.index),
      channel_name: this.channel_name,
      bgm_url: this.bgm_url || null,
      bgm_volume: parseFloat(this.bgm_volume) || 0.2,
      width: 1080,
      height: 1920,
      output_bucket: this.output_bucket,
      output_path: outputPath,
      folder_name: folderName,
    };

    console.log(`Calling Ken Burns API: ${this.ffmpeg_vm_url}/render/ken-burns`);
    console.log(`Scenes: ${normalizedScenes.length}, Effect: ${this.ken_burns_effect}`);

    try {
      const response = await axios($, {
        method: "POST",
        url: `${this.ffmpeg_vm_url}/render/ken-burns`,
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 600000, // 10분 타임아웃
      });

      $.export("render_result", response);
      $.export("output_url", response.url);
      $.export("total_duration", response.total_duration);

      return {
        success: true,
        url: response.url,
        job_id: response.job_id,
        total_duration: response.total_duration,
        scene_count: normalizedScenes.length,
        folder_name: folderName,
        stats: response.stats,
      };

    } catch (error) {
      console.error("Ken Burns render failed:", error.message);
      $.export("error", error.message);

      throw new Error(`Ken Burns render failed: ${error.response?.data?.error || error.message}`);
    }
  },
});
