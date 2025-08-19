const router = require('express').Router();

const {calculatorController} = require('../controllers')
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware.verifyToken);
router.post('/price', calculatorController.getPrice);

router.post('/report', calculatorController.createReport);

router.get('/history', calculatorController.getHistory);


module.exports = router;
