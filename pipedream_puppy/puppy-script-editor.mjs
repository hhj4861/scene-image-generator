
import { axios } from "@pipedream/platform";

export default defineComponent({
    name: "Puppy Script Editor",
    description: "AI가 생성한 대본을 검토하고, 순서나 내용을 직접 수정한 JSON을 확정하여 다음 단계로 넘기는 컴포넌트입니다.",
    props: {
        generated_script_json: {
            type: "string",
            label: "Generated Script Input (AI Output)",
            description: "Puppy Script Generator의 출력값({{steps.Puppy_Script_Generator.$return_value}})을 연결하세요.",
        },
        manual_script_content: {
            type: "string",
            label: "Manual Script JSON (Override)",
            description: "전체 JSON을 직접 교체하려면 사용하세요. (가장 높은 우선순위)",
            optional: true,
        },
        edit_instruction: {
            type: "string",
            label: "Edit Instruction (AI 수정 요청)",
            description: "AI에게 수정을 요청할 내용을 자연어로 적으세요. 예: '3번 씬과 4번 씬 순서 바꿔줘', '마지막 씬 대사를 이걸로 바꿔줘', '전체적으로 더 신나게 변경해줘'",
            optional: true,
        },
        gemini_api_key: {
            type: "string",
            label: "Gemini API Key",
            description: "Gemini 모델 사용 시 필수",
            secret: true,
            optional: true,
        },
        llm_model: {
            type: "string",
            label: "LLM Model",
            description: "AI 수정에 사용할 모델을 선택하세요.",
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
    },
    async run({ $ }) {
        let finalScript;

        // ==========================================
        // Unified LLM Caller
        // ==========================================
        const callLLM = async (prompt, temperature = 0.2) => {
            const model = this.llm_model === "custom" ? this.custom_llm_model : this.llm_model;
            if (!model) throw new Error("Custom model ID is missing.");

            // 1. Gemini
            if (model.startsWith("gemini")) {
                if (!this.gemini_api_key) throw new Error("Gemini API Key is missing.");
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const resp = await axios($, {
                    url,
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": this.gemini_api_key },
                    data: {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature, maxOutputTokens: 8192 }
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
                        max_tokens: 8192,
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

        // 1. 수동 수정본이 있는지 확인 (최우선 순위)
        if (this.manual_script_content && this.manual_script_content.trim().length > 10) {
            $.export("status", "Using Manual Edit (Override)");
            console.log("Applying manual script edits...");
            try {
                // JSON 파싱 시도
                // Smart quotes 등 잘못된 문자 처리
                let cleanJson = this.manual_script_content
                    .replace(/[\u201C\u201D]/g, '"')
                    .replace(/[\u2018\u2019]/g, "'");

                finalScript = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error(`Manual Script JSON Parsing Error: ${e.message}. JSON 형식을 확인해주세요.`);
            }
        }
        // 2. AI 수정 요청이 있는지 확인
        else if (this.edit_instruction && this.edit_instruction.trim().length > 0) {
            $.export("status", "Processing AI Edit Instruction...");
            console.log(`Executing AI Edit: "${this.edit_instruction}"`);

            if (!this.gemini_api_key && this.llm_model.startsWith("gemini")) {
                throw new Error("AI 수정을 사용하려면 'Gemini API Key'가 필요합니다.");
            }

            let baseScript;
            try {
                baseScript = typeof this.generated_script_json === "string"
                    ? JSON.parse(this.generated_script_json)
                    : this.generated_script_json;
            } catch (e) {
                throw new Error(`Input Script Parsing Error: ${e.message}`);
            }

            const prompt = `You are a professional video script editor.
Current Script (JSON):
${JSON.stringify(baseScript)}

User Instruction: "${this.edit_instruction}"

TASK:
1. Modify the script exactly according to the user's instruction.
2. IMPORTANT: You MUST return the COMPLETE JSON object, including all metadata and the "script" object with "script_segments".
3. Do NOT remove any existing fields unless asked.
4. If the user asks to change a specific scene, find the segment with that "segment_number" or content.
5. Maintain the overall structure strictly.

Output Format: JSON only, no markdown.`;

            try {
                $.export("status", `Processing AI Edit Instruction with ${this.llm_model}...`);
                const responseText = await callLLM(prompt, 0.2);

                let content = responseText.trim();
                content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                let jsonStr = jsonMatch ? jsonMatch[0] : content;
                finalScript = JSON.parse(jsonStr);
                $.export("ai_edit_applied", true);

            } catch (e) {
                throw new Error(`AI Edit Failed: ${e.message}`);
            }

        }
        // 3. 둘 다 없으면 원본 사용
        else {
            $.export("status", "Using Original AI Script");
            console.log("Passing through original AI script...");

            if (!this.generated_script_json) {
                throw new Error("입력된 스크립트가 없습니다. 'Generated Script Input'을 연결해주세요.");
            }

            try {
                finalScript = typeof this.generated_script_json === "string"
                    ? JSON.parse(this.generated_script_json)
                    : this.generated_script_json;
            } catch (e) {
                throw new Error(`Input Script Parsing Error: ${e.message}`);
            }
        }

        // 4. 재조합 (Reassembly) logic
        // 만약 manual script나 AI edit이 제공되었지만, characters나 content_type 등 메타데이터가 누락되었다면 원본에서 복구 시도
        // 이 로직은 finalScript가 manual_script_content 또는 edit_instruction을 통해 생성되었을 때만 실행되어야 합니다.
        // 즉, original AI script를 그대로 사용하는 경우에는 실행할 필요가 없습니다.
        const isModified = (this.manual_script_content && this.manual_script_content.trim().length > 10) ||
            (this.edit_instruction && this.edit_instruction.trim().length > 0);

        if (isModified && this.generated_script_json) {
            try {
                const originalData = typeof this.generated_script_json === "string"
                    ? JSON.parse(this.generated_script_json)
                    : this.generated_script_json;

                // 필수 메타데이터 키 목록
                const metaKeys = ['folder_name', 'language', 'content_type', 'characters', 'bgm', 'consistency', 'topic_info'];

                metaKeys.forEach(key => {
                    if (!finalScript[key] && originalData[key]) {
                        finalScript[key] = originalData[key];
                        console.log(`Restored missing metadata: ${key}`);
                    }
                });

                // script 구조체 확인 (최상위에 script_segments가 없고, script 내부에 있는 경우 처리)
                if (!finalScript.script_segments && finalScript.script?.script_segments) {
                    // 사용자가 전체 구조를 유지한 경우
                } else if (!finalScript.script_segments && !finalScript.script) {
                    // 예외적 상황
                }
            } catch (e) {
                console.warn("Metadata restoration failed:", e);
            }
        }

        // Script Segment 접근 경로 정규화 (finalScript.script_segments 또는 finalScript.script.script_segments)
        let segments = finalScript.script_segments || (finalScript.script && finalScript.script.script_segments);

        if (!segments || !Array.isArray(segments)) {
            console.warn("Warning: Could not find 'script_segments' array. Video generation may fail.");
        } else {
            // 4. 재조합 (Reassembly) - 중요! 수정된 순서대로 시간 및 번호 재계산
            let currentTime = 0;
            segments.forEach((seg, index) => {
                // 순서 재할당
                seg.segment_number = index + 1;
                seg.index = index + 1;

                // Duration 확보 (없으면 기본값 4초)
                const segDuration = seg.duration || 4;
                // 지속시간이 변경되었을 수 있으므로 업데이트
                seg.duration = segDuration;

                // 시작/종료 시간 재계산
                seg.start_time = currentTime;
                currentTime += segDuration;
                seg.end_time = currentTime;
            });

            // 총 길이 업데이트
            finalScript.total_duration = currentTime;
            finalScript.total_duration_seconds = currentTime;

            // script 객체 내부 값도 동기화 (구조 유지)
            if (finalScript.script) {
                finalScript.script.total_duration = currentTime;
            }

            console.log(`Reassembled Script: Total Duration ${currentTime}s`);
        }

        $.export("$summary", `Script Finalized: ${finalScript.script_segments?.length || 0} scenes, ${finalScript.total_duration}s`);

        return finalScript;
    }
});
