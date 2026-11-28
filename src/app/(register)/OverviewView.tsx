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
import {DATE_KIND, OVERVIEW_DATES_DAYS, OVERVIEW_DEADLINE_DAYS, OVERVIEW_OVERDUE_DAYS, ROUTES, SETTINGS_SECTION, settingsRoute} from '@/lib/constants';
import type {App, AuditEvent, MonitoringSource, Notice} from '@/lib/ui/api-client';
import {MATCH_STATUS_LABEL, NOTICE_CATEGORY_LABEL, NOTICE_SEVERITY_LABEL, NOTICE_SEVERITY_VARIANT} from '@/lib/ui/copy';
import {DEFAULT_INBOX_VIEW, INBOX_STATUS, inboxQuery} from '@/lib/ui/notice-inbox';
import {activityLine, checkStatusLine, keyNumbers, portfolioNote, portfolioSummary, upcomingDates, urgentQueue} from '@/lib/ui/overview';
import {formatDate} from '@/lib/ui/register-view';
import {CardLink, PanelCard} from './_components/Cards';
import {PageFrame} from './_components/PageFrame';
import {PageHeader} from './_components/PageHeader';
import {AddApplicationDialog} from './applications/AddApplicationDialog';
import type {PersonOption} from './applications/AppForm';

type Props = {
  apps: App[];
  notices: Notice[];
  /** Null when the sources could not be read; the page still shows everything else. */
  sources: MonitoringSource[] | null;
  /** Null when the history could not be read. */
  activity: AuditEvent[] | null;
  people: PersonOption[];
  addKey: string;
  today: string;
  /** The server's time, as ISO, so freshness reads the same on the server and in the browser. */
  now: string;
};

/** "1 critical · 2 in review · 1 snoozed", leaving out zeros; snoozed is counted, never hidden (spec Journey A). */
function attentionDetail({critical, inReview, snoozed}: {critical: number; inReview: number; snoozed: number}): string {
  const parts = [critical ? `${critical} critical` : 'none critical', inReview ? `${inReview} in review` : '', snoozed ? `${snoozed} snoozed` : ''];
  return parts.filter(Boolean).join(' · ');
}

/**
 * The daily check-in (spec §4.1, Journey A): when data was last checked, a few
 * numbers, the urgent queue, upcoming dates, the portfolio, then recent activity.
 * No metric-card wall and no decorative charts (spec §7).
 */
export function OverviewView({apps, notices, sources, activity, people, addKey, today, now}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const numbers = keyNumbers(notices, apps, sources ?? [], today, new Date(now));
  const queue = urgentQueue(notices);
  const dates = upcomingDates(apps, today);
  const portfolio = portfolioSummary(apps, notices);
  const addButton = <Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />;
  const snoozedLink = `${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.snoozed})}`;

  return (
    <PageFrame crumbs={[{label: 'Overview'}]}>
      <PageHeader title="Overview" description={checkStatusLine(sources)} actions={addButton} />

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
                detail={attentionDetail(numbers)}
                href={ROUTES.notices}
              />
              <KeyNumber
                value={numbers.deadlinesSoon}
                label={`${numbers.deadlinesSoon === 1 ? 'notice deadline' : 'notice deadlines'} in ${OVERVIEW_DEADLINE_DAYS} days`}
                detail={numbers.overdue ? `${numbers.overdue} passed in the last ${OVERVIEW_OVERDUE_DAYS} days` : 'Decide before they pass'}
              />
              {numbers.staleSources > 0 && (
                <KeyNumber
                  value={numbers.staleSources}
                  label={numbers.staleSources === 1 ? 'source out of date' : 'sources out of date'}
                  detail="Did not answer, or not checked recently; data may be missing"
                  href={settingsRoute(SETTINGS_SECTION.sources)}
                />
              )}
            </HStack>
          </Card>

          <PanelCard
            title="Needs attention"
            subtitle="The most severe open notices first"
            action={
              <HStack gap={4} vAlign="center" wrap="wrap">
                {numbers.snoozed > 0 && <CardLink label={`${numbers.snoozed} snoozed`} href={snoozedLink} />}
                <CardLink label="All notices" href={ROUTES.notices} />
              </HStack>
            }>
            {queue.length === 0 ? (
              <EmptyState
                title={numbers.staleSources ? 'Nothing open, but some data is out of date' : 'Nothing needs attention'}
                description={numbers.snoozed ? `${numbers.snoozed} snoozed until their dates. Handled notices are in the Notices inbox.` : 'Snoozed and handled notices are in the Notices inbox.'}
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

          <PanelCard
            title="Upcoming dates"
            subtitle={`Notice deadlines and renewals in the next ${OVERVIEW_DATES_DAYS} days, and notice deadlines passed in the last ${OVERVIEW_OVERDUE_DAYS} days`}>
            {dates.length === 0 ? (
              <EmptyState title={`No dates in the next ${OVERVIEW_DATES_DAYS} days`} description="Add renewal and notice dates when you edit an application." isCompact />
            ) : (
              <VStack gap={0} paddingInline={5} paddingBlockEnd={3}>
                {dates.map((row, index) => (
                  <VStack key={`${row.appId}-${row.kind}`} gap={0}>
                    {index > 0 && <Divider />}
                    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={3} wrap="wrap">
                      <Link href={`${ROUTES.applications}/${encodeURIComponent(row.appId)}`} size="sm" weight="bold">
                        {row.title}
                      </Link>
                      <HStack gap={2} vAlign="center" style={{flex: 'none'}}>
                        <Text size="sm">{formatDate(row.date)}</Text>
                        <Badge
                          label={row.isOverdue ? 'Passed' : row.kind === DATE_KIND.notice ? 'Notice' : 'Renewal'}
                          variant={row.isOverdue ? 'red' : 'neutral'}
                        />
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
              <Text color="secondary">{portfolioNote(portfolio)}</Text>
            </VStack>
          </PanelCard>

          <PanelCard title="Recent activity">
            {activity === null ? (
              <EmptyState title="Activity could not be loaded" description="Reload the page to try again; everything above is current." isCompact />
            ) : activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Actions on notices and applications show here." isCompact />
            ) : (
              <VStack gap={1} paddingInline={5} paddingBlockEnd={5}>
                {activity.map((event) => (
                  <Text key={event.id} size="sm">
                    {activityLine(event)}
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
