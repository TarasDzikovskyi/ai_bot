const express = require('express');
const router = express.Router();
const { amassController } = require('../controllers');

// POST запит для отримання ціни
router.post('/quote', amassController.getExwQuote);

module.exports = router;