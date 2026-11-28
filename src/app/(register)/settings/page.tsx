import {SETTINGS_SECTION, UI_QUERY} from '@/lib/constants';
import {apiClient} from '@/lib/ui/api-client';
import {settingsSection, type SearchParams} from '@/lib/ui/list-filters';
import {keysFor} from '../_components/idempotency-keys';
import {ApiKeysSection} from './ApiKeysSection';
import {MonitoringSourcesSection} from './MonitoringSourcesSection';
import {PeopleSection} from './PeopleSection';
import {SettingsView} from './SettingsView';

/** Settings loads only the open section's data. */
export default async function SettingsPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const section = settingsSection((await searchParams)[UI_QUERY.section]);
  return <SettingsView section={section}>{await sectionContent(section)}</SettingsView>;
}

async function sectionContent(section: ReturnType<typeof settingsSection>) {
  const client = apiClient();
  if (section === SETTINGS_SECTION.people) {
    const people = await client.listPeople();
    return (
      <PeopleSection
        people={people}
        keys={{add: crypto.randomUUID(), reactivate: crypto.randomUUID(), edit: keysFor(people), markLeft: keysFor(people)}}
      />
    );
  }
  if (section === SETTINGS_SECTION.apiKeys) {
    const apiKeys = await client.listApiKeys();
    return <ApiKeysSection apiKeys={apiKeys} createKey={crypto.randomUUID()} revokeKeys={keysFor(apiKeys)} />;
  }
  return <MonitoringSourcesSection sources={await client.listMonitoringSources()} />;
}
