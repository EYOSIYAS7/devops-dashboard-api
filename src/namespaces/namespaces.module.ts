import { Module } from '@nestjs/common';
import { NamespacesController } from './namespaces.controller';
import { NamespacesService } from './namespaces.service';

@Module({
  controllers: [NamespacesController],
  providers: [NamespacesService]
})
export class NamespacesModule {}
