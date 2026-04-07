import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';
import Redis from 'ioredis';

// How long we keep data in Redis before re-fetching from the cluster
// 30 seconds is a good balance — fresh enough to be useful,
// long enough to avoid hammering the k8s API on every request
const CACHE_TTL_SECONDS = 30;

@Injectable()
export class KubernetesService implements OnModuleInit {
  private readonly logger = new Logger(KubernetesService.name);
  private kc: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;

  constructor(
    private configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

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

  // ── CACHE HELPERS ─────────────────────────────────────

  // Generic cache-aside pattern:
  // 1. Check Redis for cached data
  // 2. If hit — return immediately (fast)
  // 3. If miss — fetch from k8s API, store in Redis, return
  // This pattern is used for every k8s API call below
  private async getCached<T>(
    key: string,
    fetchFn: () => Promise<T>,
  ): Promise<T> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      // If Redis is down, log but don't fail — fall through to k8s API
      this.logger.warn(`Redis error on key ${key}: ${err.message}`);
    }

    this.logger.debug(`Cache MISS: ${key} — fetching from cluster`);
    const data = await fetchFn();

    try {
      // EX sets the TTL in seconds — data expires automatically
      await this.redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Failed to cache ${key}: ${err.message}`);
    }

    return data;
  }

  // Manually invalidate all cached cluster data
  // Called by the metrics collector after each snapshot
  // so the next request always gets fresh data
  async invalidateCache(): Promise<void> {
    const keys = await this.redis.keys('k8s:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.debug(`Invalidated ${keys.length} cache keys`);
    }
  }

  // ── PODS ──────────────────────────────────────────────

  // we are using a higher-order function method to cache the data
  // this is a common pattern in nestjs to reduce code duplication
  //this is how it works : we give it the key and the callback function
  //that function is the one that will fetch the data from the cluster
  //if the key is found in the cache, it will return the data from the cache
  //if the key is not found in the cache, it will fetch the data from the cluster and store it in the cache
  async getAllPods(): Promise<k8s.V1Pod[]> {
    return this.getCached('k8s:pods:all', async () => {
      const res = await this.coreV1Api.listPodForAllNamespaces();
      return res.items;
    });
  }

  async getPodsByNamespace(namespace: string): Promise<k8s.V1Pod[]> {
    return this.getCached(`k8s:pods:ns:${namespace}`, async () => {
      const res = await this.coreV1Api.listNamespacedPod({ namespace });
      return res.items;
    });
  }

  // Single pod — shorter TTL since it's a specific resource
  async getPod(namespace: string, name: string): Promise<k8s.V1Pod> {
    return this.getCached(`k8s:pod:${namespace}:${name}`, async () => {
      const res = await this.coreV1Api.readNamespacedPod({ name, namespace });
      return res;
    });
  }

  // ── NODES ─────────────────────────────────────────────

  async getAllNodes(): Promise<k8s.V1Node[]> {
    return this.getCached('k8s:nodes:all', async () => {
      const res = await this.coreV1Api.listNode();
      return res.items;
    });
  }

  async getNode(name: string): Promise<k8s.V1Node> {
    return this.getCached(`k8s:node:${name}`, async () => {
      const res = await this.coreV1Api.readNode({ name });
      return res;
    });
  }

  // ── NAMESPACES ────────────────────────────────────────

  async getAllNamespaces(): Promise<k8s.V1Namespace[]> {
    return this.getCached('k8s:namespaces:all', async () => {
      const res = await this.coreV1Api.listNamespace();
      return res.items;
    });
  }

  // ── DEPLOYMENTS ───────────────────────────────────────

  async getAllDeployments(): Promise<k8s.V1Deployment[]> {
    return this.getCached('k8s:deployments:all', async () => {
      const res = await this.appsV1Api.listDeploymentForAllNamespaces();
      return res.items;
    });
  }

  async getDeploymentsByNamespace(
    namespace: string,
  ): Promise<k8s.V1Deployment[]> {
    return this.getCached(`k8s:deployments:ns:${namespace}`, async () => {
      const res = await this.appsV1Api.listNamespacedDeployment({ namespace });
      return res.items;
    });
  }

  async getDeployment(
    namespace: string,
    name: string,
  ): Promise<k8s.V1Deployment> {
    return this.getCached(`k8s:deployment:${namespace}:${name}`, async () => {
      const res = await this.appsV1Api.readNamespacedDeployment({
        name,
        namespace,
      });
      return res;
    });
  }

  // ── EVENTS ────────────────────────────────────────────

  async getAllEvents(): Promise<k8s.CoreV1Event[]> {
    return this.getCached('k8s:events:all', async () => {
      const res = await this.coreV1Api.listEventForAllNamespaces();
      return res.items;
    });
  }

  async getEventsByNamespace(namespace: string): Promise<k8s.CoreV1Event[]> {
    return this.getCached(`k8s:events:ns:${namespace}`, async () => {
      const res = await this.coreV1Api.listNamespacedEvent({ namespace });
      return res.items;
    });
  }

  // ── HELPERS ───────────────────────────────────────────

  isPodCrashLooping(pod: k8s.V1Pod, threshold = 5): boolean {
    return (
      pod.status?.containerStatuses?.some(
        (cs) => cs.restartCount > threshold,
      ) ?? false
    );
  }

  getPodStatus(pod: k8s.V1Pod): string {
    return pod.status?.phase ?? 'Unknown';
  }

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

  // Expose kc so ClusterService can read the cluster name
  getClusterName(): string {
    return this.kc.getCurrentCluster()?.name ?? 'unknown';
  }
}
