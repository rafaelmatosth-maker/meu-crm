const express = require('express');
const controller = require('../controllers/financeiroController');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.post('/', controller.criarAvulso);
router.put('/:id', controller.atualizar);
router.delete('/:id', controller.remover);

module.exports = router;
