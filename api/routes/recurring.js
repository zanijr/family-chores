const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const db = require('../config/database');
const router = express.Router();

// Get all recurring chores for the family
router.get('/', protect, catchAsync(async (req, res) => {
  const recurringChores = await db.query(
    `SELECT rc.*, u.name as created_by_name, 
     CASE WHEN rc.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name
     FROM recurring_chores rc
     JOIN users u ON rc.created_by = u.id
     LEFT JOIN users au ON rc.assigned_to = au.id
     WHERE rc.family_id = ?
     ORDER BY rc.next_due_date ASC`,
    [req.user.family_id]
  );

  res.json({
    status: 'success',
    data: { recurringChores }
  });
}));

// Get a single recurring chore
router.get('/:id', protect, catchAsync(async (req, res) => {
  const [recurringChore] = await db.query(
    `SELECT rc.*, u.name as created_by_name, 
     CASE WHEN rc.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name
     FROM recurring_chores rc
     JOIN users u ON rc.created_by = u.id
     LEFT JOIN users au ON rc.assigned_to = au.id
     WHERE rc.id = ? AND rc.family_id = ?`,
    [req.params.id, req.user.family_id]
  );

  if (!recurringChore) {
    throw new AppError('Recurring chore not found', 404);
  }

  // Get history for this recurring chore
  const history = await db.query(
    `SELECT rch.*, c.title, c.status as chore_status,
     CASE WHEN rch.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name,
     CASE WHEN rch.completed_by IS NOT NULL THEN cu.name ELSE NULL END as completed_by_name
     FROM recurring_chore_history rch
     JOIN chores c ON rch.chore_id = c.id
     LEFT JOIN users au ON rch.assigned_to = au.id
     LEFT JOIN users cu ON rch.completed_by = cu.id
     WHERE rch.recurring_id = ?
     ORDER BY rch.due_date DESC`,
    [req.params.id]
  );

  res.json({
    status: 'success',
    data: { 
      recurringChore,
      history
    }
  });
}));

