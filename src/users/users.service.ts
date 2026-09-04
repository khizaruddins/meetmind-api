import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        trial: true,
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const { passwordHash, ...sanitized } = user;
    return {
      user: sanitized,
      profile: sanitized.profile,
      ...sanitized,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName !== undefined ? dto.firstName : undefined,
        lastName: dto.lastName !== undefined ? dto.lastName : undefined,
        displayName: dto.displayName !== undefined ? dto.displayName : undefined,
        profile: {
          upsert: {
            create: {
              timezone: dto.timezone || 'UTC',
              country: dto.country,
              language: dto.language || 'en',
              avatarUrl: dto.avatarUrl,
              preferences: dto.preferences || {},
            },
            update: {
              timezone: dto.timezone || undefined,
              country: dto.country || undefined,
              language: dto.language || undefined,
              avatarUrl: dto.avatarUrl || undefined,
              preferences: dto.preferences || undefined,
            },
          },
        },
      },
      include: { profile: true },
    });

    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  async deleteAccount(userId: string) {
    // Soft delete user to retain billing integrity while disabling account
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DISABLED',
        deletedAt: new Date(),
      },
    });

    // Revoke all sessions
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, message: 'Account deleted successfully' };
  }

  async requestDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'PENDING_DELETION' },
    });
    return { success: true, message: 'Account scheduled for deletion in 30 days' };
  }

  async cancelDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && user.status === 'PENDING_DELETION') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
      return { success: true, message: 'Account deletion request cancelled' };
    }
    throw new BadRequestException({ code: 'NOT_PENDING_DELETION', message: 'Account is not pending deletion' });
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        devices: true,
        subscriptions: { include: { plan: true } },
        trial: true,
        dailyUsages: true,
        recordingSessions: true,
        payments: true,
        invoices: true,
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const { passwordHash, ...sanitized } = user;
    return {
      exportedAt: new Date(),
      user: sanitized,
    };
  }
}
