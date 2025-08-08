const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const db = require('../config/database');

const router = express.Router();

// Get family achievements
router.get('/', protect, catchAsync(async (req, res) => {
  const achievements = await db.query(
    'SELECT * FROM achievements WHERE family_id = ? AND is_active = 1',
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    data: { achievements }
  });
}));

module.exports = router;
