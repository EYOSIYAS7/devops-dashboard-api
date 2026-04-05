import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // Hold the client as a property instead of extending it
  // Prisma v7+ does not support class extension the old way
  private readonly prisma: PrismaClient;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  // Expose the client directly so other services can do
  // this.prisma.metricSnapshot.findMany() etc.
  getClient(): PrismaClient {
    return this.prisma;
  }

  // Shorthand getters for each model so usage stays clean
  // Usage in other services: this.prismaService.metricSnapshot.findMany()
  get metricSnapshot() {
    return this.prisma.metricSnapshot;
  }

  get alert() {
    return this.prisma.alert;
  }
}
