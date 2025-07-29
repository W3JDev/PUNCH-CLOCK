import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateOrganization } from '@/middleware/organization.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { body, query, param } from 'express-validator';
import multer from 'multer';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import logger from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

// Validation schemas
const createEmployeeValidation = [
  body('employeeId').isString().isLength({ min: 1, max: 50 }),
  body('firstName').isString().isLength({ min: 1, max: 100 }),
  body('lastName').isString().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('position').optional().isString(),
  body('departmentId').optional().isUUID(),
  body('employmentType').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']),
  body('salary').optional().isNumeric(),
  body('hourlyRate').optional().isNumeric(),
  body('customFields').optional().isObject(),
];

const updateEmployeeValidation = [
  param('id').isUUID(),
  body('firstName').optional().isString().isLength({ min: 1, max: 100 }),
  body('lastName').optional().isString().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('position').optional().isString(),
  body('departmentId').optional().isUUID(),
  body('employmentType').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']),
  body('salary').optional().isNumeric(),
  body('hourlyRate').optional().isNumeric(),
  body('customFields').optional().isObject(),
  body('isActive').optional().isBoolean(),
];

const listEmployeesValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('departmentId').optional().isUUID(),
  query('employmentType').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']),
  query('isActive').optional().isBoolean(),
];

// Apply middleware to all routes
router.use(authenticateToken);
router.use(validateOrganization);

// GET /api/v1/employees - List employees with pagination and filtering
router.get('/', listEmployeesValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const departmentId = req.query.departmentId as string;
    const employmentType = req.query.employmentType as string;
    const isActive = req.query.isActive ? req.query.isActive === 'true' : undefined;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      organizationId,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
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

    const [employees, totalCount] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          department: {
            select: { id: true, name: true }
          },
          user: {
            select: { id: true, email: true }
          }
        },
        skip,
        take: limit,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      }),
      prisma.employee.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      employees,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error listing employees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/employees - Create new employee
