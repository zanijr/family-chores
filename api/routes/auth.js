const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { 
  createSendToken, 
  protect, 
  authRateLimit, 
  validateFamilyCode,
  generateUniqueFamilyCode 
} = require('../middleware/auth');
const { AppError, catchAsync, formatValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

// Validation rules
const familyValidation = [
  body('familyName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Family name must be between 2 and 100 characters'),
  body('adminName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Admin name must be between 2 and 100 characters'),
  body('adminEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('adminPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const loginValidation = [
  body('familyCode')
    .trim()
    .isLength({ min: 6, max: 10 })
    .withMessage('Family code must be between 6 and 10 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const registerUserValidation = [
  body('familyCode')
    .trim()
    .isLength({ min: 6, max: 10 })
    .withMessage('Family code must be between 6 and 10 characters'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .isIn(['parent', 'child'])
    .withMessage('Role must be either parent or child')
];

const userValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('role')
    .isIn(['parent', 'child'])
    .withMessage('Role must be either parent or child'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

// Register new family
router.post('/register', authRateLimit(10, 15 * 60 * 1000), familyValidation, catchAsync(async (req, res, next) => {
  console.log('Register endpoint hit with body:', req.body);
  
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: formatValidationErrors(errors)
    });
  }

  const { familyName, adminName, adminEmail, adminPassword } = req.body;
  const finalAdminName = adminName || adminEmail.split('@')[0];
  console.log('Extracted fields:', { familyName, adminName: finalAdminName, adminEmail });

  try {
    // Hash admin password
    console.log('Hashing admin password...');
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Generate unique family code
    console.log('Generating unique family code...');
    const familyCode = await generateUniqueFamilyCode();
    console.log('Generated family code:', familyCode);

    // Start transaction
    console.log('Starting transaction...');
    const result = await db.transaction(async (connection) => {
      console.log('Inside transaction, creating family...');
      // Create family
      const [familyResult] = await connection.execute(
        'INSERT INTO families (name, family_code, admin_email) VALUES (?, ?, ?)',
        [familyName, familyCode, adminEmail]
      );
      console.log('Family created with ID:', familyResult.insertId);

      const familyId = familyResult.insertId;

      // Create admin user with password
      console.log('Creating admin user...');
      const [userResult] = await connection.execute(
        'INSERT INTO users (family_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [familyId, finalAdminName, adminEmail, passwordHash, 'parent']
      );
      console.log('User created with ID:', userResult.insertId);

      const userId = userResult.insertId;

      // Get the created user
      console.log('Fetching created user...');
      const [users] = await connection.execute(
        'SELECT u.*, f.family_code, f.name as family_name FROM users u JOIN families f ON u.family_id = f.id WHERE u.id = ?',
        [userId]
      );

      const user = users[0];
      // Remove sensitive data
      delete user.password_hash;
      console.log('Transaction completed successfully');

      return user;
    });

    console.log('Sending response with token...');
    // Send response with token
    createSendToken(result, 201, res);
  } catch (error) {
    console.error('Error in register endpoint:', error);
    throw error;
  }
}));

// Get family members for login
router.post('/family-members', validateFamilyCode, catchAsync(async (req, res, next) => {
  const { familyCode } = req.body;

  // Find family
  const family = await db.query(
    'SELECT id, name FROM families WHERE family_code = ?',
    [familyCode]
  );

  if (!family || family.length === 0) {
    return next(new AppError('Invalid family code', 404));
  }

  // Get family members
  const members = await db.query(
    `SELECT id, name, role, avatar_url, last_login, 
            CASE WHEN last_login IS NULL THEN 0 ELSE 1 END as has_logged_in
     FROM users 
     WHERE family_id = ? AND is_active = 1 
     ORDER BY role DESC, name ASC`,
    [family[0].id]
  );

  res.json({
    status: 'success',
    data: {
      family: family[0],
      members: members
    }
  });
}));

// Register user to existing family
router.post('/register-user', authRateLimit(10, 15 * 60 * 1000), registerUserValidation, catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: formatValidationErrors(errors)
    });
  }

  const { familyCode, name, email, password, role } = req.body;

  // Find family
  const family = await db.query(
    'SELECT id, name FROM families WHERE family_code = ?',
    [familyCode]
  );

  if (!family || family.length === 0) {
    return next(new AppError('Invalid family code', 404));
  }

  // Check if email already exists in this family
  const existingUser = await db.query(
    'SELECT id FROM users WHERE family_id = ? AND email = ?',
    [family[0].id, email]
  );

  if (existingUser && existingUser.length > 0) {
    return next(new AppError('Email already exists in this family', 400));
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const result = await db.query(
    'INSERT INTO users (family_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [family[0].id, name, email, passwordHash, role]
  );

  // Get the created user
  const newUser = await db.query(
    `SELECT u.*, f.family_code, f.name as family_name
     FROM users u
     JOIN families f ON u.family_id = f.id
     WHERE u.id = ?`,
    [result.insertId]
  );

  // Send response with token
  createSendToken(newUser[0], 201, res);
}));

