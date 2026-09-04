import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Rotating refresh token string' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
