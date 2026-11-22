/** Fictional Meridian Labs seed data for [03] v2 mockups. Demo only. */

export type Severity = 'ok' | 'attention' | 'critical';
export type NoticeCategory =
  | 'vulnerability'
  | 'dependency_update'
  | 'licence_renewal'
  | 'pricing_change'
  | 'hosting_outage'
  | 'platform_update'
  | 'retirement';

export type CategoryHealth = {
  key: 'dependencies' | 'hosting' | 'licence' | 'pricing';
  label: string;
  severity: Severity;
  okCount: number;
  attentionCount: number;
  criticalCount: number;
  deduction: number;
  reasons: string[];
};

export type MockApp = {
  id: string;
  name: string;
  kind: 'saas' | 'in_house' | 'citizen_built' | 'vendor_service';
  kindLabel: string;
  owner: string;
  backupOwner: string;
  hasLicence: boolean;
  licenceStatus: Severity | null;
  licenceLabel: string;
  noticeDeadline: string;
  renewalDate: string;
  costLabel: string;
  healthScore: number;
  categories: CategoryHealth[];
  dependencies: {
    name: string;
    current: string;
    latest: string;
    vulns: string[];
    action: string;
  }[];
  hosting: {
    provider: string;
    service: string;
    region: string;
    version: string;
    support: string;
  }[];
};

export type MockNotice = {
  id: string;
  title: string;
  category: NoticeCategory;
  categoryLabel: string;
  severity: 'critical' | 'attention' | 'info';
  date: string;
  source: string;
  apps: string[];
  summary: string;
};

export type MockSource = {
  id: string;
  name: string;
  category: string;
  url: string;
  status: 'connected' | 'error' | 'stale';
  lastChecked: string;
  appsUsing: number;
};

export const MOCK_ORG = {
  name: 'Meridian Labs',
  tagline: 'Fictional 180-person product company',
  itTeam: 'IT team of 3',
};

/**
 * Scoring (shown in UI + report):
 * Start at 100. Deductions stack per category, floor at 0.
 * - Dependencies: −10 critical CVE, −5 high, −2 medium; −3 major behind, −1 minor behind
 * - Licence: −15 notice ≤30d, −8 ≤60d, −4 ≤90d, −20 overdue
 * - Pricing: −5 announced increase
 * - Hosting: −12 EOS ≤90d, −25 past EOS, −8 regional outage, −3 pending platform update
 * 100 = all checks clear. Sort apps by score ascending (worst first).
 */
export const SCORING_BLURB =
  'Health starts at 100. Critical CVEs −10, high −5; licence notice ≤30d −15 / overdue −20; hosting EOS ≤90d −12 / outage −8; pricing change −5.';

