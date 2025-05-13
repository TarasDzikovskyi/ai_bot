const axios = require("axios");
const https = require('https');
const {data1C_auth, data1C_host} = require("../constants");


const connectTo1C = async (aiData) => {
    try {
        const data = {
            "type": 'LCL_Settlement',
            "Origin": aiData.from.value,
            "Destination": aiData.to.value,
            "Volume": aiData.volume.value.toString(),
            "Weight": aiData.weight.value.toString(),
        }

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false
        });

        const response = await axios.post(data1C_host, data,
            {
                httpsAgent,
                headers: {
                    Authorization: `Basic ${Buffer.from(data1C_auth).toString('base64')}`,
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

// connectTo1C(data)