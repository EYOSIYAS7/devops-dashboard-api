import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  namespace: string;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getCPUHistory(
    namespace = '__cluster__',
    from?: string,
    to?: string,
  ): Promise<MetricDataPoint[]> {
    const snapshots = await this.querySnapshots(namespace, from, to);

    return snapshots.map((s) => ({
      timestamp: s.recordedAt.toISOString(),
      value: Math.round(s.cpuUsage * 100) / 100,
      namespace: s.namespace,
    }));
  }

  async getMemoryHistory(
    namespace = '__cluster__',
    from?: string,
    to?: string,
  ): Promise<MetricDataPoint[]> {
    const snapshots = await this.querySnapshots(namespace, from, to);

    return snapshots.map((s) => ({
      timestamp: s.recordedAt.toISOString(),
      // Return memory in GiB rounded to 2 decimal places
      value: Math.round(s.memoryUsage * 100) / 100,
      namespace: s.namespace,
    }));
  }

  async getPodCountHistory(
    namespace = '__cluster__',
    from?: string,
    to?: string,
  ): Promise<MetricDataPoint[]> {
    const snapshots = await this.querySnapshots(namespace, from, to);

    return snapshots.map((s) => ({
      timestamp: s.recordedAt.toISOString(),
      value: s.podCount,
      namespace: s.namespace,
    }));
  }

  async getLatestSnapshot(namespace = '__cluster__') {
    // Get the most recent snapshot for quick current-state queries
    const snapshot = await this.prismaService.metricSnapshot.findFirst({
      where: { namespace },
      orderBy: { recordedAt: 'desc' },
    });

    if (!snapshot) return null;

    return {
      namespace: snapshot.namespace,
      cpuUsage: Math.round(snapshot.cpuUsage * 100) / 100,
      memoryUsageGi: Math.round(snapshot.memoryUsage * 100) / 100,
      podCount: snapshot.podCount,
      recordedAt: snapshot.recordedAt.toISOString(),
    };
  }

  async getSnapshotCount(): Promise<{
    total: number;
    oldestAt: string | null;
  }> {
    const total = await this.prismaService.metricSnapshot.count();
    const oldest = await this.prismaService.metricSnapshot.findFirst({
      orderBy: { recordedAt: 'asc' },
    });

    return {
      total,
      oldestAt: oldest?.recordedAt.toISOString() ?? null,
    };
  }

  // Shared query logic — used by all history endpoints
  // Prisma's where clause with optional date range filtering
  private async querySnapshots(namespace: string, from?: string, to?: string) {
    return this.prismaService.metricSnapshot.findMany({
      where: {
        namespace,
        // Only add date filters if they were provided
        recordedAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      },
      orderBy: { recordedAt: 'asc' },
      // Cap at 1000 points to avoid huge responses
      take: 1000,
    });
  }
}
