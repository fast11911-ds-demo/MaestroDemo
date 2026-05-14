const axios = require('axios');
const jwt = require('jsonwebtoken');

async function getDocuSignAccessToken() {
    console.log("[DEBUG 1] JWT 인증 시작...");
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; 

    // 환경 변수 누락 체크
    if (!process.env.DOCUSIGN_RSA_PRIVATE_KEY || !process.env.DOCUSIGN_INTEGRATION_KEY) {
        throw new Error("환경 변수(Environment Variables)가 Vercel에 제대로 설정되지 않았습니다.");
    }

    const payload = {
        iss: process.env.DOCUSIGN_INTEGRATION_KEY,
        sub: process.env.DOCUSIGN_USER_ID,
        aud: 'account-d.docusign.com',
        iat: now,
        exp: now + expiresIn,
        scope: 'signature impersonation' 
    };

    const privateKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
    const signedToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    try {
        const response = await axios.post(
            `https://account-d.docusign.com/oauth/token`,
            `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        console.log("[DEBUG 2] JWT 토큰 발급 성공!");
        return response.data.access_token;
    } catch (error) {
        console.error("[ERROR] JWT Auth 실패:", error.response?.data || error.message);
        // 에러 상세 내용을 강제로 던짐
        throw new Error(`DocuSign Auth Error: ${JSON.stringify(error.response?.data || error.message)}`);
    }
}

module.exports = async (req, res) => {
    console.log("[DEBUG 0] API 호출 받음. Request Body:", req.body);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { firstName, lastName, propertyName, email } = req.body;

    try {
        const accessToken = await getDocuSignAccessToken(); 

        const maestroPayload = {
            instanceName: `Onboarding - ${propertyName}`,
            payload: {
                "SignerEmail": email,
                "SignerName": `${firstName} ${lastName}`,
                "PropertyName": propertyName
            }
        };

        const docusignUrl = `https://demo.docusign.net/restapi/v1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/workflows/${process.env.MAESTRO_WORKFLOW_ID}/instances`;
        
        console.log(`[DEBUG 3] Maestro API 호출 중... URL: ${docusignUrl}`);

        const maestroResponse = await axios.post(docusignUrl, maestroPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("[DEBUG 4] Maestro Workflow 트리거 성공!");
        res.status(200).json({ message: 'Workflow Triggered Successfully', data: maestroResponse.data });

    } catch (error) {
        console.error('[ERROR] 서버 실행 중 오류 발생:', error.response?.data || error.message || error);
        
        // 프론트엔드로 상세 에러 내용을 JSON으로 응답
        res.status(500).json({ 
            error: 'Failed to process application', 
            details: error.response?.data || error.message || String(error)
        });
    }
};
