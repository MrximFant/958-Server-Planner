# Last War Server Planner — CLAUDE.md

## Stack
- React 19 + Vite 8, React Router DOM 7
- Supabase (PostgreSQL + open RLS policies + realtime)
- lucide-react icons, no CSS framework (all inline styles)
- SHA-256 hashed passwords via Web Crypto API
- localStorage sessions via `AuthContext`

## Dev commands
```
npm run dev      # start dev server
npm run build    # production build (no errors = good)
npm run lint     # eslint
```

## Auth & roles
- `canManage = role === 'admin' || allianceRole === 'owner' || allianceRole === 'alliance_admin'`
- Each member has their own SHA-256 hashed password — **no shared/hardcoded passwords ever**
- Session stored in localStorage, read via `useAuth()` hook

## Key pages
| File | Route | Purpose |
|------|-------|---------|
| `src/pages/BattlePlanner.jsx` | `/server/:id/battle-planner` | Desert/Canyon Storm planning |
| `src/pages/TrainPlanner.jsx` | `/server/:id/train-planner` | Training planner (reference for sidebar pattern) |
| `src/pages/AllianceHQ.jsx` | `/server/:id/alliance` | Alliance hub |
| `src/pages/AdminPanel.jsx` | `/server/:id/admin` | Admin panel |

## Database tables (Supabase)
All tables have RLS enabled with open policies. Run migrations manually in Supabase SQL Editor.

### Battle Planner tables (`migrations/add_battle_plans.sql`)
- **`battle_plans`** — one plan per (alliance_id, event_type, taskforce, week_label)
  - `event_type`: `'canyon' | 'desert'`
  - `taskforce`: `'A' | 'B'`
  - `week_label`: DATE (Monday of that week)
- **`battle_plan_buildings`** — buildings within a plan
  - `category`: oil_refinery|info_center|science_hub|field_hospital|arsenal|mercenary_factory|nuclear_silo|substitutes|custom
  - `phase`: `'phase1' | 'phase2' | null`
  - `links_to_id`: self-FK — phase1 building → phase2 building it moves to after minute 10
  - `combine_group`: nullable TEXT — buildings sharing same value form one combined card
  - `sort_order`: integer
- **`battle_plan_assignments`** — many-to-many: member ↔ building
  - `role`: `'coordinator' | 'lethal' | null` (👑 coordinator, 🔥 moves to next building)
  - UNIQUE(building_id, member_id)
- **`battle_plan_noshows`** — per-member no-show tracking per week
  - UNIQUE(alliance_id, event_type, taskforce, week_label, member_id)

## BattlePlanner.jsx — key concepts

### Map overlay
- Fixed `MAP_MARKERS` array (11 buildings as x%/y% of image)
- Map image: `public/desert-storm-map.png` (user-provided, not in repo)
- `matchBuildingToMarker()`: matches building category → marker, disambiguates Field Hospital I-IV by trailing ordinal
- Map label boxes: white background (`rgba(255,255,255,0.95)`), black text (`#111827`), border `#cbd5e1`

### Combine groups
- `combine_group` (nullable string on buildings): shared value = same team card
- Combined buildings share roster (mirrored via `groupmateBuildings()`), share map marker color, glow on map
- Cross-section combining (Phase 1 + Phase 2) is supported
- In List View: combined group rendered once under the section containing the lowest-sort_order member

### Phase 1 → Phase 2 fire mechanic
- `links_to_id` self-FK: phase1 building links to phase2 building
- `getIncomingFireMembers(phase2Id, buildings)`: returns members with `role='lethal'` from linking phase1 buildings
- Display-only — no duplicate DB rows created

### Two-pass save
Buildings saved without `links_to_id` first, then a second pass updates links via `idMap` (local id → real DB UUID). This is required because links reference sibling buildings that don't have DB ids yet.

### Player exclusivity
- `siblingTaskforceAssigned`: players assigned in TF-A are hidden from TF-B picker (same week/event)
- `thisTaskforceAssigned`: players assigned to any building hidden from other buildings' pickers
- Both enforced in MemberPicker `members` filter prop, with combine_group awareness (groupmates share a roster)

### Week history sidebar
- Left panel (200px), collapsible via ☰ toggle in topbar (desert mode only)
- Mobile: slides in as drawer with backdrop overlay
- Lists all saved weeks for current event+taskforce; click to load, × to delete

### Exports
- **COPY FOR DISCORD**: plain-text per-building list (existing `handleExport`)
- **EXPORT TABLE**: monospace Discord table with columns SECTION|BUILDING|PLAYERS|MOVES TO (`handleExportTable`)
- **DOWNLOAD MAP**: canvas screenshot of map with colored markers

### No-show tracking
- `battle_plan_noshows` DB table
- MARK NO-SHOWS button → `NoshowModal` (checkbox list)
- ❗{count} badge shown on members in picker

### State
- `buildings`: current plan's buildings with inline `assignments: [{member_id, role}]`
- `allPlans`: all plans for this alliance
- `allBuildings`: `{ plan_id → buildings[] }` — full cache for all plans
- `currentWeekKey`: DATE string (Monday)
- `sidebarOpen`: controls week history sidebar visibility

### Default buildings (seeded for new Desert Storm week)
Oil Refinery 1+2, Info Center, Science Hub, Field Hospital 1-4 (all phase1), Arsenal, Mercenary Factory, Nuclear Silo (phase2), Substitutes (no phase)

## Git workflow
- Working branch: `main` (direct commits)
- No agents for file edits — all done directly with Edit/Write tools
- Always `npm run build` before committing to verify no errors
