import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import bull from 'bull';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { PrismaService } from '../prisma/prisma.service';

// @Processor connects this class to the 'metrics' Bull queue
// When a job is added to that queue, Bull calls @Process methods here
@Processor('metrics')
export class MetricsCollector implements OnModuleInit {
  private readonly logger = new Logger(MetricsCollector.name);

  constructor(
    // InjectQueue gives us the queue object so we can ADD jobs to it
    @InjectQueue('metrics') private readonly metricsQueue: bull.Queue,
    private readonly kubernetesService: KubernetesService,
    private readonly prismaService: PrismaService,
  ) {}

  // the producer
  async onModuleInit() {
    // Clear any leftover jobs from previous runs
    await this.metricsQueue.empty();

    // Add a repeating job that fires every 30 seconds
    // repeat.every is in milliseconds
    // jobId prevents duplicate jobs if the app restarts
    await this.metricsQueue.add(
      'collect-snapshot', // job name
      {},
      {
        repeat: { every: 300000 },
        jobId: 'metrics-snapshot-repeater',
        removeOnComplete: 10, // Keep only last 10 completed jobs in Redis
        removeOnFail: 5,
      },
    );

    this.logger.log('Metrics collection scheduled every 5 minutes');

    // Run immediately on startup so we have data right away
    // instead of waiting 30 seconds for the first snapshot
    await this.collectSnapshot();
  }

  // the consumer
  // @Process('collect-snapshot') tells Bull which job name
  // this method handles — matches the name we used in .add()
  @Process('collect-snapshot')
  async handleCollectSnapshot(job: bull.Job) {
    this.logger.debug(`Processing metrics job #${job.id}`);
    await this.collectSnapshot();
  }

  private async collectSnapshot() {
    try {
      const [nodes, pods, deployments, namespaces] = await Promise.all([
        this.kubernetesService.getAllNodes(),
        this.kubernetesService.getAllPods(),
        this.kubernetesService.getAllDeployments(),
        this.kubernetesService.getAllNamespaces(),
      ]);

      const totalCPU = nodes.reduce((sum, node) => {
        const cpu = node.status?.capacity?.cpu ?? '0';
        return sum + this.parseCPU(cpu);
      }, 0);

      const totalMemoryBytes = nodes.reduce((sum, node) => {
        const mem = node.status?.capacity?.memory ?? '0Ki';
        return sum + this.parseMemoryToBytes(mem);
      }, 0);

      const totalMemoryGi = totalMemoryBytes / (1024 * 1024 * 1024);

      // Build snapshot data for every namespace + cluster-wide
      const snapshotsToEvaluate: Array<{
        namespace: string;
        cpuUsage: number;
        memoryUsage: number;
        podCount: number;
      }> = [];

      // Per-namespace snapshots
      for (const ns of namespaces) {
        const namespaceName = ns.metadata?.name ?? 'unknown';
        const namespacePods = pods.filter(
          (p) => p.metadata?.namespace === namespaceName,
        );
        const podFraction =
          pods.length > 0 ? namespacePods.length / pods.length : 0;

        snapshotsToEvaluate.push({
          namespace: namespaceName,
          cpuUsage: totalCPU * podFraction,
          memoryUsage: totalMemoryGi * podFraction,
          podCount: namespacePods.length,
        });
      }

      // Cluster-wide snapshot
      snapshotsToEvaluate.push({
        namespace: '__cluster__',
        cpuUsage: totalCPU,
        memoryUsage: totalMemoryGi,
        podCount: pods.length,
      });

      // For each namespace, fetch the last saved snapshot and
      // compare — only write if something meaningfully changed
      let savedCount = 0;
      let skippedCount = 0;

      await Promise.all(
        snapshotsToEvaluate.map(async (snapshot) => {
          const hasChanged = await this.hasSnapshotChanged(snapshot);

          if (hasChanged) {
            await this.prismaService.metricSnapshot.create({
              data: snapshot,
            });
            savedCount++;
          } else {
            skippedCount++;
          }
        }),
      );

      this.logger.log(
        `Snapshot complete — saved: ${savedCount}, skipped (no change): ${skippedCount}`,
      );

      await this.kubernetesService.invalidateCache();
    } catch (error) {
      this.logger.error(`Failed to collect metrics snapshot: ${error.message}`);
    }
  }

  // Compare incoming snapshot with the last saved one for this namespace
  // Returns true if we should save, false if nothing meaningful changed
  private async hasSnapshotChanged(incoming: {
    namespace: string;
    cpuUsage: number;
    memoryUsage: number;
    podCount: number;
  }): Promise<boolean> {
    const last = await this.prismaService.metricSnapshot.findFirst({
      where: { namespace: incoming.namespace },
      orderBy: { recordedAt: 'desc' },
    });

    // No previous snapshot — always save the first one
    if (!last) return true;

    // Pod count change is the most important signal
    // Any change in pod count always gets saved
    if (last.podCount !== incoming.podCount) return true;

    // For CPU and memory, use a threshold to ignore tiny
    // floating point fluctuations that aren't meaningful
    // 0.1 CPU cores or 0.1 GiB memory = worth recording
    const CPU_THRESHOLD = 0.1;
    const MEMORY_THRESHOLD = 0.1;

    if (Math.abs(last.cpuUsage - incoming.cpuUsage) > CPU_THRESHOLD)
      return true;
    if (Math.abs(last.memoryUsage - incoming.memoryUsage) > MEMORY_THRESHOLD)
      return true;

    // Nothing meaningful changed — skip this write
    return false;
  }

  private parseCPU(cpu: string): number {
    if (cpu.endsWith('m')) return parseInt(cpu) / 1000;
    return parseFloat(cpu) || 0;
  }

  private parseMemoryToBytes(memory: string): number {
    if (memory.endsWith('Ki')) return parseFloat(memory) * 1024;
    if (memory.endsWith('Mi')) return parseFloat(memory) * 1024 * 1024;
    if (memory.endsWith('Gi')) return parseFloat(memory) * 1024 * 1024 * 1024;
    return parseFloat(memory) || 0;
  }
}
