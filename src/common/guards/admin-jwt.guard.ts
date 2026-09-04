import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Admin Authorization header');
    }

    const token = authHeader.substring(7);
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-meeting-recorder-saas-2026',
      });

      if (payload.type !== 'admin') {
        throw new UnauthorizedException('Invalid admin token type');
      }

      const admin = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
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
        throw new UnauthorizedException('Admin account is disabled or does not exist');
      }

      // Collect permissions and roles
      const roles: string[] = [];
      const permissions: Set<string> = new Set();

      for (const ur of admin.adminUserRoles) {
        roles.push(ur.role.name);
        for (const rp of ur.role.rolePermissions) {
          permissions.add(rp.permission.key);
        }
      }

      req.admin = {
        ...admin,
        roles,
        permissions: Array.from(permissions),
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin access token');
    }
  }
}
