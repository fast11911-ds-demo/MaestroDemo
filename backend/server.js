require('dotenv').config(); // .env 파일 읽기
const express = require('express');
const cors = require('cors'); // 프론트엔드 통신 허용
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors()); // 프론트엔드(GitHub Pages 등)의 접근을 허용

// 환경 변수 설정
const {
    DOCUSIGN_INTEGRATION_KEY,
    DOCUSIGN_USER_ID,
    DOCUSIGN_RSA_PRIVATE_KEY,
    DOCUSIGN_ACCOUNT_ID,
    MAESTRO_WORKFLOW_ID
} = process.env;

const OAUTH_BASE_PATH = 'account-d.docusign.com'; // 개발(Demo) 환경

// 1. DocuSign JWT Token 발급 함수
async function getDocuSignAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; 

    const payload = {
        iss: DOCUSIGN_INTEGRATION_KEY,
        sub: DOCUSIGN_USER_ID,
        aud: OAUTH_BASE_PATH,
        iat: now,
        exp: now + expiresIn,
        scope: 'signature impersonation' 
    };

    // 개행 문자(\n)가 .env에서 올바르게 읽히도록 처리
    const privateKey = DOCUSIGN_RSA_PRIVATE_KEY.replace(/\\n/g, '\n');

    const signedToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    try {
        const response = await axios.post(
            `https://${OAUTH_BASE_PATH}/oauth/token`,
            `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return response.data.access_token;
    } catch (error) {
        console.error("JWT Error:", error.response?.data || error.message);
        throw new Error('Authentication Failed');
    }
}

// 2. Maestro API 트리거 라우트
app.post('/trigger-onboarding', async (req, res) => {
    const { firstName, lastName, propertyName, email } = req.body;

    try {
        // [STEP A] 토큰 동적 발급
        const accessToken = await getDocuSignAccessToken(); 

        // [STEP B] Maestro 호출 데이터 맵핑
        const maestroPayload = {
            instanceName: `Onboarding - ${propertyName}`,
            payload: {
                "SignerEmail": email,
                "SignerName": `${firstName} ${lastName}`,
                "PropertyName": propertyName
            }
        };

        const docusignUrl = `https://demo.docusign.net/restapi/v1/accounts/${DOCUSIGN_ACCOUNT_ID}/workflows/${MAESTRO_WORKFLOW_ID}/instances`;

        // [STEP C] Maestro API 호출
        const maestroResponse = await axios.post(docusignUrl, maestroPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json({ message: 'Workflow Triggered Successfully', data: maestroResponse.data });

    } catch (error) {
        console.error('Maestro API Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to process application' });
    }
});

// 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SH Corp Backend is running on port ${PORT}`));