router.post('/', createEmployeeValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      position,
      departmentId,
      employmentType = 'FULL_TIME',
      salary,
      hourlyRate,
      customFields = {}
    } = req.body;

    // Check if employee ID already exists in organization
    const existingEmployee = await prisma.employee.findUnique({
      where: {
        organizationId_employeeId: {
          organizationId,
          employeeId
        }
      }
    });

    if (existingEmployee) {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingEmailEmployee = await prisma.employee.findFirst({
        where: {
          organizationId,
          email,
          isActive: true
        }
      });

      if (existingEmailEmployee) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const employee = await prisma.employee.create({
      data: {
        organizationId,
        employeeId,
        firstName,
        lastName,
        email,
        phone,
        position,
        departmentId,
        employmentType,
        salary: salary ? parseFloat(salary) : null,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        customFields,
      },
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    });

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('employee-created', employee);
    }

    res.status(201).json(employee);

  } catch (error) {
    logger.error('Error creating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/employees/:id - Get employee details
router.get('/:id', [param('id').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const employee = await prisma.employee.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        department: {
          select: { id: true, name: true }
        },
        user: {
          select: { id: true, email: true, role: true }
        },
        attendanceRecords: {
          take: 10,
          orderBy: { date: 'desc' },
          select: {
            id: true,
            date: true,
            checkInTime: true,
            checkOutTime: true,
            hoursWorked: true,
            status: true
          }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);

  } catch (error) {
    logger.error('Error getting employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/employees/:id - Update employee
router.put('/:id', updateEmployeeValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    // Check if employee exists
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if email already exists (if being updated)
    if (req.body.email && req.body.email !== existingEmployee.email) {
      const existingEmailEmployee = await prisma.employee.findFirst({
        where: {
          organizationId,
          email: req.body.email,
          isActive: true,
          id: { not: id }
        }
      });

      if (existingEmailEmployee) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const updateData: any = { ...req.body };
    
    // Convert numeric fields
    if (updateData.salary) {
      updateData.salary = parseFloat(updateData.salary);
    }
    if (updateData.hourlyRate) {
      updateData.hourlyRate = parseFloat(updateData.hourlyRate);
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    });

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('employee-updated', employee);
    }

    res.json(employee);

  } catch (error) {
    logger.error('Error updating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/employees/:id - Soft delete employee
router.delete('/:id', [param('id').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const employee = await prisma.employee.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Soft delete by setting isActive to false
    await prisma.employee.update({
      where: { id },
      data: {
        isActive: false,
        terminationDate: new Date()
      }
    });

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('employee-deleted', { id });
    }

    res.json({ message: 'Employee deleted successfully' });

  } catch (error) {
    logger.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/employees/bulk-import - Bulk import employees from CSV/Excel
router.post('/bulk-import', upload.single('file'), async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Create bulk operation record
    const bulkOperation = await prisma.bulkOperation.create({
      data: {
        organizationId,
        userId,
        operationType: 'EMPLOYEE_IMPORT',
        fileName: req.file.originalname,
        totalRecords: 0,
        status: 'PENDING'
      }
    });

    // Process file asynchronously
    processEmployeeImport(req.file, organizationId, bulkOperation.id);

    res.json({
      message: 'Import started successfully',
      operationId: bulkOperation.id
    });

  } catch (error) {
    logger.error('Error starting bulk import:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/employees/bulk-export - Export employees to CSV/Excel
router.get('/bulk-export', [
  query('format').optional().isIn(['csv', 'excel']),
  query('includeInactive').optional().isBoolean(),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const format = (req.query.format as string) || 'csv';
    const includeInactive = req.query.includeInactive === 'true';

    const where: any = { organizationId };
    if (!includeInactive) {
      where.isActive = true;
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        department: { select: { name: true } }
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Employees');

      // Add headers
      worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'First Name', key: 'firstName', width: 20 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Position', key: 'position', width: 25 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Employment Type', key: 'employmentType', width: 15 },
        { header: 'Hire Date', key: 'hireDate', width: 15 },
        { header: 'Salary', key: 'salary', width: 15 },
        { header: 'Hourly Rate', key: 'hourlyRate', width: 15 },
        { header: 'Status', key: 'status', width: 10 },
      ];

      // Add data
      employees.forEach(emp => {
        worksheet.addRow({
          employeeId: emp.employeeId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone,
          position: emp.position,
          department: emp.department?.name || '',
          employmentType: emp.employmentType,
          hireDate: emp.hireDate.toISOString().split('T')[0],
          salary: emp.salary?.toString() || '',
          hourlyRate: emp.hourlyRate?.toString() || '',
          status: emp.isActive ? 'Active' : 'Inactive'
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="employees.xlsx"');

      await workbook.xlsx.write(res);
      res.end();

    } else {
      // CSV export
      const csvData = employees.map(emp => ({
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email || '',
        phone: emp.phone || '',
        position: emp.position || '',
        department: emp.department?.name || '',
        employmentType: emp.employmentType,
        hireDate: emp.hireDate.toISOString().split('T')[0],
        salary: emp.salary?.toString() || '',
        hourlyRate: emp.hourlyRate?.toString() || '',
        status: emp.isActive ? 'Active' : 'Inactive'
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');

      const csvWriter = createObjectCsvWriter({
        path: '',
        header: [
          { id: 'employeeId', title: 'Employee ID' },
          { id: 'firstName', title: 'First Name' },
          { id: 'lastName', title: 'Last Name' },
          { id: 'email', title: 'Email' },
          { id: 'phone', title: 'Phone' },
          { id: 'position', title: 'Position' },
          { id: 'department', title: 'Department' },
          { id: 'employmentType', title: 'Employment Type' },
          { id: 'hireDate', title: 'Hire Date' },
          { id: 'salary', title: 'Salary' },
          { id: 'hourlyRate', title: 'Hourly Rate' },
          { id: 'status', title: 'Status' },
        ]
      });

      const csvString = await csvWriter.stringifyRecords(csvData);
      res.send(csvString);
    }

  } catch (error) {
    logger.error('Error exporting employees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/employees/bulk-operations/:id - Get bulk operation status
router.get('/bulk-operations/:id', [param('id').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const operation = await prisma.bulkOperation.findFirst({
      where: {
        id,
        organizationId
      }
    });

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    res.json(operation);

  } catch (error) {
    logger.error('Error getting bulk operation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to process employee import asynchronously
async function processEmployeeImport(file: Express.Multer.File, organizationId: string, operationId: string) {
  try {
    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date()
      }
    });

    const employees: any[] = [];
    const errors: any[] = [];

    // Parse CSV/Excel file
    if (file.mimetype === 'text/csv') {
      const stream = Readable.from(file.buffer.toString());
      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (data) => employees.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
    } else {
      // Handle Excel files
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.getWorksheet(1);
      
      if (worksheet) {
        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber] = cell.value?.toString() || '';
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header row
          
          const employee: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber]?.toLowerCase().replace(/\s+/g, '');
            if (header) {
              employee[header] = cell.value;
            }
          });
          
          if (employee.employeeid || employee.firstname) {
            employees.push(employee);
          }
        });
      }
    }

    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: { totalRecords: employees.length }
    });

    let successCount = 0;
    let failCount = 0;

    // Process each employee
    for (const [index, empData] of employees.entries()) {
      try {
        // Map CSV/Excel columns to our schema
        const employeeData = {
          employeeId: empData.employeeid || empData['employee id'] || empData.id,
          firstName: empData.firstname || empData['first name'],
          lastName: empData.lastname || empData['last name'],
          email: empData.email,
          phone: empData.phone,
          position: empData.position,
          employmentType: empData.employmenttype || empData['employment type'] || 'FULL_TIME',
          salary: empData.salary ? parseFloat(empData.salary) : null,
          hourlyRate: empData.hourlyrate || empData['hourly rate'] ? parseFloat(empData.hourlyrate || empData['hourly rate']) : null,
        };

        // Validate required fields
        if (!employeeData.employeeId || !employeeData.firstName || !employeeData.lastName) {
          errors.push({
            row: index + 2,
            error: 'Missing required fields: employeeId, firstName, or lastName'
          });
          failCount++;
          continue;
        }

        // Check for duplicate employee ID
        const existing = await prisma.employee.findUnique({
          where: {
            organizationId_employeeId: {
              organizationId,
              employeeId: employeeData.employeeId
            }
          }
        });

        if (existing) {
          errors.push({
            row: index + 2,
            error: `Employee ID ${employeeData.employeeId} already exists`
          });
          failCount++;
          continue;
        }

        // Create employee
        await prisma.employee.create({
          data: {
            organizationId,
            ...employeeData,
            customFields: {}
          }
        });

        successCount++;

        // Update progress periodically
        if ((index + 1) % 10 === 0) {
          await prisma.bulkOperation.update({
            where: { id: operationId },
            data: {
              processedRecords: index + 1,
              successfulRecords: successCount,
              failedRecords: failCount
            }
          });
        }

      } catch (error) {
        logger.error(`Error processing employee at row ${index + 2}:`, error);
        errors.push({
          row: index + 2,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failCount++;
      }
    }

    // Final update
    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        processedRecords: employees.length,
        successfulRecords: successCount,
        failedRecords: failCount,
        errors: errors,
        summary: {
          totalImported: successCount,
          totalFailed: failCount,
          duplicates: errors.filter(e => e.error.includes('already exists')).length
        }
      }
    });

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('bulk-import-completed', {
        operationId,
        successCount,
        failCount,
        totalCount: employees.length
      });
    }

  } catch (error) {
    logger.error('Error processing bulk import:', error);
    
    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: [{ error: error instanceof Error ? error.message : 'Unknown error' }]
      }
    });
  }
}

export default router;