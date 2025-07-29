import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authRateLimiter } from '@/middleware/rateLimiter.middleware';
import { authenticateToken } from '@/middleware/auth.middleware';
import { auditLogin, auditLogout } from '@/middleware/audit.middleware';
import {
  registerOrganization,
  authenticateUser,
  generateTokens,
  refreshAccessToken,
  validateEmail,
  validatePassword,
  validateOrgCode
} from '@/utils/auth';
import logger from '@/utils/logger';

const router = Router();

// Apply stricter rate limiting to auth routes
router.use(authRateLimiter);

// @route   POST /api/v1/auth/register
// @desc    Register a new organization and admin user
// @access  Public
router.post('/register', [
  body('businessName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('orgCode')
    .trim()
    .custom((value) => {
      if (!validateOrgCode(value)) {
        throw new Error('Organization code must be 6-12 alphanumeric characters');
      }
      return true;
    }),
  body('email')
    .isEmail()
    .normalizeEmail()
    .custom((value) => {
      if (!validateEmail(value)) {
        throw new Error('Invalid email format');
      }
      return true;
    }),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('password')
    .custom((value) => {
      const validation = validatePassword(value);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return true;
    }),
  body('domain')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Domain must be less than 100 characters'),
  body('timezone')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Timezone must be less than 50 characters')
], async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      businessName,
      orgCode,
      email,
      firstName,
      lastName,
      password,
      domain,
      timezone
    } = req.body;

    // Register organization and admin user
    const result = await registerOrganization({
      businessName,
      orgCode: orgCode.toUpperCase(),
      email,
      firstName,
      lastName,
      password,
      domain,
      timezone
    });

    // Log the registration
    logger.info(`New organization registered: ${orgCode} with admin user: ${email}`);

    return res.status(201).json({
      success: true,
      message: 'Organization and admin user created successfully',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          organization: result.user.organization
        },
        tokens: result.tokens
      }
    });
  } catch (error: any) {
    logger.error('Registration failed:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Registration failed'
    });
  }
});

// @route   POST /api/v1/auth/login
// @desc    Authenticate user and return JWT
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
], auditLogin, async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Authenticate user
    const user = await authenticateUser(email, password);
    
    // Generate tokens
    const tokens = generateTokens(user);

    // Log successful login
    logger.info(`User logged in: ${email} for organization: ${user.organization.orgCode}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organization: user.organization
        },
        tokens
      }
    });
  } catch (error: any) {
    logger.error('Login failed:', error);
    return res.status(401).json({
      success: false,
      error: error.message || 'Login failed'
    });
  }
});

// @route   POST /api/v1/auth/refresh
// @desc    Refresh JWT token
// @access  Public
router.post('/refresh', [
  body('refreshToken')
    .isLength({ min: 1 })
    .withMessage('Refresh token is required')
], async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { refreshToken } = req.body;

    // Refresh tokens
    const tokens = await refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: { tokens }
    });
  } catch (error: any) {
    logger.error('Token refresh failed:', error);
    return res.status(401).json({
      success: false,
      error: error.message || 'Token refresh failed'
    });
  }
});

// @route   POST /api/v1/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, auditLogout, async (req: Request, res: Response): Promise<Response> => {
  try {
    // In a real implementation, you might want to blacklist the token
    // For now, we'll just log the logout event
    
    logger.info(`User logged out: ${req.user?.email} for organization: ${req.organization?.orgCode}`);

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
      data: null
    });
  } catch (error: any) {
    logger.error('Logout failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// @route   GET /api/v1/auth/me
// @desc    Get current user information
// @access  Private
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({
      success: true,
      message: 'User information retrieved successfully',
      data: {
        user: {
          id: req.user?.id,
          email: req.user?.email,
          role: req.user?.role,
          organization: req.organization
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to get user info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// @route   GET /api/v1/auth/google
// @desc    Google OAuth login
// @access  Public
router.get('/google', async (_req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(501).json({
      success: false,
      message: 'Google OAuth integration pending Stack Auth setup',
      data: {
        feature: 'Google OAuth Integration',
        status: 'Pending Stack Auth Configuration',
        phase: 'Phase 1: Core Foundation'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Google OAuth failed'
    });
  }
});

// @route   GET /api/v1/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback', async (_req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(501).json({
      success: false,
      message: 'Google OAuth callback pending Stack Auth setup',
      data: {
        feature: 'Google OAuth Callback',
        status: 'Pending Stack Auth Configuration',
        phase: 'Phase 1: Core Foundation'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Google OAuth callback failed'
    });
  }
});

export default router;