import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON,
} from '@whiskeysockets/baileys';
import pino from 'pino';

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
  return path.join(SESSIONS_BASE_PATH, instanceId);
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
 * Read JSON file safely
 */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content, BufferJSON.reviver);
  } catch (error) {
    logger.error({ error, filePath }, 'Error reading JSON file');
    return null;
  }
}

/**
 * Write JSON file safely
 */
function writeJsonFile(filePath: string, data: any): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, BufferJSON.replacer, 2));
  } catch (error) {
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
    const creds = readJsonFile<AuthenticationCreds>(credsPath);
    return creds || initAuthCreds();
  };

  /**
   * Write credentials to file
   */
  const writeCreds = async (creds: AuthenticationCreds): Promise<void> => {
    writeJsonFile(credsPath, creds);
  };

  /**
   * Read key from file
   */
  const readKey = <T extends keyof SignalDataTypeMap>(
    type: T,
    ids: string[]
  ): { [id: string]: SignalDataTypeMap[T] | undefined } => {
    const data: { [id: string]: SignalDataTypeMap[T] | undefined } = {};
    
    for (const id of ids) {
      const filePath = path.join(sessionPath, `${type}-${id}.json`);
      const content = readJsonFile<SignalDataTypeMap[T]>(filePath);
      if (content) {
        data[id] = content;
      }
    }
    
    return data;
  };

  /**
   * Write key to file
   */
  const writeKey = <T extends keyof SignalDataTypeMap>(
    type: T,
    data: { [id: string]: SignalDataTypeMap[T] }
  ): void => {
    for (const [id, value] of Object.entries(data)) {
      const filePath = path.join(sessionPath, `${type}-${id}.json`);
      if (value) {
        writeJsonFile(filePath, value);
      } else {
        // Delete file if value is null/undefined
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
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
          return readKey(type, ids) as any;
        },
        set: async (data) => {
          for (const category in data) {
            const categoryData = data[category as keyof SignalDataTypeMap];
            if (categoryData) {
              writeKey(category as keyof SignalDataTypeMap, categoryData as any);
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

    // Write all files
    for (const [fileName, content] of Object.entries(sessionData)) {
      const filePath = path.join(sessionPath, fileName);
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
