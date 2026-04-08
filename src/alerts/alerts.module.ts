import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsDetector } from './alerts.detector';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    KubernetesModule,
    // Reuse the same metrics queue to trigger alert detection
    // after every metrics snapshot — keeps everything in sync
    BullModule.registerQueue({ name: 'metrics' }),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsDetector],
  exports: [AlertsService],
})
export class AlertsModule {}
