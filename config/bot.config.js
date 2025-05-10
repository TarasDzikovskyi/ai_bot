require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');

// Initialize the bot with the token from environment variables
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create state maps
const userState = new Map();
const dialogStates = new Map();
const sessionMap = new Map();

module.exports = {
    bot,
    openai,
    userState,
    dialogStates,
    sessionMap
};