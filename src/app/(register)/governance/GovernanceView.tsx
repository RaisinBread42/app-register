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
import {APP_HEALTH_FILTER, HANDLED_RECENTLY_DAYS, OVERVIEW_OVERDUE_DAYS, ROUTES} from '@/lib/constants';
import type {App, MonitoringSource, Notice} from '@/lib/ui/api-client';
import {NOTICE_CATEGORY_LABEL, NOTICE_SEVERITY_LABEL} from '@/lib/ui/copy';
import {staleSources} from '@/lib/ui/freshness';
import {
  PORTFOLIO_FIGURES,
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
  type PortfolioFigure,
} from '@/lib/ui/governance';
import {checkStatusLine} from '@/lib/ui/overview';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {CardLink, PanelCard} from '../_components/Cards';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

type Props = {apps: App[]; activePersonIds: string[]; notices: Notice[]; sources: MonitoringSource[] | null; today: string; now: string};

/** Each portfolio figure's words: critical and out-of-date are counted among those needing attention. */
const FIGURE_LABEL: Record<PortfolioFigure, string> = {
  [APP_HEALTH_FILTER.attention]: 'Need attention',
  [APP_HEALTH_FILTER.critical]: 'of them critical',
  [APP_HEALTH_FILTER.stale]: 'of them on out-of-date data',
  [APP_HEALTH_FILTER.notMonitored]: 'Insufficient data',
  [APP_HEALTH_FILTER.healthy]: 'Healthy',
};
const column = (share: number) => proportional(share, {minWidth: 72});

/**
 * The Governance Board ([49]): an executive summary first, then the figures behind it,
 * each linking to the existing list that shows exactly those items. A light oversight
 * layer: no new monitoring, no data entry, no decorative charts (spec §7).
 */
