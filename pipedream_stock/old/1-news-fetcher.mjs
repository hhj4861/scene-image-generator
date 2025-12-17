import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "US Economic News Fetcher",
  description: "Fetch top 5 US economic/stock market news in real-time",

  props: {
    // News API 선택
    news_source: {
      type: "string",
      label: "News Source",
      description: "Select news API source",
      options: [
        { label: "NewsAPI.org", value: "newsapi" },
        { label: "Alpha Vantage (Market News)", value: "alphavantage" },
        { label: "Finnhub (Market News)", value: "finnhub" },
      ],
      default: "newsapi",
    },

    // NewsAPI.org 설정
    newsapi_key: {
      type: "string",
      label: "NewsAPI.org API Key",
      description: "Get from https://newsapi.org/",
      secret: true,
      optional: true,
    },

    // Alpha Vantage 설정
    alphavantage_key: {
      type: "string",
      label: "Alpha Vantage API Key",
      description: "Get from https://www.alphavantage.co/",
      secret: true,
      optional: true,
    },

    // Finnhub 설정
    finnhub_key: {
      type: "string",
      label: "Finnhub API Key",
      description: "Get from https://finnhub.io/",
      secret: true,
      optional: true,
    },

    // 뉴스 필터링
    news_category: {
      type: "string",
      label: "News Category",
      options: [
        { label: "All Business/Economy", value: "business" },
        { label: "Stock Market", value: "stock" },
        { label: "Crypto", value: "crypto" },
        { label: "Fed/Interest Rates", value: "fed" },
        { label: "Tech Stocks", value: "tech" },
      ],
      default: "business",
    },

    // 언어 설정
    target_language: {
      type: "string",
      label: "Target Language",
      options: [
        { label: "English", value: "en" },
        { label: "Korean (한국어)", value: "ko" },
        { label: "Japanese (日本語)", value: "ja" },
      ],
      default: "en",
    },

    // OpenAI (번역/요약용)
    openai: {
      type: "app",
      app: "openai",
      optional: true,
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
    const categoryKeywords = {
      business: "economy OR business OR market OR stocks OR trading",
      stock: "stock market OR NYSE OR NASDAQ OR S&P 500 OR Dow Jones",
      crypto: "bitcoin OR ethereum OR crypto OR cryptocurrency",
      fed: "Federal Reserve OR interest rate OR inflation OR Jerome Powell",
      tech: "Apple OR Google OR Microsoft OR Amazon OR Tesla OR NVIDIA",
    };

    const keywords = categoryKeywords[this.news_category] || categoryKeywords.business;
    let newsItems = [];

    // =====================
    // 1. 뉴스 가져오기
    // =====================
    $.export("status", `Fetching ${this.news_category} news from ${this.news_source}...`);

    if (this.news_source === "newsapi" && this.newsapi_key) {
      // NewsAPI.org
      const response = await axios($, {
        url: "https://newsapi.org/v2/everything",
        params: {
          q: keywords,
          language: "en",
          sortBy: "publishedAt",
          pageSize: 10,
        },
        headers: {
          "X-Api-Key": this.newsapi_key,
        },
      });

      newsItems = (response.articles || []).slice(0, 5).map((article, idx) => ({
        index: idx + 1,
        title: article.title,
        description: article.description || "",
        content: article.content || article.description || "",
        source: article.source?.name || "Unknown",
        url: article.url,
        published_at: article.publishedAt,
        image_url: article.urlToImage,
      }));

    } else if (this.news_source === "alphavantage" && this.alphavantage_key) {
      // Alpha Vantage Market News
      const topicMap = {
        business: "economy_fiscal,economy_monetary",
        stock: "earnings,ipo",
        crypto: "blockchain",
        fed: "economy_monetary",
        tech: "technology",
      };

      const response = await axios($, {
        url: "https://www.alphavantage.co/query",
        params: {
          function: "NEWS_SENTIMENT",
          topics: topicMap[this.news_category] || "economy_fiscal",
          apikey: this.alphavantage_key,
        },
      });

      newsItems = (response.feed || []).slice(0, 5).map((item, idx) => ({
        index: idx + 1,
        title: item.title,
        description: item.summary || "",
        content: item.summary || "",
        source: item.source || "Unknown",
        url: item.url,
        published_at: item.time_published,
        image_url: item.banner_image,
        sentiment: item.overall_sentiment_label,
        sentiment_score: item.overall_sentiment_score,
      }));

    } else if (this.news_source === "finnhub" && this.finnhub_key) {
      // Finnhub Market News
      const categoryMap = {
        business: "general",
        stock: "general",
        crypto: "crypto",
        fed: "general",
        tech: "general",
      };

      const response = await axios($, {
        url: "https://finnhub.io/api/v1/news",
        params: {
          category: categoryMap[this.news_category] || "general",
          token: this.finnhub_key,
        },
      });

      newsItems = (response || []).slice(0, 5).map((item, idx) => ({
        index: idx + 1,
        title: item.headline,
        description: item.summary || "",
        content: item.summary || "",
        source: item.source || "Unknown",
        url: item.url,
        published_at: new Date(item.datetime * 1000).toISOString(),
        image_url: item.image,
      }));

    } else {
      throw new Error(`News source ${this.news_source} not configured. Please provide API key.`);
    }

    if (newsItems.length === 0) {
      throw new Error("No news items found. Try different category or check API key.");
    }

    $.export("news_count", newsItems.length);

    // =====================
    // 2. 뉴스 번역/요약 (필요시)
    // =====================
    if (this.target_language !== "en" && this.openai) {
      $.export("status", `Translating news to ${this.target_language}...`);

      const langName = this.target_language === "ko" ? "Korean" : "Japanese";

      for (let i = 0; i < newsItems.length; i++) {
        const item = newsItems[i];

        const translatePrompt = `Translate this news headline and summary to ${langName}. Keep it concise and impactful for a news broadcast.

Title: ${item.title}
Description: ${item.description}

Return JSON only:
{
  "title_translated": "Translated title",
  "description_translated": "Translated description (1-2 sentences)"
}`;

        try {
          const aiResponse = await axios($, {
            url: "https://api.openai.com/v1/chat/completions",
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.openai.$auth.api_key}`,
              "Content-Type": "application/json",
            },
            data: {
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "You are a professional news translator. Return valid JSON only." },
                { role: "user", content: translatePrompt },
              ],
              temperature: 0.3,
              max_tokens: 500,
            },
          });

          let content = aiResponse.choices[0].message.content.trim();
          if (content.startsWith("```")) {
            content = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
          }
          const translated = JSON.parse(content);

          newsItems[i].title_original = item.title;
          newsItems[i].title = translated.title_translated;
          newsItems[i].description_original = item.description;
          newsItems[i].description = translated.description_translated;

        } catch (e) {
          $.export(`translate_error_${i}`, e.message);
        }

        // Rate limiting
        if (i < newsItems.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // =====================
    // 3. folder_name 생성
    // =====================
    const { v4: uuidv4 } = await import("uuid");
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toISOString().split('T')[1].substring(0, 5).replace(':', '');
    const shortUuid = uuidv4().split('-')[0];
    const folderName = `${dateStr}_${timeStr}_news_${this.news_category}_${shortUuid}`;

    // =====================
    // 4. 결과 반환
    // =====================
    $.export("$summary", `Fetched ${newsItems.length} ${this.news_category} news items`);

    return {
      success: true,
      folder_name: folderName,
      news_source: this.news_source,
      news_category: this.news_category,
      target_language: this.target_language,
      fetched_at: now.toISOString(),
      news_count: newsItems.length,
      total_duration: newsItems.length * 10, // 각 뉴스 10초
      news: newsItems,
      gcs_bucket: this.gcs_bucket_name,
    };
  },
});
