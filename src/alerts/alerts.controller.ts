import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all alerts',
    description:
      'Returns cluster alerts. Filter by resolved status. Unresolved alerts indicate active cluster issues.',
  })
  @ApiQuery({
    name: 'resolved',
    required: false,
    type: Boolean,
    description: 'true = resolved only, false = active only, omit = all',
  })
  getAllAlerts(@Query('resolved') resolved?: string) {
    // Query params come in as strings — convert to boolean
    // undefined means no filter (return all)
    const resolvedBool =
      resolved === undefined ? undefined : resolved === 'true';
    return this.alertsService.getAllAlerts(resolvedBool);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get alert statistics',
    description:
      'Returns total, active, resolved, critical, and high severity alert counts',
  })
  getAlertStats() {
    return this.alertsService.getAlertStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single alert by ID' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  getAlert(@Param('id') id: string) {
    return this.alertsService.getAlertById(id);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Manually resolve an alert',
    description:
      'Marks an alert as resolved. Alerts can also be auto-resolved when the condition clears.',
  })
  @ApiParam({ name: 'id' })
  resolveAlert(@Param('id') id: string) {
    return this.alertsService.resolveAlert(id);
  }
}
