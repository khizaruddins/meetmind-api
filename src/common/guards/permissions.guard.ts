import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { admin } = context.switchToHttp().getRequest();
    if (!admin) {
      throw new ForbiddenException('Admin context required');
    }

    // SUPER_ADMIN has full permissions
    if (admin.roles && admin.roles.includes('SUPER_ADMIN')) {
      return true;
    }

    const adminPermissions: string[] = admin.permissions || [];
    const hasAll = requiredPermissions.every((perm) => adminPermissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.filter((p) => !adminPermissions.includes(p)).join(', ')}`,
      );
    }

    return true;
  }
}
