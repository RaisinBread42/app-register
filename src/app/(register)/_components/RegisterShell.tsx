'use client';

import type {ComponentType, SVGProps} from 'react';
import {usePathname} from 'next/navigation';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {PRODUCT_NAME, ROUTES} from '@/lib/constants';
import {AppsIcon, NoticesIcon, OverviewIcon, SettingsIcon} from '@/lib/ui/icons';
import {BrandMark, SidebarRule, WorkspaceCard} from './Brand';

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

const isUnder = (pathname: string, route: string) =>
  route === ROUTES.home ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);

/**
 * The frame of every register page: the prototype's dark sidebar; each page draws its own topbar.
 * Primary destinations follow spec §4 and ADR 0003: Overview, Applications, Notices; Settings below.
 */
export function RegisterShell({children, openNotices}: {children: React.ReactNode; openNotices: number | null}) {
  const pathname = usePathname();
  const item = (label: string, route: string, icon: SvgIcon, endContent?: React.ReactNode) => (
    <SideNavItem label={label} href={route} icon={icon} isSelected={isUnder(pathname, route)} endContent={endContent} />
  );
  /** The open count is text in a badge (a count, never colour alone). */
  const noticeCount = openNotices ? <Badge label={String(openNotices)} variant="neutral" /> : undefined;
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
            {item('Notices', ROUTES.notices, NoticesIcon, noticeCount)}
          </SideNavSection>
          <SidebarRule />
          <SideNavSection title="Admin" isHeaderHidden>
            {item('Settings', ROUTES.settings, SettingsIcon)}
          </SideNavSection>
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
