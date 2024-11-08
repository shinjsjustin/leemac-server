const db = require('../db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const express = require('express');
const router = express.Router();

const quoteRequests = require('./quoteRequest')

router.use('/requests', quoteRequests);

module.exports = router;