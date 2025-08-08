-- Database schema updates for ChoreApp
-- Adds recurring chores and backup system tables

-- Recurring chores table
CREATE TABLE IF NOT EXISTS `recurring_chores` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `reward_type` enum('money','screen_time') NOT NULL DEFAULT 'money',
  `reward_amount` decimal(10,2) NOT NULL,
  `requires_photo` tinyint(1) NOT NULL DEFAULT 0,
  `frequency` enum('daily','weekly','monthly','custom') NOT NULL,
  `day_of_week` varchar(20) DEFAULT NULL,
  `day_of_month` int(2) DEFAULT NULL,
  `custom_schedule` varchar(255) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `last_generated` timestamp NULL DEFAULT NULL,
  `next_due_date` timestamp NULL DEFAULT NULL,
  `auto_assign` tinyint(1) NOT NULL DEFAULT 0,
  `assigned_to` int(11) DEFAULT NULL,
  `rotation_type` enum('none','round_robin','random') DEFAULT 'none',
  `rotation_members` json DEFAULT NULL,
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `estimated_duration` int(11) DEFAULT NULL,
  `difficulty_level` enum('easy','medium','hard') DEFAULT 'medium',
  `category` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `family_id` (`family_id`),
  KEY `template_id` (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `assigned_to` (`assigned_to`),
  KEY `idx_family_active` (`family_id`, `is_active`),
  KEY `idx_next_due` (`next_due_date`),
  KEY `idx_frequency` (`frequency`),
  CONSTRAINT `recurring_chores_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recurring_chores_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `chore_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recurring_chores_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recurring_chores_ibfk_4` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recurring chore history table
CREATE TABLE IF NOT EXISTS `recurring_chore_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `recurring_id` int(11) NOT NULL,
  `chore_id` int(11) NOT NULL,
  `due_date` timestamp NOT NULL,
  `status` enum('generated','completed','skipped','missed') NOT NULL DEFAULT 'generated',
  `assigned_to` int(11) DEFAULT NULL,
  `completed_by` int(11) DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `recurring_id` (`recurring_id`),
  KEY `chore_id` (`chore_id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `completed_by` (`completed_by`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_status` (`status`),
  CONSTRAINT `recurring_chore_history_ibfk_1` FOREIGN KEY (`recurring_id`) REFERENCES `recurring_chores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recurring_chore_history_ibfk_2` FOREIGN KEY (`chore_id`) REFERENCES `chores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recurring_chore_history_ibfk_3` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `recurring_chore_history_ibfk_4` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System backups table
CREATE TABLE IF NOT EXISTS `system_backups` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `backup_type` varchar(50) NOT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `file_size` bigint(20) DEFAULT NULL,
  `status` enum('in_progress','completed','failed','rotated') NOT NULL,
  `error_message` text,
  `related_backup_id` int(11) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_backup_type` (`backup_type`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `related_backup_id` (`related_backup_id`),
  CONSTRAINT `system_backups_ibfk_1` FOREIGN KEY (`related_backup_id`) REFERENCES `system_backups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uploads table for photo management
CREATE TABLE IF NOT EXISTS `uploads` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `family_id` int(11) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `thumbnail_path` varchar(500) DEFAULT NULL,
  `file_size` bigint(20) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `upload_type` varchar(50) DEFAULT 'general',
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `family_id` (`family_id`),
  KEY `idx_upload_type` (`upload_type`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `uploads_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `uploads_ibfk_2` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add notification settings to users table
ALTER TABLE `users` 
ADD COLUMN `notification_settings` json AFTER `preferences`;

-- Update existing users with default notification settings
UPDATE `users` SET `notification_settings` = '{"email": true, "push": true, "sms": false, "in_app": true}' WHERE `notification_settings` IS NULL;

-- User notifications table
CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `notification_type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `link` varchar(500) DEFAULT NULL,
  `data` json DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_user_read` (`user_id`, `is_read`),
  KEY `idx_notification_type` (`notification_type`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `user_notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `subscription` text NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_endpoint` (`user_id`, `endpoint`),
  KEY `idx_user_active` (`user_id`, `is_active`),
  CONSTRAINT `push_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backup logs table for tracking backup history
CREATE TABLE IF NOT EXISTS `backup_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `backup_type` varchar(50) NOT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `file_size` bigint(20) DEFAULT 0,
  `status` enum('success','failed') NOT NULL,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_backup_type` (`backup_type`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for better performance
CREATE INDEX idx_recurring_family_active_next ON recurring_chores(family_id, is_active, next_due_date);
CREATE INDEX idx_recurring_history_recurring_status ON recurring_chore_history(recurring_id, status);
CREATE INDEX idx_uploads_family_type ON uploads(family_id, upload_type);
CREATE INDEX idx_system_backups_type_status ON system_backups(backup_type, status);
