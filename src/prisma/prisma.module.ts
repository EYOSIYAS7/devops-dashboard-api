import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() means we don't need to import PrismaModule
// in every single module — import it once in AppModule
// and it's available everywhere
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}