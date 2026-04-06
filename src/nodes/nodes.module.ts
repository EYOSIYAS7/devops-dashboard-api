import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { KubernetesModule } from 'src/kubernetes/kubernetes.module';

@Module({
  imports: [KubernetesModule],
  controllers: [NodesController],
  providers: [NodesService],
})
export class NodesModule {}
