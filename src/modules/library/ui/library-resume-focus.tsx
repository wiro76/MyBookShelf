"use client";

import { useEffect } from "react";

type LibraryResumeFocusProps = {
  targetId: string;
  announcement?: string | null;
};

export function LibraryResumeFocus({ targetId, announcement = null }: LibraryResumeFocusProps) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [targetId]);

  return announcement ? <p role="status" className="project-status">{announcement}</p> : null;
}
