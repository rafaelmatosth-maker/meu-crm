const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');
const controller = require('../controllers/escritoriosController');

const router = express.Router();

router.use(auth);
router.get('/', controller.listar);
router.post('/', controller.criar);
router.get('/:id/membros', controller.listarMembros);
router.post('/:id/colaboradores', attachEscritorioContext, controller.adicionarColaborador);

module.exports = router;
