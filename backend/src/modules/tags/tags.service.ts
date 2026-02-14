/**
 * Tags Module - Business Logic Service
 * @module tags/service
 */

import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import {
  CreateTagInput,
  UpdateTagInput,
  ListTagsQuery,
  AssignTagInput,
  RemoveTagInput,
  BulkTagOperationInput,
  MergeTagsInput,
  TagResponse,
  TagListResponse,
  TagStats,
  TagOperationResult,
  TAG_COLORS,
} from './tags.schema';

// ============================================
// TAG SERVICE CLASS
// ============================================

class TagService {
  /**
   * Create a new tag
   */
  async createTag(
    organizationId: string,
    input: CreateTagInput
  ): Promise<TagResponse> {
    // Check for duplicate name in organization
    const existingTag = await prisma.tag.findUnique({
      where: {
        organization_id_name: {
          organization_id: organizationId,
          name: input.name,
        },
      },
    });

    if (existingTag) {
      throw new AppError(`Tag "${input.name}" already exists`, 409, 'TAG_002');
    }

    const tag = await prisma.tag.create({
      data: {
        organization_id: organizationId,
        name: input.name,
        color: input.color || '#6B7280',
        description: input.description || null,
        contact_count: 0,
      },
    });

    logger.info({ tagId: tag.id, organizationId }, 'Tag created');

    return this.formatTagResponse(tag);
  }

  /**
   * Get tag by ID
   */
  async getTag(
    organizationId: string,
    tagId: string
  ): Promise<TagResponse | null> {
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!tag) {
      return null;
    }

