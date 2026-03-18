import type {ReactNode} from 'react';
import type {Metadata, Viewport} from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'Nexus 2D Engine',
  description: 'Nexus 2D Engine editor workspace',
  icons: {
    icon: [
      {url: '/favicon.ico', rel: 'icon', sizes: 'any'},
      {url: '/favicon.svg', type: 'image/svg+xml'},
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a101d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
