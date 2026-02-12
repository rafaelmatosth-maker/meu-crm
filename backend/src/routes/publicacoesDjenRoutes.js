const express = require('express');
const controller = require('../controllers/publicacoesDjenController');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);

module.exports = router;
