const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('../config/database');

const router = express.Router();

// Configure storage
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only .jpeg, .png, .gif and .webp formats are allowed', 400));
    }
  }
});

// Upload a photo
router.post('/', protect, upload.single('photo'), catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // Create thumbnails directory if it doesn't exist
  const thumbnailsDir = path.join(__dirname, '../uploads/thumbnails');
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  // Generate thumbnail
  const thumbnailFilename = 'thumb-' + path.basename(req.file.filename);
  const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
  
  await sharp(req.file.path)
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);

  // Optimize original image if it's large
  if (req.file.size > 1024 * 1024) { // If larger than 1MB
    const optimizedPath = req.file.path + '.optimized';
    await sharp(req.file.path)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(optimizedPath);
    
    // Replace original with optimized version
    fs.unlinkSync(req.file.path);
    fs.renameSync(optimizedPath, req.file.path);
  }

  // Save upload record to database
  const result = await db.query(
    `INSERT INTO uploads 
     (user_id, family_id, original_filename, stored_filename, file_path, thumbnail_path, 
      file_size, mime_type, upload_type, metadata) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      req.user.family_id,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      path.join('uploads/thumbnails', thumbnailFilename),
      req.file.size,
      req.file.mimetype,
      req.body.type || 'general',
      JSON.stringify({
        width: null, // Will be populated by image processing service
        height: null,
        optimized: req.file.size > 1024 * 1024
      })
    ]
  );

  res.status(201).json({
    status: 'success',
    data: {
      id: result.insertId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      thumbnailPath: `/uploads/thumbnails/${thumbnailFilename}`,
      size: req.file.size,
      mimeType: req.file.mimetype
    }
  });
}));

// Get all uploads for the current user's family
router.get('/', protect, catchAsync(async (req, res) => {
  const uploads = await db.query(
    `SELECT u.*, us.name as uploaded_by
     FROM uploads u
     JOIN users us ON u.user_id = us.id
     WHERE u.family_id = ?
     ORDER BY u.created_at DESC`,
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    data: { uploads }
  });
}));

// Get uploads by type
router.get('/type/:type', protect, catchAsync(async (req, res) => {
  const uploads = await db.query(
    `SELECT u.*, us.name as uploaded_by
     FROM uploads u
     JOIN users us ON u.user_id = us.id
     WHERE u.family_id = ? AND u.upload_type = ?
     ORDER BY u.created_at DESC`,
    [req.user.family_id, req.params.type]
  );

  res.json({
    status: 'success',
    data: { uploads }
  });
}));

// Get a single upload
router.get('/:id', protect, catchAsync(async (req, res) => {
  const [upload] = await db.query(
    `SELECT u.*, us.name as uploaded_by
     FROM uploads u
     JOIN users us ON u.user_id = us.id
     WHERE u.id = ? AND u.family_id = ?`,
    [req.params.id, req.user.family_id]
  );

  if (!upload) {
    throw new AppError('Upload not found', 404);
  }

  res.json({
    status: 'success',
    data: { upload }
  });
}));

// Delete an upload
router.delete('/:id', protect, catchAsync(async (req, res) => {
  // Get upload details
  const [upload] = await db.query(
    'SELECT * FROM uploads WHERE id = ? AND family_id = ?',
    [req.params.id, req.user.family_id]
  );

  if (!upload) {
    throw new AppError('Upload not found', 404);
  }

  // Check if user is authorized (owner or parent)
  if (upload.user_id !== req.user.id && req.user.role !== 'parent') {
    throw new AppError('You are not authorized to delete this upload', 403);
  }

  // Delete the files
  try {
    // Delete original file
    if (fs.existsSync(upload.file_path)) {
      fs.unlinkSync(upload.file_path);
    }
    
    // Delete thumbnail if it exists
    if (upload.thumbnail_path && fs.existsSync(upload.thumbnail_path)) {
      fs.unlinkSync(upload.thumbnail_path);
    }
  } catch (error) {
    console.error('Error deleting files:', error);
    // Continue with database deletion even if file deletion fails
  }

  // Delete from database
  await db.query('DELETE FROM uploads WHERE id = ?', [req.params.id]);

  res.json({
    status: 'success',
    message: 'Upload deleted successfully'
  });
}));

module.exports = router;
