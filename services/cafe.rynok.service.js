const {log4js} = require('../utils/logger');
const axios = require("axios");
const {cafe_path} = require('../constants')
const logger = log4js.getLogger('ai-bot');


module.exports.connectToCafe = async (data) => {
    try {
        const res = await axios.post(cafe_path, data, {
            headers: {
                'Content-Type': 'application/json',
            }
        });

        logger.info(res)

        return res.data;
    } catch (e) {
        logger.error(e);
        return null;
    }
}
