import { Module } from '@nestjs/common';
import { PodsController } from './pods.controller';
import { PodsService } from './pods.service';

@Module({
  controllers: [PodsController],
  providers: [PodsService]
})
export class PodsModule {}
