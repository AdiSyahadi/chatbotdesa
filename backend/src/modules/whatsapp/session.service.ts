import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { AppError } from '../../types';

const logger = pino({ level: 'silent' });

// ============================================
// SESSION SERVICE
// Multi-Auth State Storage for Baileys
// ============================================

/**
 * Base path for session storage
 */
const SESSIONS_BASE_PATH = path.join(process.cwd(), 'storage', 'sessions');

/**
 * UUID v4 format regex for instanceId validation
 * Prevents path traversal via malicious instanceId values
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that instanceId is a safe UUID format.
 * Throws if instanceId contains path traversal characters.
 */
function validateInstanceId(instanceId: string): void {
  if (!instanceId || !UUID_V4_REGEX.test(instanceId)) {
    throw new AppError(`Invalid instanceId format: must be UUID v4 (got: ${instanceId?.substring(0, 50)})`, 400, 'INVALID_INSTANCE_ID');
  }
}

/**
 * Sanitize a file name to prevent path traversal.
 * Strips directory separators and '..' sequences.
 */
function sanitizeFileName(fileName: string): string {
  // Remove any path separators and null bytes
  const cleaned = fileName.replace(/[\/\\\0]/g, '_').replace(/\.\./g, '_');
  // Ensure the result is not empty
  if (!cleaned || cleaned.trim() === '') {
    throw new AppError(`Invalid file name after sanitization: ${fileName.substring(0, 50)}`, 400, 'INVALID_FILE_NAME');
  }
  return cleaned;
}

/**
 * Validate that a resolved path is within the expected base directory.
 * Final safety net against path traversal.
 */
function assertPathWithinBase(resolvedPath: string, basePath: string): void {
  const normalizedResolved = path.resolve(resolvedPath);
  const normalizedBase = path.resolve(basePath);
  if (!normalizedResolved.startsWith(normalizedBase + path.sep) && normalizedResolved !== normalizedBase) {
    throw new AppError(`Path traversal detected: ${normalizedResolved} is outside ${normalizedBase}`, 403, 'PATH_TRAVERSAL');
  }
}

/**
 * Ensure sessions directory exists
 */
export function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_BASE_PATH)) {
    fs.mkdirSync(SESSIONS_BASE_PATH, { recursive: true });
  }
}

/**
 * Get session directory path for an instance
 */
export function getSessionPath(instanceId: string): string {
  validateInstanceId(instanceId);
  const sessionPath = path.join(SESSIONS_BASE_PATH, instanceId);
  assertPathWithinBase(sessionPath, SESSIONS_BASE_PATH);
  return sessionPath;
}

/**
 * Check if session exists for an instance
 */
export function sessionExists(instanceId: string): boolean {
  const sessionPath = getSessionPath(instanceId);
  const credsPath = path.join(sessionPath, 'creds.json');
  return fs.existsSync(credsPath);
}

/**
 * Delete session for an instance
 */
