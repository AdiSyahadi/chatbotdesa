import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from './auth.schema';
import { JWTPayload } from '../../types';
import '../../types'; // Import untuk Fastify type augmentation

// ============================================
// AUTH ROUTES - Clean & Organized
// ============================================

export default async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify);

  // ============================================
  // PUBLIC ROUTES
  // ============================================

  /**
   * Register new organization + owner user
   * POST /api/auth/register
   */
  fastify.post('/register', {
    schema: {
      description: 'Register new organization with owner user',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password', 'full_name', 'organization_name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          full_name: { type: 'string', minLength: 2 },
          organization_name: { type: 'string', minLength: 2 },
          phone: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await authService.register(body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  fastify.post('/login', {
    schema: {
      description: 'Login and get access token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body);
    return reply.send({ success: true, data: result });
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  fastify.post('/refresh', {
    schema: {
      description: 'Refresh access token using refresh token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const result = await authService.refreshToken(body.refresh_token);
    return reply.send({ success: true, data: result });
  });

  /**
   * Forgot password - request reset link
   * POST /api/auth/forgot-password
   */
  fastify.post('/forgot-password', {
    schema: {
      description: 'Request password reset email',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    const result = await authService.forgotPassword(body.email);
    return reply.send({ success: true, ...result });
  });

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  fastify.post('/reset-password', {
    schema: {
      description: 'Reset password using token from email',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const result = await authService.resetPassword(body.token, body.password);
    return reply.send({ success: true, ...result });
  });

  // ============================================
  // PROTECTED ROUTES (require authentication)
  // ============================================

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get current user profile',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const result = await authService.getProfile(user.userId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Logout user (invalidate refresh token)
   * POST /api/auth/logout
   */
  fastify.post('/logout', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Logout and invalidate refresh token',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const result = await authService.logout(user.userId);
    return reply.send({ success: true, ...result });
  });

  /**
   * Change password
   * POST /api/auth/change-password
   */
  fastify.post('/change-password', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Change user password',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string' },
          new_password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const body = changePasswordSchema.parse(request.body);
    const result = await authService.changePassword(user.userId, body);
    return reply.send({ success: true, ...result });
  });

  /**
   * Update profile
   * PATCH /api/auth/profile
   */
  fastify.patch('/profile', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Update user profile',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          full_name: { type: 'string', minLength: 2 },
          phone: { type: 'string' },
          avatar_url: { type: 'string', format: 'uri' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const body = updateProfileSchema.parse(request.body);
    const result = await authService.updateProfile(user.userId, body);
    return reply.send({ success: true, data: result });
  });
}
