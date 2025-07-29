import { Request, Response } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
  organizationId?: string;
}

export type RouteHandler = (req: AuthenticatedRequest, res: Response) => Promise<void>;