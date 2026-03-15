const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext, requirePapel } = require('../middleware/escritorio');
const controller = require('../controllers/ajustesController');
const { uploadProcedimento } = require('../utils/procedimentoUpload');
const { uploadImportacaoCsv } = require('../utils/importacaoCsvUpload');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);

router.get('/', controller.resumo);

router.get('/config', controller.obterConfig);
router.put('/config', requirePapel('administrador'), controller.atualizarConfig);

router.get('/colaboradores', controller.listarColaboradores);
router.post('/colaboradores', requirePapel('administrador'), controller.criarColaborador);
router.put('/colaboradores/:usuarioId', requirePapel('administrador'), controller.atualizarColaborador);
router.delete('/colaboradores/:usuarioId', requirePapel('administrador'), controller.removerColaborador);

router.get('/areas', controller.listarAreas);
router.post('/areas', requirePapel('administrador'), controller.criarArea);
router.put('/areas/:id', requirePapel('administrador'), controller.atualizarArea);
router.delete('/areas/:id', requirePapel('administrador'), controller.removerArea);

router.get('/oabs', controller.listarOabs);
router.post('/oabs', requirePapel('administrador'), controller.criarOab);
router.put('/oabs/:id', requirePapel('administrador'), controller.atualizarOab);
router.delete('/oabs/:id', requirePapel('administrador'), controller.removerOab);
router.post('/importacao-processos', requirePapel('administrador'), controller.previewImportacaoProcessos);
router.post('/importacao-processos/preview', requirePapel('administrador'), controller.previewImportacaoProcessos);
router.post('/importacao-processos/importar', requirePapel('administrador'), controller.importarProcessos);
router.get(
  '/importacao-csv/clientes-processos/template',
  requirePapel('administrador'),
  controller.baixarTemplateImportacaoCsv
);
router.post('/importacao-csv/clientes-processos', requirePapel('administrador'), (req, res, next) => {
  uploadImportacaoCsv.single('arquivo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ erro: err.message || 'Erro ao enviar CSV.' });
    }
    return controller.importarClientesProcessosCsv(req, res, next);
  });
});

router.get('/procedimentos', controller.listarProcedimentos);
router.get('/procedimentos/:id/anexo', controller.baixarAnexoProcedimento);
router.post(
  '/procedimentos',
  requirePapel('administrador'),
  uploadProcedimento.single('anexo'),
  controller.criarProcedimento
);
router.put(
  '/procedimentos/:id',
  requirePapel('administrador'),
  uploadProcedimento.single('anexo'),
  controller.atualizarProcedimento
);
router.delete('/procedimentos/:id', requirePapel('administrador'), controller.removerProcedimento);

module.exports = router;
