/**
 * Payments Module - Main Export
 * @module payments
 */

export * from './payments.schema';
export * from './payments.service';
export { paymentsRoutes, default as paymentsRoutesPlugin } from './payments.routes';
