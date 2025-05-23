
"use client";
import type { ReactNode } from 'react';

export default function ChatsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* The children here will be the `page.tsx` from the `chats` directory, 
          which manages the ChatList and the selected ChatView ([chatId]/page.tsx)
      */}
      {children}
    </div>
  );
}
