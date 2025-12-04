import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Viral Title",
  description: "Veo3 영상 생성 후 바이럴 타이틀/해시태그/유튜브 메타데이터 AI 생성",

  props: {
    video_generator_output: { type: "string", label: "Video Generator Output (JSON)", description: "{{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}" },
    gemini_api_key: { type: "string", label: "Gemini API Key", secret: true },
    main_character_name: { type: "string", label: "Main Character Name", default: "땅콩" },
    channel_name_suffix: { type: "string", label: "Channel Name Suffix", default: "이네", optional: true },
    custom_footer: { type: "string", label: "Custom Footer (Override)", optional: true },
    title_style: {
      type: "string", label: "Title Style", default: "viral",
      options: [
        { label: "바이럴 (재미있고 임팩트)", value: "viral" },
        { label: "뉴스 (진지한 풍자)", value: "news" },
        { label: "귀여움 (힐링/일상)", value: "cute" },
        { label: "드라마틱 (감동/스토리)", value: "dramatic" },
      ],
    },
  },

  async run({ $ }) {
    const videoOutput = typeof this.video_generator_output === "string" ? JSON.parse(this.video_generator_output) : this.video_generator_output;
    const { videos = [], folder_name: folderName, content_type: contentType = "satire", script_format: scriptFormat = "interview", characters = {} } = videoOutput;
    const originalTopic = videoOutput.script_reference?.topic || "";
    const originalTitle = videoOutput.script_reference?.title?.korean || "";
    const originalTitleEnglish = videoOutput.script_reference?.title?.english || "";

    $.export("input_info", { folder_name: folderName, videos_count: videos.length, content_type: contentType, original_topic: originalTopic });

    const scriptSummary = videos.filter(v => v.narration).map(v => `[씬${v.index}] ${v.character_name || v.speaker || "캐릭터"}: ${v.narration}`).join("\n");
    const characterNames = Object.values(characters).filter(c => c.role !== "interviewer").map(c => c.name).join(", ");
    const charName = this.main_character_name;
    const suffix = this.channel_name_suffix || "이네";

    const stylePrompts = {
      viral: { korean: `15자 이내, 임팩트 있고 재미있는 제목 (이모지/인터넷용어 가능)`, english: `20자 이내, 간결하고 재미있는 영어`, footer: `${charName}뉴스, ${charName}TV 등` },
      news: { korean: `15자 이내, 뉴스 헤드라인 스타일 (진지한 풍자)`, english: `20자 이내, news headline style`, footer: `${charName}뉴스, ${charName}속보` },
      cute: { korean: `15자 이내, 귀엽고 힐링되는 제목 (하트/별 이모지)`, english: `20자 이내, cute and heartwarming`, footer: `${charName}${suffix}, ${charName}TV` },
      dramatic: { korean: `15자 이내, 드라마틱하고 감동적`, english: `20자 이내, dramatic storytelling`, footer: `${charName}스토리, ${charName}드라마` },
    };
    const style = stylePrompts[this.title_style] || stylePrompts.viral;

    let generatedContent = {
      header_korean: originalTitle || originalTopic || `${charName}의 이야기`,
      header_english: originalTitleEnglish || "Puppy Story",
      footer: this.custom_footer || `${charName}${suffix}`,
      youtube_title: "",
      youtube_description: "",
      hashtags: [],
      hashtags_string: "",
    };

    try {
      const titlePrompt = `유튜브 쇼츠/틱톡 바이럴 전문가로서 강아지 콘텐츠의 타이틀과 메타데이터를 만들어주세요.

## 콘텐츠 정보
- 주제: ${originalTopic} | 타입: ${contentType} | 형식: ${scriptFormat}
- 캐릭터: ${characterNames || charName} | 주인공: ${charName}

## 대본 요약
${scriptSummary.substring(0, 1500)}

## 생성 요청 (스타일: ${this.title_style.toUpperCase()})
1. header_korean: 영상 내 상단 제목 (한글 15자 이내, ${style.korean}) - ⚠️ 필수!
2. header_english: 영상 내 상단 제목 (영어 20자 이내) - ⚠️ 필수! 반드시 의미 있는 영어 제목 작성!
3. footer: 하단 채널명 (8자 이내, "${charName}" 포함 필수)
4. youtube_title: 유튜브 업로드용 제목 (한글, 50자 이내, 검색 최적화)
5. youtube_description: 유튜브 설명 (한글, 3-5줄, 이모지 포함, 구독/좋아요 유도)
6. hashtags: 해시태그 배열 (10-15개, 한글+영어 혼합, #포함)

⚠️ IMPORTANT: header_english는 반드시 header_korean의 영어 번역이나 의미 있는 영어 제목이어야 합니다. 절대 비워두지 마세요!

## 출력 (JSON만, 다른 텍스트 없이)
{"header_korean":"","header_english":"","footer":"","youtube_title":"","youtube_description":"","hashtags":["#강아지","#puppy"]}`;

      const res = await axios($, {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
        data: { contents: [{ parts: [{ text: titlePrompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 1000 } },
      });

      const titleText = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const match = titleText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // ★★★ 영어 제목 폴백: AI 생성 > 원본 영어 제목 > 한글 제목의 음차 ★★★
        const headerEnglish = parsed.header_english
          || originalTitleEnglish
          || generatedContent.header_english
          || `${charName}'s Story`;

        generatedContent = {
          header_korean: parsed.header_korean || generatedContent.header_korean,
          header_english: headerEnglish,
          footer: this.custom_footer || parsed.footer || generatedContent.footer,
          youtube_title: parsed.youtube_title || `${parsed.header_korean || generatedContent.header_korean} | ${charName}${suffix}`,
          youtube_description: parsed.youtube_description || "",
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
          hashtags_string: Array.isArray(parsed.hashtags) ? parsed.hashtags.join(" ") : "",
        };
        $.export("ai_generated", true);
      }
    } catch (e) {
      $.export("title_error", e.message);
    }

    $.export("$summary", `Titles: "${generatedContent.header_korean}" | Tags: ${generatedContent.hashtags.length}`);

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
        hashtags_string: generatedContent.hashtags_string,
      },
      title_generation_info: { style: this.title_style, main_character: charName, ai_generated: true, original_topic: originalTopic },
    };
  },
});
