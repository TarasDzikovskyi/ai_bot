require('dotenv').config();
const express = require('express');
const { setupCommandHandlers } = require('./handlers/commandHandler');
const { setupMessageHandler } = require('./handlers/messageHandler');
const { setupCallbackQueryHandler } = require('./handlers/callbackQueryHandler');
const data1cRouter = require('./routes/data1C.router');
const {cron_job} = require('./services/cronjob.service')

const app = express();
const port = process.env.PORT || 8088;

cron_job.start();

const { bot, userState, dialogStates, sessionMap } = require('./config/bot.config');

// Import handlers


// Set up command handlers
// setupCommandHandlers(bot);

// Set up message handler
setupMessageHandler(bot, userState, dialogStates, sessionMap);

// Set up callback query handler
setupCallbackQueryHandler(bot, userState, dialogStates);


app.use('/api/data1c', data1cRouter);

console.log('🤖 Bot is running...');

// Basic Express server setup
app.get('/', (req, res) => {
    res.send('Telegram Bot Server is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// /api/data1c/user/aprove
