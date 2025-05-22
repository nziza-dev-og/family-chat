
import type {Metadata} from 'next';
import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { IncomingCallProvider } from "@/contexts/IncomingCallContext";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip"; // Import TooltipProvider

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
      <body className="antialiased">
        <AuthProvider>
          <IncomingCallProvider>
            <TooltipProvider delayDuration={0}> {/* Wrap with TooltipProvider */}
              {children}
              <Toaster />
            </TooltipProvider>
          </IncomingCallProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

    