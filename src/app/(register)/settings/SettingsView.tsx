'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {PRODUCT_NAME} from '@/lib/constants';
import {KeyValueRows, PanelCard} from '../_components/Cards';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

export function SettingsView() {
  return (
    <PageFrame crumbs={[{label: 'Settings'}]}>
      <PageHeader title="Settings" description="Workspace configuration and product preferences." />
      <PanelCard title="Workspace settings" subtitle={`How this ${PRODUCT_NAME} workspace looks and where its data comes from`}>
        <KeyValueRows
          rows={[
            {label: 'Brand purple', value: '#612CCC'},
            {label: 'Sidebar', value: '#130F1C'},
            {label: 'Headings', value: 'Poppins'},
            {label: 'Body font', value: 'Inter'},
            {label: 'Data', value: <Badge label="Live register" variant="green" />},
            {label: 'Health and source monitoring', value: <Badge label="Not configured" variant="yellow" />},
            {label: 'Frontend', value: 'Next.js with Astryx components'},
          ]}
        />
      </PanelCard>
    </PageFrame>
  );
}
