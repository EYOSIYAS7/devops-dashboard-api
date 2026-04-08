import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import bull from 'bull';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsDetector implements OnModuleInit {
  private readonly logger = new Logger(AlertsDetector.name);

  constructor(
    @InjectQueue('metrics') private readonly metricsQueue: bull.Queue,
    private readonly kubernetesService: KubernetesService,
    private readonly alertsService: AlertsService,
  ) {}

  async onModuleInit() {
    // Listen to the metrics queue completion event
    // Every time a metrics snapshot finishes, we run alert detection
    // This keeps alerts in sync with the latest cluster state
    // without needing a separate Bull queue
    this.metricsQueue.on('global:completed', async (jobId: string) => {
      const job = await this.metricsQueue.getJob(jobId);
      if (job && job.name === 'collect-snapshot') {
        await this.detectAlerts();
        this.logger.log('Alert detection completed....');
      }
    });

    this.logger.log('Alert detector listening to metrics queue');

    // Run immediately on startup because the very first metrics collection
    // is executed manually in MetricsCollector and bypasses the Bull queue.
    await this.detectAlerts();
    this.logger.log('Initial alert detection completed....');
  }

  async detectAlerts(): Promise<void> {
    this.logger.debug('Running alert detection...');

    try {
      // Run all detection checks in parallel
      await Promise.all([
        this.detectCrashLoopingPods(),
        this.detectUnhealthyDeployments(),
        this.detectNotReadyNodes(),
      ]);
    } catch (error) {
      this.logger.error(`Alert detection failed: ${error.message}`);
    }
  }

  private async detectCrashLoopingPods(): Promise<void> {
    const pods = await this.kubernetesService.getAllPods();

    for (const pod of pods) {
      const isCrashLooping = this.kubernetesService.isPodCrashLooping(pod);
      if (!isCrashLooping) continue;

      const podName = pod.metadata?.name ?? 'unknown';
      const namespace = pod.metadata?.namespace ?? 'unknown';
      const restartCount =
        pod.status?.containerStatuses?.reduce(
          (sum, cs) => sum + cs.restartCount,
          0,
        ) ?? 0;

      // Deduplicate — don't create a new alert if one already
      // exists and hasn't been resolved yet for this pod
      await this.alertsService.createIfNotExists({
        type: 'CRASH_LOOP',
        severity: restartCount > 20 ? 'CRITICAL' : 'HIGH',
        namespace,
        resourceName: podName,
        message: `Pod ${podName} in namespace ${namespace} is crash-looping with ${restartCount} restarts`,
      });
    }
  }

  private async detectUnhealthyDeployments(): Promise<void> {
    const deployments = await this.kubernetesService.getAllDeployments();

    for (const deployment of deployments) {
      const name = deployment.metadata?.name ?? 'unknown';
      const namespace = deployment.metadata?.namespace ?? 'unknown';
      const desired = deployment.spec?.replicas ?? 0;
      const ready = deployment.status?.readyReplicas ?? 0;

      if (desired === 0 || ready >= desired) {
        // Deployment is healthy — if there was an alert for it,
        // auto-resolve it since the condition is gone
        await this.alertsService.autoResolveIfExists({
          type: 'DEPLOYMENT_FAILED',
          namespace,
          resourceName: name,
        });
        continue;
      }

      const missing = desired - ready;
      await this.alertsService.createIfNotExists({
        type: 'DEPLOYMENT_FAILED',
        severity: ready === 0 ? 'CRITICAL' : 'MEDIUM',
        namespace,
        resourceName: name,
        message: `Deployment ${name} in ${namespace} has ${ready}/${desired} replicas ready (${missing} missing)`,
      });
    }
  }

  private async detectNotReadyNodes(): Promise<void> {
    const nodes = await this.kubernetesService.getAllNodes();

    for (const node of nodes) {
      const name = node.metadata?.name ?? 'unknown';
      const conditions = node.status?.conditions ?? [];
      const readyCondition = conditions.find((c) => c.type === 'Ready');
      const isReady = readyCondition?.status === 'True';

      if (isReady) {
        // Node recovered — auto-resolve any existing alert
        await this.alertsService.autoResolveIfExists({
          type: 'NODE_NOT_READY',
          namespace: 'cluster',
          resourceName: name,
        });
        continue;
      }

      await this.alertsService.createIfNotExists({
        type: 'NODE_NOT_READY',
        severity: 'CRITICAL',
        namespace: 'cluster',
        resourceName: name,
        message: `Node ${name} is not ready — reason: ${readyCondition?.reason ?? 'unknown'}`,
      });
    }
  }
}
