'use client';

import {usePathname} from 'next/navigation';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {PRODUCT_NAME, ROUTES} from '@/lib/constants';

const isUnder = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

/** The frame of every register page: Obsidian side nav plus the page content. */
export function RegisterShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  return (
    <AppShell
      height="fill"
      variant="wash"
      contentPadding={6}
      sideNav={
        <SideNav
          header={<SideNavHeading heading={PRODUCT_NAME} superheading="Obsidian Software" headingHref={ROUTES.apps} />}
          footer={
            <VStack padding={3}>
              <Text type="supporting" color="secondary" display="block">
                Shared password access until sign-in arrives.
              </Text>
            </VStack>
          }>
          <SideNavSection title="Register">
            <SideNavItem label="Apps" href={ROUTES.apps} isSelected={isUnder(pathname, ROUTES.apps)} />
            <SideNavItem label="People" href={ROUTES.people} isSelected={isUnder(pathname, ROUTES.people)} />
            <SideNavItem
              label="Notices"
              href={ROUTES.notices}
              isSelected={isUnder(pathname, ROUTES.notices)}
            />
          </SideNavSection>
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
