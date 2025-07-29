import { Request, Response, NextFunction } from 'express';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

/**
 * Audit logging middleware - logs all user actions for compliance and security
 */
export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    // Store original res.json to capture response data
    const originalJson = res.json;
    let statusCode = 200;

    // Capture response data
    res.json = function(data: any) {
      statusCode = res.statusCode;
      return originalJson.call(this, data);
    };

    // Execute the route handler
    next();

    // Log after response is sent
    res.on('finish', async () => {
      try {
        if (!req.user || !req.organization) {
          return; // Skip logging if no user context
        }

        const auditData = {
          organizationId: req.user.organizationId,
          userId: req.user.id,
          action,
          resource,
          resourceId: req.params.id || null,
          oldValues: null, // Can be populated by specific routes
          newValues: req.body || null,
          metadata: {
            method: req.method,
            url: req.originalUrl,
            statusCode,
            success: statusCode < 400,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
          },
          ipAddress: getClientIP(req),
          userAgent: req.get('User-Agent') || null
        };

        // Only log successful operations and errors (not 404s for non-existent resources)
        if (statusCode < 500) {
          await db.auditLog.create({
            data: auditData
          });

          logger.info(`Audit log created: ${action} ${resource} by ${req.user.email}`, {
            organizationId: req.user.organizationId,
            userId: req.user.id,
            action,
            resource,
            statusCode
          });
        }
      } catch (error) {
        // Don't fail the request if audit logging fails
        logger.error('Failed to create audit log:', error);
      }
    });
  };
};

/**
 * Helper function to get client IP address
 */
function getClientIP(req: Request): string {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();
}

/**
 * Audit middleware for CREATE operations
 */
export const auditCreate = (resource: string) => auditLog('CREATE', resource);

/**
 * Audit middleware for READ operations
 */
export const auditRead = (resource: string) => auditLog('READ', resource);

/**
 * Audit middleware for UPDATE operations
 */
export const auditUpdate = (resource: string) => auditLog('UPDATE', resource);

/**
 * Audit middleware for DELETE operations
 */
export const auditDelete = (resource: string) => auditLog('DELETE', resource);

/**
 * Audit middleware for LOGIN operations
 */
export const auditLogin = auditLog('LOGIN', 'User');

/**
 * Audit middleware for LOGOUT operations
 */
export const auditLogout = auditLog('LOGOUT', 'User');

/**
 * Custom audit log function for complex operations
 */
export const createAuditLog = async (
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  oldValues?: any,
  newValues?: any,
  additionalMetadata?: any
): Promise<void> => {
  try {
    if (!req.user || !req.organization) {
      return;
    }

    await db.auditLog.create({
      data: {
        organizationId: req.user.organizationId,
        userId: req.user.id,
        action,
        resource,
        resourceId,
        oldValues,
        newValues,
        metadata: {
          method: req.method,
          url: req.originalUrl,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString(),
          ...additionalMetadata
        },
        ipAddress: getClientIP(req),
        userAgent: req.get('User-Agent') || null
      }
    });

    logger.info(`Custom audit log created: ${action} ${resource}`, {
      organizationId: req.user.organizationId,
      userId: req.user.id,
      action,
      resource
    });
  } catch (error) {
    logger.error('Failed to create custom audit log:', error);
  }
};