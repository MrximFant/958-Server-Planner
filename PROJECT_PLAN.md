# Last War Server Planner — Project Plan

> Living document. Updated as features are built or planned.
> Last updated: 2026-06-12

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
Emergency admin password login has been removed from both the UI and login flow.

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
5. Server admin logs in → opens Admin Panel → creates alliances
      ↓ each alliance gets: owner invite link (one-time) + member invite link (reusable)
6. Admin sends owner invite link to each R5 leader
      ↓ R5 clicks link → creates account → alliance_role = 'owner' auto-set
7. R5 shares member invite link with their players
      ↓ players click → register username + password → join automatically
```

---

## Feature Status

### ✅ Built & Working

#### Landing Page (`/`)
- Two-column layout: left = always-visible How to Get Started guide (Members / R5 / Admins), right = 3 action buttons
- Buttons: **Enter Server** → **Request Server** → **Activate Server** (deep-link to correct tab in ServerSelect)
- 400-particle animated background (4× original count), used on all pages except AllianceHQ

#### Server Select Page (`/servers`)
- Tabs: Enter Server (default) / Request Server / Activate Server / How It Works
- **Live search bar** on Enter Server tab — filter by server number or name
- Reads `?tab=` from URL — Landing buttons deep-link directly
- Request + Activate forms with Discord User ID field and instructions

#### Server Dashboard (`/server/:id`)
- **Compact hero** — server name + badge only (no action buttons in hero)
- **Left column**: Login / Alliance HQ / Server Admin / Log Out action buttons + alliance list + role help accordion
- **Right column**: Collapsible Rules & Guide accordion (6 sections from Rules page, first open by default) + "OPEN FULL PAGE →" link
- Mobile/tablet: columns stack vertically, bouncing ↓ hint appears below alliances
- Single unified LOGIN button (username + password for all roles)
- Floating TOOLS button (bottom-right) — slides in a right panel with quick links
- Public alliance roster list — member counts + VIEW ROSTER button for public alliances

#### Admin Panel (`/server/:id/admin`)
- Labelled **SERVER ADMIN** throughout
- ALLIANCES tab — create/edit/delete alliances, copy owner + member invite links
- MEMBERS tab — view all members, reassign between alliances, promote to helper
- HANDSHAKES tab — server-to-server data sharing agreements
- SERVER tab — edit name, season, public map toggle

#### Alliance HQ (`/server/:id/alliance`)
- Four tabs: HOME / EVENTS / MY PROFILE / MANAGE
- **HOME** — World Clock (Server Time UTC-2 + Local), Train rotation link, Roster
- **EVENTS** — Canyon Storm & Desert Storm team wishlist (see Events section below)
- **MY PROFILE** — edit own stats, powers, troop types, event prefs; welcome banner on first login
- **MANAGE** — ROSTER (edit/delete/reset password), ADMINS, PARTNERS, SETTINGS (invite links)
- After registration: redirect to MY PROFILE with welcome banner

#### Events Tab (in Alliance HQ)
- Tab between **Canyon Storm** (🏔) and **Desert Storm** (🏜)
- **Prominent WISHLIST — NOT A SIGNUP banner** (gold) on every view
- **ADMIN MANAGER button** (owners/admins only) — expand panel to configure time slots per team
- **Canyon Storm** — 3 time slots (Thursday, server time UTC-2, no DST), **1 hour each**:
  - 09:00–10:00 · 18:00–19:00 · 23:00–00:00
- **Desert Storm** — 3 time slots (Friday, server time UTC-2, no DST), **30 minutes each**:
  - 09:00–09:30 · 18:00–18:30 · 23:00–23:30
- Admin assigns each team (Team A / Team B) to a time slot independently — both can share a slot
- **Time display**: every slot shows server time + user's local time (DST-aware — uses next real upcoming Thu/Fri date so the browser applies the correct offset, not a fixed year-2000 date)
- Config saved to `alliances.event_config` (JSONB) in Supabase — shared across all members
- ⚠️ **Requires DB migration**: `ALTER TABLE alliances ADD COLUMN IF NOT EXISTS event_config JSONB;`
- Team boxes: Team A (green), Team B (orange), Substitutes, Flexible — show assigned members with power + troop type
- Troop type filter

#### Train Planner (`/server/:id/train`)
- Five modes: Manual, Fixed Driver, Paired Rotation, Round Robin, Priority Days
- Multi-week navigation with left sidebar week list
- Action buttons in sidebar: MANAGE (green border), EXPORT, CLEAR, SAVE
- MANAGE TRAIN modal: Generate Weeks, Manage Weeks, Placeholder Members tabs
- Foldable members panel, mode tab bar pinned at bottom of left panel
- Placeholder members stored in localStorage (`tp_ph_<allianceId>`)
- Priority Days: text description per day, shown as banner in other modes
- Paired rotation: filter out already-paired members, + REVERSE CYCLE button
- All data saved to `train_schedules` + `train_slots` in Supabase
- Mobile: left panel + members panel become fixed drawers

#### War Map (`/server/:id/map`)
- Territory map from territories.json
- LIVE layer, PLAN layer, Partner layer
- Partner server badges on shared tiles

#### Rules Page (`/server/:id/rules`)
- Six sections: Roles & Permissions, Server Structure, War Map, Server Handshakes, Member Accounts, Etiquette & Fair Play
- Content is also embedded as collapsible sections in the Server Dashboard right column

#### Registration (`/join/:inviteCode`)
- Register via alliance invite link
- Owner invite sets `alliance_role = 'owner'`
- After registration → redirect to `/server/:id/alliance?tab=profile&welcome=1`

#### Super Admin Panel (`/superadmin`)
- Approve/reject server requests with activation codes
- Discord User ID shown for DM targeting

#### Discord Bot (notify-activation)
- Supabase Edge Function — DMs activation code to requester on approval

---

### 🔲 Planned — Battle Planners (Next Major Feature)

#### Context from mockup images (2026-06-12)

The alliance runs weekly **Desert Storm** and **Canyon Storm** events.
Each event has two taskforces (e.g. **Taskforce A** and **Taskforce B**),
each with **4 teams**. Teams follow a two-phase building capture strategy:

| Team | First 10 mins (Phase 1) | After (Phase 2) |
|---|---|---|
| Team 1 | Hospital 1 & 3 | Mercenary Factory |
| Team 2 | Hospital 2 & 4 | Arsenal |
| Team 3 | Oil Refinery 1 | Nuclear Silo |
| Team 4 | Oil Refinery 2 | Nuclear Silo |

Each team has **player roles** with icons:
| Role | Icon | Function |
|---|---|---|
| Team Coordinator | 👑 Crown | Directs team movement |
| Lethal Killer | 🔥 Fire/Warning | Combat focus, moves to secondary buildings |
| Science Hub | ✅ Green check | Reduces teleport cooldown by 50% (2 min → 1 min) |
| Info Center | ℹ️ Blue info | Increases Battlefield Points output by 10% |

Each taskforce also has a **Substitutes** list and a fixed **Rules** section at the bottom.

#### Requirements for the Battle Planner feature

- **Separate planners for Canyon Storm and Desert Storm** — each event type gets its own planner tab/section
- **Two Taskforces per event** (Team A plan + Team B plan), each with their own 4-team grid
- **Not bound by the Wishlist** — uses the full alliance member database, not just event wishlist preferences
- **Fully flexible / customisable**: building phase names, number of teams, role types, rules text — all editable by the admin, not hardcoded
- **Player assignment**: drag-and-drop members from the full roster into team slots; show power/troop info inline
- **Role assignment**: click a player name to toggle their role (Coordinator / Lethal Killer / Science Hub / Info Center / none)
- **Substitutes section**: pool of players not assigned to a team slot
- **Rules section**: editable text block at the bottom of each plan
- **Save/Load**: persist each week's plan in Supabase; ability to load last week's plan and swap 2–3 players
- **Export / Share**:
  - "Download as image" (html2canvas or similar)
  - "Copy for Discord" — plain text version formatted for paste
- **Mobile/tablet optimised**: consider stacked layout, tap-to-assign instead of drag-drop on touch, collapsible team panels

#### Suggested data model

```sql
-- One plan per event type per alliance per week
CREATE TABLE battle_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,         -- 'canyon' | 'desert'
  week_label   DATE NOT NULL,         -- Monday of the event week
  taskforce    TEXT NOT NULL,         -- 'A' | 'B'
  name         TEXT,                  -- e.g. "Taskforce A 22 CET"
  config       JSONB,                 -- phase names, building assignments, rules text
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- One row per player slot in a plan
CREATE TABLE battle_plan_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES battle_plans(id) ON DELETE CASCADE,
  team_number  INTEGER NOT NULL,      -- 1–4
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  role         TEXT,                  -- 'coordinator' | 'lethal' | 'science' | 'info' | null
  is_sub       BOOLEAN DEFAULT FALSE, -- true = in substitutes pool
  slot_order   INTEGER                -- display order within team
);
```

#### UX Notes

- Desktop: 4-column grid matching the mockup image, phase rows at top, player rows below, substitutes + rules in footer
- Mobile/tablet: consider a "team card" swipe layout or collapsible team accordions rather than 4-column grid
- On touch devices: tap-to-select player + tap-to-assign slot (instead of drag-and-drop)
- Role icons should be small and inline with the player name, not a separate column
- The planner should work standalone (admin builds the plan, members view it read-only)

---

### 🔲 Other Planned Features

#### In-depth Contextual Help & Admin Onboarding (Next Session Priority)

The current help system (collapsible role banners on the server dashboard + static Rules page)
is too passive — admins and owners have to hunt for guidance. The goal is **just-in-time, 
contextual help that appears exactly where the user needs it**, so the platform feels 
self-explanatory without a manual.

**Problems to solve:**
- Server admins setting up for the first time don't know what order to do things in
- Alliance owners don't know they need to copy and share the invite link before members can join
- Members don't know to fill in their profile immediately after registering
- Admins don't know where to find things like "how do I reset a password" or "how do I add an alliance admin"
- No visual cues pointing to the next required action

**What to build:**

1. **Setup Wizard for new Server Admins**
   - Shown on first login only (tracked via a `setup_completed` flag on the server record or localStorage)
   - Step-by-step modal/overlay: Create your first alliance → Copy the Owner Invite link → Send it to your R5 → Done
   - Each step has a direct action button ("CREATE ALLIANCE →") that takes them there
   - Can be dismissed and re-opened from a "SETUP GUIDE" button in the topbar

2. **Setup Checklist for Alliance Owners**
   - Shown in Alliance HQ HOME when `setup_completed` is false for the alliance
   - Checklist items with green ticks when done:
     - ✅ / ⬜ Your profile is filled in (in_game_name + at least one power stat)
     - ✅ / ⬜ At least one member has joined (memberCount > 1)
     - ✅ / ⬜ Event time slots configured (Canyon + Desert)
     - ✅ / ⬜ At least one train schedule created
   - Each incomplete item is a clickable link to where to fix it
   - Dismiss once all items are green

3. **Inline contextual `?` tooltips throughout the UI**
   - Small `?` icon next to any label that isn't self-explanatory
   - On hover/tap: short 1–2 sentence tooltip explaining what it is and why it matters
   - Priority locations:
     - Alliance HQ → Manage → Settings: next to "Owner Invite Link" and "Member Invite Link"
     - Admin Panel → Alliances: next to the invite link copy buttons
     - Train Planner: next to each mode name (Fixed Driver, Paired Rotation, etc.)
     - Events: next to "Team A / Team B" slot dropdowns in admin manager
     - Profile: next to each power field and the Canyon/Desert team preference selects
   - Tooltips should be a single reusable `<Tooltip text="...">` component that wraps any element

4. **Empty-state guidance**
   - Every empty list/section should have a helpful empty state — not just "No entries"
   - Examples:
     - No alliances yet → "No alliances set up. Go to SERVER ADMIN → ALLIANCES to create your first one."
     - No train schedule → "No schedule for this week. Click MANAGE to generate weeks."
     - No members → "No members yet. Share your Member Invite link from MANAGE → SETTINGS."
     - Events tab with no members → "No members have set event preferences yet. Share your invite link."

5. **Admin Quick Reference card** (visible in Admin Panel + Alliance HQ Manage tab)
   - Collapsible card titled "QUICK REFERENCE — WHAT TO DO WHEN…"
   - Covers the most common admin tasks with direct navigation links:
     - "New player wants to join" → share Member Invite from Settings
     - "Player forgot their password" → Manage → Roster → edit member → change password
     - "Promote a player to officer" → Manage → Admins → add name
     - "Player switched alliance" → Admin Panel → Members → reassign
     - "New season starting" → Admin Panel → Server → update season number
     - "Set up Canyon/Desert times" → Alliance HQ → Events → ⚙ Admin Manager

6. **Improved Role Help on Server Dashboard**
   - Current role help is text-only and collapsed by default
   - Change to always-visible for first-time visitors (before login)
   - After login: show role-specific version prominently with actionable next step highlighted
   - Add visual step indicators (1 → 2 → 3) instead of a plain list

**Implementation notes:**
- Keep it unobtrusive — guides should be dismissible and not re-appear once dismissed (use localStorage flags per user/alliance)
- Tooltip component: small floating box, dark background, max 200px wide, appears on hover and on tap (300ms delay on hover to avoid accidental trigger)
- Wizard/checklist components should be standalone and importable anywhere
- No new DB tables needed for most of this — localStorage flags are sufficient for "has seen" tracking


#### Password Reset via Discord Bot
- Member sends command to bot → bot DMs a one-time temp password
- Needs: second Edge Function + slash command registration

#### Leaderboard / Season Rankings
- Per-season alliance rankings, influence totals, territory counts

#### Season History
- Past season outcomes, alliance performance trends

#### Phase 5 — Multi-Server Season Maps
- Schema already built (season_maps, season_map_servers tables)
- UI not yet built

---

## Database — Current State (2026-06-12)

All migrations applied. Schema is clean.

### Pending migration (must run in Supabase SQL editor)
```sql
-- Required for Events tab time slot config
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS event_config JSONB;
```

### Tables

| Table | Purpose |
|---|---|
| `servers` | Server workspaces |
| `alliances` | Alliances within a server (now includes `event_config` JSONB) |
| `members` | Players — login credentials + in-game stats |
| `territories` | Live tile ownership (war map) |
| `alliance_plans` | Private planning map per alliance |
| `server_handshakes` | Server-to-server sharing agreements |
| `alliance_handshake_settings` | Per-alliance opt-in for each handshake |
| `season_maps` | Multi-server warzone maps (Phase 5) |
| `season_map_servers` | Which server is in which warzone |
| `server_requests` | Server creation requests (approval flow) |
| `train_schedules` | Weekly train schedules per alliance |
| `train_slots` | Individual day/role assignments in a schedule |

---

## File Structure (key files)

```
src/
  pages/
    Landing.jsx             — two-column landing: help text left, 3 action buttons right
    ServerSelect.jsx        — enter/request/activate server with search
    ServerDashboard.jsx     — server home: alliances+actions left, collapsible rules right
    AdminPanel.jsx          — server admin tools (SERVER ADMIN label)
    AllianceHQ.jsx          — main member area (home, events, profile, manage)
    TrainPlanner.jsx        — multi-week train planner
    Map.jsx                 — war map
    Register.jsx            — member + owner registration via invite link
    JoinServer.jsx          — invite link resolver
    Rules.jsx               — full game guide (6 sections)
    SuperAdmin.jsx          — platform-level request management
    PublicRoster.jsx        — public alliance roster (no login)
  components/
    ParticleBackground.jsx  — shared animated field (400 dots, DST-pulse, on all pages except AllianceHQ)
  contexts/
    AuthContext.jsx         — session management via localStorage
  lib/
    auth.js                 — hashPassword, generateInviteCode
  supabaseClient.js         — Supabase client init

migrations/
  add_event_config_to_alliances.sql   — event_config JSONB column

supabase/
  functions/
    notify-activation/
      index.ts              — Discord DM edge function

supabase_schema.sql         — full schema reference
DISCORD_SETUP.md            — Discord bot setup guide
PROJECT_PLAN.md             — this file
```

---

## Ideas Backlog

- **Member absence / availability flags** — mark yourself unavailable for an event week
- **Event history log** — record which members participated in each war event
- **In-game alliance tag colour sync** — preview the map with actual in-game colours
- **Notification preferences** — members opt in to Discord DMs for event reminders
- **Alliance merge tool** — admin can bulk-move members from one alliance to another
- **CSV export** — export roster to spreadsheet for offline use
- **Season map builder** — drag servers into warzone slots on a visual grid
- **Import from screenshot (OCR)** — upload in-game roster screenshot to auto-populate names
- **Realtime collaboration on train planner** — Supabase Realtime so two admins see each other's changes live
