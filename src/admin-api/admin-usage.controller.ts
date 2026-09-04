import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUsageService } from './admin-usage.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Admin Usage & Recordings')
@Controller('v1/admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminUsageController {
  constructor(private readonly adminUsageService: AdminUsageService) {}

  @Get('usage')
  @RequirePermissions('usage.read')
  @ApiOperation({ summary: 'Get overall recording usage breakdown and KPIs' })
  async getUsage() {
    return this.adminUsageService.getUsageSummary();
  }

  @Get('usage/summary')
  @RequirePermissions('usage.read')
  @ApiOperation({ summary: 'Get recording usage summary metrics' })
  async getSummary() {
    return this.adminUsageService.getUsageSummary();
  }

  @Get('usage/daily')
  @RequirePermissions('usage.read')
  @ApiOperation({ summary: 'Get day-by-day recording usage trends' })
  async getDaily(@Query('days') days?: number) {
    return this.adminUsageService.getDailyUsageTrend(days ? Number(days) : 30);
  }

  @Get('usage/monthly')
  @RequirePermissions('usage.read')
  @ApiOperation({ summary: 'Get month-by-month recording usage trends' })
  async getMonthly() {
    return this.adminUsageService.getMonthlyUsageTrend();
  }

  @Get('recordings')
  @RequirePermissions('recordings.read')
  @ApiOperation({ summary: 'List and filter all customer recording metadata' })
  async listRecordings(@Query() query: any) {
    return this.adminUsageService.listRecordings(query);
  }

  @Get('recordings/:id')
  @RequirePermissions('recordings.read')
  @ApiOperation({ summary: 'Get recording session metadata details' })
  async getRecording(@Param('id') id: string) {
    return this.adminUsageService.getRecording(id);
  }
}
