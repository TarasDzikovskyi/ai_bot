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


//Google 2FA
router.get('/2fa/setup', authMiddleware.verifyToken, authController.setup2FA);

router.post('/2fa/verify', authMiddleware.verifyToken, authController.verify2FA);

router.post('/2fa/validate', authMiddleware.verifyToken, authController.validate2FA);


module.exports = router;