export const MOCK_APPS: MockApp[] = [
  {
    id: 'a5',
    name: 'Sentinel Access',
    kind: 'vendor_service',
    kindLabel: 'Vendor service',
    owner: 'Priya Chen',
    backupOwner: 'Elena Vogt',
    hasLicence: true,
    licenceStatus: 'critical',
    licenceLabel: 'Notice passed',
    noticeDeadline: '2026-11-11',
    renewalDate: '2027-01-10',
    costLabel: '$9,600 / yr',
    healthScore: 62,
    categories: [
      {
        key: 'licence',
        label: 'Licence',
        severity: 'critical',
        okCount: 0,
        attentionCount: 0,
        criticalCount: 1,
        deduction: 20,
        reasons: ['Notice window passed (deadline 2026-11-11)'],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'attention',
        okCount: 0,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 5,
        reasons: ['Vendor announced +12% on renewal'],
      },
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'ok',
        okCount: 2,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'attention',
        okCount: 1,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 13,
        reasons: [
          'Azure SQL Server 2016 EOS in 74 days (−12)',
          'Pending Azure platform maintenance (−3, capped with EOS)',
        ],
      },
    ],
    dependencies: [
      {
        name: 'sentinel-agent',
        current: '4.2.1',
        latest: '4.2.1',
        vulns: [],
        action: 'None',
      },
    ],
    hosting: [
      {
        provider: 'Azure',
        service: 'SQL Server',
        region: 'uksouth',
        version: '2016 SP3',
        support: 'EOS 2027-02-04',
      },
      {
        provider: 'Azure',
        service: 'App Service',
        region: 'uksouth',
        version: 'Linux Node 20',
        support: 'Supported',
      },
    ],
  },
  {
    id: 'a1',
    name: 'Nimbus Mail',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Priya Chen',
    backupOwner: 'Marcus Okonkwo',
    hasLicence: true,
    licenceStatus: 'critical',
    licenceLabel: 'Notice 9d',
    noticeDeadline: '2026-12-01',
    renewalDate: '2027-03-01',
    costLabel: '$4,800 / yr',
    healthScore: 75,
    categories: [
      {
        key: 'licence',
        label: 'Licence',
        severity: 'critical',
        okCount: 0,
        attentionCount: 0,
        criticalCount: 1,
        deduction: 15,
        reasons: ['Notice deadline in 9 days'],
      },
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'attention',
        okCount: 4,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 5,
        reasons: ['Browser extension SDK high advisory CVE-2026-44102 (−5)'],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'attention',
        okCount: 0,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 5,
        reasons: ['Nimbus Softworks list price +8% from Mar 2027'],
      },
    ],
    dependencies: [
      {
        name: 'nimbus-web-sdk',
        current: '3.4.0',
        latest: '3.5.2',
        vulns: ['CVE-2026-44102 (high)'],
        action: 'Upgrade to 3.5.2',
      },
    ],
    hosting: [
      {
        provider: 'Nimbus Softworks',
        service: 'SaaS (multi-tenant)',
        region: 'eu-west',
        version: 'n/a',
        support: 'Vendor-hosted',
      },
    ],
  },
  {
    id: 'a4',
    name: 'Sales Forecast Bot',
    kind: 'citizen_built',
    kindLabel: 'Citizen-built',
    owner: 'Jordan Hale',
    backupOwner: 'Elena Vogt',
    hasLicence: false,
    licenceStatus: null,
    licenceLabel: '—',
    noticeDeadline: '—',
    renewalDate: '—',
    costLabel: '—',
    healthScore: 82,
    categories: [
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'critical',
        okCount: 8,
        attentionCount: 0,
        criticalCount: 1,
        deduction: 13,
        reasons: [
          'next@14.0.3 → 15.1.x (−3 major)',
          'CVE-2026-55011 critical in lodash (−10)',
        ],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'attention',
        okCount: 1,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 5,
        reasons: ['Vercel project on personal team account (−5 governance)'],
      },
      {
        key: 'licence',
        label: 'Licence',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: ['No licence — N/A'],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
    ],
    dependencies: [
      {
        name: 'next',
        current: '14.0.3',
        latest: '15.1.4',
        vulns: [],
        action: 'Plan major upgrade',
      },
      {
        name: 'lodash',
        current: '4.17.20',
        latest: '4.17.21',
        vulns: ['CVE-2026-55011 (critical)'],
        action: 'Patch immediately',
      },
      {
        name: 'react',
        current: '18.3.1',
        latest: '19.0.0',
        vulns: [],
        action: 'Optional',
      },
    ],
    hosting: [
      {
        provider: 'Vercel',
        service: 'Hobby team',
        region: 'iad1',
        version: 'Node 20',
        support: 'Personal account risk',
      },
      {
        provider: 'Supabase',
        service: 'Postgres',
        region: 'eu-central-1',
        version: '15',
        support: 'Supported',
      },
    ],
  },
  {
    id: 'a6',
    name: 'Harbor CRM',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Marcus Okonkwo',
    backupOwner: 'Jordan Hale',
    hasLicence: true,
    licenceStatus: 'attention',
    licenceLabel: 'Notice ~70d',
    noticeDeadline: '2027-02-01',
    renewalDate: '2027-05-01',
    costLabel: '$12,000 / yr',
    healthScore: 92,
    categories: [
      {
        key: 'licence',
        label: 'Licence',
        severity: 'attention',
        okCount: 0,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 4,
        reasons: ['Notice deadline in ~70 days'],
      },
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'ok',
        okCount: 3,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'attention',
        okCount: 0,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 4,
        reasons: ['Seat price review flagged by vendor page'],
      },
    ],
    dependencies: [],
    hosting: [
      {
        provider: 'Harbor Systems',
        service: 'SaaS',
        region: 'us-east',
        version: 'n/a',
        support: 'Vendor-hosted',
      },
    ],
  },
  {
    id: 'a3',
    name: 'Press Brake Logger',
    kind: 'in_house',
    kindLabel: 'In-house',
    owner: 'Elena Vogt',
    backupOwner: 'Jordan Hale',
    hasLicence: false,
    licenceStatus: null,
    licenceLabel: '—',
    noticeDeadline: '—',
    renewalDate: '—',
    costLabel: '—',
    healthScore: 97,
    categories: [
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'attention',
        okCount: 6,
        attentionCount: 1,
        criticalCount: 0,
        deduction: 3,
        reasons: ['.NET 6 → 8 LTS recommended (−3)'],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'ok',
        okCount: 2,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'licence',
        label: 'Licence',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: ['No licence — N/A'],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
    ],
    dependencies: [
      {
        name: '.NET',
        current: '6.0',
        latest: '8.0 LTS',
        vulns: [],
        action: 'Schedule upgrade',
      },
    ],
    hosting: [
      {
        provider: 'On-prem',
        service: 'Windows VM',
        region: 'shop-floor-02',
        version: 'Server 2022',
        support: 'Supported',
      },
      {
        provider: 'On-prem',
        service: 'SQL Server',
        region: 'shop-floor-02',
        version: '2019',
        support: 'Supported until 2030',
      },
    ],
  },
  {
    id: 'a2',
    name: 'Atlas Board',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Marcus Okonkwo',
    backupOwner: 'Priya Chen',
    hasLicence: true,
    licenceStatus: 'ok',
    licenceLabel: 'On track',
    noticeDeadline: '2027-04-16',
    renewalDate: '2027-06-15',
    costLabel: '$2,160 / yr',
    healthScore: 100,
    categories: [
      {
        key: 'dependencies',
        label: 'Dependencies',
        severity: 'ok',
        okCount: 2,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'hosting',
        label: 'Hosting',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'licence',
        label: 'Licence',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
      {
        key: 'pricing',
        label: 'Pricing',
        severity: 'ok',
        okCount: 1,
        attentionCount: 0,
        criticalCount: 0,
        deduction: 0,
        reasons: [],
      },
    ],
    dependencies: [],
    hosting: [
      {
        provider: 'Atlas Collective',
        service: 'SaaS',
        region: 'eu-central',
        version: 'n/a',
        support: 'Vendor-hosted',
      },
    ],
  },
];

