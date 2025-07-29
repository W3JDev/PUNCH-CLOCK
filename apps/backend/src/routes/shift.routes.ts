import { Router, Request, Response } from 'express';
import { db } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

// Schema validation types
interface CreateShiftRequest {
  organizationId: string;
  name: string;
  description?: string;
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  breakDuration?: number; // in minutes
  allowedLateness?: number; // in minutes
  isFlexible?: boolean;
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
}

interface UpdateShiftRequest {
  name?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  breakDuration?: number;
  allowedLateness?: number;
  isFlexible?: boolean;
  daysOfWeek?: number[];
  isActive?: boolean;
}

// Helper function to validate time format (HH:MM)
function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

// GET /shifts - Get all shifts for an organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, isActive } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let whereCondition: any = {
      organizationId: organizationId as string
    };

    if (isActive !== undefined) {
      whereCondition.isActive = isActive === 'true';
    }

    const shifts = await db.shift.findMany({
      where: whereCondition,
      include: {
        assignments: {
          where: { isActive: true },
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
        },
        _count: {
          select: {
            assignments: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({
      success: true,
      data: shifts,
      count: shifts.length
    });
  } catch (error) {
    logger.error('Error fetching shifts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shifts'
    });
  }
});

// POST /shifts - Create new shift
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: CreateShiftRequest = req.body;
    
    // Validate required fields
    if (!body.organizationId || !body.name || !body.startTime || !body.endTime) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, name, start time, and end time are required'
      });
    }

    // Validate time formats
    if (!isValidTimeFormat(body.startTime) || !isValidTimeFormat(body.endTime)) {
      return res.status(400).json({
        success: false,
        error: 'Start time and end time must be in HH:MM format'
      });
    }

    // Check if shift name already exists in the organization
    const existingShift = await db.shift.findFirst({
      where: { 
        organizationId: body.organizationId,
        name: body.name
      }
    });

    if (existingShift) {
      return res.status(400).json({
        success: false,
        error: 'Shift name already exists in this organization'
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

    const shiftData = {
      organizationId: body.organizationId,
      name: body.name,
      description: body.description,
      startTime: body.startTime,
      endTime: body.endTime,
      breakDuration: body.breakDuration || 0,
      allowedLateness: body.allowedLateness || 0,
      isFlexible: body.isFlexible || false,
      daysOfWeek: body.daysOfWeek || [1, 2, 3, 4, 5], // Default to weekdays
    };

    const shift = await db.shift.create({
      data: shiftData,
      include: {
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
          }
        }
      }
    });

    logger.info(`Shift created: ${shift.name}`, {
      organizationId: body.organizationId,
      shiftId: shift.id
    });

    res.status(201).json({
      success: true,
      data: shift,
      message: 'Shift created successfully'
    });
  } catch (error) {
    logger.error('Error creating shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create shift'
    });
  }
});

// GET /shifts/:id - Get shift details
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

    const shift = await db.shift.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      },
      include: {
        assignments: {
          where: { isActive: true },
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
            startDate: 'desc'
          }
        },
        _count: {
          select: {
            assignments: true
          }
        }
      }
    });

    if (!shift) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found'
      });
    }

    res.json({
      success: true,
      data: shift
    });
  } catch (error) {
    logger.error('Error fetching shift details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shift details'
    });
  }
});

