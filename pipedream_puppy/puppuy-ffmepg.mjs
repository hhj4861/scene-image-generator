import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy FFmpeg Render (VM)",
  description: "FFmpeg VM으로 최종 영상 합성 - 땅콩이 템플릿 (상단 타이틀 + 하단 채널명 + 자막) - 동적 레이아웃 지원",

  props: {
    viral_title_output: {
      type: "string",
      label: "Viral Title Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Viral_Title_V2.$return_value)}}",
    },
    script_generator_output: {
      type: "string",
      label: "Script Source (Generator or Editor)",
      description: "Puppy Script Generator 또는 Script Editor의 출력값({{steps.Puppy_Script_Editor.$return_value}} or {{steps.Puppy_Script_Generator.$return_value}})",
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
      label: "Footer Text (하단 채널명 - 한글)",
      description: "채널/시리즈명 - 비워두면 AI 생성 푸터 사용 (예: 땅콩NEWS)",
      optional: true,
    },
    footer_text_english: {
      type: "string",
      label: "Footer Text English (하단 채널명 - 영어)",
      description: "영문 푸터 (예: Subscribe for more!)",
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
    // ★★★ 동적 레이아웃 설정 ★★★
    layout_preset: {
      type: "string",
      label: "Layout Preset",
      description: "레이아웃 프리셋 선택 (custom 선택 시 아래 값들 사용)",
      options: [
        { label: "Default (자막 50/30pt, 2줄)", value: "default" },
        { label: "Large Subtitle (자막 60/40pt, 2줄)", value: "large_subtitle" },
        { label: "Small Subtitle (자막 45/28pt, 2줄)", value: "small_subtitle" },
        { label: "Three Lines (자막 45/28pt, 3줄)", value: "three_lines" },
        { label: "Custom (직접 설정)", value: "custom" },
      ],
      default: "default",
      optional: true,
    },
    use_origin_layout: {
      type: "boolean",
      label: "Use Origin Layout",
      description: "origin_layout 모드 사용 (커스텀 레이아웃 적용)",
      default: true,
      optional: true,
    },
    subtitle_korean_size: {
      type: "integer",
      label: "Korean Subtitle Font Size",
      description: "한글 자막 폰트 크기 (기본: 50)",
      default: 50,
      optional: true,
    },
    subtitle_english_size: {
      type: "integer",
      label: "English Subtitle Font Size",
      description: "영어 자막 폰트 크기 (기본: 30)",
      default: 30,
      optional: true,
    },
    header_korean_size: {
      type: "integer",
      label: "Korean Header Font Size",
      description: "한글 헤더 폰트 크기 (기본: 36)",
      default: 36,
      optional: true,
    },
    header_english_size: {
      type: "integer",
      label: "English Header Font Size",
      description: "영어 헤더 폰트 크기 (기본: 16)",
      default: 16,
      optional: true,
    },
    subtitle_max_lines: {
      type: "integer",
      label: "Subtitle Max Lines",
      description: "자막 최대 줄 수 (기본: 2)",
      default: 2,
      optional: true,
    },
    header_y: {
      type: "integer",
      label: "Header Y Position",
      description: "헤더 Y 위치 (기본: 110)",
      default: 110,
      optional: true,
    },
    subtitle_y: {
      type: "integer",
      label: "Subtitle Y Position",
      description: "자막 Y 위치 (기본: 1350)",
      default: 1350,
      optional: true,
    },
    footer_y: {
      type: "integer",
      label: "Footer Y Position",
      description: "푸터 Y 위치 (기본: 1550)",
      default: 1550,
      optional: true,
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
    const footerText = this.footer_text
      || generatedTitles.footer
      || `${viralTitleOutput?.title_generation_info?.main_character || "땅콩"}이네`;
    const footerTextEnglish = this.footer_text_english
      || generatedTitles.footer_english
      || "";

    $.export("footer_source", this.footer_text ? "manual" : (generatedTitles.footer ? "ai_generated" : "default"));

    $.export("titles", {
      korean: headerTextKorean,
      english: headerTextEnglish,
      footer: footerText,
      footer_english: footerTextEnglish,
      source: generatedTitles.header_korean ? "ai_generated" : "manual_or_fallback"
    });

    // =====================
    // 3. 동적 레이아웃/폰트 설정 생성
    // =====================
    const PRESETS = {
      default: {
        subtitleKoreanSize: 50,
        subtitleEnglishSize: 30,
        headerKoreanSize: 36,
        headerEnglishSize: 16,
        subtitleMaxLines: 2,
        headerY: 110,
        subtitleY: 1350,
        footerY: 1550,
      },
      large_subtitle: {
        subtitleKoreanSize: 60,
        subtitleEnglishSize: 40,
        headerKoreanSize: 36,
        headerEnglishSize: 16,
        subtitleMaxLines: 2,
        headerY: 110,
        subtitleY: 1350,
        footerY: 1550,
      },
      small_subtitle: {
        subtitleKoreanSize: 45,
        subtitleEnglishSize: 28,
        headerKoreanSize: 36,
        headerEnglishSize: 16,
        subtitleMaxLines: 2,
        headerY: 110,
        subtitleY: 1350,
        footerY: 1550,
      },
      three_lines: {
        subtitleKoreanSize: 45,
        subtitleEnglishSize: 28,
        headerKoreanSize: 36,
        headerEnglishSize: 16,
        subtitleMaxLines: 3,
        headerY: 110,
        subtitleY: 1300,
        footerY: 1550,
      },
    };

    // 프리셋 또는 커스텀 값 선택
    const preset = this.layout_preset || "default";
    const layoutValues = preset === "custom" ? {
      subtitleKoreanSize: this.subtitle_korean_size || 50,
      subtitleEnglishSize: this.subtitle_english_size || 30,
      headerKoreanSize: this.header_korean_size || 36,
      headerEnglishSize: this.header_english_size || 16,
      subtitleMaxLines: this.subtitle_max_lines || 2,
      headerY: this.header_y || 110,
      subtitleY: this.subtitle_y || 1350,
      footerY: this.footer_y || 1550,
    } : PRESETS[preset] || PRESETS.default;

    const width = this.video_width || 1080;
    const height = this.video_height || 1920;
    const fontScale = width / 1080;

    // 레이아웃 계산
    const headerHeight = 120;
    const headerGap = 30;
    const videoAreaY = layoutValues.headerY + headerHeight + headerGap;
    const videoEndY = layoutValues.footerY - 50;
    const videoAreaHeight = videoEndY - videoAreaY;

    const originLayout = {
      video_area: {
        x: 0,
        y: videoAreaY,
        width: width,
        height: videoAreaHeight
      },
      header_area: {
        y: layoutValues.headerY,
        height: headerHeight
      },
      subtitle_area: {
        y: layoutValues.subtitleY,
        height: 150,
        single_line: false,
        max_lines: layoutValues.subtitleMaxLines
      },
      footer_area: {
        y: layoutValues.footerY,
        height: 80
      },
      font_scale: fontScale
    };

    const fontSettings = {
      header_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(layoutValues.headerKoreanSize * fontScale),
        color: "white",
        border_width: Math.round(2 * fontScale),
        border_color: "black"
      },
      header_english: {
        font: "NotoSerif-Regular",
        size: Math.round(layoutValues.headerEnglishSize * fontScale),
        color: "white",
        border_width: Math.round(1 * fontScale),
        border_color: "black"
      },
      subtitle_korean: {
        font: "NanumSquareRoundOTFEB",
        size: Math.round(layoutValues.subtitleKoreanSize * fontScale),
        color: "white",
        border_width: Math.round(4 * fontScale),
        border_color: "black"
      },
      subtitle_english: {
        font: "NotoSerif-Regular",
        size: Math.round(layoutValues.subtitleEnglishSize * fontScale),
        color: "white",
        border_width: Math.round(3 * fontScale),
        border_color: "black"
      }
    };

    $.export("layout_config", {
      preset: preset,
      values: layoutValues,
      use_origin_layout: this.use_origin_layout
    });

    // =====================
    // 4. FFmpeg VM API 호출
    // =====================
    $.export("status", "Calling FFmpeg VM API...");

    const requestPayload = {
      videos: sortedVideos.map(v => ({
        url: v.url,
        index: v.index,
        duration: v.duration,
        dialogue: {
          ...(v.dialogue || {}),
          script: v.dialogue?.script || v.narration || "",
          script_english: v.dialogue?.script_english || v.narration_english || "",
          interviewer: v.dialogue?.interviewer || "",
        },
        narration: v.narration,
        narration_korean: v.narration_korean || v.narration,
        narration_english: v.narration_english || v.dialogue?.script_english || "",
        spoken_language: v.spoken_language || "korean",
        is_interview_question: v.is_interview_question,
        scene_type: v.scene_type,
        is_performance: v.is_performance,
        speaker: v.speaker,
        character_name: v.character_name,
      })),
      bgm_url: this.bgm_url || null,
      bgm_volume: parseFloat(this.bgm_volume) || 0.2,
      header_text: headerTextKorean,
      header_text_english: headerTextEnglish,
      footer_text: footerText,
      footer_text_english: footerTextEnglish,
      subtitle_enabled: this.subtitle_enabled,
      subtitle_english_enabled: this.subtitle_english_enabled,
      width: width,
      height: height,
      // ★★★ 동적 레이아웃 설정 ★★★
      use_origin_size: this.use_origin_layout !== false,
      origin_layout: this.use_origin_layout !== false ? originLayout : undefined,
      font_settings: this.use_origin_layout !== false ? fontSettings : undefined,
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_shorts.mp4`,
      folder_name: folderName,
    };

    $.export("debug_request", {
      header_text: requestPayload.header_text,
      header_text_english: requestPayload.header_text_english,
      footer_text: requestPayload.footer_text,
      footer_text_english: requestPayload.footer_text_english,
      subtitle_enabled: requestPayload.subtitle_enabled,
      subtitle_english_enabled: requestPayload.subtitle_english_enabled,
      use_origin_layout: this.use_origin_layout,
      font_settings: requestPayload.font_settings,
      sample_video_narration_english: requestPayload.videos[0]?.narration_english || "NONE",
    });

    try {
      const response = await axios($, {
        method: "POST",
        url: `${this.ffmpeg_vm_url}/render/puppy`,
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 900000,
      });

      $.export("$summary", `Rendered ${response.total_duration?.toFixed(1) || "N/A"}s video with ${sortedVideos.length} clips via FFmpeg VM`);

      return {
        success: true,
        url: response.url,
        folder_name: folderName,
        total_duration: response.total_duration,
        render_engine: "ffmpeg-vm",
        job_id: response.job_id,
        youtube_metadata: youtubeMetadata,
        generated_titles: generatedTitles,
        layout_config: {
          preset: preset,
          use_origin_layout: this.use_origin_layout,
          font_settings: fontSettings
        },
        stats: response.stats || {
          video_count: sortedVideos.length,
          has_bgm: !!this.bgm_url,
          has_header: !!headerTextKorean,
          has_header_english: !!headerTextEnglish,
          has_footer: !!footerText,
          has_footer_english: !!footerTextEnglish,
          has_subtitles: this.subtitle_enabled,
          has_english_subtitles: this.subtitle_english_enabled,
          titles_source: generatedTitles.header_korean ? "ai_generated" : "manual_or_fallback",
        },
      };

    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      throw new Error(`FFmpeg VM Error: ${errorMsg}`);
    }
  },
});
