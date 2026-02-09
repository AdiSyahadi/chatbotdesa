/**
 * Team Module - Validation Schemas
 * @module team/schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const USER_ROLES = ['ORG_OWNER', 'ORG_ADMIN', 'ORG_MEMBER'] as const;
export type UserRoleValue = (typeof USER_ROLES)[number];

export const INVITATION_STATUS = ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELED'] as const;
export type InvitationStatusValue = (typeof INVITATION_STATUS)[number];

// Invitation expires after 7 days
export const INVITATION_EXPIRY_DAYS = 7;

// Role descriptions for UI
export const ROLE_DESCRIPTIONS: Record<string, { name: string; description: string; permissions: string[] }> = {
  ORG_OWNER: {
    name: 'Owner',
    description: 'Full access to all organization settings and features',
    permissions: ['manage_team', 'manage_billing', 'manage_instances', 'manage_contacts', 'send_messages', 'view_reports'],
  },
  ORG_ADMIN: {
    name: 'Admin',
    description: 'Manage team members and organization settings',
    permissions: ['manage_team', 'manage_instances', 'manage_contacts', 'send_messages', 'view_reports'],
  },
  ORG_MEMBER: {
    name: 'Member',
    description: 'Basic access to send messages and manage contacts',
    permissions: ['manage_contacts', 'send_messages', 'view_reports'],
  },
};

// ============================================
// TEAM MEMBER SCHEMAS
// ============================================

/**
 * Invite team member schema
 */
export const inviteTeamMemberSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters'),
  role: z.enum(USER_ROLES).default('ORG_MEMBER'),
});

export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;

/**
 * Accept invitation schema
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name must not exceed 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must not exceed 100 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Verify invitation token schema
 */
export const verifyInvitationSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

export type VerifyInvitationInput = z.infer<typeof verifyInvitationSchema>;

/**
 * Update team member role schema
 */
export const updateMemberRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/**
 * List team members query schema
 */
export const listTeamMembersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  role: z.enum(USER_ROLES).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.enum(['full_name', 'email', 'role', 'created_at', 'last_login_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListTeamMembersQuery = z.infer<typeof listTeamMembersQuerySchema>;

/**
 * List invitations query schema
 */
export const listInvitationsQuerySchema = z.object({
  status: z.enum(INVITATION_STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

/**
 * Member/invitation ID param schema
 */
export const memberIdParamSchema = z.object({
  id: z.string().uuid('Invalid member ID'),
});

export type MemberIdParam = z.infer<typeof memberIdParamSchema>;

export const invitationIdParamSchema = z.object({
  id: z.string().uuid('Invalid invitation ID'),
});

export type InvitationIdParam = z.infer<typeof invitationIdParamSchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface TeamMemberResponse {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface TeamMemberListResponse {
  items: TeamMemberResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface InvitationResponse {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  invited_by: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  created_at: string;
  accepted_at: string | null;
}

export interface InvitationListResponse {
  items: InvitationResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface InvitationVerifyResponse {
  valid: boolean;
  email: string | null;
  role: string | null;
  organization_name: string | null;
  invited_by: string | null;
  expires_at: string | null;
  error?: string;
}

export interface TeamStats {
  total_members: number;
  active_members: number;
  inactive_members: number;
  by_role: Record<string, number>;
  pending_invitations: number;
  recent_logins: {
    id: string;
    full_name: string;
    last_login_at: string;
  }[];
}
