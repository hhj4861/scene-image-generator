import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Long Music Generator",
  description: "Generate long-form music (1 hour) for YouTube videos using MusicAPI (Sonic/Suno)",

  props: {
    // API 설정
    musicapi_key: {
      type: "string",
      label: "MusicAPI API Key",
      description: "Get your API key from https://musicapi.ai/dashboard/apikey",
      secret: true,
    },

    // 음악 장르/카테고리
    music_category: {
      type: "string",
      label: "Music Category",
      description: "Type of music video to create",
      options: [
        { label: "힙합 비트 (Hip-Hop Beats)", value: "hiphop" },
        { label: "운동 음악 (Workout Music)", value: "workout" },
        { label: "노동요/작업용 (Work Music)", value: "work" },
        { label: "공부 음악 (Study Music)", value: "study" },
        { label: "수면 음악 (Sleep Music)", value: "sleep" },
        { label: "카페 음악 (Cafe Music)", value: "cafe" },
        { label: "로파이 힙합 (Lo-Fi Hip-Hop)", value: "lofi" },
        { label: "재즈 (Jazz)", value: "jazz" },
        { label: "커스텀 (Custom)", value: "custom" },
      ],
      default: "lofi",
    },

    // 커스텀 스타일 (custom 선택시)
    custom_style: {
      type: "string",
      label: "Custom Style Tags",
      description: "Custom style tags when 'Custom' category is selected",
      optional: true,
    },
    custom_description: {
      type: "string",
      label: "Custom Description",
      description: "Custom music description when 'Custom' category is selected",
      optional: true,
    },

    // 생성 모드
    generation_strategy: {
      type: "string",
      label: "Generation Strategy",
      description: "How to create long-form music",
      options: [
        { label: "Loop Mode (1곡 반복)", value: "loop" },
        { label: "Extend Mode (곡 연장)", value: "extend" },
        { label: "Compilation Mode (여러 곡 생성)", value: "compilation" },
      ],
      default: "compilation",
    },

    // 목표 시간 (분)
    target_duration_minutes: {
      type: "integer",
      label: "Target Duration (minutes)",
      description: "Target total duration in minutes",
      default: 60,
    },

    // 모델 버전
    model_version: {
      type: "string",
      label: "Model Version",
      options: [
        { label: "Sonic V5 (Latest)", value: "sonic-v5" },
        { label: "Sonic V4.5 Plus", value: "sonic-v4-5-plus" },
        { label: "Sonic V4.5", value: "sonic-v4-5" },
        { label: "Sonic V4", value: "sonic-v4" },
      ],
      default: "sonic-v4-5",
    },

    // GCS 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
      optional: true,
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-audio-storage-mcp-test-457809",
      optional: true,
    },

    // 폴링 설정
    max_wait_per_song: {
      type: "integer",
      label: "Max Wait Per Song (seconds)",
      default: 180,
    },
  },

  async run({ steps, $ }) {
    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    // =====================
    // 1. 카테고리별 스타일 매핑
    // =====================
    const categoryStyles = {
      hiphop: {
        tags: "hip-hop, trap beats, 808 bass, hard hitting drums, urban, rap instrumental",
        description: "hard hitting hip-hop beats with heavy 808 bass, crisp hi-hats, and punchy drums",
        title_prefix: "Hip-Hop_Beat",
      },
      workout: {
        tags: "workout, high energy, EDM, motivational, fast tempo, electronic, gym music",
        description: "high energy workout music with driving beats, motivational electronic sounds perfect for gym",
        title_prefix: "Workout_Mix",
      },
      work: {
        tags: "productivity, upbeat, positive, background music, work music, focus, corporate",
        description: "upbeat and positive background music for work and productivity, not distracting",
        title_prefix: "Work_Music",
      },
      study: {
        tags: "study music, ambient, calm, focus, concentration, piano, soft, minimal",
        description: "calm and focused ambient music perfect for studying and concentration",
        title_prefix: "Study_Music",
      },
      sleep: {
        tags: "sleep music, ambient, relaxing, peaceful, meditation, slow, soft, dreamy",
        description: "peaceful and relaxing ambient music for sleep and meditation, very slow and calming",
        title_prefix: "Sleep_Music",
      },
      cafe: {
        tags: "cafe music, acoustic, jazz, bossa nova, relaxing, coffee shop, warm",
        description: "warm and relaxing cafe music with acoustic and jazz influences, perfect for coffee shop ambiance",
        title_prefix: "Cafe_Music",
      },
      lofi: {
        tags: "lo-fi hip-hop, chill beats, jazzy, vinyl crackle, relaxing, study beats, nostalgic",
        description: "chill lo-fi hip-hop beats with jazzy samples, vinyl crackle, perfect for relaxing or studying",
        title_prefix: "LoFi_Beats",
      },
      jazz: {
        tags: "jazz, smooth jazz, piano, saxophone, relaxing, sophisticated, classic",
        description: "smooth jazz music with piano and saxophone, sophisticated and relaxing",
        title_prefix: "Jazz_Session",
      },
      custom: {
        tags: "",
        description: "",
        title_prefix: "Custom_Music",
      },
    };

    const selectedStyle = categoryStyles[this.music_category];

    if (this.music_category === "custom") {
      selectedStyle.tags = this.custom_style || "ambient, instrumental, background music";
      selectedStyle.description = this.custom_description || "custom background music";
    }

    $.export("selected_category", this.music_category);
    $.export("style_tags", selectedStyle.tags);

    // =====================
    // 2. 필요한 곡 수 계산
    // =====================
    const targetDurationSec = this.target_duration_minutes * 60;
    const avgSongDuration = 180; // 평균 3분 (MusicAPI 기본 생성 길이)

    let songsNeeded;
    if (this.generation_strategy === "loop") {
      songsNeeded = 1;
    } else if (this.generation_strategy === "extend") {
      // Extend 모드: 초기 1곡 + 연장 횟수
      songsNeeded = Math.ceil(targetDurationSec / avgSongDuration);
    } else {
      // Compilation 모드: 여러 곡 생성 (2곡씩 생성되므로 절반)
      songsNeeded = Math.ceil(targetDurationSec / avgSongDuration / 2);
    }

    $.export("songs_needed", songsNeeded);
    $.export("strategy", this.generation_strategy);

    // =====================
    // 3. 음악 생성
    // =====================
    const generatedSongs = [];
    const failedTasks = [];

    // Helper: 음악 생성 요청
    const createMusic = async (titleSuffix = "", extendClipId = null, extendAt = null) => {
      const requestBody = {
        mv: this.model_version,
        make_instrumental: true,
        custom_mode: true,
        title: `${selectedStyle.title_prefix}_${titleSuffix}`,
        tags: selectedStyle.tags,
      };

      // Extend 모드인 경우
      if (extendClipId && extendAt !== null) {
        requestBody.task_type = "extend_music";
        requestBody.continue_clip_id = extendClipId;
        requestBody.continue_at = extendAt;
      }

      const response = await axios($, {
        method: "POST",
        url: `${MUSICAPI_BASE}/sonic/create`,
        headers: {
          "Authorization": `Bearer ${this.musicapi_key}`,
          "Content-Type": "application/json",
        },
        data: requestBody,
      });

      return response.task_id;
    };

    // Helper: 태스크 상태 확인 및 대기
    const waitForTask = async (taskId) => {
      const startTime = Date.now();
      const maxWaitMs = this.max_wait_per_song * 1000;
      const pollInterval = 5000;

      while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await axios($, {
          method: "GET",
          url: `${MUSICAPI_BASE}/sonic/task/${taskId}`,
          headers: {
            "Authorization": `Bearer ${this.musicapi_key}`,
          },
        });

        if (statusResponse.status === "complete" || statusResponse.status === "completed") {
          return statusResponse;
        } else if (statusResponse.status === "failed" || statusResponse.status === "error") {
          throw new Error(`Task failed: ${statusResponse.error || "Unknown error"}`);
        }
      }

      throw new Error(`Task timed out after ${this.max_wait_per_song} seconds`);
    };

    // 생성 전략별 실행
    $.export("status", `Generating music with ${this.generation_strategy} strategy...`);

    if (this.generation_strategy === "loop") {
      // Loop Mode: 1곡만 생성
      try {
        const taskId = await createMusic("001");
        $.export("task_1", taskId);

        const result = await waitForTask(taskId);
        const songs = result.data || result.songs || result.clips || [];

        for (const song of songs) {
          generatedSongs.push({
            id: song.id || song.clip_id,
            title: song.title,
            audio_url: song.audio_url || song.song_url || song.url,
            duration: song.duration,
          });
        }
      } catch (error) {
        failedTasks.push({ index: 0, error: error.message });
      }

    } else if (this.generation_strategy === "extend") {
      // Extend Mode: 초기 곡 생성 후 연장
      try {
        // 초기 곡 생성
        const initialTaskId = await createMusic("001");
        $.export("initial_task", initialTaskId);

        const initialResult = await waitForTask(initialTaskId);
        const initialSongs = initialResult.data || initialResult.songs || initialResult.clips || [];

        if (initialSongs.length === 0) {
          throw new Error("No initial song generated");
        }

        const baseSong = initialSongs[0];
        generatedSongs.push({
          id: baseSong.id || baseSong.clip_id,
          title: baseSong.title,
          audio_url: baseSong.audio_url || baseSong.song_url || baseSong.url,
          duration: baseSong.duration,
          isBase: true,
        });

        // 연장 반복
        let currentClipId = baseSong.id || baseSong.clip_id;
        let currentDuration = baseSong.duration || avgSongDuration;
        let extensionCount = 1;

        while (currentDuration < targetDurationSec && extensionCount < 20) {
          $.export("status", `Extending music (${extensionCount})... Current: ${Math.round(currentDuration / 60)}min`);

          try {
            const extendTaskId = await createMusic(
              `ext_${String(extensionCount).padStart(2, "0")}`,
              currentClipId,
              currentDuration - 10 // 마지막 10초 지점에서 연장
            );

            const extendResult = await waitForTask(extendTaskId);
            const extendedSongs = extendResult.data || extendResult.songs || extendResult.clips || [];

            if (extendedSongs.length > 0) {
              const extendedSong = extendedSongs[0];
              generatedSongs.push({
                id: extendedSong.id || extendedSong.clip_id,
                title: extendedSong.title,
                audio_url: extendedSong.audio_url || extendedSong.song_url || extendedSong.url,
                duration: extendedSong.duration,
                isExtension: true,
                extensionNumber: extensionCount,
              });

              currentClipId = extendedSong.id || extendedSong.clip_id;
              currentDuration += (extendedSong.duration || avgSongDuration) - 10;
            }

            extensionCount++;

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (extendError) {
            failedTasks.push({ index: extensionCount, error: extendError.message });
            break;
          }
        }
      } catch (error) {
        failedTasks.push({ index: 0, error: error.message });
      }

    } else {
      // Compilation Mode: 여러 곡 생성
      for (let i = 0; i < songsNeeded; i++) {
        $.export("status", `Generating batch ${i + 1}/${songsNeeded}...`);

        try {
          const taskId = await createMusic(String(i + 1).padStart(3, "0"));

          const result = await waitForTask(taskId);
          const songs = result.data || result.songs || result.clips || [];

          for (const song of songs) {
            generatedSongs.push({
              id: song.id || song.clip_id,
              title: song.title,
              audio_url: song.audio_url || song.song_url || song.url,
              duration: song.duration,
              batch: i + 1,
            });
          }

          // Rate limit (3초 대기)
          if (i < songsNeeded - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error) {
          failedTasks.push({ index: i, error: error.message });
        }
      }
    }

    $.export("songs_generated", generatedSongs.length);
    $.export("failed_tasks", failedTasks.length);

    // =====================
    // 4. GCS 업로드
    // =====================
    let uploadedFiles = [];
    let folderName = "";

    if (this.google_cloud && this.gcs_bucket_name && generatedSongs.length > 0) {
      $.export("status", "Uploading to Google Cloud Storage...");

      const { google } = await import("googleapis");
      const { Readable } = await import("stream");

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      });

      const storage = google.storage({ version: "v1", auth });

      const now = new Date();
      const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
      const shortUuid = crypto.randomUUID().split("-")[0];
      folderName = `${this.music_category}_${dateStr}_${shortUuid}`;

      for (let i = 0; i < generatedSongs.length; i++) {
        const song = generatedSongs[i];

        try {
          const audioResponse = await axios($, {
            method: "GET",
            url: song.audio_url,
            responseType: "arraybuffer",
          });

          const audioBuffer = Buffer.from(audioResponse);
          const filename = `${String(i + 1).padStart(3, "0")}_${song.title.replace(/[^a-zA-Z0-9_]/g, "_")}.mp3`;
          const objectName = `${folderName}/${filename}`;

          const bufferStream = new Readable();
          bufferStream.push(audioBuffer);
          bufferStream.push(null);

          await storage.objects.insert({
            bucket: this.gcs_bucket_name,
            name: objectName,
            media: {
              mimeType: "audio/mpeg",
              body: bufferStream,
            },
            requestBody: {
              name: objectName,
              contentType: "audio/mpeg",
            },
          });

          const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

          uploadedFiles.push({
            index: i,
            filename,
            original_url: song.audio_url,
            gcs_url: publicUrl,
            duration: song.duration,
          });
        } catch (uploadError) {
          console.error(`Upload failed for ${song.title}:`, uploadError.message);
        }
      }

      // metadata.json 생성
      const totalDuration = generatedSongs.reduce((sum, s) => sum + (s.duration || avgSongDuration), 0);

      const metadata = {
        generated_at: new Date().toISOString(),
        folder: folderName,
        category: this.music_category,
        style_tags: selectedStyle.tags,
        strategy: this.generation_strategy,
        target_duration_minutes: this.target_duration_minutes,
        actual_duration_minutes: Math.round(totalDuration / 60),
        model: this.model_version,
        total_songs: uploadedFiles.length,
        songs: uploadedFiles,
        playback_instructions: this.generation_strategy === "loop"
          ? "Loop the single track for desired duration"
          : this.generation_strategy === "extend"
          ? "Play extended tracks in sequence"
          : "Play all tracks in sequence or shuffle",
      };

      const metadataStream = new Readable();
      metadataStream.push(JSON.stringify(metadata, null, 2));
      metadataStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: `${folderName}/metadata.json`,
        media: {
          mimeType: "application/json",
          body: metadataStream,
        },
      });
    }

    // =====================
    // 5. 결과 반환
    // =====================
    const totalDuration = generatedSongs.reduce((sum, s) => sum + (s.duration || avgSongDuration), 0);

    $.export("$summary", `Generated ${generatedSongs.length} tracks (${Math.round(totalDuration / 60)} minutes) for ${this.music_category}`);

    return {
      success: true,
      category: this.music_category,
      strategy: this.generation_strategy,
      model: this.model_version,
      target_duration_minutes: this.target_duration_minutes,
      actual_duration_minutes: Math.round(totalDuration / 60),
      total_songs: generatedSongs.length,
      failed_tasks: failedTasks,
      songs: generatedSongs,
      gcs_folder: folderName ? `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/` : null,
      uploaded_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      playback_instructions: this.generation_strategy === "loop"
        ? "Loop the single track for 1 hour duration"
        : this.generation_strategy === "extend"
        ? "Play the extended track sequence"
        : "Play all tracks in sequence or use shuffle mode",
    };
  },
});
