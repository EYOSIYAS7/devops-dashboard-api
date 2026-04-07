import { Module } from '@nestjs/common';
import { KubernetesService } from './kubernetes.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Module({
  imports: [ConfigModule],
  providers: [
    // Provide Redis as an injectable token
    // Any service in this module can inject it via @Inject('REDIS_CLIENT')
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        });
      },
      inject: [ConfigService],
    },
    KubernetesService,
  ],
  exports: [KubernetesService],
})
export class KubernetesModule {}
