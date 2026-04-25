import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const saasButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        subtle: "border-border bg-card text-foreground hover:border-border/80 hover:bg-card/80",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface SaaSButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof saasButtonVariants> {}

export const SaaSButton = forwardRef<HTMLButtonElement, SaaSButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(saasButtonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

SaaSButton.displayName = "SaaSButton";

// eslint-disable-next-line react-refresh/only-export-components
export { saasButtonVariants };
