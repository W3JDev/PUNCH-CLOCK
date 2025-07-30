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

// Schema validation types for Phase 2 Smart Attendance System
interface CreateEmployeeRequest {
  organizationId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  position?: string;
  departmentId?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY';
  hireDate?: string;
  salary?: number;
  hourlyRate?: number;
  currency?: string;
  pin?: string;
}

interface UpdateEmployeeRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  position?: string;
  departmentId?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY';
  terminationDate?: string;
  salary?: number;
  hourlyRate?: number;
  pin?: string;
  isActive?: boolean;
}

// @route   GET /api/v1/employees
// @desc    Get all employees in the organization (Phase 2 Smart Attendance System)
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
    .withMessage('isActive must be a boolean'),
  query('employmentType')
    .optional()
    .isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'])
    .withMessage('Invalid employment type')
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
    const employmentType = req.query.employmentType as string;
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

    if (employmentType) {
      where.employmentType = employmentType;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Get employees with pagination and Phase 2 enhanced data
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
              role: true,
              isActive: true,
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
      },
      count: employees.length
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
// @desc    Create new employee (Phase 2 Smart Attendance System)
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
    .withMessage('Hire date must be a valid date'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter code'),
  body('pin')
    .optional()
    .isLength({ min: 4, max: 8 })
    .withMessage('PIN must be between 4 and 8 characters')
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
      dateOfBirth,
      position,
      departmentId,
      employmentType,
      hireDate,
      salary,
      hourlyRate,
      currency,
      pin
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

    // Create employee with Phase 2 enhanced data
    const employeeData = {
      organizationId: req.organization.id,
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      position,
      departmentId,
      employmentType: employmentType || 'FULL_TIME',
      hireDate: hireDate ? new Date(hireDate) : new Date(),
      salary: salary ? parseFloat(salary) : null,
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
      currency: currency || 'USD',
      pin,
      isActive: true
    };

    const employee = await db.employee.create({
      data: employeeData,
      include: {
        department: {
          select: {
            id: true,
            name: true
          }
        },
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true
          }
        }
      }
    });

    logger.info(`Employee created: ${employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`, {
      organizationId: req.organization.id,
      employeeId,
      firstName,
      lastName
    });

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
// @desc    Get employee details (Phase 2 Smart Attendance System)
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
            name: true,
            description: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true
          }
        },
        attendanceRecords: {
          orderBy: { date: 'desc' },
          take: 10,
          select: {
            id: true,
            date: true,
            checkInTime: true,
            checkOutTime: true,
            hoursWorked: true,
            status: true,
            isLate: true,
            isEarlyLeave: true,
            overtimeHours: true
          }
        },
        leaveRequests: {
          where: { status: 'PENDING' },
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true
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
// @desc    Update employee (Phase 2 Smart Attendance System)
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
    .withMessage('isActive must be a boolean'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  body('terminationDate')
    .optional()
    .isISO8601()
    .withMessage('Termination date must be a valid date'),
  body('pin')
    .optional()
    .isLength({ min: 4, max: 8 })
    .withMessage('PIN must be between 4 and 8 characters')
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

    // Process Phase 2 enhanced update data
    const processedUpdateData: any = { ...updateData };
    
    // Convert numeric strings to numbers
    if (updateData.salary) processedUpdateData.salary = parseFloat(updateData.salary);
    if (updateData.hourlyRate) processedUpdateData.hourlyRate = parseFloat(updateData.hourlyRate);
    
    // Convert date strings to Date objects
    if (updateData.dateOfBirth) processedUpdateData.dateOfBirth = new Date(updateData.dateOfBirth);
    if (updateData.terminationDate) processedUpdateData.terminationDate = new Date(updateData.terminationDate);

    // Update employee
    const updatedEmployee = await db.employee.update({
      where: { id },
      data: {
        ...processedUpdateData,
        updatedAt: new Date()
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
            role: true,
            isActive: true
          }
        }
      }
    });

    logger.info(`Employee updated: ${existingEmployee.employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`, {
      organizationId: req.organization.id,
      employeeId: existingEmployee.employeeId,
      changes: Object.keys(updateData)
    });

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
// @desc    Delete employee (soft delete by setting isActive to false) - Phase 2 Smart Attendance System
// @access  Private (HR Manager+)
router.delete('/:id', requireHRManager, [
  param('id')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Valid employee ID is required'),
  query('permanent')
    .optional()
    .isBoolean()
    .withMessage('Permanent flag must be a boolean')
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
    const { permanent } = req.query;

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

    if (permanent === 'true') {
      // Permanent deletion (only if no attendance records) - Phase 2 feature
      const attendanceCount = await db.attendanceRecord.count({
        where: { employeeId: id }
      });

      if (attendanceCount > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot permanently delete employee with attendance records. Use soft delete instead.'
        });
      }

      await db.employee.delete({ where: { id } });
      
      logger.info(`Employee permanently deleted: ${employee.employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`, {
        organizationId: req.organization.id,
        employeeId: employee.employeeId
      });

      return res.status(200).json({
        success: true,
        message: 'Employee permanently deleted'
      });
    } else {
      // Soft delete by setting isActive to false
      const updatedEmployee = await db.employee.update({
        where: { id },
        data: {
          isActive: false,
          terminationDate: new Date(),
          updatedAt: new Date()
        }
      });

      logger.info(`Employee deactivated: ${employee.employeeId} by ${req.user?.email} in organization ${req.organization.orgCode}`, {
        organizationId: req.organization.id,
        employeeId: employee.employeeId
      });

      return res.status(200).json({
        success: true,
        message: 'Employee deactivated successfully',
        data: { employee: updatedEmployee }
      });
    }
  } catch (error: any) {
    logger.error('Failed to delete employee:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete employee'
    });
  }
});

