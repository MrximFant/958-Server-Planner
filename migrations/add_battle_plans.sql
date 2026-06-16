-- ============================================================
-- Battle Planner — Desert Storm building-centric planning tables
-- Run this in Supabase SQL Editor (Database → SQL Editor)
-- ============================================================

-- One plan per event type per alliance per week per taskforce
CREATE TABLE IF NOT EXISTS battle_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('canyon', 'desert')),
  week_label   DATE NOT NULL,
  taskforce    TEXT NOT NULL CHECK (taskforce IN ('A', 'B')),
  name         TEXT,
  rules_text   TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, event_type, taskforce, week_label)
);

-- One row per building defined by the admin for a plan
CREATE TABLE IF NOT EXISTS battle_plan_buildings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES battle_plans(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'custom', -- oil_refinery|info_center|science_hub|field_hospital|oil_well|arsenal|mercenary_factory|nuclear_silo|kill_squad|substitutes|custom
  phase        TEXT, -- 'phase1' | 'phase2' | NULL (kill squad / substitutes have NULL phase)
  links_to_id  UUID REFERENCES battle_plan_buildings(id) ON DELETE SET NULL, -- phase1 building -> phase2 building it transitions to
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many: a member can be assigned to multiple buildings
CREATE TABLE IF NOT EXISTS battle_plan_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  UUID NOT NULL REFERENCES battle_plan_buildings(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role         TEXT CHECK (role IN ('coordinator', 'lethal', 'science', 'info') OR role IS NULL),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(building_id, member_id)
);

ALTER TABLE battle_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_plan_buildings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_plan_assignments   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_plans_select" ON battle_plans FOR SELECT USING (true);
CREATE POLICY "battle_plans_insert" ON battle_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plans_update" ON battle_plans FOR UPDATE USING (true);
CREATE POLICY "battle_plans_delete" ON battle_plans FOR DELETE USING (true);

CREATE POLICY "battle_plan_buildings_select" ON battle_plan_buildings FOR SELECT USING (true);
CREATE POLICY "battle_plan_buildings_insert" ON battle_plan_buildings FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plan_buildings_update" ON battle_plan_buildings FOR UPDATE USING (true);
CREATE POLICY "battle_plan_buildings_delete" ON battle_plan_buildings FOR DELETE USING (true);

CREATE POLICY "battle_plan_assignments_select" ON battle_plan_assignments FOR SELECT USING (true);
CREATE POLICY "battle_plan_assignments_insert" ON battle_plan_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plan_assignments_update" ON battle_plan_assignments FOR UPDATE USING (true);
CREATE POLICY "battle_plan_assignments_delete" ON battle_plan_assignments FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE battle_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_plan_buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_plan_assignments;

-- ============================================================
-- No-show tracking — Desert Storm attendance per week
-- Run this block separately if the above tables already exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS battle_plan_noshows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id  UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  taskforce    TEXT NOT NULL,
  week_label   DATE NOT NULL,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, event_type, taskforce, week_label, member_id)
);

ALTER TABLE battle_plan_noshows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_plan_noshows_select" ON battle_plan_noshows FOR SELECT USING (true);
CREATE POLICY "battle_plan_noshows_insert" ON battle_plan_noshows FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plan_noshows_update" ON battle_plan_noshows FOR UPDATE USING (true);
CREATE POLICY "battle_plan_noshows_delete" ON battle_plan_noshows FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE battle_plan_noshows;
