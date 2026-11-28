'use server';

import {revalidatePath} from 'next/cache';
import {PERSON_STATUS, ROUTES} from '@/lib/constants';
import {runAction, type ActionResult} from '@/lib/ui/action-result';
import {
  apiClient,
  type ApiKey,
  type ApiKeyInput,
  type DependencyImport,
  type PersonInput,
} from '@/lib/ui/api-client';
import {
  formToAppInput,
  formToDependencyInput,
  formToHostingInput,
  type AppFormValues,
  type DependencyFormValues,
  type HostingFormValues,
} from '@/lib/ui/forms';

/**
 * Server actions: the only bridge from the browser to the API. Each one makes
 * one API call with the Idempotency-Key the page rendered for that user action,
 * so a double-click or a retry of the same Save sends the same key.
 */

/** The overview, the applications list and every application page show app data. */
function refreshApps() {
  revalidatePath(ROUTES.home, 'layout');
}

export type CreateAppResult = ActionResult & {appId?: string};

export async function createAppAction(idempotencyKey: string, values: AppFormValues): Promise<CreateAppResult> {
  let appId: string | undefined;
  const result = await runAction(async () => {
    appId = (await apiClient().createApp(idempotencyKey, formToAppInput(values))).id;
  });
  refreshApps();
  return {...result, appId};
}

export async function updateAppAction(idempotencyKey: string, id: string, values: AppFormValues): Promise<ActionResult> {
  const result = await runAction(() => apiClient().updateApp(idempotencyKey, id, formToAppInput(values)));
  refreshApps();
  return result;
}

export async function archiveAppAction(idempotencyKey: string, id: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().archiveApp(idempotencyKey, id));
  refreshApps();
  return result;
}

export async function saveDependencyAction(
  idempotencyKey: string,
  appId: string,
  dependencyId: string | null,
  values: DependencyFormValues,
): Promise<ActionResult> {
  // Mapping runs inside runAction so forged form values become a message, not a 500.
  const result = await runAction(() => {
    const input = formToDependencyInput(values);
    return dependencyId
      ? apiClient().updateDependency(idempotencyKey, appId, dependencyId, input)
      : apiClient().addDependency(idempotencyKey, appId, input);
  });
  refreshApps();
  return result;
}

export type ImportDependenciesResult = ActionResult & {summary?: DependencyImport};

/** `fileText` is the package.json or package-lock.json the user picked; the API checks its size and shape. */
export async function importDependenciesAction(
  idempotencyKey: string,
  appId: string,
  fileText: string,
): Promise<ImportDependenciesResult> {
  let summary: DependencyImport | undefined;
  const result = await runAction(async () => {
    summary = await apiClient().importDependencies(idempotencyKey, appId, fileText);
  });
  refreshApps();
  return {...result, summary};
}

export async function refreshDependenciesAction(appId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().refreshDependencies(appId));
  refreshApps();
  return result;
}

export async function removeDependencyAction(appId: string, dependencyId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().removeDependency(appId, dependencyId));
  refreshApps();
  return result;
}

export async function saveHostingAction(
  idempotencyKey: string,
  appId: string,
  hostingId: string | null,
  values: HostingFormValues,
): Promise<ActionResult> {
  const result = await runAction(() => {
    const input = formToHostingInput(values);
    return hostingId
      ? apiClient().updateHosting(idempotencyKey, appId, hostingId, input)
      : apiClient().addHosting(idempotencyKey, appId, input);
  });
  refreshApps();
  return result;
}

/** Runs the hosting check for one app now: end-of-support dates and open provider incidents. Safe to repeat. */
export async function refreshHostingAction(appId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().refreshHosting(appId));
  refreshApps();
  return result;
}

export async function removeHostingAction(appId: string, hostingId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().removeHosting(appId, hostingId));
  refreshApps();
  return result;
}

export async function savePersonAction(
  idempotencyKey: string,
  personId: string | null,
  values: PersonInput,
): Promise<ActionResult> {
  const result = await runAction(() =>
    personId
      ? apiClient().updatePerson(idempotencyKey, personId, values)
      : apiClient().createPerson(idempotencyKey, values),
  );
  revalidatePath(ROUTES.people);
  return result;
}

export async function markPersonLeftAction(idempotencyKey: string, personId: string, leftOn: string): Promise<ActionResult> {
  const result = await runAction(() =>
    apiClient().updatePerson(idempotencyKey, personId, {status: PERSON_STATUS.left, leftOn}),
  );
  revalidatePath(ROUTES.people);
  return result;
}

export async function markPersonActiveAction(idempotencyKey: string, personId: string): Promise<ActionResult> {
  const result = await runAction(() =>
    apiClient().updatePerson(idempotencyKey, personId, {status: PERSON_STATUS.active}),
  );
  revalidatePath(ROUTES.people);
  return result;
}

export type CreateApiKeyResult = ActionResult & {apiKey?: ApiKey};

export async function createApiKeyAction(
  idempotencyKey: string,
  values: ApiKeyInput,
): Promise<CreateApiKeyResult> {
  let apiKey: ApiKey | undefined;
  const result = await runAction(async () => {
    apiKey = await apiClient().createApiKey(idempotencyKey, values);
  });
  revalidatePath(ROUTES.settings);
  return {...result, apiKey};
}

export async function revokeApiKeyAction(idempotencyKey: string, id: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().revokeApiKey(idempotencyKey, id));
  revalidatePath(ROUTES.settings);
  return result;
}
