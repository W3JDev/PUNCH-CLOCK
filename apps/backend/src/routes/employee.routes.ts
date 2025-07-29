import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken, requireHRManager, requireManager } from '@/middleware/auth.middleware';
import { tenantIsolation } from '@/middleware/tenant.middleware';
import { auditCreate, auditRead, auditUpdate, auditDelete } from '@/middleware/audit.middleware';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

const router = Router();

// Apply authentication and tenant isolation to all routes
router.use(authenticateToken);
router.use(tenantIsolation);

// @route   GET /api/v1/employees
// @desc    Get all employees in the organization
// @access  Private (Manager+)
router.get('/', requireManager, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must be less than 100 characters'),
  query('departmentId')
    .optional()
    .isString()
    .withMessage('Department ID must be a string'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], auditRead('Employee'), async (req: Request, res: Response): Promise<Response> => {
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const departmentId = req.query.departmentId as string;
    const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

    // Build where clause with tenant isolation
    const where: any = {
      organizationId: req.organization.id
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Get employees with pagination
    const [employees, totalCount] = await Promise.all([
      db.employee.findMany({
        where,
        skip,
        take: limit,
        include: {
          department: {
            select: {
              id: true,
              name: true
            }
          },
          user: {
            select: {
              id: true,
              email: true,
              lastLoginAt: true
            }
          },
          _count: {
            select: {
              attendanceRecords: true,
              leaveRequests: true
            }
          }
        },
        orderBy: [
          { isActive: 'desc' },
          { createdAt: 'desc' }
        ]
      }),
      db.employee.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      message: 'Employees retrieved successfully',
      data: {
        employees,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to get employees:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve employees'
    });
  }
});

// @route   POST /api/v1/employees
// @desc    Create new employee
// @access  Private (HR Manager+)
router.post('/', requireHRManager, [
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('employeeId')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Employee ID must be between 1 and 20 characters'),
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
  body('position')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Position must be less than 100 characters'),
  body('departmentId')
    .optional()
    .isString()
    .withMessage('Department ID must be a string'),
  body('employmentType')
    .optional()
    .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'])
    .withMessage('Invalid employment type'),
  body('salary')
    .optional()
    .isNumeric()
    .withMessage('Salary must be a number'),
  body('hourlyRate')
    .optional()
    .isNumeric()
    .withMessage('Hourly rate must be a number'),
  body('hireDate')
    .optional()
    .isISO8601()
    .withMessage('Hire date must be a valid date')
], auditCreate('Employee'), async (req: Request, res: Response): Promise<Response> => {
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

    const {
      firstName,
      lastName,
      employeeId,
      email,
      phone,
      position,
      departmentId,
      employmentType,
      salary,
      hourlyRate,
      hireDate
    } = req.body;

    // Check if employee ID already exists in this organization
    const existingEmployee = await db.employee.findUnique({
      where: {
        organizationId_employeeId: {
          organizationId: req.organization.id,
          employeeId
        }
      }
    });

    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID already exists in this organization'
      });
    }

    // If email is provided, check if it's already in use
    if (email) {
      const existingEmailEmployee = await db.employee.findFirst({
        where: {
          organizationId: req.organization.id,
          email
        }
      });

      if (existingEmailEmployee) {
        return res.status(400).json({
          success: false,
          error: 'Email address already in use by another employee'
        });
      }
    }

    // Validate department if provided
    if (departmentId) {
      const department = await db.department.findFirst({
        where: {
          id: departmentId,
          organizationId: req.organization.id
        }
      });

      if (!department) {
        return res.status(400).json({
          success: false,
          error: 'Department not found or not accessible'
        });
      }
    }

    // Create employee
    const employee = await db.employee.create({
      data: {
        organizationId: req.organization.id,
        firstName,
        lastName,
        employeeId,
        email,
        phone,
        position,
        departmentId,
        employmentType: employmentType || 'FULL_TIME',
        salary: salary ? parseFloat(salary) : null,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        isActive: true
      },
      include: {
        department: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    logger.info(`Employee created: ${employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`);

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { employee }
    });
  } catch (error: any) {
    logger.error('Failed to create employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create employee'
    });
  }
});

