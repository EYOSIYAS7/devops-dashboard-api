import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KubernetesService } from '../kubernetes/kubernetes.service';

export interface NodeSummary {
  name: string;
  status: string;
  roles: string[];
  age: string;
  kubeletVersion: string;
  osImage: string;
  containerRuntime: string;
  cpuCapacity: string;
  memoryCapacity: string;
  cpuAllocatable: string;
  memoryAllocatable: string;
  podCapacity: number;
  conditions: NodeCondition[];
  ready: boolean;
}

export interface NodeCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(private readonly kubernetesService: KubernetesService) {}

  async getAllNodes(): Promise<NodeSummary[]> {
    this.logger.log('Fetching all nodes');
    const nodes = await this.kubernetesService.getAllNodes();
    return nodes.map((node) => this.mapNodeToSummary(node));
  }

  async getNode(name: string): Promise<NodeSummary> {
    this.logger.log(`Fetching node: ${name}`);
    try {
      const node = await this.kubernetesService.getNode(name);
      return this.mapNodeToSummary(node);
    } catch {
      throw new NotFoundException(`Node ${name} not found`);
    }
  }

  async getNodeStats(): Promise<{
    total: number;
    ready: number;
    notReady: number;
    totalCPUCores: number;
    totalMemoryGi: number;
  }> {
    const nodes = await this.getAllNodes();

    // Parse CPU and memory across all nodes for cluster totals
    // CPU is stored as "4" (cores) or "4000m" (millicores)
    // Memory is stored as "8Gi" or "8589934592" (bytes)
    const totalCPUCores = nodes.reduce(
      (sum, n) => sum + this.parseCPU(n.cpuCapacity),
      0,
    );

    const totalMemoryGi = nodes.reduce(
      (sum, n) => sum + this.parseMemoryToGi(n.memoryCapacity),
      0,
    );

    return {
      total: nodes.length,
      ready: nodes.filter((n) => n.ready).length,
      notReady: nodes.filter((n) => !n.ready).length,
      totalCPUCores: Math.round(totalCPUCores * 10) / 10,
      totalMemoryGi: Math.round(totalMemoryGi * 10) / 10,
    };
  }

  private mapNodeToSummary(node: any): NodeSummary {
    const conditions: NodeCondition[] = (node.status?.conditions ?? []).map(
      (c: any) => ({
        type: c.type,
        status: c.status,
        reason: c.reason ?? '',
        message: c.message ?? '',
      }),
    );

    // A node is ready when it has a condition of type "Ready"
    // with status "True" — this is the k8s standard health check
    const readyCondition = conditions.find((c) => c.type === 'Ready');
    const ready = readyCondition?.status === 'True';

    // Node roles are stored as labels with the pattern:
    // "node-role.kubernetes.io/control-plane" or
    // "node-role.kubernetes.io/worker"
    // We extract the role name from the label key
    const labels = node.metadata?.labels ?? {};
    const roles = Object.keys(labels)
      .filter((key) => key.startsWith('node-role.kubernetes.io/'))
      .map((key) => key.replace('node-role.kubernetes.io/', ''));

    // Calculate age the same way we do for pods
    const creationTime = node.metadata?.creationTimestamp;
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
      name: node.metadata?.name ?? 'unknown',
      status: ready ? 'Ready' : 'NotReady',
      roles: roles.length > 0 ? roles : ['worker'],
      age,
      kubeletVersion: node.status?.nodeInfo?.kubeletVersion ?? 'unknown',
      osImage: node.status?.nodeInfo?.osImage ?? 'unknown',
      containerRuntime:
        node.status?.nodeInfo?.containerRuntimeVersion ?? 'unknown',
      cpuCapacity: node.status?.capacity?.cpu ?? '0',
      memoryCapacity: node.status?.capacity?.memory ?? '0',
      cpuAllocatable: node.status?.allocatable?.cpu ?? '0',
      memoryAllocatable: node.status?.allocatable?.memory ?? '0',
      podCapacity: parseInt(node.status?.capacity?.pods ?? '0', 10),
      conditions,
      ready,
    };
  }

  // Kubernetes stores CPU as "4" (cores) or "4000m" (millicores)
  // We normalize everything to cores as a float
  private parseCPU(cpu: string): number {
    if (cpu.endsWith('m')) {
      return parseInt(cpu.replace('m', ''), 10) / 1000;
    }
    return parseFloat(cpu) || 0;
  }

  // Kubernetes stores memory in Ki, Mi, Gi, or raw bytes
  // We normalize everything to Gibibytes for readability
  private parseMemoryToGi(memory: string): number {
    if (memory.endsWith('Ki')) {
      return parseFloat(memory) / (1024 * 1024);
    }
    if (memory.endsWith('Mi')) {
      return parseFloat(memory) / 1024;
    }
    if (memory.endsWith('Gi')) {
      return parseFloat(memory);
    }
    // Raw bytes
    return parseFloat(memory) / (1024 * 1024 * 1024);
  }
}
