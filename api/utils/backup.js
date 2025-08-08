const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const db = require('../config/database');

class BackupManager {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || '/app/backups';
    this.maxBackups = parseInt(process.env.MAX_BACKUPS) || 30;
  }

  async ensureBackupDirectory() {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  async createDatabaseBackup() {
    await this.ensureBackupDirectory();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db_backup_${timestamp}.sql`;
    const filepath = path.join(this.backupDir, filename);
    
    const dbConfig = {
      host: process.env.DB_HOST || 'mysql',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'family_chores'
    };
    
    // Create mysqldump command with SSL disabled and default auth plugin
    const command = `mysqldump -h ${dbConfig.host} -u ${dbConfig.user} -p${dbConfig.password} --skip-ssl --default-auth=mysql_native_password ${dbConfig.database} > ${filepath}`;
    
    try {
      await execAsync(command);
      
      // Compress the backup
      await execAsync(`gzip ${filepath}`);
      
      return {
        filename: `${filename}.gz`,
        path: `${filepath}.gz`,
        size: (await fs.stat(`${filepath}.gz`)).size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database backup failed:', error);
      throw new Error('Failed to create database backup');
    }
  }

  async createUploadsBackup() {
    await this.ensureBackupDirectory();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `uploads_backup_${timestamp}.tar.gz`;
    const filepath = path.join(this.backupDir, filename);
    const uploadsDir = '/app/uploads';
    
    try {
      // Check if uploads directory exists
      await fs.access(uploadsDir);
      
      // Create tar.gz archive of uploads
      const command = `tar -czf ${filepath} -C /app uploads`;
      await execAsync(command);
      
      return {
        filename,
        path: filepath,
        size: (await fs.stat(filepath)).size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Uploads backup failed:', error);
      // Return null if uploads directory doesn't exist or is empty
      return null;
    }
  }

  async createFullBackup() {
    const backups = {
      database: null,
      uploads: null,
      timestamp: new Date().toISOString(),
      status: 'success'
    };
    
    try {
      // Create database backup
      backups.database = await this.createDatabaseBackup();
      
      // Create uploads backup
      backups.uploads = await this.createUploadsBackup();
      
      // Log backup to database
      await this.logBackup(backups);
      
      // Clean old backups
      await this.cleanOldBackups();
      
      return backups;
    } catch (error) {
      backups.status = 'failed';
      backups.error = error.message;
      
      // Log failed backup attempt
      await this.logBackup(backups);
      
      throw error;
    }
  }

  async logBackup(backup) {
    try {
      await db.query(
        `INSERT INTO backup_logs (backup_type, filename, file_size, status, error_message, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'full',
          backup.database?.filename || null,
          backup.database?.size || 0,
          backup.status,
          backup.error || null,
          new Date(backup.timestamp).toISOString().slice(0, 19).replace('T', ' ')
        ]
      );
    } catch (error) {
      console.error('Failed to log backup:', error);
    }
  }

  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.includes('backup'))
        .map(async f => ({
          name: f,
          path: path.join(this.backupDir, f),
          stats: await fs.stat(path.join(this.backupDir, f))
        }));
      
      const fileStats = await Promise.all(backupFiles);
      
      // Sort by creation time (oldest first)
      fileStats.sort((a, b) => a.stats.ctime - b.stats.ctime);
      
      // Remove old backups if we exceed the limit
      if (fileStats.length > this.maxBackups) {
        const toDelete = fileStats.slice(0, fileStats.length - this.maxBackups);
        
        for (const file of toDelete) {
          await fs.unlink(file.path);
          console.log(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Failed to clean old backups:', error);
    }
  }

  async listBackups() {
    try {
      await this.ensureBackupDirectory();
      const files = await fs.readdir(this.backupDir);
      
      const backupFiles = await Promise.all(
        files
          .filter(f => f.includes('backup'))
          .map(async f => {
            const filepath = path.join(this.backupDir, f);
            const stats = await fs.stat(filepath);
            
            return {
              filename: f,
              type: f.includes('db_backup') ? 'database' : 'uploads',
              size: stats.size,
              created: stats.ctime,
              path: filepath
            };
          })
      );
      
      // Sort by creation date (newest first)
      backupFiles.sort((a, b) => b.created - a.created);
      
      return backupFiles;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  async restoreDatabase(backupFile) {
    const dbConfig = {
      host: process.env.DB_HOST || 'mysql',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
      database: process.env.DB_NAME || 'family_chores'
    };
    
    try {
      // Decompress if needed
      let sqlFile = backupFile;
      if (backupFile.endsWith('.gz')) {
        await execAsync(`gunzip -c ${backupFile} > ${backupFile.replace('.gz', '')}`);
        sqlFile = backupFile.replace('.gz', '');
      }
      
      // Restore database
      const command = `mysql -h ${dbConfig.host} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} < ${sqlFile}`;
      await execAsync(command);
      
      // Clean up decompressed file if we created one
      if (sqlFile !== backupFile) {
        await fs.unlink(sqlFile);
      }
      
      return { success: true, message: 'Database restored successfully' };
    } catch (error) {
      console.error('Database restore failed:', error);
      throw new Error('Failed to restore database backup');
    }
  }

  async getBackupStats() {
    try {
      // Get backup history from database
      const [backupHistory] = await db.query(
        `SELECT 
          COUNT(*) as total_backups,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_backups,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_backups,
          MAX(created_at) as last_backup,
          SUM(file_size) as total_size
         FROM backup_logs
         WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );
      
      // Get current backup files
      const currentBackups = await this.listBackups();
      
      return {
        history: backupHistory,
        current: {
          count: currentBackups.length,
          totalSize: currentBackups.reduce((sum, b) => sum + b.size, 0),
          files: currentBackups
        }
      };
    } catch (error) {
      console.error('Failed to get backup stats:', error);
      return null;
    }
  }
}

module.exports = new BackupManager();
