-- ============================================================
-- Last War Server Planner — Full Schema
-- Run this in Supabase SQL Editor (Database → SQL Editor)
-- Last updated: 2026-06-08
-- ============================================================

-- ── Clean slate ──────────────────────────────────────────────
DROP TABLE IF EXISTS battle_plan_slots           CASCADE;
DROP TABLE IF EXISTS battle_plans                CASCADE;
DROP TABLE IF EXISTS train_slots                 CASCADE;
DROP TABLE IF EXISTS train_schedules             CASCADE;
DROP TABLE IF EXISTS alliance_handshake_settings CASCADE;
DROP TABLE IF EXISTS alliance_plans              CASCADE;
DROP TABLE IF EXISTS season_map_servers          CASCADE;
DROP TABLE IF EXISTS season_maps                 CASCADE;
DROP TABLE IF EXISTS server_handshakes           CASCADE;
DROP TABLE IF EXISTS territories                 CASCADE;
DROP TABLE IF EXISTS server_requests             CASCADE;
DROP TABLE IF EXISTS members                     CASCADE;
DROP TABLE IF EXISTS alliances                   CASCADE;
DROP TABLE IF EXISTS servers                     CASCADE;

-- ── servers ───────────────────────────────────────────────────
CREATE TABLE servers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_number    TEXT NOT NULL,                -- e.g. "958"
  name             TEXT NOT NULL,                -- e.g. "958 Mastermind"
  admin_password   TEXT NOT NULL,                -- SHA-256 hex
  invite_code      TEXT UNIQUE NOT NULL,         -- random token for invite link
  current_season   INTEGER NOT NULL DEFAULT 0,   -- 0=pre-season, 1-6
  public_map       BOOLEAN NOT NULL DEFAULT FALSE, -- true = map visible to non-logged-in visitors
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── alliances ─────────────────────────────────────────────────
CREATE TABLE alliances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  tag              TEXT,                          -- short tag e.g. "[958]"
  color            TEXT NOT NULL DEFAULT '#00c8ff',
  owner_password   TEXT NOT NULL,                -- SHA-256 hex (legacy emergency access)
  invite_code      TEXT UNIQUE NOT NULL,          -- reusable member self-registration link
  owner_invite_code TEXT UNIQUE,                  -- one-time owner registration link
  event_config     JSONB,                         -- { canyon: { teamA, teamB }, desert: { teamA, teamB } }
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── members ───────────────────────────────────────────────────
CREATE TABLE members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  alliance_id      UUID REFERENCES alliances(id) ON DELETE SET NULL,
  username         TEXT NOT NULL,
  password         TEXT NOT NULL,                -- SHA-256 hex
  -- server-level role: NULL = regular member, 'helper' = co-admin helper
  server_role      TEXT,
  -- alliance-level role: NULL = regular member, 'alliance_admin' = alliance admin (up to 10)
  alliance_role    TEXT,
  -- in-game profile
  in_game_name     TEXT,
  power1           NUMERIC,
  power2           NUMERIC,
  power3           NUMERIC,
  has_squad4       BOOLEAN DEFAULT FALSE,
  troop1           TEXT,
  troop2           TEXT,
  troop3           TEXT,
  canyon_team      TEXT,                          -- 'A', 'B', 'any'
  canyon_sub       BOOLEAN DEFAULT FALSE,
  desert_team      TEXT,
  desert_sub       BOOLEAN DEFAULT FALSE,
  profession       TEXT,                          -- 'Engineer', 'Warlord', etc.
  garrison         TEXT,
  quickstride      TEXT,
  resistance       INTEGER DEFAULT 0,
  coffee_buff      TEXT DEFAULT 'none',
  notes            TEXT,
  last_updated     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, username)
);

-- ── territories ───────────────────────────────────────────────
-- Stores actual live ownership per tile (tile id = string from territories.json)
-- season_map_id kept as nullable FK for future Phase 5 multi-server season maps
CREATE TABLE territories (
  id               TEXT PRIMARY KEY,             -- tile id e.g. "A61"
  season_map_id    UUID,                         -- nullable; used in Phase 5 season maps
  owner_id         UUID REFERENCES alliances(id) ON DELETE SET NULL,
  last_capture_at  TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT
);

-- ── alliance_plans ────────────────────────────────────────────
-- Private per-alliance planning layer (attack/defence intent)
-- Separate from live territory ownership; never shared externally by default
CREATE TABLE alliance_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id      UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  tile_id          TEXT NOT NULL,                -- references territories.json tile id
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, tile_id)
);

-- ── season_maps ───────────────────────────────────────────────
-- Phase 5: multi-server warzone maps (A–H warzones + contested center)
CREATE TABLE season_maps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,                -- e.g. "Season 5: Wild West"
  created_by       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  max_servers      INT DEFAULT 8,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- FK from territories → season_maps (nullable, used in Phase 5)
