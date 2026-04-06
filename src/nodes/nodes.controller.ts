import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { NodesService } from './nodes.service';

@ApiTags('Nodes')
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all nodes',
    description:
      'Returns all cluster nodes with capacity, allocatable resources, and health conditions',
  })
  getAllNodes() {
    return this.nodesService.getAllNodes();
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get node statistics',
    description:
      'Returns aggregate stats — total nodes, ready count, and total cluster CPU and memory capacity',
  })
  getNodeStats() {
    return this.nodesService.getNodeStats();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a single node by name' })
  @ApiParam({ name: 'name', description: 'Node name' })
  getNode(@Param('name') name: string) {
    return this.nodesService.getNode(name);
  }
}
