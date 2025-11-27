// Test Imagen models availability via Gemini API
// Usage: GEMINI_API_KEY=your_key node test-imagen-models.js

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY 환경변수를 설정해주세요");
  console.error("Usage: GEMINI_API_KEY=your_key node test-imagen-models.js");
  process.exit(1);
}

async function listModels() {
  console.log("📋 Listing available models...\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
  );

  const data = await response.json();

  if (data.error) {
    console.error("❌ Error:", data.error.message);
    return;
  }

  // Filter imagen models
  const imagenModels = data.models?.filter(m =>
    m.name.toLowerCase().includes('imagen')
  ) || [];

  console.log("🖼️  Imagen Models Found:");
  console.log("=" .repeat(60));

  if (imagenModels.length === 0) {
    console.log("No Imagen models found in ListModels response");
    console.log("\n📝 Note: Imagen models might not appear in ListModels");
    console.log("   but can still be accessed directly.");
  } else {
    imagenModels.forEach(model => {
      console.log(`\n📌 ${model.name}`);
      console.log(`   Display: ${model.displayName}`);
      console.log(`   Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
    });
  }

  return data.models;
}

async function testImagenModel(modelName) {
  console.log(`\n🧪 Testing ${modelName}...`);

  // Method 1: REST API with predict endpoint
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instances: [{ prompt: "A cute cat" }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "1:1",
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.log(`   ❌ predict endpoint: ${data.error.message}`);
    } else if (data.predictions) {
      console.log(`   ✅ predict endpoint: SUCCESS! Image generated.`);
      return true;
    }
  } catch (e) {
    console.log(`   ❌ predict endpoint: ${e.message}`);
  }

  // Method 2: REST API with generateImages endpoint (SDK style)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateImages`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "A cute cat",
          config: {
            numberOfImages: 1,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.log(`   ❌ generateImages endpoint: ${data.error.message}`);
    } else if (data.generatedImages || data.images) {
      console.log(`   ✅ generateImages endpoint: SUCCESS!`);
      return true;
    }
  } catch (e) {
    console.log(`   ❌ generateImages endpoint: ${e.message}`);
  }

  return false;
}

async function main() {
  console.log("🔍 Gemini API - Imagen Model Test\n");
  console.log("=" .repeat(60));

  // List all models
  await listModels();

  // Test specific Imagen models
  const modelsToTest = [
    "imagen-4.0-generate-001",
    "imagen-4.0-ultra-generate-001",
    "imagen-4.0-fast-generate-001",
    "imagen-3.0-generate-002",
    "imagen-3.0-generate-001",
  ];

  console.log("\n" + "=" .repeat(60));
  console.log("🧪 Testing Imagen Models Directly:\n");

  for (const model of modelsToTest) {
    await testImagenModel(model);
  }

  console.log("\n" + "=" .repeat(60));
  console.log("✅ Test completed!");
}

main().catch(console.error);
