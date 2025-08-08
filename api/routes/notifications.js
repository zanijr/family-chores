const express = require('express');
const { protect } = require('../middleware/auth');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const db = require('../config/database');
const { 
  getUserNotificationSettings, 
  notifyUser 
} = require('../utils/notifications');

const router = express.Router();

// Get user's notifications
router.get('/', protect, catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  // Get notifications
  const notifications = await db.query(
    `SELECT * FROM user_notifications 
     WHERE user_id = ? 
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]
  );
  
  // Get total count
  const [countResult] = await db.query(
    `SELECT COUNT(*) as total FROM user_notifications WHERE user_id = ?`,
    [req.user.id]
  );
  
  const totalCount = countResult ? countResult.total : 0;
  
  res.json({
    status: 'success',
    data: {
      notifications,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  });
}));

// Get unread notification count
router.get('/unread', protect, catchAsync(async (req, res) => {
  const [result] = await db.query(
    `SELECT COUNT(*) as count FROM user_notifications 
     WHERE user_id = ? AND is_read = 0`,
    [req.user.id]
  );
  
  res.json({
    status: 'success',
    data: {
      unreadCount: result ? result.count : 0
    }
  });
}));

// Mark notification as read
router.patch('/:id/read', protect, catchAsync(async (req, res) => {
  const notificationId = req.params.id;
  
  // Check if notification exists and belongs to user
  const [notification] = await db.query(
    `SELECT * FROM user_notifications 
     WHERE id = ? AND user_id = ?`,
    [notificationId, req.user.id]
  );
  
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }
  
  // Mark as read
  await db.query(
    `UPDATE user_notifications SET is_read = 1 
     WHERE id = ?`,
    [notificationId]
  );
  
  res.json({
    status: 'success',
    message: 'Notification marked as read'
  });
}));

// Mark all notifications as read
router.patch('/read-all', protect, catchAsync(async (req, res) => {
  await db.query(
    `UPDATE user_notifications SET is_read = 1 
     WHERE user_id = ? AND is_read = 0`,
    [req.user.id]
  );
  
  res.json({
    status: 'success',
    message: 'All notifications marked as read'
  });
}));

// Delete a notification
router.delete('/:id', protect, catchAsync(async (req, res) => {
  const notificationId = req.params.id;
  
  // Check if notification exists and belongs to user
  const [notification] = await db.query(
    `SELECT * FROM user_notifications 
     WHERE id = ? AND user_id = ?`,
    [notificationId, req.user.id]
  );
  
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }
  
  // Delete notification
  await db.query(
    `DELETE FROM user_notifications WHERE id = ?`,
    [notificationId]
  );
  
  res.json({
    status: 'success',
    message: 'Notification deleted'
  });
}));

// Delete all notifications
router.delete('/', protect, catchAsync(async (req, res) => {
  await db.query(
    `DELETE FROM user_notifications WHERE user_id = ?`,
    [req.user.id]
  );
  
  res.json({
    status: 'success',
    message: 'All notifications deleted'
  });
}));

// Get user's notification settings
router.get('/settings', protect, catchAsync(async (req, res) => {
  const settings = await getUserNotificationSettings(req.user.id);
  
  res.json({
    status: 'success',
    data: { settings }
  });
}));

// Update user's notification settings
router.put('/settings', protect, catchAsync(async (req, res) => {
  const { email, push, sms, in_app } = req.body;
  
  // Validate settings
  if (typeof email !== 'boolean' || 
      typeof push !== 'boolean' || 
      typeof sms !== 'boolean' || 
      typeof in_app !== 'boolean') {
    throw new AppError('Invalid settings format', 400);
  }
  
  // Update settings
  await db.query(
    `UPDATE users SET notification_settings = ? 
     WHERE id = ?`,
    [
      JSON.stringify({ email, push, sms, in_app }),
      req.user.id
    ]
  );
  
  res.json({
    status: 'success',
    message: 'Notification settings updated',
    data: {
      settings: { email, push, sms, in_app }
    }
  });
}));

// Register push subscription
router.post('/push-subscription', protect, catchAsync(async (req, res) => {
  const { subscription } = req.body;
  
  if (!subscription || !subscription.endpoint) {
    throw new AppError('Invalid subscription object', 400);
  }
  
  // Check if subscription already exists
  const [existingSub] = await db.query(
    `SELECT * FROM push_subscriptions 
     WHERE user_id = ? AND endpoint = ?`,
    [req.user.id, subscription.endpoint]
  );
  
  if (existingSub) {
    // Update existing subscription
    await db.query(
      `UPDATE push_subscriptions 
       SET subscription = ?, is_active = 1, updated_at = NOW() 
       WHERE id = ?`,
      [JSON.stringify(subscription), existingSub.id]
    );
  } else {
    // Create new subscription
    await db.query(
      `INSERT INTO push_subscriptions 
       (user_id, endpoint, subscription, is_active, created_at) 
       VALUES (?, ?, ?, 1, NOW())`,
      [req.user.id, subscription.endpoint, JSON.stringify(subscription)]
    );
  }
  
  // Send a test notification
  notifyUser({
    userId: req.user.id,
    type: 'test',
    title: 'Notifications Enabled',
    message: 'You have successfully enabled push notifications!',
    link: '/settings/notifications'
  });
  
  res.json({
    status: 'success',
    message: 'Push subscription registered'
  });
}));

// Unregister push subscription
router.delete('/push-subscription', protect, catchAsync(async (req, res) => {
  const { endpoint } = req.body;
  
  if (!endpoint) {
    throw new AppError('Endpoint is required', 400);
  }
  
  // Deactivate subscription
  await db.query(
    `UPDATE push_subscriptions 
     SET is_active = 0, updated_at = NOW() 
     WHERE user_id = ? AND endpoint = ?`,
    [req.user.id, endpoint]
  );
  
  res.json({
    status: 'success',
    message: 'Push subscription unregistered'
  });
}));

module.exports = router;
