const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');
const controller = require('../controllers/documentosController');
const { upload } = require('../utils/upload');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);
router.post('/', upload.single('arquivo'), controller.criar);
router.get('/:id/download', controller.baixar);
router.delete('/:id', controller.remover);

module.exports = router;
