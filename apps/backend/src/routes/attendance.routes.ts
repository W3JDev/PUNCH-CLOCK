import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateOrganization } from '@/middleware/organization.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { body, query, param } from 'express-validator';
import logger from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const checkInValidation = [
  body('employeeId').isUUID(),
  body('method').isIn(['PIN', 'QR_CODE', 'FACE_ID', 'MANUAL', 'MOBILE_APP', 'WEB_BROWSER', 'BIOMETRIC', 'NFC', 'VOICE_RECOGNITION']),
  body('latitude').optional().isNumeric(),
  body('longitude').optional().isNumeric(),
  body('deviceInfo').optional().isObject(),
  body('pin').optional().isString(),
];

const checkOutValidation = [
  body('employeeId').isUUID(),
  body('method').isIn(['PIN', 'QR_CODE', 'FACE_ID', 'MANUAL', 'MOBILE_APP', 'WEB_BROWSER', 'BIOMETRIC', 'NFC', 'VOICE_RECOGNITION']),
  body('latitude').optional().isNumeric(),
  body('longitude').optional().isNumeric(),
  body('deviceInfo').optional().isObject(),
];

const breakValidation = [
  body('employeeId').isUUID(),
  body('breakType').optional().isIn(['LUNCH', 'COFFEE', 'PERSONAL', 'MEETING', 'OTHER']),
];

// Apply middleware to all routes
router.use(authenticateToken);
router.use(validateOrganization);

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Helper function to validate geofence
async function validateGeofence(employeeId: string, latitude?: number, longitude?: number): Promise<boolean> {
  if (!latitude || !longitude) return true; // Skip validation if no location provided

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { allowedLocations: true, geofenceRadius: true }
  });

  if (!employee || !employee.allowedLocations || (employee.allowedLocations as any[]).length === 0) {
    return true; // No geofence restrictions
  }

  const locations = employee.allowedLocations as { latitude: number; longitude: number; name?: string }[];
  const radius = employee.geofenceRadius || 100;

  return locations.some(location => {
    const distance = calculateDistance(latitude, longitude, location.latitude, location.longitude);
    return distance <= radius;
  });
}

