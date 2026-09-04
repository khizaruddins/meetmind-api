import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface RecordAuditLogParams {
  actorType: 'ADMIN' | 'USER' | 'SYSTEM';
  actorId: string;
  action: string;
  entityType: 'USER' | 'SUBSCRIPTION' | 'PLAN' | 'TRIAL' | 'INVOICE' | 'SYSTEM';
  entityId?: string;
  metadataJson?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: RecordAuditLogParams) {
    try {
      const entry = await this.prisma.auditLog.create({
        data: {
          actorType: params.actorType,
          actorId: params.actorId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadataJson: params.metadataJson || {},
          ipAddress: params.ipAddress,
        },
      });
      this.logger.log(
        `[AUDIT] ${params.actorType}:${params.actorId} -> ${params.action} on ${params.entityType}:${params.entityId || 'none'}`,
      );
      return entry;
    } catch (err: any) {
      this.logger.error(`Failed to write audit log: ${err.message}`, err.stack);
    }
  }
}
