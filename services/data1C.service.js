const axios = require("axios");
const https = require('https');
const {data1C_auth, data1C_host} = require("../constants");


const connectTo1C = async (data) => {
    try {
        const httpAgent = new https.Agent({
            rejectUnauthorized: false
        });

        const response = await axios.post('https://app.euro-forwarding.com/v8line/hs/ExchangeServices', data,
            {
                httpAgent,
                headers: {
                    Authorization: `Basic ${Buffer.from('ExchangeServices:c8sMEeqLvHhWEZ').toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            })


        console.log({status: response.status, data: response.data})
        return await response.data;

    } catch (e) {
        console.log(e)
        console.log(e.response?.data);
        console.log(e.response?.status);
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

connectTo1C(data)