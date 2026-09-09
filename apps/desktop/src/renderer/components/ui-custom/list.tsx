import * as React from "react";
import { cn } from "@/lib/utils";

const List = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("w-full min-w-0 space-y-0", className)} {...props} />
  ),
);
List.displayName = "List";

const ListItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    interactive?: boolean;
  }
>(({ className, interactive = false, onKeyDown, ...props }, ref) => (
  <div
    ref={ref}
    data-list-item=""
    data-interactive={interactive || undefined}
    className={cn(
      "relative flex w-full min-w-0 items-center py-4 px-4",
      "after:content-[''] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-px after:bg-border last:after:hidden",
      interactive && [
        "cursor-pointer transition-colors",
        "hover:bg-accent hover:text-accent-foreground hover:rounded-lg",
      ],
      className,
    )}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (!event.defaultPrevented && interactive && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.currentTarget.click();
      }
    }}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
    {...props}
  />
));
ListItem.displayName = "ListItem";

const ListItemLeading = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-shrink-0 mr-3", className)} {...props} />
  ),
);
ListItemLeading.displayName = "ListItemLeading";

const ListItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0 flex-1 overflow-hidden", className)} {...props} />
  ),
);
ListItemContent.displayName = "ListItemContent";

const ListItemTrailing = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-shrink-0 ml-3", className)} {...props} />
  ),
);
ListItemTrailing.displayName = "ListItemTrailing";

const ListItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onClick, onKeyDown, ...props }, ref) => (
    <ListItemTrailing
      ref={ref}
      className={cn("flex items-center gap-1", className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
      {...props}
    />
  ),
);
ListItemActions.displayName = "ListItemActions";

const ListItemTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "min-w-0 max-w-full overflow-hidden font-medium leading-none tracking-tight [overflow-wrap:anywhere]",
      className,
    )}
    {...props}
  />
));
ListItemTitle.displayName = "ListItemTitle";

const ListItemDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "mt-1 min-w-0 max-w-full overflow-hidden text-sm text-muted-foreground [overflow-wrap:anywhere]",
      className,
    )}
    {...props}
  />
));
ListItemDescription.displayName = "ListItemDescription";

const ListItemMeta = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mb-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  ),
);
ListItemMeta.displayName = "ListItemMeta";

export {
  List,
  ListItem,
  ListItemLeading,
  ListItemContent,
  ListItemTrailing,
  ListItemActions,
  ListItemTitle,
  ListItemDescription,
  ListItemMeta,
};
