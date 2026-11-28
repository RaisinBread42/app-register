import {BOUGHT_APP_KINDS, SETUP_ITEM, type SetupItemKey} from '@/lib/constants';
import type {AppDetail} from './api-client';
import {checkTimes} from './register-view';

/**
 * The setup checklist on an app's page (spec Journey B, [24]): what to add so App
 * Register can watch the app. Each item is worked out from the app's own data, so it
 * ticks itself off when the data is added. Bought apps have a supplier and contract
 * dates; built apps have code (dependencies or a repository). Pure, so it is tested
 * without a page.
 */

export type SetupItem = {key: SetupItemKey; isDone: boolean};

export function setupChecklist(app: Pick<AppDetail, 'kind' | 'vendor' | 'renewalDate' | 'noticeDeadline' | 'hosting' | 'dependencies' | 'repositoryUrl'>): SetupItem[] {
  const isBought = BOUGHT_APP_KINDS.includes(app.kind);
  // A source answered for it (a complete dependency check, or a clean hosting check); a date typed by hand is not a check.
  const times = checkTimes(app);
  return [
    ...(isBought ? [{key: SETUP_ITEM.supplier, isDone: Boolean(app.vendor && (app.renewalDate || app.noticeDeadline))}] : []),
    {key: SETUP_ITEM.hosting, isDone: app.hosting.length > 0},
    ...(isBought ? [] : [{key: SETUP_ITEM.code, isDone: app.dependencies.length > 0 || Boolean(app.repositoryUrl)}]),
    {key: SETUP_ITEM.firstCheck, isDone: times.dependencies !== null || times.hosting !== null},
  ];
}

/** True while anything is left to add; the checklist shows only then. */
export function isSetupIncomplete(items: SetupItem[]): boolean {
  return items.some((item) => !item.isDone);
}
