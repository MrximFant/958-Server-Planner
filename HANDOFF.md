# 958 Mastermind Planner — AI Handoff Document
## Complete Project Brief for Cline / New AI Agent

---

## 🎯 What We Are Building

A **real-time collaborative command-and-control dashboard** for coordinating alliances in the mobile game *Last War: Survival* during Season 5 "Wild West". It visualizes a territory map, tracks protection timers, and predicts when tiles become vulnerable.

**Live project location:** `C:\Users\fante\Desktop\s5\958 Planner`
**Local dev server:** `http://localhost:5173`
**Tech stack:** React + Vite, Supabase (PostgreSQL + Realtime), TailwindCSS optional

---

## ✅ What Is Already Done

### Infrastructure
- Vite + React project scaffolded and running
- Supabase project created ("958 Planner")
- `.env` file configured with Supabase URL and anon key
- `src/supabaseClient.js` connected and working
- npm packages installed: `leaflet`, `react-leaflet`, `@supabase/supabase-js`, `lucide-react`

### Database (Supabase)
- `alliances` table created
- `territories` table created (currently seeded with placeholder data — needs replacement)
- Row Level Security policies set to allow public reads
- Realtime enabled on both tables

### Frontend (`src/App.jsx`)
- Loads territory data from Supabase in two batches (avoids 1000-row limit)
- Renders a color-coded grid with 14 tile types
- Hover tooltip shows tile details
- Legend displays all tile types

---

## 🚨 The Most Important Next Step

### Step 1: Replace the territory data with REAL data

The current Supabase `territories` table has **incorrect auto-generated tile data**. We have obtained the real tile data from the game's source.

**The real data source:**
Go to `https://cpt-hedge.com/_next/static/chunks/695.js` and run this in the browser console on that site to download the real data:

```js
fetch('/_next/static/chunks/695.js')
  .then(r => r.text())
  .then(text => {
    const start = text.indexOf("e.exports=JSON.parse('") + "e.exports=JSON.parse('".length;
    const end = text.lastIndexOf("')}}])");
    const json = text.slice(start, end);
    const blob = new Blob([json], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'territories.json';
    a.click();
    console.log('Tiles:', JSON.parse(json).length); // Should be ~2221
  });
```

Save the downloaded file to: `src/data/territories.json`

### Real Data Structure (Critical — read carefully)

The real map is **NOT a uniform grid**. It is a **3000×3000 pixel canvas** with variable-size rectangular tiles:

```json
{
  "id": "A61",
  "name": "Grand Nexus",
  "level": 7,
  "isCapitol": true,
  "buff": { "item": "research", "percentage": 30 },
  "coordinates": { "x": 450, "y": 450, "width": 100, "height": 100 },
  "resources": { "crystalGold": 0, "influence": 0 }
}
```

**Key fields:**
- `id` — warzone letter + number (e.g. `A1`, `B61`, `I61`)
- `name` — tile type (see full list below)
- `level` — 1–12
- `isCapitol` — true for Grand Nexus and Golden Palace
- `coordinates.x/y` — pixel position on 3000×3000 canvas
- `coordinates.width/height` — tile size (50px or 100px)
- `resources.crystalGold` — CrystalGold/h production
- `resources.influence` — Influence production
- `buff` — resource buff this tile provides

**Warzone layout (9 warzones on the 3000×3000 canvas):**
```
Warzone A: x 0–999,    y 0–999      (top-left)
Warzone B: x 0–999,    y 1000–1999  (center-left)
Warzone C: x 0–999,    y 2000–2999  (bottom-left)
Warzone D: x 1000–1999, y 2000–2999 (bottom-center)
Warzone E: x 2000–2999, y 2000–2999 (bottom-right)
Warzone F: x 2000–2999, y 1000–1999 (center-right)
Warzone G: x 2000–2999, y 0–999     (top-right)
Warzone H: x 1000–1999, y 0–999     (top-center)
Warzone I: x 1000–1999, y 1000–1999 (CENTER — mines + Golden Palace)
```

