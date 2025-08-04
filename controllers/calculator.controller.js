const {connectTo1C} = require("../services/data1C.service");
const {log4js} = require('../utils/logger');
const logger = log4js.getLogger('ai-bot');


module.exports.getPrice = async (req, res, next) => {
    try {
        const {from, to, weight, volume} = req.body;
        const userId = req.userId;


        const data = {
            "type": 'LCL_Settlement',
            "Origin": from,
            "Destination": to,
            "Volume": volume.toString(),
            "Weight": weight.toString(),
            "userId": '440063207'
        }

        const data1CResponse = await connectTo1C(data);


        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)
    } catch (e) {
        next(e);
    }
}


