import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RegisterDeviceDto, UpdateDeviceDto } from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const device = await this.prisma.device.upsert({
      where: {
        userId_installationId: {
          userId,
          installationId: dto.installationId,
        },
      },
      create: {
        userId,
        installationId: dto.installationId,
        deviceName: dto.deviceName,
        platform: dto.platform,
        platformVersion: dto.platformVersion,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
        status: 'ACTIVE',
      },
      update: {
        deviceName: dto.deviceName,
        platform: dto.platform,
        platformVersion: dto.platformVersion || undefined,
        appVersion: dto.appVersion || undefined,
        lastSeenAt: new Date(),
        status: 'ACTIVE',
      },
    });

    return device;
  }

  async listDevices(userId: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return { devices };
  }

  async getDevice(userId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, userId },
    });
    if (!device) {
      throw new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'Device not found' });
    }
    return device;
  }

  async updateDevice(userId: string, id: string, dto: UpdateDeviceDto) {
    await this.getDevice(userId, id);
    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        deviceName: dto.deviceName || undefined,
      },
    });
    return updated;
  }

  async deleteDevice(userId: string, id: string) {
    await this.getDevice(userId, id);
    await this.prisma.device.delete({ where: { id } });
    return { success: true, message: 'Device deleted' };
  }

  async revokeDevice(userId: string, id: string) {
    await this.getDevice(userId, id);
    const updated = await this.prisma.device.update({
      where: { id },
      data: { status: 'REVOKED' },
    });
    return updated;
  }
}
