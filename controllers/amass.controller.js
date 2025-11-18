const axios = require('axios');

const IS_PROD = false; // Змініть на true для продакшну
const AGENT_CODE = 'EURA00125';

const CONFIG = {
    url: IS_PROD
        ? 'https://www.amassfreight.com/overseaapi'
        : 'https://testwechat.amassfreight.com/overseasapi',
    username: process.env.AMASS_USER || 'BOXLINE UCL-API',
    password: process.env.AMASS_PASS || 'W3W9w5yaa7OLQK'
};


let cachedToken = null;
let tokenExpiration = 0;

const getValidToken = async () => {
    const now = Date.now();

    // Якщо токен є і він ще дійсний (з запасом 5 хвилин)
    if (cachedToken && now < tokenExpiration - 300000) {
        return cachedToken;
    }

    console.log('Amass API: Отримання нового токена...');

    try {
        const response = await axios.post(`${CONFIG.url}/login`, {
            username: CONFIG.username,
            password: CONFIG.password
        }); // [cite: 23, 30]

        const { errorcode, data } = response.data;

        if (errorcode === 0 && data) {
            cachedToken = data.token;
            // data.expire_in приходить в секундах (7200), переводимо в мс [cite: 32]
            tokenExpiration = now + (data.expire_in * 1000);
            return cachedToken;
        } else {
            throw new Error(`Login failed. Code: ${errorcode}`);
        }
    } catch (error) {
        console.error('Auth Error:', error.message);
        throw error;
    }
};


module.exports.getExwQuote = async (req, res, next) => {
    try {
        // 1. Валідація вхідних даних від клієнта (мінімально необхідні поля)
        const {
            podCode, num, weight, vol,
            province, city, district
        } = req.body;

        if (!podCode || !weight || !vol || !province || !city) {
            return res.status(400).json({
                error: 'Missing required fields: podCode, weight, vol, province, city are mandatory.'
            }); //
        }

        // 2. Отримуємо токен (кешований або новий)
        const token = await getValidToken();

        // 3. Формуємо тіло запиту згідно документації [cite: 12, 14]
        const requestPayload = {
            polCode: req.body.polCode || "", // Необов'язкове, API саме підбере порт на основі адреси
            podCode: podCode,                // Наприклад: "DEHAM"
            num: parseInt(num),              // Кількість місць (int)
            weight: parseFloat(weight),      // Вага (double)
            vol: parseFloat(vol),            // Об'єм (double)
            agent: AGENT_CODE,               // Обов'язково: EURA00125
            freightStation: req.body.freightStation || "",
            province: province,              // Адреса заводу
            city: city,
            district: district,
            town: req.body.town || null
        };

        // 4. Виконуємо запит на котирування
        // У документації не сказано прямо назву хедера, але зазвичай це 'token' або 'Authorization'
        // Виходячи з контексту старих SOAP/REST систем, пробуємо передати у хедері 'token' або в query.
        // Зазвичай для таких API Amass передає токен у хедері "token" або "Authorization".
        const response = await axios.post(
            `${CONFIG.url}/service/getPodQuotation`, // [cite: 3]
            requestPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'token': token // Передача токена
                }
            }
        );

        // 5. Обробка відповіді
        const { errorcode, data, nmRemark } = response.data; // [cite: 16]

        if (errorcode === 0) {
            return res.status(200).json({
                success: true,
                price: data.totalPrice,
                currency: data.podChargesCurrencyVoList?.[0]?.currency || 'USD',
                validUntil: data.validityTo,
                details: data.podChargesVoList,
                pickupInfo: data.pickupPriceInfo,
                pol: data.pickupPriceInfo?.pol, // Інформація про порт відправлення (Шанхай/Нінбо/тощо)
                remarks: data.nmRemark || nmRemark
            });
        } else if (errorcode === 10015 || errorcode === 10014) {
            // [cite: 16] Токен прострочено. Можна додати логіку retry, але для простоти повертаємо помилку 401
            // Наступний запит оновить токен автоматично.
            cachedToken = null;
            return res.status(401).json({ error: 'Token expired, please try again', code: errorcode });
        } else {
            return res.status(400).json({ error: 'Amass API Error', code: errorcode, raw: response.data });
        }
    } catch (e) {
        next(e);
    }
}