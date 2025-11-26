import { Storage } from '@google-cloud/storage';

/**
 * GCS Helper
 * GCS에서 최근 생성된 이미지/영상 정보 조회
 */

/**
 * GCS 클라이언트 초기화
 */
function getStorage(credentialsPath) {
  return new Storage({ keyFilename: credentialsPath });
}

/**
 * 버킷의 모든 폴더(prefix) 목록 조회
 */
export async function listFolders(options) {
  const { bucket, credentialsPath } = options;

  const storage = getStorage(credentialsPath);
  const [files] = await storage.bucket(bucket).getFiles();

  // 폴더명 추출 (첫 번째 '/' 이전 부분)
  const folders = new Set();
  files.forEach(file => {
    const parts = file.name.split('/');
    if (parts.length > 1) {
      folders.add(parts[0]);
    }
  });

  // 날짜순 정렬 (폴더명이 YYYYMMDD_uuid_title 형식)
  const sortedFolders = Array.from(folders).sort().reverse();

  return sortedFolders;
}

/**
 * 가장 최근 폴더의 이미지 목록 조회
 */
export async function getLatestImages(options) {
  const { bucket, credentialsPath, folderName } = options;

  const storage = getStorage(credentialsPath);

  // 폴더명이 없으면 가장 최근 폴더 조회
  let targetFolder = folderName;
  if (!targetFolder) {
    const folders = await listFolders({ bucket, credentialsPath });
    if (folders.length === 0) {
      throw new Error('No folders found in bucket');
    }
    targetFolder = folders[0]; // 가장 최근 폴더
  }

  console.log(`[GCS] Loading images from folder: ${targetFolder}`);

  // 폴더 내 파일 조회
  const [files] = await storage.bucket(bucket).getFiles({
    prefix: `${targetFolder}/`,
  });

  // 이미지 파일만 필터링 (scene_xxx_start-end.png 형식)
  const images = files
    .filter(file => file.name.endsWith('.png') && file.name.includes('scene_'))
    .map(file => {
      const filename = file.name.split('/').pop();
      // scene_001_0-5.png 에서 start, end 추출
      const match = filename.match(/scene_(\d+)_(\d+)-(\d+)\.png/);

      return {
        filename,
        url: `https://storage.googleapis.com/${bucket}/${file.name}`,
        index: match ? parseInt(match[1]) - 1 : 0,
        start: match ? parseInt(match[2]) : 0,
        end: match ? parseInt(match[3]) : 5,
      };
    })
    .sort((a, b) => a.index - b.index);

  // metadata.json 조회
  let metadata = null;
  const metadataFile = files.find(f => f.name.endsWith('metadata.json'));
  if (metadataFile) {
    const [content] = await metadataFile.download();
    metadata = JSON.parse(content.toString());
  }

  return {
    folder: targetFolder,
    bucket,
    images,
    metadata,
    folderUrl: `https://storage.googleapis.com/${bucket}/${targetFolder}/`,
  };
}

/**
 * 가장 최근 폴더의 영상 목록 조회
 */
export async function getLatestVideos(options) {
  const { bucket, credentialsPath, folderName } = options;

  const storage = getStorage(credentialsPath);

  // 폴더명이 없으면 가장 최근 폴더 조회
  let targetFolder = folderName;
  if (!targetFolder) {
    const folders = await listFolders({ bucket, credentialsPath });
    if (folders.length === 0) {
      throw new Error('No folders found in bucket');
    }
    targetFolder = folders[0];
  }

  console.log(`[GCS] Loading videos from folder: ${targetFolder}`);

  const [files] = await storage.bucket(bucket).getFiles({
    prefix: `${targetFolder}/`,
  });

  // 영상 파일만 필터링 (video_xxx_start-end.mp4 형식)
  const videos = files
    .filter(file => file.name.endsWith('.mp4') && file.name.includes('video_'))
    .map(file => {
      const filename = file.name.split('/').pop();
      const match = filename.match(/video_(\d+)_(\d+)-(\d+)\.mp4/);

      return {
        filename,
        url: `https://storage.googleapis.com/${bucket}/${file.name}`,
        index: match ? parseInt(match[1]) - 1 : 0,
        start: match ? parseInt(match[2]) : 0,
        end: match ? parseInt(match[3]) : 5,
        // Runway 영상은 항상 5초 (파일명의 start-end는 원본 장면 시간)
        duration: 5,
      };
    })
    .sort((a, b) => a.index - b.index);

  return {
    folder: targetFolder,
    bucket,
    videos,
  };
}

/**
 * 가장 최근 폴더의 오디오 URL 조회
 */
export async function getLatestAudio(options) {
  const { bucket, credentialsPath, folderName } = options;

  const storage = getStorage(credentialsPath);

  let targetFolder = folderName;
  if (!targetFolder) {
    const folders = await listFolders({ bucket, credentialsPath });
    if (folders.length === 0) {
      throw new Error('No folders found in bucket');
    }
    targetFolder = folders[0];
  }

  const [files] = await storage.bucket(bucket).getFiles({
    prefix: `${targetFolder}/`,
  });

  const audioFile = files.find(f => f.name.endsWith('.mp3'));

  if (!audioFile) {
    return null;
  }

  return {
    folder: targetFolder,
    url: `https://storage.googleapis.com/${bucket}/${audioFile.name}`,
    filename: audioFile.name.split('/').pop(),
  };
}

/**
 * 가장 최근 폴더의 자막 조회
 */
export async function getLatestSubtitles(options) {
  const { bucket, credentialsPath, folderName } = options;

  const storage = getStorage(credentialsPath);

  let targetFolder = folderName;
  if (!targetFolder) {
    const folders = await listFolders({ bucket, credentialsPath });
    if (folders.length === 0) {
      throw new Error('No folders found in bucket');
    }
    targetFolder = folders[0];
  }

  const [files] = await storage.bucket(bucket).getFiles({
    prefix: `${targetFolder}/`,
  });

  const subtitleFile = files.find(f => f.name.endsWith('subtitles.json'));

  if (!subtitleFile) {
    return null;
  }

  const [content] = await subtitleFile.download();
  const data = JSON.parse(content.toString());

  return {
    folder: targetFolder,
    url: `https://storage.googleapis.com/${bucket}/${subtitleFile.name}`,
    subtitles: data.subtitles,
    fullText: data.full_text,
  };
}

export default {
  listFolders,
  getLatestImages,
  getLatestVideos,
  getLatestAudio,
  getLatestSubtitles,
};
