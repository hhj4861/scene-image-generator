/**
 * 📤 Puppy Mobile Upload Handler
 * 
 * Pipedream HTTP Trigger 컴포넌트
 * 모바일에서 업로드된 파일을 GCS에 저장
 * 
 * 워크플로우 설정:
 * 1. Pipedream에서 새 워크플로우 생성
 * 2. HTTP Trigger 선택 (POST 요청 활성화)
 * 3. 이 컴포넌트를 다음 스텝으로 추가
 * 4. GCS 인증 설정 (Service Account JSON)
 */

import { Storage } from "@google-cloud/storage";

export default defineComponent({
  name: "Puppy Mobile Upload Handler",
  description: "모바일에서 업로드된 영상/스크립트 파일을 GCS에 저장하고 URL 반환",

  props: {
    gcs_credentials: {
      type: "string",
      label: "GCS Service Account JSON",
      description: "Google Cloud Storage 서비스 계정 JSON (전체 내용)",
      secret: true,
    },
    gcs_bucket: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-videos-storage-mcp-test-457809",
      description: "파일을 저장할 GCS 버킷 이름",
    },
    base_folder: {
      type: "string",
      label: "Base Folder",
      default: "mobile-uploads",
      description: "GCS 내 기본 저장 폴더",
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 1. HTTP 요청 파싱
    // =====================
    const { body, headers } = steps.trigger.event;
    
    // Content-Type 확인
    const contentType = headers["content-type"] || "";
    
    if (!contentType.includes("multipart/form-data")) {
      throw new Error("multipart/form-data 형식으로 요청해주세요");
    }

    // =====================
    // 2. FormData 파싱
    // =====================
    // Pipedream은 multipart를 자동 파싱함
    const projectName = body.project_name || `project_${Date.now()}`;
    const fileType = body.file_type || "video"; // video, config, script
    const fileIndex = body.file_index || 1;
    
    // 파일 데이터 (Pipedream이 파싱한 형태)
    const file = body.file;
    
    if (!file) {
      throw new Error("업로드된 파일이 없습니다");
    }

    $.export("received", {
      project_name: projectName,
      file_type: fileType,
      file_index: fileIndex,
      file_name: file.filename || file.name,
      file_size: file.size,
    });

    // =====================
    // 3. GCS 클라이언트 초기화
    // =====================
    let credentials;
    try {
      credentials = JSON.parse(this.gcs_credentials);
    } catch (e) {
      throw new Error("GCS 인증 정보가 올바른 JSON 형식이 아닙니다");
    }

    const storage = new Storage({
      credentials,
      projectId: credentials.project_id,
    });

    const bucket = storage.bucket(this.gcs_bucket);

    // =====================
    // 4. 파일 저장 경로 생성
    // =====================
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
    
    let gcsPath;
    let originalFilename = file.filename || file.name || `file_${fileIndex}`;
    
    if (fileType === "video") {
      // 영상: mobile-uploads/프로젝트명/video/씬1.mp4
      gcsPath = `${this.base_folder}/${sanitizedProjectName}/video/${originalFilename}`;
    } else if (fileType === "config" || fileType === "script") {
      // 설정: mobile-uploads/프로젝트명/config.json
      gcsPath = `${this.base_folder}/${sanitizedProjectName}/${originalFilename}`;
    } else {
      gcsPath = `${this.base_folder}/${sanitizedProjectName}/other/${originalFilename}`;
    }

    // =====================
    // 5. GCS에 파일 업로드
    // =====================
    $.export("status", `Uploading to gs://${this.gcs_bucket}/${gcsPath}`);

    try {
      const gcsFile = bucket.file(gcsPath);
      
      // 파일 데이터 (Buffer 또는 Base64)
      let fileBuffer;
      if (file.data) {
        // Pipedream이 파싱한 Buffer
        fileBuffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "base64");
      } else if (file.content) {
        // Base64 인코딩된 경우
        fileBuffer = Buffer.from(file.content, "base64");
      } else if (typeof file === "string") {
        // Raw string (JSON 등)
        fileBuffer = Buffer.from(file, "utf-8");
      } else {
        throw new Error("파일 데이터 형식을 인식할 수 없습니다");
      }

      // 업로드
      await gcsFile.save(fileBuffer, {
        metadata: {
          contentType: file.mimetype || file.type || "application/octet-stream",
          metadata: {
            project_name: projectName,
            file_type: fileType,
            upload_time: new Date().toISOString(),
            original_filename: originalFilename,
          },
        },
      });

      // Public URL 생성 (또는 Signed URL)
      const gcsUrl = `https://storage.googleapis.com/${this.gcs_bucket}/${gcsPath}`;

      $.export("$summary", `✅ 파일 업로드 완료: ${originalFilename}`);

      // =====================
      // 6. Config/Script 파일인 경우 파싱
      // =====================
      let parsedConfig = null;
      if ((fileType === "config" || fileType === "script") && originalFilename.endsWith(".json")) {
        try {
          const jsonContent = fileBuffer.toString("utf-8");
          parsedConfig = JSON.parse(jsonContent);
          $.export("parsed_config_preview", {
            project_name: parsedConfig.project_name,
            scene_count: parsedConfig.scene_count,
            has_timed_subtitles: !!parsedConfig.timed_subtitles,
            has_scenes: !!parsedConfig.scenes,
          });
        } catch (e) {
          console.log("JSON 파싱 실패 (무시됨):", e.message);
        }
      }

      // =====================
      // 7. 결과 반환
      // =====================
      return {
        success: true,
        project_name: projectName,
        file_type: fileType,
        file_index: fileIndex,
        original_filename: originalFilename,
        gcs_path: gcsPath,
        gcs_url: gcsUrl,
        bucket: this.gcs_bucket,
        file_size: fileBuffer.length,
        parsed_config: parsedConfig,
        upload_time: new Date().toISOString(),
      };

    } catch (error) {
      throw new Error(`GCS 업로드 실패: ${error.message}`);
    }
  },
});

