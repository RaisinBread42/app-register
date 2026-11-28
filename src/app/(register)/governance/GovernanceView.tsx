'use client';

import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {BOARD_HEALTH_STATE, GOVERNANCE_HANDLED_DAYS, OVERVIEW_OVERDUE_DAYS, ROUTES, type BoardHealthState} from '@/lib/constants';
import type {App, MonitoringSource, Notice, Person} from '@/lib/ui/api-client';
import {NOTICE_CATEGORY_LABEL, NOTICE_SEVERITY_LABEL} from '@/lib/ui/copy';
import {
  accountability,
  deadlines,
  executiveSummary,
  openBySeverity,
  outstandingRisk,
  portfolioHealth,
  type CategoryRisk,
  type DatedItem,
  type Figure,
  type NamedLink,
} from '@/lib/ui/governance';
import {checkStatusLine} from '@/lib/ui/overview';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {CardLink, PanelCard} from '../_components/Cards';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

type Props = {apps: App[]; people: Person[]; notices: Notice[]; sources: MonitoringSource[] | null; today: string; now: string};

const STATE_LABEL: Record<BoardHealthState, string> = {
  [BOARD_HEALTH_STATE.healthy]: 'Healthy',
  [BOARD_HEALTH_STATE.attention]: 'Need attention',
  [BOARD_HEALTH_STATE.critical]: 'Critical',
  [BOARD_HEALTH_STATE.stale]: 'Data out of date',
  [BOARD_HEALTH_STATE.insufficient]: 'Insufficient data',
};
const STATE_ORDER = [BOARD_HEALTH_STATE.critical, BOARD_HEALTH_STATE.attention, BOARD_HEALTH_STATE.stale, BOARD_HEALTH_STATE.insufficient, BOARD_HEALTH_STATE.healthy];
/** Long lists show the first few; the drill-down shows the rest. */
const LIST_LIMIT = 8;
const column = (share: number) => proportional(share, {minWidth: 72});

/**
 * The Governance Board ([49]): an executive summary first, then the figures behind it,
 * each linking to the existing list that shows the items. A light oversight layer: no
 * new monitoring, no data entry, no decorative charts (spec §7).
 */
