/**
 * Claude 3.5 Sonnet API 테스트
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 환경변수가 필요합니다.");
  console.log("실행 방법: ANTHROPIC_API_KEY=your_key node test-claude-api.mjs");
  process.exit(1);
}

const testClaudeAPI = async () => {
  console.log("🧪 Claude 3.5 Sonnet API 테스트 시작...\n");

  const model = "claude-3-5-sonnet-20241022";
  const testPrompt = `You are a helpful assistant. Generate a short 3-sentence script for a cute puppy video about "간식 시간" (snack time).
Return JSON format only:
{"title":"title here","script":"3 sentences here"}`;

  console.log(`📍 모델: ${model}`);
  console.log(`📍 프롬프트: ${testPrompt.substring(0, 50)}...\n`);

  try {
    const startTime = Date.now();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        temperature: 0.7,
        messages: [{ role: "user", content: testPrompt }]
      })
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ API 오류:", errorData);
      return;
    }

    const data = await response.json();

    console.log("✅ API 응답 성공!");
    console.log(`⏱️  응답 시간: ${elapsed}ms`);
    console.log(`📊 사용 토큰: input=${data.usage?.input_tokens}, output=${data.usage?.output_tokens}`);
    console.log(`\n📝 응답 내용:\n${data.content[0].text}`);

    // JSON 파싱 테스트
    try {
      const jsonContent = data.content[0].text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      const parsed = JSON.parse(jsonContent);
      console.log("\n✅ JSON 파싱 성공:", parsed);
    } catch (e) {
      console.log("\n⚠️ JSON 파싱 실패 (텍스트 응답):", e.message);
    }

  } catch (error) {
    console.error("❌ 요청 실패:", error.message);
  }
};

testClaudeAPI();
