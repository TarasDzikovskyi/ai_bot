const router = require('express').Router();
const data1cController = require('../controllers/data1C.controller');


router.post('/user/approve', data1cController.approveUser);

router.get('/ports', data1cController.getPorts);

// router.post('/price/calculation', data1cController.getPriceDelivery);

module.exports = router;
