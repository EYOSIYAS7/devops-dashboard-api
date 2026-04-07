import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('cpu')
  @ApiOperation({
    summary: 'Get CPU usage history',
    description:
      'Returns historical CPU usage data points. Defaults to cluster-wide. Filter by namespace and date range.',
  })
  @ApiQuery({
    name: 'namespace',
    required: false,
    description: 'Namespace to scope metrics (default: cluster-wide)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start time ISO8601 e.g. 2026-04-01T00:00:00Z',
  })
  @ApiQuery({ name: 'to', required: false, description: 'End time ISO8601' })
  getCPUHistory(
    @Query('namespace') namespace?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metricsService.getCPUHistory(namespace, from, to);
  }

  @Get('memory')
  @ApiOperation({
    summary: 'Get memory usage history',
    description: 'Returns historical memory usage in GiB',
  })
  @ApiQuery({ name: 'namespace', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getMemoryHistory(
    @Query('namespace') namespace?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metricsService.getMemoryHistory(namespace, from, to);
  }

  @Get('pods')
  @ApiOperation({
    summary: 'Get pod count history',
    description: 'Returns historical pod count over time',
  })
  @ApiQuery({ name: 'namespace', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getPodCountHistory(
    @Query('namespace') namespace?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metricsService.getPodCountHistory(namespace, from, to);
  }

  @Get('latest')
  @ApiOperation({
    summary: 'Get latest metric snapshot',
    description:
      'Returns the most recent snapshot for quick current-state queries',
  })
  @ApiQuery({ name: 'namespace', required: false })
  getLatestSnapshot(@Query('namespace') namespace?: string) {
    return this.metricsService.getLatestSnapshot(namespace);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get metrics collection status',
    description:
      'Returns total snapshot count and oldest recorded snapshot — useful to verify the collector is running',
  })
  getSnapshotCount() {
    return this.metricsService.getSnapshotCount();
  }
}
