import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

// Schema for creating an employee
const createEmployeeSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  position: z.string().optional(),
  departmentId: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']).default('FULL_TIME'),
  hireDate: z.string().optional(),
  salary: z.number().optional(),
  hourlyRate: z.number().optional(),
  currency: z.string().default('USD'),
  pin: z.string().optional(),
})

export async function GET(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Employees API - Build time')
  
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    
    if (!organizationId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Organization ID is required' 
        }, 
        { status: 400 }
      )
    }

    const employees = await prisma.employee.findMany({
      where: { 
        organizationId,
        isActive: true 
      },
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
    })

    return NextResponse.json({
      success: true,
      data: employees,
      count: employees.length
    })
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch employees' 
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Employees POST - Build time')
  
  try {
    const body = await request.json()
    const validatedData = createEmployeeSchema.parse(body)

    // Check if employee ID already exists in the organization
    const existingEmployee = await prisma.employee.findFirst({
      where: { 
        organizationId: validatedData.organizationId,
        employeeId: validatedData.employeeId
      }
    })

    if (existingEmployee) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Employee ID already exists in this organization' 
        }, 
        { status: 400 }
      )
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: validatedData.organizationId }
    })

    if (!organization) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Organization not found' 
        }, 
        { status: 404 }
      )
    }

    // Convert date strings to Date objects if provided
    const employeeData = {
      ...validatedData,
      dateOfBirth: validatedData.dateOfBirth ? new Date(validatedData.dateOfBirth) : undefined,
      hireDate: validatedData.hireDate ? new Date(validatedData.hireDate) : new Date(),
    }

    const employee = await prisma.employee.create({
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
    })

    return NextResponse.json({
      success: true,
      data: employee,
      message: 'Employee created successfully'
    }, { status: 201 })
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

    console.error('Error creating employee:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create employee' 
      }, 
      { status: 500 }
    )
  }
}