export const MOCK_NOTICES: MockNotice[] = [
  {
    id: 'n1',
    title: 'CVE-2026-55011 in lodash (critical)',
    category: 'vulnerability',
    categoryLabel: 'Vulnerability',
    severity: 'critical',
    date: '2026-11-18',
    source: 'GitHub Security Advisories',
    apps: ['Sales Forecast Bot'],
    summary: 'Prototype pollution in lodash < 4.17.21. Demo CVE id.',
  },
  {
    id: 'n2',
    title: 'Nimbus Mail notice deadline in 9 days',
    category: 'licence_renewal',
    categoryLabel: 'Licence renewal',
    severity: 'critical',
    date: '2026-11-20',
    source: 'Contract register',
    apps: ['Nimbus Mail'],
    summary: 'Written notice required by 2026-12-01 or auto-renews.',
  },
  {
    id: 'n3',
    title: 'Azure SQL Server 2016 end of support',
    category: 'retirement',
    categoryLabel: 'Retirement notice',
    severity: 'attention',
    date: '2026-11-12',
    source: 'Microsoft lifecycle',
    apps: ['Sentinel Access'],
    summary: 'EOS 2027-02-04 for SQL Server 2016 in uksouth.',
  },
  {
    id: 'n4',
    title: 'Cloudflare EU edge elevated errors',
    category: 'hosting_outage',
    categoryLabel: 'Hosting outage',
    severity: 'attention',
    date: '2026-11-21',
    source: 'Cloudflare status',
    apps: ['Sales Forecast Bot'],
    summary: 'Elevated 5xx in eu-central — monitoring only (demo).',
  },
  {
    id: 'n5',
    title: 'Nimbus Softworks +8% list price',
    category: 'pricing_change',
    categoryLabel: 'Pricing change',
    severity: 'info',
    date: '2026-11-10',
    source: 'Vendor pricing page',
    apps: ['Nimbus Mail'],
    summary: 'Applies on renewals after 2027-03-01.',
  },
  {
    id: 'n6',
    title: 'next 15.1 available (major)',
    category: 'dependency_update',
    categoryLabel: 'Dependency update',
    severity: 'attention',
    date: '2026-11-08',
    source: 'npm registry',
    apps: ['Sales Forecast Bot'],
    summary: 'App still on next@14.0.3.',
  },
  {
    id: 'n7',
    title: 'Sentinel Access notice window passed',
    category: 'licence_renewal',
    categoryLabel: 'Licence renewal',
    severity: 'critical',
    date: '2026-11-12',
    source: 'Contract register',
    apps: ['Sentinel Access'],
    summary: 'Deadline was 2026-11-11 — escalate to finance.',
  },
];

