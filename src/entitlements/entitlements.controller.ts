import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntitlementsService } from './entitlements.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Entitlements')
@Controller('v1/me/entitlements')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current customer entitlements, limits, and signed offline license' })
  async getEntitlements(@CurrentUser() user: any) {
    return this.entitlementsService.getEntitlements(user.id);
  }
}
