import {beforeEach, describe, expect, it} from 'vitest';
import {newId} from '@/lib/db/ids';
import {workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {ValidationError} from './errors';
import {createPerson, listActivePeople} from './people';

describe('people', () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
  });

  it('emails are unique per workspace regardless of case, and the same email can exist in two workspaces', async () => {
    const otherId = newId();
    await t.db.insert(workspaces).values({id: otherId, name: 'Fabrikam', slug: 'fabrikam'});

    const dana = await createPerson(t.db, t.workspaceId, {name: 'Dana Ruiz', email: ' Dana.Ruiz@Example.TEST '});
    expect(dana.email).toBe('dana.ruiz@example.test');

    await expect(
      createPerson(t.db, t.workspaceId, {name: 'Dana R.', email: 'dana.ruiz@example.test'}),
    ).rejects.toBeInstanceOf(ValidationError);

    const elsewhere = await createPerson(t.db, otherId, {name: 'Dana Ruiz', email: 'DANA.RUIZ@example.test'});
    expect(elsewhere.email).toBe('dana.ruiz@example.test');
    expect(await listActivePeople(t.db, t.workspaceId)).toHaveLength(1);
  });
});