export const MOCK_SOURCES: MockSource[] = [
  {
    id: 's1',
    name: 'GitHub Security Advisories',
    category: 'Dependencies',
    url: 'https://github.com/advisories (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 18:40 UTC',
    appsUsing: 3,
  },
  {
    id: 's2',
    name: 'npm registry',
    category: 'Dependencies',
    url: 'https://registry.npmjs.org (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 18:35 UTC',
    appsUsing: 2,
  },
  {
    id: 's3',
    name: 'AWS Health / status',
    category: 'Hosting',
    url: 'https://health.aws.amazon.com (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 18:30 UTC',
    appsUsing: 0,
  },
  {
    id: 's4',
    name: 'Azure status',
    category: 'Hosting',
    url: 'https://status.azure.com (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 18:30 UTC',
    appsUsing: 1,
  },
  {
    id: 's5',
    name: 'Cloudflare status',
    category: 'Hosting',
    url: 'https://www.cloudflarestatus.com (demo)',
    status: 'stale',
    lastChecked: '2026-11-20 09:12 UTC',
    appsUsing: 1,
  },
  {
    id: 's6',
    name: 'Microsoft product lifecycle',
    category: 'Hosting',
    url: 'https://learn.microsoft.com/lifecycle (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 12:00 UTC',
    appsUsing: 2,
  },
  {
    id: 's7',
    name: 'Nimbus Softworks pricing',
    category: 'Pricing',
    url: 'https://nimbus.example/pricing (demo)',
    status: 'error',
    lastChecked: '2026-11-21 17:55 UTC',
    appsUsing: 1,
  },
  {
    id: 's8',
    name: 'Contract register (internal)',
    category: 'Licence',
    url: 'app-register://contracts (demo)',
    status: 'connected',
    lastChecked: '2026-11-21 18:00 UTC',
    appsUsing: 4,
  },
];

export function appsByHealthAsc(): MockApp[] {
  return [...MOCK_APPS].sort((a, b) => a.healthScore - b.healthScore);
}

export function averageHealth(): number {
  const sum = MOCK_APPS.reduce((acc, a) => acc + a.healthScore, 0);
  return Math.round(sum / MOCK_APPS.length);
}

export function severityBadgeVariant(
  severity: Severity | 'critical' | 'attention' | 'info' | 'ok',
): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (severity === 'ok') return 'success';
  if (severity === 'attention') return 'warning';
  if (severity === 'critical') return 'error';
  if (severity === 'info') return 'info';
  return 'neutral';
}

export function healthVariant(
  score: number,
): 'success' | 'warning' | 'error' | 'accent' {
  if (score >= 95) return 'success';
  if (score >= 80) return 'warning';
  return 'error';
}
