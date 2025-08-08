-- Family Chore App Database Schema
-- Enhanced version with improved indexing and new features

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS `family_chores` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `family_chores`;

-- Families table
CREATE TABLE IF NOT EXISTS `families` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `family_code` varchar(10) NOT NULL UNIQUE,
  `admin_email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `settings` json DEFAULT NULL,
  `timezone` varchar(50) DEFAULT 'UTC',
  `currency` varchar(3) DEFAULT 'USD',
  PRIMARY KEY (`id`),
  KEY `idx_family_code` (`family_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('parent','child') NOT NULL DEFAULT 'child',
  `earnings` decimal(10,2) NOT NULL DEFAULT 0.00,
  `screen_time_earned` int(11) NOT NULL DEFAULT 0,
  `avatar_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` timestamp NULL DEFAULT NULL,
  `last_login` timestamp NULL DEFAULT NULL,
  `login_attempts` int(11) NOT NULL DEFAULT 0,
  `locked_until` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `preferences` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_family_email` (`family_id`, `email`),
  KEY `family_id` (`family_id`),
  KEY `idx_family_role` (`family_id`, `role`),
  KEY `idx_earnings` (`earnings`),
  KEY `idx_email` (`email`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chore templates table (new feature)
CREATE TABLE IF NOT EXISTS `chore_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `reward_type` enum('money','screen_time') NOT NULL DEFAULT 'money',
  `reward_amount` decimal(10,2) NOT NULL,
  `requires_photo` tinyint(1) NOT NULL DEFAULT 0,
  `estimated_duration` int(11) DEFAULT NULL,
  `difficulty_level` enum('easy','medium','hard') DEFAULT 'medium',
  `category` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `family_id` (`family_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_family_active` (`family_id`, `is_active`),
  CONSTRAINT `chore_templates_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chore_templates_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chores table (enhanced)
CREATE TABLE IF NOT EXISTS `chores` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `template_id` int(11) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `reward_type` enum('money','screen_time') NOT NULL DEFAULT 'money',
  `reward_amount` decimal(10,2) NOT NULL,
  `current_reward` decimal(10,2) NOT NULL,
  `requires_photo` tinyint(1) NOT NULL DEFAULT 0,
  `acceptance_timer` int(11) NOT NULL DEFAULT 5,
  `status` enum('available','assigned','pending_acceptance','auto_accepted','in_progress','pending_approval','completed','cancelled') NOT NULL DEFAULT 'available',
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `due_date` timestamp NULL DEFAULT NULL,
  `estimated_duration` int(11) DEFAULT NULL,
  `difficulty_level` enum('easy','medium','hard') DEFAULT 'medium',
  `category` varchar(100) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `family_id` (`family_id`),
  KEY `template_id` (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `assigned_to` (`assigned_to`),
  KEY `idx_family_status` (`family_id`, `status`),
  KEY `idx_assigned_status` (`assigned_to`, `status`),
  KEY `idx_due_date` (`due_date`),
  KEY `idx_priority` (`priority`),
  CONSTRAINT `chores_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chores_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `chore_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chores_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chores_ibfk_4` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chore assignments table (enhanced tracking)
CREATE TABLE IF NOT EXISTS `chore_assignments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chore_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `assigned_by` int(11) NOT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `declined_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','accepted','declined','auto_accepted','expired') NOT NULL DEFAULT 'pending',
  `acceptance_deadline` timestamp NULL DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  KEY `chore_id` (`chore_id`),
  KEY `user_id` (`user_id`),
  KEY `assigned_by` (`assigned_by`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_deadline` (`acceptance_deadline`),
  CONSTRAINT `chore_assignments_ibfk_1` FOREIGN KEY (`chore_id`) REFERENCES `chores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chore_assignments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chore_assignments_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chore submissions table (enhanced)
CREATE TABLE IF NOT EXISTS `chore_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chore_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `assignment_id` int(11) DEFAULT NULL,
  `photo_path` varchar(500) DEFAULT NULL,
  `photo_thumbnail` varchar(500) DEFAULT NULL,
  `notes` text,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int(11) DEFAULT NULL,
  `status` enum('pending','approved','rejected','needs_revision') NOT NULL DEFAULT 'pending',
  `review_notes` text,
  `quality_rating` int(1) DEFAULT NULL,
  `time_taken` int(11) DEFAULT NULL,
  `location_data` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `chore_id` (`chore_id`),
  KEY `user_id` (`user_id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_submitted_at` (`submitted_at`),
  CONSTRAINT `chore_submissions_ibfk_1` FOREIGN KEY (`chore_id`) REFERENCES `chores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chore_submissions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chore_submissions_ibfk_3` FOREIGN KEY (`assignment_id`) REFERENCES `chore_assignments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chore_submissions_ibfk_4` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Completed tasks table (enhanced)
CREATE TABLE IF NOT EXISTS `completed_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chore_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `submission_id` int(11) DEFAULT NULL,
  `chore_title` varchar(255) NOT NULL,
  `chore_description` text,
  `reward_type` enum('money','screen_time') NOT NULL,
  `reward_earned` decimal(10,2) NOT NULL,
  `quality_rating` int(1) DEFAULT NULL,
  `time_taken` int(11) DEFAULT NULL,
  `bonus_earned` decimal(10,2) DEFAULT 0.00,
  `completed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `photo_path` varchar(500) DEFAULT NULL,
  `notes` text,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `chore_id` (`chore_id`),
  KEY `user_id` (`user_id`),
  KEY `submission_id` (`submission_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_user_completed` (`user_id`, `completed_at`),
  KEY `idx_reward_type` (`reward_type`),
  CONSTRAINT `completed_tasks_ibfk_1` FOREIGN KEY (`chore_id`) REFERENCES `chores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `completed_tasks_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `completed_tasks_ibfk_3` FOREIGN KEY (`submission_id`) REFERENCES `chore_submissions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `completed_tasks_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Achievements table (new feature)
CREATE TABLE IF NOT EXISTS `achievements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `icon` varchar(100) DEFAULT NULL,
  `badge_color` varchar(7) DEFAULT '#3B82F6',
  `criteria_type` enum('chores_completed','earnings_reached','streak_days','quality_average') NOT NULL,
  `criteria_value` decimal(10,2) NOT NULL,
  `reward_type` enum('money','screen_time','badge_only') DEFAULT 'badge_only',
  `reward_amount` decimal(10,2) DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `family_id` (`family_id`),
  KEY `idx_family_active` (`family_id`, `is_active`),
  CONSTRAINT `achievements_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User achievements table (new feature)
CREATE TABLE IF NOT EXISTS `user_achievements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `achievement_id` int(11) NOT NULL,
  `earned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `progress_value` decimal(10,2) DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_achievement` (`user_id`, `achievement_id`),
  KEY `achievement_id` (`achievement_id`),
  KEY `idx_user_earned` (`user_id`, `earned_at`),
  CONSTRAINT `user_achievements_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_achievements_ibfk_2` FOREIGN KEY (`achievement_id`) REFERENCES `achievements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity log table (new feature)
CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `family_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `family_id` (`family_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_family_action` (`family_id`, `action`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `families` (`id`) ON DELETE CASCADE,
  CONSTRAINT `activity_log_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample data will be inserted when families are created

COMMIT;

-- Create indexes for better performance
CREATE INDEX idx_chores_family_status_priority ON chores(family_id, status, priority);
CREATE INDEX idx_submissions_status_submitted ON chore_submissions(status, submitted_at);
CREATE INDEX idx_completed_user_date ON completed_tasks(user_id, completed_at DESC);
CREATE INDEX idx_activity_family_date ON activity_log(family_id, created_at DESC);

-- Create views for common queries
CREATE VIEW family_stats AS
SELECT 
    f.id as family_id,
    f.name as family_name,
    COUNT(DISTINCT u.id) as total_members,
    COUNT(DISTINCT CASE WHEN u.role = 'parent' THEN u.id END) as parents,
    COUNT(DISTINCT CASE WHEN u.role = 'child' THEN u.id END) as children,
    COUNT(DISTINCT c.id) as total_chores,
    COUNT(DISTINCT ct.id) as completed_chores,
    COALESCE(SUM(ct.reward_earned), 0) as total_rewards_paid,
    f.created_at as family_created
FROM families f
LEFT JOIN users u ON f.id = u.family_id AND u.is_active = 1
LEFT JOIN chores c ON f.id = c.family_id
LEFT JOIN completed_tasks ct ON f.id = ct.user_id
GROUP BY f.id, f.name, f.created_at;

CREATE VIEW user_performance AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.role,
    u.earnings,
    u.screen_time_earned,
    COUNT(ct.id) as chores_completed,
    COALESCE(AVG(ct.quality_rating), 0) as avg_quality,
    COUNT(ua.id) as achievements_earned,
    COALESCE(MAX(ct.completed_at), u.created_at) as last_activity
FROM users u
LEFT JOIN completed_tasks ct ON u.id = ct.user_id
LEFT JOIN user_achievements ua ON u.id = ua.user_id
WHERE u.is_active = 1
GROUP BY u.id, u.name, u.role, u.earnings, u.screen_time_earned, u.created_at;
