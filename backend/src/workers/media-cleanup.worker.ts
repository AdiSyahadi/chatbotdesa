/**
 * Media Cleanup Worker
 * Periodically cleans up old uploaded media files to prevent disk space issues
 * @module workers/media-cleanup
 */

import * as fs from 'fs';
import * as path from 'path';
import config from '../config';
import logger from '../config/logger';

// ============================================
// CONFIGURATION
// ============================================

const UPLOADS_PATH = path.join(config.storage.path, 'uploads');
const RETENTION_DAYS = parseInt(process.env.MEDIA_RETENTION_DAYS || '30', 10);
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run every 24 hours

let cleanupInterval: NodeJS.Timeout | null = null;

// ============================================
// CLEANUP LOGIC
// ============================================

/**
 * Get all files in a directory recursively
 */
function getFilesRecursive(dirPath: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Clean up media files older than retention period
 */
export async function cleanupOldMedia(): Promise<{
  scanned: number;
  deleted: number;
  freedBytes: number;
  errors: number;
}> {
  const stats = {
    scanned: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0,
  };

  try {
    if (!fs.existsSync(UPLOADS_PATH)) {
      logger.info('Uploads directory does not exist, skipping cleanup');
      return stats;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffMs = cutoffDate.getTime();

    const files = getFilesRecursive(UPLOADS_PATH);
    stats.scanned = files.length;

    for (const filePath of files) {
      try {
        const fileStat = fs.statSync(filePath);

        // Check if file is older than retention period
        if (fileStat.mtimeMs < cutoffMs) {
          stats.freedBytes += fileStat.size;
          fs.unlinkSync(filePath);
          stats.deleted++;
        }
      } catch (err) {
        stats.errors++;
        logger.warn({ filePath, error: err }, 'Failed to process file during cleanup');
      }
    }

    // Clean up empty directories
    cleanEmptyDirs(UPLOADS_PATH);

    logger.info(
      {
        scanned: stats.scanned,
        deleted: stats.deleted,
        freedMB: (stats.freedBytes / 1024 / 1024).toFixed(2),
        errors: stats.errors,
        retentionDays: RETENTION_DAYS,
      },
      '🧹 Media cleanup completed'
    );
  } catch (error) {
    logger.error({ error }, 'Media cleanup failed');
  }

  return stats;
}

/**
 * Remove empty directories recursively (bottom-up)
 */
function cleanEmptyDirs(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  // First, recurse into subdirectories
  for (const entry of entries) {
    if (entry.isDirectory()) {
      cleanEmptyDirs(path.join(dirPath, entry.name));
    }
  }

  // Then check if current dir is now empty (don't delete root uploads dir)
  const remaining = fs.readdirSync(dirPath);
  if (remaining.length === 0 && dirPath !== UPLOADS_PATH) {
    try {
      fs.rmdirSync(dirPath);
    } catch {
      // Ignore - directory might be in use
    }
  }
}

/**
 * Get current storage usage stats
 */
export function getStorageStats(): {
  totalFiles: number;
  totalSizeMB: number;
  oldestFile: Date | null;
  newestFile: Date | null;
} {
  const stats = {
    totalFiles: 0,
    totalSizeMB: 0,
    oldestFile: null as Date | null,
    newestFile: null as Date | null,
  };

  if (!fs.existsSync(UPLOADS_PATH)) {
    return stats;
  }

  const files = getFilesRecursive(UPLOADS_PATH);
  let totalBytes = 0;

  for (const filePath of files) {
    try {
      const fileStat = fs.statSync(filePath);
      totalBytes += fileStat.size;
      stats.totalFiles++;

      const mtime = new Date(fileStat.mtimeMs);
      if (!stats.oldestFile || mtime < stats.oldestFile) {
        stats.oldestFile = mtime;
      }
      if (!stats.newestFile || mtime > stats.newestFile) {
        stats.newestFile = mtime;
      }
    } catch {
      // Skip unreadable files
    }
  }

  stats.totalSizeMB = Math.round((totalBytes / 1024 / 1024) * 100) / 100;
  return stats;
}

// ============================================
// WORKER LIFECYCLE
// ============================================

/**
 * Start the media cleanup worker
 */
export function startMediaCleanupWorker(): void {
  logger.info(
    { retentionDays: RETENTION_DAYS, intervalHours: CLEANUP_INTERVAL_MS / 3600000 },
    '🧹 Media cleanup worker started'
  );

  // Run initial cleanup after 10 seconds (don't block startup)
  setTimeout(() => {
    cleanupOldMedia();
  }, 10000);

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    cleanupOldMedia();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the media cleanup worker
 */
export function stopMediaCleanupWorker(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('🧹 Media cleanup worker stopped');
  }
}
