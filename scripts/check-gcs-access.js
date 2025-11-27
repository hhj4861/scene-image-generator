import { Storage } from '@google-cloud/storage';
import https from 'https';

const storage = new Storage({ keyFilename: './google-credentials.json' });
const bucket = storage.bucket('scene-image-generator-storage-mcp-test-457809');

async function checkAndFix() {
  // 1. 현재 IAM 정책 확인
  const [policy] = await bucket.iam.getPolicy();
  console.log('Current IAM Policy:');
  console.log(JSON.stringify(policy.bindings, null, 2));

  // 2. allUsers가 있는지 확인
  const hasPublicAccess = policy.bindings && policy.bindings.some(b =>
    b.role === 'roles/storage.objectViewer' && b.members && b.members.includes('allUsers')
  );

  console.log('\nPublic access (allUsers):', hasPublicAccess ? 'YES' : 'NO');

  if (!hasPublicAccess) {
    console.log('\nAdding public access...');
    policy.bindings = policy.bindings || [];
    policy.bindings.push({
      role: 'roles/storage.objectViewer',
      members: ['allUsers'],
    });
    await bucket.iam.setPolicy(policy);
    console.log('Public access added!');

    // 재확인
    const [newPolicy] = await bucket.iam.getPolicy();
    console.log('\nUpdated IAM Policy:');
    console.log(JSON.stringify(newPolicy.bindings, null, 2));
  }

  // 3. 최근 이미지 URL 테스트
  console.log('\n--- Testing URL Access ---');
  const [files] = await bucket.getFiles({ maxResults: 50 });
  const imageFiles = files.filter(f => f.name.endsWith('.png'));

  console.log(`Found ${imageFiles.length} PNG files`);

  if (imageFiles.length > 0) {
    // 가장 최근 이미지 테스트
    const testFile = imageFiles[imageFiles.length - 1];
    const testUrl = `https://storage.googleapis.com/scene-image-generator-storage-mcp-test-457809/${testFile.name}`;
    console.log('\nTest URL:', testUrl);

    return new Promise((resolve) => {
      https.get(testUrl, (res) => {
        console.log('HTTP Status:', res.statusCode);
        console.log('Content-Type:', res.headers['content-type']);
        resolve();
      }).on('error', (e) => {
        console.log('Error:', e.message);
        resolve();
      });
    });
  }
}

checkAndFix().catch(console.error);
