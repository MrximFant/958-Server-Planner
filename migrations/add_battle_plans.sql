-- ============================================================
-- Battle Planner — Canyon Storm / Desert Storm planning tables
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
  config       JSONB DEFAULT '{}',
  rules_text   TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, event_type, taskforce, week_label)
);

CREATE TABLE IF NOT EXISTS battle_plan_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES battle_plans(id) ON DELETE CASCADE,
  team_number  INTEGER NOT NULL,
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  role         TEXT CHECK (role IN ('coordinator', 'lethal', 'science', 'info') OR role IS NULL),
  is_sub       BOOLEAN NOT NULL DEFAULT FALSE,
  slot_order   INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE battle_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_plan_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_plans_select" ON battle_plans FOR SELECT USING (true);
CREATE POLICY "battle_plans_insert" ON battle_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plans_update" ON battle_plans FOR UPDATE USING (true);
CREATE POLICY "battle_plans_delete" ON battle_plans FOR DELETE USING (true);

CREATE POLICY "battle_plan_slots_select" ON battle_plan_slots FOR SELECT USING (true);
CREATE POLICY "battle_plan_slots_insert" ON battle_plan_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "battle_plan_slots_update" ON battle_plan_slots FOR UPDATE USING (true);
CREATE POLICY "battle_plan_slots_delete" ON battle_plan_slots FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE battle_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_plan_slots;
