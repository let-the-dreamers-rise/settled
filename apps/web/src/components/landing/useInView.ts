"use client";

import { useEffect, useRef, useState } from "react";

/** True while the element is on screen (or once it has been, with `once`). Without
 * IntersectionObserver the element counts as visible, so nothing stays hidden. */
export function useInView<T extends Element>(opts: { once?: boolean; rootMargin?: string } = {}) {
  const { once = true, rootMargin = "0px 0px -12% 0px" } = opts;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin]);
  return [ref, inView] as const;
}
