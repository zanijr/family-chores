const express = require('express');
const { protect, checkChoreAccess } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
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
    cb(null, 'chore-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpeg, .png and .gif formats are allowed'));
    }
  }
});

const router = express.Router();

// Get family chores with more details
router.get('/', protect, catchAsync(async (req, res) => {
  const chores = await db.query(
    `SELECT c.*, 
            u.name as assignee_name,
            (SELECT COUNT(*) FROM chore_submissions WHERE chore_id = c.id) as submission_count
     FROM chores c
     LEFT JOIN users u ON c.assigned_to = u.id
     WHERE c.family_id = ? 
     ORDER BY c.created_at DESC`,
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    chores
  });
}));

// Get single chore details
router.get('/:id', protect, checkChoreAccess, catchAsync(async (req, res) => {
  const [chore] = await db.query(
    `SELECT c.*, 
            u.name as assignee_name,
            u2.name as created_by_name
     FROM chores c
     LEFT JOIN users u ON c.assigned_to = u.id
     LEFT JOIN users u2 ON c.created_by = u2.id
     WHERE c.id = ?`,
    [req.params.id]
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found'
    });
  }

  // Get submissions if any
  const submissions = await db.query(
    `SELECT cs.*, u.name as submitted_by_name
     FROM chore_submissions cs
     JOIN users u ON cs.user_id = u.id
     WHERE cs.chore_id = ?
     ORDER BY cs.submitted_at DESC`,
    [req.params.id]
  );

  res.json({
    status: 'success',
    data: {
      chore,
      submissions
    }
  });
}));

 // Create chore
