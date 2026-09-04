import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Profile & Account')
@Controller('v1')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current customer profile' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update customer profile' })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Immediately delete or soft-delete customer account' })
  async deleteAccount(@CurrentUser() user: any) {
    return this.usersService.deleteAccount(user.id);
  }

  @Post('account/request-deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule account deletion (30-day GDPR grace period)' })
  async requestDeletion(@CurrentUser() user: any) {
    return this.usersService.requestDeletion(user.id);
  }

  @Post('account/cancel-deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel scheduled account deletion' })
  async cancelDeletion(@CurrentUser() user: any) {
    return this.usersService.cancelDeletion(user.id);
  }

  @Post('account/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export all account data in JSON format (GDPR compliance)' })
  async exportData(@CurrentUser() user: any) {
    return this.usersService.exportData(user.id);
  }
}
