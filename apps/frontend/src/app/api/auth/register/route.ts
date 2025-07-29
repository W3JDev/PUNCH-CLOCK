import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organizationId: z.string().min(1, 'Organization ID is required'),
  role: z.enum(['ORG_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
})

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Register API - Build time')
  
  try {
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    })

    if (existingUser) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email already registered' 
        }, 
        { status: 400 }
      )
    }

    // Verify organization exists and is active
    const organization = await prisma.organization.findUnique({
      where: { id: validatedData.organizationId }
    })

    if (!organization || !organization.isActive) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid organization' 
        }, 
        { status: 400 }
      )
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12')
    const passwordHash = await bcrypt.hash(validatedData.password, saltRounds)

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        passwordHash,
        role: validatedData.role,
        organizationId: validatedData.organizationId,
        emailVerified: false,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
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
      data: user,
      message: 'User registered successfully'
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

    console.error('Registration error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Registration failed' 
      }, 
      { status: 500 }
    )
  }
}