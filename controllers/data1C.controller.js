const JSONdb = require("simple-json-db");
const db = new JSONdb('people.json');
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

module.exports.approveUser = async (req, res, next) => {
    try {
        logger.info(req.body)
        const bot = req.bot;

        const {status, access_allowed, user} = req.body;

        if(!status || !access_allowed || !user) return res.status(400).json({message: 'Bad request'});

        if(access_allowed){
            db.set(user.id, user);
            await bot.sendMessage(user.id, 'Особу підтверджено. Приємного користування. Натисніть в меню "Старт" для початку роботи.')
        } else {
            await bot.sendMessage(user.id, 'Доступ заборонено.')
        }

        res.status(200).json({message: 'ok'})
    } catch (e) {
        next(e)
    }
}
