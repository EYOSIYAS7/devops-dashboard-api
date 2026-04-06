import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface PodSummary {
  name: string;
  namespace: string;
  status: string;
  ready: boolean;
  restartCount: number;
  age: string;
  nodeName: string;
  podIP: string;
  image: string;
  crashLooping: boolean;
}

@Injectable()
export class PodsService {
  private readonly logger = new Logger(PodsService.name);

  constructor(private readonly kubernetesService: KubernetesService) {}

  async getAllPods(namespace?: string): Promise<PodSummary[]> {
    this.logger.log(
      namespace
        ? `Fetching pods in namespace: ${namespace}`
        : 'Fetching all pods',
    );

    // If namespace is provided, fetch only that namespace
    // Otherwise fetch all pods across the entire cluster
    const pods = namespace
      ? await this.kubernetesService.getPodsByNamespace(namespace)
      : await this.kubernetesService.getAllPods();

    // Transform raw k8s pod objects into clean, flat summaries
    // Raw k8s objects are deeply nested and contain hundreds of fields
    // We only expose what a dashboard actually needs
    return pods.map((pod) => this.mapPodToSummary(pod));
  }

  async getPod(namespace: string, name: string): Promise<PodSummary> {
    this.logger.log(`Fetching pod ${name} in namespace ${namespace}`);

    try {
      const pod = await this.kubernetesService.getPod(namespace, name);
      return this.mapPodToSummary(pod);
    } catch (error) {
      // k8s client throws a generic error when a resource isn't found
      // We catch it and throw NestJS NotFoundException for a clean 404
      throw new NotFoundException(
        `Pod ${name} not found in namespace ${namespace}`,
      );
    }
  }

  async getCrashLoopingPods(namespace?: string): Promise<PodSummary[]> {
    // Reuse getAllPods then filter — keeps logic DRY
    const pods = await this.getAllPods(namespace);
    return pods.filter((pod) => pod.crashLooping);
  }

  async getPodStats(namespace?: string): Promise<{
    total: number;
    running: number;
    pending: number;
    failed: number;
    succeeded: number;
    crashLooping: number;
  }> {
    const pods = await this.getAllPods(namespace);

    return {
      total: pods.length,
      running: pods.filter((p) => p.status === 'Running').length,
      pending: pods.filter((p) => p.status === 'Pending').length,
      failed: pods.filter((p) => p.status === 'Failed').length,
      succeeded: pods.filter((p) => p.status === 'Succeeded').length,
      crashLooping: pods.filter((p) => p.crashLooping).length,
    };
  }

  // Private helper — transforms the raw deeply-nested k8s
  // V1Pod object into our clean PodSummary interface
  // All the optional chaining (?.) is because k8s objects
  // have many optional fields that may not be set
  private mapPodToSummary(pod: any): PodSummary {
    const containerStatuses = pod.status?.containerStatuses ?? [];

    // A pod is "ready" when ALL its containers are ready
    const ready =
      containerStatuses.length > 0 &&
      containerStatuses.every((cs: any) => cs.ready === true);

    // Total restarts across ALL containers in the pod
    const restartCount = containerStatuses.reduce(
      (sum: number, cs: any) => sum + (cs.restartCount ?? 0),
      0,
    );

    // Get the first container's image as the primary image
    // Most pods have one container — for multi-container pods
    // we just show the main one
    const image = pod.spec?.containers?.[0]?.image ?? 'unknown';

    return {
      name: pod.metadata?.name ?? 'unknown',
      namespace: pod.metadata?.namespace ?? 'unknown',
      status: this.kubernetesService.getPodStatus(pod),
      ready,
      restartCount,
      age: this.kubernetesService.getPodAge(pod),
      nodeName: pod.spec?.nodeName ?? 'unscheduled',
      podIP: pod.status?.podIP ?? 'none',
      image,
      crashLooping: this.kubernetesService.isPodCrashLooping(pod),
    };
  }
}