**All 15 real tile types:**
| Name | Code | Protection | Notes |
|------|------|-----------|-------|
| Stronghold | SH | 48h | Most common |
| Coyote Town | CT | 48h | Cities — main objective |
| Waterhold | W | 48h | Mid-tier city |
| Lawless Road | LR | 24h | Road tiles |
| Derby Grounds | DG | 48h | Resource tile |
| Sand County | SC | 48h | Resource tile |
| Trade Post | TP | 24h | Border tiles |
| Grand Nexus | GN | 48h | Warzone capitol (1 per warzone A–H) |
| Golden Palace | GP | 48h | THE center tile — `id: I61` at x:1450, y:1450 |
| Small CrystalGold Mine | SCM | 48h | Center warzone only |
| Medium CrystalGold Mine | MCM | 48h | Center warzone only |
| Large CrystalGold Mine | LCM | 48h | Center warzone only |
| Mega CrystalGold Mine | MGCM | 48h | Center warzone only |
| Colossal CrystalGold Mine | CCM | 48h | Center warzone only (4 tiles) |
| Warzone Outpost | WO | 24h | At warzone border crossings |

---

## Step 2: Rewrite App.jsx for Real Coordinate Rendering

Once `src/data/territories.json` exists, rewrite `src/App.jsx` to:

1. **Load from local JSON** (not Supabase) for tile definitions — Supabase is only for ownership/timer state
2. **Render using real pixel coordinates** scaled down to fit screen
3. Use `position: absolute` inside a `position: relative` container
4. Scale factor: `containerSize / 3000` (e.g. if container is 900px wide, scale = 0.3)

```jsx
// Core rendering logic:
import tilesData from './data/territories.json'

const CANVAS_SIZE = 3000
const DISPLAY_SIZE = 900 // or dynamic based on window
const SCALE = DISPLAY_SIZE / CANVAS_SIZE

// Render each tile:
{tilesData.map(tile => (
  <div
    key={tile.id}
    style={{
      position: 'absolute',
      left: tile.coordinates.x * SCALE,
      top: tile.coordinates.y * SCALE,
      width: tile.coordinates.width * SCALE,
      height: tile.coordinates.height * SCALE,
      backgroundColor: TYPE_COLORS[tile.name] || '#444',
      border: '0.5px solid rgba(0,0,0,0.2)',
    }}
    title={`${tile.id} — ${tile.name} Lv.${tile.level}`}
  />
))}
```

---

## Step 3: Add Supabase Ownership Layer

The Supabase `territories` table needs restructuring. **Drop and recreate it:**

```sql
DROP TABLE IF EXISTS territories CASCADE;

CREATE TABLE territories (
  id TEXT PRIMARY KEY,           -- matches tile id from JSON e.g. "A61"
  owner_id UUID REFERENCES alliances(id) ON DELETE SET NULL,
  last_capture_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

ALTER PUBLICATION supabase_realtime ADD TABLE territories;

CREATE POLICY "Public read territories"
ON territories FOR SELECT USING (true);

CREATE POLICY "Public update territories"  
ON territories FOR UPDATE USING (true);

CREATE POLICY "Public insert territories"
ON territories FOR INSERT WITH CHECK (true);
```

The tile **definitions** (name, coordinates, resources) come from the local JSON.
The tile **ownership** (who owns it, when captured) comes from Supabase.

---

## Step 4: The Vulnerability Engine (Core Feature)

This is the "Mastermind" logic. Add a 48-hour slider that calculates tile status:

```jsx
// State
const [sliderHours, setSliderHours] = useState(0) // 0–48
const [ownership, setOwnership] = useState({})    // { tileId: { owner, capturedAt } }

// For each tile, calculate status:
function getTileStatus(tileId, tileName) {
  const owned = ownership[tileId]
  if (!owned) return 'neutral'
  
  const protectionHours = ['Trade Post', 'Lawless Road', 'Warzone Outpost'].includes(tileName) ? 24 : 48
  const projectedTime = Date.now() + (sliderHours * 3600 * 1000)
  const capturedAt = new Date(owned.capturedAt).getTime()
  const shieldExpiry = capturedAt + (protectionHours * 3600 * 1000)
  
  const shieldDown = projectedTime > shieldExpiry
  // TODO: also check alliance safe time window
  
  if (shieldDown) return 'vulnerable'   // 🔴
  return 'protected'                     // 🟢
}
```

