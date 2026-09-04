import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminTrialsService, ExtendTrialDto } from './admin-trials.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';

@ApiTags('Admin Trial Management')
@Controller('v1/admin/users/:id/trial')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminTrialsController {
  constructor(private readonly adminTrialsService: AdminTrialsService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get trial status and days remaining for customer' })
  async getTrial(@Param('id') userId: string) {
    return this.adminTrialsService.getUserTrial(userId);
  }

  @Post('start')
  @RequirePermissions('trial.extend')
  @ApiOperation({ summary: 'Manually start or restart a 30-day trial' })
  async startTrial(
    @Param('id') userId: string,
    @Body('days') days: number,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminTrialsService.startTrial(userId, admin.id, days || 30);
  }

  @Post('extend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trial.extend')
  @ApiOperation({ summary: 'Extend trial by specified number of days (with audit log)' })
  async extendTrial(
    @Param('id') userId: string,
    @Body() dto: ExtendTrialDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminTrialsService.extendTrial(userId, dto, admin.id);
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trial.extend')
  @ApiOperation({ summary: 'Immediately expire user trial' })
  async endTrial(@Param('id') userId: string, @CurrentAdmin() admin: any) {
    return this.adminTrialsService.endTrial(userId, admin.id);
  }

  @Post('reset-daily-usage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('trial.extend')
  @ApiOperation({ summary: 'Reset customer daily recording quota usage to 0' })
  async resetDailyUsage(@Param('id') userId: string, @CurrentAdmin() admin: any) {
    return this.adminTrialsService.resetDailyUsage(userId, admin.id);
  }
}
