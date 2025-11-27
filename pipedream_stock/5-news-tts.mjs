import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News TTS Generator",
  description: "Generate professional news narration audio using ElevenLabs",

  props: {
    // ElevenLabs API
    elevenlabs_api_key: {
      type: "string",
      label: "ElevenLabs API Key",
      description: "Get from https://elevenlabs.io/",
      secret: true,
    },

    // 입력 데이터
    full_script: {
      type: "string",
      label: "Full Script",
      description: "Use: {{steps.News_Script_Generator.$return_value.full_script}}",
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

    // 음성 설정
    voice_style: {
      type: "string",
      label: "Voice Style",
      options: [
        { label: "News Anchor (Male)", value: "news_male" },
        { label: "News Anchor (Female)", value: "news_female" },
        { label: "Urgent Reporter", value: "urgent" },
        { label: "Calm Analyst", value: "analyst" },
      ],
      default: "news_male",
    },
    speaking_rate: {
      type: "string",
      label: "Speaking Rate",
      options: [
        { label: "Slow (0.8x)", value: "0.8" },
        { label: "Normal (1.0x)", value: "1.0" },
        { label: "Fast (1.2x)", value: "1.2" },
        { label: "Very Fast (1.4x)", value: "1.4" },
      ],
      default: "1.0",
    },
  },

  async run({ $ }) {
    if (!this.full_script || this.full_script.trim() === '') {
      throw new Error("No script provided");
    }

    $.export("status", "Generating narration audio...");

    // 언어별 음성 ID 매핑
    const voiceMap = {
      en: {
        news_male: "pNInz6obpgDQGcFmaJgB", // Adam
        news_female: "21m00Tcm4TlvDq8ikWAM", // Rachel
        urgent: "VR6AewLTigWG4xSOukaG", // Arnold
        analyst: "TxGEqnHWrfWFTfGW9XjX", // Josh
      },
      ko: {
        news_male: "pNInz6obpgDQGcFmaJgB", // 한국어는 multilingual 모델 사용
        news_female: "21m00Tcm4TlvDq8ikWAM",
        urgent: "VR6AewLTigWG4xSOukaG",
        analyst: "TxGEqnHWrfWFTfGW9XjX",
      },
      ja: {
        news_male: "pNInz6obpgDQGcFmaJgB",
        news_female: "21m00Tcm4TlvDq8ikWAM",
        urgent: "VR6AewLTigWG4xSOukaG",
        analyst: "TxGEqnHWrfWFTfGW9XjX",
      },
    };

    const langVoices = voiceMap[this.target_language] || voiceMap.en;
    const voiceId = langVoices[this.voice_style] || langVoices.news_male;

    // 모델 선택 (영어 외에는 multilingual 모델 사용)
    const modelId = this.target_language === "en"
      ? "eleven_turbo_v2"
      : "eleven_multilingual_v2";

    $.export("voice_id", voiceId);
    $.export("model_id", modelId);

    // ElevenLabs TTS API 호출
    const ttsResponse = await axios($, {
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      headers: {
        "xi-api-key": this.elevenlabs_api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      data: {
        text: this.full_script,
        model_id: modelId,
        voice_settings: {
          stability: 0.75, // 뉴스 앵커는 안정적이어야 함
          similarity_boost: 0.85,
          style: 0.3, // 약간의 스타일 변화
          use_speaker_boost: true,
        },
      },
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(ttsResponse);
    $.export("audio_size", `${(audioBuffer.length / 1024).toFixed(1)} KB`);

    // GCS에 업로드
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    const filename = "narration.mp3";
    const objectName = `${this.folder_name}/${filename}`;

    const bufferStream = new Readable();
    bufferStream.push(audioBuffer);
    bufferStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: {
        mimeType: 'audio/mpeg',
        body: bufferStream,
      },
      requestBody: {
        name: objectName,
        contentType: 'audio/mpeg',
      },
    });

    const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Generated narration audio: ${filename}`);

    return {
      success: true,
      folder_name: this.folder_name,
      audio_url: publicUrl,
      audio_filename: filename,
      voice_style: this.voice_style,
      voice_id: voiceId,
      model_id: modelId,
      target_language: this.target_language,
      script_length: this.full_script.length,
      audio_size_kb: (audioBuffer.length / 1024).toFixed(1),
    };
  },
});
