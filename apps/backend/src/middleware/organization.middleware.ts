import { Request, Response, NextFunction } from 'express';

export const validateOrganization = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get organization ID from authenticated user or header
    const organizationId = req.user?.organizationId || req.headers['x-organization-id'];

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // Add organizationId to request for easy access
    req.organizationId = organizationId as string;

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Extend the Request interface to include organizationId
declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
    }
  }
}