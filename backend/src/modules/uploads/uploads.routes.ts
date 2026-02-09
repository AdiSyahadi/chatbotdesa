import { FastifyInstance } from 'fastify';
import { JWTPayload } from '../../types';
import { saveFile, validateFile } from '../../services/storage.service';
import '../../types';

// ============================================
// UPLOAD ROUTES
// File upload endpoints
// ============================================

export default async function uploadRoutes(fastify: FastifyInstance) {
  /**
   * Upload file
   * POST /api/uploads
   */
  fastify.post('/', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Upload a file (image, document, video, audio)',
      tags: ['Uploads'],
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;

    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'No file uploaded',
        });
      }

      // Get expected type from field name or query
      const expectedType = (request.query as { type?: string }).type;

      // Validate file
      const validation = validateFile(data.mimetype, data.file.bytesRead, expectedType);
      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          error: validation.error,
        });
      }

      // Save file
      const result = await saveFile(
        data.file,
        data.filename,
        data.mimetype,
        user.organizationId
      );

      if (!result.success) {
        return reply.status(500).send({
          success: false,
          error: result.error,
        });
      }

      return reply.send({
        success: true,
        data: {
          url: result.url,
          filename: result.filename,
          media_type: validation.mediaType,
          original_name: data.filename,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process upload',
      });
    }
  });

  /**
   * Upload multiple files
   * POST /api/uploads/multiple
   */
  fastify.post('/multiple', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Upload multiple files',
      tags: ['Uploads'],
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;

    try {
      const files = request.files();
      const results: any[] = [];
      const errors: any[] = [];

      for await (const file of files) {
        const validation = validateFile(file.mimetype, file.file.bytesRead);
        
        if (!validation.valid) {
          errors.push({
            filename: file.filename,
            error: validation.error,
          });
          continue;
        }

        const result = await saveFile(
          file.file,
          file.filename,
          file.mimetype,
          user.organizationId
        );

        if (result.success) {
          results.push({
            url: result.url,
            filename: result.filename,
            media_type: validation.mediaType,
            original_name: file.filename,
          });
        } else {
          errors.push({
            filename: file.filename,
            error: result.error,
          });
        }
      }

      return reply.send({
        success: true,
        data: {
          uploaded: results,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process uploads',
      });
    }
  });
}
