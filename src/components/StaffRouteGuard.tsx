import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useBarista } from "@/lib/barista-store";

// Customer-only pages that admin/barista accounts must not open.
export const CUSTOMER_ONLY = ["/home", "/create", "/creations", "/community"];
// Barista-only pages that admin accounts must not open.
export const BARISTA_ONLY = ["/barista", "/presensi"];

function matches(list: string[], path: string) {
  return list.some((p) => path === p || path.startsWith(p + "/"));
}

export function isCustomerOnly(path: string) {
  return matches(CUSTOMER_ONLY, path);
}

export function isBaristaOnly(path: string) {
  return matches(BARISTA_ONLY, path);
}

export function useStaffHome(): string | null {
  const { roles } = useBarista();
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("barista")) return "/barista";
  return null;
}

export function StaffRouteGuard({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { rolesReady, isAdmin } = useBarista();
  const staffHome = useStaffHome();
  const guarded = isCustomerOnly(path) || isBaristaOnly(path);
  const blocked =
    (!!staffHome && isCustomerOnly(path)) || (isAdmin && isBaristaOnly(path));

  useEffect(() => {
    if (blocked && staffHome) navigate({ to: staffHome, replace: true });
  }, [blocked, staffHome, navigate]);

  // Hide guarded pages until the account type is known, so blocked accounts
  // never see them even for a moment.
  if (guarded && (!rolesReady || blocked)) return null;
  return <>{children}</>;
}
