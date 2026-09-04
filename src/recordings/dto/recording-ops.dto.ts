import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AuthorizeRecordingDto {
  @ApiPropertyOptional({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'google_meet', default: 'manual' })
  @IsOptional()
  @IsString()
  meetingPlatform?: string;

  @ApiPropertyOptional({ example: 'abc-defg-hij' })
  @IsOptional()
  @IsString()
  meetingId?: string;

  @ApiPropertyOptional({ example: 'Weekly Architecture Sync' })
  @IsOptional()
  @IsString()
  meetingTitle?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoStarted?: boolean;

  @ApiPropertyOptional({ example: 'screen_window' })
  @IsOptional()
  @IsString()
  captureSource?: string;

  @ApiPropertyOptional({ example: 'h264_vaapi' })
  @IsOptional()
  @IsString()
  encoder?: string;
}

export class StartRecordingDto extends AuthorizeRecordingDto {
  @ApiPropertyOptional({ example: 'session-id-if-preauthorized' })
  @IsOptional()
  @IsString()
  recordingSessionId?: string;
}

export class HeartbeatRecordingDto {
  @ApiProperty({ description: 'Elapsed duration in seconds for this session', example: 30 })
  @IsInt()
  @Min(0)
  elapsedDurationSeconds: number;
}

export class CompleteRecordingDto {
  @ApiProperty({ description: 'Final duration in seconds', example: 480 })
  @IsInt()
  @Min(0)
  durationSeconds: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoStopped?: boolean;
}

export class FailRecordingDto {
  @ApiProperty({ description: 'Failure reason or error message', example: 'Encoder pipeline error' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}

export class QueryRecordingsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxDuration?: number;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'duration_asc', 'duration_desc'], default: 'newest' })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'oldest' | 'duration_asc' | 'duration_desc';
}
