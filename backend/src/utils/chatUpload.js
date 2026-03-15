const path = require('path');
const fs = require('fs');
const multer = require('multer');

const chatUploadDir = path.join(__dirname, '..', '..', 'uploads', 'chat');

if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chatUploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '');
    cb(null, `${unique}${ext}`);
  },
});

const chatUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 5,
  },
});

module.exports = {
  chatUpload,
  chatUploadDir,
};
