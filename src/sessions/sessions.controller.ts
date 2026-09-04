import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Sessions')
@Controller('v1/sessions')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all active user sessions' })
  async listSessions(@CurrentUser() user: any) {
    return this.sessionsService.listSessions(user.id);
  }

  @Delete(':sessionId')
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.sessionsService.revokeSession(user.id, sessionId);
  }

  @Delete()
  @ApiOperation({ summary: 'Revoke all sessions (logout all devices)' })
  async revokeAllSessions(@CurrentUser() user: any) {
    return this.sessionsService.revokeAllSessions(user.id);
  }
}
