import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {ROUTES} from '@/lib/constants';
import {PageFrame} from './_components/PageFrame';

/** Unknown routes and unknown application ids, inside the app shell with a way back (#23 item 1). */
export default function RegisterNotFound() {
  return (
    <PageFrame crumbs={[{label: 'Not found'}]}>
      <Card>
        <EmptyState
          title="This page could not be found"
          description="The link may be out of date, or the application may have been archived."
          actions={<Button label="Back to applications" variant="primary" href={ROUTES.applications} />}
        />
      </Card>
    </PageFrame>
  );
}
