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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, UpdateDeviceDto } from './dto/device.dto';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Devices')
@Controller('v1/devices')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register or heartbeat a client device' })
  async register(@CurrentUser() user: any, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.registerDevice(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all registered devices for current user' })
  async list(@CurrentUser() user: any) {
    return this.devicesService.listDevices(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device details by ID' })
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.devicesService.getDevice(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update device friendly name' })
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.updateDevice(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a registered device' })
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.devicesService.deleteDevice(user.id, id);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke authorization for a device' })
  async revoke(@CurrentUser() user: any, @Param('id') id: string) {
    return this.devicesService.revokeDevice(user.id, id);
  }
}
