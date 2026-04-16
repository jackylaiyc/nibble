"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/**
 * Lightweight entrance animation helpers.
 *
 * We intentionally keep motion choices narrow: fade + tiny upward rise,
 * optional spring pop. Anything flashier fights the pastel, calm tone
 * of the brand. Using shared variants objects lets the stagger parent
 * orchestrate children without hand-tuning each delay.
 */

export const revealVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 220, damping: 22 },
  },
};

export const staggerParent = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export function MotionReveal({
  children,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={revealVariants}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({
  children,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerParent}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={revealVariants} {...rest}>
      {children}
    </motion.div>
  );
}
