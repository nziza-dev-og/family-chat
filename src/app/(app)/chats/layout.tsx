
"use client";
import type { ReactNode } from 'react';

export default function ChatsLayout({
  children, // This will be the content of [chatId]/page.tsx or a default view
  params,   // If you need params at this layout level
}: {
  children: ReactNode;
  params?: any; 
}) {
  // This layout is now simplified as the main page will handle the two columns.
  // It primarily provides a wrapper for the chat section.
  return (
    <div className="flex h-[calc(100vh-var(--header-height,0px))] md:h-screen overflow-hidden">
      {/* The children here will be the `page.tsx` from the `chats` directory, 
          which in turn renders the ChatList and the selected ChatView ([chatId]/page.tsx)
      */}
      {children}
    </div>
  );
}
