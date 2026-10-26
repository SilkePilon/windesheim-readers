import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Classic shadcn variants keep their 1px border and 1px press nudge. Kept out of the
// shared base so chunky variants never carry a competing translate/transition.
const classic =
  "border border-transparent bg-clip-padding transition-all active:not-aria-[haspopup]:translate-y-px"

// Speelveld "chunky" press: a solid offset shadow (no blur) in `--shade`, `--press`
// tall, and no border (so the fill reaches the edge). On press the button drops by the
// shadow height and the shadow goes away. Under prefers-reduced-motion the press does
// not move and the shadow stays.
const chunky =
  "shadow-[0_var(--press,4px)_0_var(--shade)] transition-[translate,box-shadow,background-color,color,filter] duration-100 hover:brightness-105 active:not-aria-[haspopup]:translate-y-[var(--press,4px)] active:shadow-none motion-reduce:transition-none motion-reduce:active:not-aria-[haspopup]:translate-y-0 motion-reduce:active:shadow-[0_var(--press,4px)_0_var(--shade)] disabled:shadow-none"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[min(var(--radius),12px)] font-heading text-sm font-semibold whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground hover:bg-primary/80 ${classic}`,
        outline:
          `${classic} border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`,
        secondary:
          `${classic} bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground`,
        ghost:
          `${classic} hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50`,
        destructive:
          `${classic} bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40`,
        link: `text-primary underline-offset-4 hover:underline ${classic}`,
        chunky: `bg-primary text-primary-foreground [--shade:var(--primary-shade)] ${chunky}`,
        "chunky-success": `bg-success text-success-foreground [--shade:var(--success-shade)] ${chunky}`,
        "chunky-danger": `bg-danger text-danger-foreground [--shade:var(--danger-shade)] ${chunky}`,
        "chunky-surface": `bg-card text-card-foreground [--shade:var(--chunky)] ${chunky}`,
        flat: `${classic} border-border bg-card text-card-foreground hover:bg-accent aria-expanded:bg-accent`,
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        xl: "h-12 gap-2 rounded-[16px] px-5 text-base [--press:5px] [&_svg:not([class*='size-'])]:size-5",
        "icon-xl":
          "size-11 rounded-[14px] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
