const db = require('../config/database');

// Activity logger middleware
const logActivity = async (req, res, next) => {
  // Skip logging for health checks and static assets
  if (req.path === '/health' || req.path.startsWith('/uploads/') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
    return next();
  }

  // Store original res.json to intercept responses
  const originalJson = res.json;
  
  res.json = function(data) {
    // Log activity after successful response
    if (res.statusCode < 400 && req.user && req.user.familyId) {
      setImmediate(() => {
        logUserActivity(req, res, data).catch(err => {
          console.error('Activity logging error:', err);
        });
      });
    }
    
    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

// Log user activity to database
async function logUserActivity(req, res, responseData) {
  try {
    const action = determineAction(req.method, req.path, responseData);
    const entityType = determineEntityType(req.path);
    const entityId = extractEntityId(req, responseData);
    
    // Only log meaningful activities
    if (!action || action === 'unknown') {
      return;
    }

    const activityData = {
      family_id: req.user.familyId,
      user_id: req.user.id,
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      details: JSON.stringify({
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        responseStatus: res.statusCode
      }),
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent')
    };

    await db.query(
      `INSERT INTO activity_log (family_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        activityData.family_id,
        activityData.user_id,
        activityData.action,
        activityData.entity_type,
        activityData.entity_id,
        activityData.details,
        activityData.ip_address,
        activityData.user_agent
      ]
    );
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Determine action based on request
function determineAction(method, path, responseData) {
  const pathSegments = path.split('/').filter(Boolean);
  
  // Authentication actions
  if (path.includes('/auth/')) {
    if (path.includes('/login')) return 'login';
    if (path.includes('/register')) return 'register';
    if (path.includes('/logout')) return 'logout';
    return 'auth_action';
  }
  
  // Family actions
  if (path.includes('/families')) {
    switch (method) {
      case 'POST': return 'create_family';
      case 'PUT':
      case 'PATCH': return 'update_family';
      case 'DELETE': return 'delete_family';
      case 'GET': return 'view_family';
      default: return 'family_action';
    }
  }
  
  // User actions
  if (path.includes('/users')) {
    switch (method) {
      case 'POST': return 'create_user';
      case 'PUT':
      case 'PATCH': return 'update_user';
      case 'DELETE': return 'delete_user';
      case 'GET': return 'view_user';
      default: return 'user_action';
    }
  }
  
  // Chore actions
  if (path.includes('/chores')) {
    if (path.includes('/assign')) return 'assign_chore';
    if (path.includes('/accept')) return 'accept_chore';
    if (path.includes('/decline')) return 'decline_chore';
    if (path.includes('/submit')) return 'submit_chore';
    if (path.includes('/approve')) return 'approve_chore';
    if (path.includes('/reject')) return 'reject_chore';
    
    switch (method) {
      case 'POST': return 'create_chore';
      case 'PUT':
      case 'PATCH': return 'update_chore';
      case 'DELETE': return 'delete_chore';
      case 'GET': return 'view_chore';
      default: return 'chore_action';
    }
  }
  
  // Upload actions
  if (path.includes('/uploads')) {
    switch (method) {
      case 'POST': return 'upload_file';
      case 'DELETE': return 'delete_file';
      case 'GET': return 'view_file';
      default: return 'file_action';
    }
  }
  
  // Achievement actions
  if (path.includes('/achievements')) {
    switch (method) {
      case 'POST': return 'create_achievement';
      case 'PUT':
      case 'PATCH': return 'update_achievement';
      case 'DELETE': return 'delete_achievement';
      case 'GET': return 'view_achievement';
      default: return 'achievement_action';
    }
  }
  
  return 'unknown';
}

// Determine entity type from path
function determineEntityType(path) {
  if (path.includes('/families')) return 'family';
  if (path.includes('/users')) return 'user';
  if (path.includes('/chores')) return 'chore';
  if (path.includes('/uploads')) return 'file';
  if (path.includes('/achievements')) return 'achievement';
  if (path.includes('/auth')) return 'auth';
  return 'unknown';
}

// Extract entity ID from request or response
function extractEntityId(req, responseData) {
  // Try to get ID from URL parameters
  if (req.params && req.params.id) {
    return parseInt(req.params.id);
  }
  
  // Try to get ID from response data
  if (responseData && responseData.data) {
    if (responseData.data.id) return responseData.data.id;
    if (responseData.data.chore_id) return responseData.data.chore_id;
    if (responseData.data.user_id) return responseData.data.user_id;
    if (responseData.data.family_id) return responseData.data.family_id;
  }
  
  // Try to get ID directly from response
  if (responseData && responseData.id) {
    return responseData.id;
  }
  
  return null;
}

// Get recent activity for a family
async function getRecentActivity(familyId, limit = 50) {
  try {
    const activities = await db.query(
      `SELECT 
        al.*,
        u.name as user_name,
        u.role as user_role
       FROM activity_log al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.family_id = ?
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [familyId, limit]
    );
    
    return activities.map(activity => ({
      ...activity,
      details: JSON.parse(activity.details || '{}')
    }));
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    throw error;
  }
}

// Get activity summary for a user
async function getUserActivitySummary(userId, days = 30) {
  try {
    const summary = await db.query(
      `SELECT 
        action,
        COUNT(*) as count,
        DATE(created_at) as date
       FROM activity_log
       WHERE user_id = ? 
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY action, DATE(created_at)
       ORDER BY date DESC, count DESC`,
      [userId, days]
    );
    
    return summary;
  } catch (error) {
    console.error('Error fetching user activity summary:', error);
    throw error;
  }
}

// Clean old activity logs (keep last 90 days)
async function cleanOldActivityLogs() {
  try {
    const result = await db.query(
      `DELETE FROM activity_log 
       WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`
    );
    
    console.log(`Cleaned ${result.affectedRows} old activity log entries`);
    return result.affectedRows;
  } catch (error) {
    console.error('Error cleaning old activity logs:', error);
    throw error;
  }
}

module.exports = {
  logActivity,
  getRecentActivity,
  getUserActivitySummary,
  cleanOldActivityLogs
};
