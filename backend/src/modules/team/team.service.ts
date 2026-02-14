/**
 * Team Module - Business Logic Service
 * @module team/service
 */

import { Prisma, UserRole, InvitationStatus } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import { hashPassword } from '../../utils/crypto';
import { generateRandomToken } from '../../utils/crypto';
import {
  InviteTeamMemberInput,
  AcceptInvitationInput,
  UpdateMemberRoleInput,
  ListTeamMembersQuery,
  ListInvitationsQuery,
  TeamMemberResponse,
  TeamMemberListResponse,
  InvitationResponse,
  InvitationListResponse,
  InvitationVerifyResponse,
  TeamStats,
  INVITATION_EXPIRY_DAYS,
  USER_ROLES,
} from './team.schema';

// ============================================
// TEAM SERVICE CLASS
// ============================================

class TeamService {
  /**
   * Invite a new team member
   */
  async inviteTeamMember(
    organizationId: string,
    invitedById: string,
    input: InviteTeamMemberInput
  ): Promise<InvitationResponse> {
    // Check if email is already a member of this organization
    const existingMember = await prisma.user.findFirst({
      where: {
        email: input.email,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (existingMember) {
      throw new AppError('User is already a member of this organization', 409, 'TEAM_004');
    }

    // Check if there's already a pending invitation
    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: {
        email: input.email,
        organization_id: organizationId,
        status: 'PENDING',
      },
    });

    if (existingInvitation) {
      throw new AppError('An invitation is already pending for this email', 409, 'TEAM_005');
    }

    // Generate invitation token
    const token = generateRandomToken(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    // Create invitation
    const invitation = await prisma.teamInvitation.create({
      data: {
        organization_id: organizationId,
        email: input.email,
        role: input.role as UserRole,
        token,
        status: 'PENDING',
        expires_at: expiresAt,
        invited_by_id: invitedById,
      },
    });

    // Fetch inviter info
    const inviter = await prisma.user.findUnique({
      where: { id: invitedById },
      select: { id: true, full_name: true, email: true },
    });

    logger.info({ invitationId: invitation.id, email: input.email, organizationId }, 'Team invitation created');

    return this.formatInvitationResponse(invitation, inviter);
  }

  /**
   * Verify an invitation token
   */
  async verifyInvitation(token: string): Promise<InvitationVerifyResponse> {
    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return {
        valid: false,
        email: null,
        role: null,
        organization_name: null,
        invited_by: null,
        expires_at: null,
        error: 'Invalid invitation token',
      };
    }

    if (invitation.status !== 'PENDING') {
      return {
        valid: false,
        email: invitation.email,
        role: null,
        organization_name: null,
        invited_by: null,
        expires_at: null,
        error: `Invitation has been ${invitation.status.toLowerCase()}`,
      };
    }

    if (new Date() > invitation.expires_at) {
      // Mark as expired
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });

      return {
        valid: false,
        email: invitation.email,
        role: null,
        organization_name: null,
        invited_by: null,
        expires_at: null,
        error: 'Invitation has expired',
      };
    }

