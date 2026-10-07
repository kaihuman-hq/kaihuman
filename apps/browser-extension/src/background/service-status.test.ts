import { describe, expect, it, vi } from 'vitest';
import {
  checkServices,
  DEFAULT_SERVICES,
  isStatusCacheFresh,
  parseStatusConfig,
  type ServiceConfig,
  type ServiceStatus,
  STATUS_CACHE_TTL_MS,
  STATUS_STALE_LIMIT_MS,
} from './service-status';

const NOW = 1_800_000_000_000;

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** AWS answers in big-endian UTF-16 with a byte order mark, which is what this reproduces. */
const utf16 = (body: unknown) => {
  const text = `﻿${JSON.stringify(body)}`;
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code >> 8;
    bytes[i * 2 + 1] = code & 0xff;
  }
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
};

const fetchOf = (routes: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    if (!(url in routes)) throw new Error(`Unexpected request to ${url}`);
    return routes[url];
  }) as unknown as typeof fetch;

const checkOne = async (service: ServiceConfig, routes: Record<string, unknown>) =>
  (await checkServices([service], [], fetchOf(routes), NOW))[0];

describe('parseStatusConfig', () => {
  it('reads every kind of service', () => {
    const services = parseStatusConfig(
      JSON.stringify({
        services: [
          { name: 'GitHub', type: 'statuspage', url: 'https://www.githubstatus.com' },
          { name: 'CF', type: 'statuspage', url: 'https://x.test', components: ['CDN/Cache'] },
          { name: 'AWS', type: 'aws', regions: ['eu-central-1'] },
          { name: 'GCP', type: 'gcp', products: ['Compute Engine'] },
        ],
      }),
    );
    expect(services).toEqual([
      { type: 'statuspage', name: 'GitHub', url: 'https://www.githubstatus.com' },
      { type: 'statuspage', name: 'CF', url: 'https://x.test', components: ['CDN/Cache'] },
      { type: 'aws', name: 'AWS', regions: ['eu-central-1'] },
      { type: 'gcp', name: 'GCP', products: ['Compute Engine'] },
    ]);
  });

  it('names what is wrong with a broken file', () => {
    expect(() => parseStatusConfig('{')).toThrow('not valid JSON');
    expect(() => parseStatusConfig('{}')).toThrow('missing a "services" array');
    expect(() => parseStatusConfig('{"services":[{"type":"aws"}]}')).toThrow('missing a "name"');
    expect(() => parseStatusConfig('{"services":[{"name":"X","type":"azure"}]}')).toThrow(
      '"type" must be',
    );
    expect(() =>
      parseStatusConfig('{"services":[{"name":"X","type":"statuspage","url":"http://x.test"}]}'),
    ).toThrow('https "url"');
    expect(() =>
      parseStatusConfig('{"services":[{"name":"X","type":"aws","regions":"us-east-1"}]}'),
    ).toThrow('"regions" must be a list of strings');
  });
});

describe('Statuspage', () => {
  const github: ServiceConfig = {
    type: 'statuspage',
    name: 'GitHub',
    url: 'https://www.githubstatus.com/',
  };

  it.each([
    ['none', 'operational'],
    ['minor', 'degraded'],
    ['major', 'outage'],
    ['critical', 'outage'],
    ['maintenance', 'maintenance'],
  ])('reads the overall indicator %s as %s', async (indicator, level) => {
    const status = await checkOne(github, {
      'https://www.githubstatus.com/api/v2/status.json': json({
        status: { indicator, description: 'Words' },
      }),
    });
    expect(status).toEqual({
      name: 'GitHub',
      link: 'https://www.githubstatus.com/',
      checkedAt: NOW,
      level,
      description: 'Words',
    });
  });

  it('counts only the watched components, at the worst of them', async () => {
    const status = await checkOne(
      { ...github, components: ['git operations', 'Actions'] },
      {
        'https://www.githubstatus.com/api/v2/summary.json': json({
          components: [
            { name: 'Git Operations', status: 'partial_outage' },
            { name: 'Actions', status: 'operational' },
            { name: 'Pages', status: 'major_outage' },
          ],
        }),
      },
    );
    expect(status.level).toBe('degraded');
    expect(status.description).toBe('Git Operations: partial outage');
  });

  it('is unknown when no watched component exists', async () => {
    const status = await checkOne(
      { ...github, components: ['Nope'] },
      { 'https://www.githubstatus.com/api/v2/summary.json': json({ components: [] }) },
    );
    expect(status.level).toBe('unknown');
  });
});

