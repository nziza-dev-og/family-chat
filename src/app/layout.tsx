
import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { IncomingCallProvider } from "@/contexts/IncomingCallContext"; // Import IncomingCallProvider
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FamilyChat',
  description: 'A platform for family communication',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <IncomingCallProvider> {/* Wrap with IncomingCallProvider */}
            {children}
            <Toaster />
          </IncomingCallProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
