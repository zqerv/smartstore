import { UserRole } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../lib/logger';
import bcrypt from 'bcryptjs';
import { db as prisma } from './_db';
const SALT_ROUNDS = 12;

interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
}

/**
 * UserService - Handles user operations
 */
export class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        storeId: true,
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    input: UserUpdateInput
  ) {
    const data = {
      firstName: input.firstName || null,
      lastName: input.lastName || null,
      phone: input.phone || null,
      avatar: input.avatar || null,
    };
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    logger.info(`User profile updated: ${userId}`);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role,
    };
  }

  /**
   * Request phone verification
   */
  async requestPhoneVerification(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) {
      throw new AppError('Phone number not set', 400);
    }

    // TODO: Send SMS with OTP code
    logger.info(`Phone verification requested for: ${user.phone}`);

    return { success: true };
  }

  /**
   * Update user password
   */
  async updateUserPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new AppError('User not found or no password set', 404);
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from current password', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const data = { password: passwordHash };

    await prisma.user.update({
      where: { id: userId },
      data,
    });

    logger.info(`Password updated for user: ${userId}`);
    return { success: true };
  }

  /**
   * Get users by store
   */
  async getUsersByStore(storeId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { storeId },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where: { storeId } }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        isEmailVerified: false,
        isPhoneVerified: false,
      },
    });

    logger.warn(`User deactivated: ${userId}`);
    return { success: true };
  }

  /**
   * Reactivate user
   */
  async reactivateUser(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    logger.info(`User reactivated: ${userId}`);
    return { success: true };
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }
}

export const userService = new UserService();