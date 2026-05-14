const axios = require('axios');
const jwt = require('jsonwebtoken');

// 1. DocuSign JWT Token 발급 함수 (이전과 동일)
async function getDocuSignAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; 

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
        return response.data.access_token;
    } catch (error) {
        console.error("JWT Error:", error.response?.data || error.message);
        throw new Error('Authentication Failed');
    }
}

// 2. Vercel Serverless Function 메인 핸들러
module.exports = async (req, res) => {
    // POST 요청만 허용
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
};
