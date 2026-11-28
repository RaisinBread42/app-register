import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {ROUTES} from '@/lib/constants';
import {PageFrame} from './_components/PageFrame';
import {PageHeader} from './_components/PageHeader';

/** Unknown routes and unknown application ids, inside the app shell with a way back (#23 item 1). */
export default function RegisterNotFound() {
  return (
    <PageFrame crumbs={[{label: 'Not found'}]}>
      <PageHeader title="Page not found" description="The link may be out of date, or the application may have been archived." />
      <Card>
        <EmptyState
          title="Nothing here"
          description="Go back to your applications to find what you were looking for."
          actions={<Button label="Back to applications" variant="primary" href={ROUTES.applications} />}
        />
      </Card>
    </PageFrame>
  );
}
