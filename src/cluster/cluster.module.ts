import { Module } from '@nestjs/common';
import { ClusterController } from './cluster.controller';
import { ClusterService } from './cluster.service';
import { KubernetesModule } from 'src/kubernetes/kubernetes.module';

@Module({
  imports: [KubernetesModule],
  controllers: [ClusterController],
  providers: [ClusterService],
})
export class ClusterModule {}
