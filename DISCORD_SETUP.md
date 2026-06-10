# Discord DM Notification Setup

When a server request is approved in the Super Admin panel, the activation code
is automatically sent as a Discord DM to the requester.

---

## Step 1 — Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → give it a name (e.g. "LW Planner Bot")
3. Go to the **Bot** tab on the left
4. Click **Add Bot** → confirm
5. Under **Token**, click **Reset Token** → copy the token and save it somewhere safe
6. Under **Privileged Gateway Intents**, you don't need to enable anything for DMs
7. Go to **OAuth2 → URL Generator**:
   - Scopes: check `bot`
   - Bot Permissions: check `Send Messages`
8. Copy the generated URL and open it in your browser
9. Add the bot to your Discord server

> The bot must be in the same Discord server as the people making requests
> (Discord only allows DMs to users who share a server with the bot).

---

## Step 2 — Add the column to Supabase

Run this in **Supabase → SQL Editor**:

```sql
ALTER TABLE server_requests ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
```

---

## Step 3 — Deploy the Edge Function

In your terminal, from the project root:

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Log in
supabase login

# Link to your project (get the project ref from Supabase Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy notify-activation
```

---

## Step 4 — Add the bot token as a secret

In the **Supabase Dashboard → Edge Functions → Secrets**, add:

| Name | Value |
|---|---|
| `DISCORD_BOT_TOKEN` | the token you copied in Step 1 |

Or via CLI:
```bash
supabase secrets set DISCORD_BOT_TOKEN=your_token_here
```

---

## Step 5 — Create the Database Webhook

In **Supabase Dashboard → Database → Webhooks**:

1. Click **Create a new hook**
2. **Name:** `notify-activation-on-approve`
3. **Table:** `server_requests`
4. **Events:** check `UPDATE` only
5. **Webhook URL:**
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-activation
   ```
6. **HTTP Headers — add:**
   - `Authorization`: `Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`
   - `Content-Type`: `application/json`
7. Save

> The service role key is in Supabase → Settings → API → **service_role** key.
> Keep it secret — only used server-side here.

---

## How it works end to end

1. User fills in the request form with their Discord handle **and User ID**
2. Request appears in Super Admin panel as `PENDING`
3. Super admin clicks **APPROVE** and sets an activation code
4. Supabase fires the webhook → Edge Function runs
5. Function opens a DM channel with the user's Discord ID
6. Sends a message with the activation code
7. User gets the DM instantly and can activate their server

---

## Testing the function manually

You can test the function with a curl command:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-activation \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "record": {
      "id": "test-id",
      "status": "approved",
      "activation_code": "TEST-CODE-123",
      "discord_user_id": "YOUR_OWN_DISCORD_USER_ID",
      "server_number": "958",
      "name": "Test Server"
    }
  }'
```

Replace `YOUR_OWN_DISCORD_USER_ID` with your own ID to confirm the DM arrives.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Function deploys but no DM arrives | Check Edge Function logs in Supabase Dashboard → Edge Functions → Logs |
| "Cannot send messages to this user" Discord error | The bot isn't in a shared server with the recipient |
| "401 Unauthorized" | Check the `DISCORD_BOT_TOKEN` secret is set correctly |
| Webhook fires but function returns 200 with "not an approval event" | The old record already had status=approved — this is a duplicate fire, safe to ignore |
