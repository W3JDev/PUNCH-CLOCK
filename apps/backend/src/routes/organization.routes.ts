import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken, requireOrgAdmin, requireSuperAdmin } from '@/middleware/auth.middleware';
import { tenantIsolation } from '@/middleware/tenant.middleware';
import { auditRead, auditUpdate } from '@/middleware/audit.middleware';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(authenticateToken);
router.use(tenantIsolation);

// @route   GET /api/v1/organizations
// @desc    Get all organizations (Super Admin only)
// @access  Private (Super Admin)
router.get('/', requireSuperAdmin, auditRead('Organization'), async (_req: Request, res: Response): Promise<Response> => {
  try {
    const organizations = await db.organization.findMany({
      select: {
        id: true,
        businessName: true,
        orgCode: true,
        domain: true,
        email: true,
        phone: true,
        isActive: true,
        isPremium: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            employees: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Organizations retrieved successfully',
      data: {
        organizations,
        total: organizations.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get organizations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organizations'
    });
  }
});

// @route   GET /api/v1/organizations/current
// @desc    Get current user's organization details
// @access  Private
router.get('/current', auditRead('Organization'), async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.organization) {
      return res.status(400).json({
        success: false,
        error: 'Organization context not found'
      });
    }

    const organization = await db.organization.findUnique({
      where: { id: req.organization.id },
      include: {
        _count: {
          select: {
            users: true,
            employees: true,
            departments: true,
            shifts: true,
            attendanceRecords: true
          }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Organization details retrieved successfully',
      data: { organization }
    });
  } catch (error: any) {
    logger.error('Failed to get organization details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organization details'
    });
  }
});

// @route   GET /api/v1/organizations/:id
// @desc    Get organization by ID (Super Admin or same org)
// @access  Private
router.get('/:id', [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid organization ID is required')
], auditRead('Organization'), async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;

    // Check if user can access this organization
    if (req.user?.role !== 'SUPER_ADMIN' && req.organization?.id !== id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    const organization = await db.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            employees: true,
            departments: true,
            shifts: true,
            attendanceRecords: true
          }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Organization details retrieved successfully',
      data: { organization }
    });
  } catch (error: any) {
    logger.error('Failed to get organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organization'
    });
  }
});

// @route   PUT /api/v1/organizations/current
// @desc    Update current organization
// @access  Private (Org Admin)
router.put('/current', requireOrgAdmin, [
  body('businessName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number must be less than 20 characters'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be less than 200 characters'),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  body('state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State must be less than 100 characters'),
  body('country')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country must be less than 100 characters'),
  body('postalCode')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Postal code must be less than 20 characters'),
  body('timezone')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Timezone must be less than 50 characters'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be a valid object'),
  body('branding')
    .optional()
    .isObject()
    .withMessage('Branding must be a valid object')
], auditUpdate('Organization'), async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.organization) {
      return res.status(400).json({
        success: false,
        error: 'Organization context not found'
      });
    }

    const updateData = req.body;
    
    // Remove fields that shouldn't be updated via this endpoint
    delete updateData.orgCode;
    delete updateData.domain;
    delete updateData.isActive;
    delete updateData.isPremium;
    delete updateData.subscriptionEnd;

    const updatedOrganization = await db.organization.update({
      where: { id: req.organization.id },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    logger.info(`Organization updated: ${req.organization.orgCode} by ${req.user?.email}`);

    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: { organization: updatedOrganization }
    });
  } catch (error: any) {
    logger.error('Failed to update organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update organization'
    });
  }
});

// @route   PUT /api/v1/organizations/:id
// @desc    Update organization (Super Admin only)
// @access  Private (Super Admin)
router.put('/:id', requireSuperAdmin, [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid organization ID is required'),
  body('businessName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('isPremium')
    .optional()
    .isBoolean()
    .withMessage('isPremium must be a boolean')
], auditUpdate('Organization'), async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.orgCode;
    delete updateData.domain;

    const updatedOrganization = await db.organization.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    logger.info(`Organization ${id} updated by super admin ${req.user?.email}`);

    return res.status(200).json({
      success: true,
      message: 'Organization updated successfully',
      data: { organization: updatedOrganization }
    });
  } catch (error: any) {
    logger.error('Failed to update organization:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update organization'
    });
  }
});

// @route   GET /api/v1/organizations/current/stats
// @desc    Get organization statistics
// @access  Private (Org Admin)
router.get('/current/stats', requireOrgAdmin, auditRead('OrganizationStats'), async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.organization) {
      return res.status(400).json({
        success: false,
        error: 'Organization context not found'
      });
    }

    const organizationId = req.organization.id;

    // Get comprehensive statistics
    const [
      userCount,
      employeeCount,
      departmentCount,
      shiftCount,
      todayAttendance,
      monthlyAttendance
    ] = await Promise.all([
      db.user.count({ where: { organizationId, isActive: true } }),
      db.employee.count({ where: { organizationId, isActive: true } }),
      db.department.count({ where: { organizationId, isActive: true } }),
      db.shift.count({ where: { organizationId, isActive: true } }),
      db.attendanceRecord.count({
        where: {
          organizationId,
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      db.attendanceRecord.count({
        where: {
          organizationId,
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
          }
        }
      })
    ]);

    const stats = {
      users: userCount,
      employees: employeeCount,
      departments: departmentCount,
      shifts: shiftCount,
      attendance: {
        today: todayAttendance,
        thisMonth: monthlyAttendance
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Organization statistics retrieved successfully',
      data: { stats }
    });
  } catch (error: any) {
    logger.error('Failed to get organization statistics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve organization statistics'
    });
  }
});

export default router;