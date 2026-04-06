import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { PodsService } from './pods.service';

@ApiTags('Pods')
@Controller('pods')
export class PodsController {
  constructor(private readonly podsService: PodsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all pods',
    description: 'Returns all pods. Filter by namespace using query param.',
  })
  @ApiQuery({
    name: 'namespace',
    required: false,
    description: 'Filter pods by namespace',
  })
  getAllPods(@Query('namespace') namespace?: string) {
    // namespace is optional — if not provided, returns all pods
    return this.podsService.getAllPods(namespace);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get pod statistics',
    description: 'Returns pod counts grouped by status across the cluster',
  })
  @ApiQuery({
    name: 'namespace',
    required: false,
    description: 'Scope stats to a specific namespace',
  })
  getPodStats(@Query('namespace') namespace?: string) {
    return this.podsService.getPodStats(namespace);
  }

  @Get('crash-looping')
  @ApiOperation({
    summary: 'Get crash-looping pods',
    description:
      'Returns pods that have restarted more than 5 times — a strong signal of a broken workload',
  })
  @ApiQuery({
    name: 'namespace',
    required: false,
    description: 'Filter by namespace',
  })
  getCrashLoopingPods(@Query('namespace') namespace?: string) {
    return this.podsService.getCrashLoopingPods(namespace);
  }

  @Get(':namespace/:name')
  @ApiOperation({ summary: 'Get a single pod by namespace and name' })
  @ApiParam({ name: 'namespace', description: 'Pod namespace' })
  @ApiParam({ name: 'name', description: 'Pod name' })
  getPod(@Param('namespace') namespace: string, @Param('name') name: string) {
    return this.podsService.getPod(namespace, name);
  }
}
