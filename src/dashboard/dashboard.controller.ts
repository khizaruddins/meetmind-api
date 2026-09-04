import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@Controller('v1/dashboard')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregated customer dashboard stats, quota, and recent activity' })
  async getDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getCustomerDashboard(user.id);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get rich aggregated overview for customer portal dashboard' })
  async getOverview(@CurrentUser() user: any) {
    return this.dashboardService.getCustomerDashboardOverview(user.id);
  }
}
