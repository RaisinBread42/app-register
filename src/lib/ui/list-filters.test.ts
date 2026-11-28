import {describe, expect, it} from 'vitest';
import {APP_CRITICALITY, APP_HEALTH_FILTER, APP_KIND, APP_LIST_SORT, SETTINGS_SECTION} from '@/lib/constants';
import {DEFAULT_APP_LIST_VIEW} from './catalog';
import {appListQuery, appListViewFrom, settingsSection} from './list-filters';

describe('list state in the URL', () => {
  it('search, every filter and sort round-trip through the URL so Back and shared links restore the same list', () => {
    const view = {
      query: 'ledger',
      kind: APP_KIND.saas,
      criticality: APP_CRITICALITY.high,
      owner: '7d0c1f3e-1111-4222-8333-944455556666',
      health: APP_HEALTH_FILTER.notMonitored,
      openNotices: true,
      sort: APP_LIST_SORT.deadline,
    };
    const params = Object.fromEntries(new URLSearchParams(appListQuery(view).slice(1)));
    expect(appListViewFrom(params)).toEqual(view);
  });

  it('the default view (needs attention first, no filters) has no query string, so the plain list stays /applications', () => {
    expect(DEFAULT_APP_LIST_VIEW.sort).toBe(APP_LIST_SORT.attention);
    expect(appListQuery(DEFAULT_APP_LIST_VIEW)).toBe('');
  });

  it('unknown or repeated values fall back to the defaults instead of breaking the list', () => {
    expect(appListViewFrom({kind: 'spaceship', criticality: 'extreme', health: ['healthy', 'attention'], sort: 'renewal', open_notices: 'yes'})).toEqual({
      ...DEFAULT_APP_LIST_VIEW,
      health: APP_HEALTH_FILTER.healthy,
    });
  });

  it('an unknown Settings section opens Monitoring sources', () => {
    expect(settingsSection('nope')).toBe(SETTINGS_SECTION.sources);
    expect(settingsSection(SETTINGS_SECTION.apiKeys)).toBe(SETTINGS_SECTION.apiKeys);
  });
});
