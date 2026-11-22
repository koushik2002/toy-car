import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserCog } from 'lucide-react';
import { mutate } from '../api';
import { Empty, useUI } from '../ui';
import { useResource } from '../useResource';
import { PageHeading, useRole } from './shared';

const roles = [
  ['seller', 'Seller — billing desk only'],
  ['staff', 'Delivery staff — confirm deliveries only'],
  ['admin', 'Admin — products, orders, refunds'],
  ['customer', 'Customer — remove team access'],
] as const;

export function TeamPage() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const codes = useResource<{ items: { brand: string; series: string; prefix: string }[] }>(
    '/admin/series-codes',
  );
  const [busy, setBusy] = useState(false);
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            '/admin/users/assign-role',
            {
              email: String(data.get('email') || '')
                .trim()
                .toLowerCase(),
              role: String(data.get('role') || ''),
            },
            csrfToken,
          ),
        'Access updated. The person must sign in again to use it.',
      )
    )
      form.reset();
    setBusy(false);
  }
  return (
    <>
      <PageHeading title="THE TEAM & THE CODES." />
      <div className="cr-two-col">
        <div className="panel">
          <h2>
            <UserCog size={19} /> TEAM ACCESS
          </h2>
          <p className="muted">
            The person first creates and verifies their own account, then you give them access here.
            They must sign in again to see their new screens.
          </p>
          <form onSubmit={assign}>
            <label>
              Verified account email
              <input name="email" type="email" required />
            </label>
            <label>
              Access
              <select name="role" required defaultValue="seller">
                {roles.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy}>
              Update access
            </button>
          </form>
        </div>
        <div className="panel table-panel">
          <h2>
            <ShieldCheck size={19} /> SERIES CODE PREFIXES
          </h2>
          <p className="muted">
            Every brand and series gets one permanent six-digit number. Product codes (…-P) and
            numbered-car serials (…-U) start with it.
          </p>
          {codes.data?.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prefix</th>
                    <th>Brand</th>
                    <th>Series</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.data.items.map((entry) => (
                    <tr key={`${entry.brand}:${entry.series}`}>
                      <td>
                        <b className="coupon-code">{entry.prefix}</b>
                      </td>
                      <td>{entry.brand}</td>
                      <td>{entry.series}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No prefixes yet"
              detail="They appear when the first product is created."
            />
          )}
        </div>
      </div>
    </>
  );
}
