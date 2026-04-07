import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsCollector } from './metrics.collector';
import { KubernetesModule } from '../kubernetes/kubernetes.module';

@Module({
  imports: [
    KubernetesModule,
    // Register the metrics queue — Bull creates this queue
    // in Redis automatically when the app starts
    BullModule.registerQueue({
      name: 'metrics',
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    // MetricsCollector is the Bull processor —
    // it handles jobs from the metrics queue
    MetricsCollector,
  ],
})
export class MetricsModule {}
