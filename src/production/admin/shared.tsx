import type { ReactNode } from 'react';
import { useSession } from '../session';

/** Demo control-room heading: small red kicker over a large display title. */
export function PageHeading({
  title,
  kicker = 'TINY KARS / CONTROL ROOM',
  children,
}: {
  title: string;
  kicker?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <span className="eyebrow red">{kicker}</span>
      <h1>{title}</h1>
      {children && <div className="admin-heading-actions">{children}</div>}
    </div>
  );
}

export function useRole() {
  const { user, csrfToken } = useSession();
  const role = user?.role;
  return {
    user,
    csrfToken,
    role,
    manager: role === 'admin' || role === 'super_admin',
    superAdmin: role === 'super_admin',
    staff: role === 'staff',
    seller: role === 'seller',
  };
}

export const rupeesToPaise = (value: FormDataEntryValue | string | null) =>
  Math.round(Number(value || 0) * 100);

export const newKey = () => crypto.randomUUID();

/** Short message panel for areas a role may look at but not change. */
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice cr-notice">{children}</div>;
}
