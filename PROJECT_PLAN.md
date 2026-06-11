# Last War Server Planner — Project Plan

> Living document. Updated as features are built or planned.
> Last updated: 2026-06-11

---

## What It Is

A web-based alliance management tool for the mobile game **Last War: Survival**.
Each game server gets its own private workspace where alliances can manage rosters,
coordinate war events, plan train rotations, and share map data with allied servers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Routing | React Router DOM 7 |
| Database | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime subscriptions |
| Auth | Custom — SHA-256 password hashing via Web Crypto API |
| Sessions | localStorage via AuthContext (`lw_planner_session`) |
| Edge Functions | Supabase Edge Functions (Deno runtime) |
| Hosting | Vercel |
| Notifications | Discord Bot API (DM via bot token) |

---

## User Roles & Permissions

| Role | How They Get In | What They Can Do |
|---|---|---|
| **Super Admin** | Hardcoded `/superadmin` route | Approve/reject server requests, set activation codes |
| **Server Admin** | Created at activation, `server_role = 'admin'` | Full admin panel — create alliances, manage members, server settings |
| **Server Helper** | Promoted by admin, `server_role = 'helper'` | Reassign members between alliances, view all rosters |
| **Alliance Owner (R5)** | One-time owner invite link, `alliance_role = 'owner'` | Manage their alliance, share invite links, promote officers |
| **Alliance Admin** | Promoted by owner, `alliance_role = 'alliance_admin'` | Edit and remove members in their alliance (up to 10 per alliance) |
| **Member** | Reusable member invite link, no role flag | View roster, update own profile, see train rotation |

All roles log in with **username + password** on the server dashboard.
Emergency admin access (legacy server admin password) is hidden behind a collapsible section.

---

## How Onboarding Works

```
1. Server admin submits request (ServerSelect page)
      ↓ includes Discord handle + Discord User ID
2. Super admin approves at /superadmin → sets activation code
      ↓
3. Discord bot DMs the activation code to the requester automatically
      ↓
4. Server admin clicks ACTIVATE A SERVER → enters code + creates admin account
      ↓
5. Server admin logs in → sees ⚡ ADMIN PANEL button prominently in hero
      ↓ opens Admin Panel → creates alliances
      ↓ each alliance gets: owner invite link (one-time) + member invite link (reusable)
6. Admin sends owner invite link to each R5 leader
      ↓ R5 clicks link → creates account → alliance_role = 'owner' auto-set
7. R5 shares member invite link with their players
      ↓ players click → register username + password → join automatically
```

---

## Feature Status

### ✅ Built & Working

#### Server Select Page (`/`)
- List of all server workspaces
- **How It Works** tab (default landing view, highlighted in gold)
- Request a Server form (collects Discord handle + User ID)
- Activate a Server form (activation code + admin account creation)

#### Server Dashboard (`/server/:id`)
- Particle background — 180 smooth drifting dots, gentle alpha pulse (no flares)
- Single unified LOGIN button (username + password for all roles)
- After login: role-appropriate quick-start help banner
- **Role-based quick-action buttons in hero**: ALLIANCE HQ for all, ⚡ ADMIN PANEL for admins, 🔧 HELPER PANEL for helpers
- Admin panel button also in topbar (always visible after login)
- Feature cards: Alliance HQ, Rules, Leaderboard (soon), Seasons (soon)

#### Admin Panel (`/server/:id/admin`)
- **ALLIANCES tab** — create/edit/delete alliances, copy owner + member invite links
- **MEMBERS tab** — view all members, reassign between alliances, promote to helper
- **HANDSHAKES tab** — create server-to-server data sharing agreements
- **SERVER tab** — edit server name, season number, public map toggle

#### Alliance HQ (`/server/:id/alliance`)
Four top-level tabs:
- **🏠 HOME** — World Clock (Server Time UTC-2 + Local Time) → Train rotation → Roster
- **⚔️ EVENTS** — Canyon Storm & Desert Storm team wishlists (with troop filter)
- **👤 MY PROFILE** — edit own stats, powers (in millions), troop types, event prefs
- **⚙️ MANAGE** — sub-tabs: ROSTER (edit/delete/password reset), ADMINS (promote officers), PARTNERS (partner rosters), SETTINGS (invite links, visibility toggles)

Roster table columns: Player | T1 Power | T2 Power | T3 Power | Canyon | Desert | Profession | Resist | Garrison | Quickstride | Notes
- Power badges: coloured text only (no borders), mini bar chart vs alliance max
- Row hue tint by primary troop: Tank = red, Missile = blue, Air = green
- Troop legend above table
- Filters: search, troop type, canyon team, desert team + CLEAR button
- Topbar buttons: 🗺 MAP WIP, 🚂 TRAIN (owners + admins)

