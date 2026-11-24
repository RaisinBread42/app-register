'use client';

import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MOCK_ORG} from '../_data/seed';

export type MockNav =
  | 'overview'
  | 'apps'
  | 'notices'
  | 'sources'
  | 'leaver'
  | 'settings'
  | 'detail';

type MockShellProps = {
  children: React.ReactNode;
  active: MockNav;
};

export function MockShell({children, active}: MockShellProps) {
  return (
    <AppShell
      height="fill"
      variant="wash"
      contentPadding={6}
      sideNav={
        <SideNav
          header={
            <SideNavHeading
              heading="App Register"
              superheading="Obsidian Software"
              subheading={MOCK_ORG.name}
            />
          }
          footer={
            <VStack gap={1} padding={3}>
              <Text type="supporting" color="secondary" display="block">
                Mockup v2 · fictional data
              </Text>
              <Badge label="Obsidian theme" variant="info" />
            </VStack>
          }>
          <SideNavSection title="Workspace">
            <SideNavItem
              label="Overview"
              href="/mockups/overview"
              isSelected={active === 'overview'}
              icon="viewColumns"
            />
            <SideNavItem
              label="Apps"
              href="/mockups/list"
              isSelected={active === 'apps' || active === 'detail'}
              icon="checkDouble"
            />
            <SideNavItem
              label="Notices"
              href="/mockups/notices"
              isSelected={active === 'notices'}
              icon="warning"
            />
            <SideNavItem
              label="Sources"
              href="/mockups/sources"
              isSelected={active === 'sources'}
              icon="externalLink"
            />
            <SideNavItem
              label="Leavers"
              href="/mockups/leaver"
              isSelected={active === 'leaver'}
              icon="check"
            />
          </SideNavSection>
          <SideNavSection title="Admin">
            <SideNavItem
              label="Settings"
              href="/mockups/settings"
              isSelected={active === 'settings'}
              icon="wrench"
            />
          </SideNavSection>
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
