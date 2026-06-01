-- ============================================================
-- Last War Server Planner — Full Schema
-- Run this in Supabase SQL Editor (Database → SQL Editor)
-- ============================================================

-- ── Clean slate ──────────────────────────────────────────────
DROP TABLE IF EXISTS season_map_servers  CASCADE;
DROP TABLE IF EXISTS season_maps         CASCADE;
DROP TABLE IF EXISTS server_handshakes   CASCADE;
DROP TABLE IF EXISTS territories         CASCADE;
DROP TABLE IF EXISTS members             CASCADE;
DROP TABLE IF EXISTS alliances           CASCADE;
DROP TABLE IF EXISTS servers             CASCADE;

-- ── servers ───────────────────────────────────────────────────
CREATE TABLE servers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_number    TEXT NOT NULL,                -- e.g. "958"
  name             TEXT NOT NULL,                -- e.g. "958 Mastermind"
  admin_password   TEXT NOT NULL,                -- stored as SHA-256 hex
  invite_code      TEXT UNIQUE NOT NULL,         -- random token for invite link
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── alliances ─────────────────────────────────────────────────
CREATE TABLE alliances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  tag              TEXT,                         -- short tag e.g. "[958]"
  color            TEXT NOT NULL DEFAULT '#00c8ff',
  owner_password   TEXT NOT NULL,               -- SHA-256 hex
  invite_code      TEXT UNIQUE NOT NULL,         -- for member invite links
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── members ───────────────────────────────────────────────────
CREATE TABLE members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  alliance_id      UUID REFERENCES alliances(id) ON DELETE SET NULL,
  username         TEXT NOT NULL,
  password         TEXT NOT NULL,               -- SHA-256 hex
  in_game_name     TEXT,
  power1           NUMERIC,
  power2           NUMERIC,
  power3           NUMERIC,
  has_squad4       BOOLEAN DEFAULT FALSE,
  troop1           TEXT,
  troop2           TEXT,
  troop3           TEXT,
  canyon_team      TEXT,                         -- 'A', 'B', 'any'
  canyon_sub       BOOLEAN DEFAULT FALSE,
  desert_team      TEXT,
  desert_sub       BOOLEAN DEFAULT FALSE,
  profession       TEXT,                         -- 'Engineer', 'Warlord'
  garrison         TEXT,
  quickstride      TEXT,
  resistance       INTEGER DEFAULT 0,
  coffee_buff      TEXT DEFAULT 'none',
  notes            TEXT,
  last_updated     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, username)
);

-- ── territories (ownership per season map) ───────────────────
CREATE TABLE territories (
  id               TEXT NOT NULL,               -- tile id e.g. "A61"
  season_map_id    UUID NOT NULL,               -- FK added after season_maps
  owner_id         UUID REFERENCES alliances(id) ON DELETE SET NULL,
  last_capture_at  TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT,
  PRIMARY KEY (id, season_map_id)
);

-- ── season_maps ───────────────────────────────────────────────
CREATE TABLE season_maps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,               -- e.g. "Season 5: Wild West"
  created_by       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  max_servers      INT DEFAULT 8,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from territories → season_maps now that table exists
ALTER TABLE territories
  ADD CONSTRAINT fk_territories_season_map
  FOREIGN KEY (season_map_id) REFERENCES season_maps(id) ON DELETE CASCADE;

-- ── season_map_servers ────────────────────────────────────────
CREATE TABLE season_map_servers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_map_id    UUID NOT NULL REFERENCES season_maps(id) ON DELETE CASCADE,
  server_id        UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  warzone          TEXT,                         -- 'A'-'H' (center I is contested)
  joined_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_map_id, server_id),
  UNIQUE(season_map_id, warzone)
);

-- ── server_handshakes ─────────────────────────────────────────
CREATE TABLE server_handshakes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  target_server_id      UUID REFERENCES servers(id) ON DELETE CASCADE,
  invite_code           TEXT UNIQUE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked
  -- visibility toggles (what initiator shares with target)
  share_map             BOOLEAN DEFAULT TRUE,
  share_roster          BOOLEAN DEFAULT FALSE,
  share_player_info     BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  accepted_at           TIMESTAMPTZ
);

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE territories;
ALTER PUBLICATION supabase_realtime ADD TABLE alliances;
ALTER PUBLICATION supabase_realtime ADD TABLE members;
ALTER PUBLICATION supabase_realtime ADD TABLE season_map_servers;
ALTER PUBLICATION supabase_realtime ADD TABLE server_handshakes;

-- ============================================================
-- Row Level Security — open read, restricted write
-- (Client enforces role via password check; DB allows all reads)
-- ============================================================
ALTER TABLE servers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_maps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_map_servers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_handshakes   ENABLE ROW LEVEL SECURITY;

-- servers: anyone can read; insert open (server creation); no direct update/delete from client
CREATE POLICY "servers_select" ON servers FOR SELECT USING (true);
CREATE POLICY "servers_insert" ON servers FOR INSERT WITH CHECK (true);
CREATE POLICY "servers_update" ON servers FOR UPDATE USING (true);

-- alliances: public read; insert/update open
CREATE POLICY "alliances_select" ON alliances FOR SELECT USING (true);
CREATE POLICY "alliances_insert" ON alliances FOR INSERT WITH CHECK (true);
CREATE POLICY "alliances_update" ON alliances FOR UPDATE USING (true);
CREATE POLICY "alliances_delete" ON alliances FOR DELETE USING (true);

-- members: public read; insert/update/delete open
CREATE POLICY "members_select" ON members FOR SELECT USING (true);
CREATE POLICY "members_insert" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "members_update" ON members FOR UPDATE USING (true);
CREATE POLICY "members_delete" ON members FOR DELETE USING (true);

-- territories: public read; insert/update open
CREATE POLICY "territories_select" ON territories FOR SELECT USING (true);
CREATE POLICY "territories_insert" ON territories FOR INSERT WITH CHECK (true);
CREATE POLICY "territories_update" ON territories FOR UPDATE USING (true);

-- season_maps: public read; insert/update open
CREATE POLICY "season_maps_select" ON season_maps FOR SELECT USING (true);
CREATE POLICY "season_maps_insert" ON season_maps FOR INSERT WITH CHECK (true);
CREATE POLICY "season_maps_update" ON season_maps FOR UPDATE USING (true);

-- season_map_servers: public read; insert/delete open
CREATE POLICY "sms_select" ON season_map_servers FOR SELECT USING (true);
CREATE POLICY "sms_insert" ON season_map_servers FOR INSERT WITH CHECK (true);
CREATE POLICY "sms_delete" ON season_map_servers FOR DELETE USING (true);

-- handshakes: public read; insert/update open
CREATE POLICY "handshakes_select" ON server_handshakes FOR SELECT USING (true);
CREATE POLICY "handshakes_insert" ON server_handshakes FOR INSERT WITH CHECK (true);
CREATE POLICY "handshakes_update" ON server_handshakes FOR UPDATE USING (true);
