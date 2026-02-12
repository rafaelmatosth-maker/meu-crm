const path = require('path');
const fs = require('fs');
const multer = require('multer');

const procedimentoUploadDir = path.join(__dirname, '..', '..', 'uploads', 'procedimentos');

if (!fs.existsSync(procedimentoUploadDir)) {
  fs.mkdirSync(procedimentoUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, procedimentoUploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const uploadProcedimento = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

module.exports = {
  uploadProcedimento,
  procedimentoUploadDir,
};