// Create a new recurring chore
router.post('/', protect, catchAsync(async (req, res) => {
  // Only parents can create recurring chores
  if (req.user.role !== 'parent') {
    throw new AppError('Only parents can create recurring chores', 403);
  }

  const {
    title,
    description,
    reward_type,
    reward_amount,
    requires_photo,
    frequency,
    day_of_week,
    day_of_month,
    custom_schedule,
    start_date,
    end_date,
    auto_assign,
    assigned_to,
    rotation_type,
    rotation_members,
    priority,
    estimated_duration,
    difficulty_level,
    category,
    template_id
  } = req.body;

  // Validate required fields
  if (!title || !frequency || !start_date || !reward_type || !reward_amount) {
    throw new AppError('Missing required fields', 400);
  }

  // Calculate next due date based on frequency
  let nextDueDate = new Date(start_date);
  
  // Set the time to 9:00 AM
  nextDueDate.setHours(9, 0, 0, 0);
  
  // If the calculated date is in the past, move to the next occurrence
  if (nextDueDate < new Date()) {
    switch (frequency) {
      case 'daily':
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
      case 'weekly':
        if (day_of_week) {
          // Find the next occurrence of the specified day of week
          const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDay = daysOfWeek.indexOf(day_of_week.toLowerCase());
          if (targetDay !== -1) {
            const currentDay = nextDueDate.getDay();
            const daysToAdd = (targetDay + 7 - currentDay) % 7;
            nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);
          } else {
            nextDueDate.setDate(nextDueDate.getDate() + 7);
          }
        } else {
          nextDueDate.setDate(nextDueDate.getDate() + 7);
        }
        break;
      case 'monthly':
        if (day_of_month) {
          // Set to the specified day of the month
          nextDueDate.setDate(day_of_month);
          // If this date is still in the past, move to next month
          if (nextDueDate < new Date()) {
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          }
        } else {
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        }
        break;
      case 'custom':
        // Custom schedules would need more complex logic
        // For now, just set it to tomorrow
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
    }
  }

  // Insert the recurring chore
  const result = await db.query(
    `INSERT INTO recurring_chores (
      family_id, template_id, title, description, reward_type, reward_amount,
      requires_photo, frequency, day_of_week, day_of_month, custom_schedule,
      start_date, end_date, next_due_date, auto_assign, assigned_to,
      rotation_type, rotation_members, priority, estimated_duration,
      difficulty_level, category, created_by, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.family_id,
      template_id || null,
      title,
      description || null,
      reward_type,
      reward_amount,
      requires_photo ? 1 : 0,
      frequency,
      day_of_week || null,
      day_of_month || null,
      custom_schedule || null,
      start_date,
      end_date || null,
      nextDueDate,
      auto_assign ? 1 : 0,
      assigned_to || null,
      rotation_type || 'none',
      rotation_members ? JSON.stringify(rotation_members) : null,
      priority || 'medium',
      estimated_duration || null,
      difficulty_level || 'medium',
      category || null,
      req.user.id,
      JSON.stringify({
        created_at: new Date().toISOString(),
        created_by_name: req.user.name
      })
    ]
  );

  // Get the created recurring chore
  const [recurringChore] = await db.query(
    `SELECT rc.*, u.name as created_by_name, 
     CASE WHEN rc.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name
     FROM recurring_chores rc
     JOIN users u ON rc.created_by = u.id
     LEFT JOIN users au ON rc.assigned_to = au.id
     WHERE rc.id = ?`,
    [result.insertId]
  );

  res.status(201).json({
    status: 'success',
    data: { recurringChore }
  });
}));

// Update a recurring chore
router.put('/:id', protect, catchAsync(async (req, res) => {
  // Only parents can update recurring chores
  if (req.user.role !== 'parent') {
    throw new AppError('Only parents can update recurring chores', 403);
  }

  // Check if the recurring chore exists and belongs to the family
  const [existingChore] = await db.query(
    'SELECT * FROM recurring_chores WHERE id = ? AND family_id = ?',
    [req.params.id, req.user.family_id]
  );

  if (!existingChore) {
    throw new AppError('Recurring chore not found', 404);
  }

  const {
    title,
    description,
    reward_type,
    reward_amount,
    requires_photo,
    frequency,
    day_of_week,
    day_of_month,
    custom_schedule,
    start_date,
    end_date,
    auto_assign,
    assigned_to,
    rotation_type,
    rotation_members,
    priority,
    estimated_duration,
    difficulty_level,
    category,
    is_active,
    template_id
  } = req.body;

  // Calculate next due date if frequency or related fields changed
  let nextDueDate = existingChore.next_due_date;
  
  if (frequency || day_of_week || day_of_month || start_date) {
    // Recalculate next due date
    nextDueDate = new Date(start_date || existingChore.start_date);
    nextDueDate.setHours(9, 0, 0, 0);
    
    const newFrequency = frequency || existingChore.frequency;
    
    // If the calculated date is in the past, move to the next occurrence
    if (nextDueDate < new Date()) {
      switch (newFrequency) {
        case 'daily':
          nextDueDate.setDate(nextDueDate.getDate() + 1);
          break;
        case 'weekly':
          const newDayOfWeek = day_of_week || existingChore.day_of_week;
          if (newDayOfWeek) {
            // Find the next occurrence of the specified day of week
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const targetDay = daysOfWeek.indexOf(newDayOfWeek.toLowerCase());
            if (targetDay !== -1) {
              const currentDay = nextDueDate.getDay();
              const daysToAdd = (targetDay + 7 - currentDay) % 7;
              nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);
            } else {
              nextDueDate.setDate(nextDueDate.getDate() + 7);
            }
          } else {
            nextDueDate.setDate(nextDueDate.getDate() + 7);
          }
          break;
        case 'monthly':
          const newDayOfMonth = day_of_month || existingChore.day_of_month;
          if (newDayOfMonth) {
            // Set to the specified day of the month
            nextDueDate.setDate(newDayOfMonth);
            // If this date is still in the past, move to next month
            if (nextDueDate < new Date()) {
              nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            }
          } else {
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          }
          break;
        case 'custom':
          // Custom schedules would need more complex logic
          // For now, just set it to tomorrow
          nextDueDate.setDate(nextDueDate.getDate() + 1);
          break;
      }
    }
  }

  // Update the recurring chore
  await db.query(
    `UPDATE recurring_chores SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      reward_type = COALESCE(?, reward_type),
      reward_amount = COALESCE(?, reward_amount),
      requires_photo = COALESCE(?, requires_photo),
      frequency = COALESCE(?, frequency),
      day_of_week = COALESCE(?, day_of_week),
      day_of_month = COALESCE(?, day_of_month),
      custom_schedule = COALESCE(?, custom_schedule),
      start_date = COALESCE(?, start_date),
      end_date = ?,
      next_due_date = ?,
      auto_assign = COALESCE(?, auto_assign),
      assigned_to = ?,
      rotation_type = COALESCE(?, rotation_type),
      rotation_members = ?,
      priority = COALESCE(?, priority),
      estimated_duration = COALESCE(?, estimated_duration),
      difficulty_level = COALESCE(?, difficulty_level),
      category = COALESCE(?, category),
      is_active = COALESCE(?, is_active),
      template_id = ?,
      updated_at = NOW()
    WHERE id = ? AND family_id = ?`,
    [
      title,
      description,
      reward_type,
      reward_amount,
      requires_photo !== undefined ? (requires_photo ? 1 : 0) : null,
      frequency,
      day_of_week,
      day_of_month,
      custom_schedule,
      start_date,
      end_date, // Allow setting to NULL
      nextDueDate,
      auto_assign !== undefined ? (auto_assign ? 1 : 0) : null,
      assigned_to, // Allow setting to NULL
      rotation_type,
      rotation_members ? JSON.stringify(rotation_members) : null,
      priority,
      estimated_duration,
      difficulty_level,
      category,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      template_id, // Allow setting to NULL
      req.params.id,
      req.user.family_id
    ]
  );

  // Get the updated recurring chore
  const [recurringChore] = await db.query(
    `SELECT rc.*, u.name as created_by_name, 
     CASE WHEN rc.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name
     FROM recurring_chores rc
     JOIN users u ON rc.created_by = u.id
     LEFT JOIN users au ON rc.assigned_to = au.id
     WHERE rc.id = ?`,
    [req.params.id]
  );

  res.json({
    status: 'success',
    data: { recurringChore }
  });
}));

// Delete a recurring chore
router.delete('/:id', protect, catchAsync(async (req, res) => {
  // Only parents can delete recurring chores
  if (req.user.role !== 'parent') {
    throw new AppError('Only parents can delete recurring chores', 403);
  }

  // Check if the recurring chore exists and belongs to the family
  const [existingChore] = await db.query(
    'SELECT * FROM recurring_chores WHERE id = ? AND family_id = ?',
    [req.params.id, req.user.family_id]
  );

  if (!existingChore) {
    throw new AppError('Recurring chore not found', 404);
  }

  // Delete the recurring chore
  await db.query(
    'DELETE FROM recurring_chores WHERE id = ?',
    [req.params.id]
  );

  res.json({
    status: 'success',
    message: 'Recurring chore deleted successfully'
  });
}));

// Generate chores from recurring chores
router.post('/generate', protect, catchAsync(async (req, res) => {
  // Only parents can manually generate chores
  if (req.user.role !== 'parent') {
    throw new AppError('Only parents can generate chores', 403);
  }

  const { recurringId } = req.body;

  // If recurringId is provided, generate only for that specific recurring chore
  // Otherwise, generate for all active recurring chores due today
  let recurringChores;
  
  if (recurringId) {
    recurringChores = await db.query(
      `SELECT * FROM recurring_chores 
       WHERE id = ? AND family_id = ? AND is_active = 1`,
      [recurringId, req.user.family_id]
    );
  } else {
    // Get all active recurring chores that are due today or overdue
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    recurringChores = await db.query(
      `SELECT * FROM recurring_chores 
       WHERE family_id = ? AND is_active = 1 
       AND next_due_date <= ? 
       AND (end_date IS NULL OR end_date >= CURDATE())`,
      [req.user.family_id, today]
    );
  }

  if (recurringChores.length === 0) {
    return res.json({
      status: 'success',
      message: 'No recurring chores to generate',
      data: { generated: 0 }
    });
  }

  // Generate chores for each recurring chore
  const generatedChores = [];
  
  for (const recurringChore of recurringChores) {
    // Check if a chore has already been generated for this recurring chore and due date
    const [existingHistory] = await db.query(
      `SELECT * FROM recurring_chore_history 
       WHERE recurring_id = ? 
       AND DATE(due_date) = DATE(?)`,
      [recurringChore.id, recurringChore.next_due_date]
    );

    if (existingHistory) {
      continue; // Skip if already generated for this date
    }

    // Determine who to assign the chore to
    let assignedTo = null;
    
    if (recurringChore.auto_assign) {
      if (recurringChore.rotation_type === 'none' && recurringChore.assigned_to) {
        // Fixed assignment
        assignedTo = recurringChore.assigned_to;
      } else if (recurringChore.rotation_type === 'round_robin' && recurringChore.rotation_members) {
        // Round robin assignment
        const members = JSON.parse(recurringChore.rotation_members);
        
        if (members && members.length > 0) {
          // Get the last assigned member
          const [lastHistory] = await db.query(
            `SELECT * FROM recurring_chore_history 
             WHERE recurring_id = ? 
             ORDER BY due_date DESC LIMIT 1`,
            [recurringChore.id]
          );
          
          if (lastHistory && lastHistory.assigned_to) {
            // Find the index of the last assigned member
            const lastIndex = members.indexOf(lastHistory.assigned_to);
            // Get the next member in the rotation
            assignedTo = members[(lastIndex + 1) % members.length];
          } else {
            // Start with the first member
            assignedTo = members[0];
          }
        }
      } else if (recurringChore.rotation_type === 'random' && recurringChore.rotation_members) {
        // Random assignment
        const members = JSON.parse(recurringChore.rotation_members);
        
        if (members && members.length > 0) {
          // Randomly select a member
          const randomIndex = Math.floor(Math.random() * members.length);
          assignedTo = members[randomIndex];
        }
      }
    }

    // Create the chore
    const choreResult = await db.query(
      `INSERT INTO chores (
        family_id, template_id, title, description, reward_type, reward_amount,
        current_reward, requires_photo, status, priority, due_date,
        estimated_duration, difficulty_level, category, created_by, assigned_to,
        assigned_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recurringChore.family_id,
        recurringChore.template_id,
        recurringChore.title,
        recurringChore.description,
        recurringChore.reward_type,
        recurringChore.reward_amount,
        recurringChore.reward_amount, // Initial current_reward is the same as reward_amount
        recurringChore.requires_photo,
        assignedTo ? 'assigned' : 'available',
        recurringChore.priority,
        recurringChore.next_due_date,
        recurringChore.estimated_duration,
        recurringChore.difficulty_level,
        recurringChore.category,
        req.user.id, // Created by the user who triggered the generation
        assignedTo,
        assignedTo ? new Date() : null,
        JSON.stringify({
          recurring_id: recurringChore.id,
          generated_at: new Date().toISOString(),
          generated_by: req.user.id
        })
      ]
    );

    // Create assignment record if assigned
    if (assignedTo) {
      await db.query(
        `INSERT INTO chore_assignments (
          chore_id, user_id, assigned_by, assigned_at, status
        ) VALUES (?, ?, ?, NOW(), ?)`,
        [
          choreResult.insertId,
          assignedTo,
          req.user.id,
          'pending'
        ]
      );
    }

    // Record in history
    await db.query(
      `INSERT INTO recurring_chore_history (
        recurring_id, chore_id, due_date, status, assigned_to
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        recurringChore.id,
        choreResult.insertId,
        recurringChore.next_due_date,
        'generated',
        assignedTo
      ]
    );

    // Calculate the next due date for the recurring chore
    let nextDueDate = new Date(recurringChore.next_due_date);
    
    switch (recurringChore.frequency) {
      case 'daily':
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
      case 'weekly':
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        break;
      case 'monthly':
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        break;
      case 'custom':
        // Custom schedules would need more complex logic
        // For now, just set it to a week from now
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        break;
    }

    // Update the recurring chore with the new next_due_date and last_generated
    await db.query(
      `UPDATE recurring_chores SET
        next_due_date = ?,
        last_generated = NOW()
      WHERE id = ?`,
      [nextDueDate, recurringChore.id]
    );

    // Get the generated chore details
    const [generatedChore] = await db.query(
      `SELECT c.*, u.name as created_by_name, 
       CASE WHEN c.assigned_to IS NOT NULL THEN au.name ELSE NULL END as assigned_to_name
       FROM chores c
       JOIN users u ON c.created_by = u.id
       LEFT JOIN users au ON c.assigned_to = au.id
       WHERE c.id = ?`,
      [choreResult.insertId]
    );

    generatedChores.push(generatedChore);
  }

  res.json({
    status: 'success',
    message: `Generated ${generatedChores.length} chores`,
    data: {
      generated: generatedChores.length,
      chores: generatedChores
    }
  });
}));

module.exports = router;
