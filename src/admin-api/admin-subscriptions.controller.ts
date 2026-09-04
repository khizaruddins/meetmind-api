import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('Admin Subscriptions')
@Controller('v1/admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminSubscriptionsController {
  constructor(private readonly adminSubscriptionsService: AdminSubscriptionsService) {}

  @Get('subscriptions')
  @RequirePermissions('subscriptions.read')
  @ApiOperation({ summary: 'List customer subscriptions with plan and status filters' })
  async list(
    @Query() query: PaginationQueryDto,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
  ) {
    return this.adminSubscriptionsService.listSubscriptions({ ...query, plan, status });
  }

  @Get('subscription-metrics')
  @RequirePermissions('subscriptions.read')
  @ApiOperation({ summary: 'Get MRR, ARR, active subscriber counts, churn, and conversion metrics' })
  async metrics() {
    return this.adminSubscriptionsService.getMetrics();
  }

  @Get('subscriptions/:id')
  @RequirePermissions('subscriptions.read')
  @ApiOperation({ summary: 'Get detailed subscription info with audit history' })
  async get(@Param('id') id: string) {
    return this.adminSubscriptionsService.getSubscription(id);
  }

  @Post('subscriptions')
  @RequirePermissions('subscriptions.write')
  @ApiOperation({ summary: 'Manually create or assign a subscription to a user' })
  async create(
    @Body() data: { userId: string; planCode: string },
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.createSubscription(data, admin.id);
  }

  @Patch('subscriptions/:id')
  @RequirePermissions('subscriptions.write')
  @ApiOperation({ summary: 'Update subscription properties' })
  async update(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.updateSubscription(id, data, admin.id);
  }

  @Post('subscriptions/:id/change-plan')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.change_plan')
  @ApiOperation({ summary: 'Admin override subscription plan' })
  async changePlan(
    @Param('id') id: string,
    @Body() body: { targetPlan?: string; planCode?: string; reason?: string },
    @CurrentAdmin() admin: any,
  ) {
    const targetPlan = body.targetPlan || body.planCode;
    return this.adminSubscriptionsService.changePlan(id, targetPlan!, body.reason, admin.id);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.cancel')
  @ApiOperation({ summary: 'Cancel customer subscription immediately' })
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.cancelSubscription(id, reason, admin.id);
  }

  @Post('subscriptions/:id/resume')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.resume')
  @ApiOperation({ summary: 'Resume customer subscription' })
  async resume(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.resumeSubscription(id, reason, admin.id);
  }

  @Post('subscriptions/:id/extend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.extend')
  @ApiOperation({ summary: 'Extend active subscription period by days' })
  async extend(
    @Param('id') id: string,
    @Body('days') days: number,
    @Body('reason') reason: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.extendSubscription(id, days, reason, admin.id);
  }

  @Patch('subscriptions/:id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.override_status')
  @ApiOperation({ summary: 'Update subscription status with reason' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reason') reason: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.overrideStatus(id, status, reason, admin.id);
  }

  @Post('subscriptions/:id/override-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('subscriptions.override_status')
  @ApiOperation({ summary: 'Force override subscription status (backward compatible alias)' })
  async overrideStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reason') reason: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminSubscriptionsService.overrideStatus(id, status, reason, admin.id);
  }
}
