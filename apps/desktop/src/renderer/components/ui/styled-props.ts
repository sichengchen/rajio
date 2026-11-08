import type { ComponentProps, ElementType } from "react";

/** These wrappers merge a static class name with the component styles. */
export type StyledProps<Component extends ElementType> = Omit<
  ComponentProps<Component>,
  "className"
> & {
  className?: string;
};
