import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get(['', 'api'])
  @ApiOperation({ summary: 'API root welcome endpoint' })
  async root() {
    return {
      name: 'Meeting Recorder SaaS API',
      version: '1.0.0',
      status: 'HEALTHY',
      docs: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Public general health probe' })
  async health() {
    const db = await this.healthService.checkDatabase();
    return {
      status: db.status === 'HEALTHY' ? 'ok' : 'degraded',
      timestamp: new Date(),
    };
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Kubernetes/balancer liveness probe' })
  async live() {
    return { status: 'alive' };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Kubernetes/balancer readiness probe' })
  async ready() {
    const db = await this.healthService.checkDatabase();
    return {
      ready: db.status === 'HEALTHY',
      database: db.status,
    };
  }

  // Admin Health
  @Get('v1/admin/health')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comprehensive system health matrix' })
  async adminHealth() {
    return this.healthService.getAdminHealthSummary();
  }

  @Get('v1/admin/health/database')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get database connection and latency health' })
  async healthDatabase() {
    return this.healthService.checkDatabase();
  }

  @Get('v1/admin/health/billing')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get billing provider API health' })
  async healthBilling() {
    return this.healthService.checkBilling();
  }

  @Get('v1/admin/health/queue')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get background task and queue health' })
  async healthQueue() {
    return this.healthService.checkQueue();
  }

  @Get('v1/admin/health/jobs')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get background jobs execution health' })
  async healthJobs() {
    return this.healthService.checkJobs();
  }

  @Get('v1/admin/health/webhooks')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get webhook ingestion and delivery health' })
  async healthWebhooks() {
    return this.healthService.checkWebhooks();
  }

  @Get('v1/admin/health/email')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transactional email service health' })
  async healthEmail() {
    return this.healthService.checkEmail();
  }

  @Get('v1/admin/health/storage')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system.health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get storage layer health' })
  async healthStorage() {
    return this.healthService.checkStorage();
  }
}