ALTER TABLE territories
  ADD CONSTRAINT fk_territories_season_map
  FOREIGN KEY (season_map_id) REFERENCES season_maps(id) ON DELETE SET NULL;

-- ── season_map_servers ────────────────────────────────────────
CREATE TABLE season_map_servers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_map_id    UUID NOT NULL REFERENCES season_maps(id) ON DELETE CASCADE,
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  warzone          TEXT,                          -- 'A'–'H' (center I is contested)
  joined_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_map_id, server_id),
  UNIQUE(season_map_id, warzone)
);

-- ── server_requests ───────────────────────────────────────────
-- Server creation requests reviewed by super admin
CREATE TABLE server_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_number    TEXT NOT NULL,
  name             TEXT NOT NULL,
  contact_name     TEXT NOT NULL,                -- Discord handle of requester
  discord_user_id  TEXT,                         -- Discord snowflake ID for DM notification
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  activation_code  TEXT,                         -- set by super admin on approval
  activation_used  BOOLEAN NOT NULL DEFAULT FALSE,
  rejection_note   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── server_handshakes ─────────────────────────────────────────
-- Server-level agreements to share data between two servers
-- Each handshake sets the maximum allowed sharing scope.
-- Individual alliances further control their own sharing via
-- alliance_handshake_settings (opt-in per handshake).
CREATE TABLE server_handshakes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  target_server_id      UUID REFERENCES servers(id) ON DELETE CASCADE,
  invite_code           TEXT UNIQUE NOT NULL,     -- used by target to accept
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked
  -- server-level sharing caps (what CAN be shared; alliances still opt in separately)
  share_map             BOOLEAN DEFAULT TRUE,     -- allow map sharing
  share_roster          BOOLEAN DEFAULT FALSE,    -- allow roster name sharing
  share_player_info     BOOLEAN DEFAULT FALSE,    -- allow detailed player stats sharing
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  accepted_at           TIMESTAMPTZ
);

-- ── alliance_handshake_settings ───────────────────────────────
-- Per-alliance opt-in for each server handshake.
-- An alliance can only share what the server handshake already permits.
-- e.g. if server handshake has share_map=TRUE, an alliance can still set
-- share_plan=FALSE to keep their planning map private even from that partner.
CREATE TABLE alliance_handshake_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handshake_id      UUID NOT NULL REFERENCES server_handshakes(id) ON DELETE CASCADE,
  alliance_id       UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  -- what this alliance opts in to share with the partner server
  share_live_map    BOOLEAN DEFAULT TRUE,         -- share live territory ownership
  share_plan_map    BOOLEAN DEFAULT FALSE,        -- share planning map tiles
  share_roster      BOOLEAN DEFAULT FALSE,        -- share member names
  share_player_info BOOLEAN DEFAULT FALSE,        -- share detailed player stats
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(handshake_id, alliance_id)
);

-- ── train_schedules ──────────────────────────────────────────
-- One active schedule per alliance; mode_config stores mode-specific
-- configuration as JSON (fixed driver id, pairs, queue order, etc.)
CREATE TABLE train_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  week_label   TEXT NOT NULL DEFAULT 'Current Week',
  mode         TEXT NOT NULL DEFAULT 'manual',  -- manual|fixed_driver|paired|round_robin|priority
  mode_config  JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id)
);

-- ── train_slots ───────────────────────────────────────────────
CREATE TABLE train_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID NOT NULL REFERENCES train_schedules(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Mon
  role         TEXT NOT NULL CHECK (role IN ('driver', 'vip')),
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  locked       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(schedule_id, day_of_week, role)
);

-- ── battle_plans ──────────────────────────────────────────────
-- One plan per event type per alliance per week per taskforce
CREATE TABLE battle_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('canyon', 'desert')),
  week_label   DATE NOT NULL,
  taskforce    TEXT NOT NULL CHECK (taskforce IN ('A', 'B')),
  name         TEXT,
  config       JSONB DEFAULT '{}',
  rules_text   TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, event_type, taskforce, week_label)
);

-- ── battle_plan_slots ─────────────────────────────────────────
CREATE TABLE battle_plan_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES battle_plans(id) ON DELETE CASCADE,
  team_number  INTEGER NOT NULL,
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  role         TEXT CHECK (role IN ('coordinator', 'lethal', 'science', 'info') OR role IS NULL),
  is_sub       BOOLEAN NOT NULL DEFAULT FALSE,
  slot_order   INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- Realtime subscriptions
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE servers;
ALTER PUBLICATION supabase_realtime ADD TABLE alliances;
ALTER PUBLICATION supabase_realtime ADD TABLE members;
ALTER PUBLICATION supabase_realtime ADD TABLE train_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE train_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_plan_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE territories;
ALTER PUBLICATION supabase_realtime ADD TABLE alliance_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE season_map_servers;
ALTER PUBLICATION supabase_realtime ADD TABLE server_handshakes;
ALTER PUBLICATION supabase_realtime ADD TABLE alliance_handshake_settings;

