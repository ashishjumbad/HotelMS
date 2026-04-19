const express = require('express');
const router = express.Router();
const { getPlans } = require('../controllers/subscriptionController');

router.get('/', getPlans);
router.get('/public', getPlans);

module.exports = router;
