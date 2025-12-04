import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy FFmpeg Render (VM)",
  description: "FFmpeg VM으로 최종 영상 합성 - 땅콩이 템플릿 (상단 타이틀 + 하단 채널명 + 자막)",

  props: {
    viral_title_output: {
      type: "string",
      label: "Viral Title Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Viral_Title_V2.$return_value)}}",
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
      label: "Header Text Korean (상단 제목 - 한글)",
      description: "에피소드 타이틀 한글 (예: 비트박스 천재견 땅콩의 반전)",
      optional: true,
    },
    header_text_english: {
      type: "string",
      label: "Header Text English (상단 제목 - 영어)",
      description: "에피소드 타이틀 영어 (예: Beatbox Genius Peanut's Plot Twist)",
      optional: true,
    },
    footer_text: {
      type: "string",
      label: "Footer Text (하단 채널명)",
      description: "채널/시리즈명 - 비워두면 AI 생성 푸터 사용 (예: 땅콩NEWS📺)",
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
      description: "한글 자막 아래 영어 자막 표시 (header_text_english가 있으면 상단 영어 타이틀도 자동 표시)",
      default: true,
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
    const viralTitleOutput = typeof this.viral_title_output === "string"
      ? JSON.parse(this.viral_title_output) : this.viral_title_output;
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

    const videos = viralTitleOutput.videos || [];
    const folderName = viralTitleOutput.folder_name || scriptOutput?.folder_name || `render_${Date.now()}`;

    if (!videos.length) throw new Error("No videos provided");

    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

    $.export("input", { videos: sortedVideos.length, folder: folderName });

    // =====================
    // 2. 헤더/푸터 텍스트 설정
    // =====================
    // ★★★ AI 생성 바이럴 타이틀 우선 사용 ★★★
    // 우선순위: 수동 지정 > AI 생성 > Topic/Script 폴백 > 기본값
    const generatedTitles = viralTitleOutput?.generated_titles || {};
    const youtubeMetadata = viralTitleOutput?.youtube_metadata || {};

    const headerTextKorean = this.header_text
      || generatedTitles.header_korean
      || topicOutput?.topic
      || scriptOutput?.title?.korean
      || "";
    const headerTextEnglish = this.header_text_english
      || generatedTitles.header_english
      || scriptOutput?.title?.english
      || "";
    // ★★★ AI 생성 푸터 우선 사용 (수동 입력 없으면) ★★★
    const footerText = this.footer_text
      || generatedTitles.footer
      || `${viralTitleOutput?.title_generation_info?.main_character || "땅콩"}이네`;

    $.export("footer_source", this.footer_text ? "manual" : (generatedTitles.footer ? "ai_generated" : "default"));

    $.export("titles", {
      korean: headerTextKorean,
      english: headerTextEnglish,
      footer: footerText,
      source: generatedTitles.header_korean ? "ai_generated" : "manual_or_fallback"
    });

    // ★★★ 디버깅: 실제 전송될 값 확인 ★★★
    $.export("debug_generated_titles", generatedTitles);
    $.export("debug_subtitle_english", this.subtitle_english_enabled);
    $.export("debug_sample_video_english", sortedVideos[0]?.narration_english || sortedVideos[0]?.dialogue?.script_english || "NO_ENGLISH");

    // =====================
    // 3. FFmpeg VM API 호출
    // =====================
    $.export("status", "Calling FFmpeg VM API...");

    const requestPayload = {
      videos: sortedVideos.map(v => ({
        url: v.url,
        index: v.index,
        duration: v.duration,
        // ★★★ dialogue 객체: script(한글), script_english(영어), interviewer(인터뷰어) ★★★
        dialogue: {
          ...(v.dialogue || {}),
          script: v.dialogue?.script || v.narration || "",
          script_english: v.dialogue?.script_english || v.narration_english || "",
          interviewer: v.dialogue?.interviewer || "",
        },
        narration: v.narration,
        // ★★★ 한글 자막용 (영어 캐릭터도 한글 자막 표시) ★★★
        narration_korean: v.narration_korean || v.narration,
        narration_english: v.narration_english || v.dialogue?.script_english || "",
        spoken_language: v.spoken_language || "korean",  // 캐릭터 언어
        is_interview_question: v.is_interview_question,
        scene_type: v.scene_type,
        is_performance: v.is_performance,
        // ★★★ 조연 캐릭터 지원을 위한 추가 정보 ★★★
        speaker: v.speaker,
        character_name: v.character_name,
      })),
      bgm_url: this.bgm_url || null,
      bgm_volume: parseFloat(this.bgm_volume) || 0.2,
      // ★★★ 한글/영어 헤더 (영어가 있으면 자동으로 한글 아래 표시) ★★★
      header_text: headerTextKorean,
      header_text_english: headerTextEnglish,
      footer_text: footerText,
      // ★★★ 자막 설정 ★★★
      subtitle_enabled: this.subtitle_enabled,
      subtitle_english_enabled: this.subtitle_english_enabled,
      width: this.video_width,
      height: this.video_height,
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_shorts.mp4`,
      folder_name: folderName,
    };

    // ★★★ 디버깅: VM에 전송되는 핵심 값들 ★★★
    $.export("debug_request", {
      header_text: requestPayload.header_text,
      header_text_english: requestPayload.header_text_english,
      footer_text: requestPayload.footer_text,
      subtitle_enabled: requestPayload.subtitle_enabled,
      subtitle_english_enabled: requestPayload.subtitle_english_enabled,
      sample_video_narration_english: requestPayload.videos[0]?.narration_english || "NONE",
    });

    try {
      const response = await axios($, {
        method: "POST",
        url: `${this.ffmpeg_vm_url}/render/puppy`,
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 900000, // 15분 타임아웃 (FFmpeg 성능 최적화 후에도 긴 영상 대비)
      });

      $.export("$summary", `Rendered ${response.total_duration?.toFixed(1) || "N/A"}s video with ${sortedVideos.length} clips via FFmpeg VM`);

      return {
        success: true,
        url: response.url,
        folder_name: folderName,
        total_duration: response.total_duration,
        render_engine: "ffmpeg-vm",
        job_id: response.job_id,
        // ★★★ 유튜브 메타데이터 포함 (업로드 시 사용) ★★★
        youtube_metadata: youtubeMetadata,
        generated_titles: generatedTitles,
        stats: response.stats || {
          video_count: sortedVideos.length,
          has_bgm: !!this.bgm_url,
          has_header: !!headerTextKorean,
          has_header_english: !!headerTextEnglish,
          has_footer: !!footerText,
          has_subtitles: this.subtitle_enabled,
          has_english_subtitles: this.subtitle_english_enabled,
          titles_source: generatedTitles.header_korean ? "ai_generated" : "manual_or_fallback",
        },
      };

    } catch (error) {
      // VM 오류 시 상세 정보 포함
      const errorMsg = error.response?.data?.error || error.message;
      throw new Error(`FFmpeg VM Error: ${errorMsg}`);
    }
  },
});
