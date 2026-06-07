# 958 Server Planner — Project Overview

> Last War: Survival alliance planning tool.
> Multi-server platform built with React 19 + Vite + Supabase.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, React Router DOM 7 |
| Database | Supabase (PostgreSQL + Realtime) |
| Auth | Custom — SHA-256 passwords, localStorage sessions (no Supabase Auth) |
| Styling | Vanilla CSS + inline styles (no Tailwind) |
| Hosting | Vercel (auto-deploys from `main` branch) |
| Icons | Lucide React |

---

## How Auth Works

There is no traditional user account system. Instead there are three login types, each using a **shared or personal password hashed with SHA-256** and compared against what is stored in the database. Sessions are saved to `localStorage`.

### Session Shape
```js
{
  serverId:    string,
  serverName:  string,
  role:        'admin' | 'owner' | 'member',
  allianceId:  string | null,
  allianceName: string | null,
  memberId:    string | null,   // member only
  username:    string | null,   // member only
  allianceRole: 'member' | 'alliance_admin' | null,
}
```

### Login Types

| Role | Password | Who uses it |
|------|---------|------------|
| **Server Admin** | Shared server password | The server manager — full control over server settings, all alliances and members |
| **Alliance Owner** | Shared alliance owner password | Alliance leader — manages their own alliance |
| **Member** | Personal username + password | Individual players |

A session is always scoped to one server. Visiting a different server's dashboard with an existing session shows the content but does not grant access to protected features.

---

## Role Hierarchy & Permissions

```
Server Admin
  └── can create / edit / delete alliances
  └── can manage all members across all alliances
  └── can change admin password
  └── can delete the entire server (with double confirm + type DELETE)
  └── can view any alliance's roster in Alliance HQ

  Alliance Owner
    └── can manage their own alliance's members (edit / remove)
    └── can promote up to 10 members to Alliance Admin
    └── can revoke Alliance Admin status
    └── can change owner password
    └── can toggle roster visibility settings
    └── can copy the alliance invite link

    Alliance Admin (up to 10 per alliance, promoted by owner)
      └── can edit and remove members in their alliance
      └── can copy the alliance invite link
      └── cannot change settings or promote others

      Member
        └── can edit their own stats/profile only
        └── can view the alliance roster (if public)
```

---

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | ServerSelect | Lists all servers. Create a new server from here. |
| `/join/:inviteCode` | JoinServer | Resolves any invite code → redirects to the right destination |
| `/server/:serverId` | ServerDashboard | Server hub — login, feature cards, navigation |
| `/server/:serverId/admin` | AdminPanel | Server admin only — manage alliances, members, server settings |
| `/server/:serverId/alliance` | AllianceHQ | Alliance roster, member profiles, management panels |
| `/server/:serverId/map` | Map | War map (exists, not yet updated for new schema) |
| `/server/:serverId/rules` | Rules | Rules page (exists, not yet updated) |
| `/server/:serverId/register/:allianceId` | Register | Self-registration via alliance invite link |

---

## Invite Link System

Every server and every alliance has a unique **invite code** (24-char hex). Links take the form:

```
https://your-site.com/join/<inviteCode>
```

The `JoinServer` page resolves the code:
- **Server invite** → goes to Server Dashboard
- **Alliance invite** → goes to Register page for that alliance
- **Handshake invite** → goes to handshake flow (not yet built)

Invite links are generated when a server/alliance is created and can be copied from the Admin Panel (server invite) or Alliance HQ settings (alliance invite).

---

## Database Schema

### Tables

#### `servers`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| server_number | TEXT | e.g. "958" |
| name | TEXT | e.g. "958 Mastermind" |
| admin_password | TEXT | SHA-256 hex |
| invite_code | TEXT | Unique, random 24-char hex |
| created_at | TIMESTAMPTZ | |

#### `alliances`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| server_id | UUID | FK → servers |
| name | TEXT | |
| tag | TEXT | e.g. "[958]", optional |
| color | TEXT | Hex color, default #00c8ff |
| owner_password | TEXT | SHA-256 hex |
| invite_code | TEXT | Unique invite link token |
| roster_public | BOOLEAN | Whether roster is visible to all server members |
| roster_show_power | BOOLEAN | Whether T1 power shows in public roster |
| created_at | TIMESTAMPTZ | |

#### `members`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| server_id | UUID | FK → servers |
| alliance_id | UUID | FK → alliances (nullable) |
| username | TEXT | Unique per server |
| password | TEXT | SHA-256 hex |
| in_game_name | TEXT | Display name |
| power1/2/3 | NUMERIC | T1/T2/T3 squad power |
| has_squad4 | BOOLEAN | |
| troop1/2/3 | TEXT | Tank / Air / Missile |
| canyon_team | TEXT | A, B, or any |
| canyon_sub | BOOLEAN | Prefers sub role |
| desert_team | TEXT | A, B, or any |
| desert_sub | BOOLEAN | Prefers sub role |
| profession | TEXT | Engineer / Warlord |
| garrison | TEXT | yes / no |
| quickstride | TEXT | yes / no |
| resistance | INTEGER | Base resistance value |
| coffee_buff | TEXT | none / 200 / 500 |
| notes | TEXT | Freeform |
| alliance_role | TEXT | member / alliance_admin |
| last_updated | TIMESTAMPTZ | |

#### `territories`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | Tile ID e.g. "A61" |
| season_map_id | UUID | FK → season_maps |
| owner_id | UUID | FK → alliances (nullable) |
| last_capture_at | TIMESTAMPTZ | |
| notes | TEXT | |
> Composite primary key: (id, season_map_id)

