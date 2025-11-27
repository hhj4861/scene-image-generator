import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News BGM Generator",
  description: "Generate background music for news shorts using MusicAPI (Sonic)",

  props: {
    // MusicAPI 설정
    musicapi_key: {
      type: "string",
      label: "MusicAPI API Key",
      description: "Get from https://musicapi.ai/",
      secret: true,
    },

    // 입력 데이터
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "Use: {{steps.News_Script_Generator.$return_value.folder_name}}",
    },
    total_duration: {
      type: "integer",
      label: "Total Duration (seconds)",
      description: "Use: {{steps.News_Script_Generator.$return_value.total_duration}}",
    },

    // BGM 스타일
    bgm_style: {
      type: "string",
      label: "BGM Style",
      options: [
        { label: "Breaking News (Urgent)", value: "breaking" },
        { label: "Professional News", value: "professional" },
        { label: "Financial/Corporate", value: "financial" },
        { label: "Tech/Innovation", value: "tech" },
        { label: "Dramatic/Epic", value: "dramatic" },
      ],
      default: "professional",
    },

    // 생성 설정
    model_version: {
      type: "string",
      label: "Model Version",
      options: [
        { label: "Sonic V4.5", value: "sonic-v4-5" },
        { label: "Sonic V4", value: "sonic-v4" },
      ],
      default: "sonic-v4-5",
    },
    max_wait_seconds: {
      type: "integer",
      label: "Max Wait (seconds)",
      default: 300,
    },
  },

  async run({ $ }) {
    $.export("status", "Generating news background music...");

    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    // BGM 스타일별 태그
    const styleConfig = {
      breaking: {
        tags: "urgent, news, breaking, dramatic, tension, broadcast, electronic, fast-paced",
        description: "Urgent breaking news background music with tension",
      },
      professional: {
        tags: "news, broadcast, professional, corporate, clean, modern, confident",
        description: "Professional news broadcast background music",
      },
      financial: {
        tags: "corporate, business, stock market, professional, confident, modern, electronic",
        description: "Financial news and stock market background music",
      },
      tech: {
        tags: "technology, innovation, modern, electronic, futuristic, digital, clean",
        description: "Tech news and innovation background music",
      },
      dramatic: {
        tags: "epic, dramatic, cinematic, powerful, orchestral, news, impactful",
        description: "Dramatic and epic news background music",
      },
    };

    const config = styleConfig[this.bgm_style] || styleConfig.professional;

    // MusicAPI 요청
    const requestBody = {
      mv: this.model_version,
      custom_mode: true,
      title: `News_BGM_${this.bgm_style}`,
      tags: config.tags,
      make_instrumental: true, // 뉴스는 항상 인스트루멘탈
    };

    $.export("bgm_config", {
      style: this.bgm_style,
      tags: config.tags,
    });

    // 생성 요청
    const createResponse = await axios($, {
      method: "POST",
      url: `${MUSICAPI_BASE}/sonic/create`,
      headers: {
        "Authorization": `Bearer ${this.musicapi_key}`,
        "Content-Type": "application/json",
      },
      data: requestBody,
    });

    if (!createResponse.task_id) {
      throw new Error(`Failed to create BGM task: ${JSON.stringify(createResponse)}`);
    }

    const taskId = createResponse.task_id;
    $.export("task_id", taskId);

    // 완료 대기
    $.export("status", "Waiting for BGM generation...");

    let result = null;
    const startTime = Date.now();
    const maxWaitMs = this.max_wait_seconds * 1000;
    const pollInterval = 5000;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusResponse = await axios($, {
        method: "GET",
        url: `${MUSICAPI_BASE}/sonic/task/${taskId}`,
        headers: {
          "Authorization": `Bearer ${this.musicapi_key}`,
        },
      });

      const taskStatus = statusResponse.status || statusResponse.state;

      if (taskStatus === "complete" || taskStatus === "completed" || taskStatus === "succeeded") {
        result = statusResponse;
        break;
      } else if (taskStatus === "failed" || taskStatus === "error") {
        throw new Error(`BGM generation failed: ${statusResponse.error || 'Unknown'}`);
      }

      // 개별 곡 상태 확인
      const songs = statusResponse.data || statusResponse.clips || [];
      if (Array.isArray(songs) && songs.length > 0) {
        const firstSong = songs[0];
        const songComplete = firstSong.state === "succeeded" ||
                            firstSong.state === "complete" ||
                            (firstSong.duration && firstSong.duration > 0 &&
                             firstSong.audio_url && !firstSong.audio_url.includes('audiopipe'));
        if (songComplete) {
          result = statusResponse;
          break;
        }
      }
    }

    if (!result) {
      throw new Error(`BGM generation timed out after ${this.max_wait_seconds}s`);
    }

    // 결과 처리
    const songs = result.data || result.songs || result.clips || [];
    if (songs.length === 0) {
      throw new Error("No BGM tracks generated");
    }

    // 완료된 곡 필터링
    const completedSongs = songs.filter(
      song => song.audio_url && !song.audio_url.includes('audiopipe.suno.ai')
    );

    const primaryBgm = completedSongs[0] || songs[0];

    $.export("$summary", `Generated news BGM: ${this.bgm_style}`);

    return {
      success: true,
      folder_name: this.folder_name,
      task_id: taskId,
      bgm_style: this.bgm_style,
      model: this.model_version,
      // Suno CDN URL 직접 사용 (Creatomate가 접근 가능)
      bgm_url: primaryBgm?.audio_url,
      bgm_duration: primaryBgm?.duration,
      songs_generated: completedSongs.length,
      all_songs: songs.map(s => ({
        id: s.id || s.clip_id,
        title: s.title,
        audio_url: s.audio_url,
        duration: s.duration,
      })),
    };
  },
});