**Tile color overlay logic:**
- No owner → base tile type color
- Owned + PROTECTED → alliance color (solid)
- Owned + VULNERABLE → alliance color with red pulsing border

---

## Step 5: Alliance Panel (Right Sidebar)

Build a sidebar where users can:
1. Create alliances (name + color)
2. Select an active alliance
3. Click tiles on the map to assign them to the selected alliance
4. See per-alliance stats: total CrystalGold/h, total Influence

Alliance data stored in Supabase `alliances` table:
```sql
-- Already created, schema:
id UUID PRIMARY KEY
name TEXT
side TEXT ('ally' or 'enemy')
server_id TEXT
color TEXT (hex)
safe_time_start INT (0-23 UTC hour)
safe_time_end INT (0-23 UTC hour)
```

---

## Step 6: Real-time Sync

Subscribe to Supabase realtime so all users see live updates:

```jsx
useEffect(() => {
  const channel = supabase
    .channel('territory-changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'territories' },
      (payload) => {
        // Update ownership state
        setOwnership(prev => ({
          ...prev,
          [payload.new.id]: payload.new
        }))
      }
    )
    .subscribe()
  
  return () => supabase.removeChannel(channel)
}, [])
```

---

## Current File Structure

```
C:\Users\fante\Desktop\s5\958 Planner\
├── .env                          ✅ configured
├── package.json                  ✅ 
├── vite.config.js                ✅
├── src\
│   ├── main.jsx                  ✅
│   ├── index.css                 ✅
│   ├── App.jsx                   ⚠️  needs rewrite for real coords
│   ├── supabaseClient.js         ✅
│   └── data\
│       └── territories.json      ❌ NEEDS TO BE CREATED (see Step 1)
```

---

## Supabase Details

- Project name: "958 Planner"
- URL: `https://zwsmgaerukpwggystkbd.supabase.co`
- Anon key: in `.env` as `VITE_SUPABASE_ANON_KEY`

---

## Priority Order for New AI

1. ✅ Verify `src/data/territories.json` exists with ~2221 tiles
2. 🔄 Rewrite `App.jsx` to render tiles using real pixel coordinates (scaled)
3. 🔄 Drop & recreate `territories` table in Supabase (ownership only, no tile definitions)
4. 🔄 Add click-to-assign territory functionality 
5. 🔄 Build alliance management sidebar
6. 🔄 Add 48-hour slider + vulnerability calculation
7. 🔄 Wire up Supabase realtime subscriptions
8. 🔄 Add authentication (Mastermind vs Alliance Leader roles)

---

## Design Vision

- **Dark theme** — deep navy/slate background (`#1a1a2e`)
- **Military/tactical aesthetic** — like a war room command display
- **Color coding:** each alliance gets a distinct color; vulnerable tiles pulse red
- **The map is the hero** — full screen, the sidebar panels slide in/out
- **Font:** monospace for coordinates, clean sans-serif for UI

---

## Notes for the AI

- The tile data has NO "warzone" field — derive it from coordinates if needed:
  - x < 1000 && y < 1000 → Warzone A
  - x < 1000 && y 1000–1999 → Warzone B
  - etc.
- Tiles are NOT uniform size — some are 50×50, some are 50×100, some are 100×100
- The `Grand Nexus` tiles have `isCapitol: true` — render them with a special indicator
- The `Golden Palace` is tile `I61` at coordinates `x:1450, y:1450` — the most important tile
- `Warzone Outpost` tiles have `buff: null` — handle null buffs gracefully
- Protection hours: Trade Post, Lawless Road, Warzone Outpost = **24h**; everything else = **48h**
