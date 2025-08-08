const db = require('../config/database');
const fs = require('fs');
const path = require('path');

// Email and push notifications are disabled for now
// This is a simplified version for basic in-app notifications

/**
 * Send an email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template name
 * @param {Object} options.data - Template data
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail(options) {
  try {
    const { to, subject, template, data } = options;
    
    // Check if email is enabled in the system
    if (!process.env.EMAIL_ENABLED || process.env.EMAIL_ENABLED !== 'true') {
      console.log('Email notifications are disabled');
      return { success: false, message: 'Email notifications are disabled' };
    }
    
    // Check if template exists
    if (!template || !emailTemplates[template]) {
      console.error(`Email template "${template}" not found`);
      return { success: false, message: `Email template "${template}" not found` };
    }
    
    // Render template
    const html = emailTemplates[template]({ ...data, appName: process.env.APP_NAME || 'Family Chores' });
    
    // Send email
    const result = await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to,
      subject,
      html
    });
    
    console.log(`Email sent to ${to}: ${subject}`);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a push notification
 * @param {Object} options - Push notification options
 * @param {Object} options.subscription - Push subscription object
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {Object} options.data - Additional data
 * @returns {Promise<Object>} - Send result
 */
async function sendPushNotification(options) {
  try {
    const { subscription, title, body, data } = options;
    
    // Check if push is enabled in the system
    if (!process.env.PUSH_ENABLED || process.env.PUSH_ENABLED !== 'true') {
      console.log('Push notifications are disabled');
      return { success: false, message: 'Push notifications are disabled' };
    }
    
    // Check if subscription is valid
    if (!subscription || !subscription.endpoint) {
      console.error('Invalid push subscription');
      return { success: false, message: 'Invalid push subscription' };
    }
    
    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body,
      data: {
        ...data,
        timestamp: new Date().toISOString()
      },
      icon: '/icons/notification-icon.png',
      badge: '/icons/badge-icon.png'
    });
    
    // Send push notification
    const result = await webpush.sendNotification(subscription, payload);
    
    console.log(`Push notification sent: ${title}`);
    
    return { success: true, statusCode: result.statusCode };
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save an in-app notification
 * @param {Object} options - Notification options
 * @param {number} options.userId - User ID
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.link - Optional link
 * @param {Object} options.data - Additional data
 * @returns {Promise<Object>} - Save result
 */
