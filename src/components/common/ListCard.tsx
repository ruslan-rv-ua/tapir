import type { ReactNode, HTMLAttributes } from "react";

/**
 * Shared framed container for every list screen: outer padding + a rounded,
 * bordered card that fills remaining height and clips overflow. The list's own
 * scroll lives on its <ul> (CompositeList) inside. Visual only — does not affect
 * zone / roving navigation. See docs/FRD-navigation.md and
 * docs/superpowers/specs/2026-06-03-list-card-shell-design.md.
 */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
      <div
        className={
          "flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]" +
          (className ? " " + className : "")
        }
      >
        {children}
      </div>
    </div>
  );
}

/** Centered message shown inside a ListCard for empty / loading / error states. */
export function ListCardState({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={
        "flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm " +
        (className ?? "text-slate-500")
      }
    >
      {children}
    </div>
  );
}