#### `season_maps`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | TEXT | e.g. "Season 5: Wild West" |
| created_by | UUID | FK → servers |
| max_servers | INT | Default 8 |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

#### `season_map_servers`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| season_map_id | UUID | FK → season_maps |
| server_id | UUID | FK → servers |
| warzone | TEXT | A–H (center I is contested) |
| joined_at | TIMESTAMPTZ | |
> Unique constraints: (season_map_id, server_id) and (season_map_id, warzone)

#### `server_handshakes`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| initiator_server_id | UUID | FK → servers |
| target_server_id | UUID | FK → servers (nullable until accepted) |
| invite_code | TEXT | Unique |
| status | TEXT | pending / accepted / revoked |
| share_map | BOOLEAN | Toggle: share map data |
| share_roster | BOOLEAN | Toggle: share roster data |
| share_player_info | BOOLEAN | Toggle: share player stats |
| created_at | TIMESTAMPTZ | |
| accepted_at | TIMESTAMPTZ | |

---

## Alliance HQ — Panel Layout

The Alliance HQ page (`/server/:serverId/alliance`) renders up to 4 stacked panels depending on the logged-in role:

### Panel 1 — Server Admin View
*Visible to: Server Admin only*
- Alliance picker dropdown (admin has no alliance, picks which to view)
- Link back to Admin Panel

### Panel 2 — Alliance Management
*Visible to: Owner + Alliance Admins*

**ROSTER tab** — Table of all members with edit and remove buttons. Clicking edit opens a full stats form for that member.

**ADMINS tab** *(Owner only)* — Lists current alliance admins (max 10). Shows all regular members with a Promote button. Owner can revoke admin status at any time.

**SETTINGS tab** *(Owner only)*
- Copy alliance invite link
- Toggle: roster visible to all server members
- Toggle: show T1 power in public roster
- Change owner password

### Panel 3 — My Profile
*Visible to: Any logged-in member (has a memberId)*
- Collapsible inline form
- Edits own record only
- Fields: In-Game Name, T1/T2/T3 Power + Troop Type, Squad 4, Canyon Storm preference, Desert Storm preference, Profession, Resistance, Garrison, Quickstride, Coffee Buff, Notes

### Panel 4 — Roster View
*Visible to: All (if roster_public) or alliance members regardless*
- **ROSTER tab**: full member table with T1 power (power column hidden if owner disabled it for non-members), troop type, canyon/desert teams, profession, resistance, notes
- **CANYON WISHLIST tab**: players grouped by Team A / Team B / Substitutes / Flexible
- **DESERT WISHLIST tab**: same grouping for desert storm

---

## Admin Panel — Tab Layout

Accessible at `/server/:serverId/admin`, admin role required.

### ALLIANCES tab
- List of all alliances with color, name, tag
- Create new alliance (name, tag, color picker, owner password)
- Edit existing (same fields — leave password blank to keep current)
- Copy alliance invite link
- Delete alliance (cascades to members)

### MEMBERS tab
- Search by username or in-game name
- View all members across all alliances
- Reassign member to a different alliance (inline dropdown)
- Remove member

### SERVER tab
- Copy server invite link
- Change admin password (with confirmation)
- **DANGER ZONE**: Delete server — 3-step flow: button → confirm → type "DELETE" exactly → permanently deletes server + all data, logs out

---

## What Is Not Built Yet

### War Map
- The `Map` page exists but still uses the old single-server schema
- Needs to be updated to use `territories` + `season_map_id` scoping
- Should support: territory ownership per alliance, notes per tile

### Season Map (Phase 4)
- Admin creates a season (name, active flag)
- Admin invites up to 8 other servers, each assigned a warzone (A–H)
- Center zone (I) is contested
- Private view per server + shared view showing all 8 servers
- Schema is already built (`season_maps`, `season_map_servers`, `territories`)

### Cross-Server Handshake (Phase 5)
- Server admin generates a handshake invite link
- Target server admin accepts
- Configurable visibility toggles: share map, share roster, share player info
- Either side can revoke
- Schema already built (`server_handshakes`)

### Season-Specific Member Data
- Each of the 6 seasons in Last War has different relevant player fields
- Currently the member table holds generic season stats
- Future: season-specific sections added to My Profile panel

### Alliance Owner in Member Registration
- Currently when a member registers via invite link they go into the alliance with role `member`
- Future consideration: first registrant could optionally become the owner-linked member

### Leaderboard
- Marked "SOON" on dashboard
- Not started

### Rules Page
- Exists but is the old single-server version, not updated

---

## Environment Variables

Required in Vercel (Settings → Environment Variables) and locally in `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Optional:
```
VITE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
```

---

## Git Workflow

- `main` → production (auto-deploys to Vercel)
- `feature/*` → work in progress (Vercel creates a preview URL per PR)
- All work done in Claude's cloud container → pushed to feature branch → PR → merge to main
- Pull in GitHub Desktop after each merge to keep local in sync

---

## Key Design Decisions

**No Supabase Auth** — Deliberate. Shared passwords (admin, owner) don't fit individual account auth. Custom SHA-256 + localStorage sessions keep things simple for a trusted group.

**Multi-tenant via server_id** — Every table is scoped by `server_id`. Alliances, members, territories, seasons all belong to a server. No data leaks between servers.

**Invite-only access** — No public signup. Every player joins via an alliance invite link shared by the owner or admin.

**RLS is open, auth is client-side** — Supabase RLS allows all reads and most writes. Access control is enforced by the app (password checks before login, role checks before showing UI). This is intentional for simplicity — the platform is for a trusted community, not public internet.