-- ============================================================
-- Row Level Security
-- All tables use open RLS policies — role enforcement is done
-- in the application layer via password-gated sessions.
-- ============================================================
ALTER TABLE servers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE members                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_maps                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_map_servers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_handshakes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_handshake_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_slots                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_plan_slots           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "servers_select"   ON servers   FOR SELECT USING (true);
CREATE POLICY "servers_insert"   ON servers   FOR INSERT WITH CHECK (true);
CREATE POLICY "servers_update"   ON servers   FOR UPDATE USING (true);

CREATE POLICY "alliances_select" ON alliances FOR SELECT USING (true);
CREATE POLICY "alliances_insert" ON alliances FOR INSERT WITH CHECK (true);
CREATE POLICY "alliances_update" ON alliances FOR UPDATE USING (true);
CREATE POLICY "alliances_delete" ON alliances FOR DELETE USING (true);

CREATE POLICY "members_select"   ON members   FOR SELECT USING (true);
CREATE POLICY "members_insert"   ON members   FOR INSERT WITH CHECK (true);
CREATE POLICY "members_update"   ON members   FOR UPDATE USING (true);
CREATE POLICY "members_delete"   ON members   FOR DELETE USING (true);

CREATE POLICY "territories_select" ON territories FOR SELECT USING (true);
CREATE POLICY "territories_insert" ON territories FOR INSERT WITH CHECK (true);
CREATE POLICY "territories_update" ON territories FOR UPDATE USING (true);
CREATE POLICY "territories_delete" ON territories FOR DELETE USING (true);

CREATE POLICY "plans_select" ON alliance_plans FOR SELECT USING (true);
CREATE POLICY "plans_insert" ON alliance_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "plans_update" ON alliance_plans FOR UPDATE USING (true);
CREATE POLICY "plans_delete" ON alliance_plans FOR DELETE USING (true);

CREATE POLICY "season_maps_select" ON season_maps FOR SELECT USING (true);
CREATE POLICY "season_maps_insert" ON season_maps FOR INSERT WITH CHECK (true);
CREATE POLICY "season_maps_update" ON season_maps FOR UPDATE USING (true);

CREATE POLICY "sms_select" ON season_map_servers FOR SELECT USING (true);
CREATE POLICY "sms_insert" ON season_map_servers FOR INSERT WITH CHECK (true);
CREATE POLICY "sms_delete" ON season_map_servers FOR DELETE USING (true);

CREATE POLICY "requests_select" ON server_requests FOR SELECT USING (true);
CREATE POLICY "requests_insert" ON server_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "requests_update" ON server_requests FOR UPDATE USING (true);

CREATE POLICY "handshakes_select" ON server_handshakes FOR SELECT USING (true);
CREATE POLICY "handshakes_insert" ON server_handshakes FOR INSERT WITH CHECK (true);
CREATE POLICY "handshakes_update" ON server_handshakes FOR UPDATE USING (true);

CREATE POLICY "ahs_select" ON alliance_handshake_settings FOR SELECT USING (true);
CREATE POLICY "ahs_insert" ON alliance_handshake_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "ahs_update" ON alliance_handshake_settings FOR UPDATE USING (true);
CREATE POLICY "ahs_delete" ON alliance_handshake_settings FOR DELETE USING (true);

CREATE POLICY "train_sched_select" ON train_schedules FOR SELECT USING (true);
CREATE POLICY "train_sched_insert" ON train_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "train_sched_update" ON train_schedules FOR UPDATE USING (true);
CREATE POLICY "train_sched_delete" ON train_schedules FOR DELETE USING (true);

CREATE POLICY "train_slots_select" ON train_slots FOR SELECT USING (true);
CREATE POLICY "train_slots_insert" ON train_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "train_slots_update" ON train_slots FOR UPDATE USING (true);
CREATE POLICY "train_slots_delete" ON train_slots FOR DELETE USING (true);

CREATE POLICY "battle_plans_select" ON battle_plans FOR SELECT USING (true);
CREATE POLICY "battle_plans_insert" ON battle_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plans_update" ON battle_plans FOR UPDATE USING (true);
CREATE POLICY "battle_plans_delete" ON battle_plans FOR DELETE USING (true);

CREATE POLICY "battle_plan_slots_select" ON battle_plan_slots FOR SELECT USING (true);
CREATE POLICY "battle_plan_slots_insert" ON battle_plan_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plan_slots_update" ON battle_plan_slots FOR UPDATE USING (true);
CREATE POLICY "battle_plan_slots_delete" ON battle_plan_slots FOR DELETE USING (true);
