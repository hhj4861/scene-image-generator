import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News Script Generator",
  description: "Generate 10-second scripts and image prompts for each news item",

  props: {
    // OpenAI 연결
    openai: {
      type: "app",
      app: "openai",
    },

    // 입력 데이터
    news_json: {
      type: "string",
      label: "News JSON",
      description: "JSON from News Fetcher. Use: {{JSON.stringify(steps.News_Fetcher.$return_value.news)}}",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "Use: {{steps.News_Fetcher.$return_value.folder_name}}",
    },
    target_language: {
      type: "string",
      label: "Target Language",
      description: "Use: {{steps.News_Fetcher.$return_value.target_language}}",
      default: "en",
    },

    // 스크립트 스타일
    script_style: {
      type: "string",
      label: "Script Style",
      options: [
        { label: "Professional News Anchor", value: "anchor" },
        { label: "Casual/Conversational", value: "casual" },
        { label: "Urgent/Breaking News", value: "urgent" },
        { label: "Analysis/Commentary", value: "analysis" },
      ],
      default: "anchor",
    },

    // 이미지 스타일
    image_style: {
      type: "string",
      label: "Image Style",
      options: [
        { label: "Professional News Graphics", value: "news_graphics" },
        { label: "Stock Photo Style", value: "stock_photo" },
        { label: "Infographic Style", value: "infographic" },
        { label: "Cinematic/Dramatic", value: "cinematic" },
      ],
      default: "news_graphics",
    },

    // 초당 길이
    seconds_per_news: {
      type: "integer",
      label: "Seconds per News",
      default: 10,
    },
  },

  async run({ $ }) {
    const news = typeof this.news_json === 'string' ? JSON.parse(this.news_json) : this.news_json;

    if (!news || news.length === 0) {
      throw new Error("No news items provided");
    }

    $.export("status", `Generating scripts for ${news.length} news items...`);

    const styleGuides = {
      anchor: {
        tone: "Professional, authoritative, clear",
        pace: "Measured, confident",
        example: "In today's top story, [news]. This development signals...",
      },
      casual: {
        tone: "Friendly, conversational, engaging",
        pace: "Natural, approachable",
        example: "Hey, so here's what's happening in the markets today...",
      },
      urgent: {
        tone: "Urgent, impactful, attention-grabbing",
        pace: "Fast, energetic",
        example: "BREAKING: Major developments in [news]. Here's what you need to know...",
      },
      analysis: {
        tone: "Thoughtful, insightful, expert",
        pace: "Deliberate, explanatory",
        example: "Let's break down what this means for investors...",
      },
    };

    const imageStyleGuides = {
      news_graphics: "Professional news broadcast style, clean graphics, stock tickers, charts, corporate backgrounds, blue and white color scheme, HD quality",
      stock_photo: "High-quality stock photography style, business setting, professional lighting, corporate environment, realistic",
      infographic: "Data visualization style, charts and graphs, statistics overlay, clean modern design, informative layout",
      cinematic: "Dramatic cinematic style, movie-like lighting, epic composition, emotional impact, 4K quality",
    };

    const langConfig = {
      en: { name: "English", chars_per_second: 12 },
      ko: { name: "Korean", chars_per_second: 5 },
      ja: { name: "Japanese", chars_per_second: 4 },
    };

    const style = styleGuides[this.script_style];
    const imageStyle = imageStyleGuides[this.image_style];
    const lang = langConfig[this.target_language] || langConfig.en;
    const targetChars = this.seconds_per_news * lang.chars_per_second;

    const scenes = [];
    let currentTime = 0;

    // 인트로 생성
    const introPrompt = `Create a powerful 3-second intro script for a news shorts video about US economy/stock market.

Language: ${lang.name}
Style: ${style.tone}
Max characters: ${3 * lang.chars_per_second}

The intro should:
- Grab attention immediately
- Set the tone for breaking financial news
- Be punchy and memorable

Return JSON only:
{
  "narration": "Intro narration text",
  "image_prompt": "Detailed image prompt for intro visual"
}`;

    const introResponse = await axios($, {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a professional news script writer. Return valid JSON only." },
          { role: "user", content: introPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
    });

    let introContent = introResponse.choices[0].message.content.trim();
    if (introContent.startsWith("```")) {
      introContent = introContent.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    }
    const intro = JSON.parse(introContent);

    scenes.push({
      index: 0,
      type: "intro",
      start: 0,
      end: 3,
      duration: 3,
      narration: intro.narration,
      image_prompt: `${intro.image_prompt}, ${imageStyle}`,
      news_title: "Intro",
    });
    currentTime = 3;

    // 각 뉴스별 스크립트 생성
    for (let i = 0; i < news.length; i++) {
      const item = news[i];
      $.export(`news_${i + 1}_status`, "Generating script...");

      const newsPrompt = `Create a ${this.seconds_per_news}-second news segment script.

NEWS ITEM #${i + 1}:
Title: ${item.title}
Description: ${item.description}
Source: ${item.source}
${item.sentiment ? `Sentiment: ${item.sentiment}` : ''}

REQUIREMENTS:
- Language: ${lang.name}
- Style: ${style.tone}
- Pace: ${style.pace}
- Target length: ~${targetChars} characters (${this.seconds_per_news} seconds)
- ${i === 0 ? "This is the TOP story - make it impactful" : `Story #${i + 1} of ${news.length}`}

SCRIPT STRUCTURE:
1. Hook (2 sec): Attention-grabbing opening
2. Core Info (6 sec): Key facts and implications
3. Transition (2 sec): Connect to next story or wrap up

IMAGE PROMPT REQUIREMENTS:
- Must visually represent the news content
- Professional broadcast quality
- Include relevant symbols (stock charts, buildings, people, etc.)

Return JSON only:
{
  "narration": "Full narration script",
  "hook": "Opening hook line",
  "key_points": ["point1", "point2"],
  "image_prompt": "Detailed image generation prompt",
  "mood": "emotional tone of this segment"
}`;

      try {
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
              { role: "system", content: "You are an expert financial news scriptwriter for viral short-form video content. Create engaging, accurate, and punchy scripts. Return valid JSON only." },
              { role: "user", content: newsPrompt },
            ],
            temperature: 0.7,
            max_tokens: 1000,
          },
        });

        let content = response.choices[0].message.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
        }
        const script = JSON.parse(content);

        scenes.push({
          index: i + 1,
          type: "news",
          news_index: i,
          start: currentTime,
          end: currentTime + this.seconds_per_news,
          duration: this.seconds_per_news,
          narration: script.narration,
          hook: script.hook,
          key_points: script.key_points,
          image_prompt: `${script.image_prompt}, ${imageStyle}`,
          mood: script.mood,
          news_title: item.title,
          news_source: item.source,
          original_url: item.url,
        });

        currentTime += this.seconds_per_news;
        $.export(`news_${i + 1}_status`, "Complete");

      } catch (error) {
        $.export(`news_${i + 1}_error`, error.message);
        // 실패 시 기본 스크립트 사용
        scenes.push({
          index: i + 1,
          type: "news",
          news_index: i,
          start: currentTime,
          end: currentTime + this.seconds_per_news,
          duration: this.seconds_per_news,
          narration: item.title + ". " + item.description,
          image_prompt: `News broadcast graphic about ${item.title}, ${imageStyle}`,
          mood: "neutral",
          news_title: item.title,
          news_source: item.source,
        });
        currentTime += this.seconds_per_news;
      }

      // Rate limiting
      if (i < news.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 아웃로 생성
    const outroPrompt = `Create a 2-second outro script for a news shorts video.

Language: ${lang.name}
Style: ${style.tone}

The outro should:
- Provide a quick wrap-up
- Encourage engagement (like, subscribe, follow)
- Be memorable

Return JSON only:
{
  "narration": "Outro narration text",
  "image_prompt": "Detailed image prompt for outro visual"
}`;

    const outroResponse = await axios($, {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a professional news script writer. Return valid JSON only." },
          { role: "user", content: outroPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
    });

    let outroContent = outroResponse.choices[0].message.content.trim();
    if (outroContent.startsWith("```")) {
      outroContent = outroContent.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    }
    const outro = JSON.parse(outroContent);

    scenes.push({
      index: scenes.length,
      type: "outro",
      start: currentTime,
      end: currentTime + 2,
      duration: 2,
      narration: outro.narration,
      image_prompt: `${outro.image_prompt}, ${imageStyle}`,
      news_title: "Outro",
    });
    currentTime += 2;

    // 전체 스크립트 합치기
    const fullScript = scenes.map(s => s.narration).join(" ");
    const totalDuration = currentTime;

    // 제목 생성
    const titlePrompt = `Create a viral YouTube Shorts title for this news video.

News topics covered:
${news.map((n, i) => `${i + 1}. ${n.title}`).join('\n')}

Language: ${lang.name}

Requirements:
- Under 60 characters
- Include trending hashtags
- Create urgency/curiosity
- Format: "Title text #hashtag1 #hashtag2"

Return JSON only:
{
  "title": "Video title with hashtags",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}`;

    const titleResponse = await axios($, {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a viral content title expert. Return valid JSON only." },
          { role: "user", content: titlePrompt },
        ],
        temperature: 0.8,
        max_tokens: 300,
      },
    });

    let titleContent = titleResponse.choices[0].message.content.trim();
    if (titleContent.startsWith("```")) {
      titleContent = titleContent.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    }
    const titleData = JSON.parse(titleContent);

    $.export("$summary", `Generated ${scenes.length} scenes (${totalDuration}s total)`);

    return {
      success: true,
      folder_name: this.folder_name,
      target_language: this.target_language,
      script_style: this.script_style,
      image_style: this.image_style,
      total_duration: totalDuration,
      scene_count: scenes.length,
      news_count: news.length,
      title: titleData.title,
      hashtags: titleData.hashtags,
      full_script: fullScript,
      scenes: scenes,
    };
  },
});