// Login with family code, email and password
router.post('/login', authRateLimit(20, 15 * 60 * 1000), loginValidation, catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: formatValidationErrors(errors)
    });
  }

  const { familyCode, email, password } = req.body;

  // Find user with family code and email
  const users = await db.query(
    `SELECT u.*, f.family_code, f.name as family_name
     FROM users u
     JOIN families f ON u.family_id = f.id
     WHERE f.family_code = ? AND u.email = ? AND u.is_active = 1`,
    [familyCode, email]
  );

  if (!users || users.length === 0) {
    return next(new AppError('Invalid family code, email, or password', 401));
  }

  const user = users[0];

  // Check if account is locked
  if (user.locked_until && new Date() < new Date(user.locked_until)) {
    return next(new AppError('Account is temporarily locked due to too many failed login attempts', 423));
  }

  // Verify password
  const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordCorrect) {
    // Increment login attempts
    const newAttempts = (user.login_attempts || 0) + 1;
    const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null; // Lock for 15 minutes after 5 attempts

    await db.query(
      'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
      [newAttempts, lockUntil, user.id]
    );

    return next(new AppError('Invalid family code, email, or password', 401));
  }

  // Reset login attempts on successful login
  await db.query(
    'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = ?',
    [user.id]
  );

  // Remove sensitive data
  delete user.password_hash;
  delete user.login_attempts;
  delete user.locked_until;

  // Send response with token
  createSendToken(user, 200, res);
}));

// Add new family member
router.post('/add-member', protect, userValidation, catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: formatValidationErrors(errors)
    });
  }

  // Only parents can add members
  if (req.user.role !== 'parent') {
    return next(new AppError('Only parents can add family members', 403));
  }

  const { name, role, email } = req.body;

  // Create new user
  const result = await db.query(
    'INSERT INTO users (family_id, name, email, role) VALUES (?, ?, ?, ?)',
    [req.user.family_id, name, email, role]
  );

  // Get the created user
  const newUser = await db.query(
    'SELECT * FROM users WHERE id = ?',
    [result.insertId]
  );

  res.status(201).json({
    status: 'success',
    data: {
      user: newUser[0]
    }
  });
}));

// Verify token and get current user info
router.get('/verify', protect, catchAsync(async (req, res, next) => {
  // Get user with family info
  const userInfo = await db.query(
    `SELECT u.*, f.name as family_name, f.family_code
     FROM users u
     JOIN families f ON u.family_id = f.id
     WHERE u.id = ?`,
    [req.user.id]
  );

  if (!userInfo || userInfo.length === 0) {
    return next(new AppError('User not found', 404));
  }

  const user = userInfo[0];
  // Remove sensitive data
  delete user.password_hash;
  delete user.login_attempts;
  delete user.locked_until;

  res.json({
    status: 'success',
    valid: true,
    user: user
  });
}));

// Get current user info
router.get('/me', protect, catchAsync(async (req, res, next) => {
  // Get user with family info
  const userInfo = await db.query(
    `SELECT u.*, f.name as family_name, f.family_code
     FROM users u
     JOIN families f ON u.family_id = f.id
     WHERE u.id = ?`,
    [req.user.id]
  );

  // Get user stats
  const stats = await db.query(
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

  const user = userInfo[0];
  user.stats = stats[0];

  res.json({
    status: 'success',
    data: {
      user
    }
  });
}));

// Update user profile
router.patch('/me', protect, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be a valid object')
], catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: formatValidationErrors(errors)
    });
  }

  const allowedFields = ['name', 'email', 'preferences'];
  const updates = {};
  
  // Filter allowed fields
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update', 400));
  }

  // Convert preferences to JSON string if present
  if (updates.preferences) {
    updates.preferences = JSON.stringify(updates.preferences);
  }

  // Build dynamic query
  const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.user.id);

  await db.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = ?`,
    values
  );

  // Get updated user
  const updatedUser = await db.query(
    'SELECT * FROM users WHERE id = ?',
    [req.user.id]
  );

  res.json({
    status: 'success',
    data: {
      user: updatedUser[0]
    }
  });
}));

// Logout (client-side token removal)
router.post('/logout', protect, (req, res) => {
  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// Check if family code exists
router.post('/check-family-code', validateFamilyCode, catchAsync(async (req, res, next) => {
  const { familyCode } = req.body;

  const family = await db.query(
    'SELECT id, name FROM families WHERE family_code = ?',
    [familyCode]
  );

  res.json({
    status: 'success',
    data: {
      exists: family.length > 0,
      family: family.length > 0 ? family[0] : null
    }
  });
}));

// Get family info (for parents)
router.get('/family-info', protect, catchAsync(async (req, res, next) => {
  if (req.user.role !== 'parent') {
    return next(new AppError('Only parents can access family information', 403));
  }

  // Get family with stats
  const familyInfo = await db.query(
    `SELECT f.*, 
       COUNT(DISTINCT u.id) as total_members,
       COUNT(DISTINCT CASE WHEN u.role = 'parent' THEN u.id END) as parents,
       COUNT(DISTINCT CASE WHEN u.role = 'child' THEN u.id END) as children,
       COUNT(DISTINCT c.id) as total_chores,
       COUNT(DISTINCT ct.id) as completed_chores,
       COALESCE(SUM(ct.reward_earned), 0) as total_rewards_paid
     FROM families f
     LEFT JOIN users u ON f.id = u.family_id AND u.is_active = 1
     LEFT JOIN chores c ON f.id = c.family_id
     LEFT JOIN completed_tasks ct ON u.id = ct.user_id
     WHERE f.id = ?
     GROUP BY f.id`,
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    data: {
      family: familyInfo[0]
    }
  });
}));

module.exports = router;
