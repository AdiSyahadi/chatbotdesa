/**
 * Templates Module - Business Logic Service
 * @module templates/service
 */

import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  ListTemplatesQuery,
  TemplateResponse,
  TemplateListResponse,
  TemplateStats,
  extractVariables,
  substituteVariables,
  validateVariables,
  TEMPLATE_CATEGORIES,
  MESSAGE_TYPES,
} from './templates.schema';

// ============================================
// TEMPLATE SERVICE CLASS
// ============================================

class TemplateService {
  /**
   * Create a new message template
   */
  async createTemplate(
    organizationId: string,
    input: CreateTemplateInput
  ): Promise<TemplateResponse> {
    // Extract variables from content
    const variables = extractVariables(input.content);

    // Check for duplicate name in organization
    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: {
        organization_id: organizationId,
        name: input.name,
      },
    });

    if (existingTemplate) {
      throw new AppError(`Template with name "${input.name}" already exists`, 409, 'TEMPLATE_002');
    }

    const template = await prisma.messageTemplate.create({
      data: {
        organization_id: organizationId,
        name: input.name,
        category: input.category || null,
        message_type: input.message_type,
        content: input.content,
        media_url: input.media_url || null,
        caption: input.caption || null,
        variables: variables,
        is_active: true,
        usage_count: 0,
      },
    });

    logger.info({ templateId: template.id, organizationId }, 'Template created');

    return this.formatTemplateResponse(template);
  }

  /**
   * Get template by ID
   */
  async getTemplate(
    organizationId: string,
    templateId: string
  ): Promise<TemplateResponse | null> {
    const template = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        organization_id: organizationId,
      },
    });

    if (!template) {
      return null;
    }

    return this.formatTemplateResponse(template);
  }

  /**
   * List templates with filtering and pagination
   */
  async listTemplates(
    organizationId: string,
    query: ListTemplatesQuery
  ): Promise<TemplateListResponse> {
    const { page, limit, sort_by, sort_order, search, category, message_type, is_active } = query;

    // Build where clause
    const where: Prisma.MessageTemplateWhereInput = {
      organization_id: organizationId,
    };

    // Search filter (name or content)
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { content: { contains: search } },
      ];
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // Message type filter
    if (message_type) {
      where.message_type = message_type;
    }

    // Is active filter
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }

    // Get total count
    const total = await prisma.messageTemplate.count({ where });

    // Get templates
    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { [sort_by]: sort_order },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: templates.map((t) => this.formatTemplateResponse(t)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a template
   */
  async updateTemplate(
    organizationId: string,
    templateId: string,
    input: UpdateTemplateInput
  ): Promise<TemplateResponse | null> {
    // Check template exists
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    // Check for duplicate name if name is being updated
    if (input.name && input.name !== existing.name) {
      const duplicateName = await prisma.messageTemplate.findFirst({
        where: {
          organization_id: organizationId,
          name: input.name,
          id: { not: templateId },
        },
      });

      if (duplicateName) {
        throw new AppError(`Template with name "${input.name}" already exists`, 409, 'TEMPLATE_002');
      }
    }

    // Build update data
    const updateData: Prisma.MessageTemplateUpdateInput = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.message_type !== undefined) updateData.message_type = input.message_type;
    if (input.media_url !== undefined) updateData.media_url = input.media_url;
    if (input.caption !== undefined) updateData.caption = input.caption;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // If content is updated, re-extract variables
    if (input.content !== undefined) {
      updateData.content = input.content;
      updateData.variables = extractVariables(input.content);
    }

    const template = await prisma.messageTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    logger.info({ templateId, organizationId }, 'Template updated');

    return this.formatTemplateResponse(template);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(
    organizationId: string,
    templateId: string
  ): Promise<boolean> {
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      return false;
    }

    await prisma.messageTemplate.delete({
      where: { id: templateId },
    });

    logger.info({ templateId, organizationId }, 'Template deleted');

    return true;
  }

  /**
   * Preview template with variable substitution
   */
  async previewTemplate(
    organizationId: string,
    templateId: string,
    variables: Record<string, string | number> = {}
  ): Promise<{
    template: TemplateResponse;
    preview: {
      content: string;
      caption: string | null;
    };
    validation: {
      valid: boolean;
      missing_variables: string[];
    };
  } | null> {
    const template = await this.getTemplate(organizationId, templateId);

    if (!template) {
      return null;
    }

    const requiredVars = template.variables;
    const validation = validateVariables(requiredVars, variables);

    const previewContent = substituteVariables(template.content, variables);
    const previewCaption = template.caption
      ? substituteVariables(template.caption, variables)
      : null;

    return {
      template,
      preview: {
        content: previewContent,
        caption: previewCaption,
      },
      validation: {
        valid: validation.valid,
        missing_variables: validation.missing,
      },
    };
  }

  /**
   * Increment usage count (called when template is used)
   */
  async incrementUsageCount(templateId: string): Promise<void> {
    await prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        usage_count: { increment: 1 },
      },
    });
  }

  /**
   * Get template statistics
   */
  async getTemplateStats(organizationId: string): Promise<TemplateStats> {
    // Get counts
    const [total, active, inactive] = await Promise.all([
      prisma.messageTemplate.count({
        where: { organization_id: organizationId },
      }),
      prisma.messageTemplate.count({
        where: { organization_id: organizationId, is_active: true },
      }),
      prisma.messageTemplate.count({
        where: { organization_id: organizationId, is_active: false },
      }),
    ]);

    // Get by category
    const byCategory: Record<string, number> = {};
    for (const category of TEMPLATE_CATEGORIES) {
      const count = await prisma.messageTemplate.count({
        where: { organization_id: organizationId, category },
      });
      if (count > 0) {
        byCategory[category] = count;
      }
    }

    // Get by message type
    const byMessageType: Record<string, number> = {};
    for (const messageType of MESSAGE_TYPES) {
      const count = await prisma.messageTemplate.count({
        where: { organization_id: organizationId, message_type: messageType },
      });
      if (count > 0) {
        byMessageType[messageType] = count;
      }
    }

    // Get total usage
    const usageAgg = await prisma.messageTemplate.aggregate({
      where: { organization_id: organizationId },
      _sum: { usage_count: true },
    });

    // Get most used templates
    const mostUsed = await prisma.messageTemplate.findMany({
      where: { organization_id: organizationId },
      orderBy: { usage_count: 'desc' },
      take: 5,
      select: { id: true, name: true, usage_count: true },
    });

    return {
      total_templates: total,
      active_templates: active,
      inactive_templates: inactive,
      by_category: byCategory,
      by_message_type: byMessageType,
      total_usage: usageAgg._sum.usage_count || 0,
      most_used: mostUsed.map((t) => ({
        id: t.id,
        name: t.name,
        usage_count: t.usage_count,
      })),
    };
  }

  /**
   * Clone an existing template
   */
  async cloneTemplate(
    organizationId: string,
    templateId: string,
    newName?: string
  ): Promise<TemplateResponse | null> {
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      return null;
    }

    // Generate unique name
    let cloneName = newName || `${existing.name} (Copy)`;
    let counter = 1;

    // Check if name already exists
    while (true) {
      const duplicate = await prisma.messageTemplate.findFirst({
        where: {
          organization_id: organizationId,
          name: cloneName,
        },
      });

      if (!duplicate) break;

      counter++;
      cloneName = newName
        ? `${newName} (${counter})`
        : `${existing.name} (Copy ${counter})`;

      if (counter > 100) {
        throw new AppError('Unable to generate unique template name', 500, 'TEMPLATE_003');
      }
    }

    const clone = await prisma.messageTemplate.create({
      data: {
        organization_id: organizationId,
        name: cloneName,
        category: existing.category,
        message_type: existing.message_type,
        content: existing.content,
        media_url: existing.media_url,
        caption: existing.caption,
        variables: existing.variables === null
          ? Prisma.JsonNull
          : (existing.variables as Prisma.InputJsonValue),
        is_active: true,
        usage_count: 0,
      },
    });

    logger.info({ sourceTemplateId: templateId, cloneId: clone.id, organizationId }, 'Template cloned');

    return this.formatTemplateResponse(clone);
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(
    organizationId: string,
    category: string
  ): Promise<TemplateResponse[]> {
    const templates = await prisma.messageTemplate.findMany({
      where: {
        organization_id: organizationId,
        category,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });

    return templates.map((t) => this.formatTemplateResponse(t));
  }

  /**
   * Format template for API response
   */
  private formatTemplateResponse(template: any): TemplateResponse {
    return {
      id: template.id,
      organization_id: template.organization_id,
      name: template.name,
      category: template.category,
      message_type: template.message_type,
      content: template.content,
      media_url: template.media_url,
      caption: template.caption,
      variables: Array.isArray(template.variables) ? template.variables : [],
      is_active: template.is_active,
      usage_count: template.usage_count,
      created_at: template.created_at.toISOString(),
      updated_at: template.updated_at.toISOString(),
    };
  }
}

// Export singleton instance
export const templateService = new TemplateService();
export default templateService;
