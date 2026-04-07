import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { KubernetesModule } from './kubernetes/kubernetes.module';
import { PodsModule } from './pods/pods.module';
import { NodesModule } from './nodes/nodes.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { NamespacesModule } from './namespaces/namespaces.module';
import { MetricsModule } from './metrics/metrics.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClusterModule } from './cluster/cluster.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    // isGlobal: true means we don't need to import ConfigModule
    // in every module — available everywhere automatically
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Register Bull globally with Redis connection
    // Bull uses Redis as its queue storage backend —
    // jobs are stored in Redis and picked up by workers
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    KubernetesModule,
    PodsModule,
    NodesModule,
    DeploymentsModule,
    NamespacesModule,
    MetricsModule,
    ClusterModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
