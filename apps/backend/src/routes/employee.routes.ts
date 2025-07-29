import { Router, Request, Response } from 'express';
import { db } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

// Schema validation types
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

// GET /employees - Get all employees for an organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, departmentId, isActive, employmentType } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let whereCondition: any = {
      organizationId: organizationId as string
    };

    if (departmentId) {
      whereCondition.departmentId = departmentId as string;
    }

    if (isActive !== undefined) {
      whereCondition.isActive = isActive === 'true';
    }

    if (employmentType) {
      whereCondition.employmentType = employmentType as string;
    }

    const employees = await db.employee.findMany({
      where: whereCondition,
      include: {
        department: {
          select: {
            id: true,
            name: true,
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        },
        _count: {
          select: {
            attendanceRecords: true,
            leaveRequests: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    logger.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees'
    });
  }
});

// POST /employees - Create new employee
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: CreateEmployeeRequest = req.body;
    
    // Validate required fields
    if (!body.organizationId || !body.employeeId || !body.firstName || !body.lastName) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, Employee ID, First Name, and Last Name are required'
      });
    }

    // Check if employee ID already exists in the organization
    const existingEmployee = await db.employee.findFirst({
      where: { 
        organizationId: body.organizationId,
        employeeId: body.employeeId
      }
    });

    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID already exists in this organization'
      });
    }

    // Verify organization exists
    const organization = await db.organization.findUnique({
      where: { id: body.organizationId }
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Verify department exists if provided
    if (body.departmentId) {
      const department = await db.department.findFirst({
        where: {
          id: body.departmentId,
          organizationId: body.organizationId
        }
      });

      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'Department not found'
        });
      }
    }

    const employeeData = {
      organizationId: body.organizationId,
      employeeId: body.employeeId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      position: body.position,
      departmentId: body.departmentId,
      employmentType: body.employmentType || 'FULL_TIME',
      hireDate: body.hireDate ? new Date(body.hireDate) : new Date(),
      salary: body.salary,
      hourlyRate: body.hourlyRate,
      currency: body.currency || 'USD',
      pin: body.pin,
    };

    const employee = await db.employee.create({
      data: employeeData,
      include: {
        department: {
          select: {
            id: true,
            name: true,
          }
        },
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
          }
        }
      }
    });

    logger.info(`Employee created: ${employee.firstName} ${employee.lastName}`, {
      organizationId: body.organizationId,
      employeeId: body.employeeId
    });

    res.status(201).json({
      success: true,
      data: employee,
      message: 'Employee created successfully'
    });
  } catch (error) {
    logger.error('Error creating employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create employee'
    });
  }
});

// GET /employees/:id - Get employee details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const employee = await db.employee.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            description: true,
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
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
          }
        },
        leaveRequests: {
          where: { status: 'PENDING' },
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
          }
        },
        _count: {
          select: {
            attendanceRecords: true,
            leaveRequests: true,
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

    res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    logger.error('Error fetching employee details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee details'
    });
  }
});

// PUT /employees/:id - Update employee
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body: UpdateEmployeeRequest = req.body;
    const { organizationId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    // Check if employee exists
    const existingEmployee = await db.employee.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      }
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Verify department exists if provided
    if (body.departmentId) {
      const department = await db.department.findFirst({
        where: {
          id: body.departmentId,
          organizationId: organizationId as string
        }
      });

      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'Department not found'
        });
      }
    }

    const updateData: any = {};
    
    if (body.firstName) updateData.firstName = body.firstName;
    if (body.lastName) updateData.lastName = body.lastName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.dateOfBirth) updateData.dateOfBirth = new Date(body.dateOfBirth);
    if (body.position !== undefined) updateData.position = body.position;
    if (body.departmentId !== undefined) updateData.departmentId = body.departmentId;
    if (body.employmentType) updateData.employmentType = body.employmentType;
    if (body.terminationDate) updateData.terminationDate = new Date(body.terminationDate);
    if (body.salary !== undefined) updateData.salary = body.salary;
    if (body.hourlyRate !== undefined) updateData.hourlyRate = body.hourlyRate;
    if (body.pin !== undefined) updateData.pin = body.pin;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updatedEmployee = await db.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: {
            id: true,
            name: true,
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        }
      }
    });

    logger.info(`Employee updated: ${updatedEmployee.firstName} ${updatedEmployee.lastName}`, {
      organizationId: organizationId as string,
      employeeId: updatedEmployee.employeeId,
      changes: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: updatedEmployee,
      message: 'Employee updated successfully'
    });
  } catch (error) {
    logger.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update employee'
    });
  }
});

