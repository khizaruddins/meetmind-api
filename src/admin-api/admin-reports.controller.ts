import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminReportsService } from './admin-reports.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Response } from 'express';

@ApiTags('Admin Reports')
@Controller('v1/admin/reports')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('subscriptions')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get subscriptions report dataset' })
  async getSubscriptions() {
    return { data: await this.adminReportsService.getSubscriptionsReport() };
  }

  @Get('subscriptions/export')
  @RequirePermissions('analytics.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="subscriptions_report.csv"')
  @ApiOperation({ summary: 'Export subscriptions report to CSV' })
  async exportSubscriptions(@Res() res: Response) {
    const data = await this.adminReportsService.getSubscriptionsReport();
    res.send(this.adminReportsService.toCsv(data));
  }

  @Get('revenue')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get revenue and payment report dataset' })
  async getRevenue() {
    return { data: await this.adminReportsService.getRevenueReport() };
  }

  @Get('revenue/export')
  @RequirePermissions('analytics.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="revenue_report.csv"')
  @ApiOperation({ summary: 'Export revenue report to CSV' })
  async exportRevenue(@Res() res: Response) {
    const data = await this.adminReportsService.getRevenueReport();
    res.send(this.adminReportsService.toCsv(data));
  }

  @Get('usage')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get usage report dataset' })
  async getUsage() {
    return { data: await this.adminReportsService.getUsageReport() };
  }

  @Get('usage/export')
  @RequirePermissions('analytics.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="usage_report.csv"')
  @ApiOperation({ summary: 'Export usage report to CSV' })
  async exportUsage(@Res() res: Response) {
    const data = await this.adminReportsService.getUsageReport();
    res.send(this.adminReportsService.toCsv(data));
  }

  @Get('trials')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get trials report dataset' })
  async getTrials() {
    return { data: await this.adminReportsService.getTrialsReport() };
  }

  @Get('trials/export')
  @RequirePermissions('analytics.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="trials_report.csv"')
  @ApiOperation({ summary: 'Export trials report to CSV' })
  async exportTrials(@Res() res: Response) {
    const data = await this.adminReportsService.getTrialsReport();
    res.send(this.adminReportsService.toCsv(data));
  }

  @Get('recordings')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Get recordings report dataset' })
  async getRecordings() {
    return { data: await this.adminReportsService.getRecordingsReport() };
  }

  @Get('recordings/export')
  @RequirePermissions('analytics.read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="recordings_report.csv"')
  @ApiOperation({ summary: 'Export recordings report to CSV' })
  async exportRecordings(@Res() res: Response) {
    const data = await this.adminReportsService.getRecordingsReport();
    res.send(this.adminReportsService.toCsv(data));
  }
}
