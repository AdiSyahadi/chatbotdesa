/**
 * Contacts Module - Business Logic Service
 * @module contacts/service
 */

import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import {
  CreateContactInput,
  UpdateContactInput,
  BulkCreateContactsInput,
  ListContactsQuery,
  BulkTagOperationInput,
  BulkDeleteContactsInput,
  ContactResponse,
  ContactListResponse,
  BulkCreateResult,
  ImportContactsResult,
  formatPhoneToJid,
  parseContactCsvRow,
} from './contacts.schema';

// ============================================
// CONTACT SERVICE CLASS
// ============================================

export class ContactService {
  /**
   * List contacts with filtering and pagination
   */
  async listContacts(
    organizationId: string,
    query: ListContactsQuery
  ): Promise<ContactListResponse> {
    const {
      instance_id,
      search,
      tags,
      is_business,
      is_group,
      page,
      limit,
      sort_by,
      sort_order,
    } = query;

    // Build where clause
    const where: Prisma.ContactWhereInput = {
      organization_id: organizationId,
    };

    if (instance_id) {
      where.instance_id = instance_id;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { push_name: { contains: search } },
        { phone_number: { contains: search } },
        { jid: { contains: search } },
      ];
    }

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      // Using JSON_CONTAINS for MySQL
      where.AND = tagArray.map(tag => ({
        tags: {
          path: '$',
          array_contains: tag,
        },
      }));
    }

    if (is_business !== undefined) {
      where.is_business = is_business === 'true';
    }

    if (is_group !== undefined) {
      where.is_group = is_group === 'true';
    }

    // Count total
    const total = await prisma.contact.count({ where });

    // Get contacts
    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { [sort_by]: sort_order },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      contacts: contacts.map(this.formatContactResponse),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single contact by ID
   */
  async getContactById(
    contactId: string,
    organizationId: string
  ): Promise<ContactResponse | null> {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organization_id: organizationId,
      },
    });

    if (!contact) return null;
    return this.formatContactResponse(contact);
  }

  /**
   * Get contact by phone number
   */
  async getContactByPhone(
    instanceId: string,
    phoneNumber: string,
    organizationId: string
  ): Promise<ContactResponse | null> {
    const jid = formatPhoneToJid(phoneNumber);

    const contact = await prisma.contact.findFirst({
      where: {
        instance_id: instanceId,
        jid,
        organization_id: organizationId,
      },
    });

    if (!contact) return null;
    return this.formatContactResponse(contact);
  }

  /**
   * Create a new contact
   */
  async createContact(
    organizationId: string,
    input: CreateContactInput
  ): Promise<ContactResponse> {
    const { instance_id, phone_number, name, tags, custom_fields, notes } = input;

    // Verify instance belongs to organization
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instance_id,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('WhatsApp instance not found', 404, 'CONTACT_003');
    }

    // Format phone to JID
    const jid = formatPhoneToJid(phone_number);

    // Check for duplicate
    const existing = await prisma.contact.findFirst({
      where: {
        instance_id,
        jid,
      },
    });

    if (existing) {
      throw new AppError('Contact already exists with this phone number', 409, 'CONTACT_002');
    }

    // Create contact
    const contact = await prisma.contact.create({
      data: {
        organization_id: organizationId,
        instance_id,
        jid,
        phone_number,
        name,
        tags: tags || [],
        custom_fields: custom_fields ?? Prisma.JsonNull,
        notes,
      },
    });

    logger.info({ contactId: contact.id, phone_number }, 'Contact created');
    return this.formatContactResponse(contact);
  }

  /**
   * Update an existing contact
   */
  async updateContact(
    contactId: string,
    organizationId: string,
    input: UpdateContactInput
  ): Promise<ContactResponse> {
    const { name, tags, custom_fields, notes } = input;

    // Verify contact exists and belongs to organization
    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Contact not found', 404, 'CONTACT_001');
    }

    // Update contact
    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(name !== undefined && { name }),
        ...(tags !== undefined && { tags }),
        ...(custom_fields !== undefined && { custom_fields }),
        ...(notes !== undefined && { notes }),
      },
    });

    logger.info({ contactId }, 'Contact updated');
    return this.formatContactResponse(updated);
  }

  /**
   * Delete a contact
   */
  async deleteContact(
    contactId: string,
    organizationId: string
  ): Promise<void> {
    const existing = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Contact not found', 404, 'CONTACT_001');
    }

    await prisma.contact.delete({
      where: { id: contactId },
    });

    logger.info({ contactId }, 'Contact deleted');
  }

  /**
   * Bulk create contacts
   */
  async bulkCreateContacts(
    organizationId: string,
    input: BulkCreateContactsInput
  ): Promise<BulkCreateResult> {
    const { instance_id, contacts, skip_duplicates } = input;

    // Verify instance
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instance_id,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('WhatsApp instance not found', 404, 'CONTACT_003');
    }

    const result: BulkCreateResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get existing JIDs for this instance
    const jids = contacts.map(c => formatPhoneToJid(c.phone_number));
    const existingContacts = await prisma.contact.findMany({
      where: {
        instance_id,
        jid: { in: jids },
      },
      select: { jid: true },
    });
    const existingJids = new Set(existingContacts.map(c => c.jid));

    // Process contacts
    const contactsToCreate: Prisma.ContactCreateManyInput[] = [];

    for (const contact of contacts) {
      const jid = formatPhoneToJid(contact.phone_number);

      if (existingJids.has(jid)) {
        if (skip_duplicates) {
          result.skipped++;
          continue;
        } else {
          result.failed++;
          result.errors.push({
            phone_number: contact.phone_number,
            error: 'Contact already exists',
          });
          continue;
        }
      }

      contactsToCreate.push({
        organization_id: organizationId,
        instance_id,
        jid,
        phone_number: contact.phone_number,
        name: contact.name,
        tags: contact.tags || [],
        custom_fields: contact.custom_fields ?? Prisma.JsonNull,
        notes: contact.notes,
      });

      existingJids.add(jid); // Prevent duplicates within batch
    }

    // Bulk insert
    if (contactsToCreate.length > 0) {
      const { count } = await prisma.contact.createMany({
        data: contactsToCreate,
        skipDuplicates: true,
      });
      result.created = count;
    }

    logger.info(
      { instanceId: instance_id, ...result },
      'Bulk contacts created'
    );

    return result;
  }

  /**
   * Bulk delete contacts
   */
  async bulkDeleteContacts(
    organizationId: string,
    input: BulkDeleteContactsInput
  ): Promise<{ deleted: number }> {
    const { contact_ids } = input;

    const result = await prisma.contact.deleteMany({
      where: {
        id: { in: contact_ids },
        organization_id: organizationId,
      },
    });

    logger.info(
      { deletedCount: result.count, contactIds: contact_ids },
      'Bulk contacts deleted'
    );

    return { deleted: result.count };
  }

  /**
   * Bulk tag operation
   */
  async bulkTagOperation(
    organizationId: string,
    input: BulkTagOperationInput
  ): Promise<{ updated: number }> {
    const { contact_ids, tags, operation } = input;

    // Get contacts
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: contact_ids },
        organization_id: organizationId,
      },
    });

    let updated = 0;

    for (const contact of contacts) {
      let newTags: string[];
      const currentTags = (contact.tags as string[]) || [];

      switch (operation) {
        case 'add':
          // Add tags (avoid duplicates)
          newTags = [...new Set([...currentTags, ...tags])];
          break;
        case 'remove':
          // Remove specified tags
          newTags = currentTags.filter(t => !tags.includes(t));
          break;
        case 'set':
          // Replace all tags
          newTags = tags;
          break;
        default:
          newTags = currentTags;
      }

      await prisma.contact.update({
        where: { id: contact.id },
        data: { tags: newTags },
      });

      updated++;
    }

    logger.info(
      { operation, tags, updated },
      'Bulk tag operation completed'
    );

    return { updated };
  }

  /**
   * Add tags to a contact
   */
  async addTags(
    contactId: string,
    organizationId: string,
    tags: string[]
  ): Promise<ContactResponse> {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organization_id: organizationId,
      },
    });

    if (!contact) {
      throw new AppError('Contact not found', 404, 'CONTACT_001');
    }

    const currentTags = (contact.tags as string[]) || [];
    const newTags = [...new Set([...currentTags, ...tags])];

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { tags: newTags },
    });

    return this.formatContactResponse(updated);
  }

  /**
   * Remove tags from a contact
   */
  async removeTags(
    contactId: string,
    organizationId: string,
    tags: string[]
  ): Promise<ContactResponse> {
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        organization_id: organizationId,
      },
    });

    if (!contact) {
      throw new AppError('Contact not found', 404, 'CONTACT_001');
    }

    const currentTags = (contact.tags as string[]) || [];
    const newTags = currentTags.filter(t => !tags.includes(t));

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { tags: newTags },
    });

    return this.formatContactResponse(updated);
  }

  /**
   * Import contacts from CSV data
   */
  async importFromCsv(
    organizationId: string,
    instanceId: string,
    csvRows: Record<string, string>[],
    skipDuplicates: boolean = true,
    defaultTags?: string[]
  ): Promise<ImportContactsResult> {
    // Verify instance
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('WhatsApp instance not found', 404, 'CONTACT_003');
    }

    const result: ImportContactsResult = {
      total_rows: csvRows.length,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get existing JIDs
    const existingContacts = await prisma.contact.findMany({
      where: { instance_id: instanceId },
      select: { jid: true },
    });
    const existingJids = new Set(existingContacts.map(c => c.jid));

    const contactsToCreate: Prisma.ContactCreateManyInput[] = [];

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const rowNum = i + 1;

      try {
        const parsed = parseContactCsvRow(row);

        if (!parsed) {
          result.failed++;
          result.errors.push({
            row: rowNum,
            error: 'Missing phone number column',
          });
          continue;
        }

        const jid = formatPhoneToJid(parsed.phone_number);

        if (existingJids.has(jid)) {
          if (skipDuplicates) {
            result.skipped++;
            continue;
          } else {
            result.failed++;
            result.errors.push({
              row: rowNum,
              phone_number: parsed.phone_number,
              error: 'Contact already exists',
            });
            continue;
          }
        }

        // Merge tags
        const tags = [...(parsed.tags || []), ...(defaultTags || [])];

        contactsToCreate.push({
          organization_id: organizationId,
          instance_id: instanceId,
          jid,
          phone_number: parsed.phone_number,
          name: parsed.name,
          tags: [...new Set(tags)],
        });

        existingJids.add(jid);
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Bulk insert
    if (contactsToCreate.length > 0) {
      const { count } = await prisma.contact.createMany({
        data: contactsToCreate,
        skipDuplicates: true,
      });
      result.created = count;
    }

    logger.info(
      { instanceId, ...result },
      'CSV import completed'
    );

    return result;
  }

  /**
   * Export contacts to array
   */
  async exportContacts(
    organizationId: string,
    instanceId?: string,
    tags?: string[]
  ): Promise<ContactResponse[]> {
    const where: Prisma.ContactWhereInput = {
      organization_id: organizationId,
    };

    if (instanceId) {
      where.instance_id = instanceId;
    }

    // Tag filtering would need raw query for MySQL JSON
    // Simplified version without tag filtering for export

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return contacts.map(this.formatContactResponse);
  }

  /**
   * Get all unique tags in organization
   */
  async getUniqueTags(organizationId: string): Promise<string[]> {
    const contacts = await prisma.contact.findMany({
      where: { organization_id: organizationId },
      select: { tags: true },
    });

    const allTags = new Set<string>();
    
    for (const contact of contacts) {
      const tags = contact.tags as string[] | null;
      if (tags && Array.isArray(tags)) {
        tags.forEach(tag => allTags.add(tag));
      }
    }

    return Array.from(allTags).sort();
  }

  /**
   * Sync contact from WhatsApp (called when receiving messages)
   */
  async syncFromWhatsApp(
    organizationId: string,
    instanceId: string,
    jid: string,
    pushName?: string | null
  ): Promise<ContactResponse> {
    // Try to find existing contact
    let contact = await prisma.contact.findFirst({
      where: {
        instance_id: instanceId,
        jid,
      },
    });

    const phoneNumber = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');

    if (contact) {
      // Update push_name and last_seen if changed
      if (pushName && pushName !== contact.push_name) {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: {
            push_name: pushName,
            last_seen_at: new Date(),
          },
        });
      } else {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { last_seen_at: new Date() },
        });
      }
    } else {
      // Create new contact
      contact = await prisma.contact.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          jid,
          phone_number: phoneNumber,
          push_name: pushName,
          is_group: jid.includes('@g.us'),
          tags: [],
        },
      });

      logger.info(
        { contactId: contact.id, jid },
        'Contact auto-synced from WhatsApp'
      );
    }

    return this.formatContactResponse(contact);
  }

  /**
   * Get contacts count by instance
   */
  async getContactsCount(
    organizationId: string,
    instanceId?: string
  ): Promise<number> {
    return prisma.contact.count({
      where: {
        organization_id: organizationId,
        ...(instanceId && { instance_id: instanceId }),
      },
    });
  }

  /**
   * Format contact to response object
   */
  private formatContactResponse(contact: any): ContactResponse {
    return {
      id: contact.id,
      instance_id: contact.instance_id,
      jid: contact.jid,
      phone_number: contact.phone_number,
      name: contact.name,
      push_name: contact.push_name,
      is_business: contact.is_business,
      is_enterprise: contact.is_enterprise,
      is_group: contact.is_group,
      profile_pic_url: contact.profile_pic_url,
      status_text: contact.status_text,
      tags: (contact.tags as string[]) || [],
      custom_fields: contact.custom_fields as Record<string, any> | null,
      notes: contact.notes,
      last_seen_at: contact.last_seen_at,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    };
  }
}

// Export singleton instance
export const contactService = new ContactService();
