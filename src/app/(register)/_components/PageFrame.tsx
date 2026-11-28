'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Avatar} from '@astryxdesign/core/Avatar';
import {BreadcrumbItem, Breadcrumbs} from '@astryxdesign/core/Breadcrumbs';
import {HStack} from '@astryxdesign/core/HStack';
import {IconButton} from '@astryxdesign/core/IconButton';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {ROUTES, UI_QUERY} from '@/lib/constants';
import {LIVE_DATA_NOTE} from '@/lib/ui/copy';
import {InfoIcon} from '@/lib/ui/icons';
import {WORKSPACE_NAME} from './Brand';

export type Crumb = {label: string; href?: string};

const WORKSPACE_CRUMB = 'Workspace';
/** The prototype's 36px page gutter. */
const GUTTER = 'calc(var(--spacing-8) + var(--spacing-1))';

/** The prototype's topbar (breadcrumb, search, help, avatar) above a page's content column. */
export function PageFrame({crumbs, children}: {crumbs: Crumb[]; children: React.ReactNode}) {
  return (
    <VStack gap={0} minHeight="100%">
      <Topbar crumbs={crumbs} />
      <VStack gap={6} paddingBlockStart={8} paddingBlockEnd={10} maxWidth={1570} width="100%" style={{marginInline: 'auto', paddingInline: GUTTER}}>
        {children}
      </VStack>
    </VStack>
  );
}

function Topbar({crumbs}: {crumbs: Crumb[]}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const search = () => router.push(`${ROUTES.applications}?${new URLSearchParams({[UI_QUERY.search]: query})}`);
  return (
    // On a phone the search moves under the breadcrumbs and shrinks to fit, instead of running off the screen.
    <HStack
      minHeight={70}
      gap={4}
      vAlign="center"
      hAlign="between"
      wrap="wrap"
      paddingBlock={3}
      style={{
        flex: 'none',
        paddingInline: GUTTER,
        background: 'var(--color-background-surface)',
        borderBottom: 'var(--border-width) solid var(--color-border)',
      }}>
      <Breadcrumbs variant="supporting">
        {[{label: WORKSPACE_CRUMB}, ...crumbs].map((crumb, index) => (
          <BreadcrumbItem key={`${index}-${crumb.label}`} href={crumb.href}>
            {crumb.label}
          </BreadcrumbItem>
        ))}
      </Breadcrumbs>
      <HStack gap={3} vAlign="center" hAlign="end" style={{flex: '1 1 240px', minWidth: 0}}>
        <HStack maxWidth={350} style={{flex: 1, minWidth: 0}}>
          <TextInput
            label="Search applications"
            isLabelHidden
            type="search"
            startIcon="search"
            placeholder="Search applications or sources…"
            value={query}
            onChange={setQuery}
            onEnter={search}
            width="100%"
          />
        </HStack>
        <IconButton label="About this data" tooltip={LIVE_DATA_NOTE} icon={<InfoIcon />} variant="secondary" size="sm" />
        <Avatar name={WORKSPACE_NAME} size={32} tooltip={false} />
      </HStack>
    </HStack>
  );
}
