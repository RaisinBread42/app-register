/** Fictional seed data for [03] UI mockups only. Not real companies or people. */

export type MockAppStatus = 'ok' | 'notice_soon' | 'notice_urgent' | 'overdue';

export type MockApp = {
  id: string;
  name: string;
  kind: 'saas' | 'in_house' | 'citizen_built' | 'vendor_service';
  kindLabel: string;
  owner: string;
  backupOwner: string;
  vendorOrRuntime: string;
  renewalDate: string;
  noticeDeadline: string;
  costLabel: string;
  status: MockAppStatus;
  statusLabel: string;
  billingCycle?: string;
  runtimeLocation?: string;
  dataAndKeys?: string;
  whatBreaksIfStopped?: string;
};

export const MOCK_ORG = {
  name: 'Meridian Labs',
  tagline: 'Fictional 180-person product company',
  itTeam: 'IT team of 3',
};

export const MOCK_PEOPLE = [
  {id: 'p1', name: 'Priya Chen', email: 'priya.chen@meridian-labs.example'},
  {id: 'p2', name: 'Marcus Okonkwo', email: 'marcus.o@meridian-labs.example'},
  {id: 'p3', name: 'Elena Vogt', email: 'elena.vogt@meridian-labs.example'},
  {id: 'p4', name: 'Jordan Hale', email: 'jordan.hale@meridian-labs.example'},
] as const;

export const MOCK_APPS: MockApp[] = [
  {
    id: 'a1',
    name: 'Nimbus Mail',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Priya Chen',
    backupOwner: 'Marcus Okonkwo',
    vendorOrRuntime: 'Nimbus Softworks',
    renewalDate: '2027-03-01',
    noticeDeadline: '2026-12-01',
    costLabel: '$4,800 / yr',
    status: 'notice_urgent',
    statusLabel: 'Notice in 9 days',
    billingCycle: 'Annual',
  },
  {
    id: 'a2',
    name: 'Atlas Board',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Marcus Okonkwo',
    backupOwner: 'Priya Chen',
    vendorOrRuntime: 'Atlas Collective',
    renewalDate: '2027-06-15',
    noticeDeadline: '2027-04-16',
    costLabel: '$2,160 / yr',
    status: 'ok',
    statusLabel: 'On track',
    billingCycle: 'Annual',
  },
  {
    id: 'a3',
    name: 'Press Brake Logger',
    kind: 'in_house',
    kindLabel: 'In-house',
    owner: 'Elena Vogt',
    backupOwner: 'Jordan Hale',
    vendorOrRuntime: 'On-prem VM shop-floor-02',
    renewalDate: '—',
    noticeDeadline: '—',
    costLabel: '—',
    status: 'ok',
    statusLabel: 'Owned',
    runtimeLocation: 'On-prem VM shop-floor-02',
    dataAndKeys: 'PLC credentials; production DB read role',
    whatBreaksIfStopped: 'Shift handoff checklist cannot be printed',
  },
  {
    id: 'a4',
    name: 'Sales Forecast Bot',
    kind: 'citizen_built',
    kindLabel: 'Citizen-built',
    owner: 'Jordan Hale',
    backupOwner: 'Elena Vogt',
    vendorOrRuntime: 'Hosted on team Vercel',
    renewalDate: '—',
    noticeDeadline: '—',
    costLabel: '—',
    status: 'ok',
    statusLabel: 'Owned',
    runtimeLocation: 'Vercel project forecast-bot (team account)',
    dataAndKeys: 'CRM export API key; Slack bot token',
    whatBreaksIfStopped: 'Monday forecast email to sales stops updating',
  },
  {
    id: 'a5',
    name: 'Sentinel Access',
    kind: 'vendor_service',
    kindLabel: 'Vendor service',
    owner: 'Priya Chen',
    backupOwner: 'Elena Vogt',
    vendorOrRuntime: 'Sentinel MSP',
    renewalDate: '2027-01-10',
    noticeDeadline: '2026-11-11',
    costLabel: '$9,600 / yr',
    status: 'overdue',
    statusLabel: 'Notice window passed',
    billingCycle: 'Annual',
  },
  {
    id: 'a6',
    name: 'Harbor CRM',
    kind: 'saas',
    kindLabel: 'SaaS',
    owner: 'Marcus Okonkwo',
    backupOwner: 'Jordan Hale',
    vendorOrRuntime: 'Harbor Systems',
    renewalDate: '2027-05-01',
    noticeDeadline: '2027-02-01',
    costLabel: '$12,000 / yr',
    status: 'notice_soon',
    statusLabel: 'Notice in ~70 days',
    billingCycle: 'Annual',
  },
];

export function statusBadgeVariant(
  status: MockAppStatus,
): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'ok':
      return 'success';
    case 'notice_soon':
      return 'warning';
    case 'notice_urgent':
      return 'error';
    case 'overdue':
      return 'error';
    default:
      return 'neutral';
  }
}
