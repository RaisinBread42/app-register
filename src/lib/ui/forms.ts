import {CENTS_PER_UNIT} from '@/lib/constants';
import type {App, AppInput, Dependency, DependencyInput, Hosting, HostingInput} from './api-client';

/**
 * Form values as the inputs hold them (text, or a number for cost), and the
 * plain mapping to and from the API's request shapes. Validation stays in the API.
 */

export type AppFormValues = {
  name: string;
  kind: string;
  ownerId: string;
  backupOwnerId: string;
  category: string;
  vendor: string;
  description: string;
  renewalDate: string;
  noticeDeadline: string;
  billingCycle: string;
  /** In whole currency units, e.g. 1234.5; the API stores cents. */
  cost: number | null;
  runtimeLocation: string;
  dataAndKeys: string;
  whatBreaksIfStopped: string;
};

/** Blank text becomes null, so clearing a field clears it in the register. */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value);

export function emptyAppForm(kind: string): AppFormValues {
  return {
    name: '',
    kind,
    ownerId: '',
    backupOwnerId: '',
    category: '',
    vendor: '',
    description: '',
    renewalDate: '',
    noticeDeadline: '',
    billingCycle: '',
    cost: null,
    runtimeLocation: '',
    dataAndKeys: '',
    whatBreaksIfStopped: '',
  };
}

export function appToForm(app: App): AppFormValues {
  return {
    name: app.name,
    kind: app.kind,
    ownerId: app.owner.id,
    backupOwnerId: app.backupOwner.id,
    category: app.category ?? '',
    vendor: app.vendor ?? '',
    description: app.description ?? '',
    renewalDate: app.renewalDate ?? '',
    noticeDeadline: app.noticeDeadline ?? '',
    billingCycle: app.billingCycle ?? '',
    cost: app.costCents === null ? null : app.costCents / CENTS_PER_UNIT,
    runtimeLocation: app.runtimeLocation ?? '',
    dataAndKeys: app.dataAndKeys ?? '',
    whatBreaksIfStopped: app.whatBreaksIfStopped ?? '',
  };
}

export function formToAppInput(values: AppFormValues): AppInput {
  return {
    name: values.name,
    kind: values.kind,
    ownerId: values.ownerId,
    backupOwnerId: values.backupOwnerId,
    category: orNull(values.category),
    vendor: orNull(values.vendor),
    description: orNull(values.description),
    renewalDate: orNull(values.renewalDate),
    noticeDeadline: orNull(values.noticeDeadline),
    billingCycle: orNull(values.billingCycle),
    costCents: values.cost === null ? null : Math.round(values.cost * CENTS_PER_UNIT),
    runtimeLocation: orNull(values.runtimeLocation),
    dataAndKeys: orNull(values.dataAndKeys),
    whatBreaksIfStopped: orNull(values.whatBreaksIfStopped),
  };
}

export type DependencyFormValues = {
  name: string;
  currentVersion: string;
  latestVersion: string;
  /** Advisory ids separated by commas, e.g. "CVE-2026-1234, GHSA-abcd". */
  vulnerabilities: string;
  recommendedAction: string;
};

const LIST_SEPARATOR = ',';

export function dependencyToForm(dependency?: Dependency): DependencyFormValues {
  return {
    name: dependency?.name ?? '',
    currentVersion: dependency?.currentVersion ?? '',
    latestVersion: dependency?.latestVersion ?? '',
    vulnerabilities: dependency?.vulnerabilities.join(`${LIST_SEPARATOR} `) ?? '',
    recommendedAction: dependency?.recommendedAction ?? '',
  };
}

export function formToDependencyInput(values: DependencyFormValues): DependencyInput {
  return {
    name: values.name,
    currentVersion: values.currentVersion,
    latestVersion: orNull(values.latestVersion),
    vulnerabilities: values.vulnerabilities.split(LIST_SEPARATOR),
    recommendedAction: orNull(values.recommendedAction),
  };
}

export type HostingFormValues = {
  provider: string;
  service: string;
  region: string;
  version: string;
  endOfSupportOn: string;
};

export function hostingToForm(hosting?: Hosting): HostingFormValues {
  return {
    provider: hosting?.provider ?? '',
    service: hosting?.service ?? '',
    region: hosting?.region ?? '',
    version: hosting?.version ?? '',
    endOfSupportOn: hosting?.endOfSupportOn ?? '',
  };
}

export function formToHostingInput(values: HostingFormValues): HostingInput {
  return {
    provider: values.provider,
    service: values.service,
    region: orNull(values.region),
    version: orNull(values.version),
    endOfSupportOn: orNull(values.endOfSupportOn),
  };
}
