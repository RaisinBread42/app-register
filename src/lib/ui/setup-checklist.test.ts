import {describe, expect, it} from 'vitest';
import {APP_KIND, SETUP_ITEM} from '@/lib/constants';
import type {AppDetail} from './api-client';
import {isSetupIncomplete, setupChecklist} from './setup-checklist';

const app = (extra: Partial<AppDetail>): AppDetail =>
  ({kind: APP_KIND.saas, vendor: null, renewalDate: null, noticeDeadline: null, hosting: [], dependencies: [], repositoryUrl: null, health: {score: null}, ...extra}) as AppDetail;
const done = (detail: AppDetail) => Object.fromEntries(setupChecklist(detail).map((item) => [item.key, item.isDone]));

describe('setup checklist', () => {
  it('AC2: a new bought app lists supplier and contract dates, hosting and a first check, none done yet', () => {
    expect(done(app({}))).toEqual({[SETUP_ITEM.supplier]: false, [SETUP_ITEM.hosting]: false, [SETUP_ITEM.firstCheck]: false});
  });

  it('AC2: a built app lists dependencies or repository instead of a supplier', () => {
    expect(Object.keys(done(app({kind: APP_KIND.inHouse})))).toEqual([SETUP_ITEM.hosting, SETUP_ITEM.code, SETUP_ITEM.firstCheck]);
  });

  it('items tick themselves off from the data: a supplier needs a date too; a repository alone counts as code', () => {
    expect(done(app({vendor: 'Atlas Software'}))[SETUP_ITEM.supplier]).toBe(false);
    expect(done(app({vendor: 'Atlas Software', noticeDeadline: '2027-03-31'}))[SETUP_ITEM.supplier]).toBe(true);
    expect(done(app({kind: APP_KIND.citizenBuilt, repositoryUrl: 'https://git.example.test/x'}))[SETUP_ITEM.code]).toBe(true);
  });

  it('the checklist goes away once everything is in, including a real first check by a source (a typed date is not one)', () => {
    const typedOnly = app({kind: APP_KIND.inHouse, hosting: [{healthCheckedAt: null, healthError: null}] as AppDetail['hosting'], health: {score: 88} as AppDetail['health']});
    expect(done(typedOnly)[SETUP_ITEM.firstCheck]).toBe(false);
    const complete = app({
      kind: APP_KIND.inHouse,
      hosting: [{healthCheckedAt: '2026-11-28T05:00:00Z', healthError: null}] as AppDetail['hosting'],
      repositoryUrl: 'https://git.example.test/x',
    });
    expect(isSetupIncomplete(setupChecklist(complete))).toBe(false);
    expect(isSetupIncomplete(setupChecklist(app({})))).toBe(true);
  });
});
