"use client";

import { createElement, type HTMLAttributes, type ReactNode } from "react";
import { useInView } from "./useInView";

type Tag = "div" | "section" | "span" | "h1" | "h2" | "h3" | "p" | "ul" | "ol";

/** Adds the class `in` while visible. CSS decides what that animates; loops use
 * `once={false}` so they pause offscreen. */
export function InView({
  as = "div",
  className = "",
  once = true,
  children,
  ...rest
}: { as?: Tag; className?: string; once?: boolean; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  const [ref, inView] = useInView<HTMLElement>({ once });
  return createElement(as, { ...rest, ref, className: `${className}${inView ? " in" : ""}`.trim() }, children);
}
