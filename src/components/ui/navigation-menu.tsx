import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Root
    ref={ref}
    className={cn("relative z-10 flex max-w-max flex-1 items-center justify-center", className)}
    {...props}
  >
    {children}
    <NavigationMenuViewport />
  </NavigationMenuPrimitive.Root>
));
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn("group flex flex-1 list-none items-center justify-center space-x-1", className)}
    {...props}
  />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuItem = NavigationMenuPrimitive.Item;

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=open]:text-accent-foreground data-[state=open]:bg-accent/50 data-[state=open]:hover:bg-accent data-[state=open]:focus:bg-accent",
);

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(navigationMenuTriggerStyle(), "group", className)}
    {...props}
  >
    {children}
    {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            FINAL MOBILE NAVIGATION IMPLEMENTATION — SURGICAL CHANGE ONLY.

The current mobile navigation is NOT implemented as intended. Fix ONLY the responsive navigation behavior.

CRITICAL FILE RULE:

DO NOT MODIFY \`navigation-menu.tsx\` UNDER ANY CIRCUMSTANCES.

\`navigation-menu.tsx\` is a protected/shared component and must remain completely unchanged:

- Do not edit it.

- Do not rewrite it.

- Do not rename anything inside it.

- Do not change its routes, labels, icons, exports, styles, or structure.

- Do not replace it.

- Do not create a modified copy of it.

If responsive behavior is required, implement it ONLY in the existing AppShell/layout/mobile-navigation wrapper that consumes the navigation component.

DESKTOP (>=768px):

- Keep the existing desktop sidebar/navigation EXACTLY unchanged.

MOBILE (<768px):

Do NOT use a horizontal scrolling navbar.

Create a proper mobile header:

┌─────────────────────────────────┐

│ ☰  Agentic Commerce        👤  │

└─────────────────────────────────┘

Tapping ☰ opens a dropdown/side-sheet navigation containing:

Infrastructure

- Dashboard

- AI Buyer

- External AI Buyer

- Approvals

- Products

- Policies

Evaluation

- Evaluation Lab

- Judge Mode

Developer

- Agent Commerce API

Mobile behavior:

- Hamburger opens the menu.

- Menu overlays the page.

- Add subtle theme-aware backdrop.

- Backdrop click closes menu.

- Selecting a route navigates and closes menu.

- Active route is highlighted.

- Preserve existing icons and exact labels.

- Keep account/sign-out accessible.

- Touch targets >=44px.

- Smooth subtle open/close animation.

- No page-level horizontal overflow.

- Must work from 320px to 767px.

THEME:

- Support existing light and dark themes.

- Use existing design tokens/CSS variables.

- Do NOT hardcode black/white colors.

- Active, hover, border, background and backdrop must adapt to the theme.

IMPLEMENTATION:

1. Inspect the existing AppShell/layout and navigation usage.

2. Reuse the existing route configuration and icons.

3. Do NOT duplicate route definitions unnecessarily.

4. Implement the mobile navigation outside \`navigation-menu.tsx\`.

5. Do not modify unrelated pages/components.

6. Ensure desktop and mobile navigation do not appear simultaneously at the same breakpoint.

DO NOT CHANGE:

- Backend

- APIs

- Database

- Authentication

- Routes

- Page content

- Business logic

- Existing desktop navigation

- \`navigation-menu.tsx\`

FINAL VALIDATION:

- \`navigation-menu.tsx\` remains untouched.

- Desktop sidebar unchanged.

- Mobile hamburger works.

- All 9 navigation destinations work.

- Active state works.

- Menu closes after navigation.

- Backdrop closes menu.

- Light theme works.

- Dark theme works.

- 320px viewport has zero horizontal overflow.

- No horizontal mobile navbar.

- No duplicate navigation.

This is a targeted responsive-navigation implementation. Do not perform any other redesign.`}
    <ChevronDown
      className="relative top-[1px] ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180"
      aria-hidden="true"
    />
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      "left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto ",
      className,
    )}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuLink = NavigationMenuPrimitive.Link;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <div className={cn("absolute left-0 top-full flex justify-center")}>
    <NavigationMenuPrimitive.Viewport
      className={cn(
        "origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]",
        className,
      )}
      ref={ref}
      {...props}
    />
  </div>
));
NavigationMenuViewport.displayName = NavigationMenuPrimitive.Viewport.displayName;

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Indicator
    ref={ref}
    className={cn(
      "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
      className,
    )}
    {...props}
  >
    <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
  </NavigationMenuPrimitive.Indicator>
));
NavigationMenuIndicator.displayName = NavigationMenuPrimitive.Indicator.displayName;

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
};