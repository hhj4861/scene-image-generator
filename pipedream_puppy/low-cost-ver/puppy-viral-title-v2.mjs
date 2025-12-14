import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Viral Title V2",
  description: "바이럴 타이틀 생성 V2 - 짧고 강렬한 밈 스타일 + 이모지 푸터",

  props: {
    script_editor_output: { type: "string", label: "Script Editor Output (JSON)", description: "{{steps.Puppy_Script_Editor.$return_value}}", optional: true },
    script_generator_output: { type: "string", label: "Script Generator Output (JSON)", description: "{{steps.Puppy_Script_Generator.$return_value}}", optional: true },
    video_generator_output: { type: "string", label: "Video Generator Output (JSON)", description: "{{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}", optional: true },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    llm_model: {
      type: "string",
      label: "LLM Model",
      description: "타이틀 생성에 사용할 모델을 선택하세요.",
      options: [
        { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
        { label: "Claude 4.5 Sonnet (Preview)", value: "claude-sonnet-4-5-2025092" },
        { label: "Claude 3.5 Sonnet (Stable)", value: "claude-3-5-sonnet-20240620" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Custom Model (Direct Input)", value: "custom" },
      ],
      default: "gemini-2.0-flash",
    },
    custom_llm_model: {
      type: "string",
      label: "Custom LLM Model ID",
      description: "'LLM Model'을 'Custom'으로 선택했을 때 사용할 모델 ID를 직접 입력하세요.",
      optional: true,
    },
    anthropic_api_key: {
      type: "string",
      label: "Anthropic API Key",
      description: "Claude 모델 사용 시 필수",
      optional: true,
      secret: true,
    },
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key",
      description: "GPT 모델 사용 시 필수",
      optional: true,
      secret: true,
    },
    main_character_name: { type: "string", label: "Main Character Name", default: "땅콩" },
    custom_footer: { type: "string", label: "Custom Footer (Override)", optional: true },
  },

  async run({ $ }) {
    let scriptData;
    let folderName = "";
    let originalTopic = "";
    let videos = [];
    let scriptSegments = [];

    // 1. Script Editor (우선순위 1)
    if (this.script_editor_output) {
      scriptData = typeof this.script_editor_output === "string" ? JSON.parse(this.script_editor_output) : this.script_editor_output;
      $.export("source", "script_editor");
    }
    // 2. Script Generator (우선순위 2)
    else if (this.script_generator_output) {
      scriptData = typeof this.script_generator_output === "string" ? JSON.parse(this.script_generator_output) : this.script_generator_output;
      $.export("source", "script_generator");
    }
    // 3. Video Generator (Legacy/Fallback)
    else if (this.video_generator_output) {
      scriptData = typeof this.video_generator_output === "string" ? JSON.parse(this.video_generator_output) : this.video_generator_output;
      $.export("source", "video_generator");
    } else {
      throw new Error("입력 소스가 없습니다. Script Editor, Script Generator, 또는 Video Generator 출력을 연결해주세요.");
    }

    // 데이터 추출 (Uniform Extraction)
    if (scriptData.videos) {
      // Input came from Video Generator
      videos = scriptData.videos;
      folderName = scriptData.folder_name;
      originalTopic = scriptData.script_reference?.topic || "";
    } else {
      // Input came from Script Generator/Editor
      folderName = scriptData.folder_name;
      originalTopic = scriptData.topic_info?.topic || "";
      // Handle nested script object or direct segments
      const scriptObj = scriptData.script || scriptData;
      scriptSegments = scriptObj.script_segments || [];
      // Map segments to "videos" structure for compatibility with existing logic
      videos = scriptSegments.map(seg => ({ narration: seg.narration }));
    }

    const charName = this.main_character_name;
    $.export("input_info", { folder_name: folderName, videos_count: videos.length, original_topic: originalTopic, source_type: scriptData.videos ? "video_gen" : "script_gen" });

    // ==========================================
    // Unified LLM Caller
    // ==========================================
    const callLLM = async (prompt, temperature = 1.0) => {
      const model = this.llm_model === "custom" ? this.custom_llm_model : this.llm_model;
      if (!model) throw new Error("Custom model ID is missing.");

      // 1. Gemini
      if (model.startsWith("gemini")) {
        const apiKey = this.gemini_api_key;
        if (!apiKey) throw new Error("Gemini API Key is missing.");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const resp = await axios($, {
          url,
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          data: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: 1024 }
          }
        });
        return resp.candidates[0].content.parts[0].text;
      }

      // 2. Claude
      if (model.startsWith("claude")) {
        if (!this.anthropic_api_key) throw new Error("Anthropic API Key is missing.");
        const resp = await axios($, {
          url: "https://api.anthropic.com/v1/messages",
          method: "POST",
          headers: {
            "x-api-key": this.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          data: {
            model: model,
            max_tokens: 1024,
            temperature: temperature,
            messages: [{ role: "user", content: prompt }]
          }
        });
        return resp.content[0].text;
      }

      // 3. GPT
      if (model.startsWith("gpt")) {
        if (!this.openai_api_key) throw new Error("OpenAI API Key is missing.");
        const resp = await axios($, {
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.openai_api_key}`,
            "Content-Type": "application/json"
          },
          data: {
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: temperature
          }
        });
        return resp.choices[0].message.content;
      }

      throw new Error(`Unsupported model: ${model}`);
    };

    const scriptSummary = videos.filter(v => v.narration).map(v => `${v.narration}`).join(" ").substring(0, 300);

    // ★★★ 바이럴 타이틀 공식 (실제 인기 영상 참고) ★★★
    const viralFormulas = [
      `${charName} 폭주ㅋㅋㅋ`,
      `${charName} 터짐ㅋㅋ`,
      `${charName} 대참사`,
      `${charName}아 왜그래`,
      `레전드 ${charName}`,
      `역대급 ${charName}`,
      `${charName} 실화?!`,
      `${charName} 난리남`,
      `${charName} 개웃김`,
      `${charName} ㄹㅇ미침`,
      `${charName}이 미쳤어`,
      `${charName} 반전주의`,
      `${charName} 클라스`,
      `${charName} 甲`,
      `헐 ${charName}`,
    ];

    const footerExamples = [
      `${charName}TV`,
      `${charName}NEWS`,
      `${charName}방송`,
      `스타${charName}`,
      `${charName}채널`,
      `${charName}월드`,
      `${charName}LIVE`,
      `핫${charName}`,
      `${charName}극장`,
      `${charName}쇼`,
    ];

    // 랜덤 선택
    const randomFormula = viralFormulas[Math.floor(Math.random() * viralFormulas.length)];
    const randomFooter = footerExamples[Math.floor(Math.random() * footerExamples.length)];

    let generatedContent = {
      header_korean: randomFormula,
      header_english: `${charName.toUpperCase()} MOMENT`,
      footer: this.custom_footer || randomFooter,
      youtube_title: `[레전드] ${randomFormula} | ${charName}TV`,
      youtube_description: "",
      hashtags: [],
    };

    try {
      const titlePrompt = `바이럴 제목 생성! 규칙 엄수!

[콘텐츠]
주제: ${originalTopic}
캐릭터: ${charName}
내용: ${scriptSummary}

[필수 규칙]
1. header_korean: 8자 이내! 밈/유행어 스타일!
   좋은예: "${charName} 터짐ㅋㅋ", "${charName} 대참사", "레전드 ${charName}"
   금지: 긴문장, 설명형, "~하는", "~했더니"

2. header_english: 10자 이내! 대문자!
   좋은예: "${charName.toUpperCase()} MOMENT", "EPIC ${charName.toUpperCase()}", "RIP ${charName.toUpperCase()}"

    3. footer: 6자 이내! (이모지 제외)
       좋은예: "${charName}TV", "${charName}NEWS"
       금지: "${charName}이네", 긴 문구

4. youtube_title: "[태그] 짧은제목 | ${charName}TV"
5. hashtags: ["#${charName}", "#강아지", "#shorts"] 포함 10개

[JSON만 출력]
{"header_korean":"${randomFormula}","header_english":"${charName.toUpperCase()} MOMENT","footer":"${randomFooter}","youtube_title":"[레전드] ${randomFormula} | ${charName}TV","youtube_description":"${charName} 레전드 모먼트! 🐕\\n구독과 좋아요 부탁해요! ❤️\\n#${charName} #강아지","hashtags":["#${charName}","#강아지","#shorts","#puppy","#귀여운강아지"]}`;

      $.export("status", `Generating titles using ${this.llm_model}...`);
      let responseText = await callLLM(titlePrompt, 1.0);
      const titleText = responseText.trim();
      $.export("raw_response", titleText.substring(0, 200));

      const match = titleText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);

        // 검증: header_korean이 너무 길면 랜덤 공식 사용
        const headerKorean = (parsed.header_korean && parsed.header_korean.length <= 12)
          ? parsed.header_korean
          : randomFormula;

        // 검증: footer 길이만 체크 (이모지 검증 제거)
        const footer = (parsed.footer && parsed.footer.length <= 8) ? parsed.footer : randomFooter;

        generatedContent = {
          header_korean: headerKorean,
          header_english: parsed.header_english || `${charName.toUpperCase()} MOMENT`,
          footer: this.custom_footer || footer,
          youtube_title: parsed.youtube_title || `[레전드] ${headerKorean} | ${charName}TV`,
          youtube_description: parsed.youtube_description || `${charName} 레전드 모먼트! 🐕\n구독과 좋아요 부탁해요! ❤️`,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [`#${charName}`, "#강아지", "#shorts"],
        };
        $.export("ai_generated", true);
        $.export("validation", { header_length: headerKorean.length });
      }
    } catch (e) {
      $.export("title_error", e.message);
      // 에러 시 랜덤 값 사용 (이미 설정됨)
    }

    $.export("$summary", `Title: "${generatedContent.header_korean}" | Footer: "${generatedContent.footer}"`);

    return {
      ...scriptData,
      generated_titles: {
        header_korean: generatedContent.header_korean,
        header_english: generatedContent.header_english,
        footer: generatedContent.footer,
      },
      youtube_metadata: {
        title: generatedContent.youtube_title,
        description: generatedContent.youtube_description,
        hashtags: generatedContent.hashtags,
        hashtags_string: generatedContent.hashtags.join(" "),
      },
      title_generation_info: {
        main_character: charName,
        ai_generated: true,
        original_topic: originalTopic,
        version: "v2"
      },
    };
  },
});
