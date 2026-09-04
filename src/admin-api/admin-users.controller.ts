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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import {
  AdminCreateNoteDto,
  AdminResetPasswordDto,
  AdminUpdateNoteDto,
  CreateUserAdminDto,
  FilterUsersDto,
  UpdateUserAdminDto,
} from './dto/admin-user-ops.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';

@ApiTags('Admin User Management')
@Controller('v1/admin/users')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Filter and paginate customer users' })
  async list(@Query() filter: FilterUsersDto) {
    return this.adminUsersService.listUsers(filter);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get user details by ID' })
  async get(@Param('id') id: string) {
    return this.adminUsersService.getUser(id);
  }

  @Post()
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Create a new customer user manually' })
  async create(@Body() dto: CreateUserAdminDto, @CurrentAdmin() admin: any) {
    return this.adminUsersService.createUser(dto, admin.id);
  }

  @Patch(':id')
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Update customer user profile or status' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserAdminDto, @CurrentAdmin() admin: any) {
    return this.adminUsersService.updateUser(id, dto, admin.id);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  @ApiOperation({ summary: 'Soft-delete and disable customer user' })
  async delete(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminUsersService.deleteUser(id, admin.id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Disable user account immediately' })
  async disable(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminUsersService.disableUser(id, admin.id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Re-enable disabled user account' })
  async enable(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminUsersService.enableUser(id, admin.id);
  }

  @Post(':id/verify-email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Manually mark customer email as verified' })
  async verifyEmail(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminUsersService.verifyEmail(id, admin.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Admin reset customer password' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.resetPassword(id, dto, admin.id);
  }

  @Post(':id/logout-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Force invalidate all active sessions for a customer' })
  async logoutAll(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminUsersService.logoutAll(id, admin.id);
  }

  @Get(':id/sessions')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get active and expired sessions for user' })
  async sessions(@Param('id') id: string) {
    return this.adminUsersService.getUserSessions(id);
  }

  @Get(':id/devices')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get registered devices for user' })
  async devices(@Param('id') id: string) {
    return this.adminUsersService.getUserDevices(id);
  }

  @Get(':id/recordings')
  @RequirePermissions('recordings.read')
  @ApiOperation({ summary: 'Get recording history for user' })
  async recordings(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminUsersService.getUserRecordings(id, page, limit);
  }

  @Get(':id/usage')
  @RequirePermissions('usage.read')
  @ApiOperation({ summary: 'Get detailed usage records for user' })
  async usage(@Param('id') id: string) {
    return this.adminUsersService.getUserUsage(id);
  }

  @Get(':id/billing')
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Get billing overview, subscriptions, and invoices for user' })
  async billing(@Param('id') id: string) {
    return this.adminUsersService.getUserBilling(id);
  }

  @Get(':id/history')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get customer timeline history' })
  async history(@Param('id') id: string) {
    return this.adminUsersService.getUserTimeline(id);
  }

  @Get(':id/timeline')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get chronological account timeline' })
  async timeline(@Param('id') id: string) {
    return this.adminUsersService.getUserTimeline(id);
  }

  @Get(':id/overview')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get complete 360-degree customer overview' })
  async overview(@Param('id') id: string) {
    return this.adminUsersService.getUserOverview(id);
  }

  // Internal Notes
  @Get(':id/notes')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get internal admin support notes for user' })
  async listNotes(@Param('id') id: string) {
    return this.adminUsersService.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Add an internal admin note for user' })
  async createNote(
    @Param('id') id: string,
    @Body() dto: AdminCreateNoteDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.createNote(id, dto, admin.id);
  }

  @Patch(':id/notes/:noteId')
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Update an internal admin note' })
  async updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: AdminUpdateNoteDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.updateNote(id, noteId, dto, admin.id);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Delete an internal admin note' })
  async deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentAdmin() admin: any,
  ) {
    return this.adminUsersService.deleteNote(id, noteId, admin.id);
  }
}
