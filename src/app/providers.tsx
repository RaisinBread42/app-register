'use client';

import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {themes, defaultThemeSlug} from '@/astryx-themes';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    // Light only for now: the dark palette has not been designed yet, so the reader's
    // system dark mode must not switch the app.
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
