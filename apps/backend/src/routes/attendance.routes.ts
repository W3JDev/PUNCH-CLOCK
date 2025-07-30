import { Router, Request, Response } from 'express';
import { db } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

// Schema validation types
interface AttendanceRequest {
  organizationId: string;
  employeeId: string;
  action: 'check_in' | 'check_out' | 'break_start' | 'break_end';
  timestamp?: string;
  location?: string;
  method?: 'PIN' | 'QR_CODE' | 'FACE_ID' | 'MANUAL' | 'MOBILE_APP' | 'WEB_BROWSER';
  notes?: string;
  pin?: string; // For PIN-based authentication
  qrCode?: string; // For QR code authentication
  faceEncodingId?: string; // For face recognition
  latitude?: number;
  longitude?: number;
}

// Helper function to emit real-time updates
function emitAttendanceUpdate(io: any, organizationId: string, eventType: string, data: any) {
  try {
    io.to(`org-${organizationId}`).emit('attendance-update', {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });
    logger.info(`Emitted real-time update: ${eventType}`, { organizationId });
  } catch (error) {
    logger.error('Failed to emit real-time update:', error);
  }
}

// Helper function to validate QR codes with HMAC verification
function validateQRCode(qrCode: string, employeeId: string): boolean {
  try {
    // QR code format: employeeId:timestamp:hash
    const [id, timestamp, hash] = qrCode.split(':');
    
    if (id !== employeeId) return false;
    
    const qrTimestamp = parseInt(timestamp);
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // QR code expires after 5 minutes
    return (currentTime - qrTimestamp) < fiveMinutes;
  } catch {
    return false;
  }
}

// Helper function to validate location (basic distance check)
function validateLocation(lat: number, lon: number, allowedLocations: any[]): boolean {
  if (!allowedLocations || allowedLocations.length === 0) return true;
  
  // Simple distance calculation for demo (in real app, use proper geofencing)
  const isWithinRange = allowedLocations.some(location => {
    const distance = Math.sqrt(
      Math.pow(lat - location.latitude, 2) + Math.pow(lon - location.longitude, 2)
    );
    return distance < GEOFENCING_RADIUS; // ~100m radius
  });
  
  return isWithinRange;
}

// Helper function to check for late arrival
function isLateArrival(checkInTime: Date, shiftStartTime: string): boolean {
  const [hours, minutes] = shiftStartTime.split(':').map(Number);
  const shiftStart = new Date(checkInTime);
  shiftStart.setHours(hours, minutes, 0, 0);
  
  return checkInTime > shiftStart;
}

// Helper function to detect early departure
function isEarlyDeparture(checkOutTime: Date, shiftEndTime: string): boolean {
  const [hours, minutes] = shiftEndTime.split(':').map(Number);
  const shiftEnd = new Date(checkOutTime);
  shiftEnd.setHours(hours, minutes, 0, 0);
  
  return checkOutTime < shiftEnd;
}

