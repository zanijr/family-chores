const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const backupManager = require('../utils/backup');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// All backup routes require authentication and parent role
router.use(protect);
router.use(restrictTo('parent'));

// Create a new backup
router.post('/create', catchAsync(async (req, res) => {
  const backup = await backupManager.createFullBackup();
  
  res.status(201).json({
    status: 'success',
    message: 'Backup created successfully',
    data: { backup }
  });
}));

// List all backups
router.get('/', catchAsync(async (req, res) => {
  const backups = await backupManager.listBackups();
  
  res.json({
    status: 'success',
    data: { backups }
  });
}));

// Get backup statistics
router.get('/stats', catchAsync(async (req, res) => {
  const stats = await backupManager.getBackupStats();
  
  res.json({
    status: 'success',
    data: { stats }
  });
}));

// Download a backup file
router.get('/download/:filename', catchAsync(async (req, res) => {
  const { filename } = req.params;
  const backupDir = process.env.BACKUP_DIR || '/app/backups';
  const filepath = path.join(backupDir, filename);
  
  // Security check - ensure the file is in the backup directory
  const resolvedPath = path.resolve(filepath);
  const resolvedBackupDir = path.resolve(backupDir);
  
  if (!resolvedPath.startsWith(resolvedBackupDir)) {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied'
    });
  }
  
  // Check if file exists
  try {
    await fs.access(filepath);
  } catch {
    return res.status(404).json({
      status: 'fail',
      message: 'Backup file not found'
    });
  }
  
  // Send file for download
  res.download(filepath, filename);
}));

// Restore from backup (dangerous operation)
router.post('/restore', catchAsync(async (req, res) => {
  const { filename, confirmRestore } = req.body;
  
  // Require explicit confirmation
  if (confirmRestore !== 'CONFIRM_RESTORE') {
    return res.status(400).json({
      status: 'fail',
      message: 'Restore operation requires explicit confirmation'
    });
  }
  
  const backupDir = process.env.BACKUP_DIR || '/app/backups';
  const filepath = path.join(backupDir, filename);
  
  // Security check
  const resolvedPath = path.resolve(filepath);
  const resolvedBackupDir = path.resolve(backupDir);
  
  if (!resolvedPath.startsWith(resolvedBackupDir)) {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied'
    });
  }
  
  // Only allow database restore for now
  if (!filename.includes('db_backup')) {
    return res.status(400).json({
      status: 'fail',
      message: 'Only database backups can be restored'
    });
  }
  
  const result = await backupManager.restoreDatabase(filepath);
  
  res.json({
    status: 'success',
    message: result.message,
    data: { result }
  });
}));

// Delete a backup file
router.delete('/:filename', catchAsync(async (req, res) => {
  const { filename } = req.params;
  const backupDir = process.env.BACKUP_DIR || '/app/backups';
  const filepath = path.join(backupDir, filename);
  
  // Security check
  const resolvedPath = path.resolve(filepath);
  const resolvedBackupDir = path.resolve(backupDir);
  
  if (!resolvedPath.startsWith(resolvedBackupDir)) {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied'
    });
  }
  
  try {
    await fs.unlink(filepath);
    
    res.json({
      status: 'success',
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    return res.status(404).json({
      status: 'fail',
      message: 'Backup file not found'
    });
  }
}));

module.exports = router;
