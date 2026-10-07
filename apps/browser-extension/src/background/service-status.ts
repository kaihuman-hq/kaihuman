/**
 * The start page's traffic lights for the services the user depends on.
 *
 * Every status page is read straight from the extension: its pages and worker are exempt from CORS
 * for hosts the manifest's `host_permissions` cover, and AWS is the one provider that sends no CORS
 * header at all.
 */

/** Repo file listing the services to watch. Without one, {@link DEFAULT_SERVICES} are watched. */
export const STATUS_CONFIG_PATH = '.kh/browser.status.json';

/** How long a check is shown before the next start page checks again. */
export const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

/** A check that failed shows the last answer for this long, then gives up and shows unknown. */
export const STATUS_STALE_LIMIT_MS = 30 * 60 * 1000;

export type ServiceConfig =
  | {
      type: 'statuspage';
      name: string;
      /** The status page's root, e.g. `https://www.githubstatus.com`. */
      url: string;
      /** Only these components count, by name; the page's overall status otherwise. */
      components?: string[];
    }
  | { type: 'aws'; name: string /** Region codes, e.g. `eu-central-1`. */; regions?: string[] }
  | { type: 'gcp'; name: string /** Product names as GCP lists them. */; products?: string[] };

export type StatusLevel = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

export interface ServiceStatus {
  name: string;
  level: StatusLevel;
  description: string;
  /** The human-readable status page, which the light links to. */
  link: string;
  checkedAt: number;
  /** The latest check failed, so this is the answer from before it. */
  stale?: boolean;
}

/** What lives in `chrome.storage.local` under `serviceStatusCache`. */
export interface ServiceStatusCache {
  /** The services the statuses were checked for, so an edited config is checked afresh. */
  services: ServiceConfig[];
  statuses: ServiceStatus[];
  fetchedAt: number;
}

export const DEFAULT_SERVICES: ServiceConfig[] = [
  { type: 'statuspage', name: 'GitHub', url: 'https://www.githubstatus.com' },
  { type: 'statuspage', name: 'Claude', url: 'https://status.claude.com' },
  { type: 'aws', name: 'AWS', regions: ['eu-central-1', 'us-east-1'] },
  { type: 'statuspage', name: 'Cloudflare', url: 'https://www.cloudflarestatus.com' },
  { type: 'gcp', name: 'GCP' },
];

const AWS_EVENTS_URL = 'https://health.aws.amazon.com/public/currentevents';
const AWS_LINK = 'https://health.aws.amazon.com/health/status';
const GCP_INCIDENTS_URL = 'https://status.cloud.google.com/incidents.json';
const GCP_LINK = 'https://status.cloud.google.com';

const SEVERITY: Record<StatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  outage: 3,
  unknown: -1,
};

const worse = (a: StatusLevel, b: StatusLevel) => (SEVERITY[b] > SEVERITY[a] ? b : a);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isHttpsUrl = (value: unknown): value is string => {
  try {
    return new URL(value as string).protocol === 'https:';
  } catch {
    return false;
  }
};

function parseService(raw: unknown, index: number): ServiceConfig {
  const service = raw as Record<string, unknown> | null;
  const where = `${STATUS_CONFIG_PATH}: service ${index}`;
  if (typeof service?.name !== 'string' || !service.name.trim()) {
    throw new Error(`${where} is missing a "name"`);
  }
  const name = service.name.trim();
  const list = (key: string) => {
    const value = service[key];
    if (value === undefined) return undefined;
    if (!isStringList(value))
      throw new Error(`${where} ("${name}"): "${key}" must be a list of strings`);
    return value;
  };
  switch (service.type) {
    case 'statuspage': {
      if (!isHttpsUrl(service.url)) {
        throw new Error(`${where} ("${name}") needs an https "url"`);
      }
      const components = list('components');
      return { type: 'statuspage', name, url: service.url, ...(components && { components }) };
    }
    case 'aws': {
      const regions = list('regions');
      return { type: 'aws', name, ...(regions && { regions }) };
    }
    case 'gcp': {
      const products = list('products');
      return { type: 'gcp', name, ...(products && { products }) };
    }
    default:
      throw new Error(`${where} ("${name}"): "type" must be "statuspage", "aws" or "gcp"`);
  }
}

