import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Admin Analytics')
@Controller('v1/admin/analytics')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('users')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get user acquisition trends' })
  @ApiQuery({ name: 'range', enum: ['day', 'week', 'month'], required: false })
  async getUsers(@Query('range') range?: 'day' | 'week' | 'month') {
    return this.adminAnalyticsService.getUserGrowthAnalytics(range || 'month');
  }

  @Get('subscriptions')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get subscription distribution by plan and status' })
  async getSubscriptions() {
    return this.adminAnalyticsService.getSubscriptionAnalytics();
  }

  @Get('recordings')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get aggregate recording volume and duration metrics' })
  async getRecordings() {
    return this.adminAnalyticsService.getRecordingAnalytics();
  }

  @Get('revenue')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get total and monthly revenue breakdown' })
  async getRevenue() {
    return this.adminAnalyticsService.getRevenueAnalytics();
  }

  @Get('conversion')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get trial to paid conversion metrics' })
  async getConversion() {
    return this.adminAnalyticsService.getConversionAnalytics();
  }

  @Get('platforms')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get meeting platform and OS breakdown' })
  async getPlatforms() {
    return this.adminAnalyticsService.getPlatformAnalytics();
  }
}
