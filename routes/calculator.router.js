const router = require('express').Router();

const {calculatorController} = require('../controllers')
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware.verifyToken);
router.post('/price', calculatorController.getPrice);


module.exports = router;
