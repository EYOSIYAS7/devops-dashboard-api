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
      // Fetch all data in parallel — these all hit Redis cache
      // so this is fast and doesn't hammer the k8s API
      const [nodes, pods, deployments, namespaces] = await Promise.all([
        this.kubernetesService.getAllNodes(),
        this.kubernetesService.getAllPods(),
        this.kubernetesService.getAllDeployments(),
        this.kubernetesService.getAllNamespaces(),
      ]);

      // Parse CPU capacity from node resources
      // We sum across all nodes to get total cluster CPU
      const totalCPU = nodes.reduce((sum, node) => {
        const cpu = node.status?.capacity?.cpu ?? '0';
        return sum + this.parseCPU(cpu);
      }, 0);

      // Parse memory capacity from node resources
      // Convert everything to bytes for consistent storage
      const totalMemoryBytes = nodes.reduce((sum, node) => {
        const mem = node.status?.capacity?.memory ?? '0Ki';
        return sum + this.parseMemoryToBytes(mem);
      }, 0);

      const runningPods = pods.filter(
        (p) => p.status?.phase === 'Running',
      ).length;

      // ------- Start storing in to database
      // Store one snapshot per namespace so we can query
      // per-namespace trends over time
      const snapshotPromises = namespaces.map((ns) => {
        const namespaceName = ns.metadata?.name ?? 'unknown';

        const namespacePods = pods.filter(
          (p) => p.metadata?.namespace === namespaceName,
        );

        const namespacePodCount = namespacePods.length;
        const namespaceRunning = namespacePods.filter(
          (p) => p.status?.phase === 'Running',
        ).length;

        // Store CPU and memory as a fraction of total cluster capacity
        // scoped to the namespace's share of running pods
        const podFraction =
          pods.length > 0 ? namespacePodCount / pods.length : 0;

        return this.prismaService.metricSnapshot.create({
          data: {
            namespace: namespaceName,
            // Allocate cluster resources proportionally by pod count
            // This is an approximation — real per-pod metrics
            // would require the Metrics Server API
            cpuUsage: totalCPU * podFraction,
            memoryUsage:
              (totalMemoryBytes / (1024 * 1024 * 1024)) * podFraction,
            podCount: namespacePodCount,
          },
        });
      });

      // Also store a cluster-wide snapshot in the 'cluster' namespace
      await this.prismaService.metricSnapshot.create({
        data: {
          namespace: '__cluster__',
          cpuUsage: totalCPU,
          memoryUsage: totalMemoryBytes / (1024 * 1024 * 1024),
          podCount: pods.length,
        },
      });

      await Promise.all(snapshotPromises);

      this.logger.log(
        `Snapshot saved — ${pods.length} pods, ${nodes.length} nodes, ` +
          `${runningPods} running, ${namespaces.length} namespaces`,
      );

      // Invalidate Redis cache after each snapshot
      // so the next API request gets fresh data
      await this.kubernetesService.invalidateCache();
    } catch (error) {
      this.logger.error(`Failed to collect metrics snapshot: ${error.message}`);
    }
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
