const axios = require("axios");
const https = require('https');
const {data1C_auth, data1C_host} = require("../constants");
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

const connectTo1C = async (data) => {
    try {

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });

        const response = await axios.post(data1C_host, data,
            {
                // httpsAgent,
                headers: {
                    Authorization: `Basic ${Buffer.from(data1C_auth).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            })


        logger.info({status: response.status, data: response.data})
        return await response.data;

    } catch (e) {
        logger.error(e)
        logger.error(e.response?.data);
        logger.error(e.response?.status);
        return {status: 'NOT OK', code: e.status}
    }
}

module.exports.connectTo1C = connectTo1C;

const data = {
    "type": 'LCL_Settlement',
    "Origin": 'HONG KONG',
    "Destination": 'ODESSA',
    "Volume": '12',
    "Weight": '2000',
}

// connectTo1C(data)