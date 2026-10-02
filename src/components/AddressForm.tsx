import type { Address } from '../types';
export const blankAddress: Address = {
  id: '',
  name: '',
  phone: '',
  line: '',
  city: '',
  state: '',
  pin: '',
};
export default function AddressFields({
  value,
  onChange,
}: {
  value: Address;
  onChange: (value: Address) => void;
}) {
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="form-grid">
      <label>
        Full name
        <input
          autoComplete="name"
          required
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <label>
        Phone number
        <input
          autoComplete="tel-national"
          inputMode="tel"
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          required
          placeholder="10-digit Indian mobile"
          value={value.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
      </label>
      <label className="span-2">
        Address
        <input
          autoComplete="street-address"
          required
          placeholder="House number, street & locality"
          value={value.line}
          onChange={(e) => set('line', e.target.value)}
        />
      </label>
      <label>
        City
        <input
          autoComplete="address-level2"
          required
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
        />
      </label>
      <label>
        State
        <input
          autoComplete="address-level1"
          required
          value={value.state}
          onChange={(e) => set('state', e.target.value)}
        />
      </label>
      <label>
        PIN code
        <input
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={6}
          pattern="[1-9][0-9]{5}"
          required
          placeholder="6-digit PIN"
          value={value.pin}
          onChange={(e) => set('pin', e.target.value)}
        />
      </label>
    </div>
  );
}
