const JSONdb = require("simple-json-db");
const db = new JSONdb('people.json');


module.exports.approveUser = async (req, res, next) => {
    try {
        console.log(req.body)
        const bot = req.bot;

        // db.set(person.id, person);
        // await bot.sendMessage(chatId, 'Особу підтверджено. Приємного користування. Натисніть в меню "Старт" для початку роботи.')

        res.status(200).json({message: 'ok'})
    } catch (e) {
        next(e)
    }
}
