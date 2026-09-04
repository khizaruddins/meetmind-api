import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Admin Dashboard')
@Controller('v1/admin/dashboard')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get comprehensive executive SaaS dashboard metrics, KPIs, and health' })
  async getDashboard() {
    return this.adminDashboardService.getDashboardSummary();
  }
}