export function GovernanceView({apps, people, notices, sources, today, now}: Props) {
  const health = portfolioHealth(apps);
  const risk = outstandingRisk(notices, today);
  const severities = openBySeverity(notices);
  const owners = accountability(apps, people, notices);
  const dates = deadlines(apps, notices, today);
  const summary = executiveSummary(health, risk, owners, dates);

  return (
    <PageFrame crumbs={[{label: 'Governance'}]}>
      <PageHeader title="Governance" description={`As of ${formatDateTime(now)} · ${checkStatusLine(sources)}`} />
      <Card padding={5}>
        <VStack gap={2}>
          <Heading level={2}>Executive summary</Heading>
          {summary.map((sentence) => (
            <Text key={sentence}>{sentence}</Text>
          ))}
        </VStack>
      </Card>

      {apps.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to report yet"
            description="Governance figures come from the applications you register. Add the first one on Applications."
            actions={<Link href={ROUTES.applications}>Go to Applications</Link>}
          />
        </Card>
      ) : (
        <>
          <PanelCard title="Portfolio health" subtitle={`${health.coverage.checked} of ${health.coverage.total} applications have been checked by a source`}>
            <VStack paddingInline={5} paddingBlockEnd={5}>
              <FigureRow figures={STATE_ORDER.map((state) => ({label: STATE_LABEL[state], figure: health.byState[state]}))} />
            </VStack>
          </PanelCard>

          <PanelCard title="Outstanding risk" subtitle="Notices on active applications by kind, and where remediation stands" action={<CardLink label="All notices" href={ROUTES.notices} />}>
            <VStack gap={2} paddingInline={5} paddingBlockEnd={4}>
              <Heading level={3}>Open notices by severity</Heading>
              <FigureRow figures={severities.map((row) => ({label: NOTICE_SEVERITY_LABEL[row.severity], figure: row.open}))} />
            </VStack>
            <Table
              aria-label="Outstanding risk by kind"
              data={risk.map((row) => ({...row, id: row.category}))}
              idKey="id"
              columns={[
                {key: 'kind', header: 'Kind', width: proportional(1.6, {minWidth: 130}), renderCell: (row: CategoryRisk) => NOTICE_CATEGORY_LABEL[row.category]},
                {key: 'open', header: 'Open', width: column(0.8), renderCell: (row: CategoryRisk) => <FigureLink figure={row.open} label={`open: ${NOTICE_CATEGORY_LABEL[row.category]}`} />},
                {key: 'critical', header: 'Critical', width: column(0.8), renderCell: (row: CategoryRisk) => <FigureLink figure={row.critical} label={`critical, open: ${NOTICE_CATEGORY_LABEL[row.category]}`} />},
                {key: 'new', header: 'New', width: column(0.8), renderCell: (row: CategoryRisk) => String(row.newCount)},
                {key: 'reviewing', header: 'In review', width: column(0.9), renderCell: (row: CategoryRisk) => String(row.reviewing)},
                {key: 'snoozed', header: 'Snoozed', width: column(0.9), renderCell: (row: CategoryRisk) => <FigureLink figure={row.snoozed} label={`snoozed: ${NOTICE_CATEGORY_LABEL[row.category]}`} />},
                {key: 'handled', header: `Handled (${GOVERNANCE_HANDLED_DAYS} days)`, width: column(1.1), renderCell: (row: CategoryRisk) => <FigureLink figure={row.handledRecently} label={`handled recently: ${NOTICE_CATEGORY_LABEL[row.category]}`} />},
              ]}
            />
          </PanelCard>

          <Grid columns={{minWidth: 320, max: 2}} gap={4} align="start">
            <PanelCard title="Ownership and accountability" subtitle="Gaps in who answers for an application or a notice">
              <VStack gap={4} paddingInline={5} paddingBlockEnd={5}>
                <LinkList title="No backup owner" items={owners.noBackupOwner} empty="Every application has a backup owner." />
                <LinkList title="Owner has left" items={owners.ownerLeft} empty="No application is owned by someone who has left." />
                <LinkList
                  title={`Open notices with no owner (${owners.unassigned.count})`}
                  items={owners.unassigned.items}
                  empty="Every open notice has an owner."
                  moreHref={owners.unassigned.href}
                />
                <LinkList
                  title="Open items by owner"
                  items={owners.byOwner.map((row) => ({label: row.owner, detail: `${row.open} open · ${row.apps} ${row.apps === 1 ? 'app' : 'apps'}`, href: row.href}))}
                  empty="No application has an owner yet."
                  moreHref={ROUTES.applications}
                />
              </VStack>
            </PanelCard>

            <PanelCard title="Overdue and upcoming" subtitle="Notice deadlines and renewals, and snoozes past their end">
              <VStack gap={4} paddingInline={5} paddingBlockEnd={5}>
                <DateList title={`Notice deadline passed (last ${OVERVIEW_OVERDUE_DAYS} days)`} items={dates.overdue} empty="No notice deadline has just passed." />
                <LinkList title="Snoozes past their end" items={dates.snoozesEnded} empty="No snooze has run past its date." />
                {dates.upcoming.map((window) => (
                  <DateList key={window.days} title={`In the next ${window.days} days`} items={window.items} empty="Nothing due." />
                ))}
              </VStack>
            </PanelCard>
          </Grid>
        </>
      )}
    </PageFrame>
  );
}

/** A row of numbers, each linking to the list behind it, with its word below (never colour alone). */
function FigureRow({figures}: {figures: {label: string; figure: Figure}[]}) {
  return (
    <Grid columns={{minWidth: 120, max: 5}} gap={4}>
      {figures.map(({label, figure}) => (
        <VStack key={label} gap={0.5}>
          <Link href={figure.href} weight="bold" size="lg" label={`${figure.count} ${label}`}>
            {String(figure.count)}
          </Link>
          <Text type="supporting" color="secondary">
            {label}
          </Text>
        </VStack>
      ))}
    </Grid>
  );
}

/** A count in the risk table; its accessible name says what it counts, since the number alone does not. */
function FigureLink({figure, label}: {figure: Figure; label: string}) {
  return (
    <Link href={figure.href} label={`${figure.count} ${label}`}>
      {String(figure.count)}
    </Link>
  );
}

function LinkList({title, items, empty, moreHref}: {title: string; items: NamedLink[]; empty: string; moreHref?: string}) {
  return (
    <VStack gap={1}>
      <Heading level={3}>{title}</Heading>
      {items.length === 0 ? (
        <Text size="sm" color="secondary">
          {empty}
        </Text>
      ) : (
        items.slice(0, LIST_LIMIT).map((item, index) => (
          <VStack key={`${item.href}-${index}`} gap={0}>
            {index > 0 && <Divider />}
            <HStack gap={2} hAlign="between" paddingBlock={1} wrap="wrap">
              <Link href={item.href} size="sm">
                {item.label}
              </Link>
              <Text type="supporting" color="secondary">
                {item.detail}
              </Text>
            </HStack>
          </VStack>
        ))
      )}
      {items.length > LIST_LIMIT && moreHref && <Link href={moreHref} size="sm">{`See all ${items.length}`}</Link>}
    </VStack>
  );
}

function DateList({title, items, empty}: {title: string; items: DatedItem[]; empty: string}) {
  return <LinkList title={title} items={items.map((item) => ({label: item.label, detail: formatDate(item.date), href: item.href}))} empty={empty} />;
}
