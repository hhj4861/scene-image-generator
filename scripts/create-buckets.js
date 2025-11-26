import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentialsPath = path.join(__dirname, '../google-credentials.json');
const storage = new Storage({ keyFilename: credentialsPath });

const PROJECT_ID = 'mcp-test-457809';
const REGION = 'asia-northeast3'; // 서울

const BUCKETS = [
  {
    name: 'shorts-videos-storage-mcp-test-457809',
    purpose: 'shorts-videos',
  },
  {
    name: 'shorts-audio-storage-mcp-test-457809',
    purpose: 'shorts-audio',
  },
];

async function createBucket(bucketName, purpose) {
  try {
    // 버킷 존재 확인
    const [exists] = await storage.bucket(bucketName).exists();

    if (exists) {
      console.log(`✓ Bucket already exists: ${bucketName}`);
      return;
    }

    // 버킷 생성
    const [bucket] = await storage.createBucket(bucketName, {
      location: REGION,
      storageClass: 'STANDARD',
      uniformBucketLevelAccess: {
        enabled: true,
      },
      labels: {
        environment: 'production',
        purpose: purpose,
      },
      cors: [
        {
          origin: ['*'],
          method: ['GET', 'HEAD'],
          responseHeader: ['Content-Type', 'Content-Range'],
          maxAgeSeconds: 3600,
        },
      ],
      lifecycle: {
        rule: [
          {
            action: {
              type: 'SetStorageClass',
              storageClass: 'NEARLINE',
            },
            condition: {
              age: 60,
            },
          },
        ],
      },
    });

    console.log(`✓ Created bucket: ${bucketName}`);

    // 공개 읽기 권한 설정
    await bucket.iam.setPolicy({
      bindings: [
        {
          role: 'roles/storage.objectViewer',
          members: ['allUsers'],
        },
        {
          role: 'roles/storage.objectAdmin',
          members: [`serviceAccount:mcp-test@${PROJECT_ID}.iam.gserviceaccount.com`],
        },
      ],
    });

    console.log(`  - Set public read access and service account permissions`);

  } catch (error) {
    console.error(`✗ Error creating ${bucketName}:`, error.message);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('Creating GCS Buckets');
  console.log('========================================\n');

  for (const bucket of BUCKETS) {
    await createBucket(bucket.name, bucket.purpose);
  }

  console.log('\n========================================');
  console.log('Done!');
  console.log('========================================\n');

  // 결과 URL 출력
  console.log('Bucket URLs:');
  for (const bucket of BUCKETS) {
    console.log(`  - https://storage.googleapis.com/${bucket.name}`);
  }
}

main().catch(console.error);
