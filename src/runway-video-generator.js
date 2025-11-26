import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

/**
 * Runway Video Generator
 * 이미지를 영상 클립으로 변환 (Runway Gen-3 Alpha)
 */

const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";

/**
 * 이미지에서 영상 생성
 * @param {string} imageUrl - 이미지 URL
 * @param {string} apiKey - Runway API 키
 * @param {object} options - 추가 옵션
 * @returns {Promise<Buffer>} - 영상 Buffer
 */
async function generateVideoFromImage(imageUrl, apiKey, options = {}) {
  const {
    duration = 5,
    seed = null,
    promptText = "smooth camera motion, cinematic quality, consistent style",
    ratio = "768:1280",  // 세로형 쇼츠
  } = options;

  // 1. 영상 생성 작업 시작
  console.log(`  - Image URL: ${imageUrl}`);
  console.log(`  - Duration: ${duration}s`);
  console.log(`  - Seed: ${seed || 'random'}`);

  try {
    // Runway API 요청
    const requestData = {
      model: "gen3a_turbo",
      promptImage: imageUrl,
      promptText: promptText,
      ratio: ratio,
    };

    // duration은 5 또는 10 (숫자)
    if (duration === 5 || duration === 10) {
      requestData.duration = duration;
    }

    // seed 설정 (일관성을 위해)
    if (seed !== null) {
      requestData.seed = seed;
    }

    console.log(`  - Request:`, JSON.stringify(requestData, null, 2));

    const createResponse = await axios({
      method: "POST",
      url: `${RUNWAY_API_URL}/image_to_video`,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      data: requestData,
    });

    var taskId = createResponse.data.id;
    console.log(`  - Task started: ${taskId}`);
  } catch (error) {
    console.error(`  - API Error:`, JSON.stringify(error.response?.data, null, 2) || error.message);
    throw error;
  }

  // 2. 작업 완료 대기 (polling)
  let videoUrl = null;
  let attempts = 0;
  const maxAttempts = 60; // 최대 5분 대기

  while (!videoUrl && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기

    const statusResponse = await axios({
      method: "GET",
      url: `${RUNWAY_API_URL}/tasks/${taskId}`,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    const status = statusResponse.data.status;
    console.log(`  - Status: ${status} (attempt ${attempts + 1})`);

    if (status === "SUCCEEDED") {
      videoUrl = statusResponse.data.output[0];
    } else if (status === "FAILED") {
      throw new Error(`Runway task failed: ${statusResponse.data.failure || 'Unknown error'}`);
    }

    attempts++;
  }

  if (!videoUrl) {
    throw new Error(`Timeout waiting for video generation (task: ${taskId})`);
  }

  // 3. 영상 다운로드
  const videoResponse = await axios({
    method: "GET",
    url: videoUrl,
    responseType: "arraybuffer",
  });

  return Buffer.from(videoResponse.data);
}

/**
 * 이미지를 그룹으로 묶기 (2개씩 → 10초 영상)
 * @param {Array} images - 이미지 배열
 * @param {number} groupSize - 그룹 크기 (기본 2)
 * @returns {Array} - 그룹화된 이미지 배열
 */
function groupImages(images, groupSize = 2) {
  const groups = [];
  for (let i = 0; i < images.length; i += groupSize) {
    const group = images.slice(i, i + groupSize);
    // 첫 번째 이미지를 대표 이미지로 사용
    const firstImage = group[0];
    const lastImage = group[group.length - 1];
    groups.push({
      url: firstImage.url,
      filename: firstImage.filename,
      start: firstImage.start,
      end: lastImage.end,
      duration: lastImage.end - firstImage.start,
      imageCount: group.length,
    });
  }
  return groups;
}

/**
 * 모든 이미지에서 영상 생성
 * @param {object} options - 옵션
 * @returns {Promise<object>} - 결과
 */
export async function generateVideos(options) {
  const {
    images,
    runwayApiKey,
    outputDir = './output',
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
    videoDuration = 5,  // 기본값 5초 (각 이미지마다)
    // 일관성 옵션
    seed = null,  // 동일한 seed로 일관된 스타일
    promptText = "smooth camera motion, cinematic quality, consistent anime style, maintain character appearance",
    ratio = "768:1280",  // 세로형 쇼츠
  } = options;

  // 그룹화 없이 각 이미지마다 영상 생성
  const processImages = images;

  // seed가 없으면 랜덤 생성 (전체 영상에 동일하게 적용)
  const consistentSeed = seed || Math.floor(Math.random() * 4294967295);

  console.log('\n[Runway] Starting video generation...');
  console.log(`  - Total images: ${images.length}`);
  console.log(`  - Videos to generate: ${processImages.length}`);
  console.log(`  - Duration per video: ${videoDuration}s`);
  console.log(`  - Consistent seed: ${consistentSeed}`);
  console.log(`  - Prompt: ${promptText}`);

  const generatedVideos = [];

  for (let i = 0; i < processImages.length; i++) {
    const image = processImages[i];
    console.log(`\n[Runway] Processing image ${i + 1}/${processImages.length}`);

    try {
      const videoBuffer = await generateVideoFromImage(
        image.url,
        runwayApiKey,
        {
          duration: videoDuration,
          seed: consistentSeed,
          promptText: promptText,
          ratio: ratio,
        }
      );

      const filename = `video_${String(i + 1).padStart(3, '0')}_${image.start}-${image.end}.mp4`;
      const filepath = path.join(outputDir, filename);

      // 로컬 저장
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(filepath, videoBuffer);
      console.log(`  - Saved: ${filepath}`);

      generatedVideos.push({
        index: i,
        filename,
        filepath,
        start: image.start,
        end: image.end,
        duration: videoDuration,  // 실제 영상 길이 (10초)
        status: 'success',
      });

      // Rate limit delay
      if (i < processImages.length - 1) {
        console.log('  - Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`  - Error: ${error.message}`);
      generatedVideos.push({
        index: i,
        start: image.start,
        end: image.end,
        status: 'failed',
        error: error.message,
      });
    }
  }

  // GCS 업로드 (옵션)
  let gcsResult = null;
  if (gcsBucket && gcsFolder && googleCredentialsPath) {
    gcsResult = await uploadVideosToGCS(generatedVideos, {
      bucket: gcsBucket,
      folder: gcsFolder,
      credentialsPath: googleCredentialsPath,
    });
  }

  return {
    success: true,
    total_videos: generatedVideos.length,
    successful: generatedVideos.filter(v => v.status === 'success').length,
    videos: generatedVideos,
    gcs: gcsResult,
  };
}

/**
 * GCS에 영상 업로드
 */
async function uploadVideosToGCS(videos, options) {
  const { bucket, folder, credentialsPath } = options;

  console.log('\n[GCS] Uploading videos...');

  const storage = new Storage({ keyFilename: credentialsPath });
  const bucketRef = storage.bucket(bucket);
  const uploadedFiles = [];

  const successfulVideos = videos.filter(v => v.status === 'success');

  for (const video of successfulVideos) {
    const destination = `${folder}/${video.filename}`;

    await bucketRef.upload(video.filepath, {
      destination,
      metadata: { contentType: 'video/mp4' },
    });

    const publicUrl = `https://storage.googleapis.com/${bucket}/${destination}`;
    uploadedFiles.push({
      ...video,
      url: publicUrl,
    });

    console.log(`  - Uploaded: ${video.filename}`);
  }

  return {
    bucket,
    folder,
    files: uploadedFiles,
  };
}

export default { generateVideos };
