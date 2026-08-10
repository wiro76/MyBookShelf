"use client";

import { useEffect, useRef } from "react";

type LibraryResumeFocusProps = {
  targetId: string;
  announcement?: string | null;
};

export function LibraryResumeFocus({ targetId, announcement = null }: LibraryResumeFocusProps) {
  const liveRegion = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId) ?? document.getElementById("titre-bibliotheque");
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (liveRegion.current) liveRegion.current.textContent = announcement ?? "";
  }, [announcement, targetId]);

  return announcement ? <p ref={liveRegion} role="status" className="project-status" /> : null;
}