// POST /attendance/check-in
router.post('/check-in', async (req: Request, res: Response) => {
  try {
    const body: AttendanceRequest = req.body;
    
    // Validate required fields
    if (!body.organizationId || !body.employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Employee ID are required'
      });
    }

    // Validate employee exists and get organization settings
    const employee = await db.employee.findFirst({
      where: {
        id: body.employeeId,
        organizationId: body.organizationId,
        isActive: true
      },
      include: {
        organization: {
          select: {
            settings: true
          }
        },
        shiftAssignments: {
          where: {
            isActive: true,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } }
            ]
          },
          include: {
            shift: true
          },
          take: 1
        }
      }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    // Validate authentication method
    if (body.method === 'PIN' && body.pin) {
      if (!employee.pin || employee.pin !== body.pin) {
        return res.status(401).json({
          success: false,
          error: 'Invalid PIN'
        });
      }
    }

    if (body.method === 'QR_CODE' && body.qrCode) {
      if (!validateQRCode(body.qrCode, body.employeeId)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired QR code'
        });
      }
    }

    if (body.method === 'FACE_ID' && body.faceEncodingId) {
      if (!employee.faceEncodingId || employee.faceEncodingId !== body.faceEncodingId) {
        return res.status(401).json({
          success: false,
          error: 'Face recognition failed'
        });
      }
    }

    // Validate location if GPS coordinates provided
    if (body.latitude && body.longitude) {
      const orgSettings = employee.organization?.settings as any;
      const allowedLocations = orgSettings?.allowedLocations || [];
      
      if (!validateLocation(body.latitude, body.longitude, allowedLocations)) {
        return res.status(403).json({
          success: false,
          error: 'Check-in not allowed from this location'
        });
      }
    }

    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
    const date = new Date(timestamp.toDateString());

    // Find or create attendance record for today
    let attendanceRecord = await db.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: body.organizationId,
          employeeId: body.employeeId,
          date
        }
      }
    });

    if (!attendanceRecord) {
      attendanceRecord = await db.attendanceRecord.create({
        data: {
          organizationId: body.organizationId,
          employeeId: body.employeeId,
          date,
          status: 'PRESENT'
        }
      });
    }

    // Check if already checked in
    if (attendanceRecord.checkInTime) {
      return res.status(400).json({
        success: false,
        error: 'Already checked in for today',
        existingCheckIn: attendanceRecord.checkInTime
      });
    }

    // Check for late arrival
    const currentShift = employee.shiftAssignments[0]?.shift;
    let isLate = false;
    if (currentShift) {
      isLate = isLateArrival(timestamp, currentShift.startTime);
    }

    const updatedRecord = await db.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: {
        checkInTime: timestamp,
        checkInMethod: body.method || 'WEB_BROWSER',
        checkInLocation: body.location || `${body.latitude},${body.longitude}`,
        checkInIp: req.ip,
        checkInDevice: req.get('User-Agent'),
        status: isLate ? 'LATE' : 'PRESENT',
        isLate: isLate,
        notes: body.notes
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    logger.info(`Employee ${employee.firstName} ${employee.lastName} checked in`, {
      organizationId: body.organizationId,
      employeeId: body.employeeId,
      method: body.method,
      isLate
    });

    // Emit real-time update
    emitAttendanceUpdate(body.organizationId, 'check-in', {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        position: employee.position
      },
      timestamp: updatedRecord.checkInTime,
      method: body.method,
      isLate
    });

    res.json({
      success: true,
      data: updatedRecord,
      message: `Check-in recorded successfully${isLate ? ' (Late arrival)' : ''}`,
      warnings: isLate ? ['Late arrival detected'] : []
    });
  } catch (error) {
    logger.error('Error recording check-in:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record check-in'
    });
  }
});

// POST /attendance/check-out
router.post('/check-out', async (req: Request, res: Response) => {
  try {
    const body: AttendanceRequest = req.body;
    
    if (!body.organizationId || !body.employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Employee ID are required'
      });
    }

    // Get employee with shift information
    const employee = await db.employee.findFirst({
      where: {
        id: body.employeeId,
        organizationId: body.organizationId,
        isActive: true
      },
      include: {
        shiftAssignments: {
          where: {
            isActive: true,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } }
            ]
          },
          include: {
            shift: true
          },
          take: 1
        }
      }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
    const date = new Date(timestamp.toDateString());

    const attendanceRecord = await db.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: body.organizationId,
          employeeId: body.employeeId,
          date
        }
      }
    });

    if (!attendanceRecord || !attendanceRecord.checkInTime) {
      return res.status(400).json({
        success: false,
        error: 'No check-in found for today'
      });
    }

    if (attendanceRecord.checkOutTime) {
      return res.status(400).json({
        success: false,
        error: 'Already checked out for today',
        existingCheckOut: attendanceRecord.checkOutTime
      });
    }

    // Calculate hours worked
    const hoursWorked = (timestamp.getTime() - attendanceRecord.checkInTime.getTime()) / (1000 * 60 * 60);
    
    // Check for early departure
    const currentShift = employee.shiftAssignments[0]?.shift;
    let isEarlyLeave = false;
    let overtimeHours = 0;
    
    if (currentShift) {
      isEarlyLeave = isEarlyDeparture(timestamp, currentShift.endTime);
      
      // Calculate overtime (simplified - hours beyond shift end)
      const [shiftHours, shiftMinutes] = currentShift.endTime.split(':').map(Number);
      const shiftEnd = new Date(timestamp);
      shiftEnd.setHours(shiftHours, shiftMinutes, 0, 0);
      
      if (timestamp > shiftEnd) {
        overtimeHours = (timestamp.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60);
      }
    }

    const updatedRecord = await db.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: {
        checkOutTime: timestamp,
        checkOutMethod: body.method || 'WEB_BROWSER',
        checkOutLocation: body.location || `${body.latitude},${body.longitude}`,
        checkOutIp: req.ip,
        checkOutDevice: req.get('User-Agent'),
        hoursWorked: hoursWorked,
        overtimeHours: overtimeHours > 0 ? overtimeHours : null,
        isEarlyLeave: isEarlyLeave,
        notes: body.notes || attendanceRecord.notes
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    const warnings = [];
    if (isEarlyLeave) warnings.push('Early departure detected');
    if (overtimeHours > 0) warnings.push(`Overtime: ${overtimeHours.toFixed(2)} hours`);

    logger.info(`Employee ${employee.firstName} ${employee.lastName} checked out`, {
      organizationId: body.organizationId,
      employeeId: body.employeeId,
      hoursWorked: hoursWorked.toFixed(2),
      isEarlyLeave,
      overtimeHours: overtimeHours.toFixed(2)
    });

    // Emit real-time update
    emitAttendanceUpdate(body.organizationId, 'check-out', {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        position: employee.position
      },
      timestamp: updatedRecord.checkOutTime,
      hoursWorked: hoursWorked.toFixed(2),
      isEarlyLeave,
      overtimeHours: overtimeHours > 0 ? overtimeHours.toFixed(2) : null
    });

    res.json({
      success: true,
      data: updatedRecord,
      message: 'Check-out recorded successfully',
      warnings
    });
  } catch (error) {
    logger.error('Error recording check-out:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record check-out'
    });
  }
});

