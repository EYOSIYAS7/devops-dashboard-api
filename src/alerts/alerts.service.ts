import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertType, Severity } from '@prisma/client';

interface CreateAlertInput {
  type: AlertType;
  severity: Severity;
  namespace: string;
  resourceName: string;
  message: string;
}

interface ResolveInput {
  type: AlertType;
  namespace: string;
  resourceName: string;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  // Core deduplication method — only create an alert if
  // no unresolved alert already exists for the same
  // resource + type combination
  async createIfNotExists(input: CreateAlertInput): Promise<void> {
    const existing = await this.prismaService.alert.findFirst({
      where: {
        type: input.type,
        namespace: input.namespace,
        resourceName: input.resourceName,
        resolved: false,
      },
    });

    if (existing) {
      // Alert already exists and isn't resolved.
      // Update its severity and message so that incremental 
      // issues (like increasing restart loops) are saved to DB
      // instead of creating hundreds of duplicate alert rows.
      await this.prismaService.alert.update({
        where: { id: existing.id },
        data: {
          severity: input.severity,
          message: input.message,
        },
      });

      this.logger.warn(
        `🔄 Ongoing alert [${input.severity}] ${input.type}: ${input.message}`,
      );
      return;
    }

    await this.prismaService.alert.create({ data: input });
    this.logger.warn(
      `🚨 New alert [${input.severity}] ${input.type}: ${input.message}`,
    );
  }

  // Auto-resolve an alert when the condition that triggered it
  // no longer exists — e.g. a deployment becomes healthy again
  async autoResolveIfExists(input: ResolveInput): Promise<void> {
    const existing = await this.prismaService.alert.findFirst({
      where: {
        type: input.type,
        namespace: input.namespace,
        resourceName: input.resourceName,
        resolved: false,
      },
    });

    if (!existing) return;

    await this.prismaService.alert.update({
      where: { id: existing.id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });

    this.logger.log(
      `✅ Auto-resolved alert ${input.type} for ${input.resourceName}`,
    );
  }

  async getAllAlerts(resolved?: boolean) {
    return this.prismaService.alert.findMany({
      where: {
        // If resolved param not provided, return all alerts
        ...(resolved !== undefined && { resolved }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getAlertById(id: string) {
    const alert = await this.prismaService.alert.findUnique({
      where: { id },
    });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    return alert;
  }

  async resolveAlert(id: string) {
    const alert = await this.getAlertById(id);

    if (alert.resolved) {
      return { message: 'Alert already resolved', alert };
    }

    return this.prismaService.alert.update({
      where: { id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  async getAlertStats() {
    const [total, active, critical, high] = await Promise.all([
      this.prismaService.alert.count(),
      this.prismaService.alert.count({ where: { resolved: false } }),
      this.prismaService.alert.count({
        where: { severity: 'CRITICAL', resolved: false },
      }),
      this.prismaService.alert.count({
        where: { severity: 'HIGH', resolved: false },
      }),
    ]);

    return { total, active, resolved: total - active, critical, high };
  }
}
