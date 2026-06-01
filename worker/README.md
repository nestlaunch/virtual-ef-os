# Daily Digital Cloudflare Backend

This backend is designed for Cloudflare Workers with static assets, D1, and Durable Objects.

## Components

- `worker/index.js`: Worker API and `SessionCoordinator` Durable Object.
- `migrations/0001_initial.sql`: D1 schema for accounts, sessions, assignments, records, and audit log.
- `wrangler.toml`: Cloudflare deployment configuration.

## Deployment

1. Log in to Cloudflare:

   ```powershell
   npx wrangler login
   ```

2. Create the D1 database:

   ```powershell
   npx wrangler d1 create daily-digital-db
   ```

3. Copy the returned database ID into `wrangler.toml`.

4. Apply migrations:

   ```powershell
   npx wrangler d1 migrations apply daily-digital-db --remote
   ```

5. Build and deploy:

   ```powershell
   npm run deploy:worker
   ```

## API Surface

- `GET /api/health`
- `GET /api/accounts`
- `POST /api/accounts`
- `POST /api/login`
- `POST /api/sessions`
- `GET /api/sessions/:pin/state`
- `POST /api/sessions/:pin/join`
- `POST /api/sessions/:pin/push`
- `POST /api/sessions/:pin/event`
- `POST /api/sessions/:pin/end`
- `POST /api/records`
- `GET /api/accounts/:id/report`

## Security Notes

- Patient identity should remain outside the app. Store only de-identified aliases.
- PINs are salted and hashed before D1 storage.
- API keys must be Worker secrets, not `VITE_*` frontend variables.
- Add admin authentication before clinical production use.
