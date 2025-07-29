import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

// Schema for creating an organization
const createOrganizationSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  orgCode: z.string().min(1, 'Organization code is required'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().default('UTC'),
})

export async function GET() {
  if (isBuildTime()) return buildTimeResponse('Organizations API - Build time')
  
  try {
    const organizations = await prisma.organization.findMany({
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
        isPremium: true,
        createdAt: true,
        _count: {
          select: {
            employees: true,
            users: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      success: true,
      data: organizations,
      count: organizations.length
    })
  } catch (error) {
    console.error('Error fetching organizations:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch organizations' 
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Organizations POST - Build time')
  
  try {
    const body = await request.json()
    const validatedData = createOrganizationSchema.parse(body)

    // Check if organization code already exists
    const existingOrg = await prisma.organization.findUnique({
      where: { orgCode: validatedData.orgCode }
    })

    if (existingOrg) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Organization code already exists' 
        }, 
        { status: 400 }
      )
    }

    const organization = await prisma.organization.create({
      data: validatedData,
      select: {
        id: true,
        businessName: true,
        orgCode: true,
        email: true,
        phone: true,
        timezone: true,
        isActive: true,
        createdAt: true,
      }
    })

    return NextResponse.json({
      success: true,
      data: organization,
      message: 'Organization created successfully'
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

    console.error('Error creating organization:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create organization' 
      }, 
      { status: 500 }
    )
  }
}