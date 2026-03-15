const path = require('path');
const multer = require('multer');

const uploadImportacaoCsv = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Envie um arquivo .csv.'));
    }
    return cb(null, true);
  },
});

module.exports = {
  uploadImportacaoCsv,
};