// POST /api/v1/attendance/check-in - Employee check-in
router.post('/check-in', checkInValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const {
      employeeId,
      method,
      latitude,
      longitude,
      deviceInfo = {},
      pin
    } = req.body;

    // Verify employee exists and is active
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        isActive: true
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    // Validate PIN if method is PIN
    if (method === 'PIN') {
      if (!pin || employee.pin !== pin) {
        return res.status(400).json({ error: 'Invalid PIN' });
      }
    }

    // Validate geofence if location provided
    if (latitude && longitude) {
      const isInGeofence = await validateGeofence(employeeId, latitude, longitude);
      if (!isInGeofence) {
        return res.status(400).json({ error: 'Check-in location is outside allowed area' });
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      }
    });

    if (existingRecord && existingRecord.checkInTime) {
      return res.status(400).json({ 
        error: 'Already checked in today',
        checkInTime: existingRecord.checkInTime
      });
    }

    const checkInTime = new Date();

    // Create or update attendance record
    const attendanceRecord = await prisma.attendanceRecord.upsert({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      },
      update: {
        checkInTime,
        checkInMethod: method,
        checkInLocation: latitude && longitude ? `${latitude},${longitude}` : null,
        checkInLatitude: latitude ? parseFloat(latitude) : null,
        checkInLongitude: longitude ? parseFloat(longitude) : null,
        checkInIp: req.ip,
        checkInDevice: JSON.stringify(deviceInfo),
        status: 'PRESENT'
      },
      create: {
        organizationId,
        employeeId,
        date: today,
        checkInTime,
        checkInMethod: method,
        checkInLocation: latitude && longitude ? `${latitude},${longitude}` : null,
        checkInLatitude: latitude ? parseFloat(latitude) : null,
        checkInLongitude: longitude ? parseFloat(longitude) : null,
        checkInIp: req.ip,
        checkInDevice: JSON.stringify(deviceInfo),
        status: 'PRESENT',
        breakRecords: []
      }
    });

    // Check if late (implement shift-based logic later)
    // For now, assume 9 AM is the standard time
    const standardCheckIn = new Date(today);
    standardCheckIn.setHours(9, 0, 0, 0);
    
    if (checkInTime > standardCheckIn) {
      const lateByMinutes = Math.floor((checkInTime.getTime() - standardCheckIn.getTime()) / (1000 * 60));
      await prisma.attendanceRecord.update({
        where: { id: attendanceRecord.id },
        data: {
          isLate: true,
          lateBy: lateByMinutes
        }
      });
    }

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('employee-checked-in', {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        checkInTime,
        method,
        isLate: checkInTime > standardCheckIn
      });
    }

    res.json({
      message: 'Check-in successful',
      attendanceRecord: {
        id: attendanceRecord.id,
        checkInTime,
        method,
        isLate: checkInTime > standardCheckIn
      }
    });

  } catch (error) {
    logger.error('Error during check-in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/attendance/check-out - Employee check-out
router.post('/check-out', checkOutValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const {
      employeeId,
      method,
      latitude,
      longitude,
      deviceInfo = {}
    } = req.body;

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        isActive: true
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance record
    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      }
    });

    if (!attendanceRecord || !attendanceRecord.checkInTime) {
      return res.status(400).json({ error: 'No check-in record found for today' });
    }

    if (attendanceRecord.checkOutTime) {
      return res.status(400).json({ 
        error: 'Already checked out today',
        checkOutTime: attendanceRecord.checkOutTime
      });
    }

    const checkOutTime = new Date();

    // Calculate hours worked
    const hoursWorked = (checkOutTime.getTime() - attendanceRecord.checkInTime.getTime()) / (1000 * 60 * 60);
    
    // Calculate break time
    const breakRecords = attendanceRecord.breakRecords as any[] || [];
    const totalBreakTime = breakRecords.reduce((total, breakRecord) => {
      if (breakRecord.endTime) {
        const breakDuration = (new Date(breakRecord.endTime).getTime() - new Date(breakRecord.startTime).getTime()) / (1000 * 60);
        return total + breakDuration;
      }
      return total;
    }, 0);

    const actualHoursWorked = Math.max(0, hoursWorked - (totalBreakTime / 60));

    // Calculate overtime (assuming 8 hours is standard)
    const standardHours = 8;
    const overtimeHours = Math.max(0, actualHoursWorked - standardHours);

    // Update attendance record
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: {
        checkOutTime,
        checkOutMethod: method,
        checkOutLocation: latitude && longitude ? `${latitude},${longitude}` : null,
        checkOutLatitude: latitude ? parseFloat(latitude) : null,
        checkOutLongitude: longitude ? parseFloat(longitude) : null,
        checkOutIp: req.ip,
        checkOutDevice: JSON.stringify(deviceInfo),
        hoursWorked: parseFloat(actualHoursWorked.toFixed(2)),
        overtimeHours: parseFloat(overtimeHours.toFixed(2)),
        totalBreakTime: Math.floor(totalBreakTime)
      }
    });

    // Emit real-time update
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('employee-checked-out', {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        checkOutTime,
        hoursWorked: actualHoursWorked,
        overtimeHours
      });
    }

    res.json({
      message: 'Check-out successful',
      attendanceRecord: {
        id: updatedRecord.id,
        checkInTime: attendanceRecord.checkInTime,
        checkOutTime,
        hoursWorked: actualHoursWorked,
        overtimeHours,
        totalBreakTime
      }
    });

  } catch (error) {
    logger.error('Error during check-out:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/attendance/break/start - Start break
router.post('/break/start', breakValidation, validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { employeeId, breakType = 'PERSONAL' } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance record
    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      }
    });

    if (!attendanceRecord || !attendanceRecord.checkInTime || attendanceRecord.checkOutTime) {
      return res.status(400).json({ error: 'No active attendance session found' });
    }

    const breakRecords = attendanceRecord.breakRecords as any[] || [];
    
    // Check if there's an active break
    const activeBreak = breakRecords.find(br => !br.endTime);
    if (activeBreak) {
      return res.status(400).json({ error: 'Break already in progress' });
    }

    // Add new break record
    const newBreak = {
      id: Date.now().toString(),
      type: breakType,
      startTime: new Date().toISOString(),
      endTime: null
    };

    breakRecords.push(newBreak);

    await prisma.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: { breakRecords }
    });

    res.json({
      message: 'Break started successfully',
      breakId: newBreak.id,
      startTime: newBreak.startTime
    });

  } catch (error) {
    logger.error('Error starting break:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/attendance/break/end - End break
router.post('/break/end', [body('employeeId').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { employeeId } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance record
    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      }
    });

    if (!attendanceRecord) {
      return res.status(400).json({ error: 'No attendance record found' });
    }

    const breakRecords = attendanceRecord.breakRecords as any[] || [];
    
    // Find active break
    const activeBreakIndex = breakRecords.findIndex(br => !br.endTime);
    if (activeBreakIndex === -1) {
      return res.status(400).json({ error: 'No active break found' });
    }

    // End the break
    const endTime = new Date().toISOString();
    breakRecords[activeBreakIndex].endTime = endTime;

    // Calculate break duration
    const startTime = new Date(breakRecords[activeBreakIndex].startTime);
    const duration = Math.floor((new Date(endTime).getTime() - startTime.getTime()) / (1000 * 60));
    breakRecords[activeBreakIndex].duration = duration;

    await prisma.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: { breakRecords }
    });

    res.json({
      message: 'Break ended successfully',
      breakId: breakRecords[activeBreakIndex].id,
      endTime,
      duration
    });

  } catch (error) {
    logger.error('Error ending break:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/attendance/current/:employeeId - Get current attendance status
router.get('/current/:employeeId', [param('employeeId').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const { employeeId } = req.params;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId,
          employeeId,
          date: today
        }
      },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            profilePhoto: true
          }
        }
      }
    });

    if (!attendanceRecord) {
      return res.json({
        status: 'NOT_CHECKED_IN',
        employee: null,
        record: null
      });
    }

    const breakRecords = attendanceRecord.breakRecords as any[] || [];
    const activeBreak = breakRecords.find(br => !br.endTime);

    res.json({
      status: !attendanceRecord.checkInTime ? 'NOT_CHECKED_IN' : 
               attendanceRecord.checkOutTime ? 'CHECKED_OUT' :
               activeBreak ? 'ON_BREAK' : 'CHECKED_IN',
      employee: attendanceRecord.employee,
      record: {
        id: attendanceRecord.id,
        date: attendanceRecord.date,
        checkInTime: attendanceRecord.checkInTime,
        checkOutTime: attendanceRecord.checkOutTime,
        hoursWorked: attendanceRecord.hoursWorked,
        isLate: attendanceRecord.isLate,
        lateBy: attendanceRecord.lateBy,
        breakRecords,
        activeBreak
      }
    });

  } catch (error) {
    logger.error('Error getting current attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/attendance/records - Get attendance records with filtering
router.get('/records', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('employeeId').optional().isUUID(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('status').optional().isIn(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME', 'ON_LEAVE']),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const employeeId = req.query.employeeId as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;
    const status = req.query.status as string;

    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    if (status) {
      where.status = status;
    }

    const [records, totalCount] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              employeeId: true,
              firstName: true,
              lastName: true,
              profilePhoto: true,
              department: {
                select: { name: true }
              }
            }
          }
        },
        skip,
        take: limit,
        orderBy: [
          { date: 'desc' },
          { checkInTime: 'desc' }
        ]
      }),
      prisma.attendanceRecord.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      records,
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
    logger.error('Error getting attendance records:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;