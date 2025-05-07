const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    data1C_host: process.env.DATA1C_HOST || '',
    data1C_auth: process.env.DATA1C_AUTH || ''
}