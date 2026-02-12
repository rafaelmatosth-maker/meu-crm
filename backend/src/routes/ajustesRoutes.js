const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext, requirePapel } = require('../middleware/escritorio');
const controller = require('../controllers/ajustesController');
const { uploadProcedimento } = require('../utils/procedimentoUpload');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);

router.get('/', controller.resumo);

router.get('/config', controller.obterConfig);
router.put('/config', requirePapel('owner', 'admin'), controller.atualizarConfig);

router.get('/colaboradores', controller.listarColaboradores);
router.post('/colaboradores', requirePapel('owner', 'admin'), controller.criarColaborador);
router.put('/colaboradores/:usuarioId', requirePapel('owner', 'admin'), controller.atualizarColaborador);
router.delete('/colaboradores/:usuarioId', requirePapel('owner', 'admin'), controller.removerColaborador);

router.get('/areas', controller.listarAreas);
router.post('/areas', requirePapel('owner', 'admin'), controller.criarArea);
router.put('/areas/:id', requirePapel('owner', 'admin'), controller.atualizarArea);
router.delete('/areas/:id', requirePapel('owner', 'admin'), controller.removerArea);

router.get('/oabs', controller.listarOabs);
router.post('/oabs', requirePapel('owner', 'admin'), controller.criarOab);
router.put('/oabs/:id', requirePapel('owner', 'admin'), controller.atualizarOab);
router.delete('/oabs/:id', requirePapel('owner', 'admin'), controller.removerOab);

router.get('/procedimentos', controller.listarProcedimentos);
router.get('/procedimentos/:id/anexo', controller.baixarAnexoProcedimento);
router.post(
  '/procedimentos',
  requirePapel('owner', 'admin'),
  uploadProcedimento.single('anexo'),
  controller.criarProcedimento
);
router.put(
  '/procedimentos/:id',
  requirePapel('owner', 'admin'),
  uploadProcedimento.single('anexo'),
  controller.atualizarProcedimento
);
router.delete('/procedimentos/:id', requirePapel('owner', 'admin'), controller.removerProcedimento);

module.exports = router;
