import { Module } from '@nestjs/common';
import { NamespacesController } from './namespaces.controller';
import { NamespacesService } from './namespaces.service';
import { KubernetesModule } from 'src/kubernetes/kubernetes.module';

@Module({
  imports: [KubernetesModule],
  controllers: [NamespacesController],
  providers: [NamespacesService],
})
export class NamespacesModule {}
