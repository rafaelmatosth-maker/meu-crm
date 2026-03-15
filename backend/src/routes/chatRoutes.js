const express = require('express');
const auth = require('../middleware/auth');
const { attachEscritorioContext } = require('../middleware/escritorio');
const { chatUpload } = require('../utils/chatUpload');
const controller = require('../controllers/chatController');

const router = express.Router();

router.use(auth);
router.use(attachEscritorioContext);

router.get('/conversas', controller.listarConversas);
router.get('/colaboradores', controller.listarColaboradores);
router.post('/conversas/direta', controller.criarConversaDireta);
router.get('/conversas/:id/mensagens', controller.listarMensagens);
router.post('/conversas/:id/mensagens', chatUpload.array('arquivos', 5), controller.enviarMensagem);
router.post('/conversas/:id/ler', controller.marcarComoLida);
router.get('/anexos/:id/download', controller.baixarAnexo);

module.exports = router;
