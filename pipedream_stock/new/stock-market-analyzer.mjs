import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock Market Analyzer",
  description: "주식 시장 현황 분석기 - YouTube 영상/채널 분석 또는 최신 뉴스 기반 현황 정리",

  props: {
    // =====================
    // 테스트 모드 설정
    // =====================
    test_mode: {
      type: "boolean",
      label: "테스트 모드",
      description: "테스트 모드 활성화 시 Mock 데이터로 2개 key_points만 생성 (전체 파이프라인 테스트용)",
      default: false,
      optional: true,
    },
    test_key_points_count: {
      type: "integer",
      label: "테스트 key_points 수",
      description: "테스트 모드에서 생성할 key_points 수 (기본: 2)",
      default: 2,
      optional: true,
    },

    // =====================
    // 입력 소스 설정
    // =====================
    youtube_url: {
      type: "string",
      label: "YouTube URL (Optional)",
      description: "YouTube 영상 URL 또는 채널 URL. 채널 URL 입력 시 분석 기준일에 업로드된 최신 영상을 자동으로 찾아 분석합니다. 비워두면 뉴스 기반 분석.",
      optional: true,
    },
    analysis_date: {
      type: "string",
      label: "분석 기준일",
      description: "YYYY-MM-DD 형식. 비워두면 오늘 날짜 사용. 채널 URL 입력 시 해당 날짜에 업로드된 영상을 찾습니다.",
      optional: true,
    },
    market_type: {
      type: "string",
      label: "시장 유형",
      description: "분석할 시장 선택",
      options: [
        { label: "미국 (US Market)", value: "us" },
        { label: "한국 (Korean Market)", value: "kr" },
        { label: "글로벌 (Global)", value: "global" },
      ],
      default: "us",
    },
    analysis_focus: {
      type: "string[]",
      label: "분석 초점",
      description: "중점적으로 분석할 영역 선택 (복수 선택 가능)",
      options: [
        { label: "거시경제 (Macro)", value: "macro" },
        { label: "금리/채권 (Interest Rate)", value: "interest" },
        { label: "기술주 (Tech)", value: "tech" },
        { label: "에너지 (Energy)", value: "energy" },
        { label: "헬스케어 (Healthcare)", value: "healthcare" },
        { label: "금융 (Finance)", value: "finance" },
        { label: "소비재 (Consumer)", value: "consumer" },
        { label: "AI/반도체 (AI/Semiconductor)", value: "ai_semi" },
      ],
      default: ["macro", "tech", "ai_semi"],
      optional: true,
    },

    // =====================
    // API Keys
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google Gemini API Key (https://aistudio.google.com)",
      secret: true,
    },
    serper_api_key: {
      type: "string",
      label: "Serper API Key",
      description: "뉴스 검색용 Serper API Key (https://serper.dev). YouTube URL 없을 때 필수.",
      secret: true,
      optional: true,
    },
    youtube_api_key: {
      type: "string",
      label: "YouTube API Key (Optional)",
      description: "YouTube Data API Key. 채널에서 영상 검색 시 더 정확한 결과를 제공합니다.",
      secret: true,
      optional: true,
    },
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key (For Whisper)",
      description: "OpenAI API Key for Whisper speech-to-text. Required for videos without captions. (~$0.006/min)",
      secret: true,
      optional: true,
    },
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM URL",
      description: "FFmpeg VM server URL for audio extraction. Default: http://34.64.168.173:3000",
      default: "http://34.64.168.173:3000",
      optional: true,
    },

    // =====================
    // LLM 설정
    // =====================
    llm_model: {
      type: "string",
      label: "LLM Model",
      options: [
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash" },
        { label: "Gemini 1.5 Pro (Best)", value: "gemini-1.5-pro" },
        { label: "Gemini 2.0 Flash Thinking (Reasoning)", value: "gemini-2.0-flash-thinking-exp" },
      ],
      default: "gemini-2.0-flash",
    },

    // =====================
    // 출력 설정
    // =====================
    output_language: {
      type: "string",
      label: "출력 언어",
      options: [
        { label: "한국어", value: "korean" },
        { label: "English", value: "english" },
      ],
      default: "korean",
    },

    // =====================
    // 성능 최적화 설정
    // =====================
    fast_mode: {
      type: "boolean",
      label: "Fast Mode",
      description: "병렬 처리 + 짧은 transcript로 속도 향상 (정확도 약간 감소)",
      default: true,
      optional: true,
    },
    max_transcript_length: {
      type: "integer",
      label: "Max Transcript Length",
      description: "분석할 최대 텍스트 길이 (기본: 15000자, Fast Mode: 8000자)",
      default: 15000,
      optional: true,
    },
  },

  async run({ $ }) {
    const analysisDate = this.analysis_date || new Date().toISOString().split("T")[0];
    const marketLabels = { us: "미국", kr: "한국", global: "글로벌" };
    const marketLabel = marketLabels[this.market_type];

    // ==========================================
    // 테스트 모드: Mock 데이터로 빠르게 반환
    // ==========================================
    if (this.test_mode) {
      console.log("🧪 테스트 모드 활성화 - Mock 데이터 생성");

      // 테스트용 key_points 풀
      const TEST_KEY_POINTS_POOL = [
        "미국 11월 고용 보고서 결과 혼조세, 비농업 부문 고용은 증가했지만 실업률이 4년 만에 최고치를 기록하며 금리 인하에 대한 불확실성을 키웠습니다.",
        "테슬라가 무인 로봇 택시 이슈와 목표가 상향 조정에 힘입어 급등하며 시가총액 순위 7위에 안착, 자율주행 시장 경쟁 심화가 예상됩니다.",
        "AI 버블 논쟁 속에서 과거 버블 붕괴 직전 중앙은행의 통화 긴축이 선행되었다는 점을 상기하며, 현재 연준의 완화 사이클이 지속되는 동안 AI 관련주 강세가 이어질 수 있다는 분석이 나왔습니다.",
        "소비재 섹터가 조용한 강세를 보이고 있으며, 방산 및 항공우주 섹터도 국방비 지출 확대 모멘텀에 힘입어 긍정적인 전망이 제시되어 포트폴리오 다변화 전략이 필요합니다.",
        "WTI 유가가 급락하며 에너지 기업들의 실적 및 현금 흐름 악화 우려가 제기되었고, 이는 주가 하락으로 이어질 수 있다는 점에 주의해야 합니다.",
        "마이크론 실적 발표를 앞두고 목표가가 상향 조정되는 등 기대감이 높지만, 과거 실적 발표 후 주가 하락 흐름과 위스퍼넘버에 대한 경계심도 존재합니다.",
        "데이터센터 건설 관련 규제 완화 기대감이 형성되면서 관련 종목들의 주가가 상승 전환하거나 낙폭을 줄이는 등 긍정적인 영향을 미치고 있습니다.",
        "반도체 업황 둔화 우려가 커지면서 관련 종목들의 주가가 하락세를 보이고 있어 투자자들의 주의가 필요합니다.",
      ];

      // 랜덤으로 key_points 선택
      const keyPointsCount = this.test_key_points_count || 2;
      const shuffled = [...TEST_KEY_POINTS_POOL].sort(() => Math.random() - 0.5);
      const selectedKeyPoints = shuffled.slice(0, keyPointsCount);

      console.log(`📊 테스트 key_points: ${keyPointsCount}개 선택됨`);
      selectedKeyPoints.forEach((kp, i) => {
        console.log(`   ${i + 1}. ${kp.substring(0, 50)}...`);
      });

      // Mock 분석 결과
      const mockAnalysis = {
        executive_summary: `[테스트] ${analysisDate} ${marketLabel} 시장 분석 요약입니다. 테스트 모드로 실행 중입니다.`,
        key_points: selectedKeyPoints,
        market_outlook: {
          sentiment: "neutral",
          confidence: 70,
          short_term: "혼조세",
          medium_term: "상승 가능",
        },
        recommended_sectors: [
          { sector_name: "기술", recommendation: "비중확대", reason: "AI 성장 지속" },
          { sector_name: "소비재", recommendation: "비중확대", reason: "강한 소비 수요" },
        ],
        top_picks: [
          { ticker: "TSLA", company_name: "Tesla Inc", company_name_kr: "테슬라", sector: "기술", recommendation: "매수", investment_thesis: "자율주행 기술 리더십" },
          { ticker: "NVDA", company_name: "NVIDIA Corp", company_name_kr: "엔비디아", sector: "반도체", recommendation: "매수", investment_thesis: "AI 칩 시장 독점" },
        ],
        risk_factors: ["금리 불확실성", "지정학적 리스크", "밸류에이션 부담"],
        hook_line: `${marketLabel} 증시 핵심 뉴스!`,
        narrative_summary: `오늘 ${marketLabel} 시장은 혼조세를 보이고 있습니다. 테스트 데이터입니다.`,
      };

      const testResult = {
        analysis_date: analysisDate,
        market_type: this.market_type,
        market_label: marketLabel,
        source: "test_mode",
        video_info: {
          title: "[테스트] Mock 데이터",
          channel: "Test Channel",
          url: null,
        },
        analysis: mockAnalysis,
        _test_mode: true,
        _key_points_count: keyPointsCount,
        generated_at: new Date().toISOString(),
      };

      $.export("analysis", mockAnalysis);
      $.export("$summary", `[테스트] ${marketLabel} 분석 완료 (key_points: ${keyPointsCount}개)`);
      return testResult;
    }

    // ==========================================
    // LLM Caller
    // ==========================================
    const callGemini = async (prompt, temperature = 0.3) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.llm_model}:generateContent`;
      const resp = await axios($, {
        url,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192 },
        },
      });
      return resp.candidates[0].content.parts[0].text;
    };

    // ==========================================
    // URL 유형 판별 (영상 vs 채널 vs 플레이리스트)
    // ==========================================
    const parseYouTubeUrl = (url) => {
      if (!url) return { type: "none" };

      // 플레이리스트 URL 패턴 (먼저 체크 - v= 파라미터가 함께 있을 수 있음)
      const playlistMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (playlistMatch && !url.includes("v=")) {
        // 순수 플레이리스트 URL (영상 없이)
        return { type: "playlist", playlistId: playlistMatch[1] };
      }

      // 영상 URL 패턴
      const videoPatterns = [
        /(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,  // 직접 Video ID
      ];

      for (const pattern of videoPatterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          return { type: "video", videoId: match[1] };
        }
      }

      // 채널 URL 패턴
      const channelPatterns = [
        { regex: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: "channel_id" },
        { regex: /youtube\.com\/@([a-zA-Z0-9_-]+)/, type: "handle" },
        { regex: /youtube\.com\/c\/([a-zA-Z0-9_-]+)/, type: "custom" },
        { regex: /youtube\.com\/user\/([a-zA-Z0-9_-]+)/, type: "user" },
      ];

      for (const { regex, type } of channelPatterns) {
        const match = url.match(regex);
        if (match && match[1]) {
          return { type: "channel", subType: type, identifier: match[1] };
        }
      }

      return { type: "unknown" };
    };

    // ==========================================
    // 채널 ID 추출 (handle/@username → channel ID)
    // ==========================================
    const getChannelId = async (channelInfo) => {
      // 이미 channel_id인 경우
      if (channelInfo.subType === "channel_id") {
        return channelInfo.identifier;
      }

      // YouTube Data API로 채널 ID 가져오기
      if (this.youtube_api_key) {
        try {
          let searchParam;
          if (channelInfo.subType === "handle") {
            searchParam = `forHandle=@${channelInfo.identifier}`;
          } else {
            searchParam = `forUsername=${channelInfo.identifier}`;
          }

          const resp = await axios($, {
            url: `https://www.googleapis.com/youtube/v3/channels?${searchParam}&part=id&key=${this.youtube_api_key}`,
            method: "GET",
          });

          if (resp.items && resp.items.length > 0) {
            return resp.items[0].id;
          }
        } catch (e) {
          console.log(`YouTube API failed: ${e.message}, trying HTML parsing...`);
        }
      }

      // HTML 파싱으로 채널 ID 추출
      try {
        let channelUrl;
        if (channelInfo.subType === "handle") {
          channelUrl = `https://www.youtube.com/@${channelInfo.identifier}`;
        } else if (channelInfo.subType === "custom") {
          channelUrl = `https://www.youtube.com/c/${channelInfo.identifier}`;
        } else {
          channelUrl = `https://www.youtube.com/user/${channelInfo.identifier}`;
        }

        const resp = await axios($, {
          url: channelUrl,
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        const html = typeof resp === "string" ? resp : resp.data || "";

        // 여러 패턴으로 channel ID 추출 시도
        const patterns = [
          /"channelId":"(UC[a-zA-Z0-9_-]+)"/,
          /channel_id=([a-zA-Z0-9_-]+)/,
          /"externalId":"(UC[a-zA-Z0-9_-]+)"/,
          /data-channel-external-id="([a-zA-Z0-9_-]+)"/,
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }

        throw new Error("Could not find channel ID in page");
      } catch (e) {
        throw new Error(`Failed to get channel ID: ${e.message}`);
      }
    };

    // ==========================================
    // RSS 피드에서 채널 영상 목록 가져오기
    // ==========================================
    const getChannelVideos = async (channelId) => {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      try {
        const resp = await axios($, {
          url: rssUrl,
          method: "GET",
        });

        const xml = typeof resp === "string" ? resp : resp.data || "";

        // 영상 정보 추출
        const videos = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
          const entry = match[1];

          const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
          const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
          const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
          const authorMatch = entry.match(/<name>([^<]+)<\/name>/);

          if (videoIdMatch && titleMatch && publishedMatch) {
            const publishedDate = publishedMatch[1].split("T")[0];  // YYYY-MM-DD

            videos.push({
              videoId: videoIdMatch[1],
              title: titleMatch[1],
              published: publishedDate,
              publishedFull: publishedMatch[1],
              author: authorMatch ? authorMatch[1] : "Unknown",
            });
          }
        }

        return videos;
      } catch (e) {
        throw new Error(`Failed to fetch channel RSS: ${e.message}`);
      }
    };

    // ==========================================
    // 플레이리스트에서 영상 목록 가져오기 (HTML 파싱)
    // ==========================================
    const getPlaylistVideos = async (playlistId) => {
      console.log(`[Playlist] Fetching videos from playlist: ${playlistId}`);

      try {
        const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        const resp = await axios($, {
          url: playlistUrl,
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          },
        });

        const html = typeof resp === "string" ? resp : resp.data || "";

        // 플레이리스트 제목 추출
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const playlistTitle = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : "Unknown Playlist";

        // 영상 정보 추출 (ytInitialData에서)
        const videos = [];

        // videoId와 title 추출 패턴
        const videoPattern = /"videoId":"([a-zA-Z0-9_-]{11})"[^}]*?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
        let match;

        const seenIds = new Set();
        while ((match = videoPattern.exec(html)) !== null) {
          const videoId = match[1];
          const title = match[2];

          if (!seenIds.has(videoId)) {
            seenIds.add(videoId);
            videos.push({
              videoId,
              title,
              playlistId,
            });
          }
        }

        // 대체 패턴 (간단한 형식)
        if (videos.length === 0) {
          const simplePattern = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
          while ((match = simplePattern.exec(html)) !== null) {
            const videoId = match[1];
            if (!seenIds.has(videoId) && videoId !== playlistId) {
              seenIds.add(videoId);
              videos.push({
                videoId,
                title: `Video ${videos.length + 1}`,
                playlistId,
              });
            }
          }
        }

        console.log(`[Playlist] Found ${videos.length} videos in playlist: ${playlistTitle}`);

        return {
          playlistTitle,
          videos: videos.slice(0, 50),  // 최대 50개
        };
      } catch (e) {
        throw new Error(`Failed to fetch playlist: ${e.message}`);
      }
    };

    // ==========================================
    // 분석일 기준 최신 영상 찾기
    // ==========================================
    const findVideoForDate = async (channelId, targetDate) => {
      const videos = await getChannelVideos(channelId);

      if (videos.length === 0) {
        throw new Error("No videos found in channel");
      }

      // 분석일에 업로드된 영상 찾기
      const videosOnDate = videos.filter((v) => v.published === targetDate);

      if (videosOnDate.length > 0) {
        // 해당 날짜 영상 중 가장 최신 (첫 번째)
        console.log(`[Channel] Found ${videosOnDate.length} video(s) on ${targetDate}`);
        return videosOnDate[0];
      }

      // 해당 날짜 영상이 없으면 가장 최근 영상 사용
      console.log(`[Channel] No video on ${targetDate}, using latest video (${videos[0].published})`);
      return videos[0];
    };

    // ==========================================
    // YouTube 자막(Transcript) 추출 함수
    // ==========================================
    const fetchYouTubeTranscript = async (videoId) => {
      try {
        const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const pageResponse = await axios($, {
          url: videoPageUrl,
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          },
        });

        const html = typeof pageResponse === "string" ? pageResponse : pageResponse.data || "";

        const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/s);
        if (!captionMatch) {
          throw new Error("No captions found for this video");
        }

        let captionTracks;
        try {
          captionTracks = JSON.parse(captionMatch[1]);
        } catch (e) {
          throw new Error("Failed to parse caption tracks");
        }

        if (!captionTracks || captionTracks.length === 0) {
          throw new Error("No caption tracks available");
        }

        let selectedTrack = captionTracks.find((t) => t.languageCode === "ko") ||
          captionTracks.find((t) => t.languageCode === "en") ||
          captionTracks[0];

        const captionUrl = selectedTrack.baseUrl;
        const captionResponse = await axios($, {
          url: captionUrl,
          method: "GET",
        });

        const captionXml = typeof captionResponse === "string" ? captionResponse : captionResponse.data || "";

        const textMatches = captionXml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
        const transcriptParts = [];
        for (const match of textMatches) {
          const text = match[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n/g, " ")
            .trim();
          if (text) transcriptParts.push(text);
        }

        return {
          success: true,
          language: selectedTrack.languageCode,
          transcript: transcriptParts.join(" "),
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          transcript: null,
        };
      }
    };

    // ==========================================
    // YouTube 비디오 메타데이터 가져오기
    // ==========================================
    const fetchVideoMetadata = async (videoId) => {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const resp = await axios($, { url: oembedUrl, method: "GET" });
        return {
          title: resp.title,
          author: resp.author_name,
          thumbnail: resp.thumbnail_url,
        };
      } catch (e) {
        return { title: "Unknown", author: "Unknown", thumbnail: null };
      }
    };

    // ==========================================
    // FFmpeg VM으로 YouTube 오디오 추출
    // ==========================================
    const extractAudioFromVM = async (videoId) => {
      const vmUrl = this.ffmpeg_vm_url || "http://34.64.168.173:3000";

      console.log(`[VM] Extracting audio from YouTube video: ${videoId}`);

      const resp = await axios($, {
        url: `${vmUrl}/extract-audio`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: {
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
          format: "mp3",
          quality: "128",
        },
        timeout: 300000,
      });

      return {
        success: true,
        audio_url: resp.audio_url,
        duration_seconds: resp.duration_seconds,
        video_id: resp.video_id,
      };
    };

    // ==========================================
    // Whisper API로 오디오를 텍스트로 변환
    // ==========================================
    const transcribeWithWhisper = async (audioUrl) => {
      if (!this.openai_api_key) {
        throw new Error("OpenAI API Key가 필요합니다. Whisper로 음성을 텍스트로 변환하려면 openai_api_key를 설정하세요.");
      }

      console.log(`[Whisper] Downloading audio from: ${audioUrl}`);

      const audioResponse = await axios($, {
        url: audioUrl,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 120000,
      });

      const FormData = (await import("form-data")).default;
      const form = new FormData();
      form.append("file", Buffer.from(audioResponse), {
        filename: "audio.mp3",
        contentType: "audio/mpeg",
      });
      form.append("model", "whisper-1");
      form.append("language", "ko");
      form.append("response_format", "text");

      console.log(`[Whisper] Sending to OpenAI Whisper API...`);

      const whisperResp = await axios($, {
        url: "https://api.openai.com/v1/audio/transcriptions",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.openai_api_key}`,
          ...form.getHeaders(),
        },
        data: form,
        timeout: 300000,
      });

      return {
        success: true,
        transcript: typeof whisperResp === "string" ? whisperResp : whisperResp.text || whisperResp,
        language: "ko",
        method: "whisper",
      };
    };

    // ==========================================
    // YouTube 분석 함수 (videoId 직접 받음)
    // ==========================================
    const analyzeYouTubeVideo = async (videoId, sourceInfo = {}) => {
      $.export("source", "youtube");
      $.export("video_id", videoId);

      const startTime = Date.now();
      const fastMode = this.fast_mode !== false; // 기본값 true

      // 🚀 Fast Mode: 병렬 처리
      let metadata, transcriptResult;

      if (fastMode) {
        console.log(`[Fast Mode] 병렬 처리 시작...`);
        const [metadataResult, transcriptResultParallel] = await Promise.all([
          fetchVideoMetadata(videoId),
          fetchYouTubeTranscript(videoId),
        ]);
        metadata = metadataResult;
        transcriptResult = transcriptResultParallel;
        console.log(`[Fast Mode] 메타데이터+자막 완료: ${Date.now() - startTime}ms`);
      } else {
        metadata = await fetchVideoMetadata(videoId);
        transcriptResult = await fetchYouTubeTranscript(videoId);
      }

      $.export("video_metadata", metadata);
      let transcriptMethod = "caption";

      // 2차 시도: 자막이 없으면 VM + Whisper 사용
      if (!transcriptResult.success || !transcriptResult.transcript) {
        console.log(`[YouTube] 자막 없음, Whisper 사용 시도...`);
        $.export("transcript_method", "whisper");

        if (!this.openai_api_key) {
          throw new Error(
            `YouTube 영상에 자막이 없습니다. Whisper로 음성을 텍스트로 변환하려면 OpenAI API Key를 설정하세요.\n` +
            `비용: 약 $0.006/분 (10분 영상 = ~$0.06 = ~₩90)`
          );
        }

        try {
          const vmStartTime = Date.now();
          const audioResult = await extractAudioFromVM(videoId);
          const vmTime = Date.now() - vmStartTime;
          console.log(`[VM] Audio extracted: ${audioResult.duration_seconds?.toFixed(1)}s (${vmTime}ms)`);
          $.export("audio_duration", audioResult.duration_seconds);
          $.export("vm_time_ms", vmTime);

          const whisperStartTime = Date.now();
          transcriptResult = await transcribeWithWhisper(audioResult.audio_url);
          const whisperTime = Date.now() - whisperStartTime;
          transcriptMethod = "whisper";

          console.log(`[Whisper] Transcript length: ${transcriptResult.transcript?.length || 0} chars (${whisperTime}ms)`);
          $.export("whisper_time_ms", whisperTime);
        } catch (vmError) {
          throw new Error(
            `YouTube 영상 분석 실패:\n` +
            `- 자막: ${transcriptResult.error || "없음"}\n` +
            `- Whisper: ${vmError.message}\n\n` +
            `VM 서버에 /extract-audio 엔드포인트가 있는지 확인하세요.`
          );
        }
      } else {
        $.export("transcript_method", "caption");
        console.log(`[Caption] 자막 사용: ${transcriptResult.transcript?.length || 0}자`);
      }

      $.export("transcript_status", transcriptResult.success ? "success" : "failed");

      // 🚀 Fast Mode: 더 짧은 transcript 사용
      const maxTranscriptLength = fastMode
        ? (this.max_transcript_length || 8000)
        : (this.max_transcript_length || 15000);

      let transcript = transcriptResult.transcript;
      if (transcript.length > maxTranscriptLength) {
        transcript = transcript.substring(0, maxTranscriptLength) + "... (이하 생략)";
      }

      console.log(`[Transcript] 길이: ${transcript.length}자 (max: ${maxTranscriptLength})`);
      const transcriptTime = Date.now() - startTime;

      const prompt = `
당신은 주식 유튜브 콘텐츠 작가입니다. 다음은 주식/금융 관련 YouTube 영상의 ${transcriptMethod === "whisper" ? "음성 텍스트 변환 결과" : "자막"}입니다.
이 내용을 1분 분량 유튜브 쇼츠 영상용 대본으로 만들 수 있도록 상세하게 정리해주세요.

===== 영상 정보 =====
제목: ${metadata.title}
채널: ${metadata.author}
분석 기준일: ${analysisDate}
시장: ${marketLabel}

===== 영상 내용 (${transcriptResult.language}) =====
${transcript}
====================

다음 JSON 형식으로 응답해주세요 (모든 필드를 상세하게 작성):
\`\`\`json
{
  "narrative_summary": "여러분 오늘은 ${marketLabel}증시의 [주요 주제]를 분석해봤어요. [영상의 핵심 내용을 5-7문장으로 상세하게 서술. 특정 인물/전문가 이름은 제외하고 내용만 전달. 시장 상황, 주요 이슈, 추천 섹터/종목, 주의사항 등을 자연스럽게 연결하여 서술. 최소 300자 이상으로 작성]",
  "summary": "영상 핵심 요약 (300자 이상, 객관적이고 상세한 서술)",
  "key_points": [
    "핵심 포인트 1 (각 포인트는 50자 이상으로 구체적으로)",
    "핵심 포인트 2",
    "핵심 포인트 3",
    "핵심 포인트 4",
    "핵심 포인트 5",
    "핵심 포인트 6 (최소 6개 이상)"
  ],
  "market_outlook": {
    "sentiment": "bullish/bearish/neutral",
    "confidence": 0-100,
    "reasoning": "판단 근거 (100자 이상으로 상세히)"
  },
  "mentioned_sectors": [
    {
      "sector": "섹터명",
      "outlook": "positive/negative/neutral",
      "reason": "이유 (50자 이상)",
      "key_stocks": ["관련 종목1", "관련 종목2"]
    }
  ],
  "mentioned_tickers": [
    {
      "ticker": "티커",
      "name": "종목명",
      "action": "buy/sell/hold",
      "reason": "추천 이유 (30자 이상)",
      "detail": "상세 분석 내용 (50자 이상, 목표가, 현재 상황, 전망 등)",
      "catalyst": "상승/하락 촉매",
      "risk": "주의할 점"
    }
  ],
  "risk_factors": [
    "리스크 1 (각 30자 이상으로 구체적으로)",
    "리스크 2",
    "리스크 3 (최소 3개 이상)"
  ],
  "opportunities": [
    "기회 요인 1 (각 30자 이상으로 구체적으로)",
    "기회 요인 2",
    "기회 요인 3 (최소 3개 이상)"
  ],
  "timeline": "단기/중기/장기 전망과 구체적인 시점",
  "hook_line": "시청자 관심을 끄는 임팩트 있는 한 줄 (예: 테슬라 신고가 돌파! 지금이 기회일까요?)",
  "shorts_script_points": [
    {
      "order": 1,
      "topic": "오프닝 훅",
      "script": "오프닝 대사 (10-15자)",
      "duration_hint": "3초"
    },
    {
      "order": 2,
      "topic": "시장 현황",
      "script": "시장 현황 설명 대사 (40-60자)",
      "duration_hint": "10초"
    },
    {
      "order": 3,
      "topic": "핵심 이슈 1",
      "script": "첫 번째 핵심 이슈 설명 (40-60자)",
      "duration_hint": "10초"
    },
    {
      "order": 4,
      "topic": "핵심 이슈 2",
      "script": "두 번째 핵심 이슈 설명 (40-60자)",
      "duration_hint": "10초"
    },
    {
      "order": 5,
      "topic": "추천 종목/섹터",
      "script": "추천 내용 설명 (40-60자)",
      "duration_hint": "10초"
    },
    {
      "order": 6,
      "topic": "주의사항",
      "script": "주의할 점 설명 (30-40자)",
      "duration_hint": "7초"
    },
    {
      "order": 7,
      "topic": "마무리",
      "script": "마무리 멘트 + CTA (20-30자)",
      "duration_hint": "5초"
    },
    {
      "order": 8,
      "topic": "투자 경고",
      "script": "본 영상은 투자 권유가 아니에요",
      "duration_hint": "5초"
    }
  ]
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요." : "Write everything in English."}

중요 규칙:
1. narrative_summary는 "여러분 오늘은 ${marketLabel}증시의"로 시작하세요
2. 특정 전문가/애널리스트/유튜버 이름은 제외하고 내용만 전달하세요 (예: "HSL 파트너스 이형수 대표는" → 제외)
3. 친근하고 이해하기 쉬운 말투로 작성하세요 (~해요, ~이에요 체)
4. 반드시 유효한 JSON만 출력하세요
5. 영상에서 언급된 내용만 기반으로 분석하세요
6. shorts_script_points는 1분(60초) 분량의 쇼츠 대본용으로, 총 8개 씬으로 구성하세요
7. 각 씬의 script는 영상 자막/나레이션 대본입니다 - 전문적이면서도 이해하기 쉽게 작성하세요
8. 모든 필드를 빠짐없이 상세하게 작성하세요 - 내용이 짧으면 안됩니다
`;

      console.log(`[Gemini] 분석 요청 시작...`);
      const geminiStartTime = Date.now();
      const analysisResult = await callGemini(prompt);
      const geminiTime = Date.now() - geminiStartTime;
      console.log(`[Gemini] 분석 완료: ${geminiTime}ms`);

      const totalTime = Date.now() - startTime;
      console.log(`[Total] 전체 소요 시간: ${totalTime}ms (Transcript: ${transcriptTime}ms, Gemini: ${geminiTime}ms)`);
      $.export("timing", { total_ms: totalTime, transcript_ms: transcriptTime, gemini_ms: geminiTime });

      let parsed;
      try {
        const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
      } catch (e) {
        parsed = { summary: analysisResult, key_points: [], raw: true };
      }

      parsed.video_info = {
        title: metadata.title,
        author: metadata.author,
        video_id: videoId,
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        transcript_language: transcriptResult.language,
        transcript_method: transcriptMethod,
        ...sourceInfo,
      };

      return parsed;
    };

    // ==========================================
    // 뉴스 기반 분석 함수
    // ==========================================
    const analyzeNews = async () => {
      $.export("source", "news");

      if (!this.serper_api_key) {
        throw new Error("Serper API Key is required for news-based analysis");
      }

      const focusKeywords = {
        macro: "economy GDP inflation unemployment",
        interest: "interest rate fed treasury bond yield",
        tech: "technology stocks FAANG big tech",
        energy: "oil energy stocks crude",
        healthcare: "healthcare pharma biotech stocks",
        finance: "bank stocks financial sector",
        consumer: "consumer spending retail stocks",
        ai_semi: "AI artificial intelligence semiconductor nvidia",
      };

      const marketKeywords = {
        us: "US stock market S&P 500",
        kr: "Korea KOSPI stock market",
        global: "global stock market",
      };

      const searchQueries = (this.analysis_focus || ["macro"]).map(
        (focus) => `${marketKeywords[this.market_type]} ${focusKeywords[focus]} ${analysisDate}`
      );

      const newsResults = await Promise.all(
        searchQueries.map(async (query, index) => {
          try {
            const resp = await axios($, {
              url: "https://google.serper.dev/news",
              method: "POST",
              headers: {
                "X-API-KEY": this.serper_api_key,
                "Content-Type": "application/json",
              },
              data: { q: query, num: 5 },
            });
            return { focus: this.analysis_focus[index], articles: resp.news || [] };
          } catch (e) {
            return { focus: this.analysis_focus[index], articles: [], error: e.message };
          }
        })
      );

      const allArticles = newsResults.flatMap((r) =>
        r.articles.map((a) => ({
          focus: r.focus,
          title: a.title,
          snippet: a.snippet,
          source: a.source,
          date: a.date,
        }))
      );

      const newsContext = allArticles
        .slice(0, 20)
        .map((a) => `[${a.focus}] ${a.title}\n${a.snippet}`)
        .join("\n\n");

      const prompt = `
당신은 전문 금융 애널리스트입니다. 다음 최신 뉴스들을 종합하여 주식 시장 현황을 분석해주세요.

분석 기준일: ${analysisDate}
시장: ${marketLabel}
분석 초점: ${(this.analysis_focus || []).join(", ")}

===== 최신 뉴스 =====
${newsContext}
====================

다음 JSON 형식으로 응답해주세요:
\`\`\`json
{
  "summary": "시장 현황 요약 (300자 이내)",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", ...],
  "market_outlook": {
    "sentiment": "bullish/bearish/neutral",
    "confidence": 0-100,
    "reasoning": "판단 근거"
  },
  "sector_analysis": [
    {"sector": "섹터명", "outlook": "positive/negative/neutral", "reason": "이유", "hot_keywords": ["키워드1", "키워드2"]}
  ],
  "macro_indicators": {
    "interest_rate": "현재 금리 상황",
    "inflation": "인플레이션 상황",
    "employment": "고용 상황",
    "gdp": "경제 성장 상황"
  },
  "risk_factors": ["리스크 1", "리스크 2"],
  "opportunities": ["기회 요인 1", "기회 요인 2"],
  "recommended_focus_sectors": ["추천 섹터 1", "추천 섹터 2"],
  "timeline": "단기/중기/장기 전망"
}
\`\`\`

${this.output_language === "korean" ? "모든 내용은 한국어로 작성해주세요." : "Write everything in English."}
중요: 반드시 유효한 JSON만 출력하세요.
`;

      const analysisResult = await callGemini(prompt, 0.2);

      let parsed;
      try {
        const jsonMatch = analysisResult.match(/```json\s*([\s\S]*?)\s*```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1] : analysisResult);
      } catch (e) {
        parsed = { summary: analysisResult, key_points: [], raw: true };
      }

      return { ...parsed, news_sources: allArticles };
    };

    // ==========================================
    // 메인 실행 로직
    // ==========================================
    let analysisResult;
    let sourceType = "news";
    let sourceUrl = null;

    if (this.youtube_url) {
      const urlInfo = parseYouTubeUrl(this.youtube_url);
      console.log(`[URL] Parsed: ${JSON.stringify(urlInfo)}`);

      if (urlInfo.type === "video") {
        // 영상 URL → 직접 분석
        sourceType = "youtube_video";
        sourceUrl = `https://www.youtube.com/watch?v=${urlInfo.videoId}`;
        analysisResult = await analyzeYouTubeVideo(urlInfo.videoId);

      } else if (urlInfo.type === "channel") {
        // 채널 URL → 분석일 기준 영상 찾기
        sourceType = "youtube_channel";
        console.log(`[Channel] Getting channel ID for ${urlInfo.subType}: ${urlInfo.identifier}`);

        const channelId = await getChannelId(urlInfo);
        console.log(`[Channel] Channel ID: ${channelId}`);
        $.export("channel_id", channelId);

        const video = await findVideoForDate(channelId, analysisDate);
        console.log(`[Channel] Selected video: ${video.title} (${video.published})`);
        $.export("selected_video", video);

        sourceUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
        analysisResult = await analyzeYouTubeVideo(video.videoId, {
          source_type: "channel",
          channel_id: channelId,
          video_published: video.published,
          selected_for_date: analysisDate,
        });

      } else if (urlInfo.type === "playlist") {
        // 플레이리스트 URL → 첫 번째 영상 분석
        sourceType = "youtube_playlist";
        console.log(`[Playlist] Playlist ID: ${urlInfo.playlistId}`);
        $.export("playlist_id", urlInfo.playlistId);

        const playlistData = await getPlaylistVideos(urlInfo.playlistId);
        console.log(`[Playlist] Title: ${playlistData.playlistTitle}`);
        $.export("playlist_title", playlistData.playlistTitle);
        $.export("playlist_videos_count", playlistData.videos.length);

        if (playlistData.videos.length === 0) {
          throw new Error("No videos found in playlist");
        }

        // 첫 번째 영상 (가장 최신) 선택
        const video = playlistData.videos[0];
        console.log(`[Playlist] Selected video: ${video.title}`);
        $.export("selected_video", video);

        sourceUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
        analysisResult = await analyzeYouTubeVideo(video.videoId, {
          source_type: "playlist",
          playlist_id: urlInfo.playlistId,
          playlist_title: playlistData.playlistTitle,
          video_index: 0,
          total_videos: playlistData.videos.length,
        });

      } else {
        throw new Error(`Invalid YouTube URL format: ${this.youtube_url}\nSupported formats: video URL, channel URL (@handle, /channel/, /c/, /user/), playlist URL (?list=)`);
      }
    } else {
      // YouTube URL 없음 → 뉴스 기반 분석
      analysisResult = await analyzeNews();
    }

    // 결과 구조화
    const result = {
      analysis_date: analysisDate,
      market_type: this.market_type,
      market_label: marketLabel,
      source: sourceType,
      source_url: sourceUrl,
      analysis: analysisResult,
      generated_at: new Date().toISOString(),
    };

    $.export("market_analysis", result);
    return result;
  },
});
