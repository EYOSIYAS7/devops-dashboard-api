import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { DeploymentsService } from './deployments.service';

@ApiTags('Deployments')
@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all deployments',
    description:
      'Returns all deployments with replica health status. Filter by namespace.',
  })
  @ApiQuery({ name: 'namespace', required: false })
  getAllDeployments(@Query('namespace') namespace?: string) {
    return this.deploymentsService.getAllDeployments(namespace);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get deployment statistics',
    description:
      'Returns aggregate deployment health — total, healthy, unhealthy, and replica counts',
  })
  @ApiQuery({ name: 'namespace', required: false })
  getDeploymentStats(@Query('namespace') namespace?: string) {
    return this.deploymentsService.getDeploymentStats(namespace);
  }

  @Get('unhealthy')
  @ApiOperation({
    summary: 'Get unhealthy deployments',
    description:
      'Returns deployments where readyReplicas is less than desiredReplicas',
  })
  @ApiQuery({ name: 'namespace', required: false })
  getUnhealthyDeployments(@Query('namespace') namespace?: string) {
    return this.deploymentsService.getUnhealthyDeployments(namespace);
  }

  @Get(':namespace/:name')
  @ApiOperation({ summary: 'Get a single deployment by namespace and name' })
  @ApiParam({ name: 'namespace' })
  @ApiParam({ name: 'name' })
  getDeployment(
    @Param('namespace') namespace: string,
    @Param('name') name: string,
  ) {
    return this.deploymentsService.getDeployment(namespace, name);
  }
}
