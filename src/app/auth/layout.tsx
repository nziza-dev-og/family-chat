import type { ReactNode } from 'react';
import { Logo } from '@/components/icons/Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-whatsapp-auth p-4">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md bg-card p-6 sm:p-8 rounded-xl shadow-2xl">
        {children}
      </div>
    </div>
  );
}
