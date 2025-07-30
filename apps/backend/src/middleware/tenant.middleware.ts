import { Request, Response, NextFunction } from 'express';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

/**
 * Tenant isolation middleware - ensures all database operations are scoped to the user's organization
 * This middleware should be used after authentication middleware
 */
export const tenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || !req.organization) {
    res.status(401).json({
      success: false,
      error: 'Authentication required for tenant isolation'
    });
    return;
  }

  // Create a tenant-aware database client
  req.db = createTenantAwareDB(req.user.organizationId);
  
  logger.debug(`Tenant isolation applied for organization: ${req.organization.orgCode}`);
  next();
};

/**
 * Creates a tenant-aware database client that automatically filters by organization
 */
function createTenantAwareDB(organizationId: string) {
  return {
    // Tenant-aware models
    user: {
      ...db.user,
      findMany: (args?: any) => db.user.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.user.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.user.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.user.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.user.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.user.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },
    
    employee: {
      ...db.employee,
      findMany: (args?: any) => db.employee.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.employee.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.employee.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.employee.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.employee.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.employee.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    attendanceRecord: {
      ...db.attendanceRecord,
      findMany: (args?: any) => db.attendanceRecord.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.attendanceRecord.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.attendanceRecord.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.attendanceRecord.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.attendanceRecord.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.attendanceRecord.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    department: {
      ...db.department,
      findMany: (args?: any) => db.department.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.department.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.department.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.department.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.department.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.department.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    shift: {
      ...db.shift,
      findMany: (args?: any) => db.shift.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.shift.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.shift.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.shift.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.shift.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.shift.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    leaveRequest: {
      ...db.leaveRequest,
      findMany: (args?: any) => db.leaveRequest.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.leaveRequest.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.leaveRequest.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.leaveRequest.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.leaveRequest.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.leaveRequest.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    payrollRecord: {
      ...db.payrollRecord,
      findMany: (args?: any) => db.payrollRecord.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.payrollRecord.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.payrollRecord.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.payrollRecord.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.payrollRecord.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.payrollRecord.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    notification: {
      ...db.notification,
      findMany: (args?: any) => db.notification.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.notification.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.notification.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.notification.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.notification.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.notification.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    auditLog: {
      ...db.auditLog,
      findMany: (args?: any) => db.auditLog.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.auditLog.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.auditLog.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.auditLog.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.auditLog.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.auditLog.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    aiConversation: {
      ...db.aiConversation,
      findMany: (args?: any) => db.aiConversation.findMany({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      findUnique: (args: any) => db.aiConversation.findUnique({
        ...args,
        where: { ...args.where, organizationId }
      }),
      findFirst: (args?: any) => db.aiConversation.findFirst({
        ...args,
        where: { ...args?.where, organizationId }
      }),
      create: (args: any) => db.aiConversation.create({
        ...args,
        data: { ...args.data, organizationId }
      }),
      update: (args: any) => db.aiConversation.update({
        ...args,
        where: { ...args.where, organizationId }
      }),
      delete: (args: any) => db.aiConversation.delete({
        ...args,
        where: { ...args.where, organizationId }
      })
    },

    // Organization model - restricted access
    organization: {
      findUnique: (args: any) => {
        // Only allow access to the user's own organization
        return db.organization.findUnique({
          ...args,
          where: { ...args.where, id: organizationId }
        });
      },
      update: (args: any) => {
        // Only allow updates to the user's own organization
        return db.organization.update({
          ...args,
          where: { ...args.where, id: organizationId }
        });
      }
    }
  };
}

// Extend Request interface to include tenant-aware db
declare global {
  namespace Express {
    interface Request {
      db?: ReturnType<typeof createTenantAwareDB>;
    }
  }
}