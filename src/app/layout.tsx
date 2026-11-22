import type {Metadata} from 'next';
import {Inter, Poppins} from 'next/font/google';
import {PRODUCT_NAME, PRODUCT_TAGLINE} from '@/lib/constants';
import {Providers} from './providers';
import './globals.css';

/** The prototype's fonts; the Obsidian theme reads them through these CSS variables. */
const inter = Inter({subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter', display: 'swap'});
const poppins = Poppins({subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-poppins', display: 'swap'});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