export function parseStatusConfig(content: string): ServiceConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${STATUS_CONFIG_PATH} is not valid JSON`);
  }
  const services = (parsed as { services?: unknown } | null)?.services;
  if (!Array.isArray(services))
    throw new Error(`${STATUS_CONFIG_PATH} is missing a "services" array`);
  return services.map(parseService);
}

// ─── Statuspage (GitHub, Claude, Cloudflare, …) ─────────────────────────────

const INDICATOR: Record<string, StatusLevel> = {
  none: 'operational',
  minor: 'degraded',
  major: 'outage',
  critical: 'outage',
  maintenance: 'maintenance',
};

const COMPONENT: Record<string, StatusLevel> = {
  operational: 'operational',
  degraded_performance: 'degraded',
  partial_outage: 'degraded',
  major_outage: 'outage',
  under_maintenance: 'maintenance',
};

const COMPONENT_LABEL: Record<string, string> = {
  degraded_performance: 'degraded performance',
  partial_outage: 'partial outage',
  major_outage: 'major outage',
  under_maintenance: 'under maintenance',
};

type Fetch = typeof fetch;

async function getJson(fetchFn: Fetch, url: string): Promise<unknown> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

type Check = Omit<ServiceStatus, 'name' | 'checkedAt' | 'link'>;

async function checkStatuspage(
  fetchFn: Fetch,
  service: Extract<ServiceConfig, { type: 'statuspage' }>,
): Promise<Check> {
  const root = service.url.replace(/\/+$/, '');
  // The overall status is a 200-byte file; only a component filter needs the full summary.
  if (!service.components) {
    const { status } = (await getJson(fetchFn, `${root}/api/v2/status.json`)) as {
      status?: { indicator?: string; description?: string };
    };
    return {
      level: INDICATOR[status?.indicator ?? ''] ?? 'unknown',
      description: status?.description ?? 'No status reported',
    };
  }

  const { components = [] } = (await getJson(fetchFn, `${root}/api/v2/summary.json`)) as {
    components?: { name: string; status: string }[];
  };
  const wanted = new Set(service.components.map((name) => name.toLowerCase()));
  const matched = components.filter((component) => wanted.has(component.name.toLowerCase()));
  if (matched.length === 0) {
    return { level: 'unknown', description: `None of ${service.components.join(', ')} found` };
  }
  const level = matched.reduce<StatusLevel>(
    (current, component) => worse(current, COMPONENT[component.status] ?? 'unknown'),
    'operational',
  );
  const affected = matched
    .filter((component) => component.status !== 'operational')
    .map(
      (component) => `${component.name}: ${COMPONENT_LABEL[component.status] ?? component.status}`,
    );
  return { level, description: affected.join('; ') || 'All watched components operational' };
}

// ─── AWS Health Dashboard ───────────────────────────────────────────────────

interface AwsEvent {
  arn?: string;
  status?: string;
  service_name?: string;
  region_name?: string;
  summary?: string;
}

/** 1 is informational, 2 a performance issue, 3 a disruption; 0 has been resolved. */
const AWS_STATUS: Record<string, StatusLevel> = { '1': 'degraded', '2': 'degraded', '3': 'outage' };

/** `arn:aws:health:eu-central-1::event/…` → `eu-central-1`; global events read `global`. */
const awsRegionOf = (arn: string) => arn.split(':')[3] ?? '';

async function checkAws(
  fetchFn: Fetch,
  service: Extract<ServiceConfig, { type: 'aws' }>,
): Promise<Check> {
  const response = await fetchFn(AWS_EVENTS_URL);
  if (!response.ok) throw new Error(`${AWS_EVENTS_URL} answered ${response.status}`);
  // AWS serves this as UTF-16 — big-endian, by its byte order mark — which `response.json()`
  // would read as UTF-8 and fail on.
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoding = bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-16le';
  const events = JSON.parse(new TextDecoder(encoding).decode(bytes)) as AwsEvent[];

  const regions = service.regions && new Set([...service.regions, 'global']);
  const open = events
    .filter((event) => !regions || regions.has(awsRegionOf(event.arn ?? '')))
    .map((event) => ({ event, level: AWS_STATUS[event.status ?? ''] }))
    .filter((entry): entry is { event: AwsEvent; level: StatusLevel } => !!entry.level);
  if (open.length === 0) return { level: 'operational', description: 'No open events' };

  const level = open.reduce<StatusLevel>(
    (current, entry) => worse(current, entry.level),
    'operational',
  );
  return {
    level,
    description: open
      .map(({ event }) => `${event.service_name} (${event.region_name}): ${event.summary}`)
      .join('; '),
  };
}

// ─── Google Cloud ───────────────────────────────────────────────────────────

interface GcpIncident {
  end?: string;
  severity?: string;
  external_desc?: string;
  affected_products?: { title: string }[];
}

async function checkGcp(
  fetchFn: Fetch,
  service: Extract<ServiceConfig, { type: 'gcp' }>,
): Promise<Check> {
  const incidents = (await getJson(fetchFn, GCP_INCIDENTS_URL)) as GcpIncident[];
  const products = service.products && new Set(service.products.map((name) => name.toLowerCase()));
  // The feed keeps resolved incidents too; an open one has no end yet.
  const open = incidents.filter(
    (incident) =>
      !incident.end &&
      (!products ||
        (incident.affected_products ?? []).some((product) =>
          products.has(product.title.toLowerCase()),
        )),
  );
  if (open.length === 0) return { level: 'operational', description: 'No open incidents' };
  return {
    level: open.some((incident) => incident.severity === 'high') ? 'outage' : 'degraded',
    description: open.map((incident) => incident.external_desc?.trim()).join('; '),
  };
}

// ─── Checking ───────────────────────────────────────────────────────────────

export const statusLinkOf = (service: ServiceConfig) =>
  service.type === 'statuspage' ? service.url : service.type === 'aws' ? AWS_LINK : GCP_LINK;

const check = (fetchFn: Fetch, service: ServiceConfig): Promise<Check> =>
  service.type === 'statuspage'
    ? checkStatuspage(fetchFn, service)
    : service.type === 'aws'
      ? checkAws(fetchFn, service)
      : checkGcp(fetchFn, service);

/**
 * Checks every service at once. One that fails keeps the answer `previous` had for it, marked
 * stale, until that is {@link STATUS_STALE_LIMIT_MS} old — a status page being unreachable says
 * nothing about the service itself.
 */
export async function checkServices(
  services: ServiceConfig[],
  previous: ServiceStatus[],
  fetchFn: Fetch = fetch,
  now = Date.now(),
): Promise<ServiceStatus[]> {
  return Promise.all(
    services.map(async (service): Promise<ServiceStatus> => {
      const link = statusLinkOf(service);
      try {
        return { name: service.name, link, checkedAt: now, ...(await check(fetchFn, service)) };
      } catch (error) {
        const last = previous.find((status) => status.name === service.name);
        if (last && last.level !== 'unknown' && now - last.checkedAt <= STATUS_STALE_LIMIT_MS) {
          return { ...last, link, stale: true };
        }
        return {
          name: service.name,
          link,
          checkedAt: now,
          level: 'unknown',
          description: `Could not check: ${(error as Error).message}`,
        };
      }
    }),
  );
}

export const isStatusCacheFresh = (
  cache: ServiceStatusCache,
  services: ServiceConfig[],
  now = Date.now(),
) =>
  now - cache.fetchedAt <= STATUS_CACHE_TTL_MS &&
  JSON.stringify(cache.services) === JSON.stringify(services);
