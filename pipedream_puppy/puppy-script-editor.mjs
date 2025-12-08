
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

★★★ VIDEO ACTION RULES (매우 중요!) ★★★
⚠️ 대사에 동작이 포함되면 반드시 video_prompt.character_action에도 반영!

📌 동작 키워드 매핑 (대사에 이 단어가 있으면 → character_action에 반영):
- 춤/댄스/흔들흔들 → "dancing", "body swaying", "grooving"
- 폴짝/뛰어/점프/깡충깡충 → "jumping", "hopping", "bouncing"
- 빙글빙글/회전/돌아 → "spinning", "rotating", "twirling"
- 꼬리 흔들/살랑살랑 → "wagging tail happily", "tail swaying"
- 달려/뛰어가 → "running", "dashing"
- 앉아 → "sitting down", "sitting pose"
- 누워 → "lying down", "laying down"
- 일어나/벌떡 → "standing up", "getting up suddenly"
- 갸웃 → "tilting head curiously", "head tilt"
- 하품 → "yawning", "stretching mouth in yawn"
- 기지개 → "stretching body", "full body stretch"
- 먹어/냠냠/맛있 → "eating", "chewing", "munching happily"
- 핥/핥아 → "licking", "licking lips"
- 구르/뒹굴 → "rolling on ground", "rolling around playfully"
- 똥꼬스키/엉덩이 스키/엉덩이 끌/바닥 끌/스키 타/미끄러 → "scooting butt on floor", "skiing on butt across floor", "dragging bottom across ground using front legs", "butt sliding on floor comically"

📌 예시:
- 대사: "폴짝폴짝 뛰니까 신나요~"
  → video_prompt.character_action: "jumping and hopping happily, energetic bouncing motion"
  → video_prompt.body_movement: "active jumping motion, full body bouncing"

- 대사: "빙글빙글 돌아볼게요!"
  → video_prompt.character_action: "spinning around playfully, twirling motion"
  → video_prompt.camera_movement: "tracking" (동작이 있으면 dynamic 또는 tracking 권장)

- 대사: "똥꼬스키 타볼게요~ 슝슝!"
  → video_prompt.character_action: "scooting butt on floor, dragging bottom across ground using front legs, sliding forward comically"
  → video_prompt.body_movement: "sitting with hind legs extended forward, using front paws to pull body forward while butt drags on floor"
  → video_prompt.camera_movement: "tracking" (이동하는 동작이므로 tracking)
  → image_prompt: 기존 프롬프트 + "scooting on floor with butt dragging, front paws pulling forward, comical sliding pose"

- 대사: "엉덩이 스키 타볼게요~!"
  → video_prompt.character_action: "skiing on butt across floor playfully, scooting bottom on ground like skiing"
  → video_prompt.body_movement: "sitting with butt on floor, hind legs spread forward, using front paws to glide forward in skiing motion"
  → video_prompt.camera_movement: "dynamic"
  → image_prompt: 기존 프롬프트 + "doing butt skiing on floor, playful scooting pose, legs spread like skiing, sliding forward comically"

