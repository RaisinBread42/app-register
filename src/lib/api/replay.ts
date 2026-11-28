import {RESOURCE_KIND} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {listApiKeys} from '@/lib/services/api-keys';
import {getApp} from '@/lib/services/apps';
import {getDependency} from '@/lib/services/dependencies';
import {NotFoundError} from '@/lib/services/errors';
import {getHosting} from '@/lib/services/hosting';
import type {WrittenResource} from '@/lib/services/idempotency';
import {getAlert} from '@/lib/services/notice-alerts';
import {getPerson} from '@/lib/services/people';

/**
 * The response body for a repeated POST or PATCH: the resource the first run
 * answered about, read again as it is now, in the shape that route answers
 * with. A resource that has since been deleted is a 404, like any read.
 * An API key replay never includes the secret (it was shown only on first create).
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
    case RESOURCE_KIND.apiKey: {
      const apiKey = (await listApiKeys(db, workspaceId)).find((row) => row.id === resource.id);
      if (!apiKey) {
        throw new NotFoundError('API key not found');
      }
      return {apiKey: {...apiKey, key: null}};
    }
  }
}