// @route   GET /api/v1/employees/:id
// @desc    Get employee details
// @access  Private (Manager+)
router.get('/:id', requireManager, [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid employee ID is required')
], auditRead('Employee'), async (req: Request, res: Response): Promise<Response> => {
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

    const { id } = req.params;

    const employee = await db.employee.findFirst({
      where: {
        id,
        organizationId: req.organization.id
      },
      include: {
        department: {
          select: {
            id: true,
            name: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            lastLoginAt: true,
            role: true
          }
        },
        _count: {
          select: {
            attendanceRecords: true,
            leaveRequests: true,
            payrollRecords: true
          }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Employee details retrieved successfully',
      data: { employee }
    });
  } catch (error: any) {
    logger.error('Failed to get employee details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve employee details'
    });
  }
});

// @route   PUT /api/v1/employees/:id
// @desc    Update employee
// @access  Private (HR Manager+)
router.put('/:id', requireHRManager, [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid employee ID is required'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
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
  body('position')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Position must be less than 100 characters'),
  body('departmentId')
    .optional()
    .isString()
    .withMessage('Department ID must be a string'),
  body('employmentType')
    .optional()
    .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'])
    .withMessage('Invalid employment type'),
  body('salary')
    .optional()
    .isNumeric()
    .withMessage('Salary must be a number'),
  body('hourlyRate')
    .optional()
    .isNumeric()
    .withMessage('Hourly rate must be a number'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], auditUpdate('Employee'), async (req: Request, res: Response): Promise<Response> => {
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

    const { id } = req.params;
    const updateData = req.body;

    // Check if employee exists in this organization
    const existingEmployee = await db.employee.findFirst({
      where: {
        id,
        organizationId: req.organization.id
      }
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // If email is being updated, check for conflicts
    if (updateData.email && updateData.email !== existingEmployee.email) {
      const emailConflict = await db.employee.findFirst({
        where: {
          organizationId: req.organization.id,
          email: updateData.email,
          id: { not: id }
        }
      });

      if (emailConflict) {
        return res.status(400).json({
          success: false,
          error: 'Email address already in use by another employee'
        });
      }
    }

    // Validate department if provided
    if (updateData.departmentId) {
      const department = await db.department.findFirst({
        where: {
          id: updateData.departmentId,
          organizationId: req.organization.id
        }
      });

      if (!department) {
        return res.status(400).json({
          success: false,
          error: 'Department not found or not accessible'
        });
      }
    }

    // Convert numeric strings to numbers
    if (updateData.salary) updateData.salary = parseFloat(updateData.salary);
    if (updateData.hourlyRate) updateData.hourlyRate = parseFloat(updateData.hourlyRate);

    // Update employee
    const updatedEmployee = await db.employee.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date()
      },
      include: {
        department: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    logger.info(`Employee updated: ${existingEmployee.employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`);

    return res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee: updatedEmployee }
    });
  } catch (error: any) {
    logger.error('Failed to update employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update employee'
    });
  }
});

// @route   DELETE /api/v1/employees/:id
// @desc    Delete employee (soft delete by setting isActive to false)
// @access  Private (HR Manager+)
router.delete('/:id', requireHRManager, [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid employee ID is required')
], auditDelete('Employee'), async (req: Request, res: Response): Promise<Response> => {
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

    const { id } = req.params;

    // Check if employee exists in this organization
    const employee = await db.employee.findFirst({
      where: {
        id,
        organizationId: req.organization.id
      }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Soft delete by setting isActive to false
    const updatedEmployee = await db.employee.update({
      where: { id },
      data: {
        isActive: false,
        terminationDate: new Date(),
        updatedAt: new Date()
      }
    });

    logger.info(`Employee deactivated: ${employee.employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`);

    return res.status(200).json({
      success: true,
      message: 'Employee deactivated successfully',
      data: { employee: updatedEmployee }
    });
  } catch (error: any) {
    logger.error('Failed to delete employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete employee'
    });
  }
});

export default router;