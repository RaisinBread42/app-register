import type {Metadata} from 'next';
import {PRODUCT_NAME, PRODUCT_TAGLINE} from '@/lib/constants';
import {Providers} from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
