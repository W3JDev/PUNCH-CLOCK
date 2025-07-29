import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

// Schema for updating an organization
const updateOrganizationSchema = z.object({
  businessName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Organization details - Build time')
  
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            employees: true,
            users: true,
            departments: true,
            attendanceRecords: true,
          }
        }
      }
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

    return NextResponse.json({
      success: true,
      data: organization
    })
  } catch (error) {
    console.error('Error fetching organization:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch organization' 
      }, 
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Organization update - Build time')
  
  try {
    const body = await request.json()
    const validatedData = updateOrganizationSchema.parse(body)

    const organization = await prisma.organization.update({
      where: { id: params.id },
      data: validatedData,
      select: {
        id: true,
        businessName: true,
        orgCode: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        timezone: true,
        isActive: true,
        updatedAt: true,
      }
    })

    return NextResponse.json({
      success: true,
      data: organization,
      message: 'Organization updated successfully'
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

    console.error('Error updating organization:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update organization' 
      }, 
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isBuildTime()) return buildTimeResponse('Organization delete - Build time')
  
  try {
    await prisma.organization.delete({
      where: { id: params.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete organization' 
      }, 
      { status: 500 }
    )
  }
}