#### World Clock (in Alliance HQ HOME)
- **Server Time** — fixed UTC-2, no DST, matches in-game server clock
- **Local Time** — browser's local timezone
- Updates every second

#### Train Planner (`/server/:id/train`)
Five scheduling modes: Manual, Fixed Driver, Paired, Round Robin, Priority
Features: drag-and-drop, click-to-assign, per-slot lock, save to Supabase

#### War Map (`/server/:id/map`)
- Territory map from territories.json tile data
- LIVE layer, PLAN layer, Partner layer
- Partner server badges on shared tiles
- Public map mode toggle

#### Server Handshakes
- Server-level caps: share_map, share_roster, share_player_info
- Per-alliance opt-in via alliance_handshake_settings

#### Rules Page (`/server/:id/rules`)
- Six sections: roles & permissions, server structure, territory, war map, member accounts, etiquette

#### Super Admin Panel (`/superadmin`)
- View all pending/approved/rejected server requests
- Approve with activation code, reject with note
- Shows Discord User ID for DM targeting

#### Discord Bot (notify-activation)
- Supabase Edge Function triggered by DB webhook on server_requests UPDATE
- When status → 'approved': DMs activation code to requester's Discord account

---

### 🔲 Planned / In Progress

#### Password Reset via Discord Bot
- Member sends command to bot → bot DMs a one-time temp password
- Needs: second Edge Function + slash command registration

#### Canyon Storm & Desert Storm Visual Planners
- Visual team slot builder (beyond the current wishlist view)
- Admin-assigned mode with drag-and-drop slot filling
- Power/troop/profession breakdown per team

#### Leaderboard
- Per-season alliance rankings, influence totals, territory counts

#### Season History
- Past season outcomes, alliance performance trends

#### Phase 5 — Multi-Server Season Maps
- Schema already built (season_maps, season_map_servers tables)
- UI not yet built
- Warzones A–H, multiple servers per season map

---

## Database — Current State (2026-06-11)

All migrations applied. Schema is clean. Verified:
- ✅ No orphaned members
- ✅ All alliances have an owner
- ✅ Server admin account exists (Mrxim — server_role='admin', alliance_role='owner')
- ✅ Old `players` table is empty (safe to drop)
- ✅ No duplicate usernames

### Tables

| Table | Purpose |
|---|---|
| `servers` | Server workspaces |
| `alliances` | Alliances within a server |
| `members` | Players — login credentials + in-game stats |
| `territories` | Live tile ownership (war map) |
| `alliance_plans` | Private planning map per alliance |
| `server_handshakes` | Server-to-server sharing agreements |
| `alliance_handshake_settings` | Per-alliance opt-in for each handshake |
| `season_maps` | Multi-server warzone maps (Phase 5) |
| `season_map_servers` | Which server is in which warzone |
| `server_requests` | Server creation requests (approval flow) |
| `train_schedules` | One active train schedule per alliance |
| `train_slots` | Individual day/role assignments in a schedule |

### Optional cleanup
```sql
-- Drop legacy empty table (safe — 0 rows confirmed)
DROP TABLE public.players;
```

---

## File Structure (key files)

```
src/
  pages/
    ServerSelect.jsx       — landing page, request + activate
    ServerDashboard.jsx    — server home, unified login, role-based quick actions
    AdminPanel.jsx         — server admin tools
    AllianceHQ.jsx         — main member area (home, events, profile, manage)
    TrainPlanner.jsx       — train assignment planner
    Map.jsx                — war map
    Register.jsx           — member + owner registration via invite link
    JoinServer.jsx         — invite link resolver
    Rules.jsx              — game guide
    SuperAdmin.jsx         — platform-level request management
  components/
    ParticleBackground.jsx — shared animated star field (180 dots, no flares)
  contexts/
    AuthContext.jsx        — session management via localStorage
  lib/
    auth.js                — hashPassword, generateInviteCode
  supabaseClient.js        — Supabase client init

supabase/
  functions/
    notify-activation/
      index.ts             — Discord DM edge function

supabase_schema.sql        — full schema reference
DISCORD_SETUP.md           — Discord bot setup guide
PROJECT_PLAN.md            — this file
```

---

## Ideas Backlog

- **Member absence / availability flags** — mark yourself unavailable for an event week
- **Event history log** — record which members participated in each war event
- **In-game alliance tag colour sync** — preview the map with actual in-game colours
- **Mobile-optimised roster view** — current layout works but could be tighter on phone
- **Notification preferences** — members opt in to Discord DMs for event reminders
- **Alliance merge tool** — admin can bulk-move members from one alliance to another
- **CSV export** — export roster to spreadsheet for offline use
- **Season map builder** — drag servers into warzone slots on a visual grid
- **Collapsible left sidebar navigation** — for Alliance HQ on desktop
