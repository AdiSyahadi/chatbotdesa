import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest, AppError } from '../types';

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const decoded = await request.jwtVerify();
    (request as AuthenticatedRequest).user = decoded as any;
  } catch (error) {
    throw new AppError('Invalid or expired token', 401, 'AUTH_001');
  }
};
