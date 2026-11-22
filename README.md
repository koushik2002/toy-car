# Tiny Kars

Tiny Kars is the production React, Fastify and PostgreSQL application for the collectible-car
store. The deployable entry point contains only the production storefront and authenticated
customer, seller, staff and super-admin workflows. The former browser-only prototype is not
selectable from the application, is not included in the production bundle and is not deployed.

Implemented areas include:

- public catalogue, filters and five-view product presentation;
- email/password accounts, verification, reset, change password, sessions and roles;
- product administration, CSV imports, series codes, stock, serials and barcode labels;
- shipping policies, vouchers and server-priced Razorpay checkout;
- order history, staff delivery confirmation and notification outboxes;
- loyalty points, store credit and refunds;
- seller online/offline billing, immutable invoice numbers and printable invoices;
- Tally connector jobs and admin retry controls.

## Run the real production application locally

Requires Node.js 22.14+ and npm.

```sh
npm ci
npm run demo:client
```

`demo:client` starts the real production React frontend, Fastify API and a persistent local
PostgreSQL-compatible database. It seeds the demo's 60 cars with five **labelled sample photos**
each, a ₹79 / free-above-₹1,499 shipping rule, the `TINY10` voucher, active billing settings, and
four sample orders for the collector account. The terminal prints the local URLs and credentials;
data is retained under `.local/client-demo-db`. Use `npm run dev:local` for an isolated disposable
database. See `CLIENT_DEMO_GUIDE.md` for the full walkthrough.

The local accounts share one password and are intentionally local-only:

```text
Password: TinyKarsLocal!2026
collector@tinykars.local   customer with sample orders
seller@tinykars.local      seller (billing only)
superadmin@tinykars.local  super admin
admin@tinykars.local       admin
staff@tinykars.local       delivery staff
```

Options: `PUBLIC_BROWSING=1` lets signed-out visitors browse the catalogue (the demo's behaviour);
`LOCAL_API_PORT` / `LOCAL_WEB_PORT` change the default ports 3001 / 5173 when another copy is
running.

Razorpay, Resend, Meta WhatsApp and R2 are fail-closed in this local mode because no provider
credentials are supplied.

## Run against PostgreSQL

Copy `server/env.example` to a private `.env`. Set `DATABASE_URL`, a stable 64-hex-character
`OUTBOX_ENCRYPTION_KEY`, `PUBLIC_WEB_URL` and `ALLOWED_ORIGINS`, then run:

```sh
npm run dev:api
npm run dev
```

The API applies checksum-checked migrations at startup. Provision the first production super admin
from a private interactive terminal:

```sh
PROVISION_ADMIN=1 npm run admin:provision -- owner@example.com
```

Store the generated password in the client-owned password manager and change it after the first
sign-in (My account → Security). Further
roles are assigned by the super admin from the dashboard.

To review a staging site before the real catalogue arrives, `npm run seed:samples` adds the sample
cars (it refuses if products already exist and never runs with `NODE_ENV=production`).
`npm run seed:samples -- --withdraw` unpublishes every product still using sample photos.
`npm run samples:images` regenerates the sample photos from the demo artwork.

## Production build

```sh
npm run lint
npm run check
npm run check:server
npm test
npm run test:integration:local
npm run verify:persistence
npm run build
npm run test:production-ui
```

`npm run build` always builds the production application. There is no demo build flag or demo
deployment command. CI also builds only this production entry point.

For deployment, set `VITE_API_BASE_URL` to the public HTTPS API base at build time. The API host
must receive `NODE_ENV=production`, the database URL, website origins, stable encryption key,
provider secrets and the remaining values documented in `server/env.example`.

## Production safeguards

- Checkout appears only when all Razorpay settings are configured.
- Production startup requires HTTPS origins and an email provider.
- R2 and Meta settings must be provided as complete groups.
- Browser totals are never trusted; prices, stock and discounts are recalculated server-side.
- Inventory reservation, voucher use, payment reconciliation and financial ledgers are idempotent.
- Issued invoices and financial audit entries are immutable.
- Secrets belong in the deployment secret manager, never source code or the frontend bundle.

## Project map

```text
src/production/   production React storefront and role-based dashboards
server/           Fastify API, PostgreSQL migrations and provider integrations
scripts/          local database/test helpers
tests/production/ production desktop/mobile Playwright journeys
tests/unit/       service and transaction tests
docs/             requirements, client handoff and launch evidence
```

See [what we need from the client](docs/client-questions-for-launch.md),
[production launch gates](docs/production-launch-blockers-and-test-results.md) and the
[client deployment checklist](docs/client-deployment-registration-and-photo-checklist.md) before
enabling public payments.