    return this.formatTagResponse(tag);
  }

  /**
   * Get tag by name
   */
  async getTagByName(
    organizationId: string,
    name: string
  ): Promise<TagResponse | null> {
    const tag = await prisma.tag.findUnique({
      where: {
        organization_id_name: {
          organization_id: organizationId,
          name,
        },
      },
    });

    if (!tag) {
      return null;
    }

    return this.formatTagResponse(tag);
  }

  /**
   * List tags with filtering and pagination
   */
  async listTags(
    organizationId: string,
    query: ListTagsQuery
  ): Promise<TagListResponse> {
    const { page, limit, sort_by, sort_order, search } = query;

    // Build where clause
    const where: Prisma.TagWhereInput = {
      organization_id: organizationId,
    };

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Get total count
    const total = await prisma.tag.count({ where });

    // Get tags
    const tags = await prisma.tag.findMany({
      where,
      orderBy: { [sort_by]: sort_order },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: tags.map((t) => this.formatTagResponse(t)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all tags (without pagination, for dropdowns)
   */
  async getAllTags(organizationId: string): Promise<TagResponse[]> {
    const tags = await prisma.tag.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: 'asc' },
    });

    return tags.map((t) => this.formatTagResponse(t));
  }

  /**
   * Update a tag
   */
  async updateTag(
    organizationId: string,
    tagId: string,
    input: UpdateTagInput
  ): Promise<TagResponse | null> {
    // Check tag exists
    const existing = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    // Check for duplicate name if name is being updated
    if (input.name && input.name !== existing.name) {
      const duplicateName = await prisma.tag.findUnique({
        where: {
          organization_id_name: {
            organization_id: organizationId,
            name: input.name,
          },
        },
      });

      if (duplicateName) {
        throw new AppError(`Tag "${input.name}" already exists`, 409, 'TAG_002');
      }
    }

    // Build update data
    const updateData: Prisma.TagUpdateInput = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.color !== undefined) updateData.color = input.color;
    if (input.description !== undefined) updateData.description = input.description;

    const tag = await prisma.tag.update({
      where: { id: tagId },
      data: updateData,
    });

    logger.info({ tagId, organizationId }, 'Tag updated');

    return this.formatTagResponse(tag);
  }

  /**
   * Delete a tag
   */
  async deleteTag(
    organizationId: string,
    tagId: string
  ): Promise<boolean> {
    const existing = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      return false;
    }

    // Delete tag (cascade will remove ContactTag entries)
    await prisma.tag.delete({
      where: { id: tagId },
    });

    logger.info({ tagId, organizationId }, 'Tag deleted');

    return true;
  }

  /**
   * Assign tag to contacts
   */
  async assignTagToContacts(
    organizationId: string,
    tagId: string,
    input: AssignTagInput
  ): Promise<TagOperationResult> {
    // Verify tag exists and belongs to organization
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404, 'TAG_001');
    }

    // Verify contacts exist and belong to organization
    const validContacts = await prisma.contact.findMany({
      where: {
        id: { in: input.contact_ids },
        organization_id: organizationId,
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);

    if (validContactIds.length === 0) {
      return {
        success: false,
        affected_contacts: 0,
        message: 'No valid contacts found',
      };
    }

    // Create ContactTag entries (skip duplicates)
    const contactTagData = validContactIds.map((contactId) => ({
      contact_id: contactId,
      tag_id: tagId,
    }));

    // Use createMany with skipDuplicates
    const result = await prisma.contactTag.createMany({
      data: contactTagData,
      skipDuplicates: true,
    });

    // Update tag's contact_count
    await this.updateTagContactCount(tagId);

    logger.info({ tagId, contactCount: result.count, organizationId }, 'Tag assigned to contacts');

    return {
      success: true,
      affected_contacts: result.count,
      message: `Tag assigned to ${result.count} contact(s)`,
    };
  }

  /**
   * Remove tag from contacts
   */
  async removeTagFromContacts(
    organizationId: string,
    tagId: string,
    input: RemoveTagInput
  ): Promise<TagOperationResult> {
    // Verify tag exists and belongs to organization
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404, 'TAG_001');
    }

    // Delete ContactTag entries
    const result = await prisma.contactTag.deleteMany({
      where: {
        tag_id: tagId,
        contact_id: { in: input.contact_ids },
      },
    });

    // Update tag's contact_count
    await this.updateTagContactCount(tagId);

    logger.info({ tagId, contactCount: result.count, organizationId }, 'Tag removed from contacts');

    return {
      success: true,
      affected_contacts: result.count,
      message: `Tag removed from ${result.count} contact(s)`,
    };
  }

  /**
   * Bulk tag operation (add/remove multiple tags to/from multiple contacts)
   */
  async bulkTagOperation(
    organizationId: string,
    input: BulkTagOperationInput
  ): Promise<TagOperationResult> {
    // Verify all tags exist and belong to organization
    const validTags = await prisma.tag.findMany({
      where: {
        id: { in: input.tag_ids },
        organization_id: organizationId,
      },
      select: { id: true },
    });

    const validTagIds = validTags.map((t) => t.id);

    if (validTagIds.length === 0) {
      return {
        success: false,
        affected_contacts: 0,
        message: 'No valid tags found',
      };
    }

    // Verify contacts exist and belong to organization
    const validContacts = await prisma.contact.findMany({
      where: {
        id: { in: input.contact_ids },
        organization_id: organizationId,
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);

    if (validContactIds.length === 0) {
      return {
        success: false,
        affected_contacts: 0,
        message: 'No valid contacts found',
      };
    }

    let affectedCount = 0;

    if (input.operation === 'add') {
      // Create ContactTag entries for all combinations
      const contactTagData: { contact_id: string; tag_id: string }[] = [];
      for (const contactId of validContactIds) {
        for (const tagId of validTagIds) {
          contactTagData.push({ contact_id: contactId, tag_id: tagId });
        }
      }

      const result = await prisma.contactTag.createMany({
        data: contactTagData,
        skipDuplicates: true,
      });

      affectedCount = result.count;
    } else {
      // Remove ContactTag entries
      const result = await prisma.contactTag.deleteMany({
        where: {
          tag_id: { in: validTagIds },
          contact_id: { in: validContactIds },
        },
      });

      affectedCount = result.count;
    }

    // Update contact counts for all affected tags
    for (const tagId of validTagIds) {
      await this.updateTagContactCount(tagId);
    }

    const operation = input.operation === 'add' ? 'assigned to' : 'removed from';
    logger.info({ tagIds: validTagIds, contactCount: affectedCount, operation: input.operation, organizationId }, 'Bulk tag operation completed');

    return {
      success: true,
      affected_contacts: affectedCount,
      message: `Tags ${operation} ${affectedCount} contact-tag associations`,
    };
  }

  /**
   * Merge multiple tags into one
   */
  async mergeTags(
    organizationId: string,
    input: MergeTagsInput
  ): Promise<TagOperationResult> {
    // Verify target tag exists
    const targetTag = await prisma.tag.findFirst({
      where: {
        id: input.target_tag_id,
        organization_id: organizationId,
      },
    });

    if (!targetTag) {
      throw new AppError('Target tag not found', 404, 'TAG_001');
    }

    // Verify source tags exist and exclude target from sources
    const sourceTags = await prisma.tag.findMany({
      where: {
        id: { in: input.source_tag_ids.filter((id) => id !== input.target_tag_id) },
        organization_id: organizationId,
      },
    });

    if (sourceTags.length === 0) {
      return {
        success: false,
        affected_contacts: 0,
        message: 'No valid source tags found',
      };
    }

    const sourceTagIds = sourceTags.map((t) => t.id);

    // Get all contacts with source tags
    const contactTags = await prisma.contactTag.findMany({
      where: {
        tag_id: { in: sourceTagIds },
      },
      select: { contact_id: true },
    });

    const uniqueContactIds = [...new Set(contactTags.map((ct) => ct.contact_id))];

    // Add target tag to all these contacts (skip duplicates)
    if (uniqueContactIds.length > 0) {
      await prisma.contactTag.createMany({
        data: uniqueContactIds.map((contactId) => ({
          contact_id: contactId,
          tag_id: input.target_tag_id,
        })),
        skipDuplicates: true,
      });
    }

    // Delete source tags if requested (cascade deletes ContactTag entries)
    if (input.delete_source) {
      await prisma.tag.deleteMany({
        where: {
          id: { in: sourceTagIds },
        },
      });
    } else {
      // Just remove the ContactTag associations
      await prisma.contactTag.deleteMany({
        where: {
          tag_id: { in: sourceTagIds },
        },
      });

      // Update source tag counts
      for (const tagId of sourceTagIds) {
        await this.updateTagContactCount(tagId);
      }
    }

    // Update target tag contact count
    await this.updateTagContactCount(input.target_tag_id);

    logger.info({ sourceTagIds, targetTagId: input.target_tag_id, contactCount: uniqueContactIds.length, organizationId }, 'Tags merged');

    return {
      success: true,
      affected_contacts: uniqueContactIds.length,
      message: `Merged ${sourceTags.length} tag(s) into "${targetTag.name}" (${uniqueContactIds.length} contacts affected)`,
    };
  }

  /**
   * Get contacts with a specific tag
   */
  async getContactsByTag(
    organizationId: string,
    tagId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    contacts: { id: string; phone_number: string | null; name: string | null }[];
    pagination: { page: number; limit: number; total: number; total_pages: number };
  }> {
    // Verify tag exists
    const tag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        organization_id: organizationId,
      },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404, 'TAG_001');
    }

    // Get contact IDs with this tag
    const contactTags = await prisma.contactTag.findMany({
      where: { tag_id: tagId },
      select: { contact_id: true },
    });

    const contactIds = contactTags.map((ct) => ct.contact_id);

    // Get total count
    const total = contactIds.length;

    // Get paginated contacts
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        organization_id: organizationId,
      },
      select: {
        id: true,
        phone_number: true,
        name: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
    });

    return {
      contacts,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get tags for a specific contact
   */
  async getTagsForContact(
    organizationId: string,
    contactId: string
  ): Promise<TagResponse[]> {
    const contactTags = await prisma.contactTag.findMany({
      where: { contact_id: contactId },
      include: {
        tag: true,
      },
    });

    // Filter to only include tags from this organization
    const tags = contactTags
      .map((ct) => ct.tag)
      .filter((t) => t.organization_id === organizationId);

    return tags.map((t) => this.formatTagResponse(t));
  }

  /**
   * Get tag statistics
   */
  async getTagStats(organizationId: string): Promise<TagStats> {
    // Get total tags
    const totalTags = await prisma.tag.count({
      where: { organization_id: organizationId },
    });

    // Get total tagged contacts (unique)
    const taggedContacts = await prisma.contactTag.findMany({
      where: {
        tag: { organization_id: organizationId },
      },
      select: { contact_id: true },
      distinct: ['contact_id'],
    });

    const totalTaggedContacts = taggedContacts.length;

    // Get total contacts
    const totalContacts = await prisma.contact.count({
      where: { organization_id: organizationId },
    });

    const untaggedContacts = totalContacts - totalTaggedContacts;

    // Get most used tags
    const mostUsedTags = await prisma.tag.findMany({
      where: { organization_id: organizationId },
      orderBy: { contact_count: 'desc' },
      take: 10,
      select: { id: true, name: true, color: true, contact_count: true },
    });

    // Get color distribution
    const tags = await prisma.tag.findMany({
      where: { organization_id: organizationId },
      select: { color: true },
    });

    const colorDistribution: Record<string, number> = {};
    for (const tag of tags) {
      colorDistribution[tag.color] = (colorDistribution[tag.color] || 0) + 1;
    }

    return {
      total_tags: totalTags,
      total_tagged_contacts: totalTaggedContacts,
      untagged_contacts: Math.max(0, untaggedContacts),
      most_used_tags: mostUsedTags,
      color_distribution: colorDistribution,
    };
  }

  /**
   * Get available colors
   */
  getAvailableColors(): string[] {
    return [...TAG_COLORS];
  }

  /**
   * Update tag's contact count
   */
  private async updateTagContactCount(tagId: string): Promise<void> {
    const count = await prisma.contactTag.count({
      where: { tag_id: tagId },
    });

    await prisma.tag.update({
      where: { id: tagId },
      data: { contact_count: count },
    });
  }

  /**
   * Format tag for API response
   */
  private formatTagResponse(tag: any): TagResponse {
    return {
      id: tag.id,
      organization_id: tag.organization_id,
      name: tag.name,
      color: tag.color,
      description: tag.description,
      contact_count: tag.contact_count,
      created_at: tag.created_at.toISOString(),
      updated_at: tag.updated_at.toISOString(),
    };
  }
}

// Export singleton instance
export const tagService = new TagService();
export default tagService;
