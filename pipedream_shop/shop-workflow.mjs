import { axios } from "@pipedream/platform";

export default {
    name: "Generate Shopping Shorts",
    description: "Sends product clips to the FFmpeg VM to generate a localized shopping short.",
    key: "shopping_shorts_generator",
    version: "0.1.0",
    type: "action",
    props: {
        ffmpeg_vm_url: {
            type: "string",
            label: "FFmpeg VM URL",
            description: "External IP of the VM (e.g., http://34.64.x.x:3000)",
            default: "http://34.64.168.173:3000"
        },
        product_name: {
            type: "string",
            label: "Product Name",
            description: "Main title displayed at the top"
        },
        product_name_english: {
            type: "string",
            label: "Product Name (English)",
            description: "Sub-title displayed below the main title",
            optional: true
        },
        price_info: {
            type: "string",
            label: "Price & CTA",
            description: "Text displayed at the bottom (e.g., 50% OFF | $10)"
        },
        video_clips: {
            type: "string[]",
            label: "Video Clip URLs",
            description: "List of public URLs for product video clips"
        },
        descriptions: {
            type: "string[]",
            label: "Clip Descriptions",
            description: "Text to be displayed as subtitles for each clip (order must match video_clips)"
        },
        bgm_url: {
            type: "string",
            label: "BGM URL",
            description: "Public URL for background music (optional)",
            optional: true
        }
    },
    async run({ steps, $ }) {
        // 1. Construct Video Objects
        const videos = this.video_clips.map((url, index) => {
            return {
                url: url,
                index: index,
                duration: 5, // Default duration, VM will auto-detect actual duration
                narration: this.descriptions[index] || "", // Subtitle text
                transcription: "" // Optional English subtitle
            };
        });

        // 2. Construct Payload
        const payload = {
            videos: videos,
            bgm_url: this.bgm_url || null,
            bgm_volume: 0.3,
            title_text: this.product_name,
            sub_title_text: this.product_name_english,
            cta_text: this.price_info,
            subtitle_enabled: true,
            subtitle_english_enabled: !!this.product_name_english,
            width: 1080,
            height: 1920,
            output_bucket: "shorts-videos-storage-mcp-test-457809", // 하드코딩된 버킷
            output_path: `shop_${Date.now()}/final.mp4`,
            folder_name: `shop_${Date.now()}`
        };

        console.log("Sending Payload:", JSON.stringify(payload, null, 2));

        // 3. Call VM API
        try {
            const response = await axios($, {
                method: "POST",
                url: `${this.ffmpeg_vm_url}/render/shop`,
                headers: {
                    "Content-Type": "application/json"
                },
                data: payload,
                timeout: 300000 // 5분 타임아웃
            });

            return response;
        } catch (error) {
            throw new Error(`Rendering failed: ${error.response?.data?.error || error.message}`);
        }
    },
};
