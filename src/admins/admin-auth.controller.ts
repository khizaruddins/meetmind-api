import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminRefreshTokenDto } from './dto/admin-auth.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { Request } from 'express';

@ApiTags('Admin Auth')
@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin / Staff login with email and password' })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.adminAuthService.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh admin access token' })
  async refresh(@Body() dto: AdminRefreshTokenDto) {
    return this.adminAuthService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin logout and session audit' })
  async logout(@CurrentAdmin() admin: any) {
    return this.adminAuthService.logout(admin.id);
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated admin user with roles and permissions' })
  async getMe(@CurrentAdmin() admin: any) {
    return this.adminAuthService.getMe(admin);
  }
}
