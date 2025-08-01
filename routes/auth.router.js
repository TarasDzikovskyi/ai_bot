const router = require('express').Router();

const {authController} = require('../controllers');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/signup', authController.signup)

router.post('/signin', authController.signin)

router.post('/logout', authController.logout)

router.post('/forgot', authController.forgotPassword)

router.post('/reset', authController.resetPassword)

// router.post('/verify', authController.verifyUser)

router.post('/profile', authMiddleware.verifyToken, authController.getProfile)


module.exports = router;