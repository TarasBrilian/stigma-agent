"use client";

/**
 * Scroll-reveal wrapper (IntersectionObserver-based).
 *
 * Works in every browser — unlike CSS `animation-timeline: view()`, which is
 * unevenly supported. Each element fades + rises + focuses in the first time it
 * scrolls into view (one-shot), with an optional `delay` for staggering a row
 * of siblings. Carries `data-reveal` so CSS can (a) force it visible under
 * `prefers-reduced-motion` and (b) fall back to visible via <noscript>.
 *
 * Presentational only; no data, no side effects beyond the observer.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Element to render (e.g. "li", "section"). Defaults to "div". */
  as?: ElementType;
  /** Stagger delay in ms. */
  delay?: number;
  /** Rise distance in px. */
  y?: number;
  /** Starting scale. */
  scale?: number;
};

export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  delay = 0,
  y = 28,
  scale = 0.97,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : `translateY(${y}px) scale(${scale})`,
    filter: shown ? "none" : "blur(5px)",
    transitionProperty: "opacity, transform, filter",
    transitionDuration: "720ms",
    transitionTimingFunction: "cubic-bezier(0.22, 0.68, 0, 1)",
    transitionDelay: `${delay}ms`,
    willChange: "opacity, transform, filter",
  };

  return (
    <Tag ref={ref} className={className} style={style} data-reveal="">
      {children}
    </Tag>
  );
}