router.post('/', protect, catchAsync(async (req, res) => {
  // Only parents can create chores
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can create chores'
    });
  }

  // Accept expanded fields to support advanced single-chore features
  const {
    title,
    description,
    reward_amount,
    reward_type,
    requires_photo,
    acceptance_timer,
    auto_assign,
    assigned_to,
    rotation_type,
    rotation_members,
    priority,
    estimated_duration,
    difficulty_level,
    category
  } = req.body;

  if (!title || reward_amount === undefined || reward_amount === null) {
    return res.status(400).json({
      status: 'fail',
      message: 'Title and reward amount are required'
    });
  }

  // Determine initial assignment if auto_assign is requested
  let initialAssignedTo = null;
  if (auto_assign) {
    if (rotation_type === 'none' && assigned_to) {
      initialAssignedTo = assigned_to;
    } else if ((rotation_type === 'round_robin' || rotation_type === 'random') && rotation_members) {
      let members = rotation_members;
      try {
        // rotation_members may come as a JSON string or an array
        if (typeof rotation_members === 'string') {
          members = JSON.parse(rotation_members);
        }
      } catch (e) {
        members = rotation_members;
      }

      if (Array.isArray(members) && members.length > 0) {
        if (rotation_type === 'round_robin') {
          // For a single chore we start with the first member (recurring generation handles rotation history)
          initialAssignedTo = members[0];
        } else if (rotation_type === 'random') {
          initialAssignedTo = members[Math.floor(Math.random() * members.length)];
        }
      }
    }
  }

  // Use transaction to create chore and optional assignment atomically
  const result = await db.transaction(async (connection) => {
    const status = initialAssignedTo ? 'assigned' : 'available';
    const assignedAt = initialAssignedTo ? new Date() : null;

    const [insertResult] = await connection.execute(
      `INSERT INTO chores (
        family_id, template_id, title, description, reward_type, reward_amount,
        current_reward, requires_photo, acceptance_timer, status, priority, due_date,
        estimated_duration, difficulty_level, category, created_by, assigned_to, assigned_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.family_id,
        null, // template_id
        title,
        description || null,
        reward_type || 'money',
        reward_amount,
        reward_amount, // current_reward initial
        requires_photo ? 1 : 0,
        acceptance_timer || 5,
        status,
        priority || 'medium',
        null, // due_date
        estimated_duration || null,
        difficulty_level || 'medium',
        category || null,
        req.user.id,
        initialAssignedTo || null,
        assignedAt,
        JSON.stringify({
          created_at: new Date().toISOString(),
          rotation_type: rotation_type || 'none',
          rotation_members: rotation_members ? (typeof rotation_members === 'string' ? rotation_members : JSON.stringify(rotation_members)) : null,
          auto_assign: auto_assign ? true : false
        })
      ]
    );

    const choreId = insertResult.insertId;

    // If assigned, create assignment record
    if (initialAssignedTo) {
      await connection.execute(
        `INSERT INTO chore_assignments (
          chore_id, user_id, assigned_by, assigned_at, status, acceptance_deadline
        ) VALUES (?, ?, ?, NOW(), ?, ?)
        `,
        [
          choreId,
          initialAssignedTo,
          req.user.id,
          'pending',
          // acceptance_deadline based on acceptance_timer
          (() => {
            const deadline = new Date();
            deadline.setMinutes(deadline.getMinutes() + (acceptance_timer || 5));
            return deadline;
          })()
        ]
      );
    }

    return choreId;
  });

  const [chore] = await db.query(
    `SELECT c.*, u.name as assignee_name
     FROM chores c
     LEFT JOIN users u ON c.assigned_to = u.id
     WHERE c.id = ?`,
    [result]
  );

  res.status(201).json({
    status: 'success',
    data: { chore }
  });
}));

// Update chore
router.patch('/:id', protect, checkChoreAccess, catchAsync(async (req, res) => {
  // Only parents or the creator can update chores
  const [chore] = await db.query('SELECT * FROM chores WHERE id = ?', [req.params.id]);
  
  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found'
    });
  }
  
  if (req.user.role !== 'parent' && chore.created_by !== req.user.id) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to update this chore'
    });
  }

  const allowedFields = ['title', 'description', 'reward_amount', 'reward_type', 'requires_photo', 'acceptance_timer', 'status'];
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

  // Build dynamic query
  const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  await db.query(
    `UPDATE chores SET ${setClause}, updated_at = NOW() WHERE id = ?`,
    values
  );

  const [updatedChore] = await db.query('SELECT * FROM chores WHERE id = ?', [req.params.id]);

  res.json({
    status: 'success',
    data: { chore: updatedChore }
  });
}));

// Assign chore to a user
router.post('/:id/assign', protect, catchAsync(async (req, res) => {
  // Only parents can assign chores
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can assign chores'
    });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({
      status: 'fail',
      message: 'User ID is required'
    });
  }

  // Check if chore exists and belongs to the family
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND family_id = ?',
    [req.params.id, req.user.family_id]
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found'
    });
  }

  // Check if user exists and belongs to the family
  const [user] = await db.query(
    'SELECT * FROM users WHERE id = ? AND family_id = ?',
    [userId, req.user.family_id]
  );

  if (!user) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found'
    });
  }

  // Create assignment
  const acceptanceDeadline = new Date();
  acceptanceDeadline.setMinutes(acceptanceDeadline.getMinutes() + (chore.acceptance_timer || 5));

  await db.transaction(async (connection) => {
    // Create assignment record
    await connection.execute(
      `INSERT INTO chore_assignments 
       (chore_id, user_id, assigned_by, status, acceptance_deadline) 
       VALUES (?, ?, ?, ?, ?)`,
      [chore.id, userId, req.user.id, 'pending', acceptanceDeadline]
    );

    // Update chore status
    await connection.execute(
      'UPDATE chores SET assigned_to = ?, assigned_at = NOW(), status = ?, updated_at = NOW() WHERE id = ?',
      [userId, 'pending_acceptance', chore.id]
    );
  });

  const [updatedChore] = await db.query(
    'SELECT c.*, u.name as assignee_name FROM chores c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id = ?',
    [req.params.id]
  );

  res.json({
    status: 'success',
    data: { 
      chore: updatedChore,
      assigned_to: user.name
    }
  });
}));

// Accept assigned chore
router.post('/:id/accept', protect, catchAsync(async (req, res) => {
  // Check if chore exists and is assigned to the user
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND assigned_to = ? AND status = ?',
    [req.params.id, req.user.id, 'pending_acceptance']
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found or not assigned to you'
    });
  }

  // Update assignment
  await db.transaction(async (connection) => {
    await connection.execute(
      'UPDATE chore_assignments SET status = ?, accepted_at = NOW() WHERE chore_id = ? AND user_id = ? AND status = ?',
      ['accepted', chore.id, req.user.id, 'pending']
    );

    // Update chore status
    await connection.execute(
      'UPDATE chores SET status = ?, accepted_at = NOW(), updated_at = NOW() WHERE id = ?',
      ['in_progress', chore.id]
    );
  });

  res.json({
    status: 'success',
    message: 'Chore accepted successfully'
  });
}));

// Decline assigned chore
router.post('/:id/decline', protect, catchAsync(async (req, res) => {
  // Check if chore exists and is assigned to the user
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND assigned_to = ? AND status = ?',
    [req.params.id, req.user.id, 'pending_acceptance']
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found or not assigned to you'
    });
  }

  // Update assignment
  await db.transaction(async (connection) => {
    await connection.execute(
      'UPDATE chore_assignments SET status = ?, declined_at = NOW() WHERE chore_id = ? AND user_id = ? AND status = ?',
      ['declined', chore.id, req.user.id, 'pending']
    );

    // Reset chore to available
    await connection.execute(
      'UPDATE chores SET status = ?, assigned_to = NULL, assigned_at = NULL, updated_at = NOW() WHERE id = ?',
      ['available', chore.id]
    );
  });

  res.json({
    status: 'success',
    message: 'Chore declined successfully'
  });
}));

// Submit completed chore
router.post('/:id/submit', protect, upload.single('photo'), catchAsync(async (req, res) => {
  // Check if chore exists and is assigned to the user
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND assigned_to = ? AND status = ?',
    [req.params.id, req.user.id, 'in_progress']
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found or not in progress'
    });
  }

  // Check if photo is required but not provided
  if (chore.requires_photo && !req.file) {
    return res.status(400).json({
      status: 'fail',
      message: 'Photo is required for this chore'
    });
  }

  // Get the latest assignment
  const [assignment] = await db.query(
    'SELECT * FROM chore_assignments WHERE chore_id = ? AND user_id = ? ORDER BY assigned_at DESC LIMIT 1',
    [chore.id, req.user.id]
  );

  // Create submission
  const result = await db.transaction(async (connection) => {
    // Create submission record
    const [submissionResult] = await connection.execute(
      `INSERT INTO chore_submissions 
       (chore_id, user_id, assignment_id, photo_path, notes, submitted_at, status) 
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [
        chore.id, 
        req.user.id, 
        assignment ? assignment.id : null, 
        req.file ? req.file.path : null, 
        req.body.notes || null, 
        'pending'
      ]
    );

    // Update chore status
    await connection.execute(
      'UPDATE chores SET status = ?, updated_at = NOW() WHERE id = ?',
      ['pending_approval', chore.id]
    );

    return submissionResult.insertId;
  });

  const [submission] = await db.query('SELECT * FROM chore_submissions WHERE id = ?', [result]);

  res.status(201).json({
    status: 'success',
    data: { submission }
  });
}));