// POST /attendance/break-start
router.post('/break-start', async (req: Request, res: Response) => {
  try {
    const body: AttendanceRequest = req.body;
    
    if (!body.organizationId || !body.employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Employee ID are required'
      });
    }

    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
    const date = new Date(timestamp.toDateString());

    const attendanceRecord = await db.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: body.organizationId,
          employeeId: body.employeeId,
          date
        }
      }
    });

    if (!attendanceRecord || !attendanceRecord.checkInTime) {
      return res.status(400).json({
        success: false,
        error: 'Must check in before starting break'
      });
    }

    if (attendanceRecord.breakStartTime && !attendanceRecord.breakEndTime) {
      return res.status(400).json({
        success: false,
        error: 'Break already in progress'
      });
    }

    const updatedRecord = await db.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: {
        breakStartTime: timestamp
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    // Emit real-time update
    emitAttendanceUpdate(body.organizationId, 'break-start', {
      employee: {
        id: body.employeeId,
        name: `${updatedRecord.employee?.firstName} ${updatedRecord.employee?.lastName}`
      },
      timestamp: updatedRecord.breakStartTime
    });

    res.json({
      success: true,
      data: updatedRecord,
      message: 'Break start recorded successfully'
    });
  } catch (error) {
    logger.error('Error recording break start:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record break start'
    });
  }
});

// POST /attendance/break-end
router.post('/break-end', async (req: Request, res: Response) => {
  try {
    const body: AttendanceRequest = req.body;
    
    if (!body.organizationId || !body.employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Employee ID are required'
      });
    }

    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
    const date = new Date(timestamp.toDateString());

    const attendanceRecord = await db.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: body.organizationId,
          employeeId: body.employeeId,
          date
        }
      }
    });

    if (!attendanceRecord || !attendanceRecord.breakStartTime) {
      return res.status(400).json({
        success: false,
        error: 'No break in progress'
      });
    }

    // Calculate break duration in minutes
    const breakDuration = (timestamp.getTime() - attendanceRecord.breakStartTime.getTime()) / (1000 * 60);

    const updatedRecord = await db.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: {
        breakEndTime: timestamp,
        breakDuration: Math.round(breakDuration)
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    // Emit real-time update
    emitAttendanceUpdate(body.organizationId, 'break-end', {
      employee: {
        id: body.employeeId,
        name: `${updatedRecord.employee?.firstName} ${updatedRecord.employee?.lastName}`
      },
      timestamp: updatedRecord.breakEndTime,
      breakDuration: Math.round(breakDuration)
    });

    res.json({
      success: true,
      data: updatedRecord,
      message: 'Break end recorded successfully'
    });
  } catch (error) {
    logger.error('Error recording break end:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record break end'
    });
  }
});

// GET /attendance/records
router.get('/records', async (req: Request, res: Response) => {
  try {
    const { organizationId, employeeId, date, startDate, endDate } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let whereCondition: AttendanceWhereCondition = {
      organizationId: organizationId as string
    };

    if (employeeId) {
      whereCondition.employeeId = employeeId as string;
    }

    if (date) {
      whereCondition.date = new Date(date as string);
    } else if (startDate && endDate) {
      whereCondition.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const attendanceRecords = await db.attendanceRecord.findMany({
      where: whereCondition,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
            department: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    res.json({
      success: true,
      data: attendanceRecords,
      count: attendanceRecords.length
    });
  } catch (error) {
    logger.error('Error fetching attendance records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance records'
    });
  }
});

// GET /attendance/records/:employeeId
router.get('/records/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { organizationId, startDate, endDate, limit } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let whereCondition: any = {
      organizationId: organizationId as string,
      employeeId
    };

    if (startDate && endDate) {
      whereCondition.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const attendanceRecords = await db.attendanceRecord.findMany({
      where: whereCondition,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
            department: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: limit ? parseInt(limit as string) : undefined
    });

    res.json({
      success: true,
      data: attendanceRecords,
      count: attendanceRecords.length
    });
  } catch (error) {
    logger.error('Error fetching employee attendance records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee attendance records'
    });
  }
});