// PUT /shifts/:id - Update shift
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body: UpdateShiftRequest = req.body;
    const { organizationId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    // Check if shift exists
    const existingShift = await db.shift.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      }
    });

    if (!existingShift) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found'
      });
    }

    // Validate time formats if provided
    if (body.startTime && !isValidTimeFormat(body.startTime)) {
      return res.status(400).json({
        success: false,
        error: 'Start time must be in HH:MM format'
      });
    }

    if (body.endTime && !isValidTimeFormat(body.endTime)) {
      return res.status(400).json({
        success: false,
        error: 'End time must be in HH:MM format'
      });
    }

    // Check if new name conflicts with existing shifts
    if (body.name && body.name !== existingShift.name) {
      const nameConflict = await db.shift.findFirst({
        where: { 
          organizationId: organizationId as string,
          name: body.name,
          id: { not: id }
        }
      });

      if (nameConflict) {
        return res.status(400).json({
          success: false,
          error: 'Shift name already exists in this organization'
        });
      }
    }

    const updateData: any = {};
    
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.startTime) updateData.startTime = body.startTime;
    if (body.endTime) updateData.endTime = body.endTime;
    if (body.breakDuration !== undefined) updateData.breakDuration = body.breakDuration;
    if (body.allowedLateness !== undefined) updateData.allowedLateness = body.allowedLateness;
    if (body.isFlexible !== undefined) updateData.isFlexible = body.isFlexible;
    if (body.daysOfWeek) updateData.daysOfWeek = body.daysOfWeek;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updatedShift = await db.shift.update({
      where: { id },
      data: updateData,
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        }
      }
    });

    logger.info(`Shift updated: ${updatedShift.name}`, {
      organizationId: organizationId as string,
      shiftId: updatedShift.id,
      changes: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: updatedShift,
      message: 'Shift updated successfully'
    });
  } catch (error) {
    logger.error('Error updating shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update shift'
    });
  }
});

// DELETE /shifts/:id - Delete shift
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const existingShift = await db.shift.findFirst({
      where: { 
        id,
        organizationId: organizationId as string
      }
    });

    if (!existingShift) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found'
      });
    }

    // Check if shift has active assignments
    const activeAssignments = await db.shiftAssignment.count({
      where: { 
        shiftId: id,
        isActive: true
      }
    });

    if (activeAssignments > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete shift with active assignments. Please reassign employees first.'
      });
    }

    await db.shift.delete({ where: { id } });

    logger.info(`Shift deleted: ${existingShift.name}`, {
      organizationId: organizationId as string,
      shiftId: existingShift.id
    });

    res.json({
      success: true,
      message: 'Shift deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete shift'
    });
  }
});

// POST /shifts/:id/assignments - Assign employees to shift
router.post('/:id/assignments', async (req: Request, res: Response) => {
  try {
    const { id: shiftId } = req.params;
    const { organizationId, employeeIds, startDate, endDate } = req.body;
    
    if (!organizationId || !employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and employee IDs array are required'
      });
    }

    // Verify shift exists
    const shift = await db.shift.findFirst({
      where: { 
        id: shiftId,
        organizationId
      }
    });

    if (!shift) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found'
      });
    }

    const assignments = [];
    const errors = [];

    for (const employeeId of employeeIds) {
      try {
        // Check if employee exists
        const employee = await db.employee.findFirst({
          where: { 
            id: employeeId,
            organizationId,
            isActive: true
          }
        });

        if (!employee) {
          errors.push({ employeeId, error: 'Employee not found or inactive' });
          continue;
        }

        // Check for existing active assignment
        const existingAssignment = await db.shiftAssignment.findFirst({
          where: {
            employeeId,
            isActive: true,
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } }
            ]
          }
        });

        if (existingAssignment) {
          // End the existing assignment
          await db.shiftAssignment.update({
            where: { id: existingAssignment.id },
            data: { 
              endDate: startDate ? new Date(startDate) : new Date(),
              isActive: false
            }
          });
        }

        const assignment = await db.shiftAssignment.create({
          data: {
            employeeId,
            shiftId,
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null,
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        });

        assignments.push(assignment);
      } catch (error) {
        errors.push({ employeeId, error: 'Failed to assign shift' });
      }
    }

    logger.info(`Shift assignments created`, {
      organizationId,
      shiftId,
      successful: assignments.length,
      failed: errors.length
    });

    res.json({
      success: true,
      data: { assignments, errors },
      message: `${assignments.length} employees assigned to shift`
    });
  } catch (error) {
    logger.error('Error creating shift assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create shift assignments'
    });
  }
});

export default router;