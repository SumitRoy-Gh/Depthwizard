"use client";

import { motion, useMotionValue, useTransform, useSpring, useInView, useScroll, useVelocity, useReducedMotion } from "framer-motion";
import { ReactNode, useRef } from "react";

export function Magnetic({ children, strength = 0.25 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 18 });
  const sy = useSpring(y, { stiffness: 200, damping: 18 });

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = (e.clientX - (rect.left + rect.width / 2)) * strength;
        const dy = (e.clientY - (rect.top + rect.height / 2)) * strength;
        x.set(dx);
        y.set(dy);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Reveal on scroll — fires when the element enters the viewport.
 * One-shot (once: true) so we don't re-animate on every scroll tick.
 */
export function RevealOnScroll({
  children,
  y = 28,
  delay = 0,
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  y?: number;
  delay?: number;
  className?: string;
  amount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : y, filter: reduced ? "none" : "blur(6px)" }}
      animate={
        inView
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: reduced ? 0 : y, filter: reduced ? "none" : "blur(6px)" }
      }
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Parallax — moves the element on the Y axis proportional to its scroll
 * progress through the viewport. Use sparingly — only on hero/decorative
 * elements so it doesn't fight the readable content.
 */
export function Parallax({
  children,
  strength = 60,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength]);
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      style={{ y: reduced ? 0 : y }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Page-level scroll progress bar — sits fixed at the top of the viewport.
 * Tied to the entire document scroll position.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className="fixed left-0 right-0 top-0 z-50 h-px origin-left bg-gradient-to-r from-cyan via-emerald to-amber"
      style={{ scaleX: reduced ? 1 : scrollYProgress }}
    />
  );
}

/**
 * Horizontal marquee that scrolls faster than the page (background motion).
 * Wrap children; pass `speed` in seconds for one full loop.
 */
export function ScrollMarquee({
  children,
  speed = 28,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        className="flex w-max gap-12 whitespace-nowrap"
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={reduced ? undefined : { duration: speed, ease: "linear", repeat: Infinity }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}

export function SplitHeading({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-baseline">
          <motion.span
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{
              duration: 0.8,
              delay: 0.1 + i * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function CharHeading({ text, className }: { text: string; className?: string }) {
  const chars = text.split("");
  return (
    <span className={className}>
      {chars.map((ch, i) => (
        <span key={i} className="inline-block">
          <motion.span
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.5,
              delay: 0.4 + i * 0.025,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function useTilt(strength = 8) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 200, damping: 20 });
  const sry = useSpring(ry, { stiffness: 200, damping: 20 });

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const t = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - t.left) / t.width - 0.5;
    const py = (e.clientY - t.top) / t.height - 0.5;
    ry.set(px * strength);
    rx.set(-py * strength);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  return { srx, sry, onMove, onLeave };
}

// Re-exported for convenience
export { useInView, useScroll, useVelocity };