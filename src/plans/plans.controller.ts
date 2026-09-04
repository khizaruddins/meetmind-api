import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';

@ApiTags('Plans')
@Controller('v1/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'List all active customer plans with pricing and features' })
  async list() {
    return this.plansService.listCustomerPlans();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get details of a specific plan by code (TRIAL, SILVER, GOLD)' })
  async getByCode(@Param('code') code: string) {
    return this.plansService.getCustomerPlanByCode(code);
  }
}
