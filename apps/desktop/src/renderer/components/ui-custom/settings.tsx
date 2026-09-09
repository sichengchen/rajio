import { t } from "../../../shared/i18n";
import { useLocale } from "@/lib/locale";
import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Settings Group - Container for related settings
interface SettingsGroupProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function SettingsGroup({
  title,
  description,
  icon: Icon,
  children,
  className,
}: SettingsGroupProps) {
  useLocale();
  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label={title}>
      <header className="flex flex-col gap-1 border-b border-border/60 pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {Icon && <Icon className="size-4" />}
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

// Base Settings Item - Flexible container for any setting
interface SettingsItemProps {
  label: string;
  description?: string;
  controlId?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsItem({
  label,
  description,
  controlId,
  children,
  className,
}: SettingsItemProps) {
  useLocale();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={controlId} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p
            id={controlId ? `${controlId}-description` : undefined}
            className="text-sm text-muted-foreground [overflow-wrap:anywhere]"
          >
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// Switch Setting - Toggle on/off
interface SettingsSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function SettingsSwitch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SettingsSwitchProps) {
  useLocale();
  const controlId = React.useId();
  return (
    <SettingsItem
      controlId={controlId}
      label={label}
      description={description}
      className={className}
    >
      <Switch
        id={controlId}
        aria-describedby={description ? `${controlId}-description` : undefined}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </SettingsItem>
  );
}

// Select Setting - Dropdown selection
interface SelectOption {
  value: string;
  label: string;
}

interface SettingsSelectProps {
  label: string;
  description?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SettingsSelect({
  label,
  description,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: SettingsSelectProps) {
  useLocale();
  const controlId = React.useId();
  return (
    <SettingsItem
      controlId={controlId}
      label={label}
      description={description}
      className={className}
    >
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={controlId}
          aria-describedby={description ? `${controlId}-description` : undefined}
          className="w-full sm:w-56"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsItem>
  );
}

// Action Setting - Button with confirmation
interface SettingsActionProps {
  label: string;
  description?: string;
  actionLabel: string;
  loadingLabel?: string;
  onAction: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  icon?: LucideIcon;
  confirmDialog?: {
    title: string;
    description: string;
    actionLabel?: string;
  };
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function SettingsAction({
  label,
  description,
  actionLabel,
  loadingLabel,
  onAction,
  variant = "outline",
  icon: Icon,
  confirmDialog,
  disabled,
  loading,
  className,
}: SettingsActionProps) {
  useLocale();
  const button = (
    <Button
      variant={variant === "destructive" ? "destructive" : "outline"}
      size="sm"
      onClick={confirmDialog ? undefined : onAction}
      disabled={disabled || loading}
      className="flex items-center justify-start gap-2 px-3"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {loading ? loadingLabel || actionLabel : actionLabel}
    </Button>
  );

  const content = (
    <SettingsItem label={label} description={description} className={className}>
      {confirmDialog ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onAction}
                className={cn(
                  variant === "destructive" && "bg-destructive hover:bg-destructive/90",
                )}
                disabled={loading}
              >
                {loading ? loadingLabel || actionLabel : confirmDialog.actionLabel || actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        button
      )}
    </SettingsItem>
  );

  return content;
}

// Stats Setting - Display statistics
interface SettingsStatsProps {
  label: string;
  description?: string;
  stats: Array<{
    label: string;
    value: string | number;
    className?: string;
  }>;
  className?: string;
}

export function SettingsStats({ label, description, stats, className }: SettingsStatsProps) {
  useLocale();
  return (
    <div className={cn("flex flex-col gap-3 py-4", className)}>
      {(label || description) && (
        <div>
          {label && <Label className="text-sm font-medium">{label}</Label>}
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className={stat.className}>
            <p className="text-muted-foreground text-sm">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Section Divider - Visual separator with optional content
interface SettingsDividerProps {
  className?: string;
  children?: React.ReactNode;
}

export function SettingsDivider({ className, children }: SettingsDividerProps) {
  useLocale();
  return <div className={cn("border-border/60", className)}>{children}</div>;
}

// Alert Setting - Warning or info display
interface SettingsAlertProps {
  variant?: "default" | "warning" | "destructive";
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function SettingsAlert({
  variant = "default",
  icon: Icon,
  children,
  className,
}: SettingsAlertProps) {
  useLocale();
  const variantStyles = {
    default: "border-border bg-muted/50",
    warning: "border-border bg-muted/50",
    destructive: "border-destructive/30 bg-destructive/10",
  };

  const iconStyles = {
    default: "text-muted-foreground",
    warning: "text-foreground",
    destructive: "text-destructive",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 border rounded-lg",
        variantStyles[variant],
        className,
      )}
    >
      {Icon && <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", iconStyles[variant])} />}
      <div className="text-sm">{children}</div>
    </div>
  );
}
