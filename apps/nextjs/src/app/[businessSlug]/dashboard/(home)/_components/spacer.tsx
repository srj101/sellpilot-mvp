"use client";

import { usePathname } from "next/navigation";

export function Spacer() {
    const pathname = usePathname();
    if (pathname.includes("/dashboard/inbox")) return null;

    return (
        <div className="h-10 w-full shrink-0 pointer-events-none" aria-hidden="true" />
    );
}