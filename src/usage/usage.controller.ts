import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Usage')
@Controller('v1/usage')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('today')
  @ApiOperation({ summary: 'Get current daily recording usage and remaining quota' })
  async getToday(@CurrentUser() user: any) {
    return this.usageService.getTodayUsage(user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get recording usage history (daily, weekly, or monthly)' })
  @ApiQuery({ name: 'aggregation', enum: ['daily', 'weekly', 'monthly'], required: false })
  async getHistory(@CurrentUser() user: any, @Query('aggregation') aggregation?: 'daily' | 'weekly' | 'monthly') {
    return this.usageService.getUsageHistory(user.id, aggregation || 'daily');
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get aggregate recording usage statistics' })
  async getSummary(@CurrentUser() user: any) {
    return this.usageService.getUsageSummary(user.id);
  }
}
