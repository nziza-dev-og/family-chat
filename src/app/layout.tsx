
import type {Metadata} from 'next';
// import {Geist, Geist_Mono} from 'next/font/google'; // Removed to stop preloading
import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { IncomingCallProvider } from "@/contexts/IncomingCallContext"; // Import IncomingCallProvider
import { Toaster } from "@/components/ui/toaster";

// const geistSans = Geist({ // Removed font setup
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
//   display: 'swap',
// });

// const geistMono = Geist_Mono({ // Removed font setup
//   variable: '--font-geist-mono',
//   subsets: ['latin'],
//   display: 'swap',
// });

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
      {/* Removed geistSans.variable and geistMono.variable from className */}
      <body className="antialiased">
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
