'use client';

import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {ROUTES} from '@/lib/constants';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

/** Honest empty state until notices are stored: findings still show on each application's page. */
export function NoticesView() {
  return (
    <PageFrame crumbs={[{label: 'Notices'}]}>
      <PageHeader
        title="Notices"
        description="What changed or is due: advisories, end-of-support dates, provider incidents and deadlines that affect your applications."
      />
      <Card>
        <EmptyState
          title="The notice inbox is not connected yet"
          description="Findings from dependency and hosting checks show on each application’s page for now. They will be listed here, with what to do next, once the inbox is connected."
          actions={<Button label="Review applications" variant="primary" href={ROUTES.applications} />}
        />
      </Card>
    </PageFrame>
  );
}