// @route   POST /api/v1/employees/bulk-import
// @desc    Bulk import employees (Phase 2 Smart Attendance System)
// @access  Private (HR Manager+)
router.post('/bulk-import', requireHRManager, [
  body('employees')
    .isArray({ min: 1 })
    .withMessage('Employees array is required and must not be empty'),
  body('employees.*.employeeId')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Each employee must have a valid employee ID'),
  body('employees.*.firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each employee must have a valid first name'),
  body('employees.*.lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each employee must have a valid last name')
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

    const { employees } = req.body;

    const results = {
      successful: [],
      failed: []
    };

    for (const employeeData of employees) {
      try {
        // Check if employee ID already exists
        const existing = await db.employee.findFirst({
          where: { 
            organizationId: req.organization.id,
            employeeId: employeeData.employeeId
          }
        });

        if (existing) {
          results.failed.push({
            employeeId: employeeData.employeeId,
            error: 'Employee ID already exists'
          });
          continue;
        }

        // Validate department if provided
        if (employeeData.departmentId) {
          const department = await db.department.findFirst({
            where: {
              id: employeeData.departmentId,
              organizationId: req.organization.id
            }
          });

          if (!department) {
            results.failed.push({
              employeeId: employeeData.employeeId,
              error: 'Department not found'
            });
            continue;
          }
        }

        const employee = await db.employee.create({
          data: {
            organizationId: req.organization.id,
            employeeId: employeeData.employeeId,
            firstName: employeeData.firstName,
            lastName: employeeData.lastName,
            email: employeeData.email,
            phone: employeeData.phone,
            dateOfBirth: employeeData.dateOfBirth ? new Date(employeeData.dateOfBirth) : null,
            position: employeeData.position,
            departmentId: employeeData.departmentId,
            employmentType: employeeData.employmentType || 'FULL_TIME',
            hireDate: employeeData.hireDate ? new Date(employeeData.hireDate) : new Date(),
            salary: employeeData.salary ? parseFloat(employeeData.salary) : null,
            hourlyRate: employeeData.hourlyRate ? parseFloat(employeeData.hourlyRate) : null,
            currency: employeeData.currency || 'USD',
            pin: employeeData.pin,
            isActive: true
          }
        });

        results.successful.push(employee);
      } catch (error) {
        results.failed.push({
          employeeId: employeeData.employeeId,
          error: 'Failed to create employee'
        });
      }
    }

    logger.info(`Bulk import completed by ${req.user?.email} in organization ${req.organization.orgCode}`, {
      organizationId: req.organization.id,
      successful: results.successful.length,
      failed: results.failed.length
    });

    return res.status(200).json({
      success: true,
      data: results,
      message: `Import completed: ${results.successful.length} successful, ${results.failed.length} failed`
    });
  } catch (error: any) {
    logger.error('Error in bulk import:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process bulk import'
    });
  }
});

// @route   GET /api/v1/employees/bulk-export
// @desc    Export employees data (Phase 2 Smart Attendance System)
// @access  Private (Manager+)
router.get('/bulk-export', requireManager, [
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Format must be either json or csv')
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

    const { format = 'json' } = req.query;

    const employees = await db.employee.findMany({
      where: { organizationId: req.organization.id },
      include: {
        department: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        employeeId: 'asc'
      }
    });

    if (format === 'csv') {
      // Simple CSV format for Phase 2
      const csvHeader = 'Employee ID,First Name,Last Name,Email,Phone,Position,Department,Employment Type,Hire Date,Salary,Hourly Rate,Is Active\n';
      const csvData = employees.map(emp => 
        `${emp.employeeId},"${emp.firstName}","${emp.lastName}","${emp.email || ''}","${emp.phone || ''}","${emp.position || ''}","${emp.department?.name || ''}",${emp.employmentType},"${emp.hireDate.toISOString().split('T')[0]}","${emp.salary || ''}","${emp.hourlyRate || '"}",${emp.isActive}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="employees-${req.organization.orgCode}-${new Date().toISOString().split('T')[0]}.csv"`);
      
      logger.info(`Employee data exported as CSV by ${req.user?.email} in organization ${req.organization.orgCode}`, {
        organizationId: req.organization.id,
        count: employees.length
      });

      return res.send(csvHeader + csvData);
    } else {
      logger.info(`Employee data exported as JSON by ${req.user?.email} in organization ${req.organization.orgCode}`, {
        organizationId: req.organization.id,
        count: employees.length
      });

      return res.status(200).json({
        success: true,
        data: employees,
        count: employees.length,
        exportedAt: new Date().toISOString(),
        organizationCode: req.organization.orgCode
      });
    }
  } catch (error: any) {
    logger.error('Error exporting employees:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to export employees'
    });
  }
});

export default router;