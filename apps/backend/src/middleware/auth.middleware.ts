import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

// Extend Request interface to include user and organization
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        organizationId: string;
      };
      organization?: {
        id: string;
        businessName: string;
        orgCode: string;
      };
    }
  }
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware - validates JWT tokens and adds user context
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    // Verify JWT token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as JWTPayload;
    
    // Fetch user details from database
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: {
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
            isActive: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Invalid or inactive user'
      });
      return;
    }

    if (!user.organization || !user.organization.isActive) {
      res.status(403).json({
        success: false,
        error: 'Organization is inactive'
      });
      return;
    }

    // Add user and organization context to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    };

    req.organization = {
      id: user.organization.id,
      businessName: user.organization.businessName,
      orgCode: user.organization.orgCode
    };

    logger.info(`Authenticated user ${user.email} for organization ${user.organization.orgCode}`);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
      return;
    }

    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Organization admin authorization
 */
export const requireOrgAdmin = requireRole(['ORG_ADMIN', 'SUPER_ADMIN']);

/**
 * HR manager authorization
 */
export const requireHRManager = requireRole(['HR_MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN']);

/**
 * Manager authorization
 */
export const requireManager = requireRole(['MANAGER', 'HR_MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN']);

/**
 * Super admin authorization
 */
export const requireSuperAdmin = requireRole(['SUPER_ADMIN']);

/**
 * Optional authentication - adds user context if token is present but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    // Use the main auth middleware logic but don't fail if token is invalid
    await authenticateToken(req, res, next);
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};