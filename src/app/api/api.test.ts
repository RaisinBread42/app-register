import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NOTICE_ALERT_STATUS} from '@/lib/constants';
import {newId} from '@/lib/db/ids';
import {workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp} from '@/lib/services/apps';
import {createPerson} from '@/lib/services/people';
import * as appRoute from './apps/route';
import * as appByIdRoute from './apps/[id]/route';
import * as acknowledgeRoute from './notice-alerts/[id]/acknowledge/route';
import * as alertsRoute from './notice-alerts/route';
import * as peopleRoute from './people/route';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

const BASE = 'http://localhost/api';

function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {'content-type': 'application/json'},
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function params(id: string) {
  return {params: Promise.resolve({id})};
}

async function call(response: Promise<Response>) {
  const res = await response;
  return {status: res.status, body: await res.json()};
}

describe('JSON API', () => {
  beforeEach(async () => {
    t = await createTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every endpoint returns its documented shape, 400 on invalid input and 404 for an unknown or other-workspace id', async () => {
    // POST /api/people
    const ada = await call(peopleRoute.POST(request('/people', 'POST', {name: 'Ada Owner', email: 'Ada@Example.test'})));
    expect(ada.status).toBe(201);
    expect(Object.keys(ada.body.person).sort()).toEqual(['createdAt', 'email', 'id', 'leftOn', 'name', 'status', 'updatedAt']);
    expect(ada.body.person.email).toBe('ada@example.test');
    const ben = await call(peopleRoute.POST(request('/people', 'POST', {name: 'Ben Backup', email: 'ben@example.test'})));
    expect((await call(peopleRoute.POST(request('/people', 'POST', {name: 'No Email'})))).status).toBe(400);
    expect((await call(peopleRoute.POST(request('/people', 'POST', 'not json')))).status).toBe(400);

    // GET /api/people
    const people = await call(peopleRoute.GET());
    expect(people.status).toBe(200);
    expect(people.body.people.map((p: {name: string}) => p.name)).toEqual(['Ada Owner', 'Ben Backup']);

    // POST /api/apps
    const input = {name: 'Contoso CRM', kind: 'saas', ownerId: ada.body.person.id, backupOwnerId: ben.body.person.id, noticeDeadline: '2099-12-31', costCents: 125000};
    const created = await call(appRoute.POST(request('/apps', 'POST', input)));
    expect(created.status).toBe(201);
    const app = created.body.app;
    expect(app).toMatchObject({name: 'Contoso CRM', owner: {id: ada.body.person.id, name: 'Ada Owner'}, backupOwner: {name: 'Ben Backup'}, archivedAt: null});
    expect(app).not.toHaveProperty('workspaceId');
    expect(app.alerts).toHaveLength(3);
    expect((await call(appRoute.POST(request('/apps', 'POST', {...input, name: 'Other', costCents: -5})))).status).toBe(400);
    expect((await call(appRoute.POST(request('/apps', 'POST', {...input, name: 'Other', ownerId: newId()})))).status).toBe(400);

    // GET /api/apps
    const list = await call(appRoute.GET(request('/apps?kind=saas&sort=notice_deadline&noticeDeadlineWithinDays=36500')));
    expect(list.status).toBe(200);
    expect(list.body.apps.map((a: {id: string}) => a.id)).toEqual([app.id]);
    expect(list.body.apps[0]).not.toHaveProperty('alerts');
    expect((await call(appRoute.GET(request('/apps?noticeDeadlineWithinDays=30')))).body.apps).toEqual([]);
    expect((await call(appRoute.GET(request('/apps?kind=spreadsheet')))).status).toBe(400);
    expect((await call(appRoute.GET(request('/apps?sort=price')))).status).toBe(400);
    expect((await call(appRoute.GET(request('/apps?noticeDeadlineWithinDays=-1')))).status).toBe(400);

    // GET /api/apps/[id]
    const one = await call(appByIdRoute.GET(request(`/apps/${app.id}`), params(app.id)));
    expect(one.status).toBe(200);
    expect(one.body.app).toEqual(app);

    // PATCH /api/apps/[id]
    const patched = await call(appByIdRoute.PATCH(request(`/apps/${app.id}`, 'PATCH', {vendor: 'Contoso Ltd'}), params(app.id)));
    expect(patched.status).toBe(200);
    expect(patched.body.app.vendor).toBe('Contoso Ltd');
    expect((await call(appByIdRoute.PATCH(request(`/apps/${app.id}`, 'PATCH', {noticeDeadline: '31/12/2099'}), params(app.id)))).status).toBe(400);

    // GET /api/notice-alerts
    const alerts = await call(alertsRoute.GET(request(`/notice-alerts?status=scheduled&appId=${app.id}`)));
    expect(alerts.status).toBe(200);
    expect(alerts.body.alerts).toHaveLength(3);
    expect(alerts.body.alerts[0]).toMatchObject({appId: app.id, appName: 'Contoso CRM', status: NOTICE_ALERT_STATUS.scheduled});
    expect((await call(alertsRoute.GET(request('/notice-alerts?status=snoozed')))).status).toBe(400);
    expect((await call(alertsRoute.GET(request('/notice-alerts?appId=42')))).status).toBe(400);

    // POST /api/notice-alerts/[id]/acknowledge
    const alertId = alerts.body.alerts[0].id;
    const ack = await call(acknowledgeRoute.POST(request(`/notice-alerts/${alertId}/acknowledge`, 'POST'), params(alertId)));
    expect(ack.status).toBe(200);
    expect(ack.body.alert).toMatchObject({id: alertId, status: NOTICE_ALERT_STATUS.acknowledged});
    expect(typeof ack.body.alert.acknowledgedAt).toBe('string');

    // 404: unknown ids, malformed ids and ids from another workspace.
    const otherWorkspaceId = newId();
    await t.db.insert(workspaces).values({id: otherWorkspaceId, name: 'Fabrikam', slug: 'fabrikam'});
    const otherOwner = await createPerson(t.db, otherWorkspaceId, {name: 'Cy Other', email: 'cy@example.test'});
    const otherBackup = await createPerson(t.db, otherWorkspaceId, {name: 'Di Other', email: 'di@example.test'});
    const otherApp = await createApp(t.db, otherWorkspaceId, {name: 'Fabrikam Vault', kind: 'saas', ownerId: otherOwner.id, backupOwnerId: otherBackup.id, noticeDeadline: '2099-12-31'});
    const otherAlertId = otherApp.alerts[0].id;

    for (const id of [newId(), 'not-a-uuid', otherApp.id]) {
      expect((await call(appByIdRoute.GET(request(`/apps/${id}`), params(id)))).status).toBe(404);
      expect((await call(appByIdRoute.PATCH(request(`/apps/${id}`, 'PATCH', {vendor: 'X'}), params(id)))).status).toBe(404);
    }
    for (const id of [newId(), otherAlertId]) {
      expect((await call(acknowledgeRoute.POST(request(`/notice-alerts/${id}/acknowledge`, 'POST'), params(id)))).status).toBe(404);
    }
    expect((await call(appRoute.POST(request('/apps', 'POST', {...input, name: 'Cross', ownerId: otherOwner.id})))).status).toBe(400);
    expect((await call(appRoute.GET(request('/apps')))).body.apps).toHaveLength(1);
    expect((await call(peopleRoute.GET())).body.people).toHaveLength(2);
    expect((await call(alertsRoute.GET(request('/notice-alerts')))).body.alerts).toHaveLength(3);
  });

  it('a failed write never puts an email address in the response or the server log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const email = 'grace.hopper@example.test';
    await peopleRoute.POST(request('/people', 'POST', {name: 'Grace H', email}));

    const duplicate = await call(peopleRoute.POST(request('/people', 'POST', {name: 'Grace H', email: email.toUpperCase()})));
    expect(duplicate.status).toBe(400);
    expect(JSON.stringify(duplicate.body)).not.toContain('grace');

    // An unexpected database error whose detail quotes the row ("Failing row contains ... email")
    // is answered with a generic 500 and logged by name and code only.
    await t.client.exec(`alter table people add constraint test_reject_grace check (email not like 'grace%') not valid`);
    const broken = await call(peopleRoute.POST(request('/people', 'POST', {name: 'Grace H', email: 'grace.h@example.test'})));
    expect(broken.status).toBe(500);
    expect(JSON.stringify(broken.body)).not.toContain('grace');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('grace');
    expect(logged).toHaveBeenCalled();
  });
});
