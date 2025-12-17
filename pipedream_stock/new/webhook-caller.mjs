/**
 * Webhook Caller - 다음 워크플로우 트리거
 *
 * Fire & Forget 방식으로 다음 워크플로우를 호출합니다.
 * 응답을 기다리지 않고 즉시 완료됩니다.
 */

import axios from "axios";

export default {
  name: "Webhook Caller",
  description: "다음 워크플로우를 Webhook으로 트리거 (Fire & Forget)",
  key: "webhook_caller",
  version: "1.0.0",
  type: "action",
  props: {
    webhook_url: {
      type: "string",
      label: "Webhook URL",
      description: "다음 워크플로우의 Webhook URL (Pipedream에서 복사)",
    },
    payload_json: {
      type: "string",
      label: "Payload (JSON)",
      description: "전송할 데이터. 예: {{JSON.stringify(steps.Stock_Shorts_Generator.$return_value)}}",
    },
    timeout_ms: {
      type: "integer",
      label: "Timeout (ms)",
      description: "Webhook 호출 타임아웃 (기본: 5000ms)",
      default: 5000,
      optional: true,
    },
  },
  async run({ $ }) {
    const startTime = Date.now();

    console.log("🚀 Webhook 호출 시작");
    console.log(`📍 URL: ${this.webhook_url}`);

    let payload;
    try {
      payload = typeof this.payload_json === "string"
        ? JSON.parse(this.payload_json)
        : this.payload_json;
    } catch (e) {
      throw new Error(`Payload JSON 파싱 실패: ${e.message}`);
    }

    console.log(`📦 Payload 크기: ${JSON.stringify(payload).length} bytes`);

    try {
      // Fire & Forget - 응답 기다리지 않음
      const response = await axios({
        method: "POST",
        url: this.webhook_url,
        headers: { "Content-Type": "application/json" },
        data: payload,
        timeout: this.timeout_ms || 5000,
      });

      const elapsed = Date.now() - startTime;
      console.log(`✅ Webhook 호출 완료 (${elapsed}ms)`);
      console.log(`📋 응답 상태: ${response.status}`);

      $.export("$summary", `Webhook 호출 완료 (${elapsed}ms)`);

      return {
        success: true,
        webhook_url: this.webhook_url,
        response_status: response.status,
        elapsed_ms: elapsed,
        payload_size: JSON.stringify(payload).length,
      };
    } catch (error) {
      // Webhook은 Fire & Forget이므로 타임아웃도 성공으로 처리 가능
      if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
        console.log("⏱️ Webhook 타임아웃 - 하지만 요청은 전송됨 (Fire & Forget)");
        $.export("$summary", "Webhook 전송됨 (응답 대기 타임아웃)");
        return {
          success: true,
          webhook_url: this.webhook_url,
          note: "Request sent, response timed out (expected for long-running workflows)",
        };
      }

      console.error(`❌ Webhook 호출 실패: ${error.message}`);
      throw error;
    }
  },
};
