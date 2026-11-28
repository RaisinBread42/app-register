'use client';

import {useRouter} from 'next/navigation';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {SETTINGS_SECTION, settingsRoute, type SettingsSection} from '@/lib/constants';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

const SECTION_LABEL: Record<SettingsSection, string> = {
  [SETTINGS_SECTION.sources]: 'Monitoring sources',
  [SETTINGS_SECTION.people]: 'People',
  [SETTINGS_SECTION.apiKeys]: 'API keys',
};

const SECTION_DESCRIPTION: Record<SettingsSection, string> = {
  [SETTINGS_SECTION.sources]: 'Where the register’s data comes from: the outside sources it checks, their status and last refresh.',
  [SETTINGS_SECTION.people]: 'Everyone who can own an application in this workspace.',
  [SETTINGS_SECTION.apiKeys]: 'Scoped keys that let agents and scripts read and write the register.',
};

/** Settings frame: one tab per section; the section in the URL, so it can be linked to and survives Back. */
export function SettingsView({section, children}: {section: SettingsSection; children: React.ReactNode}) {
  const router = useRouter();
  return (
    <PageFrame crumbs={[{label: 'Settings', href: settingsRoute(SETTINGS_SECTION.sources)}, {label: SECTION_LABEL[section]}]}>
      <PageHeader title="Settings" description={SECTION_DESCRIPTION[section]} />
      <TabList
        value={section}
        onChange={(value) => router.push(settingsRoute(value as SettingsSection), {scroll: false})}
        role="tablist"
        hasDivider>
        {Object.values(SETTINGS_SECTION).map((value) => (
          <Tab key={value} value={value} label={SECTION_LABEL[value]} />
        ))}
      </TabList>
      {children}
    </PageFrame>
  );
}
