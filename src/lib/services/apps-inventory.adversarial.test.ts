import {beforeEach, describe, expect, it} from 'vitest';
import {APP_CRITICALITY, REPOSITORY_URL_MAX_LENGTH} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp, updateApp} from './apps';
import {createPerson} from './people';

describe('adversarial: inventory fields [22]', () => {
  let t: TestDb;
  let ownerId: string;
  let backupId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
  });

  const saas = (name: string) => ({name, kind: 'saas', ownerId, backupOwnerId: backupId});

  it('A: a patch that leaves backupOwnerId/criticality undefined keeps them (only null clears)', async () => {
    const app = await createApp(t.db, t.workspaceId, {...saas('Kept'), criticality: APP_CRITICALITY.high});
    const updated = await updateApp(t.db, t.workspaceId, app.id, {
      description: 'edited',
      backupOwnerId: undefined,
      criticality: undefined,
    });
    expect(updated.backupOwner?.id).toBe(backupId);
    expect(updated.criticality).toBe(APP_CRITICALITY.high);
  });

  it('B: a repository URL accepted on create does not make the app uneditable later', async () => {
    // 25 + 200 = 225 characters typed: well under the limit.
    const typed = `https://git.example.test/${'é'.repeat(200)}`;
    expect(typed.length).toBeLessThan(REPOSITORY_URL_MAX_LENGTH);
    const app = await createApp(t.db, t.workspaceId, {...saas('Unicode Repo'), repositoryUrl: typed});
    // Stored value is the percent-encoded href, longer than the documented maximum.
    expect(app.repositoryUrl!.length).toBeLessThanOrEqual(REPOSITORY_URL_MAX_LENGTH);
  });

  it('B2: an unrelated edit to that app still saves', async () => {
    const typed = `https://git.example.test/${'é'.repeat(200)}`;
    const app = await createApp(t.db, t.workspaceId, {...saas('Unicode Repo 2'), repositoryUrl: typed});
    await expect(updateApp(t.db, t.workspaceId, app.id, {description: 'just a note'})).resolves.toMatchObject({
      description: 'just a note',
    });
  });

  it('C: a repository URL with embedded credentials (a token) is not stored', async () => {
    const app = await createApp(t.db, t.workspaceId, {
      ...saas('Secret Repo'),
      repositoryUrl: 'https://deploy:ghp_FAKEexampleToken0000@github.com/org/repo',
    }).catch((error: Error) => error);
    if (app instanceof Error) {
      return; // refused: fine
    }
    expect(app.repositoryUrl).not.toContain('ghp_FAKEexampleToken0000');
  });

  it('D: the repository URL is stored as the user typed it', async () => {
    const app = await createApp(t.db, t.workspaceId, {...saas('Typed Repo'), repositoryUrl: 'https://GitHub.com'});
    expect(app.repositoryUrl).toBe('https://GitHub.com');
  });
});
