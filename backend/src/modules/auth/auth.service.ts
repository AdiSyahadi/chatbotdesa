import { FastifyInstance } from 'fastify';
import prisma from '../../config/database';
import config from '../../config';
import { hashPassword, comparePassword } from '../../utils/crypto';
import { AppError } from '../../types';
import { UserRole } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from './auth.schema';

// ============================================
// AUTH SERVICE - Business Logic
// ============================================

export class AuthService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Hash a token with SHA-256 for safe DB storage.
   * Raw tokens are never stored — only their hashes.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Register new organization with owner user
   */
  async register(input: RegisterInput) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new AppError('Email already registered', 400, 'AUTH_004');
    }

    // Create organization slug
    const slug = this.generateSlug(input.organization_name);

    // Check if slug exists
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      throw new AppError('Organization name already taken', 400, 'ORG_001');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create organization and user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization with trial
      const organization = await tx.organization.create({
        data: {
          name: input.organization_name,
          slug,
          email: input.email,
          subscription_status: 'TRIAL',
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Create user (owner)
      const user = await tx.user.create({
        data: {
          organization_id: organization.id,
          email: input.email,
          password_hash: passwordHash,
          full_name: input.full_name,
          phone: input.phone,
          role: UserRole.ORG_OWNER,
          is_active: true,
        },
      });

      return { organization, user };
    });

    // Generate tokens
    const tokens = this.generateTokens(result.user, result.organization.id);

    // Save refresh token
    await prisma.user.update({
      where: { id: result.user.id },
      data: { refresh_token: this.hashToken(tokens.refreshToken) },
    });

    return {
      user: this.sanitizeUser(result.user),
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
      ...tokens,
    };
  }

  /**
   * Login user
   */
  async login(input: LoginInput) {
    // Find user with organization
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true },
    });

    if (!user) {
      throw new AppError('Invalid credentials', 401, 'AUTH_001');
    }

    if (!user.is_active) {
      throw new AppError('Account is disabled', 403, 'AUTH_006');
    }

    if (user.deleted_at) {
      throw new AppError('Account has been deleted', 403, 'AUTH_006');
    }

    // Verify password
    const isValid = await comparePassword(input.password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401, 'AUTH_001');
    }

    // Check organization status
    if (!user.organization.is_active) {
      throw new AppError('Organization is suspended', 403, 'ORG_003');
    }

    // Generate tokens
    const tokens = this.generateTokens(user, user.organization_id);

    // Update user with refresh token and login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refresh_token: this.hashToken(tokens.refreshToken),
        last_login_at: new Date(),
      },
    });

    return {
      user: this.sanitizeUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        subscription_status: user.organization.subscription_status,
      },
      ...tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token with the SEPARATE refresh secret
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      // Find user and verify stored token matches
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { organization: true },
      });

      if (!user || user.refresh_token !== this.hashToken(refreshToken)) {
        throw new AppError('Invalid refresh token', 401, 'AUTH_003');
      }

      if (!user.is_active) {
        throw new AppError('Account is disabled', 403, 'AUTH_006');
      }

      // Generate new access token
      const accessToken = this.fastify.jwt.sign(
        {
          userId: user.id,
          organizationId: user.organization_id,
          role: user.role,
          email: user.email,
        },
        { expiresIn: '15m' }
      );

      return {
        accessToken,
        expiresIn: 900, // 15 minutes
      };
    } catch (error) {
      throw new AppError('Invalid or expired refresh token', 401, 'AUTH_004');
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            subscription_status: true,
            trial_ends_at: true,
            max_instances: true,
            max_contacts: true,
            max_messages_per_day: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'AUTH_007');
    }

    return {
      user: this.sanitizeUser(user),
      organization: user.organization,
    };
  }

  /**
   * Logout user
   */
  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refresh_token: null },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Change password
   */
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'AUTH_007');
    }

    // Verify current password
    const isValid = await comparePassword(input.current_password, user.password_hash);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 401, 'AUTH_001');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(input.new_password);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        refresh_token: null, // Invalidate all sessions
      },
    });

    return { message: 'Password changed successfully' };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        full_name: input.full_name,
        phone: input.phone,
        avatar_url: input.avatar_url,
      },
    });

    return this.sanitizeUser(user);
  }

  /**
   * Generate password reset token
   */
  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a reset link will be sent' };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_token: this.hashToken(resetToken),
        reset_token_expires_at: resetTokenExpires,
      },
    });

    // TODO: Send email with reset link
    // await emailService.sendPasswordReset(user.email, resetToken);

    return { message: 'If the email exists, a reset link will be sent' };
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        reset_token: this.hashToken(token),
        reset_token_expires_at: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400, 'AUTH_008');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        reset_token: null,
        reset_token_expires_at: null,
        refresh_token: null, // Invalidate all sessions
      },
    });

    return { message: 'Password reset successfully' };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateTokens(user: any, organizationId: string) {
    const accessToken = this.fastify.jwt.sign(
      {
        userId: user.id,
        organizationId,
        role: user.role,
        email: user.email,
      },
      { expiresIn: '15m' }
    );

    // Sign refresh token with SEPARATE refresh secret (different from access token secret)
    const refreshOpts: SignOptions = { expiresIn: '7d' };
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.refreshSecret,
      refreshOpts
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      is_email_verified: user.is_email_verified,
      created_at: user.created_at,
    };
  }
}