export function GovernanceView({apps, activePersonIds, notices, sources, today, now}: Props) {
  const health = portfolioHealth(apps);
  const risk = outstandingRisk(notices, today);
  const severities = openBySeverity(notices, today);
  const owners = accountability(apps, activePersonIds, notices, today);
  const dates = deadlines(apps, notices, today);
  const summary = executiveSummary(health, risk, owners, dates, {staleSources: sources ? staleSources(sources, new Date(now)).length : 0});

  return (
    <PageFrame crumbs={[{label: 'Governance'}]}>
      <PageHeader title="Governance" description={`As of ${formatDateTime(now)} · ${checkStatusLine(sources)}`} />
      <Card padding={5}>
        <VStack gap={2}>
          <Heading level={2}>Executive summary</Heading>
          {summary.map((line) => (
            <Text key={line}>{line}</Text>
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
          <PanelCard title="Portfolio health" subtitle={`${health.coverage.checked} of ${health.coverage.total} applications have a health score`}>
            <FigureRow noun="applications" figures={PORTFOLIO_FIGURES.map((filter) => ({label: FIGURE_LABEL[filter], figure: health.figures[filter]}))} />
          </PanelCard>

          <PanelCard title="Outstanding risk" subtitle="Notices on active applications, and where remediation stands" action={<CardLink label="All notices" href={ROUTES.notices} />}>
            <VStack gap={4}>
              <VStack gap={2}>
                <Heading level={3}>Open notices by severity</Heading>
                <FigureRow noun="open notices" figures={severities.map((row) => ({label: NOTICE_SEVERITY_LABEL[row.severity], figure: row.open}))} />
              </VStack>
              <Table
                aria-label="Outstanding risk by kind"
                data={risk.map((row) => ({...row, id: row.category}))}
                idKey="id"
                columns={[
                  {key: 'kind', header: 'Kind', width: proportional(1.6, {minWidth: 130}), renderCell: (row: CategoryRisk) => NOTICE_CATEGORY_LABEL[row.category]},
                  {key: 'open', header: 'Open', width: column(0.8), renderCell: (row: CategoryRisk) => <FigureLink figure={row.open} label={`open ${NOTICE_CATEGORY_LABEL[row.category]} notices`} />},
                  {key: 'critical', header: 'Critical', width: column(0.8), renderCell: (row: CategoryRisk) => <FigureLink figure={row.critical} label={`critical open ${NOTICE_CATEGORY_LABEL[row.category]} notices`} />},
                  {key: 'new', header: 'of them new', width: column(0.9), renderCell: (row: CategoryRisk) => String(row.newCount)},
                  {key: 'reviewing', header: 'in review', width: column(0.9), renderCell: (row: CategoryRisk) => String(row.reviewing)},
                  {key: 'snoozed', header: 'Snoozed', width: column(0.9), renderCell: (row: CategoryRisk) => <FigureLink figure={row.snoozed} label={`snoozed ${NOTICE_CATEGORY_LABEL[row.category]} notices`} />},
                  {
                    key: 'handled',
                    header: `Handled (${HANDLED_RECENTLY_DAYS} days)`,
                    width: column(1.1),
                    renderCell: (row: CategoryRisk) => <FigureLink figure={row.handledRecently} label={`${NOTICE_CATEGORY_LABEL[row.category]} notices handled in the last ${HANDLED_RECENTLY_DAYS} days`} />,
                  },
                ]}
              />
            </VStack>
          </PanelCard>

          <Grid columns={{minWidth: 320, max: 2}} gap={4} align="start">
            <PanelCard title="Ownership and accountability" subtitle="Gaps in who answers for an application or a notice">
              <VStack gap={4}>
                <LinkList title="No active backup owner" items={owners.noActiveBackup} empty="Every application has an active backup owner." />
                <LinkList title="Owner no longer active" items={owners.ownerLeft} empty="Every application's owner is still active." />
                <LinkList title="Open notices with no owner" items={owners.unassigned} empty="Every open notice has an owner." />
                <LinkList
                  title="Open notices by owner"
                  items={owners.byOwner.map((row) => ({label: row.owner, detail: `${row.open} open · ${row.apps} ${row.apps === 1 ? 'app' : 'apps'}`, href: row.href}))}
                  empty="No application has an owner yet."
                />
              </VStack>
            </PanelCard>

            <PanelCard title="Overdue and upcoming" subtitle="Notice deadlines, renewals and the dates on open notices">
              <VStack gap={4}>
                <DateList title={`Passed, still open (notice deadlines from the last ${OVERVIEW_OVERDUE_DAYS} days)`} items={dates.overdue} empty="Nothing has passed its date while still open." />
                <LinkList title="Back in the queue (a snooze ended, or the source reported it again)" items={dates.reopened} empty="Nothing has come back unpicked." />
                {dates.upcoming.map((window) => (
                  <DateList
                    key={window.toDays}
                    title={window.fromDays === 0 ? `In the next ${window.toDays} days` : `In ${window.fromDays}–${window.toDays} days`}
                    items={window.items}
                    empty="Nothing due."
                  />
                ))}
              </VStack>
            </PanelCard>
          </Grid>
        </>
      )}
    </PageFrame>
  );
}

/** A row of numbers, each linking to the list behind it, with its words below (never colour alone). */
function FigureRow({noun, figures}: {noun: string; figures: {label: string; figure: Figure}[]}) {
  return (
    <Grid columns={{minWidth: 120, max: 5}} gap={4}>
      {figures.map(({label, figure}) => (
        <VStack key={label} gap={0.5}>
          <Link href={figure.href} weight="bold" size="lg" label={`${figure.count} ${noun}: ${label}`}>
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

/** A titled list with its count; every item is shown and links to the app or notice it is about. */
function LinkList({title, items, empty}: {title: string; items: NamedLink[]; empty: string}) {
  return (
    <VStack gap={1}>
      <Heading level={3}>{`${title} (${items.length})`}</Heading>
      {items.length === 0 ? (
        <Text size="sm" color="secondary">
          {empty}
        </Text>
      ) : (
        items.map((item, index) => (
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
    </VStack>
  );
}

function DateList({title, items, empty}: {title: string; items: DatedItem[]; empty: string}) {
  return <LinkList title={title} items={items.map((item) => ({...item, detail: `${item.detail} · ${formatDate(item.date)}`}))} empty={empty} />;
}
