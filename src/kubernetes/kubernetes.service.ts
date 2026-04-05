import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class KubernetesService implements OnModuleInit {
  private readonly logger = new Logger(KubernetesService.name);
  private kc: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.kc = new k8s.KubeConfig();

    const kubeconfigPath = this.configService.get<string>('KUBECONFIG_PATH');

    if (kubeconfigPath) {
      this.kc.loadFromFile(kubeconfigPath);
      this.logger.log(`Loaded kubeconfig from: ${kubeconfigPath}`);
    } else {
      this.kc.loadFromDefault();
      this.logger.log('Loaded kubeconfig from default location');
    }

    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);

    this.logger.log(
      `Connected to cluster: ${this.kc.getCurrentCluster()?.name}`,
    );
  }

  // ── PODS ──────────────────────────────────────────────

  // v1.0+ returns the list object directly — no .body wrapper
  async getAllPods(): Promise<k8s.V1Pod[]> {
    const res = await this.coreV1Api.listPodForAllNamespaces();
    return res.items;
  }

  // v1.0+ namespaced calls take a request object, not a string
  async getPodsByNamespace(namespace: string): Promise<k8s.V1Pod[]> {
    const res = await this.coreV1Api.listNamespacedPod({ namespace });
    return res.items;
  }

  async getPod(namespace: string, name: string): Promise<k8s.V1Pod> {
    const res = await this.coreV1Api.readNamespacedPod({ name, namespace });
    return res;
  }

  // ── NODES ─────────────────────────────────────────────

  async getAllNodes(): Promise<k8s.V1Node[]> {
    const res = await this.coreV1Api.listNode();
    return res.items;
  }

  async getNode(name: string): Promise<k8s.V1Node> {
    const res = await this.coreV1Api.readNode({ name });
    return res;
  }

  // ── NAMESPACES ────────────────────────────────────────

  async getAllNamespaces(): Promise<k8s.V1Namespace[]> {
    const res = await this.coreV1Api.listNamespace();
    return res.items;
  }

  // ── DEPLOYMENTS ───────────────────────────────────────

  async getAllDeployments(): Promise<k8s.V1Deployment[]> {
    const res = await this.appsV1Api.listDeploymentForAllNamespaces();
    return res.items;
  }

  async getDeploymentsByNamespace(
    namespace: string,
  ): Promise<k8s.V1Deployment[]> {
    const res = await this.appsV1Api.listNamespacedDeployment({ namespace });
    return res.items;
  }

  async getDeployment(
    namespace: string,
    name: string,
  ): Promise<k8s.V1Deployment> {
    const res = await this.appsV1Api.readNamespacedDeployment({
      name,
      namespace,
    });
    return res;
  }

  // ── EVENTS ────────────────────────────────────────────

  async getAllEvents(): Promise<k8s.CoreV1Event[]> {
    const res = await this.coreV1Api.listEventForAllNamespaces();
    return res.items;
  }

  async getEventsByNamespace(namespace: string): Promise<k8s.CoreV1Event[]> {
    const res = await this.coreV1Api.listNamespacedEvent({ namespace });
    return res.items;
  }

  // ── HELPERS ───────────────────────────────────────────

  // Check if any container in the pod has restarted
  // more than the threshold — classic crash loop signal
  isPodCrashLooping(pod: k8s.V1Pod, threshold = 5): boolean {
    return (
      pod.status?.containerStatuses?.some(
        (cs) => cs.restartCount > threshold,
      ) ?? false
    );
  }

  // Flatten the complex k8s pod status into a simple string
  getPodStatus(pod: k8s.V1Pod): string {
    return pod.status?.phase ?? 'Unknown';
  }

  // Human-readable age — "2d", "5h", "30m"
  getPodAge(pod: k8s.V1Pod): string {
    const creationTime = pod.metadata?.creationTimestamp;
    if (!creationTime) return 'Unknown';

    const diffMs = Date.now() - new Date(creationTime).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return `${Math.floor(diffMs / (1000 * 60))}m`;
  }
}
