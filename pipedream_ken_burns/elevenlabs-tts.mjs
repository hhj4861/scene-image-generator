import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy ElevenLabs TTS",
  description: "씬별 TTS 생성 - speaker별 다른 음성 적용",

  props: {
    // Script Generator 출력
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
    },

    // ElevenLabs 설정
    elevenlabs_api_key: {
      type: "string",
      label: "ElevenLabs API Key",
      secret: true,
    },

    // 음성 설정 (speaker별)
    voice_main: {
      type: "string",
      label: "Main Character Voice ID",
      description: "강아지 주인공 음성 (어린 여자아이)",
      default: "EXAVITQu4vr4xnSDxMaL", // Bella (young female)
    },
    voice_interviewer: {
      type: "string",
      label: "Interviewer Voice ID",
      description: "인터뷰어 음성 (여성 앵커)",
      default: "21m00Tcm4TlvDq8ikWAM", // Rachel (professional female)
    },
    voice_sub_animal: {
      type: "string",
      label: "Sub Character Voice ID (Animal)",
      description: "동물 조연 음성 (귀여운 음성)",
      default: "EXAVITQu4vr4xnSDxMaL", // Bella (young female) - 강아지와 비슷
    },
    voice_sub_human_female: {
      type: "string",
      label: "Sub Character Voice ID (Human Female)",
      description: "사람 조연 음성 (여성/할머니)",
      default: "AZnzlk1XvdvUeBnXmlld", // Domi (warm female)
    },
    voice_sub_human_male: {
      type: "string",
      label: "Sub Character Voice ID (Human Male)",
      description: "사람 조연 음성 (남성/할아버지)",
      default: "VR6AewLTigWG4xSOukaG", // Arnold (mature male)
    },

    model_id: {
      type: "string",
      label: "Model ID",
      default: "eleven_multilingual_v2",
      options: [
        { label: "Multilingual v2 (한글 지원, 고품질)", value: "eleven_multilingual_v2" },
        { label: "Turbo v2.5 (빠름, 영어)", value: "eleven_turbo_v2_5" },
      ],
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
  },

  async run({ $ }) {
    // =====================
    // 1. 입력 파싱
    // =====================
    const scriptData = typeof this.script_generator_output === "string"
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    const script = scriptData.script || {};
    const segments = script.script_segments || [];
    const folderName = scriptData.folder_name || `tts_${Date.now()}`;

    // ★★★ 캐릭터 정보 추출 ★★★
    const characters = scriptData.characters || {};

    // ★★★ 캐릭터 타입에 따른 음성 선택 함수 ★★★
    const getVoiceForSpeaker = (speaker) => {
      if (speaker === "main") return this.voice_main;
      if (speaker === "interviewer") return this.voice_interviewer;

      // 조연 캐릭터 (sub1, sub2, sub3)
      const character = characters[speaker] || {};
      const characterType = character.character_type || "human";
      const gender = character.gender || "female";

      if (characterType === "animal") {
        // 동물 조연: 귀여운 음성
        return this.voice_sub_animal;
      } else {
        // 사람 조연: 성별에 따라 다른 음성
        return gender === "male" ? this.voice_sub_human_male : this.voice_sub_human_female;
      }
    };

    // ★★★ 캐릭터 타입에 따른 음성 설정 ★★★
    const getVoiceSettingsForSpeaker = (speaker) => {
      if (speaker === "main") {
        return { stability: 0.4, similarity_boost: 0.8, style: 0.5 }; // 귀엽고 변화있는 음성
      }
      if (speaker === "interviewer") {
        return { stability: 0.7, similarity_boost: 0.75, style: 0.3 }; // 안정적이고 전문적인 음성
      }

      // 조연 캐릭터
      const character = characters[speaker] || {};
      const characterType = character.character_type || "human";

      if (characterType === "animal") {
        // 동물 조연: 귀여운 음성 (주인공과 비슷)
        return { stability: 0.4, similarity_boost: 0.8, style: 0.5 };
      } else {
        // 사람 조연: 자연스러운 음성
        return { stability: 0.6, similarity_boost: 0.75, style: 0.3 };
      }
    };

    // 디버깅용: 캐릭터 정보 출력
    $.export("characters_info", Object.entries(characters).map(([key, char]) => ({
      speaker: key,
      name: char.name,
      type: char.character_type,
      gender: char.gender,
      voice: getVoiceForSpeaker(key),
    })));

    $.export("input_info", {
      total_segments: segments.length,
      folder_name: folderName,
    });

    // =====================
    // 2. GCS 준비
    // =====================
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

    // =====================
    // 3. 씬별 TTS 생성
    // =====================
    const generateTTS = async (text, speaker, index, isPerformanceBreak = false) => {
      if (!text || text.trim() === "") {
        return null;
      }

      // ★★★ 캐릭터 타입에 따른 동적 음성 선택 ★★★
      const voiceId = getVoiceForSpeaker(speaker);
      const settings = getVoiceSettingsForSpeaker(speaker);

      try {
        const response = await axios($, {
          method: "POST",
          url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          headers: {
            "xi-api-key": this.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
          },
          data: {
            text: text,
            model_id: this.model_id,
            voice_settings: {
              stability: settings.stability,
              similarity_boost: settings.similarity_boost,
              style: settings.style || 0,
              use_speaker_boost: true,
            },
          },
          responseType: "arraybuffer",
          timeout: 60000,
        });

        const audioBuffer = Buffer.from(response);
        const filename = `tts_${String(index).padStart(3, "0")}.mp3`;
        const objectName = `${folderName}/${filename}`;

        // GCS 업로드
        const bufferStream = new Readable({ read() {} });
        bufferStream.push(audioBuffer);
        bufferStream.push(null);

        await storage.objects.insert({
          bucket: this.gcs_bucket_name,
          name: objectName,
          media: { mimeType: "audio/mpeg", body: bufferStream },
          requestBody: { name: objectName, contentType: "audio/mpeg" },
        });

        return {
          success: true,
          index,
          filename,
          url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`,
          text: text.substring(0, 50),
          speaker,
          duration_estimate: Math.ceil(text.length / 5), // 대략적인 길이 추정 (초)
        };
      } catch (e) {
        $.export(`tts_error_${index}`, e.message);
        return {
          success: false,
          index,
          error: e.message,
          text: text.substring(0, 50),
          speaker,
        };
      }
    };

    // =====================
    // 4. 모든 씬에 대해 TTS 생성
    // =====================
    $.export("status", `Generating TTS for ${segments.length} segments...`);

    const ttsPromises = segments.map(async (seg, idx) => {
      const speaker = seg.speaker || "main";
      const isInterviewQuestion = seg.scene_type === "interview_question" || speaker === "interviewer";
      const isPerformanceBreak = seg.scene_type === "performance_break";
      const isPerformanceActive = seg.scene_type === "performance_start" || seg.scene_type === "performance_resume";

      // TTS가 필요한 경우만 생성
      // - 대사가 있고
      // - 퍼포먼스 시작/재개가 아닌 경우 (BGM에 맞춰 립싱크만)
      const shouldGenerateTTS = seg.has_narration && !isPerformanceActive && seg.narration?.trim();

      if (!shouldGenerateTTS) {
        return {
          success: true,
          index: idx + 1,
          skipped: true,
          reason: isPerformanceActive ? "performance_bgm_sync" : "no_narration",
          scene_type: seg.scene_type,
        };
      }

      // 딜레이 추가 (API 레이트 리밋 방지)
      await new Promise(r => setTimeout(r, idx * 500));

      return generateTTS(seg.narration, speaker, idx + 1, isPerformanceBreak);
    });

    const results = await Promise.all(ttsPromises);
    const successResults = results.filter(r => r?.success && !r.skipped);
    const skippedResults = results.filter(r => r?.skipped);
    const failedResults = results.filter(r => r && !r.success && !r.skipped);

    $.export("generated", successResults.length);
    $.export("skipped", skippedResults.length);
    if (failedResults.length > 0) {
      $.export("failed", failedResults.map(f => ({ index: f.index, error: f.error })));
    }

    // =====================
    // 5. 결과 반환
    // =====================
    $.export("$summary", `Generated ${successResults.length} TTS audio files (${skippedResults.length} skipped)`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      total_generated: successResults.length,
      total_skipped: skippedResults.length,
      total_failed: failedResults.length,

      // 씬별 TTS 정보 (Creatomate에서 사용)
      tts_files: results.filter(r => r && !r.skipped).map(r => ({
        index: r.index,
        success: r.success,
        url: r.url || null,
        speaker: r.speaker,
        text: r.text,
        duration_estimate: r.duration_estimate,
        error: r.error || null,
      })),

      // 스킵된 씬 정보
      skipped_scenes: skippedResults.map(r => ({
        index: r.index,
        reason: r.reason,
        scene_type: r.scene_type,
      })),

      // 음성 설정 정보
      voice_config: {
        main: this.voice_main,
        interviewer: this.voice_interviewer,
        sub_animal: this.voice_sub_animal,
        sub_human_female: this.voice_sub_human_female,
        sub_human_male: this.voice_sub_human_male,
        model: this.model_id,
      },
    };
  },
});
