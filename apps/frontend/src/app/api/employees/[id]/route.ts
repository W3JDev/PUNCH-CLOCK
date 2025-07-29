import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

// Schema for updating an employee
const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  position: z.string().optional(),
  departmentId: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']).optional(),
  salary: z.number().optional(),
  hourlyRate: z.number().optional(),
  currency: z.string().optional(),
  pin: z.string().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Employee details - Build time')
  
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            description: true,
          }
        },
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
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
          take: 10,
          orderBy: {
            date: 'desc'
          },
          select: {
            id: true,
            date: true,
            checkInTime: true,
            checkOutTime: true,
            status: true,
            hoursWorked: true,
          }
        },
        leaveRequests: {
          take: 5,
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            id: true,
            leaveType: true,
            startDate: true,
            endDate: true,
            status: true,
            reason: true,
          }
        },
        _count: {
          select: {
            attendanceRecords: true,
            leaveRequests: true,
            payrollRecords: true,
          }
        }
      }
    })

    if (!employee) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Employee not found' 
        }, 
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: employee
    })
  } catch (error) {
    console.error('Error fetching employee:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch employee' 
      }, 
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Employee update - Build time')
  
  try {
    const body = await request.json()
    const validatedData = updateEmployeeSchema.parse(body)

    // Convert date strings to Date objects if provided
    const updateData = {
      ...validatedData,
      dateOfBirth: validatedData.dateOfBirth ? new Date(validatedData.dateOfBirth) : undefined,
    }

    const employee = await prisma.employee.update({
      where: { id: params.id },
      data: updateData,
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
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: employee,
      message: 'Employee updated successfully'
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

    console.error('Error updating employee:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update employee' 
      }, 
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Employee delete - Build time')
  
  try {
    // Soft delete - set isActive to false
    await prisma.employee.update({
      where: { id: params.id },
      data: { 
        isActive: false,
        terminationDate: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Employee deactivated successfully'
    })
  } catch (error) {
    console.error('Error deactivating employee:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to deactivate employee' 
      }, 
      { status: 500 }
    )
  }
}