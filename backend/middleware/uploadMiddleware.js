const fs = require('fs');
const path = require('path');
const multer = require('multer');

const createUploadMiddleware = (subdirectory) => {
  const uploadDirectory = path.join(__dirname, '..', 'uploads', subdirectory);
  fs.mkdirSync(uploadDirectory, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, callback) => {
      callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9_-]/g, '-');
      callback(null, `${Date.now()}-${baseName}${extension}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        callback(null, true);
        return;
      }

      callback(new Error('Only image files are allowed'));
    }
  });
};

module.exports = {
  createUploadMiddleware
};
