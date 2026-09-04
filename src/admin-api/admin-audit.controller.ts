import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuditLogService } from './admin-audit.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('Admin Audit Logs')
@Controller('v1/admin/audit-logs')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditLogService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List and filter administrative audit logs' })
  async list(
    @Query() query: PaginationQueryDto,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminAuditService.listAuditLogs({ ...query, actorId, action, entityType, entityId, from, to });
  }

  @Get(':id')
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Get details of a single audit log entry' })
  async get(@Param('id') id: string) {
    return this.adminAuditService.getAuditLog(id);
  }
}
