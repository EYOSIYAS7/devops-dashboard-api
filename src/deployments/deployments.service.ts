import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface DeploymentSummary {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  healthy: boolean;
  age: string;
  images: string[];
  strategy: string;
}

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(private readonly kubernetesService: KubernetesService) {}

  async getAllDeployments(namespace?: string): Promise<DeploymentSummary[]> {
    this.logger.log(
      namespace
        ? `Fetching deployments in namespace: ${namespace}`
        : 'Fetching all deployments',
    );

    const deployments = namespace
      ? await this.kubernetesService.getDeploymentsByNamespace(namespace)
      : await this.kubernetesService.getAllDeployments();

    return deployments.map((d) => this.mapDeploymentToSummary(d));
  }

  async getDeployment(
    namespace: string,
    name: string,
  ): Promise<DeploymentSummary> {
    this.logger.log(`Fetching deployment ${name} in namespace ${namespace}`);
    try {
      const deployment = await this.kubernetesService.getDeployment(
        namespace,
        name,
      );
      return this.mapDeploymentToSummary(deployment);
    } catch {
      throw new NotFoundException(
        `Deployment ${name} not found in namespace ${namespace}`,
      );
    }
  }

  async getUnhealthyDeployments(
    namespace?: string,
  ): Promise<DeploymentSummary[]> {
    // Reuse getAllDeployments and filter — keeps logic DRY
    // Unhealthy means readyReplicas < desiredReplicas
    const deployments = await this.getAllDeployments(namespace);
    return deployments.filter((d) => !d.healthy);
  }

  async getDeploymentStats(namespace?: string): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    totalDesiredReplicas: number;
    totalReadyReplicas: number;
  }> {
    const deployments = await this.getAllDeployments(namespace);

    return {
      total: deployments.length,
      healthy: deployments.filter((d) => d.healthy).length,
      unhealthy: deployments.filter((d) => !d.healthy).length,
      // Sum of all desired replicas across every deployment
      totalDesiredReplicas: deployments.reduce(
        (sum, d) => sum + d.desiredReplicas,
        0,
      ),
      // Sum of all ready replicas — compare with desired to
      // understand overall cluster workload health
      totalReadyReplicas: deployments.reduce(
        (sum, d) => sum + d.readyReplicas,
        0,
      ),
    };
  }

  private mapDeploymentToSummary(deployment: any): DeploymentSummary {
    const spec = deployment.spec ?? {};
    const status = deployment.status ?? {};

    // desiredReplicas comes from spec (what you asked for)
    // readyReplicas comes from status (what k8s actually achieved)
    // The gap between these two numbers is the health signal
    const desiredReplicas = spec.replicas ?? 0;
    const readyReplicas = status.readyReplicas ?? 0;
    const availableReplicas = status.availableReplicas ?? 0;
    const updatedReplicas = status.updatedReplicas ?? 0;

    // A deployment is healthy when all desired replicas are ready
    const healthy = readyReplicas >= desiredReplicas && desiredReplicas > 0;

    // Extract all container images from the pod template spec
    // A deployment can have multiple containers (sidecars)
    // so we collect all their images
    const images: string[] =
      spec.template?.spec?.containers?.map((c: any) => c.image) ?? [];

    const creationTime = deployment.metadata?.creationTimestamp;
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
      name: deployment.metadata?.name ?? 'unknown',
      namespace: deployment.metadata?.namespace ?? 'unknown',
      desiredReplicas,
      readyReplicas,
      availableReplicas,
      updatedReplicas,
      healthy,
      age,
      images,
      // RollingUpdate or Recreate — the deployment strategy
      strategy: spec.strategy?.type ?? 'RollingUpdate',
    };
  }
}
