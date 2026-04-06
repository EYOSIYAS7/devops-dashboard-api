import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NamespacesService } from './namespaces.service';

@ApiTags('Namespaces')
@Controller('namespaces')
export class NamespacesController {
  constructor(private readonly namespacesService: NamespacesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all namespaces',
    description: 'Returns all namespaces with their status and age',
  })
  getAllNamespaces() {
    return this.namespacesService.getAllNamespaces();
  }

  @Get('summaries')
  @ApiOperation({
    summary: 'Get namespace summaries',
    description:
      'Returns each namespace with pod counts, deployment counts, and a health score — useful for a per-team or per-environment overview',
  })
  getNamespaceSummaries() {
    return this.namespacesService.getNamespaceSummaries();
  }
}
