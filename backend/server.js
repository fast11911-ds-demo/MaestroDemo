const jwt = require('jsonwebtoken');
const axios = require('axios');

// 환경 변수에서 안전하게 불러옵니다. (.env 파일 활용 권장)
const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY; 
const USER_ID = process.env.DOCUSIGN_USER_ID; 
const RSA_PRIVATE_KEY = process.env.DOCUSIGN_RSA_PRIVATE_KEY; 
// 개발(Demo) 환경은 account-d.docusign.com, 운영 환경은 account.docusign.com 입니다.
const OAUTH_BASE_PATH = 'account-d.docusign.com'; 

/**
 * DocuSign 서버와 통신하여 유효한 Access Token을 받아오는 함수
 */
async function getDocuSignAccessToken() {
    // 1. JWT Payload 작성 (만료 시간 설정)
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 토큰 만료 시간 (1시간)

    const payload = {
        iss: INTEGRATION_KEY,
        sub: USER_ID,
        aud: OAUTH_BASE_PATH,
        iat: now,
        exp: now + expiresIn,
        // Maestro 워크플로우를 실행하기 위해 필요한 권한(scope)을 명시합니다.
        scope: 'signature impersonation' 
    };

    // 2. RSA Private Key로 JWT를 암호화하여 서명(Sign)
    const signedToken = jwt.sign(payload, RSA_PRIVATE_KEY, { algorithm: 'RS256' });

    // 3. 서명된 JWT를 DocuSign Auth 서버로 전송하여 Access Token 요청
    try {
        const response = await axios.post(
            `https://${OAUTH_BASE_PATH}/oauth/token`,
            `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                }
            }
        );

        console.log("✅ Access Token 발급 성공!");
        return response.data.access_token;

    } catch (error) {
        console.error("❌ JWT 인증 실패:", error.response ? error.response.data : error.message);
        throw new Error('DocuSign 인증 실패');
    }
}
