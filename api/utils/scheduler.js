const cron = require('node-cron');
const backupManager = require('./backup');
const db = require('../config/database');

// Configuration
const BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily
const RECURRING_CHORES_SCHEDULE = process.env.RECURRING_CHORES_SCHEDULE || '0 6 * * *'; // Default: 6 AM daily

/**
 * Initialize scheduled tasks
 */
function initScheduledTasks() {
  console.log('Initializing scheduled tasks...');
  
  // Schedule daily backup
  if (cron.validate(BACKUP_SCHEDULE)) {
    console.log(`Scheduling automatic backups: ${BACKUP_SCHEDULE}`);
    
    cron.schedule(BACKUP_SCHEDULE, async () => {
      console.log('Running scheduled backup...');
      try {
        const result = await backupManager.createFullBackup();
        console.log('Scheduled backup completed:', result.status);
      } catch (error) {
        console.error('Scheduled backup failed:', error);
      }
    });
  } else {
    console.error(`Invalid backup schedule: ${BACKUP_SCHEDULE}`);
  }
  
  // Schedule recurring chores generation
  if (cron.validate(RECURRING_CHORES_SCHEDULE)) {
    console.log(`Scheduling recurring chores generation: ${RECURRING_CHORES_SCHEDULE}`);
    
    cron.schedule(RECURRING_CHORES_SCHEDULE, async () => {
      console.log('Generating chores from recurring templates...');
      try {
        await generateRecurringChores();
        console.log('Recurring chores generation completed');
      } catch (error) {
        console.error('Recurring chores generation failed:', error);
      }
    });
  } else {
    console.error(`Invalid recurring chores schedule: ${RECURRING_CHORES_SCHEDULE}`);
  }
}

/**
 * Generate chores from recurring templates that are due
 */
async function generateRecurringChores() {
  try {
    // Get all active recurring chores that are due today or overdue
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    const recurringChores = await db.query(
      `SELECT * FROM recurring_chores 
       WHERE is_active = 1 
       AND next_due_date <= ? 
       AND (end_date IS NULL OR end_date >= CURDATE())`,
      [today]
    );

    console.log(`Found ${recurringChores.length} recurring chores to process`);
    
    if (recurringChores.length === 0) {
      return { generated: 0 };
    }

    // Generate chores for each recurring chore
    let generatedCount = 0;
    
    for (const recurringChore of recurringChores) {
      // Check if a chore has already been generated for this recurring chore and due date
      const [existingHistory] = await db.query(
        `SELECT * FROM recurring_chore_history 
         WHERE recurring_id = ? 
         AND DATE(due_date) = DATE(?)`,
        [recurringChore.id, recurringChore.next_due_date]
      );

      if (existingHistory) {
        console.log(`Skipping recurring chore ${recurringChore.id}: already generated for ${recurringChore.next_due_date}`);
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
          recurringChore.created_by, // Created by the original creator of the recurring chore
          assignedTo,
          assignedTo ? new Date() : null,
          JSON.stringify({
            recurring_id: recurringChore.id,
            generated_at: new Date().toISOString(),
            generated_by: 'system'
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
            recurringChore.created_by,
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

      generatedCount++;
      console.log(`Generated chore ${choreResult.insertId} from recurring chore ${recurringChore.id}`);
    }

    return { generated: generatedCount };
  } catch (error) {
    console.error('Error generating recurring chores:', error);
    throw error;
  }
}

module.exports = {
  initScheduledTasks
};
