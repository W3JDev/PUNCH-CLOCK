import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '@/utils/database';
import logger from '@/utils/logger';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserWithOrganization {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  organizationId: string;
  organization: {
    id: string;
    businessName: string;
    orgCode: string;
  };
}

/**
 * Generate JWT access and refresh tokens
 */
export const generateTokens = (user: UserWithOrganization): AuthTokens => {
  const accessTokenSecret = process.env.JWT_SECRET;
  const refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
  const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '7d';
  const refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

  if (!accessTokenSecret || !refreshTokenSecret) {
    throw new Error('JWT secrets not configured');
  }

  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId
  };

  const accessToken = jwt.sign(payload, accessTokenSecret as string, {
    expiresIn: accessTokenExpiry
  } as SignOptions);

  const refreshToken = jwt.sign(
    { userId: user.id },
    refreshTokenSecret as string,
    { expiresIn: refreshTokenExpiry } as SignOptions
  );

  // Calculate expiry timestamp
  const decoded = jwt.decode(accessToken) as any;
  const expiresIn = decoded.exp;

  return {
    accessToken,
    refreshToken,
    expiresIn
  };
};

/**
 * Verify refresh token and generate new access token
 */
export const refreshAccessToken = async (refreshToken: string): Promise<AuthTokens> => {
  const refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
  
  if (!refreshTokenSecret) {
    throw new Error('JWT refresh secret not configured');
  }

  try {
    const decoded = jwt.verify(refreshToken, refreshTokenSecret) as { userId: string };
    
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: {
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
            isActive: true
          }
        }
      }
    });

    if (!user || !user.isActive || !user.organization?.isActive) {
      throw new Error('Invalid user or organization');
    }

    return generateTokens(user as UserWithOrganization);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Authenticate user with email and password
 */
export const authenticateUser = async (
  email: string,
  password: string
): Promise<UserWithOrganization> => {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      organization: {
        select: {
          id: true,
          businessName: true,
          orgCode: true,
          isActive: true
        }
      }
    }
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  if (!user.isActive) {
    throw new Error('Account is inactive');
  }

  if (!user.organization || !user.organization.isActive) {
    throw new Error('Organization is inactive');
  }

  if (!user.passwordHash) {
    throw new Error('Password not set for this account');
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return user as UserWithOrganization;
};

/**
 * Register a new organization and admin user
 */
export const registerOrganization = async (data: {
  businessName: string;
  orgCode: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  domain?: string;
  timezone?: string;
}): Promise<{ user: UserWithOrganization; tokens: AuthTokens }> => {
  // Check if organization code already exists
  const existingOrg = await db.organization.findUnique({
    where: { orgCode: data.orgCode }
  });

  if (existingOrg) {
    throw new Error('Organization code already exists');
  }

  // Check if user email already exists
  const existingUser = await db.user.findUnique({
    where: { email: data.email.toLowerCase() }
  });

  if (existingUser) {
    throw new Error('Email address already registered');
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create organization and admin user in a transaction
  const result = await db.$transaction(async (prisma: any) => {
    // Create organization
    const organization = await prisma.organization.create({
      data: {
        businessName: data.businessName,
        orgCode: data.orgCode,
        domain: data.domain,
        timezone: data.timezone || 'UTC',
        email: data.email,
        isActive: true,
        isPremium: false,
        settings: {},
        branding: {},
        features: {}
      }
    });

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        emailVerified: true, // Auto-verify for now
        organizationId: organization.id,
        role: 'ORG_ADMIN',
        isActive: true,
        permissions: []
      },
      include: {
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true
          }
        }
      }
    });

    return { user, organization };
  });

  const userWithOrg = result.user as UserWithOrganization;
  const tokens = generateTokens(userWithOrg);

  logger.info(`New organization registered: ${data.orgCode} with admin user: ${data.email}`);

  return { user: userWithOrg, tokens };
};

/**
 * Generate a secure random organization code
 */
export const generateOrgCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Validate organization code format
 */
export const validateOrgCode = (orgCode: string): boolean => {
  return /^[A-Z0-9]{6,12}$/.test(orgCode);
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};