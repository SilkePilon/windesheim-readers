import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Tailwind's `md` breakpoint: below it the floating dock owns the bottom of the screen.
const WIDE = "(min-width: 48rem)"
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
const isWide = () => window.matchMedia(WIDE).matches

/**
 * The app's toaster. Toasts render themselves (`toast.custom` via `@/lib/notify`), so sonner
 * only positions, stacks, times and swipes them: top-center on phones (clear of the dock and
 * below the safe area), bottom-right from `md`. Motion lives in index.css.
 */
const Toaster = (props: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const wide = useSyncExternalStore(subscribe, isWide, () => true)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={wide ? "bottom-right" : "top-center"}
      visibleToasts={3}
      gap={12}
      offset={{ top: "calc(env(safe-area-inset-top) + 16px)", right: 24, bottom: 24, left: 24 }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }}
      {...props}
    />
  )
}

export { Toaster }
