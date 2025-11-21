const axios = require('axios');
const {calculateTotal} = require("../utils/utils");

const AGENT_CODE = 'EURA00125';

const CONFIG = {
    url: 'https://www.amassfreight.com/overseaapi',
    username: 'BOXLINE UCL-API'.trim(),
    password: 'W3W9w5yaa7OLQK'.trim()
};


let cachedToken = null;
let tokenExpiration = 0;

const getValidToken = async () => {
    const now = Date.now();
    if (cachedToken && now < tokenExpiration - 300000) {
        return cachedToken;
    }

    console.log(`Amass API: Отримання нового токена...`);

    const params = new URLSearchParams();
    params.append('username', CONFIG.username);
    params.append('password', CONFIG.password);

    try {
        const response = await axios.post(
            `${CONFIG.url}/login`,
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        );

        const { errorcode, data } = response.data;

        if (errorcode === 0 && data) {
            cachedToken = data.token;
            tokenExpiration = now + (data.expire_in * 1000);
            console.log('Amass API: Токен успішно отримано.');
            return cachedToken;
        } else {
            throw new Error(`Login failed. Code: ${errorcode}. Response: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error('Auth Error:', error.message);
        throw error;
    }
};

module.exports.getExwQuote = async (req, res, next) => {
    try {
        const token = await getValidToken();

        const requestPayload = {
            polCode: 'CNSHA',
            podCode: podCode,
            num: 3,
            weight: 200,
            vol: 2,
            agent: AGENT_CODE,
            freightStation: '',
            province: 'ShanghaiCity',
            city: 'ShanghaiCity',
            district: 'PudongXinqu',
            town: null
        };

        console.log(requestPayload)

        const response = await axios.post(
            `${CONFIG.url}/service/getPodQuotation`,
            requestPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                }
            }
        );

        const { errorcode, data } = response.data;

        if(errorcode !== 0) return res.status(400).json({message: 'Bad request'});

        const totalPrice = calculateTotal(data)

        res.status(200).json(totalPrice);
    } catch (e) {
        next(e);
    }
}