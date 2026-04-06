import { Injectable, Logger } from '@nestjs/common';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface NamespaceSummary {
  name: string;
  status: string;
  age: string;
  podCount: number;
  runningPods: number;
  failedPods: number;
  deploymentCount: number;
  healthScore: number;
}

@Injectable()
export class NamespacesService {
  private readonly logger = new Logger(NamespacesService.name);

  constructor(private readonly kubernetesService: KubernetesService) {}

  async getAllNamespaces(): Promise<
    { name: string; status: string; age: string }[]
  > {
    this.logger.log('Fetching all namespaces');
    const namespaces = await this.kubernetesService.getAllNamespaces();

    return namespaces.map((ns) => {
      const creationTime = ns.metadata?.creationTimestamp;
      let age = 'Unknown';
      if (creationTime) {
        const diffMs = Date.now() - new Date(creationTime).getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        age =
          diffDays > 0
            ? `${diffDays}d`
            : `${Math.floor(diffMs / (1000 * 60 * 60))}h`;
      }

      return {
        name: ns.metadata?.name ?? 'unknown',
        // Namespace status is either Active or Terminating
        status: ns.status?.phase ?? 'Unknown',
        age,
      };
    });
  }

  async getNamespaceSummaries(): Promise<NamespaceSummary[]> {
    this.logger.log(
      'Fetching namespace summaries with pod and deployment counts',
    );

    // Fetch everything in parallel — one call per resource type
    // This is much faster than fetching namespace by namespace
    const [namespaces, allPods, allDeployments] = await Promise.all([
      this.kubernetesService.getAllNamespaces(),
      this.kubernetesService.getAllPods(),
      this.kubernetesService.getAllDeployments(),
    ]);

    return namespaces.map((ns) => {
      const namespaceName = ns.metadata?.name ?? 'unknown';

      // Filter pods and deployments that belong to this namespace
      // This is more efficient than making per-namespace API calls
      // because we already have all the data in memory
      const namespacePods = allPods.filter(
        (p) => p.metadata?.namespace === namespaceName,
      );
      const namespaceDeployments = allDeployments.filter(
        (d) => d.metadata?.namespace === namespaceName,
      );

      const runningPods = namespacePods.filter(
        (p) => p.status?.phase === 'Running',
      ).length;

      const failedPods = namespacePods.filter(
        (p) => p.status?.phase === 'Failed',
      ).length;

      const crashLoopingPods = namespacePods.filter((p) =>
        this.kubernetesService.isPodCrashLooping(p),
      ).length;

      // Same health score formula as cluster overview
      // but scoped to this namespace only
      const totalPods = namespacePods.length;
      let healthScore = 100;
      if (totalPods > 0) {
        healthScore = Math.max(
          0,
          Math.min(100, 100 - failedPods * 5 - crashLoopingPods * 3),
        );
      }

      const creationTime = ns.metadata?.creationTimestamp;
      let age = 'Unknown';
      if (creationTime) {
        const diffMs = Date.now() - new Date(creationTime).getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        age =
          diffDays > 0
            ? `${diffDays}d`
            : `${Math.floor(diffMs / (1000 * 60 * 60))}h`;
      }

      return {
        name: namespaceName,
        status: ns.status?.phase ?? 'Unknown',
        age,
        podCount: totalPods,
        runningPods,
        failedPods,
        deploymentCount: namespaceDeployments.length,
        healthScore,
      };
    });
  }
}
