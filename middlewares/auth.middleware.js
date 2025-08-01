const {jwtService} = require('../services');
const {log4js} = require('../utils/logger');
const logger = log4js.getLogger('ai-bot');

module.exports.verifyToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token )
        return res.status(401).json({ success: false, message: "Unauthorized - no token provided" });

    try {
        const decoded = await jwtService.verifyToken(token, 'access');

        if (!decoded)
            return res.status(401).json({ success: false, message: "Unauthorized - invalid token" });


        logger.info('Token verified');

        const {iat, exp, ...user } = decoded;

        req.userId = decoded.id;
        req.userMail = decoded.email;
        req.user = user;
        next();
    } catch (error) {
        next(error)
    }
};