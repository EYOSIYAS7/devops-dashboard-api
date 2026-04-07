import { Injectable, Logger } from '@nestjs/common';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface ClusterOverview {
  clusterName: string;
  nodeCount: number;
  namespaceCount: number;
  podCount: number;
  deploymentCount: number;
  runningPods: number;
  pendingPods: number;
  failedPods: number;
  crashLoopingPods: number;
  healthScore: number;
}

@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(private readonly kubernetesService: KubernetesService) {}

  async getOverview(): Promise<ClusterOverview> {
    this.logger.log('Fetching cluster overview...');

    // Fire all k8s API calls in parallel with Promise.all
    // instead of awaiting them one by one — much faster
    // because each call is a network request to the cluster API server
    const [nodes, namespaces, pods, deployments] = await Promise.all([
      this.kubernetesService.getAllNodes(),
      this.kubernetesService.getAllNamespaces(),
      this.kubernetesService.getAllPods(),
      this.kubernetesService.getAllDeployments(),
    ]);

    // Count pods by their phase status
    // Kubernetes pod phases: Pending, Running, Succeeded, Failed, Unknown
    const runningPods = pods.filter(
      (p) => p.status?.phase === 'Running',
    ).length;

    const pendingPods = pods.filter(
      (p) => p.status?.phase === 'Pending',
    ).length;

    const failedPods = pods.filter((p) => p.status?.phase === 'Failed').length;

    // Use our helper to find crash-looping pods
    const crashLoopingPods = pods.filter((p) =>
      this.kubernetesService.isPodCrashLooping(p),
    ).length;

    // Health score formula:
    // Start at 100, subtract points for bad pods
    // -5 per failed pod, -3 per crash-looping pod, -1 per pending pod
    // Clamp between 0 and 100
    const totalPods = pods.length;
    let healthScore = 100;
    if (totalPods > 0) {
      healthScore = Math.max(
        0,
        Math.min(
          100,
          100 - failedPods * 5 - crashLoopingPods * 3 - pendingPods * 1,
        ),
      );
    }

    // Get the cluster name from kubeconfig
    // This is the name defined in your ~/.kube/config file
    const clusterName = this.kubernetesService.getClusterName();

    return {
      clusterName,
      nodeCount: nodes.length,
      namespaceCount: namespaces.length,
      podCount: totalPods,
      deploymentCount: deployments.length,
      runningPods,
      pendingPods,
      failedPods,
      crashLoopingPods,
      healthScore,
    };
  }
}
