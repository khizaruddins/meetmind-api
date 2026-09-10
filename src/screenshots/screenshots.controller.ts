import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScreenshotsService } from './screenshots.service';

@ApiTags('Screenshots')
@Controller('v1/screenshots')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class ScreenshotsController {
  constructor(private readonly screenshotsService: ScreenshotsService) {}

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authorize and consume one daily screenshot slot for the current user',
  })
  async authorize(@CurrentUser() user: any) {
    return this.screenshotsService.authorizeAndConsume(user.id);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current daily screenshot usage and remaining quota' })
  async getUsage(@CurrentUser() user: any) {
    return this.screenshotsService.getDailyQuota(user.id);
  }
}