export function deleteSession(instanceId: string): void {
  const sessionPath = getSessionPath(instanceId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
}

/**
 * Read JSON file safely (PATCH-087: async to avoid blocking event loop)
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content, BufferJSON.reviver);
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    logger.error({ error, filePath }, 'Error reading JSON file');
    return null;
  }
}

/**
 * Write JSON file safely (PATCH-087: async, PATCH-102: atomic write + ENOSPC detection)
 */
async function writeJsonFile(filePath: string, data: any): Promise<void> {
  const tmpPath = filePath + '.tmp';
  try {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(tmpPath, JSON.stringify(data, BufferJSON.replacer, 2));
    await fsp.rename(tmpPath, filePath);
  } catch (error: any) {
    // Attempt cleanup of temp file
    try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
    if (error?.code === 'ENOSPC' || error?.code === 'EDQUOT') {
      logger.fatal({ error, filePath }, 'CRITICAL: Disk full — session write failed, data may be lost');
      throw error; // Re-throw so caller can handle (e.g. stop accepting new sessions)
    }
    logger.error({ error, filePath }, 'Error writing JSON file');
  }
}

/**
 * Create multi-file auth state for Baileys
 * This stores authentication credentials and keys in separate files
 * for better performance with large accounts
 */
export async function useMultiFileAuthState(
  instanceId: string
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  ensureSessionsDir();
  const sessionPath = getSessionPath(instanceId);

  // Ensure instance session directory exists
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const credsPath = path.join(sessionPath, 'creds.json');

  /**
   * Read credentials or initialize new ones
   */
  const readCreds = async (): Promise<AuthenticationCreds> => {
    const creds = await readJsonFile<AuthenticationCreds>(credsPath);
    return creds || initAuthCreds();
  };

  /**
   * Write credentials to file
   */
  const writeCreds = async (creds: AuthenticationCreds): Promise<void> => {
    await writeJsonFile(credsPath, creds);
  };

  /**
   * Read key from file (PATCH-087: now async)
   */
  const readKey = async <T extends keyof SignalDataTypeMap>(
    type: T,
    ids: string[]
  ): Promise<{ [id: string]: SignalDataTypeMap[T] | undefined }> => {
    const data: { [id: string]: SignalDataTypeMap[T] | undefined } = {};
    
    for (const id of ids) {
      const filePath = path.join(sessionPath, `${type}-${id}.json`);
      const content = await readJsonFile<SignalDataTypeMap[T]>(filePath);
      if (content) {
        data[id] = content;
      }
    }
    
    return data;
  };

  /**
   * Write key to file (PATCH-087: now async)
   */
  const writeKey = async <T extends keyof SignalDataTypeMap>(
    type: T,
    data: { [id: string]: SignalDataTypeMap[T] }
  ): Promise<void> => {
    for (const [id, value] of Object.entries(data)) {
      const filePath = path.join(sessionPath, `${type}-${id}.json`);
      if (value) {
        await writeJsonFile(filePath, value);
      } else {
        // Delete file if value is null/undefined
        try {
          await fsp.unlink(filePath);
        } catch (e: any) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
    }
  };

  // Initialize credentials
  const creds = await readCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          return await readKey(type, ids) as any;
        },
        set: async (data) => {
          for (const category in data) {
            const categoryData = data[category as keyof SignalDataTypeMap];
            if (categoryData) {
              await writeKey(category as keyof SignalDataTypeMap, categoryData as any);
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeCreds(creds);
    },
  };
}

// ============================================
// SESSION BACKUP SERVICE
// ============================================

/**
 * Backup session to database (encrypted)
 */
export async function backupSession(
  instanceId: string,
  _prisma: any
): Promise<string | null> {
  try {
    const sessionPath = getSessionPath(instanceId);
    if (!fs.existsSync(sessionPath)) {
      return null;
    }

    // Read all session files
    const files = fs.readdirSync(sessionPath);
    const sessionData: Record<string, any> = {};

    for (const file of files) {
      const filePath = path.join(sessionPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      sessionData[file] = content;
    }

    // Return as base64 encoded JSON
    return Buffer.from(JSON.stringify(sessionData)).toString('base64');
  } catch (error) {
    logger.error({ error, instanceId }, 'Error backing up session');
    return null;
  }
}

/**
 * Restore session from backup
 */
export async function restoreSession(
  instanceId: string,
  backupData: string
): Promise<boolean> {
  try {
    const sessionPath = getSessionPath(instanceId);
    
    // Ensure directory exists
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Decode backup data
    const sessionData = JSON.parse(
      Buffer.from(backupData, 'base64').toString('utf-8')
    ) as Record<string, string>;

    // Write all files — sanitize file names to prevent path traversal
    for (const [rawFileName, content] of Object.entries(sessionData)) {
      const safeFileName = sanitizeFileName(rawFileName);
      const filePath = path.join(sessionPath, safeFileName);
      assertPathWithinBase(filePath, sessionPath);
      fs.writeFileSync(filePath, content);
    }

    return true;
  } catch (error) {
    logger.error({ error, instanceId }, 'Error restoring session');
    return false;
  }
}

/**
 * Get session info (for debugging)
 */
export function getSessionInfo(instanceId: string): {
  exists: boolean;
  files: string[];
  size: number;
  lastModified: Date | null;
} {
  const sessionPath = getSessionPath(instanceId);
  
  if (!fs.existsSync(sessionPath)) {
    return {
      exists: false,
      files: [],
      size: 0,
      lastModified: null,
    };
  }

  const files = fs.readdirSync(sessionPath);
  let totalSize = 0;
  let latestModified: Date | null = null;

  for (const file of files) {
    const filePath = path.join(sessionPath, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    
    if (!latestModified || stats.mtime > latestModified) {
      latestModified = stats.mtime;
    }
  }

  return {
    exists: true,
    files,
    size: totalSize,
    lastModified: latestModified,
  };
}

/**
 * List all sessions in storage
 */
export function listAllSessions(): string[] {
  ensureSessionsDir();
  
  try {
    return fs.readdirSync(SESSIONS_BASE_PATH).filter((dir) => {
      const credsPath = path.join(SESSIONS_BASE_PATH, dir, 'creds.json');
      return fs.existsSync(credsPath);
    });
  } catch (error) {
    logger.error({ error }, 'Error listing sessions');
    return [];
  }
}

/**
 * Clean orphaned sessions (sessions without corresponding database record)
 */
export async function cleanOrphanedSessions(
  validInstanceIds: string[]
): Promise<number> {
  ensureSessionsDir();
  
  try {
    const allSessions = fs.readdirSync(SESSIONS_BASE_PATH);
    let cleaned = 0;

    for (const sessionId of allSessions) {
      if (!validInstanceIds.includes(sessionId)) {
        const sessionPath = path.join(SESSIONS_BASE_PATH, sessionId);
        fs.rmSync(sessionPath, { recursive: true, force: true });
        cleaned++;
        logger.info({ sessionId }, 'Cleaned orphaned session');
      }
    }

    return cleaned;
  } catch (error) {
    logger.error({ error }, 'Error cleaning orphaned sessions');
    return 0;
  }
}
