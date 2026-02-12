const path = require('path');
const fs = require('fs');
const multer = require('multer');

const templateUploadDir = path.join(__dirname, '..', '..', 'uploads', 'templates');

if (!fs.existsSync(templateUploadDir)) {
  fs.mkdirSync(templateUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, templateUploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const uploadTemplate = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.docx') {
      return cb(new Error('Envie um arquivo .docx.'));
    }
    return cb(null, true);
  },
});

module.exports = {
  uploadTemplate,
  templateUploadDir,
};
