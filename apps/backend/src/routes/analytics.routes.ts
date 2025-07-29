import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateOrganization } from '@/middleware/organization.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { query } from 'express-validator';
import logger from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Apply middleware to all routes
router.use(authenticateToken);
router.use(validateOrganization);

// Validation schemas
const dashboardValidation = [
  query('period').optional().isIn(['today', 'week', 'month', 'quarter', 'year']),
  query('departmentId').optional().isUUID(),
];

// GET /api/v1/analytics/dashboard - Get dashboard KPIs
router.get('/dashboard', dashboardValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const period = req.query.period as string || 'today';
    const departmentId = req.query.departmentId as string;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    switch (period) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
    }

    // Build employee filter
    const employeeWhere: any = { organizationId, isActive: true };
    if (departmentId) {
      employeeWhere.departmentId = departmentId;
    }

    // Get total employees
    const totalEmployees = await prisma.employee.count({ where: employeeWhere });

    // Get attendance data for the period
    const attendanceWhere: any = {
      organizationId,
      date: { gte: startDate, lte: endDate }
    };

    if (departmentId) {
      attendanceWhere.employee = { departmentId };
    }

    const [
      attendanceRecords,
      presentToday,
      lateArrivals,
      earlyDepartures,
      avgHoursWorked,
      totalOvertimeHours
    ] = await Promise.all([
      // Total attendance records
      prisma.attendanceRecord.count({ where: attendanceWhere }),

      // Present today
      prisma.attendanceRecord.count({
        where: {
          ...attendanceWhere,
          checkInTime: { not: null },
          date: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
          }
        }
      }),

      // Late arrivals
      prisma.attendanceRecord.count({
        where: { ...attendanceWhere, isLate: true }
      }),

      // Early departures
      prisma.attendanceRecord.count({
        where: { ...attendanceWhere, isEarlyLeave: true }
      }),

      // Average hours worked
      prisma.attendanceRecord.aggregate({
        where: { ...attendanceWhere, hoursWorked: { not: null } },
        _avg: { hoursWorked: true }
      }),

      // Total overtime hours
      prisma.attendanceRecord.aggregate({
        where: { ...attendanceWhere, overtimeHours: { not: null } },
        _sum: { overtimeHours: true }
      })
    ]);

    // Calculate KPIs
    const attendanceRate = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;
    const punctualityRate = attendanceRecords > 0 ? ((attendanceRecords - lateArrivals) / attendanceRecords) * 100 : 100;
    const avgHours = avgHoursWorked._avg.hoursWorked || 0;
    const totalOvertime = totalOvertimeHours._sum.overtimeHours || 0;

    // Get department-wise data
    let departmentStats = [];
    if (!departmentId) {
      const departments = await prisma.department.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true }
      });

      departmentStats = await Promise.all(
        departments.map(async (dept) => {
          const deptEmployees = await prisma.employee.count({
            where: { organizationId, departmentId: dept.id, isActive: true }
          });

          const deptPresent = await prisma.attendanceRecord.count({
            where: {
              organizationId,
              employee: { departmentId: dept.id },
              checkInTime: { not: null },
              date: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
              }
            }
          });

          return {
            department: dept.name,
            totalEmployees: deptEmployees,
            presentToday: deptPresent,
            attendanceRate: deptEmployees > 0 ? (deptPresent / deptEmployees) * 100 : 0
          };
        })
      );
    }

    // Get recent attendance trends (last 7 days)
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const dayAttendance = await prisma.attendanceRecord.count({
        where: {
          organizationId,
          checkInTime: { not: null },
          date: { gte: date, lt: nextDate }
        }
      });

      trendData.push({
        date: date.toISOString().split('T')[0],
        attendance: dayAttendance
      });
    }

    res.json({
      period,
      totalEmployees,
      kpis: {
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        punctualityRate: Math.round(punctualityRate * 100) / 100,
        avgHoursWorked: Math.round(parseFloat(avgHours.toString()) * 100) / 100,
        totalOvertimeHours: Math.round(parseFloat(totalOvertime.toString()) * 100) / 100,
        presentToday,
        lateArrivals,
        earlyDepartures
      },
      departmentStats,
      trendData
    });

  } catch (error) {
    logger.error('Error getting dashboard analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/analytics/employee-performance - Get employee performance metrics
router.get('/employee-performance', [
  query('employeeId').optional().isUUID(),
  query('period').optional().isIn(['week', 'month', 'quarter', 'year']),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const employeeId = req.query.employeeId as string;
    const period = req.query.period as string || 'month';
    const limit = parseInt(req.query.limit as string) || 10;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
    }

    const where: any = {
      organizationId,
      isActive: true
    };

    if (employeeId) {
      where.id = employeeId;
    }

    const employees = await prisma.employee.findMany({
      where,
      take: limit,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } }
      }
    });

    const performanceData = await Promise.all(
      employees.map(async (employee) => {
        const [
          totalDays,
          presentDays,
          lateDays,
          avgHours,
          totalOvertime
        ] = await Promise.all([
          // Working days in period (simplified - assume 5 days/week)
          Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) * 5,

          prisma.attendanceRecord.count({
            where: {
              employeeId: employee.id,
              checkInTime: { not: null },
              date: { gte: startDate, lte: now }
            }
          }),

          prisma.attendanceRecord.count({
            where: {
              employeeId: employee.id,
              isLate: true,
              date: { gte: startDate, lte: now }
            }
          }),

          prisma.attendanceRecord.aggregate({
            where: {
              employeeId: employee.id,
              hoursWorked: { not: null },
              date: { gte: startDate, lte: now }
            },
            _avg: { hoursWorked: true }
          }),

          prisma.attendanceRecord.aggregate({
            where: {
              employeeId: employee.id,
              overtimeHours: { not: null },
              date: { gte: startDate, lte: now }
            },
            _sum: { overtimeHours: true }
          })
        ]);

        const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
        const punctualityRate = presentDays > 0 ? ((presentDays - lateDays) / presentDays) * 100 : 100;

        return {
          employee: {
            id: employee.id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            department: employee.department?.name || 'N/A'
          },
          metrics: {
            attendanceRate: Math.round(attendanceRate * 100) / 100,
            punctualityRate: Math.round(punctualityRate * 100) / 100,
            avgHoursWorked: Math.round(parseFloat((avgHours._avg.hoursWorked || 0).toString()) * 100) / 100,
            totalOvertimeHours: Math.round(parseFloat((totalOvertime._sum.overtimeHours || 0).toString()) * 100) / 100,
            presentDays,
            lateDays,
            totalWorkingDays: totalDays
          }
        };
      })
    );

    res.json({
      period,
      startDate,
      endDate: now,
      employees: performanceData
    });

  } catch (error) {
    logger.error('Error getting employee performance analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/analytics/time-trends - Get time-based analytics trends
router.get('/time-trends', [
  query('metric').isIn(['attendance', 'hours', 'overtime', 'late_arrivals']),
  query('period').optional().isIn(['daily', 'weekly', 'monthly']),
  query('days').optional().isInt({ min: 7, max: 365 }),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const metric = req.query.metric as string;
    const period = req.query.period as string || 'daily';
    const days = parseInt(req.query.days as string) || 30;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);

    const trends = [];

    if (period === 'daily') {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);

        let value = 0;

        switch (metric) {
          case 'attendance':
            value = await prisma.attendanceRecord.count({
              where: {
                organizationId,
                checkInTime: { not: null },
                date: { gte: date, lt: nextDate }
              }
            });
            break;

          case 'hours':
            const hoursResult = await prisma.attendanceRecord.aggregate({
              where: {
                organizationId,
                hoursWorked: { not: null },
                date: { gte: date, lt: nextDate }
              },
              _sum: { hoursWorked: true }
            });
            value = parseFloat((hoursResult._sum.hoursWorked || 0).toString());
            break;

          case 'overtime':
            const overtimeResult = await prisma.attendanceRecord.aggregate({
              where: {
                organizationId,
                overtimeHours: { not: null },
                date: { gte: date, lt: nextDate }
              },
              _sum: { overtimeHours: true }
            });
            value = parseFloat((overtimeResult._sum.overtimeHours || 0).toString());
            break;

          case 'late_arrivals':
            value = await prisma.attendanceRecord.count({
              where: {
                organizationId,
                isLate: true,
                date: { gte: date, lt: nextDate }
              }
            });
            break;
        }

        trends.push({
          date: date.toISOString().split('T')[0],
          value: Math.round(value * 100) / 100
        });
      }
    }

    res.json({
      metric,
      period,
      days,
      startDate,
      endDate: now,
      trends
    });

  } catch (error) {
    logger.error('Error getting time trends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/analytics/reports - Generate comprehensive reports
router.get('/reports', [
  query('type').isIn(['attendance', 'payroll', 'productivity', 'compliance']),
  query('format').optional().isIn(['json', 'csv', 'pdf']),
  query('startDate').isISO8601(),
  query('endDate').isISO8601(),
  query('departmentId').optional().isUUID(),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const reportType = req.query.type as string;
    const format = req.query.format as string || 'json';
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const departmentId = req.query.departmentId as string;

    // Build where clause for employees
    const employeeWhere: any = { organizationId, isActive: true };
    if (departmentId) {
      employeeWhere.departmentId = departmentId;
    }

    // Build where clause for attendance
    const attendanceWhere: any = {
      organizationId,
      date: { gte: startDate, lte: endDate }
    };

    if (departmentId) {
      attendanceWhere.employee = { departmentId };
    }

    let reportData: any = {};

    switch (reportType) {
      case 'attendance':
        const [employees, attendanceRecords] = await Promise.all([
          prisma.employee.findMany({
            where: employeeWhere,
            include: {
              department: { select: { name: true } }
            }
          }),
          prisma.attendanceRecord.findMany({
            where: attendanceWhere,
            include: {
              employee: {
                select: {
                  employeeId: true,
                  firstName: true,
                  lastName: true,
                  department: { select: { name: true } }
                }
              }
            }
          })
        ]);

        reportData = {
          summary: {
            totalEmployees: employees.length,
            totalRecords: attendanceRecords.length,
            averageAttendanceRate: attendanceRecords.length > 0 
              ? (attendanceRecords.filter(r => r.checkInTime).length / attendanceRecords.length) * 100 
              : 0
          },
          records: attendanceRecords.map(record => ({
            employee: {
              id: record.employee.employeeId,
              name: `${record.employee.firstName} ${record.employee.lastName}`,
              department: record.employee.department?.name || 'N/A'
            },
            date: record.date,
            checkIn: record.checkInTime,
            checkOut: record.checkOutTime,
            hoursWorked: record.hoursWorked,
            overtimeHours: record.overtimeHours,
            status: record.status,
            isLate: record.isLate,
            lateBy: record.lateBy
          }))
        };
        break;

      case 'productivity':
        const productivityData = await prisma.attendanceRecord.groupBy({
          by: ['employeeId'],
          where: attendanceWhere,
          _avg: {
            hoursWorked: true
          },
          _sum: {
            hoursWorked: true,
            overtimeHours: true
          },
          _count: {
            id: true
          }
        });

        const employeeDetails = await prisma.employee.findMany({
          where: {
            id: { in: productivityData.map(p => p.employeeId) }
          },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } }
          }
        });

        reportData = {
          summary: {
            totalEmployees: productivityData.length,
            avgHoursPerEmployee: productivityData.reduce((sum, p) => sum + parseFloat((p._avg.hoursWorked || 0).toString()), 0) / productivityData.length,
            totalOvertimeHours: productivityData.reduce((sum, p) => sum + parseFloat((p._sum.overtimeHours || 0).toString()), 0)
          },
          employees: productivityData.map(data => {
            const employee = employeeDetails.find(e => e.id === data.employeeId);
            return {
              employee: {
                id: employee?.employeeId,
                name: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
                department: employee?.department?.name || 'N/A'
              },
              attendanceDays: data._count.id,
              totalHours: parseFloat((data._sum.hoursWorked || 0).toString()),
              avgDailyHours: parseFloat((data._avg.hoursWorked || 0).toString()),
              overtimeHours: parseFloat((data._sum.overtimeHours || 0).toString())
            };
          })
        };
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Return data based on format
    if (format === 'json') {
      res.json({
        reportType,
        period: { startDate, endDate },
        generatedAt: new Date(),
        data: reportData
      });
    } else {
      // For CSV/PDF formats, you would implement the specific formatting here
      res.status(501).json({ error: 'CSV and PDF formats not yet implemented' });
    }

  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;