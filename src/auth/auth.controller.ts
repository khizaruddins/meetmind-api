import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import {
  ForgotPasswordDto,
  LogoutAllDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/password-ops.dto';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new customer account' })
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    return this.authService.signup(dto, ip, ua);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    return this.authService.login(dto, ip, ua);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate and exchange refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    return this.authService.refresh(dto, ip, ua);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and revoke session' })
  async logout(@Body() dto?: RefreshTokenDto) {
    return this.authService.logout(dto?.refreshToken);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify user email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link with rate limiting and token revocation' })
  async resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    let authUserId: string | undefined;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload: any = this.jwtService.decode(authHeader.substring(7));
        if (payload?.sub && payload?.type === 'customer') {
          authUserId = payload.sub;
        }
      } catch {
        // ignore
      }
    }
    return this.authService.resendVerification(dto?.email, ip, authUserId);
  }

  @Get('sessions')
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions and connected devices for customer' })
  async getSessions(@CurrentUser() user: any, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const ua = req.headers['user-agent'];
    return this.authService.listCustomerSessions(user.id, ip, ua);
  }

  @Delete('sessions/:id')
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one customer session' })
  async revokeSession(@CurrentUser() user: any, @Param('id') id: string) {
    return this.authService.revokeCustomerSession(user.id, id);
  }

  @Post('logout-all')
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all customer sessions (supports keeping current session)' })
  async logoutAll(@CurrentUser() user: any, @Body() dto: LogoutAllDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.authService.logoutAllCustomerSessions(user.id, dto?.keepCurrentSession, ip);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user info' })
  async getMe(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }

  @Get('oauth/google/start')
  @ApiOperation({ summary: 'Start Google OAuth PKCE flow' })
  async googleOAuthStart(@Query('redirect_uri') redirectUri?: string) {
    return this.authService.getGoogleOAuthStart(redirectUri);
  }

  @Get('oauth/google/callback')
  @ApiOperation({ summary: 'Google OAuth callback handler' })
  async googleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('code_verifier') codeVerifier?: string,
  ) {
    return this.authService.handleGoogleOAuthCallback(code, state, codeVerifier);
  }
}
