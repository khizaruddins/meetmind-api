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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecordingsService } from './recordings.service';
import {
  AuthorizeRecordingDto,
  CompleteRecordingDto,
  FailRecordingDto,
  HeartbeatRecordingDto,
  QueryRecordingsDto,
  StartRecordingDto,
} from './dto/recording-ops.dto';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Recordings')
@Controller('v1/recordings')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Server-authoritative recording authorization and quota check' })
  async authorize(@CurrentUser() user: any, @Body() dto: AuthorizeRecordingDto) {
    return this.recordingsService.authorize(user.id, dto);
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a recording session (allocates quota and generates session ID)' })
  async start(@CurrentUser() user: any, @Body() dto: StartRecordingDto) {
    return this.recordingsService.start(user.id, dto);
  }

  @Post(':id/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Periodic 30s recording heartbeat to prevent stale sessions and check trial ceiling' })
  async heartbeat(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: HeartbeatRecordingDto,
  ) {
    return this.recordingsService.heartbeat(user.id, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize recording session and reconcile duration into daily usage' })
  async complete(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CompleteRecordingDto,
  ) {
    return this.recordingsService.complete(user.id, id, dto);
  }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark recording session as failed with reason' })
  async fail(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: FailRecordingDto,
  ) {
    return this.recordingsService.fail(user.id, id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Query customer recording session history (metadata only, no media)' })
  async list(@CurrentUser() user: any, @Query() query: QueryRecordingsDto) {
    return this.recordingsService.listRecordings(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single recording session metadata' })
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.recordingsService.getRecording(user.id, id);
  }

  @Delete(':id/metadata')
  @ApiOperation({ summary: 'Delete recording session metadata record' })
  async deleteMetadata(@CurrentUser() user: any, @Param('id') id: string) {
    return this.recordingsService.deleteMetadata(user.id, id);
  }
}
