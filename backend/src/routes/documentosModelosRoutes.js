const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');
const controller = require('../controllers/documentosModelosController');
const { uploadTemplate } = require('../utils/templateUpload');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);
router.get('/', controller.listar);
router.post('/', (req, res, next) => {
  uploadTemplate.single('arquivo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ erro: err.message || 'Erro ao enviar arquivo.' });
    }
    return controller.criar(req, res, next);
  });
});
router.delete('/:id', controller.remover);
router.post('/:id/preview', controller.preview);
router.get('/:id/pdf', controller.baixarPdf);
router.get('/:id/docx', controller.baixarDocx);

module.exports = router;
