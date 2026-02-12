const express = require('express');
const controller = require('../controllers/clientesController');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);
router.get('/:id', controller.obter);
router.post('/', controller.criar);
router.put('/:id', controller.atualizar);
router.delete('/:id', controller.remover);

module.exports = router;
