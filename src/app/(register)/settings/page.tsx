import {apiClient} from '@/lib/ui/api-client';
import {keysFor} from '../_components/idempotency-keys';
import {SettingsView} from './SettingsView';

export default async function SettingsPage() {
  const client = apiClient();
  const [sources, apiKeys] = await Promise.all([client.listMonitoringSources(), client.listApiKeys()]);
  return (
    <SettingsView
      sources={sources}
      apiKeys={apiKeys}
      createKey={crypto.randomUUID()}
      revokeKeys={keysFor(apiKeys)}
    />
  );
}
