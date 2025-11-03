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
            "userId": userId
        }

        const data1CResponse = await connectTo1C(data);
        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)
    } catch (e) {
        next(e);
    }
}


module.exports.createReport = async (req, res, next) => {
    try {
        const {from, to, weight, volume, variant_price} = req.body;
        const userId = req.userId;

        const data = {
            type: "Create_Report",
            "Origin": from,
            "Destination": to,
            "Volume": volume.toString(),
            "Weight": weight.toString(),
            variant_price: variant_price,
            userId: userId
        }

        const data1CResponse = await connectTo1C(data);
        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)
    } catch (e) {
        next(e);
    }
}


module.exports.sendContact = async (req, res, next) => {
    try {
        const {doc_id, doc_num, contact_msg} = req.body;
        const userId = req.userId;

        const data = {
            type: "Send_Contact",
            doc_id,
            doc_num,
            user: userId,
            contact_msg
        }

        const data1CResponse = await connectTo1C(data);
        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)
    } catch (e) {
        next(e);
    }
}


module.exports.getHistory = async (req, res, next) => {
    try {
        const userId = req.userId;

        const data = {
            "type": "History_calculation",
            "user": {
                "id": userId
            }
        }

        const data1CResponse = await connectTo1C(data);


        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)
    } catch (e) {
        next(e);
    }
}


module.exports.checkFCA = async (req, res, next) => {
    try {

        const {port} = req.body;

        const data = {
            "type": "FCA_Check",
            "Origin": port
        }

        const data1CResponse = await connectTo1C(data);

        logger.info(data1CResponse)

        res.status(200).json(data1CResponse)

    } catch (e) {
        next(e);
    }
}


