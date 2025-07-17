const JSONdb = require("simple-json-db");
const db = new JSONdb('people.json');
const {log4js} = require("../utils/logger");
const {normalizeTextWithFuzzyMatch, normalizeFromTo} = require("../utils/utils");
const {getPrompt} = require("../services/openai.service");
const {OpenAI} = require("openai");
const logger = log4js.getLogger('ai-bot');
const text_model = 'gpt-4o';


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


module.exports.getPriceDelivery = async (req, res, next) => {
    try {
        logger.info(req.body)
        const bot = req.bot;

        const {text, data} = req.body;

        if(!text && !data) return res.status(400).json({message: 'Bad request'});

        const cleanedText = normalizeTextWithFuzzyMatch(text);

        const prompt = getPrompt(cleanedText);

        const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});


        const gptResponse = await openai.chat.completions.create({
            model: text_model,
            messages: [{role: 'user', content: prompt}]
        });

        const replyGPT = gptResponse.choices[0].message.content.replace(/```json|```/g, '').trim();

        const cleanedParsed = normalizeFromTo(JSON.parse(replyGPT));

        res.status(200).json({message: 'ok'})
    } catch (e) {
        next(e)
    }
}
