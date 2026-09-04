import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { Argon2Service } from '../common/argon2.service';
import { AuditService } from '../audit/audit.service';
import { AdminLoginDto, AdminRefreshTokenDto } from './dto/admin-auth.dto';

interface FailedAttempt {
  count: number;
  firstAttemptAt: number;
}

@Injectable()
export class AdminAuthService {
  private failedAttempts = new Map<string, FailedAttempt>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2: Argon2Service,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  private checkRateLimit(key: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 mins
    const maxAttempts = 5;

    const record = this.failedAttempts.get(key);
    if (!record) return;

    if (now - record.firstAttemptAt > windowMs) {
      this.failedAttempts.delete(key);
      return;
    }

    if (record.count >= maxAttempts) {
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many failed login attempts. Please try again in 15 minutes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedAttempt(key: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const record = this.failedAttempts.get(key);

    if (!record || now - record.firstAttemptAt > windowMs) {
      this.failedAttempts.set(key, { count: 1, firstAttemptAt: now });
    } else {
      record.count += 1;
    }
  }

  async login(dto: AdminLoginDto, ipAddress?: string) {
    const email = dto.email.toLowerCase().trim();
    const rateLimitKey = `${ipAddress || 'unknown'}:${email}`;
    this.checkRateLimit(rateLimitKey);

    const admin = await this.prisma.adminUser.findUnique({
      where: { email },
      include: {
        adminUserRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!admin || admin.status === 'DISABLED') {
      this.recordFailedAttempt(rateLimitKey);
      await this.auditService.log({
        actorType: 'SYSTEM',
        actorId: admin?.id || 'anonymous',
        action: 'admin.login.failed',
        entityType: 'USER',
        entityId: admin?.id || 'unknown',
        metadataJson: { email, reason: !admin ? 'user_not_found' : 'account_disabled' },
        ipAddress,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isValid = await this.argon2.verify(admin.passwordHash, dto.password);
    if (!isValid) {
      this.recordFailedAttempt(rateLimitKey);
      await this.auditService.log({
        actorType: 'SYSTEM',
        actorId: admin.id,
        action: 'admin.login.failed',
        entityType: 'USER',
        entityId: admin.id,
        metadataJson: { email, reason: 'invalid_password' },
        ipAddress,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    this.failedAttempts.delete(rateLimitKey);

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const roles = admin.adminUserRoles.map((ur) => ur.role.name);
    const permissions = new Set<string>();
    for (const ur of admin.adminUserRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.key);
      }
    }

    const tokens = this.generateAdminTokens(admin.id);

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'admin.login',
      entityType: 'USER',
      entityId: admin.id,
      metadataJson: { roles },
      ipAddress,
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        status: admin.status,
        roles,
        permissions: Array.from(permissions),
      },
      ...tokens,
    };
  }

  async refresh(dto: AdminRefreshTokenDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-meeting-recorder-saas-2026',
      });
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid or expired admin refresh token' });
    }

    if (payload.type !== 'admin_refresh') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token type' });
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
    });

    if (!admin || admin.status === 'DISABLED') {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Admin account disabled' });
    }

    return this.generateAdminTokens(admin.id);
  }

  async logout(adminId: string) {
    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.logout',
      entityType: 'USER',
      entityId: adminId,
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async getMe(admin: any) {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      status: admin.status,
      roles: admin.roles,
      permissions: admin.permissions,
    };
  }

  private generateAdminTokens(adminId: string) {
    const accessToken = this.jwtService.sign(
      { sub: adminId, type: 'admin' },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-meeting-recorder-saas-2026',
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: adminId, type: 'admin_refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-meeting-recorder-saas-2026',
        expiresIn: '7d',
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }
}
