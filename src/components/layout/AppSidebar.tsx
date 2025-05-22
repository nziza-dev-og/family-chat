
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, UserCircle, Settings, LogOut, ShieldQuestion, Bell, Users, FolderArchive, Edit3, Search } from "lucide-react"; // Updated icons
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/icons/Logo"; // Using existing logo
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NavItem = ({ href, icon: Icon, label, isMobile, badgeCount }: { href: string; icon: React.ElementType; label: string; isMobile: boolean; badgeCount?: number }) => {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href)); // Generic active check
  const { state } = useSidebar();

  const commonButtonClasses = "w-full justify-start items-center gap-3 text-sm h-11 px-3 py-2.5 relative";
  const activeClasses = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90";
  const inactiveClasses = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  const content = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0")} />
      <span className={cn(
          "truncate",
          (state === "collapsed" && !isMobile) ? "hidden" : "inline"
        )}
      >
        {label}
      </span>
      {badgeCount && badgeCount > 0 && (
        <span className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex items-center justify-center",
          (state === "collapsed" && !isMobile) ? "hidden" : "inline-flex"
        )}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </>
  );

  if (state === 'collapsed' && !isMobile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={href} passHref legacyBehavior>
            <a
              className={cn(
                "flex items-center rounded-md",
                commonButtonClasses,
                isActive ? activeClasses : inactiveClasses,
                "px-2.5 justify-center" // Icon-only for collapsed
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </a>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} passHref legacyBehavior>
      <a
        className={cn(
          "flex items-center rounded-md",
          commonButtonClasses,
          isActive ? activeClasses : inactiveClasses
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {content}
      </a>
    </Link>
  );
};


export function AppSidebar() {
  const { isMobile, state } = useSidebar();
  const router = useRouter();
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/auth/login");
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 1).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  // Sidebar items based on the image, keeping existing core items
  const mainNavItems = [
    { href: "/chats", icon: MessageSquareText, label: "All chats", badgeCount: 43 }, // Example badge
    { href: "/work", icon: Bell, label: "Work", badgeCount: 4 }, // Placeholder
    { href: "/friends", icon: Users, label: "Friends" }, // Placeholder
    { href: "/news", icon: Settings /* Placeholder icon */, label: "News" }, // Placeholder
    { href: "/archive", icon: FolderArchive, label: "Archive chats" }, // Placeholder
  ];

  const bottomNavItems = [
    { href: "/profile", icon: UserCircle, label: "Profile" },
    { href: "/edit-profile", icon: Edit3, label: "Edit" }, // Placeholder for edit profile, or combine with main profile
  ];

  if (!user) return null; // Don't render sidebar if no user (though layout usually prevents this)

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar className="border-r bg-sidebar text-sidebar-foreground w-[var(--sidebar-width)] group-data-[state=collapsed]:w-[var(--sidebar-width-icon)] transition-[width]" collapsible="icon" side="left">
        <SidebarHeader className="p-3 h-16 flex items-center justify-between border-b border-sidebar-border">
          <Link href="/chats" className={cn("flex items-center gap-2", (state === "collapsed" && !isMobile) ? "justify-center w-full" : "")}>
            <Logo className={cn("h-7 w-auto fill-current text-sidebar-primary-foreground")} />
          </Link>
        </SidebarHeader>
        
        <SidebarContent className="flex-1 flex flex-col justify-between p-2 space-y-2">
          <SidebarMenu>
            {mainNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                 <NavItem href={item.href} icon={item.icon} label={item.label} isMobile={isMobile} badgeCount={item.badgeCount} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          
          <SidebarMenu className="mt-auto"> {/* Pushes to bottom */}
            {bottomNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                 <NavItem href={item.href} icon={item.icon} label={item.label} isMobile={isMobile} />
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              { (state === 'expanded' || isMobile) ? (
                <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-11 px-3 py-2.5">
                  <LogOut className="h-5 w-5" />
                  <span>Log out</span>
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md">
                    <p>Log out</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
