import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

/**
 * Creatomate Render
 * 영상, 음성, 자막을 합성하여 최종 쇼츠 영상 생성
 */

const CREATOMATE_API_URL = "https://api.creatomate.com/v1";

/**
 * 최종 영상 렌더링
 * @param {object} options - 옵션
 * @returns {Promise<object>} - 결과
 */
export async function renderFinalVideo(options) {
  const {
    videos,           // 영상 클립 배열 [{url, start, end, duration}, ...]
    audioUrl,         // 음성 파일 URL
    subtitles,        // 자막 배열 [{start, end, text}, ...]
    apiKey,
    outputDir = './output',
    filename = 'final_shorts.mp4',
    // 영상 설정
    videoWidth = 1080,
    videoHeight = 1920,
    // 자막 스타일
    subtitleFontSize = "5vw",
    subtitleFontFamily = "Noto Sans JP",
    subtitleColor = "#FFFFFF",
    subtitleBgColor = "rgba(0,0,0,0.6)",
    // GCS 설정
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
  } = options;

  console.log('\n[Creatomate] Starting render...');
  console.log(`  - Videos: ${videos.length}`);
  console.log(`  - Subtitles: ${subtitles.length}`);
  console.log(`  - Size: ${videoWidth}x${videoHeight}`);

  // 1. 영상 elements 생성
  const videoElements = videos.map((video, index) => {
    // 이전 영상들의 총 길이 계산
    const timeOffset = videos.slice(0, index).reduce(
      (sum, v) => sum + (v.duration || (v.end - v.start)), 0
    );

    return {
      type: "video",
      source: video.url,
      time: timeOffset,
      duration: video.duration || (video.end - video.start),
    };
  });

  // 총 영상 길이 계산
  const totalDuration = videos.reduce(
    (sum, v) => sum + (v.duration || (v.end - v.start)), 0
  );
  console.log(`  - Total duration: ${totalDuration}s`);

  // 2. 오디오 element 생성
  const audioElement = {
    type: "audio",
    source: audioUrl,
    time: 0,
    duration: totalDuration,
  };

  // 3. 자막 elements 생성
  // Creatomate: font_size는 vw/vh/px만 허용, padding은 %
  // subtitleFontSize가 % 형식이면 vw로 변환
  let fontSizeValue = subtitleFontSize;
  if (fontSizeValue.endsWith('%')) {
    // %를 vw로 변환 (근사값)
    const numValue = parseFloat(fontSizeValue);
    fontSizeValue = `${numValue}vw`;
  }

  const subtitleElements = subtitles.map((sub) => ({
    type: "text",
    text: sub.text,
    time: sub.start,
    duration: sub.end - sub.start,
    width: "90%",
    height: "auto",
    x: "50%",
    y: "85%",
    x_anchor: "50%",
    y_anchor: "50%",
    font_family: subtitleFontFamily,
    font_size: fontSizeValue,
    font_weight: "700",
    fill_color: subtitleColor,
    background_color: subtitleBgColor,
    background_x_padding: "3%",
    background_y_padding: "2%",
    background_border_radius: "5%",
    text_align: "center",
  }));

  // 4. 렌더링 요청
  // Creatomate API에서는 source 안에 elements를 넣어야 함
  const renderRequest = {
    output_format: "mp4",
    source: {
      output_format: "mp4",
      width: videoWidth,
      height: videoHeight,
      frame_rate: 30,
      duration: totalDuration,
      elements: [
        ...videoElements,
        audioElement,
        ...subtitleElements,
      ],
    },
  };

  console.log(`  - Sending render request...`);

  const createResponse = await axios({
    method: "POST",
    url: `${CREATOMATE_API_URL}/renders`,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    data: renderRequest,
  });

  const renderId = createResponse.data[0].id;
  console.log(`  - Render ID: ${renderId}`);

  // 5. 렌더링 완료 대기 (polling)
  let renderUrl = null;
  let attempts = 0;
  const maxAttempts = 120; // 최대 10분 대기

  while (!renderUrl && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기

    const statusResponse = await axios({
      method: "GET",
      url: `${CREATOMATE_API_URL}/renders/${renderId}`,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    const status = statusResponse.data.status;
    console.log(`  - Status: ${status} (attempt ${attempts + 1})`);

    if (status === "succeeded") {
      renderUrl = statusResponse.data.url;
    } else if (status === "failed") {
      throw new Error(`Creatomate render failed: ${statusResponse.data.error_message || 'Unknown error'}`);
    }

    attempts++;
  }

  if (!renderUrl) {
    throw new Error(`Timeout waiting for render (render_id: ${renderId})`);
  }

  console.log(`  - Render complete: ${renderUrl}`);

  // 6. 영상 다운로드
  const videoResponse = await axios({
    method: "GET",
    url: renderUrl,
    responseType: "arraybuffer",
  });

  const videoBuffer = Buffer.from(videoResponse.data);

  // 7. 로컬 저장
  await fs.mkdir(outputDir, { recursive: true });
  const filepath = path.join(outputDir, filename);
  await fs.writeFile(filepath, videoBuffer);
  console.log(`  - Saved: ${filepath}`);
  console.log(`  - Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // 8. GCS 업로드 (옵션)
  let gcsResult = null;
  if (gcsBucket && gcsFolder && googleCredentialsPath) {
    gcsResult = await uploadVideoToGCS(filepath, filename, {
      bucket: gcsBucket,
      folder: gcsFolder,
      credentialsPath: googleCredentialsPath,
    });
  }

  return {
    success: true,
    filename,
    filepath,
    creatomate_url: renderUrl,
    size: videoBuffer.length,
    total_duration: totalDuration,
    video_count: videos.length,
    subtitle_count: subtitles.length,
    gcs: gcsResult,
  };
}

/**
 * GCS에 영상 업로드
 */
async function uploadVideoToGCS(filepath, filename, options) {
  const { bucket, folder, credentialsPath } = options;

  console.log('\n[GCS] Uploading final video...');

  const storage = new Storage({ keyFilename: credentialsPath });
  const bucketRef = storage.bucket(bucket);
  const destination = `${folder}/${filename}`;

  await bucketRef.upload(filepath, {
    destination,
    metadata: { contentType: 'video/mp4' },
  });

  const publicUrl = `https://storage.googleapis.com/${bucket}/${destination}`;
  console.log(`  - Uploaded: ${publicUrl}`);

  return {
    bucket,
    folder,
    url: publicUrl,
  };
}

export default { renderFinalVideo };
