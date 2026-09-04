import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Argon2Service } from '../common/argon2.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminCreateNoteDto,
  AdminResetPasswordDto,
  AdminUpdateNoteDto,
  CreateUserAdminDto,
  FilterUsersDto,
  UpdateUserAdminDto,
} from './dto/admin-user-ops.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Service,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(filter: FilterUsersDto) {
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filter.search) {
      where.OR = [
        { email: { contains: filter.search, mode: 'insensitive' } },
        { displayName: { contains: filter.search, mode: 'insensitive' } },
        { firstName: { contains: filter.search, mode: 'insensitive' } },
        { lastName: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.email) {
      where.email = { contains: filter.email, mode: 'insensitive' };
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.plan) {
      where.subscriptions = {
        some: {
          plan: { code: filter.plan.toUpperCase() },
          status: 'ACTIVE',
        },
      };
    }

    if (filter.subscriptionStatus) {
      where.subscriptions = {
        some: { status: filter.subscriptionStatus },
      };
    }

    if (filter.trialStatus) {
      where.trial = { status: filter.trialStatus };
    }

    if (filter.platform) {
      where.devices = {
        some: { platform: { contains: filter.platform, mode: 'insensitive' } },
      };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (filter.sort === 'oldest') orderBy = { createdAt: 'asc' };
    if (filter.sort === 'name_asc') orderBy = { displayName: 'asc' };
    if (filter.sort === 'name_desc') orderBy = { displayName: 'desc' };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          trial: true,
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          devices: {
            where: { status: 'ACTIVE' },
            take: 1,
            orderBy: { lastSeenAt: 'desc' },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return paginate(
      users.map((u) => {
        const activeSub = u.subscriptions[0];
        const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');
        const planCode = isPaid ? activeSub.plan.code : 'TRIAL';
        const subStatus = isPaid ? activeSub.status : u.trial?.status === 'ACTIVE' ? 'TRIAL' : 'EXPIRED';

        return {
          id: u.id,
          email: u.email,
          displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          emailVerified: u.emailVerified,
          status: u.status,
          plan: planCode,
          subscriptionStatus: subStatus,
          trialExpiresAt: u.trial?.expiresAt,
          lastSeenDevice: u.devices[0]?.deviceName,
          lastSeenPlatform: u.devices[0]?.platform,
          createdAt: u.createdAt,
        };
      }),
      total,
      page,
      limit,
    );
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        trial: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        devices: { orderBy: { lastSeenAt: 'desc' } },
        dailyUsages: { orderBy: { usageDate: 'desc' }, take: 14 },
      },
    });

    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  async createUser(dto: CreateUserAdminDto, adminId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (existing) throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'User with email already exists' });

    const passwordHash = await this.argon2.hash(dto.password);
    const planCode = (dto.planCode || 'TRIAL').toUpperCase();
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: `${dto.firstName || ''} ${dto.lastName || ''}`.trim() || dto.email.split('@')[0],
        emailVerified: true,
        status: 'ACTIVE',
        profile: { create: { timezone: 'UTC', language: 'en' } },
        trial: {
          create: { startedAt: now, expiresAt, status: 'ACTIVE' },
        },
        subscriptions: plan
          ? {
              create: {
                planId: plan.id,
                status: plan.code === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: expiresAt,
              },
            }
          : undefined,
      },
      include: { profile: true, trial: true, subscriptions: { include: { plan: true } } },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.create',
      entityType: 'USER',
      entityId: user.id,
      metadataJson: { email: user.email, plan: planCode },
    });

    const { passwordHash: _, ...sanitized } = user;
    return sanitized;
  }

  async updateUser(id: string, dto: UpdateUserAdminDto, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email?.toLowerCase().trim(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        status: dto.status,
      },
      include: { profile: true },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.update',
      entityType: 'USER',
      entityId: id,
      metadataJson: dto as any,
    });

    const { passwordHash: _, ...sanitized } = updated;
    return sanitized;
  }

  async deleteUser(id: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    await this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED', deletedAt: new Date() },
    });

    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.delete',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'User disabled and soft-deleted' };
  }

  async disableUser(id: string, adminId: string) {
    await this.prisma.user.update({ where: { id }, data: { status: 'DISABLED' } });
    await this.prisma.session.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.disable',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'User disabled' };
  }

  async enableUser(id: string, adminId: string) {
    await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', deletedAt: null } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.enable',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'User enabled' };
  }

  async verifyEmail(id: string, adminId: string) {
    await this.prisma.user.update({ where: { id }, data: { emailVerified: true } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.verify_email',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'Email verified' };
  }

  async resetPassword(id: string, dto: AdminResetPasswordDto, adminId: string) {
    const passwordHash = await this.argon2.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.session.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.reset_password',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'Password reset and sessions terminated' };
  }

  async logoutAll(id: string, adminId: string) {
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.user.logout_all',
      entityType: 'USER',
      entityId: id,
    });

    return { success: true, message: 'All sessions logged out' };
  }

  async getUserSessions(id: string) {
    const sessions = await this.prisma.session.findMany({ where: { userId: id }, orderBy: { lastActivityAt: 'desc' } });
    return { sessions };
  }

  async getUserDevices(id: string) {
    const devices = await this.prisma.device.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' } });
    return { devices };
  }

  async getUserRecordings(id: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, recordings] = await Promise.all([
      this.prisma.recordingSession.count({ where: { userId: id } }),
      this.prisma.recordingSession.findMany({
        where: { userId: id },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return paginate(recordings, total, page, limit);
  }

  async getUserUsage(id: string) {
    const dailyUsages = await this.prisma.dailyUsage.findMany({
      where: { userId: id },
      orderBy: { usageDate: 'desc' },
    });
    const totalSeconds = dailyUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const totalCount = dailyUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    return {
      totalRecordingSeconds: totalSeconds,
      totalRecordingMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      totalRecordings: totalCount,
      daily: dailyUsages,
    };
  }

  async getUserBilling(id: string) {
    const [subscriptions, invoices, payments] = await Promise.all([
      this.prisma.subscription.findMany({ where: { userId: id }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.invoice.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { subscriptions, invoices, payments };
  }

  // Section 35: Timeline
  async getUserTimeline(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        trial: true,
        subscriptions: { include: { plan: true, histories: true } },
        recordingSessions: { take: 10, orderBy: { startedAt: 'desc' } },
        payments: { take: 10, orderBy: { createdAt: 'desc' } },
        devices: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entityType: 'USER', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const events: Array<{ type: string; title: string; date: Date; metadata?: any }> = [];

    events.push({ type: 'ACCOUNT_CREATED', title: 'Account created', date: user.createdAt });
    if (user.emailVerified) {
      events.push({ type: 'EMAIL_VERIFIED', title: 'Email address verified', date: user.updatedAt });
    }

    if (user.trial) {
      events.push({ type: 'TRIAL_STARTED', title: '30-day Trial started', date: user.trial.startedAt });
      if (user.trial.extendedDays > 0) {
        events.push({
          type: 'TRIAL_EXTENDED',
          title: `Trial extended by ${user.trial.extendedDays} days`,
          date: user.trial.updatedAt,
        });
      }
    }

    for (const sub of user.subscriptions) {
      events.push({
        type: 'SUBSCRIPTION_STARTED',
        title: `Subscribed to ${sub.plan.name}`,
        date: sub.createdAt,
      });
      if (sub.cancelledAt) {
        events.push({
          type: 'SUBSCRIPTION_CANCELLED',
          title: `Subscription to ${sub.plan.name} cancelled`,
          date: sub.cancelledAt,
        });
      }
    }

    for (const pay of user.payments) {
      events.push({
        type: pay.status === 'SUCCEEDED' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
        title: `Payment of $${(pay.amount / 100).toFixed(2)} ${pay.status.toLowerCase()}`,
        date: pay.createdAt,
      });
    }

    for (const d of user.devices) {
      events.push({
        type: 'DEVICE_REGISTERED',
        title: `Device registered: ${d.deviceName} (${d.platform})`,
        date: d.createdAt,
      });
    }

    for (const r of user.recordingSessions) {
      events.push({
        type: 'RECORDING_SESSION',
        title: `Recorded ${r.meetingTitle || 'Meeting'} (${Math.round(r.durationSeconds / 60)} min)`,
        date: r.startedAt,
      });
    }

    for (const a of auditLogs) {
      events.push({
        type: 'ADMIN_ACTION',
        title: `Admin action: ${a.action}`,
        date: a.createdAt,
        metadata: a.metadataJson,
      });
    }

    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return { timeline: events };
  }

  // Section 63: 360-degree Customer Overview
  async getUserOverview(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        trial: true,
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        devices: { orderBy: { lastSeenAt: 'desc' }, take: 5 },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { lastActivityAt: 'desc' },
          take: 10,
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        recordingSessions: { orderBy: { startedAt: 'desc' }, take: 5 },
        adminNotes: { include: { adminUser: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    const [todayUsage, monthlyUsages, totalStats] = await Promise.all([
      this.prisma.dailyUsage.findUnique({ where: { userId_usageDate: { userId: id, usageDate: todayStr } } }),
      this.prisma.dailyUsage.findMany({
        where: { userId: id, usageDate: { startsWith: currentMonthStr } },
      }),
      this.prisma.recordingSession.aggregate({
        where: { userId: id },
        _count: { id: true },
        _sum: { durationSeconds: true },
        _avg: { durationSeconds: true },
      }),
    ]);

    const activeSub = user.subscriptions[0];
    const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    const timeline = await this.getUserTimeline(id);

    return {
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        status: user.status,
        timezone: user.profile?.timezone,
        country: user.profile?.country,
        language: user.profile?.language,
        createdAt: user.createdAt,
      },
      currentPlan: isPaid ? activeSub.plan.code : 'TRIAL',
      subscription: activeSub
        ? {
            id: activeSub.id,
            planName: activeSub.plan.name,
            status: activeSub.status,
            currentPeriodStart: activeSub.currentPeriodStart,
            currentPeriodEnd: activeSub.currentPeriodEnd,
            cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
          }
        : null,
      trial: user.trial,
      usageToday: {
        recordingSeconds: todayUsage?.recordingSeconds || 0,
        recordingMinutes: Math.round(((todayUsage?.recordingSeconds || 0) / 60) * 10) / 10,
        recordingCount: todayUsage?.recordingCount || 0,
      },
      usageThisMonth: {
        recordingSeconds: monthlyUsages.reduce((acc, u) => acc + u.recordingSeconds, 0),
        recordingMinutes: Math.round((monthlyUsages.reduce((acc, u) => acc + u.recordingSeconds, 0) / 60) * 10) / 10,
        recordingCount: monthlyUsages.reduce((acc, u) => acc + u.recordingCount, 0),
      },
      recordingStatistics: {
        totalRecordings: totalStats._count.id,
        totalDurationSeconds: totalStats._sum.durationSeconds || 0,
        totalDurationMinutes: Math.round(((totalStats._sum.durationSeconds || 0) / 60) * 10) / 10,
        averageDurationSeconds: Math.round(totalStats._avg.durationSeconds || 0),
      },
      devices: user.devices,
      sessions: user.sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
      })),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt,
        trial: user.trial,
        subscriptions: user.subscriptions,
      },
      billingSummary: {
        totalSpentCents: user.payments
          .filter((p) => p.status === 'SUCCEEDED')
          .reduce((acc, p) => acc + p.amount, 0),
        invoiceCount: user.invoices.length,
      },
      recentInvoices: user.invoices,
      recentPayments: user.payments,
      recentRecordingSessions: user.recordingSessions,
      recordings: user.recordingSessions,
      accountTimeline: timeline.timeline.slice(0, 10),
      adminNotes: user.adminNotes,
    };
  }

  // Section 42: Internal Support Notes
  async listNotes(userId: string) {
    const notes = await this.prisma.adminNote.findMany({
      where: { userId },
      include: { adminUser: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { notes };
  }

  async createNote(userId: string, dto: AdminCreateNoteDto, adminId: string) {
    const note = await this.prisma.adminNote.create({
      data: {
        userId,
        adminUserId: adminId,
        note: dto.note,
      },
      include: { adminUser: { select: { id: true, name: true, email: true } } },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.note.create',
      entityType: 'USER',
      entityId: userId,
      metadataJson: { noteId: note.id },
    });

    return note;
  }

  async updateNote(userId: string, noteId: string, dto: AdminUpdateNoteDto, adminId: string) {
    const note = await this.prisma.adminNote.findFirst({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found' });

    const updated = await this.prisma.adminNote.update({
      where: { id: noteId },
      data: { note: dto.note },
      include: { adminUser: { select: { id: true, name: true, email: true } } },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.note.update',
      entityType: 'USER',
      entityId: userId,
      metadataJson: { noteId },
    });

    return updated;
  }

  async deleteNote(userId: string, noteId: string, adminId: string) {
    const note = await this.prisma.adminNote.findFirst({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found' });

    await this.prisma.adminNote.delete({ where: { id: noteId } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.note.delete',
      entityType: 'USER',
      entityId: userId,
      metadataJson: { noteId },
    });

    return { success: true, message: 'Note deleted' };
  }
}
