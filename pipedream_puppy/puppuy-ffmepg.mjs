import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy FFmpeg Render (VM)",
  description: "FFmpeg VM으로 최종 영상 합성 - 땅콩이 템플릿 (상단 타이틀 + 하단 채널명 + 자막)",

  props: {
    video_generator_output: {
      type: "string",
      label: "Video Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}",
    },
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
      optional: true,
    },
    topic_generator_output: {
      type: "string",
      label: "Topic Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Topic_Generator.$return_value)}}",
      optional: true,
    },
    tts_generator_output: {
      type: "string",
      label: "TTS Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_ElevenLabs_TTS.$return_value)}}",
      optional: true,
    },
    bgm_url: {
      type: "string",
      label: "BGM URL",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM Volume (0.0-1.0)",
      default: "0.2",
    },
    header_text: {
      type: "string",
      label: "Header Text (상단 제목)",
      description: "에피소드 타이틀 (예: 비트박스 천재견 땅콩의 반전)",
      optional: true,
    },
    footer_text: {
      type: "string",
      label: "Footer Text (하단 채널명)",
      description: "채널/시리즈명 (예: 땅콩이네)",
      default: "땅콩이네",
      optional: true,
    },
    subtitle_enabled: {
      type: "boolean",
      label: "Enable Subtitles",
      default: true,
    },
    subtitle_english_enabled: {
      type: "boolean",
      label: "Enable English Subtitles",
      description: "한글 자막 아래 영어 자막 표시",
      default: false,
    },
    video_width: {
      type: "integer",
      label: "Video Width",
      default: 1080,
    },
    video_height: {
      type: "integer",
      label: "Video Height",
      default: 1920,
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
    },
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM API URL",
      default: "http://34.64.168.173:3000",
    },
  },

  async run({ $ }) {
    // =====================
    // 1. 입력 파싱
    // =====================
    const videoOutput = typeof this.video_generator_output === "string"
      ? JSON.parse(this.video_generator_output) : this.video_generator_output;
    const scriptOutput = this.script_generator_output
      ? (typeof this.script_generator_output === "string"
          ? JSON.parse(this.script_generator_output) : this.script_generator_output)
      : null;
    const topicOutput = this.topic_generator_output
      ? (typeof this.topic_generator_output === "string"
          ? JSON.parse(this.topic_generator_output) : this.topic_generator_output)
      : null;
    const ttsOutput = this.tts_generator_output
      ? (typeof this.tts_generator_output === "string"
          ? JSON.parse(this.tts_generator_output) : this.tts_generator_output)
      : null;

    const videos = videoOutput.videos || [];
    const folderName = videoOutput.folder_name || scriptOutput?.folder_name || `render_${Date.now()}`;

    if (!videos.length) throw new Error("No videos provided");

    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

    $.export("input", { videos: sortedVideos.length, folder: folderName });

    // =====================
    // 2. 헤더/푸터 텍스트 설정
    // =====================
    const headerText = this.header_text || topicOutput?.topic || scriptOutput?.title?.korean || "";
    const footerText = this.footer_text || "땅콩이네";

    // =====================
    // 3. FFmpeg VM API 호출
    // =====================
    $.export("status", "Calling FFmpeg VM API...");

    const requestPayload = {
      videos: sortedVideos.map(v => ({
        url: v.url,
        index: v.index,
        duration: v.duration,
        dialogue: v.dialogue,
        narration: v.narration,
        narration_english: v.narration_english,
        is_interview_question: v.is_interview_question,
        scene_type: v.scene_type,
        is_performance: v.is_performance,
      })),
      bgm_url: this.bgm_url || null,
      bgm_volume: parseFloat(this.bgm_volume) || 0.2,
      header_text: headerText,
      footer_text: footerText,
      subtitle_enabled: this.subtitle_enabled,
      subtitle_english_enabled: this.subtitle_english_enabled,
      width: this.video_width,
      height: this.video_height,
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_shorts.mp4`,
      folder_name: folderName,
    };

    try {
      const response = await axios($, {
        method: "POST",
        url: `${this.ffmpeg_vm_url}/render/puppy`,
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 600000, // 10분 타임아웃
      });

      $.export("$summary", `Rendered ${response.total_duration?.toFixed(1) || "N/A"}s video with ${sortedVideos.length} clips via FFmpeg VM`);

      return {
        success: true,
        url: response.url,
        folder_name: folderName,
        total_duration: response.total_duration,
        render_engine: "ffmpeg-vm",
        job_id: response.job_id,
        stats: response.stats || {
          video_count: sortedVideos.length,
          has_bgm: !!this.bgm_url,
          has_header: !!headerText,
          has_footer: !!footerText,
          has_subtitles: this.subtitle_enabled,
          has_english_subtitles: this.subtitle_english_enabled,
        },
      };

    } catch (error) {
      // VM 오류 시 상세 정보 포함
      const errorMsg = error.response?.data?.error || error.message;
      throw new Error(`FFmpeg VM Error: ${errorMsg}`);
    }
  },
});
