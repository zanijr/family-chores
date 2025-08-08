const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const db = require('../config/database');
const { AppError, catchAsync } = require('./errorHandler');

// Generate JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

// Create and send JWT token
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user.id);
  
  // Remove password from output
  user.password = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

// Protect routes - require authentication
const protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await db.query(
    'SELECT * FROM users WHERE id = ? AND is_active = 1',
    [decoded.id]
  );

  if (!currentUser || currentUser.length === 0) {
    return next(
      new AppError('The user belonging to this token does no longer exist.', 401)
    );
  }

  // 4) Update last login
  await db.query(
    'UPDATE users SET last_login = NOW() WHERE id = ?',
    [currentUser[0].id]
  );

  // 5) Grant access to protected route
  req.user = currentUser[0];
  req.user.familyId = currentUser[0].family_id; // Add familyId for convenience
  next();
});

// Restrict to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    next();
  };
};

// Check if user belongs to the family
const checkFamilyAccess = catchAsync(async (req, res, next) => {
  const familyId = req.params.familyId || req.body.familyId || req.query.familyId;
  
  if (familyId && parseInt(familyId) !== req.user.family_id) {
    return next(
      new AppError('You do not have access to this family data', 403)
    );
  }
  
  next();
});

// Check if user can access specific user data
const checkUserAccess = catchAsync(async (req, res, next) => {
  const userId = req.params.userId || req.params.id;
  
  // Parents can access any user in their family
  if (req.user.role === 'parent') {
    if (userId) {
      const targetUser = await db.query(
        'SELECT family_id FROM users WHERE id = ?',
        [userId]
      );
      
      if (!targetUser || targetUser.length === 0) {
        return next(new AppError('User not found', 404));
      }
      
      if (targetUser[0].family_id !== req.user.family_id) {
        return next(
          new AppError('You do not have access to this user data', 403)
        );
      }
    }
  } else {
    // Children can only access their own data
    if (userId && parseInt(userId) !== req.user.id) {
      return next(
        new AppError('You can only access your own data', 403)
      );
    }
  }
  
  next();
});

// Check if user can access specific chore
const checkChoreAccess = catchAsync(async (req, res, next) => {
  const choreId = req.params.choreId || req.params.id;
  
  if (choreId) {
    const chore = await db.query(
      'SELECT family_id, assigned_to, created_by FROM chores WHERE id = ?',
      [choreId]
    );
    
    if (!chore || chore.length === 0) {
      return next(new AppError('Chore not found', 404));
    }
    
    // Check family access
    if (chore[0].family_id !== req.user.family_id) {
      return next(
        new AppError('You do not have access to this chore', 403)
      );
    }
    
    // For children, check if they're assigned to the chore or created it
    if (req.user.role === 'child') {
      if (
        chore[0].assigned_to !== req.user.id &&
        chore[0].created_by !== req.user.id
      ) {
        return next(
          new AppError('You do not have access to this chore', 403)
        );
      }
    }
  }
  
  next();
});

// Optional authentication - doesn't fail if no token
const optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
      const currentUser = await db.query(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [decoded.id]
      );

      if (currentUser && currentUser.length > 0) {
        req.user = currentUser[0];
        req.user.familyId = currentUser[0].family_id;
      }
    } catch (error) {
      // Token is invalid, but we don't fail - just continue without user
    }
  }

  next();
});

// Rate limiting for authentication endpoints
const authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    
    if (!attempts.has(key)) {
      attempts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userAttempts = attempts.get(key);
    
    if (now > userAttempts.resetTime) {
      userAttempts.count = 1;
      userAttempts.resetTime = now + windowMs;
      return next();
    }
    
    if (userAttempts.count >= maxAttempts) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: Math.ceil((userAttempts.resetTime - now) / 1000)
      });
    }
    
    userAttempts.count++;
    next();
  };
};

// Validate family code format
const validateFamilyCode = (req, res, next) => {
  const { familyCode } = req.body;
  
  if (!familyCode) {
    return next(new AppError('Family code is required', 400));
  }
  
  // Family code should be 6-10 characters, alphanumeric
  if (!/^[A-Za-z0-9]{6,10}$/.test(familyCode)) {
    return next(
      new AppError('Invalid family code format. Must be 6-10 alphanumeric characters.', 400)
    );
  }
  
  next();
};

// Generate a random family code
const generateFamilyCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Check if family code is unique
const checkFamilyCodeUnique = async (familyCode) => {
  const existing = await db.query(
    'SELECT id FROM families WHERE family_code = ?',
    [familyCode]
  );
  return existing.length === 0;
};

// Generate unique family code
const generateUniqueFamilyCode = async () => {
  let familyCode;
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 10) {
    familyCode = generateFamilyCode();
    isUnique = await checkFamilyCodeUnique(familyCode);
    attempts++;
  }
  
  if (!isUnique) {
    throw new AppError('Unable to generate unique family code. Please try again.', 500);
  }
  
  return familyCode;
};

module.exports = {
  signToken,
  createSendToken,
  protect,
  restrictTo,
  checkFamilyAccess,
  checkUserAccess,
  checkChoreAccess,
  optionalAuth,
  authRateLimit,
  validateFamilyCode,
  generateUniqueFamilyCode
};