async function saveInAppNotification(options) {
  try {
    const { userId, type, title, message, link, data } = options;
    
    // Insert notification into database
    const result = await db.query(
      `INSERT INTO user_notifications (
        user_id, notification_type, title, message, link, data, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        type,
        title,
        message,
        link || null,
        data ? JSON.stringify(data) : null,
        0 // Not read
      ]
    );
    
    console.log(`In-app notification saved for user ${userId}: ${title}`);
    
    return { success: true, notificationId: result.insertId };
  } catch (error) {
    console.error('Failed to save in-app notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user notification settings
 * @param {number} userId - User ID
 * @returns {Promise<Object>} - Notification settings
 */
async function getUserNotificationSettings(userId) {
  try {
    const [user] = await db.query(
      'SELECT notification_settings FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      return { email: false, push: false, sms: false, in_app: true };
    }
    
    // Parse notification settings
    let settings = { email: true, push: true, sms: false, in_app: true };
    
    if (user.notification_settings) {
      try {
        const parsedSettings = JSON.parse(user.notification_settings);
        settings = { ...settings, ...parsedSettings };
      } catch (e) {
        console.error('Failed to parse notification settings:', e);
      }
    }
    
    return settings;
  } catch (error) {
    console.error('Failed to get user notification settings:', error);
    return { email: false, push: false, sms: false, in_app: true };
  }
}

/**
 * Get user push subscriptions
 * @param {number} userId - User ID
 * @returns {Promise<Array>} - Push subscriptions
 */
async function getUserPushSubscriptions(userId) {
  try {
    const subscriptions = await db.query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    
    return subscriptions.map(sub => {
      try {
        return JSON.parse(sub.subscription);
      } catch (e) {
        console.error('Failed to parse push subscription:', e);
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    console.error('Failed to get user push subscriptions:', error);
    return [];
  }
}

/**
 * Send a notification to a user through all enabled channels
 * @param {Object} options - Notification options
 * @param {number} options.userId - User ID
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.emailSubject - Email subject (if different from title)
 * @param {string} options.emailTemplate - Email template name
 * @param {Object} options.emailData - Email template data
 * @param {string} options.link - Optional link
 * @param {Object} options.data - Additional data
 * @returns {Promise<Object>} - Notification results
 */
async function notifyUser(options) {
  try {
    const {
      userId,
      type,
      title,
      message,
      emailSubject,
      emailTemplate,
      emailData,
      link,
      data
    } = options;
    
    // Get user details
    const [user] = await db.query(
      'SELECT id, name, email, notification_settings FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      console.error(`User not found: ${userId}`);
      return { success: false, message: 'User not found' };
    }
    
    // Get user notification settings
    const settings = await getUserNotificationSettings(userId);
    
    const results = {
      inApp: null,
      email: null,
      push: null
    };
    
    // Save in-app notification
    if (settings.in_app) {
      results.inApp = await saveInAppNotification({
        userId,
        type,
        title,
        message,
        link,
        data
      });
    }
    
    // Send email notification
    if (settings.email && user.email && emailTemplate) {
      results.email = await sendEmail({
        to: user.email,
        subject: emailSubject || title,
        template: emailTemplate,
        data: {
          ...emailData,
          userName: user.name,
          message,
          link
        }
      });
    }
    
    // Send push notification
    if (settings.push) {
      const subscriptions = await getUserPushSubscriptions(userId);
      
      if (subscriptions.length > 0) {
        results.push = await Promise.all(
          subscriptions.map(subscription =>
            sendPushNotification({
              subscription,
              title,
              body: message,
              data: {
                ...data,
                type,
                link
              }
            })
          )
        );
      }
    }
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Failed to notify user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify multiple users
 * @param {Array<number>} userIds - Array of user IDs
 * @param {Object} options - Notification options (same as notifyUser)
 * @returns {Promise<Object>} - Notification results
 */
async function notifyUsers(userIds, options) {
  try {
    const results = await Promise.all(
      userIds.map(userId => notifyUser({ ...options, userId }))
    );
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Failed to notify users:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify all family members
 * @param {number} familyId - Family ID
 * @param {Object} options - Notification options (same as notifyUser)
 * @param {string} options.role - Optional role filter ('parent' or 'child')
 * @returns {Promise<Object>} - Notification results
 */
async function notifyFamily(familyId, options) {
  try {
    const { role } = options;
    
    // Get family members
    let query = 'SELECT id FROM users WHERE family_id = ? AND is_active = 1';
    const params = [familyId];
    
    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    
    const users = await db.query(query, params);
    
    if (users.length === 0) {
      return { success: true, message: 'No users to notify', results: [] };
    }
    
    const userIds = users.map(user => user.id);
    
    return await notifyUsers(userIds, options);
  } catch (error) {
    console.error('Failed to notify family:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a chore assignment notification
 * @param {Object} options - Options
 * @param {number} options.choreId - Chore ID
 * @param {number} options.userId - User ID
 * @param {number} options.assignedBy - User ID who assigned the chore
 * @returns {Promise<Object>} - Notification result
 */
async function notifyChoreAssigned(options) {
  try {
    const { choreId, userId, assignedBy } = options;
    
    // Get chore details
    const [chore] = await db.query(
      `SELECT c.*, u.name as assigned_by_name
       FROM chores c
       JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [choreId]
    );
    
    if (!chore) {
      return { success: false, message: 'Chore not found' };
    }
    
    // Get user details
    const [user] = await db.query(
      'SELECT name FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    // Format due date
    const dueDate = chore.due_date
      ? new Date(chore.due_date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        })
      : 'No due date';
    
    return await notifyUser({
      userId,
      type: 'chore_assigned',
      title: 'New Chore Assigned',
      message: `You have been assigned a new chore: ${chore.title}`,
      emailSubject: 'New Chore Assignment',
      emailTemplate: 'chore_assigned',
      emailData: {
        choreName: chore.title,
        choreDescription: chore.description,
        dueDate,
        reward: `${chore.reward_amount} ${chore.reward_type === 'money' ? '$' : 'minutes'}`,
        assignedBy: chore.assigned_by_name
      },
      link: `/chores/${choreId}`,
      data: {
        choreId,
        choreTitle: chore.title,
        dueDate: chore.due_date,
        assignedBy
      }
    });
  } catch (error) {
    console.error('Failed to send chore assignment notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a chore completion notification
 * @param {Object} options - Options
 * @param {number} options.choreId - Chore ID
 * @param {number} options.userId - User ID who completed the chore
 * @returns {Promise<Object>} - Notification result
 */
async function notifyChoreCompleted(options) {
  try {
    const { choreId, userId } = options;
    
    // Get chore details
    const [chore] = await db.query(
      `SELECT c.*, u.name as completed_by_name
       FROM chores c
       JOIN users u ON u.id = ?
       WHERE c.id = ?`,
      [userId, choreId]
    );
    
    if (!chore) {
      return { success: false, message: 'Chore not found' };
    }
    
    // Get parent users in the family
    const parents = await db.query(
      'SELECT id FROM users WHERE family_id = ? AND role = "parent" AND is_active = 1',
      [chore.family_id]
    );
    
    if (parents.length === 0) {
      return { success: true, message: 'No parents to notify' };
    }
    
    const parentIds = parents.map(parent => parent.id);
    
    return await notifyUsers(parentIds, {
      type: 'chore_completed',
      title: 'Chore Completed',
      message: `${chore.completed_by_name} has completed the chore: ${chore.title}`,
      emailSubject: 'Chore Completed - Approval Needed',
      emailTemplate: 'chore_completed',
      emailData: {
        choreName: chore.title,
        completedBy: chore.completed_by_name,
        completedAt: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        })
      },
      link: `/chores/${choreId}/review`,
      data: {
        choreId,
        choreTitle: chore.title,
        completedBy: userId,
        completedByName: chore.completed_by_name
      }
    });
  } catch (error) {
    console.error('Failed to send chore completion notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a chore approval notification
 * @param {Object} options - Options
 * @param {number} options.choreId - Chore ID
 * @param {number} options.userId - User ID who completed the chore
 * @param {number} options.approvedBy - User ID who approved the chore
 * @param {boolean} options.approved - Whether the chore was approved or rejected
 * @param {string} options.notes - Optional notes
 * @returns {Promise<Object>} - Notification result
 */
async function notifyChoreApproval(options) {
  try {
    const { choreId, userId, approvedBy, approved, notes } = options;
    
    // Get chore details
    const [chore] = await db.query(
      `SELECT c.*, u.name as approved_by_name
       FROM chores c
       JOIN users u ON u.id = ?
       WHERE c.id = ?`,
      [approvedBy, choreId]
    );
    
    if (!chore) {
      return { success: false, message: 'Chore not found' };
    }
    
    const status = approved ? 'approved' : 'rejected';
    const title = approved ? 'Chore Approved' : 'Chore Needs Revision';
    const message = approved
      ? `Your chore "${chore.title}" has been approved!`
      : `Your chore "${chore.title}" needs revision.`;
    
    return await notifyUser({
      userId,
      type: `chore_${status}`,
      title,
      message,
      emailSubject: title,
      emailTemplate: `chore_${status}`,
      emailData: {
        choreName: chore.title,
        approvedBy: chore.approved_by_name,
        notes: notes || 'No additional notes',
        reward: approved
          ? `${chore.reward_amount} ${chore.reward_type === 'money' ? '$' : 'minutes'}`
          : 'N/A'
      },
      link: `/chores/${choreId}`,
      data: {
        choreId,
        choreTitle: chore.title,
        approvedBy,
        approvedByName: chore.approved_by_name,
        notes
      }
    });
  } catch (error) {
    console.error('Failed to send chore approval notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a reminder notification for upcoming chores
 * @param {Object} options - Options
 * @param {number} options.choreId - Chore ID
 * @returns {Promise<Object>} - Notification result
 */
async function notifyChoreReminder(options) {
  try {
    const { choreId } = options;
    
    // Get chore details
    const [chore] = await db.query(
      `SELECT c.*, u.id as user_id, u.name as assigned_to_name
       FROM chores c
       JOIN users u ON c.assigned_to = u.id
       WHERE c.id = ? AND c.status IN ('assigned', 'in_progress')`,
      [choreId]
    );
    
    if (!chore) {
      return { success: false, message: 'No assigned chore found' };
    }
    
    // Format due date
    const dueDate = chore.due_date
      ? new Date(chore.due_date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        })
      : 'No due date';
    
    // Calculate time remaining
    let timeRemaining = 'soon';
    if (chore.due_date) {
      const now = new Date();
      const due = new Date(chore.due_date);
      const hoursRemaining = Math.round((due - now) / (1000 * 60 * 60));
      
      if (hoursRemaining <= 1) {
        timeRemaining = 'in less than an hour';
      } else if (hoursRemaining < 24) {
        timeRemaining = `in ${hoursRemaining} hours`;
      } else {
        const daysRemaining = Math.round(hoursRemaining / 24);
        timeRemaining = `in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
      }
    }
    
    return await notifyUser({
      userId: chore.user_id,
      type: 'chore_reminder',
      title: 'Chore Reminder',
      message: `Reminder: Your chore "${chore.title}" is due ${timeRemaining}`,
      emailSubject: 'Chore Reminder',
      emailTemplate: 'chore_reminder',
      emailData: {
        choreName: chore.title,
        choreDescription: chore.description,
        dueDate,
        timeRemaining
      },
      link: `/chores/${choreId}`,
      data: {
        choreId,
        choreTitle: chore.title,
        dueDate: chore.due_date
      }
    });
  } catch (error) {
    console.error('Failed to send chore reminder notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send an achievement earned notification
 * @param {Object} options - Options
 * @param {number} options.userId - User ID
 * @param {number} options.achievementId - Achievement ID
 * @returns {Promise<Object>} - Notification result
 */
async function notifyAchievementEarned(options) {
  try {
    const { userId, achievementId } = options;
    
    // Get achievement details
    const [achievement] = await db.query(
      `SELECT a.*, u.name as user_name
       FROM achievements a
       JOIN users u ON u.id = ?
       WHERE a.id = ?`,
      [userId, achievementId]
    );
    
    if (!achievement) {
      return { success: false, message: 'Achievement not found' };
    }
    
    // Notify the user who earned the achievement
    const userNotification = await notifyUser({
      userId,
      type: 'achievement_earned',
      title: 'Achievement Unlocked!',
      message: `Congratulations! You've earned the "${achievement.name}" achievement!`,
      emailSubject: 'New Achievement Unlocked!',
      emailTemplate: 'achievement_earned',
      emailData: {
        achievementName: achievement.name,
        achievementDescription: achievement.description,
        reward: achievement.reward_type !== 'badge_only'
          ? `${achievement.reward_amount} ${achievement.reward_type === 'money' ? '$' : 'minutes'}`
          : 'Badge only'
      },
      link: `/achievements/${achievementId}`,
      data: {
        achievementId,
        achievementName: achievement.name,
        icon: achievement.icon,
        badgeColor: achievement.badge_color
      }
    });
    
    // Get family members to notify about the achievement
    const familyMembers = await db.query(
      'SELECT id FROM users WHERE family_id = ? AND id != ? AND is_active = 1',
      [achievement.family_id, userId]
    );
    
    if (familyMembers.length === 0) {
      return userNotification;
    }
    
    // Notify family members
    const familyNotification = await notifyUsers(
      familyMembers.map(member => member.id),
      {
        type: 'family_achievement',
        title: 'Family Achievement',
        message: `${achievement.user_name} has earned the "${achievement.name}" achievement!`,
        emailSubject: 'Family Achievement Unlocked',
        emailTemplate: 'family_achievement',
        emailData: {
          userName: achievement.user_name,
          achievementName: achievement.name,
          achievementDescription: achievement.description
        },
        link: `/achievements`,
        data: {
          achievementId,
          achievementName: achievement.name,
          earnedBy: userId,
          earnedByName: achievement.user_name,
          icon: achievement.icon,
          badgeColor: achievement.badge_color
        }
      }
    );
    
    return {
      success: true,
      userNotification,
      familyNotification
    };
  } catch (error) {
    console.error('Failed to send achievement notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a system notification to all family members
 * @param {Object} options - Options
 * @param {number} options.familyId - Family ID
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.link - Optional link
 * @returns {Promise<Object>} - Notification result
 */
async function notifySystemMessage(options) {
  try {
    const { familyId, title, message, link } = options;
    
    return await notifyFamily(familyId, {
      type: 'system_message',
      title,
      message,
      emailSubject: title,
      emailTemplate: 'system_message',
      emailData: {
        message
      },
      link,
      data: {
        systemMessage: true
      }
    });
  } catch (error) {
    console.error('Failed to send system notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendPushNotification,
  saveInAppNotification,
  getUserNotificationSettings,
  getUserPushSubscriptions,
  notifyUser,
  notifyUsers,
  notifyFamily,
  notifyChoreAssigned,
  notifyChoreCompleted,
  notifyChoreApproval,
  notifyChoreReminder,
  notifyAchievementEarned,
  notifySystemMessage
};
