import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

// Schema for creating attendance record
const createAttendanceSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  action: z.enum(['check_in', 'check_out', 'break_start', 'break_end']),
  timestamp: z.string().optional(),
  location: z.string().optional(),
  method: z.enum(['PIN', 'QR_CODE', 'FACE_ID', 'MANUAL', 'MOBILE_APP', 'WEB_BROWSER']).default('WEB_BROWSER'),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Attendance API - Build time')
  
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    if (!organizationId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Organization ID is required' 
        }, 
        { status: 400 }
      )
    }

    let whereCondition: any = {
      organizationId
    }

    if (employeeId) {
      whereCondition.employeeId = employeeId
    }

    if (date) {
      whereCondition.date = new Date(date)
    } else if (startDate && endDate) {
      whereCondition.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }

    const attendanceRecords = await prisma.attendanceRecord.findMany({
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
    })

    return NextResponse.json({
      success: true,
      data: attendanceRecords,
      count: attendanceRecords.length
    })
  } catch (error) {
    console.error('Error fetching attendance records:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch attendance records' 
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Attendance POST - Build time')
  
  try {
    const body = await request.json()
    const validatedData = createAttendanceSchema.parse(body)
    const timestamp = validatedData.timestamp ? new Date(validatedData.timestamp) : new Date()
    const date = new Date(timestamp.toDateString())

    // Find or create attendance record for today
    let attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        organizationId_employeeId_date: {
          organizationId: validatedData.organizationId,
          employeeId: validatedData.employeeId,
          date
        }
      }
    })

    if (!attendanceRecord) {
      attendanceRecord = await prisma.attendanceRecord.create({
        data: {
          organizationId: validatedData.organizationId,
          employeeId: validatedData.employeeId,
          date,
          status: 'PRESENT'
        }
      })
    }

    // Update based on action
    let updateData: any = {}

    switch (validatedData.action) {
      case 'check_in':
        updateData = {
          checkInTime: timestamp,
          checkInMethod: validatedData.method,
          checkInLocation: validatedData.location,
          status: 'PRESENT'
        }
        break
      case 'check_out':
        updateData = {
          checkOutTime: timestamp,
          checkOutMethod: validatedData.method,
          checkOutLocation: validatedData.location
        }
        
        // Calculate hours worked if both check-in and check-out exist
        if (attendanceRecord.checkInTime) {
          const hoursWorked = (timestamp.getTime() - attendanceRecord.checkInTime.getTime()) / (1000 * 60 * 60)
          updateData.hoursWorked = hoursWorked
        }
        break
      case 'break_start':
        updateData = { breakStartTime: timestamp }
        break
      case 'break_end':
        updateData = { breakEndTime: timestamp }
        
        // Calculate break duration if both break start and end exist
        if (attendanceRecord.breakStartTime) {
          const breakDuration = (timestamp.getTime() - attendanceRecord.breakStartTime.getTime()) / (1000 * 60)
          updateData.breakDuration = Math.round(breakDuration)
        }
        break
    }

    if (validatedData.notes) {
      updateData.notes = validatedData.notes
    }

    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: attendanceRecord.id },
      data: updateData,
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
    })

    return NextResponse.json({
      success: true,
      data: updatedRecord,
      message: `${validatedData.action.replace('_', ' ')} recorded successfully`
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation error',
          details: error.errors
        }, 
        { status: 400 }
      )
    }

    console.error('Error recording attendance:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to record attendance' 
      }, 
      { status: 500 }
    )
  }
}