import { Module } from '@nestjs/common';
import { PodsController } from './pods.controller';
import { PodsService } from './pods.service';
import { KubernetesModule } from 'src/kubernetes/kubernetes.module';

@Module({
  imports: [KubernetesModule],
  controllers: [PodsController],
  providers: [PodsService],
})
export class PodsModule {}
