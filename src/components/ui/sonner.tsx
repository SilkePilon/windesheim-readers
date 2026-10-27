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
// Phones: start just below the StudyShell header / top chips row (44px controls + 2×12px
// padding) so a celebration never covers the close button or the chips.
const BELOW_HEADER = "calc(env(safe-area-inset-top) + 76px)"

/**
 * The app's toaster. Toasts render themselves (`toast.custom` via `@/lib/notify`), so sonner
 * only positions, stacks, times and swipes them: top-center on phones (clear of the dock and
 * below the header row), bottom-right from `md`. Motion lives in index.css.
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
      offset={{ top: BELOW_HEADER, right: 24, bottom: 24, left: 24 }}
      mobileOffset={{ top: BELOW_HEADER, left: 12, right: 12 }}
      {...props}
    />
  )
}

export { Toaster }
