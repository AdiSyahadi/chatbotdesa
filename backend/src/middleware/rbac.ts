import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest, AppError } from '../types';
import { UserRole } from '@prisma/client';

export const requireRole = (...allowedRoles: UserRole[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      throw new AppError('Authentication required', 401, 'AUTH_001');
    }

    const userRole = user.role as UserRole;

    // SUPER_ADMIN has access to everything
    if (userRole === UserRole.SUPER_ADMIN) {
      return;
    }

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      throw new AppError(
        'You do not have permission to access this resource',
        403,
        'AUTH_002'
      );
    }
  };
};

export const requireOrganizationOwner = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = (request as AuthenticatedRequest).user;

  if (!user) {
    throw new AppError('Authentication required', 401, 'AUTH_001');
  }

  const userRole = user.role as UserRole;

  // Only SUPER_ADMIN and ORG_OWNER can proceed
  if (userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.ORG_OWNER) {
    throw new AppError(
      'Only organization owners can perform this action',
      403,
      'AUTH_003'
    );
  }
};