describe('AWS', () => {
  const events = [
    {
      arn: 'arn:aws:health:me-central-1::event/MULTIPLE_SERVICES/X/1',
      status: '3',
      service_name: 'Multiple services',
      region_name: 'UAE',
      summary: 'Region Availability',
    },
    {
      arn: 'arn:aws:health:eu-central-1::event/EC2/X/2',
      status: '2',
      service_name: 'Amazon EC2',
      region_name: 'Frankfurt',
      summary: 'Increased latencies',
    },
    {
      arn: 'arn:aws:health:us-east-1::event/S3/X/3',
      status: '0',
      service_name: 'Amazon S3',
      region_name: 'N. Virginia',
      summary: 'Resolved',
    },
  ];
  const routes = { 'https://health.aws.amazon.com/public/currentevents': utf16(events) };

  it('decodes the UTF-16 feed and keeps to the watched regions', async () => {
    const status = await checkOne(
      { type: 'aws', name: 'AWS', regions: ['eu-central-1', 'us-east-1'] },
      routes,
    );
    expect(status.level).toBe('degraded');
    expect(status.description).toBe('Amazon EC2 (Frankfurt): Increased latencies');
    expect(status.link).toBe('https://health.aws.amazon.com/health/status');
  });

  it('counts every region when none are listed', async () => {
    expect((await checkOne({ type: 'aws', name: 'AWS' }, routes)).level).toBe('outage');
  });

  it('is operational with no open event in the watched regions', async () => {
    const status = await checkOne({ type: 'aws', name: 'AWS', regions: ['us-east-1'] }, routes);
    expect(status).toMatchObject({ level: 'operational', description: 'No open events' });
  });
});

describe('GCP', () => {
  const incidents = [
    {
      end: '2026-09-01T18:52:00+00:00',
      severity: 'high',
      external_desc: 'Over',
      affected_products: [{ title: 'Compute Engine' }],
    },
    {
      severity: 'medium',
      external_desc: 'BigQuery is slow',
      affected_products: [{ title: 'BigQuery' }],
    },
  ];
  const routes = { 'https://status.cloud.google.com/incidents.json': json(incidents) };

  it('counts open incidents only', async () => {
    const status = await checkOne({ type: 'gcp', name: 'GCP' }, routes);
    expect(status).toMatchObject({ level: 'degraded', description: 'BigQuery is slow' });
  });

  it('keeps to the watched products', async () => {
    const status = await checkOne(
      { type: 'gcp', name: 'GCP', products: ['compute engine'] },
      routes,
    );
    expect(status.level).toBe('operational');
  });

  it('reads a high-severity open incident as an outage', async () => {
    const status = await checkOne(
      { type: 'gcp', name: 'GCP' },
      {
        'https://status.cloud.google.com/incidents.json': json([
          { severity: 'high', external_desc: 'Down', affected_products: [] },
        ]),
      },
    );
    expect(status.level).toBe('outage');
  });
});

describe('a failed check', () => {
  const service: ServiceConfig = { type: 'gcp', name: 'GCP' };
  const failing = fetchOf({
    'https://status.cloud.google.com/incidents.json': { ok: false, status: 503 },
  });
  const earlier = (checkedAt: number): ServiceStatus => ({
    name: 'GCP',
    link: 'https://status.cloud.google.com',
    level: 'operational',
    description: 'No open incidents',
    checkedAt,
  });

  it('shows the last answer, marked stale, while it is recent', async () => {
    const [status] = await checkServices([service], [earlier(NOW - 60_000)], failing, NOW);
    expect(status).toMatchObject({ level: 'operational', stale: true, checkedAt: NOW - 60_000 });
  });

  it('gives up on an answer older than the limit', async () => {
    const old = earlier(NOW - STATUS_STALE_LIMIT_MS - 1);
    const [status] = await checkServices([service], [old], failing, NOW);
    expect(status.level).toBe('unknown');
    expect(status.description).toContain('503');
  });

  it('does not take the other services down with it', async () => {
    const statuses = await checkServices(
      [service, { type: 'aws', name: 'AWS' }],
      [],
      fetchOf({
        'https://status.cloud.google.com/incidents.json': { ok: false, status: 503 },
        'https://health.aws.amazon.com/public/currentevents': utf16([]),
      }),
      NOW,
    );
    expect(statuses.map((status) => status.level)).toEqual(['unknown', 'operational']);
  });
});

describe('isStatusCacheFresh', () => {
  const cache = { services: DEFAULT_SERVICES, statuses: [], fetchedAt: NOW };

  it('holds for five minutes for the same services', () => {
    expect(isStatusCacheFresh(cache, DEFAULT_SERVICES, NOW + STATUS_CACHE_TTL_MS)).toBe(true);
    expect(isStatusCacheFresh(cache, DEFAULT_SERVICES, NOW + STATUS_CACHE_TTL_MS + 1)).toBe(false);
  });

  it('does not hold once the services change', () => {
    expect(isStatusCacheFresh(cache, DEFAULT_SERVICES.slice(1), NOW)).toBe(false);
  });
});
