import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsString()
  @IsNotEmpty()
  installationId: string;

  @ApiProperty({ example: 'MacBook Pro 16' })
  @IsString()
  @IsNotEmpty()
  deviceName: string;

  @ApiProperty({ example: 'macOS' })
  @IsString()
  @IsNotEmpty()
  platform: string;

  @ApiPropertyOptional({ example: '14.5' })
  @IsOptional()
  @IsString()
  platformVersion?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({ example: 'Workstation 2' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
