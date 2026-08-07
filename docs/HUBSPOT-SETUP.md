# HubSpot OAuth — setup and acceptance test

Everything in the flow is implemented and tested. What remains is
configuration: a HubSpot app has to exist, and this deployment needs its
credentials.

| Step | Who | Needs |
|---|---|---|
| 1. Apply the database migration | Developer | Supabase access |
| 2. Generate an encryption key | Developer | nothing |
| 3. Create the HubSpot app | **Client** | HubSpot developer account |
| 4. Configure and verify | Developer | credentials from step 3 |
| 5. Staging token exchange | Developer | steps 1–4 |
| 6. Client acceptance test | **Client** | step 5 signed off |

---

## 1. Apply the migration

`007_oauth.sql` adds the `oauth_states` table, the columns that track token
lifetime and refresh failures, and a view that exposes connections without
their tokens.

Supabase → **SQL Editor** → paste
[`services/api/db/schema.sql`](../services/api/db/schema.sql) → **Run**.
That file is every migration concatenated in order, so it is also the
correct choice for a fresh database.

Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'integrations' ORDER BY column_name;
-- expect: scopes, token_encrypted, last_refreshed_at, refresh_error, …
```

## 2. Generate the encryption key

Tokens are encrypted at rest with AES-256-GCM. Without this key the API
refuses to start an authorization flow rather than storing a credential it
cannot protect.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `services/api/.env` as `INTEGRATION_ENCRYPTION_KEY`.

> Back this key up. Losing it makes every stored token undecryptable and
> every user has to reconnect. Rotating it has the same effect, so treat it
> as permanent unless you are deliberately invalidating all connections.

## 3. What the client must create

Send them this:

> 1. Go to <https://developers.hubspot.com> and sign in with the company
>    HubSpot account.
> 2. **Manage apps → Create app**. Name it whatever you want users to see on
>    the consent screen.
> 3. Open the **Auth** tab.
> 4. Under **Redirect URLs**, add exactly:
>    `https://<api-domain>/v1/integrations/hubspot/callback`
> 5. Under **Scopes**, tick: `oauth`, `crm.objects.contacts.read`,
>    `crm.objects.contacts.write`.
> 6. Send back the **Client ID** and **Client secret** from that same tab.
>
> Please send the secret through <https://onetimesecret.com> rather than
> email or chat.

The redirect URL must match **byte for byte** — a trailing slash or `http`
instead of `https` fails the exchange with a message that does not explain
itself. Get the exact string from the API instead of typing it:

```powershell
Invoke-RestMethod http://localhost:4000/v1/integrations/status |
  Select-Object -ExpandProperty hubspot
```

## 4. Configure and verify

In `services/api/.env`:

```bash
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...
PUBLIC_API_URL=https://<api-domain>      # or http://localhost:4000 locally
INTEGRATION_ENCRYPTION_KEY=...
```

Restart, then confirm all three report ready:

```powershell
Invoke-RestMethod http://localhost:4000/v1/integrations/status
# hubspot.credentials    -> True
# hubspot.encryption_key -> True
# hubspot.redirect_uri   -> must equal what was registered in step 3
```

## 5. Staging token exchange — the milestone evidence

Sign in to the dashboard, then:

```powershell
$h = @{ Authorization = "Bearer $token" }
$r = Invoke-RestMethod -Method Post http://localhost:4000/v1/integrations/hubspot/authorize -Headers $h
Start-Process $r.data.authorize_url
```

Approve in HubSpot. The browser returns to
`/dashboard/integrations?connected=hubspot`.

Capture these four as evidence:

1. **The connection exists and carries a real portal id**

   ```powershell
   Invoke-RestMethod http://localhost:4000/v1/integrations -Headers $h
   # workspace_id = the HubSpot hub id, scopes = what was granted
   ```

2. **The token is encrypted at rest** — in Supabase:

   ```sql
   SELECT provider, token_encrypted, left(access_token, 3) AS envelope, expires_at
   FROM integrations;
   -- token_encrypted = true, envelope = 'v1:', expires_at ≈ 30 minutes out
   ```

3. **Refresh works.** Force it by ageing the token, then make any call:

   ```sql
   UPDATE integrations SET expires_at = NOW() WHERE provider = 'hubspot';
   ```

   ```powershell
   Invoke-RestMethod -Method Post http://localhost:4000/v1/integrations/hubspot/push `
     -Headers $h -ContentType 'application/json' `
     -Body '{"records":[{"email":"acceptance@example.com","firstname":"Acceptance"}]}'
   ```

   `last_refreshed_at` updates and `access_token` changes.

4. **The contact appears in HubSpot** — Contacts → search
   `acceptance@example.com`.

## 6. Client acceptance test

What the client does themselves, in their own HubSpot account:

1. Sign in to the dashboard → **Integrations** → **Connect** on HubSpot
2. Approve the consent screen — confirm the scopes shown are only the three
   requested
3. Run an agent that captures a contact and pushes it
4. Confirm the contact appears in their CRM with the right fields
5. **Disconnect**, and confirm a further push fails with "connect it first"

Step 5 matters: it demonstrates the grant is genuinely revocable, which is
usually the question a security reviewer asks.

---

## Troubleshooting

**`redirect_uri mismatch`** — the registered URL differs from what the API
builds. Compare against `GET /v1/integrations/status`; check the scheme and
any trailing slash.

**`503 INTEGRATION_ENCRYPTION_KEY`** — the key is missing or not 32 bytes.
Regenerate with the command in step 2.

**`This authorization request expired`** — the consent screen sat open for
more than 10 minutes. Start again.

**`This authorization link has already been used`** — states are single-use
by design. Start a new flow rather than reloading the callback.

**Push returns 403 "read-only"** — the user declined write access at the
consent screen. Reconnect and approve it.

**`needs_reconnect: true`** — the grant was revoked from the HubSpot side,
or the refresh token is no longer valid. The user reconnects; no
intervention is possible from our end.
