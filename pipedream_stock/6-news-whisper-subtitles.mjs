import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News Whisper Subtitles",
  description: "Generate word-level subtitles from narration audio using OpenAI Whisper",

  props: {
    // OpenAI 연결
    openai: {
      type: "app",
      app: "openai",
    },

    // 입력 데이터
    audio_url: {
      type: "string",
      label: "Audio URL",
      description: "Use: {{steps.News_TTS.$return_value.audio_url}}",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "Use: {{steps.News_Script_Generator.$return_value.folder_name}}",
    },
    target_language: {
      type: "string",
      label: "Target Language",
      description: "Use: {{steps.News_Script_Generator.$return_value.target_language}}",
      default: "en",
    },

    // GCS 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
    },

    // 자막 설정
    words_per_subtitle: {
      type: "integer",
      label: "Words per Subtitle",
      description: "Number of words to group per subtitle segment",
      default: 5,
    },
    min_duration: {
      type: "string",
      label: "Minimum Duration (seconds)",
      description: "Minimum duration for each subtitle",
      default: "0.5",
    },
  },

  async run({ $ }) {
    if (!this.audio_url) {
      throw new Error("Audio URL is required");
    }

    $.export("status", "Transcribing audio with Whisper...");

    // 오디오 다운로드
    const audioResponse = await axios($, {
      method: "GET",
      url: this.audio_url,
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(audioResponse);
    $.export("audio_size", `${(audioBuffer.length / 1024).toFixed(1)} KB`);

    // FormData 생성
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    formData.append("file", audioBuffer, {
      filename: "narration.mp3",
      contentType: "audio/mpeg",
    });
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    // 언어 힌트
    const langHints = {
      en: "en",
      ko: "ko",
      ja: "ja",
    };
    formData.append("language", langHints[this.target_language] || "en");

    // Whisper API 호출
    const whisperResponse = await axios($, {
      method: "POST",
      url: "https://api.openai.com/v1/audio/transcriptions",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        ...formData.getHeaders(),
      },
      data: formData,
      maxBodyLength: Infinity,
    });

    $.export("transcription_text", whisperResponse.text?.substring(0, 200) + "...");

    // 단어 레벨 타임스탬프 추출
    const words = whisperResponse.words || [];

    if (words.length === 0) {
      // words가 없으면 segments에서 추출
      const segments = whisperResponse.segments || [];
      const subtitles = segments.map((seg, idx) => ({
        index: idx,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
      }));

      $.export("subtitle_source", "segments");
      $.export("subtitle_count", subtitles.length);

      return {
        success: true,
        folder_name: this.folder_name,
        audio_url: this.audio_url,
        full_text: whisperResponse.text,
        duration: whisperResponse.duration,
        subtitle_count: subtitles.length,
        subtitles: subtitles,
      };
    }

    // 단어를 그룹화하여 자막 생성
    const subtitles = [];
    let currentGroup = [];
    let groupStartTime = null;
    const minDuration = parseFloat(this.min_duration);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (currentGroup.length === 0) {
        groupStartTime = word.start;
      }

      currentGroup.push(word.word);

      // 그룹화 조건: 단어 수 또는 문장 끝
      const isEndOfSentence = /[.!?。！？]$/.test(word.word);
      const reachedWordLimit = currentGroup.length >= this.words_per_subtitle;
      const isLastWord = i === words.length - 1;

      if (isEndOfSentence || reachedWordLimit || isLastWord) {
        const endTime = word.end;
        const duration = endTime - groupStartTime;

        // 최소 지속시간 확인
        const finalEndTime = duration < minDuration
          ? groupStartTime + minDuration
          : endTime;

        subtitles.push({
          index: subtitles.length,
          start: groupStartTime,
          end: finalEndTime,
          text: currentGroup.join(" ").trim(),
        });

        currentGroup = [];
        groupStartTime = null;
      }
    }

    $.export("subtitle_source", "words");
    $.export("subtitle_count", subtitles.length);

    // GCS에 자막 저장
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    // JSON 자막 저장
    const subtitleData = {
      generated_at: new Date().toISOString(),
      audio_url: this.audio_url,
      full_text: whisperResponse.text,
      duration: whisperResponse.duration,
      language: this.target_language,
      subtitle_count: subtitles.length,
      subtitles: subtitles,
    };

    const jsonStream = new Readable();
    jsonStream.push(JSON.stringify(subtitleData, null, 2));
    jsonStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: `${this.folder_name}/subtitles.json`,
      media: {
        mimeType: 'application/json',
        body: jsonStream,
      },
      requestBody: {
        name: `${this.folder_name}/subtitles.json`,
        contentType: 'application/json',
      },
    });

    // SRT 포맷으로도 저장
    const srtContent = subtitles.map((sub, idx) => {
      const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      return `${idx + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
    }).join('\n');

    const srtStream = new Readable();
    srtStream.push(srtContent);
    srtStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: `${this.folder_name}/subtitles.srt`,
      media: {
        mimeType: 'text/plain',
        body: srtStream,
      },
      requestBody: {
        name: `${this.folder_name}/subtitles.srt`,
        contentType: 'text/plain',
      },
    });

    $.export("$summary", `Generated ${subtitles.length} subtitles`);

    return {
      success: true,
      folder_name: this.folder_name,
      audio_url: this.audio_url,
      full_text: whisperResponse.text,
      duration: whisperResponse.duration,
      subtitle_count: subtitles.length,
      subtitles: subtitles,
      srt_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${this.folder_name}/subtitles.srt`,
      json_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${this.folder_name}/subtitles.json`,
    };
  },
});
