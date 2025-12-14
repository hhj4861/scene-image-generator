import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy FFmpeg Render (VM)",
  description: "FFmpeg VM으로 최종 영상 합성 - 땅콩이 템플릿 (상단 타이틀 + 하단 채널명 + 자막 + 프로필카드)",

  props: {
    // =====================
    // 입력 데이터
    // =====================
    viral_title_output: {
      type: "string",
      label: "Viral Title Output (JSON)",
      description: "이전 단계의 바이럴 타이틀 출력. {{JSON.stringify(steps.Puppy_Viral_Title_V2.$return_value)}}",
    },
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "스크립트 생성기 출력. {{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
      optional: true,
    },
    topic_generator_output: {
      type: "string",
      label: "Topic Generator Output (JSON)",
      description: "토픽 생성기 출력. {{JSON.stringify(steps.Puppy_Topic_Generator.$return_value)}}",
      optional: true,
    },
    tts_generator_output: {
      type: "string",
      label: "TTS Generator Output (JSON)",
      description: "TTS 생성기 출력. {{JSON.stringify(steps.Puppy_ElevenLabs_TTS.$return_value)}}",
      optional: true,
    },

    // =====================
    // BGM 설정
    // =====================
    bgm_url: {
      type: "string",
      label: "BGM URL",
      description: "배경음악 URL (CDN 링크). 예: https://cdn1.suno.ai/xxx.mp3",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM Volume (오디오 있을 때)",
      description: "원본 오디오가 있는 씬에서의 BGM 볼륨 (0.0-1.0). 낮을수록 원본 소리가 잘 들림",
      default: "0.15",
    },
    bgm_volume_no_audio: {
      type: "string",
      label: "BGM Volume (오디오 없을 때)",
      description: "원본 오디오가 없는 씬에서의 BGM 볼륨 (0.0-1.0). 프로필카드 등 무음 씬에 적용",
      default: "0.8",
    },

    // =====================
    // 헤더/푸터 텍스트
    // =====================
    header_text: {
      type: "string",
      label: "Header Text Korean (상단 제목)",
      description: "영상 상단에 표시될 한글 제목. 비워두면 AI 생성 타이틀 사용",
      optional: true,
    },
    header_text_english: {
      type: "string",
      label: "Header Text English (상단 영문)",
      description: "영상 상단에 표시될 영어 제목 (한글 아래 작게 표시)",
      optional: true,
    },
    footer_text: {
      type: "string",
      label: "Footer Text Korean (하단 채널명)",
      description: "영상 하단에 표시될 채널/시리즈명. 예: 땅콩이네 🐶",
      optional: true,
    },
    footer_text_english: {
      type: "string",
      label: "Footer Text English (하단 영문)",
      description: "영상 하단에 표시될 영문 채널명",
      optional: true,
    },

    // =====================
    // 자막 설정
    // =====================
    subtitle_enabled: {
      type: "boolean",
      label: "Enable Korean Subtitles",
      description: "한글 자막 활성화 여부",
      default: true,
    },
    subtitle_english_enabled: {
      type: "boolean",
      label: "Enable English Subtitles",
      description: "영어 자막 활성화 여부 (한글 자막 아래 표시)",
      default: true,
    },
    subtitle_timing_mode: {
      type: "string",
      label: "Subtitle Timing Mode",
      description: "자막 표시 방식. timed: 지정된 시간에만, always: 항상 표시",
      default: "timed",
    },

    // =====================
    // 영상 설정
    // =====================
    force_vertical: {
      type: "boolean",
      label: "Force Vertical (16:9 → 9:16)",
      description: "가로 영상(16:9)을 세로(9:16)로 변환. 쇼츠용",
      default: true,
    },
    video_scale_mode: {
      type: "string",
      label: "Video Scale Mode",
      description: "영상 크기 조절 방식. fit: 비율 유지(검은 여백), fill: 화면 채움(잘림)",
      default: "fit",
    },
    video_width: {
      type: "integer",
      label: "Video Width",
      description: "출력 영상 너비 (픽셀). 쇼츠 기본: 720",
      default: 720,
    },
    video_height: {
      type: "integer",
      label: "Video Height",
      description: "출력 영상 높이 (픽셀). 쇼츠 기본: 1280",
      default: 1280,
    },

    // =====================
    // 레이아웃 설정 (Y 좌표)
    // =====================
    layout_header_y: {
      type: "integer",
      label: "Header Y Position",
      description: "헤더(제목) Y 좌표. 화면 상단부터의 거리 (픽셀)",
      default: 300,
    },
    layout_video_area_y: {
      type: "integer",
      label: "Video Area Y Position",
      description: "영상 영역 시작 Y 좌표. 영상이 배치되는 시작점",
      default: 250,
    },
    layout_video_area_height: {
      type: "integer",
      label: "Video Area Height",
      description: "영상 영역 높이 (픽셀). 영상이 표시되는 영역 크기",
      default: 800,
    },
    layout_subtitle_y: {
      type: "integer",
      label: "Subtitle Y Position",
      description: "자막 Y 좌표. 자막이 표시되는 위치",
      default: 950,
    },
    layout_footer_y: {
      type: "integer",
      label: "Footer Y Position",
      description: "푸터(채널명) Y 좌표. 화면 하단 채널명 위치",
      default: 1000,
    },

    // =====================
    // 폰트 크기 설정
    // =====================
    font_header_korean_size: {
      type: "integer",
      label: "Header Korean Font Size",
      description: "헤더 한글 폰트 크기 (픽셀)",
      default: 55,
    },
    font_header_english_size: {
      type: "integer",
      label: "Header English Font Size",
      description: "헤더 영문 폰트 크기 (픽셀)",
      default: 20,
    },
    font_header_english_y_offset: {
      type: "integer",
      label: "Header English Y Offset",
      description: "헤더 영문 Y 오프셋. 한글 제목과의 간격",
      default: 90,
    },
    font_subtitle_korean_size: {
      type: "integer",
      label: "Subtitle Korean Font Size",
      description: "자막 한글 폰트 크기 (픽셀)",
      default: 32,
    },
    font_subtitle_english_size: {
      type: "integer",
      label: "Subtitle English Font Size",
      description: "자막 영문 폰트 크기 (픽셀)",
      default: 24,
    },
    font_footer_korean_size: {
      type: "integer",
      label: "Footer Korean Font Size",
      description: "푸터 한글 폰트 크기 (픽셀)",
      default: 48,
    },
    font_footer_english_size: {
      type: "integer",
      label: "Footer English Font Size",
      description: "푸터 영문 폰트 크기 (픽셀)",
      default: 22,
    },
    font_footer_english_y_offset: {
      type: "integer",
      label: "Footer English Y Offset",
      description: "푸터 영문 Y 오프셋. 한글 채널명과의 간격",
      default: 70,
    },

    // =====================
    // 프로필 카드 설정
    // =====================
    profile_card_base_y: {
      type: "integer",
      label: "Profile Card Base Y",
      description: "프로필 카드 시작 Y 좌표. 영상 오른쪽에 표시되는 프로필 정보 위치",
      default: 580,
    },
    profile_card_line_height: {
      type: "integer",
      label: "Profile Card Line Height",
      description: "프로필 카드 항목 간 간격 (픽셀)",
      default: 40,
    },
    profile_card_header_font_size: {
      type: "integer",
      label: "Profile Card Header Font Size",
      description: "프로필 카드 헤더(예: [여자 출연자]) 폰트 크기",
      default: 30,
    },
    profile_card_item_font_size: {
      type: "integer",
      label: "Profile Card Item Font Size",
      description: "프로필 카드 항목(예: 이름: 땅콩이) 폰트 크기",
      default: 20,
    },
    profile_card_max_chars: {
      type: "integer",
      label: "Profile Card Max Chars",
      description: "프로필 카드 한 줄 최대 글자 수",
      default: 30,
    },
    profile_card_right_margin: {
      type: "integer",
      label: "Profile Card Right Margin",
      description: "프로필 카드 오른쪽 여백 (픽셀). 화면 오른쪽 끝과의 거리",
      default: 150,
    },

    // =====================
    // 서버 설정
    // =====================
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      description: "Google Cloud Storage 버킷 이름",
      default: "shorts-videos-storage-mcp-test-457809",
    },
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM API URL",
      description: "FFmpeg 렌더링 서버 URL",
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
    const footerTextEnglish = this.footer_text_english || "";

    $.export("titles", {
      korean: headerTextKorean,
      english: headerTextEnglish,
      footer: footerText,
      footer_english: footerTextEnglish,
    });

    // =====================
    // 3. 레이아웃 설정
    // =====================
    const fontScale = this.video_width / 720;
    
    const layoutConfig = {
      video_area: {
        x: 0,
        y: this.layout_video_area_y,
        width: this.video_width,
        height: this.layout_video_area_height
      },
      header_area: {
        y: this.layout_header_y,
        height: 80,
        single_line: true,
        max_lines: 1
      },
      subtitle_area: {
        y: this.layout_subtitle_y,
        height: 100,
        single_line: false
      },
      footer_area: {
        y: this.layout_footer_y,
        height: 80
      },
      font_scale: fontScale,
      force_vertical: this.force_vertical
    };

    // ★★★ 폰트 설정 ★★★
    const fontSettings = {
      header_korean: {
        font: "NanumSquareRoundOTFEB",
        size: this.font_header_korean_size,
        max_lines: 1
      },
      header_english: {
        font: "NotoSerif-Regular",
        size: this.font_header_english_size,
        y_offset: this.font_header_english_y_offset
      },
      subtitle_korean: {
        font: "NanumSquareRoundOTFEB",
        size: this.font_subtitle_korean_size,
        max_lines: 1
      },
      subtitle_english: {
        font: "NotoSerif-Regular",
        size: this.font_subtitle_english_size,
        max_lines: 1
      },
      footer_korean: {
        size: this.font_footer_korean_size
      },
      footer_english: {
        size: this.font_footer_english_size,
        y_offset: this.font_footer_english_y_offset
      }
    };

    // ★★★ 프로필 카드 설정 ★★★
    const PROFILE_CARD_CONFIG = {
      baseY: this.profile_card_base_y,
      lineHeight: this.profile_card_line_height,
      headerFontSize: this.profile_card_header_font_size,
      itemFontSize: this.profile_card_item_font_size,
      maxChars: this.profile_card_max_chars,
      rightMargin: this.profile_card_right_margin
    };

    // =====================
    // 4. timed_subtitles 및 profile_card 처리
    // =====================
    let mergedTimedSubtitles = [];
    const sceneDuration = 8;  // 각 씬 기본 길이

    // config에서 timed_subtitles가 있으면 추가
    if (viralTitleOutput.timed_subtitles) {
      mergedTimedSubtitles = viralTitleOutput.timed_subtitles.map(sub => ({
        ...sub,
        right_margin: sub.right_margin || (sub.position === 'right' ? PROFILE_CARD_CONFIG.rightMargin : undefined)
      }));
    }

    // ★★★ 씬별 오디오 정보 (BGM 구간별 볼륨 조절용) ★★★
    const sceneAudioMap = sortedVideos.map((v, idx) => ({
      scene_index: v.index || (idx + 1),
      start_time: idx * sceneDuration,
      end_time: (idx + 1) * sceneDuration,
      has_audio: v.has_audio !== undefined ? v.has_audio : true
    }));

    // profile_card 처리
    for (const video of sortedVideos) {
      if (video.profile_card) {
        const pc = video.profile_card;
        const sceneStartTime = ((video.index || 1) - 1) * sceneDuration;
        
        const baseY = pc.base_y || PROFILE_CARD_CONFIG.baseY;
        const lineHeight = pc.line_height || PROFILE_CARD_CONFIG.lineHeight;
        const headerFontSize = pc.header_font_size || PROFILE_CARD_CONFIG.headerFontSize;
        const itemFontSize = pc.item_font_size || PROFILE_CARD_CONFIG.itemFontSize;
        const maxChars = pc.max_chars || PROFILE_CARD_CONFIG.maxChars;
        const rightMargin = pc.right_margin || PROFILE_CARD_CONFIG.rightMargin;
        
        const startTime = pc.start_time || 0.5;
        const endTime = pc.end_time || 8;
        
        // 헤더 추가
        if (pc.header) {
          mergedTimedSubtitles.push({
            start_time: sceneStartTime + (pc.header_start_time || startTime),
            end_time: sceneStartTime + (pc.header_end_time || endTime),
            text_ko: pc.header.startsWith('[') ? pc.header : `[${pc.header}]`,
            text_en: pc.header_english || '',
            position: pc.position || 'right',
            y_offset: pc.header_y_offset || baseY,
            font_size: pc.header_font_size || headerFontSize,
            max_chars: pc.header_max_chars || maxChars,
            right_margin: rightMargin
          });
        }
        
        // 아이템들 추가
        if (pc.items) {
          pc.items.forEach((item, idx) => {
            const itemStart = item.start_time 
              ? sceneStartTime + item.start_time 
              : sceneStartTime + startTime + ((idx + 1) * (pc.interval || 1.5));
            const itemEnd = item.end_time 
              ? sceneStartTime + item.end_time 
              : sceneStartTime + endTime;
            const itemYOffset = item.y_offset || (baseY + 20 + (lineHeight * (idx + 1)));
            
            mergedTimedSubtitles.push({
              start_time: itemStart,
              end_time: itemEnd,
              text_ko: `${item.label}: ${item.value}`,
              text_en: item.english || '',
              position: item.position || pc.position || 'right',
              y_offset: itemYOffset,
              font_size: item.font_size || itemFontSize,
              max_chars: item.max_chars || maxChars,
              right_margin: item.right_margin || rightMargin
            });
          });
        }
      }
    }

    // 시간순 정렬
    mergedTimedSubtitles.sort((a, b) => a.start_time - b.start_time);

    // =====================
    // 5. FFmpeg VM API 호출
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
        timed_subtitles: v.timed_subtitles || null,
        profile_card: v.profile_card || null,
        has_audio: v.has_audio !== undefined ? v.has_audio : true,
      })),
      header_text: headerTextKorean,
      header_text_english: headerTextEnglish,
      footer_text: footerText,
      footer_text_english: footerTextEnglish,
      subtitle_enabled: this.subtitle_enabled,
      subtitle_english_enabled: this.subtitle_english_enabled,
      subtitle_timing_mode: this.subtitle_timing_mode,
      timed_subtitles: mergedTimedSubtitles.length > 0 ? mergedTimedSubtitles : null,
      bgm_url: this.bgm_url || null,
      bgm_volume: parseFloat(this.bgm_volume) || 0.15,
      bgm_volume_no_audio: parseFloat(this.bgm_volume_no_audio) || 0.8,
      scene_audio_map: sceneAudioMap,
      width: this.video_width,
      height: this.video_height,
      use_origin_size: true,
      force_vertical: this.force_vertical,
      video_scale_mode: this.video_scale_mode,
      origin_layout: layoutConfig,
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_shorts.mp4`,
      folder_name: folderName,
      font_settings: fontSettings,
    };

    $.export("debug_config", {
      layout: layoutConfig,
      font_settings: fontSettings,
      profile_card_config: PROFILE_CARD_CONFIG,
      scene_audio_map: sceneAudioMap,
      subtitle_count: mergedTimedSubtitles.length,
    });

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
          subtitle_count: mergedTimedSubtitles.length,
          scene_audio_map: sceneAudioMap,
        },
      };

    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      throw new Error(`FFmpeg VM Error: ${errorMsg}`);
    }
  },
});
