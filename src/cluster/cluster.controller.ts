import { Controller, Get } from '@nestjs/common';
import { ClusterService } from './cluster.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// ApiTags groups this endpoint under "Cluster" in Swagger UI
@ApiTags('Cluster')
@Controller('cluster')
export class ClusterController {
  constructor(private readonly clusterService: ClusterService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get cluster overview',
    description:
      'Returns a high-level summary of the cluster including node count, pod health, and an overall health score',
  })
  @ApiResponse({
    status: 200,
    description: 'Cluster overview returned successfully',
  })
  getOverview() {
    // Delegates all logic to the service — controllers should
    // never contain business logic, only routing and HTTP concerns
    return this.clusterService.getOverview();
  }
}
