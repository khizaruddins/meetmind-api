import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(
    query: PaginationQueryDto & {
      actorId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(items, total, page, limit);
  }

  async getAuditLog(id: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException({ code: 'AUDIT_LOG_NOT_FOUND', message: 'Audit log entry not found' });
    return log;
  }
}