    // Get organization and inviter info
    const [organization, inviter] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: invitation.organization_id },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: invitation.invited_by_id },
        select: { full_name: true },
      }),
    ]);

    return {
      valid: true,
      email: invitation.email,
      role: invitation.role,
      organization_name: organization?.name || null,
      invited_by: inviter?.full_name || null,
      expires_at: invitation.expires_at.toISOString(),
    };
  }

  /**
   * Accept an invitation and create user account
   */
  async acceptInvitation(input: AcceptInvitationInput): Promise<{
    user: TeamMemberResponse;
    organizationId: string;
  }> {
    const invitation = await prisma.teamInvitation.findUnique({
      where: { token: input.token },
    });

    if (!invitation) {
      throw new AppError('Invalid invitation token', 400, 'TEAM_007');
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError(`Invitation has been ${invitation.status.toLowerCase()}`, 400, 'TEAM_007');
    }

    if (new Date() > invitation.expires_at) {
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Invitation has expired', 400, 'TEAM_007');
    }

    // Check if user with this email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists', 409, 'TEAM_008');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user and update invitation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          organization_id: invitation.organization_id,
          email: invitation.email,
          password_hash: passwordHash,
          full_name: input.full_name,
          role: invitation.role,
          is_active: true,
          is_email_verified: true, // Invitation implies email is verified
          email_verified_at: new Date(),
        },
      });

      // Update invitation status
      await tx.teamInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          accepted_at: new Date(),
        },
      });

      return user;
    });

    logger.info({ userId: result.id, email: result.email, organizationId: invitation.organization_id }, 'Team invitation accepted');

    return {
      user: this.formatMemberResponse(result),
      organizationId: invitation.organization_id,
    };
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(
    organizationId: string,
    invitationId: string
  ): Promise<InvitationResponse> {
    const invitation = await prisma.teamInvitation.findFirst({
      where: {
        id: invitationId,
        organization_id: organizationId,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404, 'TEAM_002');
    }

    if (invitation.status === 'ACCEPTED') {
      throw new AppError('Invitation has already been accepted', 400, 'TEAM_007');
    }

    // Generate new token and extend expiry
    const newToken = generateRandomToken(64);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const updated = await prisma.teamInvitation.update({
      where: { id: invitationId },
      data: {
        token: newToken,
        status: 'PENDING',
        expires_at: newExpiresAt,
      },
    });

    const inviter = await prisma.user.findUnique({
      where: { id: invitation.invited_by_id },
      select: { id: true, full_name: true, email: true },
    });

    logger.info({ invitationId, organizationId }, 'Team invitation resent');

    return this.formatInvitationResponse(updated, inviter);
  }

  /**
   * Cancel an invitation
   */
  async cancelInvitation(
    organizationId: string,
    invitationId: string
  ): Promise<boolean> {
    const invitation = await prisma.teamInvitation.findFirst({
      where: {
        id: invitationId,
        organization_id: organizationId,
        status: 'PENDING',
      },
    });

    if (!invitation) {
      return false;
    }

    await prisma.teamInvitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELED' },
    });

    logger.info({ invitationId, organizationId }, 'Team invitation canceled');

    return true;
  }

  /**
   * List team members
   */
  async listTeamMembers(
    organizationId: string,
    query: ListTeamMembersQuery
  ): Promise<TeamMemberListResponse> {
    const { page, limit, sort_by, sort_order, search, role, is_active } = query;

    // Build where clause
    const where: Prisma.UserWhereInput = {
      organization_id: organizationId,
      deleted_at: null,
    };

    // Search filter
    if (search) {
      where.OR = [
        { full_name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    // Role filter
    if (role) {
      where.role = role as UserRole;
    }

    // Active filter
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get members
    const members = await prisma.user.findMany({
      where,
      orderBy: { [sort_by]: sort_order },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: members.map((m) => this.formatMemberResponse(m)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List invitations
   */
  async listInvitations(
    organizationId: string,
    query: ListInvitationsQuery
  ): Promise<InvitationListResponse> {
    const { page, limit, status } = query;

    // Build where clause
    const where: Prisma.TeamInvitationWhereInput = {
      organization_id: organizationId,
    };

    if (status) {
      where.status = status as InvitationStatus;
    }

    // Get total count
    const total = await prisma.teamInvitation.count({ where });

    // Get invitations
    const invitations = await prisma.teamInvitation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get inviters
    const inviterIds = [...new Set(invitations.map((i) => i.invited_by_id))];
    const inviters = await prisma.user.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, full_name: true, email: true },
    });
    const inviterMap = new Map(inviters.map((i) => [i.id, i]));

    return {
      items: invitations.map((inv) =>
        this.formatInvitationResponse(inv, inviterMap.get(inv.invited_by_id) || null)
      ),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get team member by ID
   */
  async getTeamMember(
    organizationId: string,
    memberId: string
  ): Promise<TeamMemberResponse | null> {
    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!member) {
      return null;
    }

    return this.formatMemberResponse(member);
  }

  /**
   * Update team member role
   */
  async updateMemberRole(
    organizationId: string,
    memberId: string,
    input: UpdateMemberRoleInput,
    updatedById: string
  ): Promise<TeamMemberResponse | null> {
    // Check if member exists
    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!member) {
      return null;
    }

    // Prevent changing own role
    if (memberId === updatedById) {
      throw new AppError('Cannot change your own role', 400, 'TEAM_006');
    }

    // Prevent changing owner's role (only one owner per org)
    if (member.role === 'ORG_OWNER') {
      throw new AppError('Cannot change the owner\'s role', 400, 'TEAM_006');
    }

    // Update role
    const updated = await prisma.user.update({
      where: { id: memberId },
      data: { role: input.role as UserRole },
    });

    logger.info({ memberId, newRole: input.role, updatedById, organizationId }, 'Team member role updated');

    return this.formatMemberResponse(updated);
  }

  /**
   * Deactivate team member
   */
  async deactivateMember(
    organizationId: string,
    memberId: string,
    deactivatedById: string
  ): Promise<boolean> {
    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!member) {
      return false;
    }

    // Prevent self-deactivation
    if (memberId === deactivatedById) {
      throw new AppError('Cannot deactivate your own account', 400, 'TEAM_006');
    }

    // Prevent deactivating owner
    if (member.role === 'ORG_OWNER') {
      throw new AppError('Cannot deactivate the organization owner', 400, 'TEAM_006');
    }

    await prisma.user.update({
      where: { id: memberId },
      data: { is_active: false },
    });

    logger.info({ memberId, deactivatedById, organizationId }, 'Team member deactivated');

    return true;
  }

  /**
   * Reactivate team member
   */
  async reactivateMember(
    organizationId: string,
    memberId: string
  ): Promise<TeamMemberResponse | null> {
    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!member) {
      return null;
    }

    const updated = await prisma.user.update({
      where: { id: memberId },
      data: { is_active: true },
    });

    logger.info({ memberId, organizationId }, 'Team member reactivated');

    return this.formatMemberResponse(updated);
  }

  /**
   * Remove team member (soft delete)
   */
  async removeMember(
    organizationId: string,
    memberId: string,
    removedById: string
  ): Promise<boolean> {
    const member = await prisma.user.findFirst({
      where: {
        id: memberId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!member) {
      return false;
    }

    // Prevent self-removal
    if (memberId === removedById) {
      throw new AppError('Cannot remove your own account', 400, 'TEAM_006');
    }

    // Prevent removing owner
    if (member.role === 'ORG_OWNER') {
      throw new AppError('Cannot remove the organization owner', 400, 'TEAM_006');
    }

    await prisma.user.update({
      where: { id: memberId },
      data: { deleted_at: new Date() },
    });

    logger.info({ memberId, removedById, organizationId }, 'Team member removed');

    return true;
  }

  /**
   * Get team statistics
   */
  async getTeamStats(organizationId: string): Promise<TeamStats> {
    // Get counts
    const [total, active, inactive] = await Promise.all([
      prisma.user.count({
        where: { organization_id: organizationId, deleted_at: null },
      }),
      prisma.user.count({
        where: { organization_id: organizationId, deleted_at: null, is_active: true },
      }),
      prisma.user.count({
        where: { organization_id: organizationId, deleted_at: null, is_active: false },
      }),
    ]);

    // Get counts by role
    const byRole: Record<string, number> = {};
    for (const role of USER_ROLES) {
      const count = await prisma.user.count({
        where: {
          organization_id: organizationId,
          deleted_at: null,
          role: role as UserRole,
        },
      });
      if (count > 0) {
        byRole[role] = count;
      }
    }

    // Get pending invitations count
    const pendingInvitations = await prisma.teamInvitation.count({
      where: {
        organization_id: organizationId,
        status: 'PENDING',
        expires_at: { gt: new Date() },
      },
    });

    // Get recent logins
    const recentLogins = await prisma.user.findMany({
      where: {
        organization_id: organizationId,
        deleted_at: null,
        last_login_at: { not: null },
      },
      orderBy: { last_login_at: 'desc' },
      take: 5,
      select: { id: true, full_name: true, last_login_at: true },
    });

    return {
      total_members: total,
      active_members: active,
      inactive_members: inactive,
      by_role: byRole,
      pending_invitations: pendingInvitations,
      recent_logins: recentLogins.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        last_login_at: u.last_login_at!.toISOString(),
      })),
    };
  }

  /**
   * Format member for API response
   */
  private formatMemberResponse(user: any): TeamMemberResponse {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      is_email_verified: user.is_email_verified,
      last_login_at: user.last_login_at?.toISOString() || null,
      created_at: user.created_at.toISOString(),
    };
  }

  /**
   * Format invitation for API response
   */
  private formatInvitationResponse(
    invitation: any,
    inviter: { id: string; full_name: string; email: string } | null
  ): InvitationResponse {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at.toISOString(),
      invited_by: inviter,
      created_at: invitation.created_at.toISOString(),
      accepted_at: invitation.accepted_at?.toISOString() || null,
    };
  }
}

// Export singleton instance
export const teamService = new TeamService();
export default teamService;
