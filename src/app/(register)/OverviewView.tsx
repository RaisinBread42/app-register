'use client';

import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {AUDIT_ACTION, DATE_KIND, ROUTES, SETTINGS_SECTION, settingsRoute, type AuditAction} from '@/lib/constants';
import type {App, AuditEvent, MonitoringSource, Notice} from '@/lib/ui/api-client';
import {MATCH_STATUS_LABEL, NOTICE_CATEGORY_LABEL, NOTICE_SEVERITY_LABEL, NOTICE_SEVERITY_VARIANT} from '@/lib/ui/copy';
import {DEFAULT_INBOX_VIEW, inboxQuery} from '@/lib/ui/notice-inbox';
import {keyNumbers, lastSuccessfulCheck, portfolioSummary, upcomingDates, urgentQueue} from '@/lib/ui/overview';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {CardLink, PanelCard} from './_components/Cards';
import {PageFrame} from './_components/PageFrame';
import {PageHeader} from './_components/PageHeader';
import {AddApplicationDialog} from './applications/AddApplicationDialog';
import type {PersonOption} from './applications/AppForm';

const ACTION_LABEL: Record<AuditAction, string> = {
  [AUDIT_ACTION.noticeStatusChanged]: 'changed a notice status',
  [AUDIT_ACTION.noticeAssigned]: 'changed a notice owner',
  [AUDIT_ACTION.noticeStatusUndone]: 'undid a status change',
  [AUDIT_ACTION.noticeAssignmentUndone]: 'undid an owner change',
  [AUDIT_ACTION.noticeSnoozeEnded]: 'ended a snooze',
  [AUDIT_ACTION.noticeReopened]: 'reopened a notice the source reports again',
  [AUDIT_ACTION.appArchived]: 'archived an application',
};

type Props = {
  apps: App[];
  notices: Notice[];
  sources: MonitoringSource[];
  activity: AuditEvent[];
  people: PersonOption[];
  addKey: string;
  today: string;
};

/**
 * The daily check-in (spec §4.1, Journey A): when data was last checked, a few
 * numbers, the urgent queue, upcoming dates, the portfolio, then recent activity.
 * No metric-card wall and no decorative charts (spec §7).
 */