// Additional attendance routes for comprehensive tracking

// GET /attendance/today - Get today's attendance for an employee
router.get('/today', async (req: Request, res: Response) => {
  try {
    const { organizationId, employeeId } = req.query;
    
    if (!organizationId || !employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and Employee ID are required'
      });
    }

    const today = new Date();
    const date = new Date(today.toDateString());

    const attendanceRecord = await db.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: organizationId as string,
          employeeId: employeeId as string,
          date
        }
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    res.json({
      success: true,
      data: attendanceRecord,
      date: date.toISOString()
    });
  } catch (error) {
    logger.error('Error fetching today\'s attendance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch today\'s attendance'
    });
  }
});

// PUT /attendance/:id/manual-edit - Manual attendance editing by admin
router.put('/:id/manual-edit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkInTime, checkOutTime, breakStartTime, breakEndTime, notes, adminNotes } = req.body;

    const existingRecord = await db.attendanceRecord.findUnique({
      where: { id }
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }

    // Calculate hours worked if both times are provided
    let hoursWorked;
    if (checkInTime && checkOutTime) {
      const checkIn = new Date(checkInTime);
      const checkOut = new Date(checkOutTime);
      hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    }

    // Calculate break duration if both times are provided
    let breakDuration;
    if (breakStartTime && breakEndTime) {
      const breakStart = new Date(breakStartTime);
      const breakEnd = new Date(breakEndTime);
      breakDuration = Math.round((breakEnd.getTime() - breakStart.getTime()) / (1000 * 60));
    }

    const updatedRecord = await db.attendanceRecord.update({
      where: { id },
      data: {
        ...(checkInTime && { checkInTime: new Date(checkInTime) }),
        ...(checkOutTime && { checkOutTime: new Date(checkOutTime) }),
        ...(breakStartTime && { breakStartTime: new Date(breakStartTime) }),
        ...(breakEndTime && { breakEndTime: new Date(breakEndTime) }),
        ...(hoursWorked && { hoursWorked }),
        ...(breakDuration && { breakDuration }),
        ...(notes && { notes }),
        ...(adminNotes && { adminNotes })
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
          }
        }
      }
    });

    logger.info(`Attendance record manually edited: ${id}`, {
      employeeId: existingRecord.employeeId,
      changes: req.body
    });

    res.json({
      success: true,
      data: updatedRecord,
      message: 'Attendance record updated successfully'
    });
  } catch (error) {
    logger.error('Error updating attendance record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update attendance record'
    });
  }
});

// DELETE /attendance/:id - Delete attendance record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingRecord = await db.attendanceRecord.findUnique({
      where: { id }
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }

    await db.attendanceRecord.delete({
      where: { id }
    });

    logger.info(`Attendance record deleted: ${id}`, {
      employeeId: existingRecord.employeeId,
      date: existingRecord.date
    });

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting attendance record:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete attendance record'
    });
  }
});

// GET /attendance/range/:from/:to - Get attendance records for date range
router.get('/range/:from/:to', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.params;
    const { organizationId, employeeId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let whereCondition: any = {
      organizationId: organizationId as string,
      date: {
        gte: new Date(from),
        lte: new Date(to)
      }
    };

    if (employeeId) {
      whereCondition.employeeId = employeeId as string;
    }

    const attendanceRecords = await db.attendanceRecord.findMany({
      where: whereCondition,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
            department: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Calculate summary statistics
    const totalHours = attendanceRecords.reduce((sum, record) => {
      return sum + (record.hoursWorked ? parseFloat(record.hoursWorked.toString()) : 0);
    }, 0);

    const totalBreakTime = attendanceRecords.reduce((sum, record) => {
      return sum + (record.breakDuration || 0);
    }, 0);

    res.json({
      success: true,
      data: attendanceRecords,
      count: attendanceRecords.length,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        totalBreakTime: totalBreakTime,
        averageHoursPerDay: attendanceRecords.length > 0 ? Math.round((totalHours / attendanceRecords.length) * 100) / 100 : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching attendance range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance records'
    });
  }
});

export default router;