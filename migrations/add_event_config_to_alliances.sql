-- Add event_config column to alliances table
-- Stores admin-configured time slots for Canyon Storm and Desert Storm
-- Shape: { canyon: { teamA: 'thu_09', teamB: 'thu_18' }, desert: { teamA: 'fri_09', teamB: 'fri_18' } }

ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS event_config JSONB;
