const bcrypt = require('bcrypt')
const {User, OAuth, OAuthAction, GAuth} = require('../database/models');
const {jwtService, emailService} = require('../services');
const {sequelize} = require("../database");
const {log4js} = require('../utils/logger');
const {connectTo1C} = require("../services/data1C.service");
const logger = log4js.getLogger('ai-bot');
const speakeasy = require('speakeasy');


module.exports.signup = async (req, res, next) => {
    try {
        console.log(req.body);
        const { name, surname, email, phone_number, password } = req.body;
        logger.info('Try to sign up with email ' + email);


        if (!name || !surname || !email || !phone_number || !password) {
            logger.warn('All fields are required');
            return res.status(404).json({ message: 'Please fill in all fields' })
        }

        if (await User.findOne({ where: {email} })) {
            logger.warn('Email already exists');
            return res.status(409).json({ message: 'Email already exists' })
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            surname,
            email,
            phone_number,
            password: hashedPassword,
        });

        const plainUser = newUser.get({ plain: true });

        const { password: userPassword, ...user } = plainUser;

        const payload = {
            id: plainUser.id,
            email: email,
            name: name,
            phone_number,
            surname: surname,
            is_approved: user.is_approved,
            enable_2fa: false,
        }

        const user1CData = {
            "type": "LCL_SetUser",
            "service": "web",
            "user": {
                id: plainUser.id,
                name: `${name} ${surname}`,
                phone_number,
            }
        }

        await connectTo1C(user1CData);

        const tokenPair = jwtService.generateTokenPair(payload);

        await OAuth.create({...tokenPair, user: plainUser.id});

        res.setHeader('Authorization', `Bearer ${tokenPair.access_token}`);
        res.setHeader('x-refresh-token', tokenPair.refresh_token);
        logger.info(`User ${email} has been created successfully.`);

        res.status(201).json({user, token: tokenPair.access_token});
    } catch (e) {
        next(e)
    }
}


module.exports.signin = async (req, res, next) => {
    try {
        const { email, password } = req.body
        logger.info('Try to sign in with email ', email);

        if (!email || !password) {
            return res.status(422).json({ message: 'Please fill in all fields' })
        }

        const foundedUser = await User.findOne({where: { email }, raw: true, nest: true});

        if (!foundedUser) {
            logger.warn(`User ${email} does not exist`);
            return res.status(404).json({ message: 'Email or password is invalid' })
        }

        const passwordMatch = await bcrypt.compare(password, foundedUser.password)


        if (!passwordMatch) {
            logger.warn('Wrong email or password match');
            return res.status(401).json({ message: 'Email or password is invalid' })
        }

        const user1CData = {
            "type": "LCL_SetUser",
            "service": "web",
            "user": {
                id: foundedUser.id,
                name: `${foundedUser.name} ${foundedUser.surname}`,
                phone_number: foundedUser.phone_number,
            }
        }

        const result1C = await connectTo1C(user1CData);

        console.log('=======================================')
        console.log(result1C)
        console.log('=======================================')


        const payload = {
            id: foundedUser.id,
            email: email,
            phone_number: foundedUser.phone_number,
            name: foundedUser.name,
            surname: foundedUser.surname,
            is_approved: result1C.status === 'ok' ? result1C.access_allowed : foundedUser.is_approved,
            enable_2fa: foundedUser.enable_2fa,
        }

        logger.info('Is approved: ', foundedUser.is_approved);
        logger.info('Is payload approved: ', payload.is_approved);

        if(result1C.status === 'ok' && !foundedUser.is_approved) {
            foundedUser.is_approved = result1C.access_allowed;

            await User.update({
                is_approved: result1C.access_allowed
            }, {
                where: { id: foundedUser.id }
            })
        }

        const tokenPair = jwtService.generateTokenPair(payload);

        const transaction = await sequelize.transaction();

        await OAuth.destroy({
            where: { user: foundedUser.id },
            transaction
        });

        await OAuth.create({...tokenPair, user: foundedUser.id}, {transaction});

        await transaction.commit();

        const { password: userPassword, ...user } = foundedUser;


        res.setHeader('Authorization', `Bearer ${tokenPair.access_token}`);
        res.setHeader('x-refresh-token', tokenPair.refresh_token);

        res.status(200).json({user, token: tokenPair.access_token});
    } catch (e) {
        next(e)
    }
}


module.exports.logout = async (req, res, next) => {
    try {
        // const token = req.cookies.access_token;
        logger.info('Logged out...');
        const token = req.headers['authorization']?.split(' ')[1];

        if(!token) return res.status(401).json({ message: 'No token provided' })

        await OAuth.destroy({where: {access_token: token}});

        // await cookieService.removeCookies(res);
        res.status(200).json('User is logout');
    } catch (e) {
        next(e);
    }
}


