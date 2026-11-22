'use server';

import {revalidatePath} from 'next/cache';
import {PERSON_STATUS, ROUTES, appRoute} from '@/lib/constants';
import {runAction, type ActionResult} from '@/lib/ui/action-result';
import {apiClient, type PersonInput} from '@/lib/ui/api-client';
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

export type CreateAppResult = ActionResult & {appId?: string};

export async function createAppAction(idempotencyKey: string, values: AppFormValues): Promise<CreateAppResult> {
  let appId: string | undefined;
  const result = await runAction(async () => {
    appId = (await apiClient().createApp(idempotencyKey, formToAppInput(values))).id;
  });
  revalidatePath(ROUTES.apps);
  return {...result, appId};
}

export async function updateAppAction(idempotencyKey: string, id: string, values: AppFormValues): Promise<ActionResult> {
  const result = await runAction(() => apiClient().updateApp(idempotencyKey, id, formToAppInput(values)));
  revalidatePath(ROUTES.apps, 'layout');
  return result;
}

export async function archiveAppAction(idempotencyKey: string, id: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().archiveApp(idempotencyKey, id));
  revalidatePath(ROUTES.apps, 'layout');
  return result;
}

export async function saveDependencyAction(
  idempotencyKey: string,
  appId: string,
  dependencyId: string | null,
  values: DependencyFormValues,
): Promise<ActionResult> {
  const input = formToDependencyInput(values);
  const result = await runAction(() =>
    dependencyId
      ? apiClient().updateDependency(idempotencyKey, appId, dependencyId, input)
      : apiClient().addDependency(idempotencyKey, appId, input),
  );
  revalidatePath(appRoute(appId));
  return result;
}

export async function removeDependencyAction(appId: string, dependencyId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().removeDependency(appId, dependencyId));
  revalidatePath(appRoute(appId));
  return result;
}

export async function saveHostingAction(
  idempotencyKey: string,
  appId: string,
  hostingId: string | null,
  values: HostingFormValues,
): Promise<ActionResult> {
  const input = formToHostingInput(values);
  const result = await runAction(() =>
    hostingId
      ? apiClient().updateHosting(idempotencyKey, appId, hostingId, input)
      : apiClient().addHosting(idempotencyKey, appId, input),
  );
  revalidatePath(appRoute(appId));
  return result;
}

export async function removeHostingAction(appId: string, hostingId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().removeHosting(appId, hostingId));
  revalidatePath(appRoute(appId));
  return result;
}

export async function acknowledgeAlertAction(idempotencyKey: string, alertId: string): Promise<ActionResult> {
  const result = await runAction(() => apiClient().acknowledgeAlert(idempotencyKey, alertId));
  revalidatePath(ROUTES.notices);
  revalidatePath(ROUTES.apps, 'layout');
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
