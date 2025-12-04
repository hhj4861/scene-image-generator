import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Viral Title V2",
  description: "바이럴 타이틀 생성 V2 - 짧고 강렬한 밈 스타일 + 이모지 푸터",

  props: {
    video_generator_output: { type: "string", label: "Video Generator Output (JSON)", description: "{{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}" },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    main_character_name: { type: "string", label: "Main Character Name", default: "땅콩" },
    custom_footer: { type: "string", label: "Custom Footer (Override)", optional: true },
  },

  async run({ $ }) {
    const videoOutput = typeof this.video_generator_output === "string" ? JSON.parse(this.video_generator_output) : this.video_generator_output;
    const { videos = [], folder_name: folderName, content_type: contentType = "satire", characters = {} } = videoOutput;
    const originalTopic = videoOutput.script_reference?.topic || "";
    const charName = this.main_character_name;

    $.export("input_info", { folder_name: folderName, videos_count: videos.length, original_topic: originalTopic });

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
      `${charName}TV🔥`,
      `${charName}NEWS📺`,
      `${charName}방송🎬`,
      `스타${charName}⭐`,
      `${charName}채널💫`,
      `${charName}월드🌍`,
      `${charName}LIVE📡`,
      `핫${charName}🌶️`,
      `${charName}극장🎭`,
      `${charName}쇼🎪`,
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

3. footer: 이모지 1개 필수! 6자 이내!
   좋은예: "${charName}TV🔥", "${charName}NEWS📺"
   금지: "${charName}이네", 이모지없는것

4. youtube_title: "[태그] 짧은제목 | ${charName}TV"
5. hashtags: ["#${charName}", "#강아지", "#shorts"] 포함 10개

[JSON만 출력]
{"header_korean":"${randomFormula}","header_english":"${charName.toUpperCase()} MOMENT","footer":"${randomFooter}","youtube_title":"[레전드] ${randomFormula} | ${charName}TV","youtube_description":"${charName} 레전드 모먼트! 🐕\\n구독과 좋아요 부탁해요! ❤️\\n#${charName} #강아지","hashtags":["#${charName}","#강아지","#shorts","#puppy","#귀여운강아지"]}`;

      const res = await axios($, {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: {
          contents: [{ parts: [{ text: titlePrompt }] }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 600 }
        },
      });

      const titleText = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      $.export("raw_response", titleText.substring(0, 200));

      const match = titleText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);

        // 검증: header_korean이 너무 길면 랜덤 공식 사용
        const headerKorean = (parsed.header_korean && parsed.header_korean.length <= 12)
          ? parsed.header_korean
          : randomFormula;

        // 검증: footer에 이모지 없으면 랜덤 푸터 사용
        const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(parsed.footer || "");
        const footer = hasEmoji ? parsed.footer : randomFooter;

        generatedContent = {
          header_korean: headerKorean,
          header_english: parsed.header_english || `${charName.toUpperCase()} MOMENT`,
          footer: this.custom_footer || footer,
          youtube_title: parsed.youtube_title || `[레전드] ${headerKorean} | ${charName}TV`,
          youtube_description: parsed.youtube_description || `${charName} 레전드 모먼트! 🐕\n구독과 좋아요 부탁해요! ❤️`,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [`#${charName}`, "#강아지", "#shorts"],
        };
        $.export("ai_generated", true);
        $.export("validation", { header_length: headerKorean.length, footer_has_emoji: hasEmoji });
      }
    } catch (e) {
      $.export("title_error", e.message);
      // 에러 시 랜덤 값 사용 (이미 설정됨)
    }

    $.export("$summary", `Title: "${generatedContent.header_korean}" | Footer: "${generatedContent.footer}"`);

    return {
      ...videoOutput,
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