export function OverviewView({apps, notices, sources, activity, people, addKey, today}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const numbers = keyNumbers(notices, apps, sources, today);
  const queue = urgentQueue(notices);
  const dates = upcomingDates(apps, today);
  const portfolio = portfolioSummary(apps, notices);
  const lastCheck = lastSuccessfulCheck(sources);
  const appName = new Map(apps.map((app) => [app.id, app.name]));
  const addButton = <Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />;

  return (
    <PageFrame crumbs={[{label: 'Overview'}]}>
      <PageHeader
        title="Overview"
        description={lastCheck ? `Last successful check: ${formatDateTime(lastCheck)}` : 'No source has been checked yet.'}
        actions={addButton}
      />

      {apps.length === 0 ? (
        <Card>
          <EmptyState
            title="Add your first application"
            description="App Register watches your applications' dependencies, hosting and deadlines, and tells you what needs attention. Start by adding one."
            actions={addButton}
          />
        </Card>
      ) : (
        <>
          <Card padding={5}>
            <HStack gap={8} wrap="wrap">
              <KeyNumber
                value={numbers.needAttention}
                label={numbers.needAttention === 1 ? 'needs attention' : 'need attention'}
                detail={numbers.critical ? `${numbers.critical} critical` : 'none critical'}
                href={ROUTES.notices}
              />
              <KeyNumber
                value={numbers.deadlinesSoon}
                label={numbers.deadlinesSoon === 1 ? 'notice deadline in 30 days' : 'notice deadlines in 30 days'}
                detail="Decide before they pass"
              />
              {numbers.sourcesDown > 0 && (
                <KeyNumber
                  value={numbers.sourcesDown}
                  label={numbers.sourcesDown === 1 ? 'source not answering' : 'sources not answering'}
                  detail="Their data may be out of date"
                  href={settingsRoute(SETTINGS_SECTION.sources)}
                />
              )}
            </HStack>
          </Card>

          <PanelCard
            title="Needs attention"
            subtitle="The most severe open notices first"
            action={<CardLink label="All notices" href={ROUTES.notices} />}>
            {queue.length === 0 ? (
              <EmptyState
                title={numbers.sourcesDown ? 'Nothing open, but some data is out of date' : 'Nothing needs attention'}
                description="Snoozed and handled notices are in the Notices inbox."
                isCompact
              />
            ) : (
              <VStack gap={0} paddingInline={5} paddingBlockEnd={3}>
                {queue.map(({notice, match}, index) => (
                  <VStack key={match.id} gap={0}>
                    {index > 0 && <Divider />}
                    <HStack gap={3} vAlign="center" paddingBlock={3} wrap="wrap">
                      <Badge label={NOTICE_SEVERITY_LABEL[notice.severity]} variant={NOTICE_SEVERITY_VARIANT[notice.severity]} />
                      <VStack gap={0.5} style={{flex: 1, minWidth: 0}}>
                        <Link href={`${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, notice: match.id})}`} weight="bold" size="sm">
                          {notice.title}
                        </Link>
                        <Text type="supporting" color="secondary">
                          {`${match.app.name} · ${NOTICE_CATEGORY_LABEL[notice.category]} · ${MATCH_STATUS_LABEL[match.status]}`}
                        </Text>
                      </VStack>
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </PanelCard>

          <PanelCard title="Upcoming dates" subtitle="Notice deadlines and renewals in the next 90 days">
            {dates.length === 0 ? (
              <EmptyState title="No dates in the next 90 days" description="Add renewal and notice dates when you edit an application." isCompact />
            ) : (
              <VStack gap={0} paddingInline={5} paddingBlockEnd={3}>
                {dates.map((row, index) => (
                  <VStack key={`${row.appId}-${row.kind}`} gap={0}>
                    {index > 0 && <Divider />}
                    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={3}>
                      <Link href={`${ROUTES.applications}/${encodeURIComponent(row.appId)}`} size="sm" weight="bold">
                        {row.title}
                      </Link>
                      <HStack gap={2} vAlign="center">
                        <Text size="sm">{formatDate(row.date)}</Text>
                        <Badge label={row.kind === DATE_KIND.notice ? 'Notice' : 'Renewal'} variant="neutral" />
                      </HStack>
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </PanelCard>

          <PanelCard title="Your applications" action={<CardLink label="All applications" href={ROUTES.applications} />}>
            <VStack gap={1} paddingInline={5} paddingBlockEnd={5}>
              <Text>{`${portfolio.total} applications · ${portfolio.withOpenNotices} with open notices`}</Text>
              <Text color="secondary">
                {portfolio.notMonitored
                  ? `${portfolio.monitored} are monitored. ${portfolio.notMonitored} have nothing to check yet (no dependencies or hosting recorded), so they are not counted as healthy.`
                  : `All ${portfolio.monitored} are monitored.`}
              </Text>
            </VStack>
          </PanelCard>

          <PanelCard title="Recent activity">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Actions on notices and applications show here." isCompact />
            ) : (
              <VStack gap={1} paddingInline={5} paddingBlockEnd={5}>
                {activity.map((event) => (
                  <Text key={event.id} size="sm">
                    {`${formatDateTime(event.occurredAt)} · ${event.actor} ${ACTION_LABEL[event.action]}${event.appId && appName.get(event.appId) ? ` on ${appName.get(event.appId)}` : ''}`}
                  </Text>
                ))}
              </VStack>
            )}
          </PanelCard>
        </>
      )}
      <AddApplicationDialog isOpen={isAdding} onClose={() => setIsAdding(false)} idempotencyKey={addKey} people={people} />
    </PageFrame>
  );
}

function KeyNumber({value, label, detail, href}: {value: number; label: string; detail: string; href?: string}) {
  const text = (
    <Text size="lg" weight="bold">
      {`${value} ${label}`}
    </Text>
  );
  return (
    <VStack gap={0.5}>
      {href ? <Link href={href}>{text}</Link> : text}
      <Text type="supporting" color="secondary">
        {detail}
      </Text>
    </VStack>
  );
}
