import {describe, expect, it} from 'vitest';
import {APP_HEALTH_FILTER, APP_KIND, APP_LIST_SORT, FILTER_ALL, SETTINGS_SECTION} from '@/lib/constants';
import {appListQuery, appListViewFrom, settingsSection} from './list-filters';

const DEFAULT_VIEW = {query: '', kind: FILTER_ALL, health: FILTER_ALL, sort: APP_LIST_SORT.health};

describe('list state in the URL', () => {
  it('search, filters and sort round-trip through the URL so Back and shared links restore the same list', () => {
    const view = {query: 'ledger', kind: APP_KIND.saas, health: APP_HEALTH_FILTER.attention, sort: APP_LIST_SORT.name};
    const params = Object.fromEntries(new URLSearchParams(appListQuery(view).slice(1)));
    expect(appListViewFrom(params)).toEqual(view);
  });

  it('the default view has no query string, so the plain list stays /applications', () => {
    expect(appListQuery(DEFAULT_VIEW)).toBe('');
  });

  it('unknown or repeated values fall back to the defaults instead of breaking the list', () => {
    expect(appListViewFrom({kind: 'spaceship', health: ['healthy', 'attention'], sort: 'random'})).toEqual({
      ...DEFAULT_VIEW,
      health: APP_HEALTH_FILTER.healthy,
    });
  });

  it('an unknown Settings section opens Monitoring sources', () => {
    expect(settingsSection('nope')).toBe(SETTINGS_SECTION.sources);
    expect(settingsSection(SETTINGS_SECTION.apiKeys)).toBe(SETTINGS_SECTION.apiKeys);
  });
});
