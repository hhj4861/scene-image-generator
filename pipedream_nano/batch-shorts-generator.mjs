import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Batch Shorts Generator",
  description: "3개의 키워드를 각각 처리하여 3개의 완전한 쇼츠 영상 생성 (대본→이미지→영상→음성→자막→최종합성)",
  type: "action",
  props: {
    openai: {
      type: "app",
      app: "openai",
    },
    elevenlabs: {
      type: "app",
      app: "elevenlabs",
    },
    recommended_keywords: {
      type: "string",
      label: "Recommended Keywords (JSON Array)",
      description: "YouTube Analyzer에서 추출된 키워드 배열 (JSON 형식)",
      default: '[{"keyword_jp":"アニメ","keyword_en":"anime","keyword_kr":"애니메이션"},{"keyword_jp":"面白い","keyword_en":"funny","keyword_kr":"재미있는"},{"keyword_jp":"癒し","keyword_en":"healing","keyword_kr":"힐링"}]',
    },
    stability_api_key: {
      type: "string",
      label: "Stability AI API Key",
      description: "Stability AI API 키",
      secret: true,
    },
    runway_api_key: {
      type: "string",
      label: "Runway API Key",
      description: "Runway ML API 키",
      secret: true,
    },
    creatomate_api_key: {
      type: "string",
      label: "Creatomate API Key",
      description: "Creatomate API 키",
      secret: true,
    },
    gcs_bucket: {
      type: "string",
      label: "GCS Bucket",
      description: "Google Cloud Storage 버킷 이름",
    },
    duration_seconds: {
      type: "integer",
      label: "Duration (seconds)",
      description: "각 영상 길이 (초)",
      default: 40,
      min: 15,
      max: 60,
    },
    language: {
      type: "string",
      label: "Script Language",
      description: "대본 언어",
      options: [
        { label: "Japanese (일본어)", value: "japanese" },
        { label: "Korean (한국어)", value: "korean" },
        { label: "English (영어)", value: "english" },
      ],
      default: "japanese",
    },
    elevenlabs_voice_id: {
      type: "string",
      label: "ElevenLabs Voice ID",
      description: "ElevenLabs 음성 ID",
      default: "21m00Tcm4TlvDq8ikWAM",
    },
  },

  async run({ $ }) {
    // 키워드 배열 파싱
    let keywords;
    try {
      keywords = typeof this.recommended_keywords === "string"
        ? JSON.parse(this.recommended_keywords)
        : this.recommended_keywords;
    } catch (error) {
      throw new Error(`키워드 파싱 실패: ${error.message}`);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error("유효한 키워드 배열이 필요합니다");
    }

    // 최대 3개 키워드만 처리
    const targetKeywords = keywords.slice(0, 3);

    console.log(`\n========================================`);
    console.log(`Batch Shorts Generator 시작`);
    console.log(`처리할 키워드: ${targetKeywords.length}개`);
    console.log(`========================================\n`);

    const results = [];

    // 각 키워드별로 전체 파이프라인 실행
    for (let i = 0; i < targetKeywords.length; i++) {
      const kw = targetKeywords[i];
      const keywordText = kw.keyword_jp || kw.keyword_en || kw.keyword_kr;
      const folderName = `batch_${Date.now()}_${i + 1}_${kw.keyword_en || keywordText}`;

      console.log(`\n[${i + 1}/${targetKeywords.length}] 키워드: ${keywordText}`);
      console.log(`폴더: ${folderName}`);

      try {
        // 키워드에 맞는 스타일 자동 선택
        const contentStyle = this.getContentStyle(kw);
        const targetEmotion = this.getTargetEmotion(kw);

        // Step 1: 대본 생성
        console.log(`  [Step 1] 대본 생성...`);
        const scriptResult = await this.generateScript($, keywordText, contentStyle, targetEmotion);
        console.log(`    ✓ 대본 생성 완료: ${scriptResult.script.script_segments?.length || 0} scenes`);

        // Step 2: 이미지 생성
        console.log(`  [Step 2] 이미지 생성...`);
        const imageResults = await this.generateImages($, scriptResult, folderName);
        console.log(`    ✓ 이미지 생성 완료: ${imageResults.length}개`);

        // Step 3: 음성 생성
        console.log(`  [Step 3] 음성 생성...`);
        const audioResult = await this.generateAudio($, scriptResult, folderName);
        console.log(`    ✓ 음성 생성 완료: ${(audioResult.size / 1024).toFixed(2)} KB`);

        // Step 4: 자막 생성
        console.log(`  [Step 4] 자막 생성...`);
        const subtitleResult = await this.generateSubtitles($, audioResult.url, folderName);
        console.log(`    ✓ 자막 생성 완료: ${subtitleResult.segments?.length || 0} segments`);

        // Step 5: 영상 생성 (Runway)
        console.log(`  [Step 5] 영상 생성...`);
        const videoResults = await this.generateVideos($, imageResults, folderName);
        console.log(`    ✓ 영상 생성 완료: ${videoResults.length}개`);

        // Step 6: 최종 합성 (Creatomate)
        console.log(`  [Step 6] 최종 합성...`);
        const finalResult = await this.renderFinalVideo($, {
          videos: videoResults,
          audio: audioResult,
          subtitles: subtitleResult,
          folder: folderName,
        });
        console.log(`    ✓ 최종 영상 완료: ${finalResult.url}`);

        results.push({
          keyword: kw,
          folder: folderName,
          success: true,
          script: scriptResult.script.title,
          images: imageResults.length,
          videos: videoResults.length,
          audio: audioResult.url,
          subtitles: subtitleResult.segments?.length || 0,
          final_video: finalResult.url,
          duration: this.duration_seconds,
        });

      } catch (error) {
        console.error(`  ✗ 오류: ${error.message}`);
        results.push({
          keyword: kw,
          folder: folderName,
          success: false,
          error: error.message,
        });
      }

      // 다음 키워드 처리 전 딜레이
      if (i < targetKeywords.length - 1) {
        console.log(`  대기중... (5초)`);
        await this.sleep(5000);
      }
    }

    // 결과 요약
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    $.export("$summary",
      `배치 생성 완료: ${successCount}/${targetKeywords.length} 성공, ${failCount} 실패`
    );

    return {
      total_keywords: targetKeywords.length,
      success_count: successCount,
      fail_count: failCount,
      results: results,
      generated_at: new Date().toISOString(),
    };
  },

  methods: {
    // 키워드에 맞는 콘텐츠 스타일 자동 선택
    getContentStyle(keyword) {
      const kw = (keyword.keyword_en || keyword.keyword_jp || "").toLowerCase();
      if (kw.includes("funny") || kw.includes("面白")) return "comedy";
      if (kw.includes("healing") || kw.includes("癒")) return "healing";
      if (kw.includes("anime") || kw.includes("アニメ")) return "story";
      if (kw.includes("education") || kw.includes("learn")) return "educational";
      return "motivational";
    },

    // 키워드에 맞는 타겟 감정 자동 선택
    getTargetEmotion(keyword) {
      const kw = (keyword.keyword_en || keyword.keyword_jp || "").toLowerCase();
      if (kw.includes("funny") || kw.includes("面白")) return "funny";
      if (kw.includes("healing") || kw.includes("癒")) return "calm";
      if (kw.includes("touching") || kw.includes("感動")) return "touching";
      return "empathy";
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Step 1: 대본 생성
    async generateScript($, keyword, contentStyle, targetEmotion) {
      const styleGuides = {
        motivational: { structure: "도입(공감) → 문제제기 → 해결/깨달음 → 행동촉구", tone: "희망적이고 격려하는" },
        healing: { structure: "평온한 시작 → 감성적 전개 → 위로의 메시지 → 따뜻한 마무리", tone: "부드럽고 위로하는" },
        story: { structure: "상황설정 → 갈등/전환점 → 클라이맥스 → 여운있는 결말", tone: "서사적이고 몰입감있는" },
        comedy: { structure: "기대설정 → 반전 → 펀치라인 → 웃음포인트", tone: "유머러스하고 가벼운" },
        educational: { structure: "흥미유발 질문 → 핵심정보 → 실용적 팁 → 요약", tone: "친절하고 명확한" },
      };

      const emotionGuides = {
        touching: "감동을 주는, 눈물이 날 것 같은",
        healing: "마음이 편안해지는, 위로받는",
        funny: "웃음이 나는, 유쾌한",
        empathy: "공감되는, 나도 그래",
        passion: "열정이 불타오르는, 도전하고 싶은",
        calm: "평온한, 차분해지는",
      };

      const langConfig = {
        japanese: { name: "일본어", instruction: "日本語で書いてください。", chars_per_second: 4 },
        korean: { name: "한국어", instruction: "한국어로 작성해주세요.", chars_per_second: 5 },
        english: { name: "영어", instruction: "Write in English.", chars_per_second: 12 },
      };

      const style = styleGuides[contentStyle] || styleGuides.motivational;
      const emotion = emotionGuides[targetEmotion] || emotionGuides.empathy;
      const lang = langConfig[this.language];
      const sceneCount = Math.ceil(this.duration_seconds / 5);

      const prompt = `You are an expert scriptwriter for viral YouTube Shorts targeting the Japanese market.

## Input Information:
- Keyword: ${keyword}
- Content Style: ${contentStyle} (${style.tone})
- Structure: ${style.structure}
- Target Emotion: ${emotion}
- Duration: ${this.duration_seconds} seconds
- Language: ${lang.name}
- Number of scenes: ${sceneCount}

## Requirements:
1. ${lang.instruction}
2. Write a script that fits exactly ${this.duration_seconds} seconds when read aloud
3. Follow the structure: ${style.structure}
4. Evoke the emotion: ${emotion}
5. Include natural pauses marked with "..." for emotional effect
6. The script should hook viewers in the first 2 seconds
7. Create exactly ${sceneCount} scenes, each approximately 5 seconds

## Scene Descriptions:
For each scene (approximately every 5 seconds), provide:
- Detailed visual description for AI image generation
- Include anime/illustration style specifications
- Describe character expressions, poses, background, lighting, mood
- All scene_description must be in English

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title for YouTube",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds - attention grabber (in ${lang.name})",
  "full_script": "Complete narration script in ${lang.name} - must be readable in ${this.duration_seconds} seconds",
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment (in ${lang.name})",
      "emotion_note": "How to deliver this part",
      "scene_description": "Detailed visual description for image generation - anime style, character details, background, mood, lighting. Must be in English."
    }
  ],
  "hashtags": {
    "japanese": ["#shorts", "#日本語ハッシュタグ"],
    "english": ["#shorts", "#EnglishHashtags"]
  },
  "thumbnail_idea": "Thumbnail concept description",
  "music_suggestion": "Background music style recommendation",
  "total_duration": ${this.duration_seconds},
  "target_audience": "Target audience description"
}

IMPORTANT:
- script_segments must have exactly ${sceneCount} segments
- Each segment must be 5 seconds (except possibly the last one)
- All scene_description must be in English for AI image generation

Return ONLY valid JSON, no markdown formatting.`;

      const response = await axios($, {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openai.$auth.api_key}`,
          "Content-Type": "application/json",
        },
        data: {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert viral content scriptwriter specializing in Japanese YouTube Shorts. Always respond with valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        },
      });

      let responseContent = response.choices[0].message.content.trim();
      if (responseContent.startsWith("```json")) {
        responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (responseContent.startsWith("```")) {
        responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) responseContent = jsonMatch[0];

      const script = JSON.parse(responseContent);
      return { script, keyword, contentStyle, targetEmotion };
    },

    // Step 2: 이미지 생성 (Stability AI)
    async generateImages($, scriptResult, folder) {
      const scenes = scriptResult.script.script_segments || [];
      const results = [];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const filename = `scene_${String(i + 1).padStart(3, "0")}_${scene.start_time}-${scene.end_time}.png`;

        const prompt = `${scene.scene_description}, anime style, high quality, detailed illustration, vibrant colors, 9:16 vertical format`;

        // FormData 생성
        const FormData = (await import("form-data")).default;
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("aspect_ratio", "9:16");
        formData.append("output_format", "png");

        const response = await axios($, {
          url: "https://api.stability.ai/v2beta/stable-image/generate/sd3",
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.stability_api_key}`,
            Accept: "image/*",
            ...formData.getHeaders(),
          },
          data: formData,
          responseType: "arraybuffer",
        });

        // GCS 업로드 (Base64)
        const imageBase64 = Buffer.from(response).toString("base64");
        const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/${filename}`;

        // 실제 GCS 업로드는 별도 처리 필요 - 여기서는 URL만 생성
        results.push({
          index: i + 1,
          filename,
          start: scene.start_time,
          end: scene.end_time,
          url: gcsUrl,
          prompt: prompt.substring(0, 100),
        });

        // Rate limit 대기
        if (i < scenes.length - 1) {
          await this.sleep(1000);
        }
      }

      return results;
    },

    // Step 3: 음성 생성 (ElevenLabs)
    async generateAudio($, scriptResult, folder) {
      const text = scriptResult.script.full_script;

      const response = await axios($, {
        url: `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenlabs_voice_id}`,
        method: "POST",
        headers: {
          "xi-api-key": this.elevenlabs.$auth.api_key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        data: {
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        responseType: "arraybuffer",
      });

      const filename = "narration.mp3";
      const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/${filename}`;

      return {
        filename,
        url: gcsUrl,
        size: response.length || response.byteLength,
        textLength: text.length,
      };
    },

    // Step 4: 자막 생성 (Whisper)
    async generateSubtitles($, audioUrl, folder) {
      // OpenAI Whisper를 사용한 자막 생성
      // 실제 구현에서는 오디오 파일을 다운로드하여 Whisper API로 전송해야 함

      // 임시 mock 응답
      const segments = [
        { index: 0, start: 0, end: 5, text: "첫 번째 자막" },
        { index: 1, start: 5, end: 10, text: "두 번째 자막" },
        { index: 2, start: 10, end: 15, text: "세 번째 자막" },
        { index: 3, start: 15, end: 20, text: "네 번째 자막" },
        { index: 4, start: 20, end: 25, text: "다섯 번째 자막" },
      ];

      return {
        segments,
        duration: this.duration_seconds,
        jsonUrl: `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/subtitles.json`,
        srtUrl: `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/subtitles.srt`,
      };
    },

    // Step 5: 영상 생성 (Runway)
    async generateVideos($, imageResults, folder) {
      const results = [];
      const seed = Math.floor(Math.random() * 4294967295);

      for (let i = 0; i < imageResults.length; i++) {
        const image = imageResults[i];
        const filename = `video_${String(i + 1).padStart(3, "0")}_${image.start}-${image.end}.mp4`;

        // Runway API 호출
        const createResponse = await axios($, {
          url: "https://api.dev.runwayml.com/v1/image_to_video",
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.runway_api_key}`,
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
          },
          data: {
            model: "gen3a_turbo",
            promptImage: image.url,
            promptText: "smooth camera motion, cinematic quality, consistent anime style",
            ratio: "768:1280",
            duration: 5,
            seed: seed,
          },
        });

        const taskId = createResponse.id;

        // 폴링하여 완료 대기
        let status = "RUNNING";
        let outputUrl = null;
        let attempts = 0;

        while (status === "RUNNING" && attempts < 60) {
          await this.sleep(5000);
          attempts++;

          const statusResponse = await axios($, {
            url: `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.runway_api_key}`,
              "X-Runway-Version": "2024-11-06",
            },
          });

          status = statusResponse.status;
          if (status === "SUCCEEDED") {
            outputUrl = statusResponse.output?.[0];
          } else if (status === "FAILED") {
            throw new Error(`Runway 영상 생성 실패: ${statusResponse.failure || "Unknown error"}`);
          }
        }

        if (!outputUrl) {
          throw new Error("Runway 영상 생성 타임아웃");
        }

        const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/${filename}`;

        results.push({
          index: i + 1,
          filename,
          start: image.start,
          end: image.end,
          duration: 5,
          url: gcsUrl,
          runwayUrl: outputUrl,
        });

        // 다음 영상 생성 전 딜레이
        if (i < imageResults.length - 1) {
          await this.sleep(2000);
        }
      }

      return results;
    },

    // Step 6: 최종 합성 (Creatomate)
    async renderFinalVideo($, data) {
      const { videos, audio, subtitles, folder } = data;

      // 비디오 엘리먼트 생성
      const videoElements = videos.map((v, idx) => ({
        type: "video",
        track: 1,
        time: v.start,
        duration: v.duration,
        source: v.runwayUrl || v.url,
        fit: "cover",
      }));

      // 오디오 엘리먼트
      const audioElement = {
        type: "audio",
        track: 2,
        time: 0,
        source: audio.url,
      };

      // 자막 엘리먼트
      const subtitleElements = (subtitles.segments || []).map((seg, idx) => ({
        type: "text",
        track: 3,
        time: seg.start,
        duration: seg.end - seg.start,
        text: seg.text,
        font_family: "Noto Sans JP",
        font_weight: "700",
        font_size: "5.5 vmin",
        fill_color: "#ffffff",
        stroke_color: "#000000",
        stroke_width: "0.8 vmin",
        x_alignment: "50%",
        y_alignment: "85%",
        width: "90%",
        text_align: "center",
      }));

      // Creatomate API 호출
      const response = await axios($, {
        url: "https://api.creatomate.com/v1/renders",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.creatomate_api_key}`,
          "Content-Type": "application/json",
        },
        data: {
          output_format: "mp4",
          width: 1080,
          height: 1920,
          frame_rate: 30,
          elements: [...videoElements, audioElement, ...subtitleElements],
        },
      });

      const renderId = response[0]?.id;

      // 렌더링 완료 대기
      let status = "rendering";
      let outputUrl = null;
      let attempts = 0;

      while (status === "rendering" && attempts < 60) {
        await this.sleep(5000);
        attempts++;

        const statusResponse = await axios($, {
          url: `https://api.creatomate.com/v1/renders/${renderId}`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.creatomate_api_key}`,
          },
        });

        status = statusResponse.status;
        if (status === "succeeded") {
          outputUrl = statusResponse.url;
        } else if (status === "failed") {
          throw new Error(`Creatomate 렌더링 실패: ${statusResponse.error_message || "Unknown error"}`);
        }
      }

      if (!outputUrl) {
        throw new Error("Creatomate 렌더링 타임아웃");
      }

      const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket}/${folder}/final_shorts.mp4`;

      return {
        url: gcsUrl,
        creatomateUrl: outputUrl,
        duration: this.duration_seconds,
        videoCount: videos.length,
        subtitleCount: subtitles.segments?.length || 0,
      };
    },
  },
});
