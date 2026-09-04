import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateUserAdminDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'InitialPassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'TRIAL', default: 'TRIAL' })
  @IsOptional()
  @IsString()
  planCode?: string;
}

export class UpdateUserAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class AdminCreateNoteDto {
  @ApiProperty({ example: 'User requested high-priority trial extension for pilot evaluation.' })
  @IsString()
  @IsNotEmpty()
  note: string;
}

export class AdminUpdateNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note: string;
}

export class FilterUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['TRIAL', 'SILVER', 'GOLD'] })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] })
  @IsOptional()
  @IsString()
  subscriptionStatus?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'EXPIRED'] })
  @IsOptional()
  @IsString()
  trialStatus?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED', 'PENDING_DELETION'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'name_asc', 'name_desc'], default: 'newest' })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
}
