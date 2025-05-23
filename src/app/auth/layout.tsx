
import type { ReactNode } from 'react';
import { Logo } from '@/components/icons/Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-auth-page p-4">
      <div className="mb-8">
        <Logo className="h-12 w-auto text-primary" />
      </div>
      <div className="w-full max-w-md bg-card p-6 sm:p-8 rounded-xl shadow-2xl border">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} ChatApp. All rights reserved.
      </p>
    </div>
  );
}
