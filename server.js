require('dotenv').config();
const express = require('express');
const { setupCommandHandlers } = require('./handlers/commandHandler');
const { setupMessageHandler } = require('./handlers/messageHandler');
const { setupCallbackQueryHandler } = require('./handlers/callbackQueryHandler');
const data1cRouter = require('./routes/data1C.router');
const {cron_job} = require('./services/cronjob.service')
const { rateLimit } = require('express-rate-limit');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8088;


const getClientKey = (req) => {
    const accessToken = req.cookies?.access_token;
    return accessToken || req.ip;
};


const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    keyGenerator: getClientKey,
    standardHeaders: 'draft-8',
    legacyHeaders: false,

    handler: (req, res) => {
        return res.status(429).json({ message: "Too many requests, please try again later." });
    }
})


const corsOptions = {
    origin: (origin, callback) => {
        console.log({origin});
        // if (constants.allowedCorsOrigins.includes(origin) || !origin) {
            callback(null, true);
        // } else {
        //     callback(new Error('Not allowed by CORS'));
        // }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization', 'x-refresh-token'],
    credentials: true,
};

app.use(limiter)
app.use(cors(corsOptions));


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
