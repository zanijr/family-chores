const express = require('express');
const bcrypt = require('bcryptjs');
const { protect, restrictTo, checkFamilyAccess } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const db = require('../config/database');

const router = express.Router();

// Get family members
router.get('/:familyId/members', protect, checkFamilyAccess, catchAsync(async (req, res) => {
  const members = await db.query(
    'SELECT id, name, role, earnings, screen_time_earned, avatar_url, last_login FROM users WHERE family_id = ? AND is_active = 1',
    [req.params.familyId]
  );

  res.json({
    status: 'success',
    data: { members }
  });
}));

// Add family member
router.post('/:familyId/members', protect, checkFamilyAccess, catchAsync(async (req, res) => {
  // Only parents can add family members
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can add family members'
    });
  }

  const { name, role, email, password } = req.body;
  
  if (!name || !role) {
    return res.status(400).json({
      status: 'fail',
      message: 'Name and role are required'
    });
  }

  // Use provided password or generate a temporary one, then hash it
  const tempPassword = password && password.trim() ? password : Math.random().toString(36).slice(-8);
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  
  // Insert the new family member (store hashed password)
  const result = await db.query(
    `INSERT INTO users 
     (family_id, name, role, email, password_hash, is_active) 
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      req.params.familyId,
      name,
      role,
      email || null,
      passwordHash
    ]
  );

  const [newMember] = await db.query(
    'SELECT id, name, role, earnings, screen_time_earned, avatar_url FROM users WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    status: 'success',
    data: { 
      member: newMember,
      // Only return tempPassword when we generated one for convenience
      tempPassword: password && password.trim() ? undefined : tempPassword,
      message: 'Family member added successfully'
    }
  });
}));

module.exports = router;
