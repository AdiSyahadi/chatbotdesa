import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';

// ============================================
// STORAGE SERVICE
// File storage management for uploads
// ============================================

const UPLOADS_PATH = path.join(config.storage.path, 'uploads');

// Allowed file types
const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  video: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
};

// Max file sizes in bytes
const MAX_SIZES: Record<string, number> = {
  image: 16 * 1024 * 1024, // 16MB
  document: 100 * 1024 * 1024, // 100MB
  video: 64 * 1024 * 1024, // 64MB
  audio: 16 * 1024 * 1024, // 16MB
};

/**
 * Ensure uploads directory exists
 */
export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
  }
}

/**
 * Get media type from mimetype
 */
export function getMediaType(mimetype: string): string | null {
  for (const [type, mimetypes] of Object.entries(ALLOWED_TYPES)) {
    if (mimetypes.includes(mimetype)) {
      return type;
    }
  }
  return null;
}

/**
 * Validate file for upload
 */
export function validateFile(
  mimetype: string,
  size: number,
  expectedType?: string
): { valid: boolean; error?: string; mediaType?: string } {
  const mediaType = getMediaType(mimetype);

  if (!mediaType) {
    return { valid: false, error: `File type ${mimetype} is not allowed` };
  }

  if (expectedType && mediaType !== expectedType) {
    return { valid: false, error: `Expected ${expectedType} but got ${mediaType}` };
  }

  const maxSize = MAX_SIZES[mediaType];
  if (size > maxSize) {
    return { valid: false, error: `File too large. Max size for ${mediaType} is ${maxSize / 1024 / 1024}MB` };
  }

  return { valid: true, mediaType };
}

/**
 * Get file extension from mimetype
 */
function getExtension(mimetype: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/mpeg': '.mpeg',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'text/csv': '.csv',
  };
  return extensions[mimetype] || '';
}

/**
 * Save file to local storage
 */
export async function saveFile(
  fileStream: Readable,
  filename: string,
  mimetype: string,
  organizationId: string
): Promise<{
  success: boolean;
  path?: string;
  url?: string;
  filename?: string;
  error?: string;
}> {
  try {
    ensureUploadsDir();

    // Create organization subfolder
    const orgPath = path.join(UPLOADS_PATH, organizationId);
    if (!fs.existsSync(orgPath)) {
      fs.mkdirSync(orgPath, { recursive: true });
    }

    // Generate unique filename
    const ext = getExtension(mimetype) || path.extname(filename);
    const uniqueFilename = `${uuidv4()}${ext}`;
    const filePath = path.join(orgPath, uniqueFilename);

    // Write file
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(fileStream, writeStream);

    // Generate URL (relative to storage path)
    // Strip trailing /api or /api/ from APP_URL so uploads URL is always at root level
    // e.g. "https://wapi.abdashboard.com/api" → "https://wapi.abdashboard.com"
    const baseUrl = config.app.url.replace(/\/api\/?$/, '');
    const relativePath = `/uploads/${organizationId}/${uniqueFilename}`;
    const fullUrl = `${baseUrl}${relativePath}`;

    return {
      success: true,
      path: filePath,
      url: fullUrl,
      filename: uniqueFilename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save file',
    };
  }
}

/**
 * Delete file from storage
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get file from storage
 */
export function getFilePath(relativePath: string): string | null {
  const fullPath = path.join(config.storage.path, relativePath);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}