// Approve chore submission (parent only)
router.post('/:id/approve', protect, catchAsync(async (req, res) => {
  // Only parents can approve chores
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can approve chores'
    });
  }

  // Check if chore exists and belongs to the family
  const [chore] = await db.query(
    'SELECT c.*, u.name as assignee_name FROM chores c JOIN users u ON c.assigned_to = u.id WHERE c.id = ? AND c.family_id = ? AND c.status = ?',
    [req.params.id, req.user.family_id, 'pending_approval']
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found or not pending approval'
    });
  }

  // Get the latest submission
  const [submission] = await db.query(
    'SELECT * FROM chore_submissions WHERE chore_id = ? AND user_id = ? ORDER BY submitted_at DESC LIMIT 1',
    [chore.id, chore.assigned_to]
  );

  if (!submission) {
    return res.status(404).json({
      status: 'fail',
      message: 'No submission found for this chore'
    });
  }

  // Process approval
  await db.transaction(async (connection) => {
    // Update submission status
    await connection.execute(
      'UPDATE chore_submissions SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
      ['approved', req.user.id, submission.id]
    );

    // Create completed task record
    await connection.execute(
      `INSERT INTO completed_tasks 
       (chore_id, user_id, submission_id, chore_title, chore_description, reward_type, reward_earned, 
        completed_at, approved_by, approved_at, photo_path, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        chore.id, 
        chore.assigned_to, 
        submission.id, 
        chore.title, 
        chore.description, 
        chore.reward_type, 
        chore.current_reward, 
        submission.submitted_at, 
        req.user.id, 
        submission.photo_path, 
        submission.notes
      ]
    );

    // Update user earnings
    if (chore.reward_type === 'money') {
      await connection.execute(
        'UPDATE users SET earnings = earnings + ? WHERE id = ?',
        [chore.current_reward, chore.assigned_to]
      );
    } else if (chore.reward_type === 'screen_time') {
      await connection.execute(
        'UPDATE users SET screen_time_earned = screen_time_earned + ? WHERE id = ?',
        [chore.current_reward, chore.assigned_to]
      );
    }

    // Update chore status
    await connection.execute(
      'UPDATE chores SET status = ?, completed_at = NOW(), updated_at = NOW() WHERE id = ?',
      ['completed', chore.id]
    );
  });

  res.json({
    status: 'success',
    message: `Chore approved and ${chore.reward_type === 'money' ? '$' + chore.current_reward : chore.current_reward + ' minutes'} awarded to ${chore.assignee_name}`
  });
}));

// Reject chore submission (parent only)
router.post('/:id/reject', protect, catchAsync(async (req, res) => {
  // Only parents can reject chores
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can reject chores'
    });
  }

  const { feedback } = req.body;

  // Check if chore exists and belongs to the family
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND family_id = ? AND status = ?',
    [req.params.id, req.user.family_id, 'pending_approval']
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found or not pending approval'
    });
  }

  // Get the latest submission
  const [submission] = await db.query(
    'SELECT * FROM chore_submissions WHERE chore_id = ? AND user_id = ? ORDER BY submitted_at DESC LIMIT 1',
    [chore.id, chore.assigned_to]
  );

  if (!submission) {
    return res.status(404).json({
      status: 'fail',
      message: 'No submission found for this chore'
    });
  }

  // Process rejection
  await db.transaction(async (connection) => {
    // Update submission status
    await connection.execute(
      'UPDATE chore_submissions SET status = ?, reviewed_at = NOW(), reviewed_by = ?, review_notes = ? WHERE id = ?',
      ['rejected', req.user.id, feedback || 'Needs improvement', submission.id]
    );

    // Update chore status back to in progress
    await connection.execute(
      'UPDATE chores SET status = ?, updated_at = NOW() WHERE id = ?',
      ['in_progress', chore.id]
    );
  });

  res.json({
    status: 'success',
    message: 'Chore submission rejected'
  });
}));

// Delete chore (parent only)
router.delete('/:id', protect, catchAsync(async (req, res) => {
  // Only parents can delete chores
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only parents can delete chores'
    });
  }

  // Check if chore exists and belongs to the family
  const [chore] = await db.query(
    'SELECT * FROM chores WHERE id = ? AND family_id = ?',
    [req.params.id, req.user.family_id]
  );

  if (!chore) {
    return res.status(404).json({
      status: 'fail',
      message: 'Chore not found'
    });
  }

  // Don't allow deletion of completed chores
  if (chore.status === 'completed') {
    return res.status(400).json({
      status: 'fail',
      message: 'Completed chores cannot be deleted'
    });
  }

  await db.query('DELETE FROM chores WHERE id = ?', [req.params.id]);

  res.json({
    status: 'success',
    message: 'Chore deleted successfully'
  });
}));

module.exports = router;
