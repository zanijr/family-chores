const express = require('express');
const { protect, checkUserAccess } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const db = require('../config/database');

const router = express.Router();

// Get user profile
router.get('/:id', protect, checkUserAccess, catchAsync(async (req, res) => {
  const [user] = await db.query(
    'SELECT id, name, role, earnings, screen_time_earned, avatar_url FROM users WHERE id = ?',
    [req.params.id]
  );

  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found'
    });
  }

  res.json({
    status: 'success',
    data: { user }
  });
}));

// Get current user's chores
router.get('/me/chores', protect, catchAsync(async (req, res) => {
  const chores = await db.query(
    `SELECT c.*, 
            (SELECT COUNT(*) FROM chore_submissions WHERE chore_id = c.id AND user_id = ?) as submission_count
     FROM chores c
     WHERE c.assigned_to = ? 
     ORDER BY 
        CASE 
            WHEN c.status = 'pending_acceptance' THEN 1
            WHEN c.status = 'in_progress' THEN 2
            WHEN c.status = 'pending_approval' THEN 3
            ELSE 4
        END,
        c.created_at DESC`,
    [req.user.id, req.user.id]
  );

  res.json({
    status: 'success',
    chores
  });
}));

// Get user's chores
router.get('/:id/chores', protect, checkUserAccess, catchAsync(async (req, res) => {
  const chores = await db.query(
    `SELECT c.*, 
            (SELECT COUNT(*) FROM chore_submissions WHERE chore_id = c.id AND user_id = ?) as submission_count
     FROM chores c
     WHERE c.assigned_to = ? 
     ORDER BY c.created_at DESC`,
    [req.params.id, req.params.id]
  );

  res.json({
    status: 'success',
    chores
  });
}));

// Get user's completed tasks
router.get('/:id/completed', protect, checkUserAccess, catchAsync(async (req, res) => {
  const completedTasks = await db.query(
    `SELECT ct.*, u.name as approved_by_name
     FROM completed_tasks ct
     LEFT JOIN users u ON ct.approved_by = u.id
     WHERE ct.user_id = ?
     ORDER BY ct.completed_at DESC
     LIMIT 20`,
    [req.params.id]
  );

  res.json({
    status: 'success',
    completed_tasks: completedTasks
  });
}));

// Get current user's profile with stats
router.get('/profile', protect, catchAsync(async (req, res) => {
  // Get user with family info
  const [user] = await db.query(
    `SELECT u.*, f.name as family_name, f.family_code
     FROM users u
     JOIN families f ON u.family_id = f.id
     WHERE u.id = ?`,
    [req.user.id]
  );

  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found'
    });
  }

  // Get user stats
  const [stats] = await db.query(
    `SELECT 
       COUNT(ct.id) as chores_completed,
       COALESCE(SUM(ct.reward_earned), 0) as total_earned,
       COUNT(ua.id) as achievements_earned
     FROM users u
     LEFT JOIN completed_tasks ct ON u.id = ct.user_id
     LEFT JOIN user_achievements ua ON u.id = ua.user_id
     WHERE u.id = ?`,
    [req.user.id]
  );

  // Get recent completed tasks
  const completedTasks = await db.query(
    `SELECT ct.*, u.name as approved_by_name
     FROM completed_tasks ct
     LEFT JOIN users u ON ct.approved_by = u.id
     WHERE ct.user_id = ?
     ORDER BY ct.completed_at DESC
     LIMIT 5`,
    [req.user.id]
  );

  // Remove sensitive data
  delete user.password_hash;
  delete user.login_attempts;
  delete user.locked_until;

  user.stats = stats;

  res.json({
    status: 'success',
    user,
    completed_tasks: completedTasks
  });
}));

// Get family members
router.get('/family/members', protect, catchAsync(async (req, res) => {
  const members = await db.query(
    `SELECT id, name, role, earnings, screen_time_earned, avatar_url, last_login, created_at
     FROM users 
     WHERE family_id = ? AND is_active = 1
     ORDER BY role DESC, name ASC`,
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    members
  });
}));

// Update user profile
router.patch('/:id', protect, checkUserAccess, catchAsync(async (req, res) => {
  // Only allow updating certain fields
  const allowedFields = ['name', 'avatar_url', 'preferences'];
  
  // Parents can update more fields
  if (req.user.role === 'parent') {
    allowedFields.push('role', 'earnings', 'screen_time_earned');
  }
  
  const updates = {};
  
  // Filter allowed fields
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'No valid fields to update'
    });
  }

  // Convert preferences to JSON string if present
  if (updates.preferences) {
    updates.preferences = JSON.stringify(updates.preferences);
  }

  // Build dynamic query
  const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  await db.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = ?`,
    values
  );

  const [updatedUser] = await db.query(
    'SELECT id, name, role, earnings, screen_time_earned, avatar_url FROM users WHERE id = ?',
    [req.params.id]
  );

  res.json({
    status: 'success',
    data: { user: updatedUser }
  });
}));

module.exports = router;
