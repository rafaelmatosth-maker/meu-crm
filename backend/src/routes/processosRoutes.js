const express = require('express');
const controller = require('../controllers/processosController');
const andamentosController = require('../controllers/processoAndamentosController');
const financeiroController = require('../controllers/financeiroController');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);
router.get('/:id', controller.obter);
router.get('/:id/andamentos', andamentosController.listar);
router.post('/:id/andamentos/sync', andamentosController.sincronizar);
router.post('/:id/andamentos/seen', andamentosController.marcarVistos);
router.get('/:id/andamentos/logs', andamentosController.listarLogs);
router.get('/:id/financeiro-lancamentos', financeiroController.listarPorProcesso);
router.post('/:id/financeiro-lancamentos', financeiroController.criar);
router.post('/', controller.criar);
router.put('/:id', controller.atualizar);
router.delete('/:id', controller.remover);

module.exports = router;
