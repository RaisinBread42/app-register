'use client';

import type {ComponentType, SVGProps} from 'react';
import {usePathname} from 'next/navigation';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {PRODUCT_NAME, ROUTES} from '@/lib/constants';
import {AppsIcon, OverviewIcon, PeopleIcon, SettingsIcon, SourcesIcon} from '@/lib/ui/icons';
import {BrandMark, SidebarRule, WorkspaceCard} from './Brand';

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

const isUnder = (pathname: string, route: string) =>
  route === ROUTES.home ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);

/** The frame of every register page: the prototype's dark sidebar; each page draws its own topbar. */
export function RegisterShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const item = (label: string, route: string, icon: SvgIcon) => (
    <SideNavItem label={label} href={route} icon={icon} isSelected={isUnder(pathname, route)} />
  );
  return (
    <AppShell
      height="auto"
      variant="wash"
      sideNav={
        <SideNav
          header={<SideNavHeading heading={PRODUCT_NAME} subheading="by Obsidian Software" headingHref={ROUTES.home} icon={<BrandMark />} />}
          topContent={<SidebarRule />}
          footer={<WorkspaceCard />}>
          <SideNavSection title="Workspace" isHeaderHidden>
            {item('Overview', ROUTES.home, OverviewIcon)}
            {item('Applications', ROUTES.applications, AppsIcon)}
            {item('Sources', ROUTES.sources, SourcesIcon)}
          </SideNavSection>
          <SidebarRule />
          <SideNavSection title="Admin" isHeaderHidden>
            {item('Settings', ROUTES.settings, SettingsIcon)}
            {item('People', ROUTES.people, PeopleIcon)}
          </SideNavSection>
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
