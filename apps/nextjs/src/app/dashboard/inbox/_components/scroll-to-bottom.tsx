"use client";

import { useEffect, useRef } from "react";

export function ScrollToBottom() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll parent container to bottom
    if (ref.current?.parentElement) {
      ref.current.parentElement.scrollTop = ref.current.parentElement.scrollHeight;
    }
  }, []);

  return <div ref={ref} className="h-0 w-0" />;
}
