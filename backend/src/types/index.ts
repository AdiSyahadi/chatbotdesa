import { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';

// Extend Fastify type to include authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  email: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  // Fastify validation errors
  if ((error as any).validation) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: (error as any).validation,
      },
    });
  }

  // JWT errors
  if (error.message?.includes('jwt')) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'AUTH_001',
        message: 'Invalid or expired token',
      },
    });
  }

  // Zod validation errors
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: (error as any).issues || (error as any).errors,
      },
    });
  }

  // Rate limit errors from @fastify/rate-limit
  if ((error as any).statusCode === 429) {
    return reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: error.message || 'Too many requests',
      },
    });
  }

  // Log unexpected errors
  request.log.error({ errorName: error.name, errorMessage: error.message }, '[ERROR_HANDLER]');

  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { debug: error.name }),
    },
  });
};
