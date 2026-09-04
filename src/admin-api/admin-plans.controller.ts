import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminCreatePlanDto, AdminPlansService, AdminUpdatePlanDto } from './admin-plans.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';

@ApiTags('Admin Plans & Features')
@Controller('v1/admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminPlansController {
  constructor(private readonly adminPlansService: AdminPlansService) {}

  @Get('plans')
  @RequirePermissions('plans.read')
  @ApiOperation({ summary: 'List all plans with subscriber counts and feature matrix' })
  async list() {
    return this.adminPlansService.listPlans();
  }

  @Get('plans/:id')
  @RequirePermissions('plans.read')
  @ApiOperation({ summary: 'Get details of a plan by ID' })
  async get(@Param('id') id: string) {
    return this.adminPlansService.getPlan(id);
  }

  @Post('plans')
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Create a new subscription plan' })
  async create(@Body() dto: AdminCreatePlanDto, @CurrentAdmin() admin: any) {
    return this.adminPlansService.createPlan(dto, admin.id);
  }

  @Patch('plans/:id')
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Update plan properties' })
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePlanDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminPlansService.updatePlan(id, dto, admin.id);
  }

  @Delete('plans/:id')
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Delete a plan (only permitted if no active subscribers)' })
  async delete(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminPlansService.deletePlan(id, admin.id);
  }

  @Post('plans/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Activate a plan' })
  async activate(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminPlansService.activatePlan(id, admin.id);
  }

  @Post('plans/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Deactivate a plan' })
  async deactivate(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminPlansService.deactivatePlan(id, admin.id);
  }

  // Feature Flags
  @Get('features')
  @RequirePermissions('plans.read')
  @ApiOperation({ summary: 'List all configurable feature flags' })
  async listFeatures() {
    return this.adminPlansService.listAllFeatures();
  }

  @Post('features')
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Register a new feature flag' })
  async createFeature(
    @Body('key') key: string,
    @Body('description') description: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminPlansService.createFeature(key, description, admin.id);
  }

  @Get('plans/:id/features')
  @RequirePermissions('plans.read')
  @ApiOperation({ summary: 'Get features enabled for a specific plan' })
  async getPlanFeatures(@Param('id') id: string) {
    const plan = await this.adminPlansService.getPlan(id);
    return { planId: id, features: plan.features };
  }

  @Put('plans/:id/features')
  @RequirePermissions('plans.write')
  @ApiOperation({ summary: 'Replace or update feature flags for a plan' })
  async updatePlanFeatures(
    @Param('id') id: string,
    @Body('features') features: Record<string, boolean>,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminPlansService.updatePlanFeatures(id, features, admin.id);
  }
}
