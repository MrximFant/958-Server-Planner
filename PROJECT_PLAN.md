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
1. Server admin submits request (serverselect page)
      ↓ includes Discord handle + Discord User ID
2. Super admin approves at /superadmin → sets activation code
      ↓
3. Discord bot DMs the activation code to the requester automatically
      ↓
4. Server admin clicks ACTIVATE A SERVER → enters code + creates admin account
      ↓
5. Server admin logs in → opens Admin Panel → creates alliances
      ↓  each alliance gets: owner invite link (one-time) + member invite link (reusable)
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
- Particle background with server name hero
- Single unified LOGIN button (username + password for all roles)
- Role-appropriate quick-start help banner after login
- Feature cards: Alliance HQ, Rules, Leaderboard (soon), Seasons (soon)

#### Admin Panel (`/server/:id/admin`)
- **ALLIANCES tab** — create/edit/delete alliances, copy owner + member invite links
- **MEMBERS tab** — view all members, reassign between alliances, promote to helper
- **HANDSHAKES tab** — create server-to-server data sharing agreements
- **SERVER tab** — edit server name, season number, public map toggle

#### Alliance HQ (`/server/:id/alliance`)
Four top-level tabs:
- **🏠 HOME** — train rotation summary for current week
- **📋 ROSTER** — full member list with power, troops, event roles
- **👤 MY PROFILE** — edit own stats, powers (in millions), troop types, event prefs
- **⚙️ MANAGE** — sub-tabs: ROSTER (edit/delete), ADMINS (promote officers), PARTNERS (partner rosters), SETTINGS (invite links, visibility toggles)

Topbar buttons: 🗺 MAP WIP (all members), 🚂 TRAIN (owners + alliance admins)

#### Train Planner (`/server/:id/train`)
Five scheduling modes:
- **Manual** — drag and drop anyone into any slot
- **Fixed Driver** — one person drives every day, VIPs rotate
- **Paired** — driver/VIP pairs, swap roles after full cycle
- **Round Robin** — everyone takes turns in order
- **Priority** — specific people locked to specific days

Features: drag-and-drop, click-to-assign, per-slot lock, save to Supabase

#### War Map (`/server/:id/map`)
- Territory map from territories.json tile data
- LIVE layer — actual ownership per tile (territories table)
- PLAN layer — per-alliance private planning map (alliance_plans table)
- Partner layer — semi-transparent tiles from allied servers via handshakes
- Partner server badge (e.g. S957) on shared tiles
- Sidebar showing connected partner servers and their sharing flags
- Public map mode (toggle per server — visible to non-logged-in visitors)

#### Server Handshakes
- Server admin creates a handshake invite link
- Target server admin accepts via the link
- Server-level caps: share_map, share_roster, share_player_info
- Per-alliance opt-in via alliance_handshake_settings

#### Rules Page (`/server/:id/rules`)
- Six sections: server structure, territory ownership, war map, handshakes, member accounts, etiquette

#### Super Admin Panel (`/superadmin`)
- View all pending/approved/rejected server requests
- Approve with activation code, reject with note
- Shows Discord User ID for DM targeting

#### Discord Bot (notify-activation)
- Supabase Edge Function triggered by database webhook on server_requests UPDATE
- When status → 'approved': opens DM channel with requester's Discord ID, sends activation code
- Setup documented in DISCORD_SETUP.md

---

### 🔲 Planned / In Progress

#### Password Reset via Discord Bot
- Member sends `/resetpassword` slash command to bot
- Bot looks up Discord ID in members table
- DMs a one-time temporary password
- Member logs in and changes it
- Needs: second Edge Function + slash command registration

#### Canyon Storm Planner
- Visual team slot builder for Canyon Storm event
- Teams: A and B (or more depending on server size)
- Slots: specific roles (tank, support, attacker etc.)
- Members sign up or owner assigns
- Shows power, troop type, profession per slot
- Wishlist / signup mode vs. admin-assigned mode

#### Desert Storm Planner
- Similar visual planner to Canyon Storm
- Different team structure and role requirements
- Sub slots for specific day/time assignments

#### Leaderboard
- Per-season alliance rankings
- Influence totals, territory counts, crystal gold rates
- Historical comparison across seasons

#### Season History
- Past season outcomes stored and viewable
- Alliance performance trends over time

#### Phase 5 — Multi-Server Season Maps
- Schema already built (season_maps, season_map_servers tables)
- UI not yet built
- Warzones A–H + contested center
- Multiple servers join a season map, each assigned a warzone
- Combined map view showing all servers' territories

#### Roster Visibility Toggles (SQL migration needed)
- `roster_public` — show/hide roster to non-alliance members
- `roster_show_power` — show/hide power numbers
- Code is built, columns need adding to Supabase:
  ```sql
  ALTER TABLE alliances ADD COLUMN IF NOT EXISTS roster_public BOOLEAN DEFAULT TRUE;
  ALTER TABLE alliances ADD COLUMN IF NOT EXISTS roster_show_power BOOLEAN DEFAULT TRUE;
  ```

---

## Pending SQL Migrations

Run these in **Supabase → SQL Editor** if not already applied:

```sql
-- Owner invite link for alliances (unified login system)
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS owner_invite_code TEXT UNIQUE;

-- Discord User ID for auto-DM on approval
ALTER TABLE server_requests ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- Roster visibility controls
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS roster_public BOOLEAN DEFAULT TRUE;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS roster_show_power BOOLEAN DEFAULT TRUE;
```

---

## Database Tables

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

---

## File Structure (key files)

```
src/
  pages/
    ServerSelect.jsx       — landing page, request + activate
    ServerDashboard.jsx    — server home, unified login
    AdminPanel.jsx         — server admin tools
    AllianceHQ.jsx         — main member area (roster, profile, manage, train summary)
    TrainPlanner.jsx       — train assignment planner
    Map.jsx                — war map with live + plan + partner layers
    Register.jsx           — member + owner registration via invite link
    JoinServer.jsx         — invite link resolver
    Rules.jsx              — game guide
    SuperAdmin.jsx         — platform-level request management
  contexts/
    AuthContext.jsx        — session management via localStorage
  lib/
    auth.js                — hashPassword, generateInviteCode
  supabaseClient.js        — Supabase client init

supabase/
  functions/
    notify-activation/
      index.ts             — Discord DM edge function

supabase_schema.sql        — full schema (clean-slate recreate script)
DISCORD_SETUP.md           — Discord bot setup guide
PROJECT_PLAN.md            — this file
```

---

## Ideas Backlog

- **Member absence / availability flags** — mark yourself unavailable for an event week
- **Event history log** — record which members participated in each war event
- **In-game alliance tag colour sync** — preview the map with the actual in-game colours
- **Mobile-optimised roster view** — current layout works but could be tighter on phone
- **Notification preferences** — members opt in to Discord DMs for event reminders
- **Alliance merge tool** — admin can bulk-move members from one alliance to another
- **CSV export** — export roster to spreadsheet for offline use
- **Season map builder** — drag servers into warzone slots on a visual grid
