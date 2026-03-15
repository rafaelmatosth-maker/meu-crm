const express = require('express');
const controller = require('../controllers/atividadesController');
const auth = require('../middleware/auth');
const { attachEscritorioContext, requireNotPapel } = require('../middleware/escritorio');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);
router.get('/:id', controller.obter);
router.post('/', requireNotPapel('estagiario'), controller.criar);
router.put('/:id', controller.atualizar);
router.delete('/:id', requireNotPapel('estagiario'), controller.remover);

module.exports = router;
