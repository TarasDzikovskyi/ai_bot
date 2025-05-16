const router = require('express').Router();
const data1cController = require('../controllers/data1C.controller');


router.post('/user/approve', data1cController.approveUser)

module.exports = router;
