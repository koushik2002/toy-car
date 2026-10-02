import { useState } from 'react';
import { Plus, Pencil, ArrowRight, Tag } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { uid } from '../services/storage';
import { saveCoupon, saveOffer, enableCoupon, enableOffer } from '../services/offers';
import { money } from '../services/format';
import AdminLayout from '../components/AdminLayout';
import { Modal, useUI } from '../components/UI';
import type { Coupon, Offer } from '../types';
export default function AdminOffers() {
  const state = useStore(),
    ui = useUI(),
    [edit, setEdit] = useState<Coupon | null>(null),
    [oldCode, setOldCode] = useState(''),
    [offerEdit, setOfferEdit] = useState<Offer | null>(null);
  return (
    <AdminLayout title="A LITTLE EXTRA JOY.">
      <div className="section-top">
        <h2>AUTOMATIC BUNDLE OFFERS</h2>
        <button
          className="btn btn-small"
          onClick={() =>
            setOfferEdit({
              id: uid('offer'),
              name: '',
              description: '',
              rule: 'bundle',
              enabled: true,
            })
          }
        >
          <Plus size={15} /> Create offer
        </button>
      </div>
      <div className="offers-grid">
        {state.offers.map((o) => (
          <div className="panel offer-card" key={o.id}>
            <Tag size={23} />
            <h2>{o.name}</h2>
            <p>{o.description}</p>
            <label className="toggle-row">
              <span>{o.enabled ? 'Enabled' : 'Disabled'}</span>
              <input
                type="checkbox"
                role="switch"
                checked={o.enabled}
                onChange={(e) => enableOffer(o.id, e.target.checked)}
              />
            </label>
            <button className="text-link" onClick={() => setOfferEdit({ ...o })}>
              <Pencil size={14} /> Edit offer copy
            </button>
          </div>
        ))}
      </div>
      <div className="section-top">
        <h2>COUPON CODES</h2>
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            setOldCode('');
            setEdit({ code: '', percent: 10, min: 499, enabled: true });
          }}
        >
          <Plus size={16} /> New coupon
        </button>
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Minimum spend</th>
                <th>Enabled</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {state.coupons.map((c) => (
                <tr key={c.code}>
                  <td>
                    <b className="coupon-code">{c.code}</b>
                  </td>
                  <td>{c.percent}%</td>
                  <td>{money(c.min)}</td>
                  <td>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Enable ${c.code}`}
                      checked={c.enabled}
                      onChange={(e) => enableCoupon(c.code, e.target.checked)}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`Edit coupon ${c.code}`}
                      onClick={() => {
                        setOldCode(c.code);
                        setEdit({ ...c });
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && (
        <Modal title={oldCode ? 'Edit coupon' : 'Create coupon'} onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ui.run(() => saveCoupon(edit, oldCode), 'Coupon saved.')) setEdit(null);
            }}
          >
            <label>
              Code
              <input
                required
                value={edit.code}
                onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Discount (%)
              <input
                type="number"
                min="1"
                max="100"
                required
                value={edit.percent}
                onChange={(e) => setEdit({ ...edit, percent: Number(e.target.value) })}
              />
            </label>
            <label>
              Minimum spend (₹)
              <input
                type="number"
                min="0"
                required
                value={edit.min}
                onChange={(e) => setEdit({ ...edit, min: Number(e.target.value) })}
              />
            </label>
            <button className="btn btn-primary full">
              Save coupon <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {offerEdit && (
        <Modal title="Edit offer copy" onClose={() => setOfferEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ui.run(() => saveOffer(offerEdit), 'Offer updated.')) setOfferEdit(null);
            }}
          >
            <label>
              Name
              <input
                required
                value={offerEdit.name}
                onChange={(e) => setOfferEdit({ ...offerEdit, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                required
                value={offerEdit.description}
                onChange={(e) => setOfferEdit({ ...offerEdit, description: e.target.value })}
              />
            </label>
            <label>
              Pricing rule
              <select
                value={offerEdit.rule ?? offerEdit.id}
                onChange={(e) =>
                  setOfferEdit({ ...offerEdit, rule: e.target.value as 'bundle' | 'b2g1' })
                }
              >
                <option value="bundle">Any 3 for ₹550</option>
                <option value="b2g1">Buy 2, get the lowest-priced third free</option>
              </select>
            </label>
            <p className="muted">Tag eligible models with this offer in Products.</p>
            <button className="btn btn-primary full">Save offer</button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
