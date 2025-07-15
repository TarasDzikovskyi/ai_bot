require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const {setupMessageHandler, } = require('../handlers/messageHandler')
const {setupCallbackQueryHandler} = require('../handlers/callbackQueryHandler')
const {log4js} = require("../utils/logger");
const logger = log4js.getLogger('ai-bot');

let bot = null;
// Initialize the bot with the token from environment variables
// const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create state maps
const userState = new Map();
const dialogStates = new Map();
const sessionMap = new Map();
const data1CMap = new Map();
const dataArticle1CMap = new Map();


const startBot = async () => {
    try {
        logger.info('🤖 Bot is running...');


        if (bot) {
            bot.removeAllListeners();
            try {
                await bot.stopPolling();
                logger.info('Previous bot instance stopped');
            } catch (err) {
                logger.error('No active polling to stop');
            }
        }


        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });


        await new Promise(resolve => setTimeout(resolve, 1000));


        await setupMessageHandler(bot, userState, dialogStates, sessionMap, data1CMap, dataArticle1CMap);
        await setupCallbackQueryHandler(bot, userState, dialogStates, sessionMap, data1CMap, dataArticle1CMap);


        bot.on('polling_error', async (e) => {
            logger.error('Polling error:', e);
            await bot.sendMessage(440063207, `Polling error: ${JSON.stringify(e)}`);
            await restartBot();
        });

        bot.on('webhook_error', async (e) => {
            logger.error('Webhook error:', e);
            await bot.sendMessage(440063207, `Webhook error: ${JSON.stringify(e)}`);
        });

        await bot.startPolling();
        logger.info('Bot started successfully and is polling for messages');

    } catch (e) {
        logger.error('Error starting bot:', e);
        await bot.sendMessage(440063207, `Start bot error: ${JSON.stringify(e)}`);
        await restartBot();
    }
};


async function restartBot() {
    try {
        logger.info('Restarting bot...');

        // Clean up current instance
        if (bot) {
            bot.removeAllListeners();
            try {
                await bot.stopPolling();
                logger.info('Bot polling stopped');
            } catch (err) {
                logger.error('Error stopping polling:', err);
            }
        }

        // Clear state if needed (optional)
        // userState.clear();
        // dialogStates.clear();
        // sessionMap.clear();

        // Wait before restart
        logger.info('Waiting 10 seconds before restart...');
        setTimeout(() => {
            startBot().catch((err) => {
                logger.error('Error restarting bot:', err);
                // Try again after another delay if restart fails
                setTimeout(() => startBot().catch(console.error), 10000);
            });
        }, 10000);

    } catch (err) {
        logger.error('Error in restart function:', err);
        // Fallback restart attempt
        setTimeout(() => startBot().catch(console.error), 15000);
    }
}


const getBot = () => {
    if (!bot) {
        throw new Error('Bot is not initialized. Call start_bot() first.');
    }
    return bot;
};


const botMiddleware = (req, res, next) => {
    try {
        req.bot = getBot();
        next();
    } catch (error) {
        logger.error('Bot middleware error:', error);
        res.status(500).json({ error: 'Bot not available' });
    }
};

module.exports = {
    bot: getBot,
    openai,
    userState,
    dialogStates,
    sessionMap,
    botMiddleware,
    startBot,
    data1CMap,
    restartBot,
};