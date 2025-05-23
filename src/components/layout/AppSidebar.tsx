
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, UserCircle, Settings, LogOut, Info, Bell, Users, FolderArchive, Edit3, Search, Activity } from "lucide-react";
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
import { Logo } from "@/components/icons/Logo";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NavItem = ({ href, icon: Icon, label, isMobile, badgeCount }: { href: string; icon: React.ElementType; label: string; isMobile: boolean; badgeCount?: number }) => {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
  const { state } = useSidebar();

  const commonClasses = "w-full justify-start items-center gap-3.5 text-sm h-11 px-3.5 py-2.5 relative rounded-lg";
  const activeClasses = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 font-medium";
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
          "absolute right-3 top-1/2 -translate-y-1/2 ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold flex items-center justify-center min-w-[1.25rem] h-5",
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
                "flex items-center",
                commonClasses,
                isActive ? activeClasses : inactiveClasses,
                "px-2.5 justify-center" 
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </a>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md ml-2">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} passHref legacyBehavior>
      <a
        className={cn(
          "flex items-center",
          commonClasses,
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
    return (names[0][0] + (names[names.length - 1][0] || names[0][1] || '')).toUpperCase();
  };

  const mainNavItems = [
    { href: "/chats", icon: MessageSquareText, label: "Chats", badgeCount: 3 }, 
    { href: "/status", icon: Activity, label: "Status", badgeCount: 1 }, 
    { href: "/profile", icon: UserCircle, label: "Profile" },
    // { href: "/groups", icon: Users, label: "Groups" }, // Example for future
    // { href: "/settings", icon: Settings, label: "Settings" }, // Example for future
  ];


  if (!user) return null;

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar className="border-r bg-sidebar text-sidebar-foreground w-[var(--sidebar-width)] group-data-[state=collapsed]:w-[var(--sidebar-width-icon)] transition-[width]" collapsible="icon" side="left">
        <SidebarHeader className="p-3 h-[var(--header-height)] flex items-center justify-between border-b border-sidebar-border">
          <Link href="/chats" className={cn("flex items-center gap-2.5", (state === "collapsed" && !isMobile) ? "justify-center w-full" : "")}>
            <Logo className={cn("h-7 w-auto text-primary")} />
             <span className={cn("font-semibold text-lg text-foreground", (state === "collapsed" && !isMobile) && "hidden")}>
              ChatApp
            </span>
          </Link>
        </SidebarHeader>
        
        <SidebarContent className="flex-1 flex flex-col justify-between p-3 space-y-3">
          <SidebarMenu>
            {mainNavItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                 <NavItem href={item.href} icon={item.icon} label={item.label} isMobile={isMobile} badgeCount={item.badgeCount} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          
          <SidebarMenu className="mt-auto"> 
             <SidebarMenuItem>
              { (state === 'expanded' || isMobile) ? (
                <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-3.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-11 px-3.5 py-2.5 rounded-lg">
                  <LogOut className="h-5 w-5" />
                  <span>Log out</span>
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full h-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg">
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-popover text-popover-foreground border-border shadow-md ml-2">
                    <p>Log out</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="mt-2 border-t border-sidebar-border pt-3">
                <Link href="/profile" className={cn("flex items-center gap-3", (state === "collapsed" && !isMobile) && "justify-center")}>
                  <Avatar className={cn("h-9 w-9 border-2 border-primary/50", (state === "collapsed" && !isMobile) && "h-8 w-8")}>
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="person portrait" />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn((state === "collapsed" && !isMobile) && "hidden")}>
                    <p className="text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">{user.displayName || "Current User"}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[120px]">{user.email}</p>
                  </div>
                </Link>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
