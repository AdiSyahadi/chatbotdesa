/**
 * Contacts Module - API Routes
 * @module contacts/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { contactService } from './contacts.service';
import {
  createContactSchema,
  updateContactSchema,
  bulkCreateContactsSchema,
  listContactsQuerySchema,
  contactIdParamSchema,
  tagOperationSchema,
  bulkTagOperationSchema,
  bulkDeleteContactsSchema,
  exportContactsQuerySchema,
  CreateContactInput,
  UpdateContactInput,
  BulkCreateContactsInput,
  ListContactsQuery,
  ContactIdParam,
  TagOperationInput,
  BulkTagOperationInput,
  BulkDeleteContactsInput,
  ExportContactsQuery,
} from './contacts.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

const errorCodeMap: Record<string, { statusCode: number; code: string; message: string }> = {
  CONTACT_NOT_FOUND: {
    statusCode: 404,
    code: 'CONTACT_001',
    message: 'Contact not found',
  },
  CONTACT_EXISTS: {
    statusCode: 409,
    code: 'CONTACT_002',
    message: 'Contact already exists with this phone number',
  },
  INSTANCE_NOT_FOUND: {
    statusCode: 404,
    code: 'CONTACT_003',
    message: 'WhatsApp instance not found',
  },
  INVALID_CSV: {
    statusCode: 400,
    code: 'CONTACT_004',
    message: 'Invalid CSV file format',
  },
};

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    const mappedError = errorCodeMap[error.message];
    if (mappedError) {
      return reply.status(mappedError.statusCode).send({
        success: false,
        error: {
          code: mappedError.code,
          message: mappedError.message,
        },
      });
    }
  }

  logger.error({ err: error }, 'Contacts module error');
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROUTES REGISTRATION
// ============================================

export async function contactsRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Unauthorized',
        },
      });
    }
  });

  // =====================
  // LIST CONTACTS
  // =====================
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const query = listContactsQuerySchema.parse(request.query);

      const result = await contactService.listContacts(
        user.organizationId,
        query
      );

      return reply.send({
        success: true,
        data: result.contacts,
        pagination: result.pagination,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET UNIQUE TAGS
  // =====================
  fastify.get('/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      
      const tags = await contactService.getUniqueTags(user.organizationId);

      return reply.send({
        success: true,
        data: { tags },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET CONTACTS COUNT
  // =====================
  fastify.get('/count', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const query = request.query as { instance_id?: string };

      const count = await contactService.getContactsCount(
        user.organizationId,
        query.instance_id
      );

      return reply.send({
        success: true,
        data: { count },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // EXPORT CONTACTS
  // =====================
  fastify.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const query = exportContactsQuerySchema.parse(request.query);

      const contacts = await contactService.exportContacts(
        user.organizationId,
        query.instance_id,
        query.tags ? query.tags.split(',') : undefined
      );

      if (query.format === 'csv') {
        // Generate CSV
        const headers = ['phone_number', 'name', 'push_name', 'tags', 'notes', 'created_at'];
        const csvRows = [
          headers.join(','),
          ...contacts.map(c => [
            c.phone_number || '',
            `"${(c.name || '').replace(/"/g, '""')}"`,
            `"${(c.push_name || '').replace(/"/g, '""')}"`,
            `"${(c.tags || []).join(', ')}"`,
            `"${(c.notes || '').replace(/"/g, '""')}"`,
            c.created_at.toISOString(),
          ].join(','))
        ];

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename=contacts.csv');
        return reply.send(csvRows.join('\n'));
      }

      return reply.send({
        success: true,
        data: contacts,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET SINGLE CONTACT
  // =====================
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = contactIdParamSchema.parse(request.params);

      const contact = await contactService.getContactById(
        params.id,
        user.organizationId
      );

      if (!contact) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'CONTACT_001',
            message: 'Contact not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: contact,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // CREATE CONTACT
  // =====================
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const body = createContactSchema.parse(request.body);

      const contact = await contactService.createContact(
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: contact,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // BULK CREATE CONTACTS
  // =====================
  fastify.post('/bulk', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const body = bulkCreateContactsSchema.parse(request.body);

      const result = await contactService.bulkCreateContacts(
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // IMPORT FROM CSV
  // =====================
  fastify.post('/import', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      
      // Check if multipart
      const contentType = request.headers['content-type'] || '';
      
      if (contentType.includes('multipart/form-data')) {
        // Handle file upload
        const data = await request.file();
        
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'CONTACT_004',
              message: 'No file uploaded',
            },
          });
        }

        // Read CSV content
        const buffer = await data.toBuffer();
        const csvContent = buffer.toString('utf-8');
        
        // Parse CSV (simple parsing)
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'CONTACT_004',
              message: 'CSV file must have headers and at least one data row',
            },
          });
        }

        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Parse rows
        const rows: Record<string, string>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          rows.push(row);
        }

        // Get instance_id from form field
        const fields = data.fields as Record<string, any>;
        const instanceId = fields?.instance_id?.value || fields?.instance_id;
        const skipDuplicates = fields?.skip_duplicates?.value !== 'false';
        const defaultTags = fields?.default_tags?.value 
          ? fields.default_tags.value.split(',').map((t: string) => t.trim())
          : undefined;

        if (!instanceId) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'instance_id is required',
            },
          });
        }

        const result = await contactService.importFromCsv(
          user.organizationId,
          instanceId,
          rows,
          skipDuplicates,
          defaultTags
        );

        return reply.status(201).send({
          success: true,
          data: result,
        });
      } else {
        // Handle JSON with CSV content
        const body = request.body as {
          instance_id: string;
          csv_content: string;
          skip_duplicates?: boolean;
          default_tags?: string[];
        };

        if (!body.instance_id || !body.csv_content) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'instance_id and csv_content are required',
            },
          });
        }

        // Parse CSV content
        const lines = body.csv_content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'CONTACT_004',
              message: 'CSV content must have headers and at least one data row',
            },
          });
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rows: Record<string, string>[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          rows.push(row);
        }

        const result = await contactService.importFromCsv(
          user.organizationId,
          body.instance_id,
          rows,
          body.skip_duplicates !== false,
          body.default_tags
        );

        return reply.status(201).send({
          success: true,
          data: result,
        });
      }
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // UPDATE CONTACT
  // =====================
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = contactIdParamSchema.parse(request.params);
      const body = updateContactSchema.parse(request.body);

      const contact = await contactService.updateContact(
        params.id,
        user.organizationId,
        body
      );

      return reply.send({
        success: true,
        data: contact,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // DELETE CONTACT
  // =====================
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = contactIdParamSchema.parse(request.params);

      await contactService.deleteContact(params.id, user.organizationId);

      return reply.send({
        success: true,
        data: { message: 'Contact deleted successfully' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // BULK DELETE CONTACTS
  // =====================
  fastify.post('/bulk-delete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const body = bulkDeleteContactsSchema.parse(request.body);

      const result = await contactService.bulkDeleteContacts(
        user.organizationId,
        body
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ADD TAGS TO CONTACT
  // =====================
  fastify.post('/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = contactIdParamSchema.parse(request.params);
      const body = tagOperationSchema.parse(request.body);

      const contact = await contactService.addTags(
        params.id,
        user.organizationId,
        body.tags
      );

      return reply.send({
        success: true,
        data: contact,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // REMOVE TAGS FROM CONTACT
  // =====================
  fastify.delete('/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = contactIdParamSchema.parse(request.params);
      const body = tagOperationSchema.parse(request.body);

      const contact = await contactService.removeTags(
        params.id,
        user.organizationId,
        body.tags
      );

      return reply.send({
        success: true,
        data: contact,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // BULK TAG OPERATION
  // =====================
  fastify.post('/bulk-tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const body = bulkTagOperationSchema.parse(request.body);

      const result = await contactService.bulkTagOperation(
        user.organizationId,
        body
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

export default contactsRoutes;