module.exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        logger.info('Forgot password for email ', email);

        if(!email) {
            logger.warn('All fields are required');
            return res.status(422).json({ message: 'Please fill in all fields' })
        }

        const foundedUser = await User.findOne({ where: {email}, raw: true, nest: true });

        if (!foundedUser) {
            logger.warn('User not found for email ', email);
            return res.status(404).json({ message: 'Email or password is invalid' })
        }

        const payload = {
            userId: foundedUser.id,
            email: email,
            phone_number: foundedUser.phone_number,
        }

        const actionToken = jwtService.generateActionToken(payload);

        await OAuthAction.create({...actionToken, user: foundedUser.id});

        const {name, surname} = foundedUser;

        logger.info('Try to send email for email ', email);

        // await emailService.sendMail(
        //     email,
        //     'FORGOT',
        //     {email: email, userName: `${name} ${surname}`, actionToken: actionToken.action_token}
        // )

        res.status(200).json('Email sent');
    } catch (e) {
        next(e)
    }
}


module.exports.resetPassword = async (req, res, next) => {
    try {
        logger.info('Try to reset password...');
        const {action_token, password, isAuth} = req.body;

        if (!action_token || !password) {
            return res.status(422).json({message: 'Please fill in all fields'})
        }

        let token

        if (isAuth)
            token = await OAuth.findOne({where: {access_token: action_token}, raw: true, nest: true});
        else
            token = await OAuthAction.findOne({where: {action_token}, raw: true, nest: true});


        if (!token) {
            logger.warn('Token not found');
            return res.status(404).json({ message: 'Token not found' })
        }

        let decoded

        if(isAuth)
            decoded = await jwtService.verifyToken(token.access_token, 'access');
        else
            decoded = await jwtService.verifyToken(token.action_token, 'action');

        if (!decoded) {
            logger.warn('Token expired');
            return res.status(401).json({ message: 'Token expired' })
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.update({password: hashedPassword}, {where: {id: token.user}});

        await OAuthAction.destroy({where: {id: token.user}});
        await OAuth.destroy({where: {id: token.user}});

        //maybe send email about update password

        res.status(200).json('Password changed');
    } catch (e) {
        next(e)
    }
}


module.exports.getProfile = async (req, res, next) => {
    try {
        const id = req.userId;

        const foundedUser = await User.findOne({
            where: { id },
            raw: true,
            nest: true,
            include: [
                {
                    model: OAuth,
                    as: 'oauth',
                    attributes: ['access_token', 'refresh_token'],
                }
            ]
        });

        if (!foundedUser) {
            logger.warn('No user found')
            return res.status(404).json({ message: 'Email or password is invalid' })
        }

        const { password, oauth, updatedAt, ...user } = foundedUser;

        logger.info(user);

        res.status(200).json(user);
    } catch (e) {
        next(e)
    }
}


module.exports.setup2FA = async (req, res, next) => {
    try {
        const userId = req.userId;
        logger.info('Try to setup 2FA ');
        const temp_secret = speakeasy.generateSecret({
            name: 'BoxLine-Calculator',
        })

        const [gAuth, created] = await GAuth.findOrCreate({
            where: { user: userId },
            defaults: {
                token: temp_secret.base32,
                data: temp_secret,
            },
        });

        console.log(created)
        console.log(gAuth)
        console.log(gAuth.data)

        if(created) {
            res.status(200).json({secret: temp_secret.otpauth_url, token: temp_secret.base32});
        } else {
            res.status(200).json({secret: gAuth.data.otpauth_ur, token: gAuth.data.base32l});
        }
    } catch (e) {
        next(e)
    }
}


module.exports.verify2FA = async (req, res, next) => {
    try {
        const userId = req.userId;
        const {token} = req.body;

        logger.info('Try to verify 2FA ');

        const gauth = await GAuth.findOne({where: {user: userId}, raw: true, nest: true});

        if(!gauth){
            logger.warn('No 2FA found');
            return res.status(404).json({message: 'No 2FA found'})
        }

        const verified = speakeasy.totp.verify({
            secret: gauth.token,
            encoding: 'base32',
            token
        });

        if (verified) {
            await User.update({
                enable_2fa: true
            }, {
                where: { id: userId },
            })

            const user = await User.findByPk(userId, {raw: true, nest: true});

            const { password, ...filteredUser } = user;

            const oauthToken = jwtService.generateTokenPair(filteredUser)

            await OAuth.update({
                access_token: oauthToken.access_token
            }, {
                where: { user: userId },
            })

            res.status(200).json({verified: true, user: filteredUser, token: oauthToken.access_token})
        } else {
            res.status(200).json({verified: false})
        }
    } catch (e) {
        next(e)
    }
}


module.exports.validate2FA = async (req, res, next) => {
    try {
        const userId = req.userId;

        logger.info('Try to validate 2FA ');

        const gauth = await GAuth.findOne({where: {user: userId}, raw: true, nest: true})

        if(!gauth){
            logger.warn('No 2FA found')
            return res.status(404).json({message: 'No 2FA found'})
        }

        const {token} = req.body;

        const tokenValidates = speakeasy.totp.verify({
            secret: gauth.token,
            encoding: 'base32',
            token,
            window: 1
        });

        if (tokenValidates) {
            res.status(200).json({validated: true})
        } else {
            res.status(200).json({validated: false})
        }
    } catch (e) {
        next(e)
    }
}


// module.exports.verifyUser = async (req, res, next) => {
//     try {
//         const {code, email, name} = req.body;
//         logger.info('Try to verify user with email ', email);
//
//         await emailService.sendMail(
//             email,
//             'VERIFY',
//             {userName: name, code: code}
//         )
//
//         res.status(200).json('Email sent');
//     } catch (e) {
//         next(e)
//     }
// }


