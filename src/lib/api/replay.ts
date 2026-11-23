import {RESOURCE_KIND} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {getApp} from '@/lib/services/apps';
import {getDependency} from '@/lib/services/dependencies';
import {getHosting} from '@/lib/services/hosting';
import type {WrittenResource} from '@/lib/services/idempotency';
import {getAlert} from '@/lib/services/notice-alerts';
import {getPerson} from '@/lib/services/people';

/**
 * The response body for a repeated POST or PATCH: the resource the first run
 * answered about, read again as it is now, in the shape that route answers
 * with. A resource that has since been deleted is a 404, like any read.
 */
export async function replayBody(db: AppDatabase, workspaceId: string, resource: WrittenResource): Promise<unknown> {
  switch (resource.kind) {
    case RESOURCE_KIND.app:
      return {app: await getApp(db, workspaceId, resource.id)};
    case RESOURCE_KIND.person:
      return {person: await getPerson(db, workspaceId, resource.id)};
    case RESOURCE_KIND.dependency:
      return {dependency: await getDependency(db, workspaceId, resource.id)};
    case RESOURCE_KIND.hosting:
      return {hosting: await getHosting(db, workspaceId, resource.id)};
    case RESOURCE_KIND.noticeAlert:
      return {alert: await getAlert(db, workspaceId, resource.id)};
    case RESOURCE_KIND.dependencyImport:
      return {import: resource.counts};
  }
}
