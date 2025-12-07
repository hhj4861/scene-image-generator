import { axios } from "@pipedream/platform";

export default {
    name: "Douyin Video Sourcer",
    description: "Searches for trending Douyin videos by keyword using an external API (e.g., TikHub/RapidAPI).",
    key: "douyin_video_sourcer",
    version: "0.1.0",
    type: "action",
    props: {
        api_key: {
            type: "string",
            label: "API Key",
            description: "API Key for the Douyin Scraper service (e.g., TikHub, RapidAPI)",
            secret: true,
        },
        keyword: {
            type: "string",
            label: "Search Keyword",
            description: "Keyword to search for (e.g., 'cosmetics', 'makeup', 'hot')",
            default: "hot"
        },
        count: {
            type: "integer",
            label: "Video Count",
            description: "Number of videos to fetch",
            default: 5
        }
    },
    async run({ steps, $ }) {
        // Note: This is a sample implementation using a generic API structure.
        // specific URL and params depend on the chosen provider (TikHub, RapidAPI, Apify).
        // Here we assume a TikHub-like structure for demonstration.

        // Example: TikHub V2 Search API
        // const apiUrl = "https://api.tikhub.io/douyin/v1/search/video"; 

        // For now, if no API key is provided, we return mock data for testing.
        if (!this.api_key || this.api_key === "test") {
            console.log("Using Mock Data (No Valid API Key provided)");
            return [
                "https://www.douyin.com/video/7312345678901234567",
                "https://www.douyin.com/video/7312345678901234568",
                "https://www.douyin.com/video/7312345678901234569"
            ];
        }

        try {
            // Real API Call Implementation (Template)
            // Change this URL to your specific provider
            const response = await axios($, {
                method: "GET",
                url: "https://api.example.com/douyin/search",
                headers: {
                    "Authorization": `Bearer ${this.api_key}`
                },
                params: {
                    keyword: this.keyword,
                    count: this.count
                }
            });

            // Extract Video URLs from response
            // This path depends on the specific API response structure
            const videos = response.data.data.map(item => item.video_url || item.play_addr);

            return videos;

        } catch (error) {
            throw new Error(`Failed to fetch Douyin videos: ${error.message}`);
        }
    },
};
