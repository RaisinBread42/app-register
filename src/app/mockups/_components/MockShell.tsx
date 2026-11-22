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

type MockShellProps = {
  children: React.ReactNode;
  active: 'list' | 'create' | 'edit' | 'empty' | 'home';
  banner?: React.ReactNode;
};

export function MockShell({children, active, banner}: MockShellProps) {
  return (
    <AppShell
      height="fill"
      variant="wash"
      contentPadding={6}
      banner={banner}
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
                Mockup only · fictional data
              </Text>
              <Badge label="Astryx prototype" variant="neutral" />
            </VStack>
          }>
          <SideNavSection title="Register">
            <SideNavItem
              label="All apps"
              href="/mockups/list"
              isSelected={active === 'list'}
              icon="list"
            />
            <SideNavItem
              label="Add app"
              href="/mockups/create"
              isSelected={active === 'create'}
              icon="plus"
            />
            <SideNavItem
              label="Empty state"
              href="/mockups/empty"
              isSelected={active === 'empty'}
              icon="inbox"
            />
          </SideNavSection>
          <SideNavSection title="People">
            <SideNavItem label="Leavers (later)" isDisabled icon="users" />
            <SideNavItem label="Quarterly review (later)" isDisabled icon="calendar" />
          </SideNavSection>
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