⚠️ 동작이 있는 씬은:
- video_prompt.lip_sync: 대사가 있으면 "yes"
- video_prompt.camera_movement: "dynamic" 또는 "tracking" (static 대신)
- image_prompt에도 동작 설명 추가

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
            // ★★★ 동작 키워드 감지 및 video_prompt 자동 업데이트 함수 ★★★
            const actionKeywordMap = {
                // 춤/댄스
                '춤': { action: 'dancing playfully', body: 'rhythmic body movement', camera: 'dynamic' },
                '댄스': { action: 'dancing energetically', body: 'full body dance moves', camera: 'dynamic' },
                '흔들흔들': { action: 'swaying body side to side', body: 'gentle swaying motion', camera: 'tracking' },
                '핫팩 댄스': { action: 'dancing while holding hotpack, cute dance moves', body: 'energetic dance with object', camera: 'dynamic' },
                // 뛰기/점프
                '폴짝폴짝': { action: 'hopping and jumping repeatedly', body: 'bouncy hopping motion', camera: 'tracking' },
                '폴짝': { action: 'making a small hop', body: 'single hop motion', camera: 'dynamic' },
                '뛰어': { action: 'jumping up', body: 'energetic jump', camera: 'dynamic' },
                '점프': { action: 'jumping high', body: 'powerful jump motion', camera: 'dynamic' },
                '깡충깡충': { action: 'hopping like a bunny', body: 'cute bouncy hops', camera: 'tracking' },
                // 돌기/회전
                '빙글빙글': { action: 'spinning around playfully', body: 'twirling motion', camera: 'tracking' },
                '회전': { action: 'rotating body', body: 'spinning motion', camera: 'dynamic' },
                '돌아': { action: 'turning around', body: 'rotating motion', camera: 'tracking' },
                // 꼬리
                '꼬리 흔들': { action: 'wagging tail happily', body: 'tail wagging vigorously', camera: 'static' },
                '살랑살랑': { action: 'wagging tail gently', body: 'gentle tail sway', camera: 'static' },
                // 이동
                '달려': { action: 'running fast', body: 'running motion', camera: 'tracking' },
                '뛰어가': { action: 'running towards something', body: 'dashing forward', camera: 'tracking' },
                // 자세
                '앉아': { action: 'sitting down', body: 'transitioning to sit pose', camera: 'static' },
                '누워': { action: 'lying down', body: 'laying down on ground', camera: 'static' },
                '일어나': { action: 'standing up', body: 'getting up from lying/sitting', camera: 'static' },
                '벌떡': { action: 'jumping up suddenly', body: 'sudden standing motion', camera: 'dynamic' },
                // 표정/제스처
                '갸웃': { action: 'tilting head curiously', body: 'head tilt to side', camera: 'zoom_in' },
                '하품': { action: 'yawning widely', body: 'stretching mouth open', camera: 'zoom_in' },
                '기지개': { action: 'stretching body fully', body: 'full body stretch with limbs extended', camera: 'static' },
                // 먹기
                '먹어': { action: 'eating food', body: 'chewing motion', camera: 'zoom_in' },
                '냠냠': { action: 'munching happily', body: 'cute eating motion', camera: 'zoom_in' },
                '맛있': { action: 'enjoying food deliciously', body: 'happy eating expression', camera: 'zoom_in' },
                // 핥기
                '핥': { action: 'licking', body: 'tongue out licking', camera: 'zoom_in' },
                '핥아': { action: 'licking something', body: 'licking motion', camera: 'zoom_in' },
                // 구르기
                '구르': { action: 'rolling on ground', body: 'rolling motion on back', camera: 'tracking' },
                '뒹굴': { action: 'rolling around playfully', body: 'playful rolling on ground', camera: 'tracking' },
                // ★★★ 똥꼬스키 (Butt Scooting) ★★★
                '똥꼬스키': { action: 'scooting butt on floor, dragging bottom across ground using front legs', body: 'sitting with hind legs extended forward, using front paws to pull body forward while butt drags on floor', camera: 'tracking', image: 'scooting on floor with butt dragging, front paws pulling forward, comical sliding pose' },
                '엉덩이 끌': { action: 'dragging butt across floor', body: 'bottom pressed to ground, front legs pulling forward', camera: 'tracking', image: 'dragging bottom on floor, front legs walking forward' },
                '엉덩이 스키': { action: 'skiing on butt across floor playfully, scooting bottom on ground like skiing', body: 'sitting with butt on floor, hind legs spread forward, using front paws to glide forward in skiing motion', camera: 'dynamic', image: 'doing butt skiing on floor, playful scooting pose, legs spread like skiing, sliding forward comically' },
                '바닥 끌': { action: 'scooting on floor with butt down', body: 'rear end sliding on ground, front paws walking forward', camera: 'tracking', image: 'sliding on floor with bottom down' },
                '스키 타': { action: 'scooting butt playfully like skiing', body: 'butt on floor, legs spread, sliding forward comically', camera: 'dynamic', image: 'skiing pose on floor, butt sliding, playful motion' },
                '미끄러': { action: 'sliding on floor', body: 'body sliding motion on ground', camera: 'tracking', image: 'sliding motion on floor' },
            };

            const detectActionsFromNarration = (narration) => {
                if (!narration) return null;
                const detectedActions = [];
                const detectedBody = [];
                const detectedImages = [];
                let recommendedCamera = 'static';

                for (const [keyword, mapping] of Object.entries(actionKeywordMap)) {
                    if (narration.includes(keyword)) {
                        detectedActions.push(mapping.action);
                        detectedBody.push(mapping.body);
                        if (mapping.image) {
                            detectedImages.push(mapping.image);
                        }
                        if (mapping.camera !== 'static') {
                            recommendedCamera = mapping.camera;
                        }
                    }
                }

                if (detectedActions.length === 0) return null;

                return {
                    character_action: detectedActions.join(', '),
                    body_movement: detectedBody.join(', '),
                    camera_movement: recommendedCamera,
                    image_description: detectedImages.length > 0 ? detectedImages.join(', ') : null,
                    has_action: true
                };
            };

            // ★★★ VEO3 허용 Duration (4, 6, 8초만 지원) ★★★
            const VEO3_ALLOWED_DURATIONS = [4, 6, 8];
            const findClosestDuration = (target) => VEO3_ALLOWED_DURATIONS.reduce((prev, curr) =>
                Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
            );

            // 언어별 초당 글자 수 (대사 길이로 duration 계산용)
            const CHARS_PER_SECOND = 5; // 한국어 기준

            // 4. 재조합 (Reassembly) - 중요! 수정된 순서대로 시간 및 번호 재계산
            let currentTime = 0;
            segments.forEach((seg, index) => {
                // 순서 재할당
                seg.segment_number = index + 1;
                seg.index = index + 1;

                // ★★★ 대사 기반 duration 재계산 ★★★
                const narration = seg.narration || seg.narration_korean || '';
                const narrationLength = narration.trim().length;

                // has_narration 업데이트 (대사 추가/삭제 시)
                seg.has_narration = narrationLength > 0;

                // Duration 계산: 대사가 있으면 대사 길이 기반, 없으면 기존값 또는 기본값
                let calculatedDuration;
                if (narrationLength > 0) {
                    // 대사 길이 기반 duration 계산 (최소 4초)
                    const durationFromText = Math.ceil(narrationLength / CHARS_PER_SECOND);
                    calculatedDuration = findClosestDuration(Math.max(durationFromText, 4));
                } else {
                    // 대사가 없으면 기존 duration 유지 또는 기본값 4초
                    calculatedDuration = seg.duration || 4;
                }

                // VEO3 허용 duration으로 조정
                seg.duration = VEO3_ALLOWED_DURATIONS.includes(calculatedDuration)
                    ? calculatedDuration
                    : findClosestDuration(calculatedDuration);

                // 시작/종료 시간 재계산
                seg.start_time = currentTime;
                currentTime += seg.duration;
                seg.end_time = currentTime;

                // ★★★ 동작 키워드 감지 및 video_prompt 자동 업데이트 ★★★
                const detectedAction = detectActionsFromNarration(narration);

                if (detectedAction) {
                    // video_prompt 초기화 (없으면 생성)
                    if (!seg.video_prompt) {
                        seg.video_prompt = {};
                    }

                    // 기존 character_action이 없거나 기본값인 경우에만 업데이트
                    const existingAction = seg.video_prompt.character_action || '';
                    const isDefaultAction = existingAction.includes('talking') ||
                                           existingAction.includes('listening') ||
                                           existingAction === '' ||
                                           existingAction.includes('natural idle');

                    if (isDefaultAction) {
                        // 대사가 있으면 립싱크와 함께 동작 추가
                        const hasNarration = narration.trim().length > 0;
                        seg.video_prompt.character_action = hasNarration
                            ? `${detectedAction.character_action}, talking with lip sync`
                            : detectedAction.character_action;
                        seg.video_prompt.body_movement = detectedAction.body_movement;
                        seg.video_prompt.camera_movement = detectedAction.camera_movement;
                        seg.video_prompt.has_detected_action = true;

                        console.log(`Scene ${index + 1}: Detected actions from narration → ${detectedAction.character_action}`);
                    } else {
                        // 기존 동작이 있으면 추가 동작만 병합
                        if (!existingAction.includes(detectedAction.character_action.split(',')[0])) {
                            seg.video_prompt.character_action = `${existingAction}, ${detectedAction.character_action}`;
                            console.log(`Scene ${index + 1}: Merged additional actions → ${seg.video_prompt.character_action}`);
                        }
                    }

                    // 동적 카메라 무브먼트가 권장되면 업데이트
                    if (detectedAction.camera_movement !== 'static' &&
                        (!seg.video_prompt.camera_movement || seg.video_prompt.camera_movement === 'static')) {
                        seg.video_prompt.camera_movement = detectedAction.camera_movement;
                    }

                    // ★★★ image_prompt 업데이트 (대사 변경 시 이미지도 변경) ★★★
                    if (detectedAction.image_description) {
                        // 상세한 이미지 설명이 있으면 우선 사용
                        if (seg.image_prompt) {
                            // 기존 image_prompt에 동작 설명이 없으면 추가
                            const imageDesc = detectedAction.image_description.split(',')[0].toLowerCase();
                            if (!seg.image_prompt.toLowerCase().includes(imageDesc)) {
                                seg.image_prompt = `${seg.image_prompt}, ${detectedAction.image_description}`;
                                console.log(`Scene ${index + 1}: Updated image_prompt with action → ${detectedAction.image_description}`);
                            }
                        } else {
                            // image_prompt가 없으면 새로 생성
                            seg.image_prompt = detectedAction.image_description;
                        }
                        seg.image_prompt_updated = true;
                    } else {
                        // image_description이 없으면 character_action에서 추출
                        if (seg.image_prompt && !seg.image_prompt.toLowerCase().includes(detectedAction.character_action.split(',')[0].toLowerCase())) {
                            const actionForImage = detectedAction.character_action.split(',')[0];
                            seg.image_prompt = `${seg.image_prompt}, ${actionForImage}`;
                        }
                    }
                }
            });

            // 총 길이 업데이트
            finalScript.total_duration = currentTime;
            finalScript.total_duration_seconds = currentTime;

            // script 객체 내부 값도 동기화 (구조 유지)
            if (finalScript.script) {
                finalScript.script.total_duration = currentTime;
            }

            console.log(`Reassembled Script: Total Duration ${currentTime}s`);

            // ★★★ timed_subtitles 재생성 (스크립트 수정 후 시간 동기화) ★★★
            const secondsToTimeStr = (seconds) => {
              const mins = Math.floor(seconds / 60);
              const secs = (seconds % 60).toFixed(2);
              return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
            };
            // ★★★ 자막 특수문자 처리 함수 (FFmpeg drawtext 호환) ★★★
            const cleanSubtitleText = (text) => {
              if (!text) return "";
              return text
                .replace(/\$/g, "달러")       // $ → 달러 (FFmpeg에서 $가 누락되는 문제 해결)
                .replace(/\|/g, " - ")        // | → 하이픈으로 대체 (FFmpeg 필터 구분자 충돌 방지)
                .replace(/%/g, "퍼센트")      // % → 퍼센트 (FFmpeg drawtext에서 %는 특수문자)
                .replace(/&/g, "앤드")        // & → 앤드
                .replace(/#/g, "")            // # 제거
                .replace(/\*/g, "")           // * 제거
                .replace(/<[^>]*>/g, "")      // HTML 태그 제거
                .replace(/\s+/g, " ")         // 연속 공백 제거
                .trim();
            };
            finalScript.timed_subtitles = segments
              .filter(seg => seg.has_narration && (seg.narration_korean?.trim() || seg.narration?.trim()))
              .map(seg => ({
                start_time: secondsToTimeStr(seg.start_time || 0),
                end_time: secondsToTimeStr(seg.end_time || (seg.start_time || 0) + (seg.duration || 4)),
                text_ko: cleanSubtitleText(seg.narration_korean || seg.narration || ""),
                text_en: cleanSubtitleText(seg.narration_english || ""),
                speaker: seg.speaker || "main",
                color: seg.scene_type === "interview_question" ? "silver" : (seg.emotion === "excited" || seg.emotion === "happy" ? "gold" : "white")
              }));
            console.log(`Regenerated timed_subtitles: ${finalScript.timed_subtitles.length} entries`);

            // 동작 감지 통계
            const detectedActionCount = segments.filter(seg => seg.video_prompt?.has_detected_action).length;
            if (detectedActionCount > 0) {
                console.log(`Action detection: ${detectedActionCount} scenes with auto-detected actions from narration`);
                $.export("detected_actions_count", detectedActionCount);
            }
        }

        $.export("$summary", `Script Finalized: ${finalScript.script_segments?.length || 0} scenes, ${finalScript.total_duration}s, ${finalScript.timed_subtitles?.length || 0} subtitles${segments?.filter(s => s.video_prompt?.has_detected_action).length > 0 ? `, ${segments.filter(s => s.video_prompt?.has_detected_action).length} action-detected` : ''}`);

        return finalScript;
    }
});
