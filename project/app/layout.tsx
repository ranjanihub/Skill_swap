import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/auth-context';
import NavbarWrapper from '@/components/navbar-wrapper';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SkillSwap - Exchange Skills, Unlock Potential',
  description: 'Peer-to-peer microlearning for skill exchange through short sessions, in-app chat, and optional external calls',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <NavbarWrapper />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
