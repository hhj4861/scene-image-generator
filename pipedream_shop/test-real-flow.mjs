
import { fetchDouyinVideos } from './test-sourcer.mjs';
import axios from 'axios';

async function runPipeline() {
    console.log("🚀 Starting Shopping Shorts Automation Pipeline...");

    // 1. Source Videos
    const videoUrls = await fetchDouyinVideos();
    if (!videoUrls || videoUrls.length === 0) {
        console.error("❌ No videos found. Aborting.");
        return;
    }

    // 2. Prepare Product Data (Simulated Input from User)
    const productData = {
        name: "✨ 매직 글로우 립스틱",
        name_english: "Magic Glow Lipstick",
        price_info: "오늘만 1+1 💄 19,900원",
        videos: videoUrls.map((url, index) => ({
            url: url,
            index: index,
            duration: 5,
            narration: `이 립스틱 색감 좀 보세요! (장면 ${index + 1})`
        }))
    };

    // 3. Construct Payload for VM
    const payload = {
        videos: productData.videos,
        bgm_url: "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", // Mock Audio for test
        bgm_volume: 0.2,
        title_text: productData.name,
        sub_title_text: productData.name_english,
        cta_text: productData.price_info,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: "shorts-videos-storage-mcp-test-457809",
        output_path: `shop_test_${Date.now()}/final.mp4`,
        folder_name: `shop_test_${Date.now()}`
    };

    console.log("\n📦 Generated Payload for VM:");
    console.log(JSON.stringify(payload, null, 2));

    console.log("\n📡 Sending Request to VM...");
    try {
        // Assuming VM is reachable at localhost:3000 (Port Forwarding required)
        // Or replace with External IP if known
        const VM_URL = "http://localhost:3000";

        console.log(`Target: ${VM_URL}/render/shop`);

        // Uncomment to actually send if VM is reachable
        /*
        const response = await axios.post(`${VM_URL}/render/shop`, payload, {
            timeout: 300000 // 5 min timeout
        });
        console.log("\n✅ Pipeline Success! Video URL:", response.data.url);
        */

        console.log("\n💡 To run this manually against your real VM, use this curl command:\n");
        console.log(`curl -X POST http://YOUR_VM_IP:3000/render/shop \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`);

    } catch (error) {
        console.error("❌ Pipeline Error:", error.message);
    }
}

runPipeline();