// DELETE /employees/:id - Delete/deactivate employee
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId, permanent } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const existingEmployee = await db.employee.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      }
    });

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    if (permanent === 'true') {
      // Permanent deletion (only if no attendance records)
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
      
      logger.info(`Employee permanently deleted: ${existingEmployee.firstName} ${existingEmployee.lastName}`, {
        organizationId: organizationId as string,
        employeeId: existingEmployee.employeeId
      });

      res.json({
        success: true,
        message: 'Employee permanently deleted'
      });
    } else {
      // Soft delete (deactivate)
      await db.employee.update({
        where: { id },
        data: { 
          isActive: false,
          terminationDate: new Date()
        }
      });

      logger.info(`Employee deactivated: ${existingEmployee.firstName} ${existingEmployee.lastName}`, {
        organizationId: organizationId as string,
        employeeId: existingEmployee.employeeId
      });

      res.json({
        success: true,
        message: 'Employee deactivated successfully'
      });
    }
  } catch (error) {
    logger.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete employee'
    });
  }
});

// POST /employees/bulk-import - Bulk import employees
router.post('/bulk-import', async (req: Request, res: Response) => {
  try {
    const { organizationId, employees } = req.body;
    
    if (!organizationId || !Array.isArray(employees)) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and employees array are required'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const employeeData of employees) {
      try {
        // Check if employee ID already exists
        const existing = await db.employee.findFirst({
          where: { 
            organizationId,
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

        const employee = await db.employee.create({
          data: {
            organizationId,
            employeeId: employeeData.employeeId,
            firstName: employeeData.firstName,
            lastName: employeeData.lastName,
            email: employeeData.email,
            phone: employeeData.phone,
            position: employeeData.position,
            departmentId: employeeData.departmentId,
            employmentType: employeeData.employmentType || 'FULL_TIME',
            hireDate: employeeData.hireDate ? new Date(employeeData.hireDate) : new Date(),
            salary: employeeData.salary,
            hourlyRate: employeeData.hourlyRate,
            pin: employeeData.pin,
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

    logger.info(`Bulk import completed`, {
      organizationId,
      successful: results.successful.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      data: results,
      message: `Import completed: ${results.successful.length} successful, ${results.failed.length} failed`
    });
  } catch (error) {
    logger.error('Error in bulk import:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process bulk import'
    });
  }
});

// GET /employees/bulk-export - Export employees data
router.get('/bulk-export', async (req: Request, res: Response) => {
  try {
    const { organizationId, format = 'json' } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const employees = await db.employee.findMany({
      where: { organizationId: organizationId as string },
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
      // Simple CSV format
      const csvHeader = 'Employee ID,First Name,Last Name,Email,Phone,Position,Department,Employment Type,Hire Date,Salary,Hourly Rate\n';
      const csvData = employees.map(emp => 
        `${emp.employeeId},${emp.firstName},${emp.lastName},${emp.email || ''},${emp.phone || ''},${emp.position || ''},${emp.department?.name || ''},${emp.employmentType},${emp.hireDate.toISOString().split('T')[0]},${emp.salary || ''},${emp.hourlyRate || ''}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
      res.send(csvHeader + csvData);
    } else {
      res.json({
        success: true,
        data: employees,
        count: employees.length,
        exportedAt: new Date().toISOString()
      });
    }

    logger.info(`Employee data exported`, {
      organizationId: organizationId as string,
      format,
      count: employees.length
    });
  } catch (error) {
    logger.error('Error exporting employees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export employees'
    });
  }
});

export default router;