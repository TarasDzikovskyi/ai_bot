require('dotenv').config();
const express = require('express');
// const { setupCommandHandlers } = require('./handlers/commandHandler');
const { setupMessageHandler } = require('./handlers/messageHandler');
const { setupCallbackQueryHandler } = require('./handlers/callbackQueryHandler');
const {data1CRouter, authRouter, calculatorRouter, amassRouter} = require('./routes');
const {cron_job} = require('./services/cronjob.service')
const { rateLimit } = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const expressFileUpload = require('express-fileupload');
const {log4js} = require("./utils/logger");
const logger = log4js.getLogger('ai-bot');
const {sequelize} = require('./database');

const app = express();
const {port, host} = require('./constants');


const getClientKey = (req) => {
    const accessToken = req.cookies?.access_token;
    return accessToken || req.ip;
};

async function db_connect() {
    try {
        await sequelize.authenticate();
        // await sequelize.sync({force: true});
        await sequelize.sync({alter: true});
        logger.info('Connected to DB successfully');
    } catch (error) {
        logger.error('Unable to connect to the database:', error);
    }
}

db_connect();


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
        logger.info({origin});
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
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(expressFileUpload());

cron_job.start();

const { bot, userState, dialogStates, sessionMap, botMiddleware, startBot } = require('./config/bot.config');

app.use(botMiddleware);

app.use('/api/auth', authRouter);
app.use('/api/data1c', data1CRouter);
app.use('/api/calculator', calculatorRouter);
app.use('/api/amass', amassRouter);



app.get('/', (req, res) => {
    res.send('Telegram Bot Server is running');
});

const startApp = async () => {
    try {
        await startBot();

        // await setupMessageHandler(bot(), userState, dialogStates, sessionMap);
        // await setupCallbackQueryHandler(bot(), userState, dialogStates, sessionMap);

        app.listen(port, host, () => {
            logger.info(`Server running on port ${port}`);
        });
    } catch (error) {
        logger.error('Failed to start app:', error);
        process.exit(1);
    }
};


startApp()
