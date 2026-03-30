"use client";

import { useEffect, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { HomeFeedType } from "@/lib/catalog";

import { SkeletonGrid } from "./skeleton-grid";

interface HomeFeedNavItem {
  value: HomeFeedType;
  label: string;
  href: string;
}

interface HomeFeedShellProps {
  currentFeed: HomeFeedType;
  navItems: HomeFeedNavItem[];
  children: React.ReactNode;
}

export function HomeFeedShell({
  currentFeed,
  navItems,
  children,
}: HomeFeedShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticFeed, setOptimisticFeed] = useOptimistic(
    currentFeed,
    (_currentState, nextFeed: HomeFeedType) => nextFeed,
  );

  useEffect(() => {
    navItems.forEach((item) => {
      if (item.value !== currentFeed) {
        router.prefetch(item.href);
      }
    });
  }, [currentFeed, navItems, router]);

  function handleFeedClick(item: HomeFeedNavItem) {
    if (isPending || item.value === currentFeed) {
      return;
    }

    startTransition(() => {
      setOptimisticFeed(item.value);
      router.prefetch(item.href);
      router.push(item.href);
    });
  }

  function handlePointerEnter(item: HomeFeedNavItem) {
    if (item.value === currentFeed) {
      return;
    }

    router.prefetch(item.href);
  }

  return (
    <div className="homeFeedShell">
      <nav className="profileNav" aria-label="Homepage feeds">
        {navItems.map((item) => {
          const isActive = item.value === optimisticFeed;

          return (
            <button
              key={item.value}
              type="button"
              className={isActive ? "profileNavLink active" : "profileNavLink"}
              aria-current={isActive ? "page" : undefined}
              aria-pressed={isActive}
              disabled={isPending}
              onMouseEnter={() => handlePointerEnter(item)}
              onFocus={() => handlePointerEnter(item)}
              onClick={() => handleFeedClick(item)}
            >
              {item.label}
              {isPending && isActive ? (
                <span className="homeFeedPendingDot" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="homeFeedContent" aria-busy={isPending}>
        {children}
        {isPending ? (
          <div className="homeFeedOverlay" aria-hidden="true">
            <SkeletonGrid count={6} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
