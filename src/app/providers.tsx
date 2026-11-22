'use client';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {themes, defaultThemeSlug} from '@/astryx-themes';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <Theme theme={themes[defaultThemeSlug]}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
