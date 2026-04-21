DROP TABLE IF EXISTS territories CASCADE;

CREATE TABLE territories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  type TEXT NOT NULL,
  buff JSONB,
  coordinates JSONB NOT NULL,
  resources JSONB,
  owner_id UUID REFERENCES users(id),
  last_capture_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territories_owner ON territories(owner_id);
CREATE INDEX IF NOT EXISTS idx_territories_last_capture ON territories(last_capture_at);
CREATE INDEX IF NOT EXISTS idx_territories_type ON territories(type);
CREATE INDEX IF NOT EXISTS idx_territories_level ON territories(level);

ALTER PUBLICATION supabase_realtime ADD TABLE territories;

CREATE POLICY "Public read territories"
ON territories FOR SELECT USING (true);

CREATE POLICY "Public update territories"  
ON territories FOR UPDATE USING (true);

CREATE POLICY "Public insert territories"
ON territories FOR INSERT WITH CHECK (true);