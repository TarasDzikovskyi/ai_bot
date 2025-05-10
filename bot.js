/**
 * Main bot file that initializes and sets up the Telegram bot
 */

// Import configuration
const { bot, userState, dialogStates, sessionMap } = require('./config/bot.config');

// Import handlers
const { setupCommandHandlers } = require('./handlers/commandHandler');
const { setupMessageHandler } = require('./handlers/messageHandler');
const { setupCallbackQueryHandler } = require('./handlers/callbackQueryHandler');

// Set up command handlers
setupCommandHandlers(bot);

// Set up message handler
setupMessageHandler(bot, userState, dialogStates, sessionMap);

// Set up callback query handler
setupCallbackQueryHandler(bot, userState, dialogStates);

console.log('🤖 Bot is running...');