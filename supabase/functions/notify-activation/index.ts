// Supabase Edge Function — notify-activation
// Triggered by a Database Webhook on server_requests (UPDATE event).
// When a request transitions to status='approved' and has a discord_user_id,
// this function sends the activation code as a Discord DM.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DISCORD_API = 'https://discord.com/api/v10';

serve(async (req: Request) => {
  try {
    const payload = await req.json();

    // Supabase DB webhooks send: { type, table, schema, record, old_record }
    const record = payload.record;

    // Only act on approved requests with an activation code
    if (!record || record.status !== 'approved' || !record.activation_code) {
      return ok('not an approval event — ignored');
    }

    // Already notified (activation_used = true means code was already sent/used)
    // We still send if it hasn't been used yet — idempotent on repeated webhooks
    const discordUserId = record.discord_user_id?.trim();
    if (!discordUserId) {
      console.log(`Request ${record.id} approved but no discord_user_id — skipping DM`);
      return ok('no discord_user_id on record');
    }

    const token = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!token) {
      console.error('DISCORD_BOT_TOKEN secret not set');
      return err('DISCORD_BOT_TOKEN not configured', 500);
    }

    // ── Step 1: Open a DM channel with the user ──────────────────
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });

    if (!dmRes.ok) {
      const body = await dmRes.text();
      console.error('Discord DM channel create failed:', dmRes.status, body);
      return err(`Discord error opening DM: ${dmRes.status} ${body}`, 500);
    }

    const { id: channelId } = await dmRes.json();

    // ── Step 2: Send the activation code ─────────────────────────
    const message = [
      `✅ **Your Last War Server Planner request has been approved!**`,
      ``,
      `**Server:** ${record.server_number} — ${record.name}`,
      ``,
      `**Your activation code:**`,
      `\`\`\``,
      record.activation_code,
      `\`\`\``,
      `Go to the Last War Server Planner, find your server request, and enter this code to activate your server.`,
      ``,
      `⚠️ This code can only be used **once** — keep it safe.`,
    ].join('\n');

    const msgRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    if (!msgRes.ok) {
      const body = await msgRes.text();
      console.error('Discord send message failed:', msgRes.status, body);
      return err(`Discord error sending message: ${msgRes.status} ${body}`, 500);
    }

    console.log(`✓ Activation code DM sent to Discord user ${discordUserId} for server ${record.server_number}`);
    return ok('DM sent');

  } catch (e) {
    console.error('Unhandled error in notify-activation:', e);
    return err(`Internal error: ${e.message}`, 500);
  }
});

function ok(msg: string) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(msg: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
