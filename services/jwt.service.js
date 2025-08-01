const jwt = require('jsonwebtoken');
const util = require('util');
const {access_secret_key, action_secret_key, refresh_secret_key, access_time, action_time, refresh_time} = require('../constants');
const ErrorHandler = require('../error/ErrorHandler');
const {log4js} = require('../utils/logger');
const logger = log4js.getLogger('square');


const verifyPromise = util.promisify(jwt.verify);

module.exports = {
    generateActionToken: (payload) => {
        const action_token = jwt.sign(payload, action_secret_key, { expiresIn: action_time });

        return {
            action_token
        };
    },

    generateTokenPair: (payload) => {
        const access_token = jwt.sign(payload, access_secret_key, { expiresIn: access_time });
        const refresh_token = jwt.sign(payload, refresh_secret_key, { expiresIn: refresh_time });

        return {
            access_token,
            refresh_token
        };
    },

    verifyToken: async (token, tokenType = 'access') => {
        try {
            if (!token) {
                throw new ErrorHandler(401, 'Token is required');
            }

            let secret = '';

            switch (tokenType) {
                case 'access':
                    secret = access_secret_key;
                    break;
                case 'refresh':
                    secret = refresh_secret_key;
                    break;
                case 'action':
                    secret = action_secret_key;
                    break;
                default:
                    throw new ErrorHandler(400, 'Invalid token type');
            }

            return await verifyPromise(token, secret);

        } catch (e) {
            logger.error('Something wrong in jwt service ', e);
            if (e.name === 'TokenExpiredError') {
                throw new ErrorHandler(401, 'Token expired');
            }
            throw new ErrorHandler(401, 'Invalid token');
        }
    },
};
