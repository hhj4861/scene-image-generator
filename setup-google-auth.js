/**
 * Google Drive OAuth 설정 헬퍼
 *
 * 사용법:
 * 1. Google Cloud Console (https://console.cloud.google.com) 접속
 * 2. 새 프로젝트 생성 또는 기존 프로젝트 선택
 * 3. APIs & Services > Library에서 "Google Drive API" 활성화
 * 4. APIs & Services > Credentials에서 "OAuth 2.0 Client ID" 생성
 *    - Application type: Desktop app
 *    - 생성 후 Client ID와 Client Secret 복사
 * 5. .env 파일에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET 추가
 * 6. 이 스크립트 실행: node setup-google-auth.js
 * 7. 브라우저에서 Google 로그인 후 권한 승인
 * 8. 출력된 REFRESH_TOKEN을 .env 파일에 추가
 */

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';
import open from 'open';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

async function getRefreshToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('='.repeat(60));
    console.log('Google Drive OAuth 설정 가이드');
    console.log('='.repeat(60));
    console.log(`
1. Google Cloud Console 접속: https://console.cloud.google.com

2. 프로젝트 생성/선택 후 다음 단계 수행:
   - APIs & Services > Library > "Google Drive API" 검색 후 활성화
   - APIs & Services > Credentials > "+ CREATE CREDENTIALS" > "OAuth client ID"
   - Application type: "Desktop app" 선택
   - 생성 후 Client ID와 Client Secret 복사

3. .env 파일에 추가:
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here

4. 다시 이 스크립트 실행:
   node setup-google-auth.js
`);
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('='.repeat(60));
  console.log('Google Drive OAuth 인증');
  console.log('='.repeat(60));
  console.log('\n브라우저에서 Google 로그인 페이지가 열립니다...\n');

  // 로컬 서버로 콜백 받기
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:3000`);

        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');

          if (code) {
            const { tokens } = await oauth2Client.getToken(code);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: Arial; padding: 40px; text-align: center;">
                  <h1>✅ 인증 성공!</h1>
                  <p>이 창을 닫고 터미널을 확인하세요.</p>
                </body>
              </html>
            `);

            server.close();

            console.log('\n✅ 인증 성공!\n');
            console.log('='.repeat(60));
            console.log('.env 파일에 다음 내용을 추가하세요:');
            console.log('='.repeat(60));
            console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

            console.log('(선택) 특정 폴더에 업로드하려면 폴더 ID도 추가:');
            console.log('GOOGLE_DRIVE_FOLDER_ID=your_folder_id\n');
            console.log('폴더 ID는 Google Drive 폴더 URL에서 확인:');
            console.log('https://drive.google.com/drive/folders/FOLDER_ID_HERE\n');

            resolve(tokens.refresh_token);
          } else {
            res.writeHead(400);
            res.end('인증 코드가 없습니다.');
            reject(new Error('No code received'));
          }
        }
      } catch (error) {
        res.writeHead(500);
        res.end('인증 오류');
        reject(error);
      }
    });

    server.listen(3000, async () => {
      console.log('인증 서버 시작됨 (http://localhost:3000)');

      // 브라우저 열기 시도
      try {
        await open(authUrl);
      } catch {
        console.log('\n브라우저가 자동으로 열리지 않으면 아래 URL을 직접 열어주세요:\n');
        console.log(authUrl + '\n');
      }
    });

    // 3분 후 타임아웃
    setTimeout(() => {
      server.close();
      reject(new Error('인증 시간 초과 (3분)'));
    }, 180000);
  });
}

getRefreshToken().catch(console.error);
