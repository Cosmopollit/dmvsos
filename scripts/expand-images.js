#!/usr/bin/env node
/**
 * AI-powered image matching for DMV test questions — context-aware.
 *
 * PROBLEM WITH V1: Model saw "stop" → matched stop sign. But "stopping distance"
 * has nothing to do with a stop sign. Need CONTEXT understanding.
 *
 * APPROACH:
 * 1. Deterministic regex (strict, only when question is ABOUT the specific sign/item)
 * 2. AI matching with STRICT rules — only match when the image HELPS answer the question
 * 3. AI adversarial verification — reject false positives
 * 4. Write to DB + propagate to other languages
 *
 * All images are US-specific (MUTCD signs, US dashboard standards, US hand signals).
 *
 * Target: 30%+ questions with images (~9,800 of 32,677)
 *
 * Usage:
 *   node scripts/expand-images.js --dry-run    # report only
 *   node scripts/expand-images.js              # apply matches
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const PROGRESS_FILE = path.join(__dirname, '..', '.expand-images-progress.json');
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const AI_BATCH_SIZE = 8;
const VERIFY_BATCH_SIZE = 12;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function supabaseGetAll(table, params = '') {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const sep = params ? '&' : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?${params}${sep}offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function supabasePatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------

async function callClaude(prompt, maxTokens = 4096) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '30', 10);
    console.log(`\n  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return callClaude(prompt, maxTokens);
  }
  if (res.status === 529) {
    console.log('\n  API overloaded, waiting 60s...');
    await sleep(60000);
    return callClaude(prompt, maxTokens);
  }
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Available images (all US-specific: MUTCD, ISO dashboard, US hand signals)
// ---------------------------------------------------------------------------

function getAvailableImages() {
  const dir = path.join(__dirname, '..', 'public', 'signs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
}

const IMAGE_CATALOG = {
  // Road signs (US MUTCD standard)
  'stop': 'Red octagonal STOP sign',
  'yield': 'Red/white triangular YIELD sign',
  'do-not-enter': 'Red circle DO NOT ENTER sign',
  'wrong-way': 'Red WRONG WAY sign',
  'no-u-turn': 'No U-turn regulatory sign',
  'no-left-turn': 'No left turn sign',
  'no-right-turn': 'No right turn sign',
  'no-passing': 'No passing zone pennant sign',
  'one-way': 'One-way directional sign',
  'keep-right': 'Keep right sign',
  'speed-limit': 'Speed limit sign',
  'school-zone': 'Yellow pentagon school zone sign',
  'pedestrian-crossing': 'Yellow diamond pedestrian crossing warning',
  'railroad-warning': 'Round yellow railroad advance warning sign',
  'railroad-crossbuck': 'White X-shaped railroad crossbuck sign',
  'merge': 'Yellow diamond merge warning sign',
  'curve-right': 'Yellow diamond curve ahead sign',
  'winding-road': 'Yellow diamond winding road sign',
  'slippery': 'Yellow diamond slippery when wet sign',
  'divided-highway': 'Divided highway sign',
  'two-way-traffic': 'Two-way traffic sign',
  'hill': 'Steep hill/grade warning sign',
  'deer-crossing': 'Yellow diamond deer crossing sign',
  'road-work': 'Orange diamond road work/construction sign',
  'signal-ahead': 'Traffic signal ahead warning sign',
  'stop-ahead': 'Stop ahead warning sign',
  'sharp-turn': 'Sharp turn warning sign',
  'lane-ends': 'Lane ends warning sign',
  'narrow-bridge': 'Narrow bridge warning sign',
  'advisory-speed': 'Advisory speed placard',
  'roundabout': 'Roundabout/traffic circle sign',
  'no-parking': 'No parking sign',
  'bicycle-crossing': 'Bicycle crossing warning sign',
  'low-clearance': 'Low clearance warning sign',
  'bump': 'Speed bump warning sign',
  'dip': 'Dip in road warning sign',
  'detour': 'Detour sign',
  'road-closed': 'Road closed sign',
  'crosswalk': 'Crosswalk regulatory sign',
  'hospital': 'Hospital direction sign (blue)',
  'rest-area': 'Rest area sign (blue)',
  'interstate': 'Interstate highway shield',
  'route-marker': 'US route marker shield',
  'no-trucks': 'No trucks allowed sign',
  'weight-limit': 'Weight limit sign',
  'truck-crossing': 'Truck crossing warning sign',
  'added-lane': 'Added lane sign',
  'double-curve': 'Double curve warning sign',
  'pedestrian-signal': 'Pedestrian signal push-button sign',
  'slow': 'SLOW sign',
  'chevron': 'Chevron curve alignment sign',
  'cattle-crossing': 'Cattle crossing warning sign',
  'fire-station': 'Fire station warning sign',
  'playground': 'Playground warning sign',
  // Dashboard lights (ISO standard, universal in US vehicles)
  'dash-check-engine': 'Check engine / malfunction indicator dashboard light',
  'dash-oil-pressure': 'Oil pressure dashboard warning light',
  'dash-temperature': 'Engine coolant temperature dashboard warning',
  'dash-battery': 'Battery / charging system dashboard warning',
  'dash-brake': 'Brake system dashboard warning light',
  'dash-abs': 'ABS (anti-lock braking) dashboard warning light',
  'dash-tire-pressure': 'Tire pressure (TPMS) dashboard warning light',
  'dash-seatbelt': 'Seatbelt dashboard warning light',
  'dash-highbeam': 'High beam headlight indicator',
  // Hand signals (US driving standard)
  'hand-signal-left': 'Left turn hand signal (arm straight out window)',
  'hand-signal-right': 'Right turn hand signal (arm bent up)',
  'hand-signal-stop': 'Stop/slow hand signal (arm bent down)',
  // Thematic illustrations
  'traffic-light': 'Standard vertical traffic signal (red/yellow/green)',
  'intersection': 'Diagram of a signalized four-way intersection from above',
  'roundabout-diagram': 'Aerial diagram of a single-lane roundabout with traffic flow',
  'highway-road': 'Perspective view of a multi-lane highway with lane markings',
  'motorcycle': 'Motorcycle with rider silhouette icon',
  'motorcycle-helmet': 'Full-face motorcycle safety helmet',
  'semi-truck': 'Diagram of an 18-wheeler semi-truck (side view)',
  'school-bus': 'Yellow US school bus illustration',
  'bicycle': 'US DOT bicycle symbol (white on green)',
  'police-car': 'Police car with light bar',
  'ambulance': 'Ambulance emergency vehicle icon',
  'fire-truck': 'Fire engine / fire truck',
  'car-crash': 'Car crash / collision icon',
  'no-alcohol': 'No alcohol / no drinking prohibition sign',
  'seatbelt': 'Person wearing seatbelt illustration',
  'speedometer': 'Speedometer gauge icon',
  'hydroplaning': 'Diagram showing car hydroplaning on wet road',
  'blind-spot': 'Diagram showing blind spot zones around three cars',
  'flat-tire': 'Flat tire / tire blowout icon',
  'crosswalk-diagram': 'Diagram showing different crosswalk marking styles',
  'low-beam': 'Low beam headlight dashboard symbol',
  'following-distance': 'Two cars with minimum following distance marker',
  'electric-car': 'Electric vehicle (EV) car icon',
  'ev-charging': 'Electric vehicle charging station sign (FHWA standard)',
  'airbag': 'Airbag dashboard symbol',
  'fog-light': 'Front fog light dashboard symbol',
  'rear-fog-light': 'Rear fog light dashboard symbol',
  'parking-meter': 'Parking meter icon',
  'tow-truck': 'Tow truck icon',
  'no-texting': 'No texting while driving sign',
  'lane-keeping': 'Lane keeping / lane departure warning system symbol',
};

// ---------------------------------------------------------------------------
// Phase 1: Strict deterministic regex matching
// ---------------------------------------------------------------------------

const GLOBAL_NEGATIVES = [
  /\bsign of\b/i, /\bsigns of\b/i, /\bsigned\b/i, /\bdesign\b/i,
  /\bsignificant\b/i, /\bsignal.*turn\b/i, /\bturn signal\b/i,
];

const REGEX_RULES = [
  // STOP SIGN — NOT "stop your vehicle" or "stopping distance"
  { p: /\bstop sign\b/i, img: 'stop' },
  { p: /\bred octagon\b/i, img: 'stop' },
  { p: /\boctagon[- ]shaped.*sign\b/i, img: 'stop' },
  { p: /\beight[- ]sided.*sign\b/i, img: 'stop' },

  // YIELD
  { p: /\byield sign\b/i, img: 'yield' },
  { p: /\binverted triangle\b.*sign/i, img: 'yield' },
  { p: /\bupside[- ]down triangle\b.*sign/i, img: 'yield' },

  // DO NOT ENTER / WRONG WAY
  { p: /\bdo not enter\b.*\bsign\b/i, img: 'do-not-enter' },
  { p: /\bsign\b.*\bdo not enter\b/i, img: 'do-not-enter' },
  { p: /\bwrong way\b.*\bsign\b/i, img: 'wrong-way' },

  // NO PASSING
  { p: /\bno passing\b.*\bsign\b/i, img: 'no-passing' },
  { p: /\bdo not pass\b.*\bsign\b/i, img: 'no-passing' },
  { p: /\bpennant[- ]shaped\b/i, img: 'no-passing' },

  // ONE WAY / KEEP RIGHT / NO TURN
  { p: /\bone[- ]way\b.*\bsign\b/i, img: 'one-way' },
  { p: /\bkeep right\b.*\bsign\b/i, img: 'keep-right' },
  { p: /\bno left turn\b.*\bsign\b/i, img: 'no-left-turn' },
  { p: /\bno right turn\b.*\bsign\b/i, img: 'no-right-turn' },
  { p: /\bno u[- ]?turn\b.*\bsign\b/i, img: 'no-u-turn' },

  // SPEED LIMIT (only the SIGN, not "what is the speed limit")
  { p: /\bspeed limit sign\b/i, img: 'speed-limit' },
  { p: /\bposted speed limit\b.*\bsign\b/i, img: 'speed-limit' },

  // SCHOOL / PEDESTRIAN
  { p: /\bschool zone\b.*\bsign\b/i, img: 'school-zone' },
  { p: /\bschool crossing\b.*\bsign\b/i, img: 'school-zone' },
  { p: /\bpentagon[- ]shaped\b.*\bsign\b/i, img: 'school-zone' },
  { p: /\bpedestrian crossing\b.*\bsign\b/i, img: 'pedestrian-crossing' },
  { p: /\bpedestrian\b.*\bwarning sign\b/i, img: 'pedestrian-crossing' },

  // RAILROAD
  { p: /\bcross-?buck\b/i, img: 'railroad-crossbuck' },
  { p: /\brailroad.*crossing sign\b/i, img: 'railroad-crossbuck' },
  { p: /\brailroad warning sign\b/i, img: 'railroad-warning' },
  { p: /\brailroad.*advance warning\b/i, img: 'railroad-warning' },

  // CONSTRUCTION / ROAD WORK
  { p: /\broad work\b.*\bsign\b/i, img: 'road-work' },
  { p: /\bconstruction.*sign\b/i, img: 'road-work' },
  { p: /\borange diamond\b.*\bsign\b/i, img: 'road-work' },
  { p: /\bwork zone\b.*\bsign\b/i, img: 'road-work' },

  // CURVE / WINDING / SHARP TURN
  { p: /\bcurve\b.*\bsign\b/i, img: 'curve-right', neg: [/double curve/i] },
  { p: /\bwinding road\b.*\bsign\b/i, img: 'winding-road' },
  { p: /\bsharp turn\b.*\bsign\b/i, img: 'sharp-turn' },
  { p: /\bdouble curve\b.*\bsign\b/i, img: 'double-curve' },

  // OTHER SIGNS
  { p: /\bmerge sign\b/i, img: 'merge' },
  { p: /\bmerge\b.*\bsign\b/i, img: 'merge' },
  { p: /\blane ends\b.*\bsign\b/i, img: 'lane-ends' },
  { p: /\bslippery\b.*\bsign\b/i, img: 'slippery' },
  { p: /\bnarrow bridge\b.*\bsign\b/i, img: 'narrow-bridge' },
  { p: /\bdivided highway\b.*\bsign\b/i, img: 'divided-highway' },
  { p: /\btwo[- ]way traffic\b.*\bsign\b/i, img: 'two-way-traffic' },
  { p: /\bsignal ahead\b.*\bsign\b/i, img: 'signal-ahead' },
  { p: /\bstop ahead\b.*\bsign\b/i, img: 'stop-ahead' },
  { p: /\bdeer crossing\b.*\bsign\b/i, img: 'deer-crossing' },
  { p: /\badvisory speed\b.*\bsign\b/i, img: 'advisory-speed' },
  { p: /\broundabout\b.*\bsign\b/i, img: 'roundabout' },
  { p: /\bno parking\b.*\bsign\b/i, img: 'no-parking' },
  { p: /\bbicycle crossing\b.*\bsign\b/i, img: 'bicycle-crossing' },
  { p: /\blow clearance\b.*\bsign\b/i, img: 'low-clearance' },
  { p: /\bspeed bump\b.*\bsign\b/i, img: 'bump' },
  { p: /\bdetour\b.*\bsign\b/i, img: 'detour' },
  { p: /\bno.trucks\b.*\bsign\b/i, img: 'no-trucks' },
  { p: /\binterstate\b.*\bshield\b/i, img: 'interstate' },
  { p: /\binterstate\b.*\bsign\b/i, img: 'interstate' },
  { p: /\bcattle crossing\b/i, img: 'cattle-crossing' },
  { p: /\bchevron\b.*\bsign\b/i, img: 'chevron' },
  { p: /\bhill\b.*\bwarning sign\b/i, img: 'hill' },
  { p: /\bsteep (grade|hill)\b.*\bsign\b/i, img: 'hill' },

  // HAND SIGNALS
  { p: /\bhand signal\b.*\bleft turn\b/i, img: 'hand-signal-left' },
  { p: /\bleft turn\b.*\bhand signal\b/i, img: 'hand-signal-left' },
  { p: /\bhand signal\b.*\bright turn\b/i, img: 'hand-signal-right' },
  { p: /\bright turn\b.*\bhand signal\b/i, img: 'hand-signal-right' },
  { p: /\bhand signal\b.*\b(stop|slow)\b/i, img: 'hand-signal-stop' },

  // DASHBOARD LIGHTS
  { p: /\bcheck engine\b.*\b(light|indicator|warning)\b/i, img: 'dash-check-engine' },
  { p: /\bmalfunction indicator\b/i, img: 'dash-check-engine' },
  { p: /\boil pressure\b.*\b(light|indicator|warning)\b/i, img: 'dash-oil-pressure' },
  { p: /\b(coolant|temperature|overheating)\b.*\b(light|indicator|warning|gauge)\b/i, img: 'dash-temperature', neg: [/weather/i, /outside temp/i] },
  { p: /\bbattery\b.*\b(light|indicator|warning)\b/i, img: 'dash-battery' },
  { p: /\bbrake\b.*\bwarning light\b/i, img: 'dash-brake' },
  { p: /\bbrake\b.*\bindicator light\b/i, img: 'dash-brake' },
  { p: /\bABS\b.*\b(light|indicator|warning)\b/i, img: 'dash-abs' },
  { p: /\banti[- ]?lock\b.*\bbraking\b/i, img: 'dash-abs' },
  { p: /\btire pressure\b.*\b(light|indicator|warning|monitor)\b/i, img: 'dash-tire-pressure' },
  { p: /\bTPMS\b/i, img: 'dash-tire-pressure' },
  { p: /\bseatbelt\b.*\b(light|indicator|warning)\b/i, img: 'dash-seatbelt' },
  { p: /\bhigh beam\b.*\b(indicator|symbol)\b/i, img: 'dash-highbeam' },

  // ===== THEMATIC ILLUSTRATIONS (t:true = skip GLOBAL_NEGATIVES) =====
  // Broader matching: image illustrates the topic without revealing the answer.

  // Traffic lights / signals
  { t:1, p: /\btraffic (light|signal)s?\b/i, img: 'traffic-light' },
  { t:1, p: /\bflashing (red|yellow)\b/i, img: 'traffic-light' },
  { t:1, p: /\b(red|yellow|green) (light|arrow)\b/i, img: 'traffic-light', neg: [/\bdashboard\b/i, /\bwarning\b/i] },
  { t:1, p: /\bprotected.*(left|right).*turn\b/i, img: 'traffic-light' },

  // School bus
  { t:1, p: /\bschool bus\b/i, img: 'school-bus' },

  // Motorcycle — specific rules first, then broad catch-all
  { t:1, p: /\bhelmet\b/i, img: 'motorcycle-helmet' },
  { t:1, p: /\bprotective (gear|clothing|equipment)\b/i, img: 'motorcycle-helmet' },
  { t:1, p: /\bmotorcycl/i, img: 'motorcycle', neg: [/\bcrossing sign\b/i, /\bwarning sign\b/i] },
  { t:1, p: /\blane splitting\b/i, img: 'motorcycle' },

  // CDL / Commercial / Truck
  { t:1, p: /\bCDL\b/i, img: 'semi-truck' },
  { t:1, p: /\bcommercial (vehicle|driver|motor vehicle)\b/i, img: 'semi-truck' },
  { t:1, p: /\b(air brake|coupling|uncoupling|kingpin|fifth wheel)\b/i, img: 'semi-truck' },
  { t:1, p: /\b(semi|tractor)[- ]?trailer\b/i, img: 'semi-truck' },
  { t:1, p: /\bpre[- ]?trip inspection\b/i, img: 'semi-truck' },
  { t:1, p: /\b(tanker|hazmat|cargo|freight)\b.*\b(vehicle|truck|transport|endorsement)\b/i, img: 'semi-truck' },
  { t:1, p: /\b(GVWR|gross vehicle weight)\b/i, img: 'semi-truck' },
  { t:1, p: /\btruck\b/i, img: 'semi-truck', neg: [/\bsign\b/i, /\btow truck\b/i, /\bfire truck\b/i] },

  // DUI / Alcohol
  { t:1, p: /\b(DUI|DWI|OUI|OWI)\b/i, img: 'no-alcohol' },
  { t:1, p: /\b(drunk|intoxicat|impaired)\b.*\bdriv/i, img: 'no-alcohol' },
  { t:1, p: /\balcohol\b.*\bdriv/i, img: 'no-alcohol' },
  { t:1, p: /\bBAC\b/i, img: 'no-alcohol' },
  { t:1, p: /\bblood alcohol\b/i, img: 'no-alcohol' },
  { t:1, p: /\bunder the influence\b/i, img: 'no-alcohol' },
  { t:1, p: /\bopen container\b/i, img: 'no-alcohol' },
  { t:1, p: /\bimplied consent\b/i, img: 'no-alcohol' },
  { t:1, p: /\bzero tolerance\b/i, img: 'no-alcohol' },
  { t:1, p: /\bdesignated driver\b/i, img: 'no-alcohol' },
  { t:1, p: /\bdrinking\b.*\bdriv/i, img: 'no-alcohol' },
  { t:1, p: /\balcohol\b/i, img: 'no-alcohol', neg: [/\brubbing alcohol\b/i] },

  // Seatbelt / Child seat
  { t:1, p: /\b(seatbelt|seat belt)\b/i, img: 'seatbelt', neg: [/\bdashboard\b/i, /\bwarning light\b/i, /\bindicator\b/i] },
  { t:1, p: /\b(child|booster|infant) (seat|restraint)\b/i, img: 'seatbelt' },
  { t:1, p: /\bpassenger restraint\b/i, img: 'seatbelt' },

  // Emergency vehicles
  { t:1, p: /\bemergency vehicle\b/i, img: 'ambulance' },
  { t:1, p: /\bambulance\b/i, img: 'ambulance' },
  { t:1, p: /\bfire (truck|engine)\b/i, img: 'fire-truck' },
  { t:1, p: /\bpolice (car|vehicle|officer)\b/i, img: 'police-car' },
  { t:1, p: /\bpulled over\b/i, img: 'police-car' },
  { t:1, p: /\blaw enforcement\b/i, img: 'police-car' },
  { t:1, p: /\bsiren\b/i, img: 'ambulance' },
  { t:1, p: /\bmove[- ]over law\b/i, img: 'police-car' },

  // Bicycle / Cyclist
  { t:1, p: /\bbicycl(e|ist)\b/i, img: 'bicycle', neg: [/\bcrossing sign\b/i, /\bsign\b/i] },
  { t:1, p: /\bcyclist\b/i, img: 'bicycle' },

  // Hydroplaning / Skidding
  { t:1, p: /\bhydroplan/i, img: 'hydroplaning' },
  { t:1, p: /\bskid(ding|s)?\b/i, img: 'hydroplaning' },
  { t:1, p: /\bwet (road|pavement)\b/i, img: 'hydroplaning' },

  // Blind spot
  { t:1, p: /\bblind spot\b/i, img: 'blind-spot' },
  { t:1, p: /\b(side|rearview) mirror\b/i, img: 'blind-spot' },

  // Following distance / Tailgating
  { t:1, p: /\bfollowing distance\b/i, img: 'following-distance' },
  { t:1, p: /\btailgat/i, img: 'following-distance' },
  { t:1, p: /\b(two|three|2|3)[- ]second (rule|following|gap)\b/i, img: 'following-distance' },
  { t:1, p: /\bsafe (following )?distance\b/i, img: 'following-distance' },

  // Texting / Distracted driving
  { t:1, p: /\btexting\b.*\bdriv/i, img: 'no-texting' },
  { t:1, p: /\b(cell ?phone|mobile phone)\b.*\bdriv/i, img: 'no-texting' },
  { t:1, p: /\bhandheld\b.*\b(device|phone)\b/i, img: 'no-texting' },
  { t:1, p: /\bdistracted driv/i, img: 'no-texting' },

  // EV / Electric vehicle
  { t:1, p: /\belectric (vehicle|car)\b/i, img: 'electric-car' },
  { t:1, p: /\bcharging station\b/i, img: 'ev-charging' },
  { t:1, p: /\bhybrid (vehicle|car)\b/i, img: 'electric-car' },
  { t:1, p: /\bEV\b.*\bcharg/i, img: 'ev-charging' },

  // Highway / Freeway
  { t:1, p: /\b(highway|freeway|expressway)\b.*\b(enter|exit|merg|ramp)\b/i, img: 'highway-road', neg: [/\bsign\b/i] },
  { t:1, p: /\bmerg(e|ing)\b.*\b(traffic|lane|highway|freeway)\b/i, img: 'highway-road' },
  { t:1, p: /\b(acceleration|deceleration) lane\b/i, img: 'highway-road' },

  // Intersection
  { t:1, p: /\buncontrolled intersection\b/i, img: 'intersection' },
  { t:1, p: /\bfour[- ]way (stop|intersection)\b/i, img: 'intersection' },

  // Roundabout (driving behavior, not sign)
  { t:1, p: /\broundabout\b/i, img: 'roundabout-diagram', neg: [/\bsign\b/i] },
  { t:1, p: /\btraffic circle\b/i, img: 'roundabout-diagram' },
  { t:1, p: /\brotary\b/i, img: 'roundabout-diagram' },

  // Parking
  { t:1, p: /\bparallel park/i, img: 'parking-meter' },
  { t:1, p: /\bparking meter\b/i, img: 'parking-meter' },

  // Fog / Visibility
  { t:1, p: /\bfog (light|lamp)\b/i, img: 'fog-light' },
  { t:1, p: /\bdriving in (fog|mist)\b/i, img: 'fog-light' },
  { t:1, p: /\bfoggy\b.*\b(condition|weather|visib)\b/i, img: 'fog-light' },

  // Airbag
  { t:1, p: /\bair ?bag\b/i, img: 'airbag' },

  // Tow truck
  { t:1, p: /\btow truck\b/i, img: 'tow-truck' },
  { t:1, p: /\btow(ed|ing) (a |your )?(vehicle|car)\b/i, img: 'tow-truck' },

  // Headlights / Low beam / Night driving
  { t:1, p: /\b(low|dim(med)?) beam\b/i, img: 'low-beam', neg: [/\bdashboard\b/i, /\bwarning\b/i] },
  { t:1, p: /\bheadlight\b/i, img: 'low-beam', neg: [/\bdashboard\b/i, /\bwarning\b/i, /\bsign\b/i] },
  { t:1, p: /\bnight driv/i, img: 'low-beam' },

  // Car crash / Accident
  { t:1, p: /\b(car|vehicle|traffic|auto) ?(crash|accident|collision)\b/i, img: 'car-crash' },
  { t:1, p: /\bhead[- ]on collision\b/i, img: 'car-crash' },
  { t:1, p: /\brear[- ]end (crash|collision)\b/i, img: 'car-crash' },

  // Crosswalk (not about sign)
  { t:1, p: /\bcrosswalk\b/i, img: 'crosswalk-diagram', neg: [/\bsign\b/i] },

  // Flat tire / Blowout
  { t:1, p: /\b(flat tire|tire blowout|blowout)\b/i, img: 'flat-tire' },
  { t:1, p: /\btire (failure|rupture|burst)\b/i, img: 'flat-tire' },

  // Speed (selective)
  { t:1, p: /\bspeeding\b/i, img: 'speedometer', neg: [/\bsign\b/i, /\bfine\b/i, /\bpenalty\b/i, /\bpoint/i, /\bticket\b/i] },
  { t:1, p: /\bspeedometer\b/i, img: 'speedometer' },

  // Lane departure / ADAS
  { t:1, p: /\blane (departure|keeping|assist)\b/i, img: 'lane-keeping' },
];

function regexMatch(q) {
  const text = q.question_text;
  const globalBlocked = GLOBAL_NEGATIVES.some(neg => neg.test(text));
  for (const rule of REGEX_RULES) {
    if (globalBlocked && !rule.t) continue; // thematic rules bypass global negatives
    if (!rule.p.test(text)) continue;
    if (rule.neg && rule.neg.some(n => n.test(text))) continue;
    return rule.img;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 2: AI matching — CONTEXT-AWARE
// ---------------------------------------------------------------------------

const AI_CANDIDATE_PATTERNS = [
  // Signs & shapes
  /\bsign\b/i, /\bsigns\b/i,
  /\bdiamond[- ]shaped\b/i, /\boctagon\b/i, /\bpentagon\b/i,
  // Traffic control
  /\broundabout\b/i, /\btraffic circle\b/i, /\brotary\b/i,
  /\bhand signal\b/i,
  /\btraffic light\b/i, /\btraffic signal\b/i,
  /\bflashing red\b/i, /\bflashing yellow\b/i,
  /\bgreen (light|arrow)\b/i, /\bred light\b/i,
  /\bintersection\b/i, /\bright.of.way\b/i,
  // Dashboard
  /\bdashboard\b/i, /\bwarning light\b/i, /\bindicator light\b/i,
  /\bcheck engine\b/i, /\boil pressure\b/i, /\btire pressure\b/i,
  /\bABS\b/, /\bTPMS\b/i,
  // Safety
  /\bseatbelt\b/i, /\bseat belt\b/i, /\bchild seat\b/i,
  /\bhelmet\b/i, /\bair ?bag\b/i,
  /\bschool bus\b/i, /\bschool zone\b/i,
  /\bcrosswalk\b/i, /\bcrossing\b/i,
  /\bhigh beam\b/i, /\bheadlight\b/i, /\blow beam\b/i,
  /\bfog (light|lamp)\b/i, /\bdriving in fog\b/i,
  // Motorcycle
  /\bmotorcycl/i, /\blane splitting\b/i, /\brider\b/i, /\briding\b/i,
  // Truck / CDL
  /\bCDL\b/i, /\bcommercial (vehicle|driver)\b/i,
  /\bair brake\b/i, /\bcoupling\b/i, /\btrailer\b/i,
  /\btanker\b/i, /\bhazmat\b/i, /\bcargo\b/i,
  /\bpre[- ]?trip\b/i, /\btruck\b/i,
  // DUI / Alcohol
  /\b(DUI|DWI|OUI)\b/i, /\balcohol\b/i, /\bBAC\b/i,
  /\bintoxicat/i, /\bimpaired\b/i, /\bdrunk\b/i,
  /\bopen container\b/i, /\bimplied consent\b/i,
  // Conditions
  /\bhydroplan/i, /\bskid/i, /\bwet road\b/i,
  /\btailgat/i, /\bfollowing distance\b/i,
  /\bblind spot\b/i, /\bmirror\b/i,
  // Emergency
  /\bemergency vehicle\b/i, /\bambulance\b/i,
  /\bfire (truck|engine)\b/i, /\bpolice\b/i,
  /\bsiren\b/i, /\bpulled over\b/i,
  // Crash / Accident
  /\bcrash\b/i, /\baccident\b/i, /\bcollision\b/i,
  // Texting / Distracted
  /\btexting\b/i, /\bcell ?phone\b/i, /\bdistracted\b/i,
  // EV / Modern
  /\belectric (vehicle|car)\b/i, /\bcharging station\b/i, /\bhybrid\b/i,
  // Other
  /\bflat tire\b/i, /\bblowout\b/i, /\btow truck\b/i,
  /\bhighway\b/i, /\bfreeway\b/i, /\bmerging\b/i,
  /\bparallel park/i, /\bparking\b/i,
  /\bnight driv/i, /\bfoggy\b/i,
  /\blane (departure|keeping)\b/i,
  /\bspeedometer\b/i, /\bspeeding\b/i,
  /\bbicycl/i, /\bcyclist\b/i,
];

const AI_DISQUALIFIERS = [
  /\bhow many (points|questions)\b/i,
  /\bfine\b.*\$\d/i,
  /\bpenalty\b.*\bpoints\b/i,
  /\brenewal\b/i,
  /\bsign of\b/i, /\bsigns of\b/i,
];

function isAiCandidate(q) {
  const text = q.question_text;
  for (const dis of AI_DISQUALIFIERS) {
    if (dis.test(text)) return false;
  }
  for (const pat of AI_CANDIDATE_PATTERNS) {
    if (pat.test(text)) return true;
  }
  return false;
}

function buildAiPrompt(questions, imageList) {
  const qList = questions.map(q => {
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).join(' | ');
    return `ID: ${q.id}\nQ: ${q.question_text}\nOptions: ${opts}`;
  }).join('\n\n');

  return `You are matching images to US DMV test questions. Two image categories:

TYPE A — Road signs, dashboard lights, hand signals:
Match ONLY when the question is ABOUT that specific sign/light/signal.

TYPE B — Thematic illustrations (motorcycle, school-bus, no-alcohol, semi-truck,
traffic-light, car-crash, police-car, ambulance, seatbelt, bicycle, hydroplaning,
blind-spot, following-distance, no-texting, electric-car, highway-road, etc.):
Match when the question is ON that topic. Broader matching OK — image adds visual context.

Available images:
${imageList}

CRITICAL RULES:
1. "stop" in "stopping distance" → NONE (about braking, not the stop sign)
2. "What does a stop sign mean?" → stop (TYPE A: about the sign)
3. "When should you use high beams?" → low-beam (TYPE B: headlight topic)
4. "What is the BAC limit?" → no-alcohol (TYPE B: DUI topic)
5. "What should motorcycle riders wear?" → motorcycle-helmet (TYPE B: motorcycle safety)
6. "What does a school zone sign look like?" → school-zone (TYPE A: about the sign)
7. "When must you stop for a school bus?" → school-bus (TYPE B: school bus topic)
8. "How many questions are on the test?" → none (test logistics)
9. Image must NOT reveal the answer. "What color is a stop sign?" → NONE
10. If UNSURE → "none". False negatives beat false positives.

Output ONLY JSON: [{"id":"<id>","image":"<image-id-or-none>","reason":"brief"}]

Questions:
${qList}`;
}

function buildVerifyPrompt(matches, imageList) {
  const mList = matches.map(m =>
    `ID: ${m.id}\nQ: ${m.text}\nImage: ${m.image} (${IMAGE_CATALOG[m.image] || m.image})\nSource: ${m.source}`
  ).join('\n\n');

  return `You are a strict adversarial verifier for image-to-question matches.
Two categories: road signs (must be ABOUT the sign) and thematic illustrations (topic match OK).

Images:
${imageList}

REJECT if:
- Sign image matched to question NOT about that sign (keyword coincidence)
- "sign" used figuratively ("sign of fatigue")
- Image reveals the answer to the question
- Topic is completely wrong (e.g., motorcycle image on a parking question)
- Question is purely about test logistics, fees, or document requirements

KEEP if:
- Sign image: question is about that sign's meaning, shape, or required action
- Thematic image: question is genuinely about that topic (DUI, motorcycles, school buses, etc.)
- Image adds visual context without revealing the answer

Output ONLY JSON: [{"id":"<id>","verdict":"keep"|"reject","reason":"brief"}]

Matches:
${mList}`;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { /* */ }
  }
  return { regex: {}, ai: {}, verified: {} };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const images = getAvailableImages();
  console.log('='.repeat(60));
  console.log('  expand-images: context-aware image matching');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Available images: ${images.length}`);
  console.log('='.repeat(60));

  const imageListStr = images
    .filter(id => IMAGE_CATALOG[id])
    .map(id => `- ${id}: ${IMAGE_CATALOG[id]}`)
    .join('\n');

  // Load EN questions without images
  console.log('\n=== Loading EN questions without images ===\n');
  const questions = await supabaseGetAll('questions',
    'language=eq.en&image_url=is.null&select=id,question_text,option_a,option_b,option_c,option_d&order=id');
  console.log(`  Questions without images: ${questions.length}`);

  const progress = loadProgress();
  const qMap = {};
  for (const q of questions) qMap[q.id] = q;

  // --- Phase 1: Regex ---
  console.log('\n=== Phase 1: Regex matching ===\n');
  const regexMatches = {};
  for (const q of questions) {
    if (progress.verified[q.id]) continue;
    const m = regexMatch(q);
    if (m && images.includes(m)) {
      regexMatches[q.id] = { image: m, source: 'regex' };
    }
  }
  console.log(`  Regex matches: ${Object.keys(regexMatches).length}`);

  // --- Phase 2: AI ---
  console.log('\n=== Phase 2: AI matching ===\n');
  const aiCandidates = questions.filter(q =>
    !regexMatches[q.id] && !progress.verified[q.id] && !progress.ai[q.id] && isAiCandidate(q)
  );
  console.log(`  AI candidates: ${aiCandidates.length}`);

  const ai = { ...progress.ai };
  let aiDone = 0, aiHit = 0;

  for (let i = 0; i < aiCandidates.length; i += AI_BATCH_SIZE) {
    const batch = aiCandidates.slice(i, i + AI_BATCH_SIZE);
    try {
      const resp = await callClaude(buildAiPrompt(batch, imageListStr));
      const jm = resp.match(/\[[\s\S]*\]/);
      if (jm) {
        for (const r of JSON.parse(jm[0])) {
          if (r.image && r.image !== 'none' && images.includes(r.image)) {
            ai[r.id] = { image: r.image, source: 'ai', reason: r.reason };
            aiHit++;
          } else {
            ai[r.id] = { image: null };
          }
        }
      }
    } catch (e) {
      console.log(`\n  Error: ${e.message}`);
    }
    aiDone += batch.length;
    process.stdout.write(`\r  AI: ${aiDone}/${aiCandidates.length} | matched: ${aiHit}`);
    if (aiDone % 40 === 0) { progress.ai = ai; saveProgress(progress); }
    await sleep(500);
  }
  console.log();
  progress.ai = ai;
  saveProgress(progress);

  // Combine
  const allMatches = {};
  for (const [id, m] of Object.entries(regexMatches)) allMatches[id] = m;
  for (const [id, m] of Object.entries(ai)) {
    if (m.image && !allMatches[id]) allMatches[id] = m;
  }

  const matchList = Object.entries(allMatches)
    .filter(([, m]) => m.image)
    .map(([id, m]) => ({ id, image: m.image, source: m.source, text: qMap[id]?.question_text || '' }));

  console.log(`\n  Total to verify: ${matchList.length}`);

  // --- Phase 3: Verification ---
  console.log('\n=== Phase 3: Verification ===\n');
  const verified = { ...progress.verified };
  const toVerify = matchList.filter(m => !verified[m.id]);
  console.log(`  Already verified: ${Object.keys(verified).length}, remaining: ${toVerify.length}`);

  let vDone = 0, kept = 0, rejected = 0;
  for (let i = 0; i < toVerify.length; i += VERIFY_BATCH_SIZE) {
    const batch = toVerify.slice(i, i + VERIFY_BATCH_SIZE);
    try {
      const resp = await callClaude(buildVerifyPrompt(batch, imageListStr));
      const jm = resp.match(/\[[\s\S]*\]/);
      if (jm) {
        for (const r of JSON.parse(jm[0])) {
          const m = allMatches[r.id];
          if (r.verdict === 'keep' && m) {
            verified[r.id] = { image: m.image, verdict: 'keep' };
            kept++;
          } else {
            verified[r.id] = { image: null, verdict: 'reject' };
            rejected++;
          }
        }
      }
      for (const m of batch) {
        if (!verified[m.id]) {
          // Default: keep regex, skip AI on error
          if (m.source === 'regex') {
            verified[m.id] = { image: m.image, verdict: 'keep' };
            kept++;
          } else {
            verified[m.id] = { image: null, verdict: 'reject' };
            rejected++;
          }
        }
      }
    } catch (e) {
      console.log(`\n  Verify error: ${e.message}`);
      for (const m of batch) {
        if (!verified[m.id]) {
          verified[m.id] = m.source === 'regex'
            ? { image: m.image, verdict: 'keep' }
            : { image: null, verdict: 'reject' };
          m.source === 'regex' ? kept++ : rejected++;
        }
      }
    }
    vDone += batch.length;
    process.stdout.write(`\r  Verify: ${vDone}/${toVerify.length} | keep:${kept} reject:${rejected}`);
    if (vDone % 60 === 0) { progress.verified = verified; saveProgress(progress); }
    await sleep(500);
  }
  console.log();
  progress.verified = verified;
  saveProgress(progress);

  // --- Phase 4: Results ---
  const finals = Object.entries(verified)
    .filter(([, v]) => v.verdict === 'keep' && v.image)
    .map(([id, v]) => ({ id, image: v.image }));

  console.log('\n=== Results ===\n');

  const byImg = {};
  for (const m of finals) byImg[m.image] = (byImg[m.image] || 0) + 1;
  Object.entries(byImg).sort((a, b) => b[1] - a[1]).forEach(([img, n]) => console.log(`  ${img}: ${n}`));

  const existing = await supabaseGetAll('questions', 'language=eq.en&image_url=not.is.null&select=id');
  const totalQ = existing.length + questions.length;
  const totalAfter = existing.length + finals.length;
  console.log(`\n  Current: ${existing.length}/${totalQ} (${(existing.length/totalQ*100).toFixed(1)}%)`);
  console.log(`  New: ${finals.length}`);
  console.log(`  After: ${totalAfter}/${totalQ} (${(totalAfter/totalQ*100).toFixed(1)}%)`);

  if (DRY_RUN) {
    console.log('\n  [dry-run] No DB writes');
    fs.writeFileSync(path.join(__dirname, '..', '.expand-images-report.json'),
      JSON.stringify({ matches: finals, byImg, pct: (totalAfter/totalQ*100).toFixed(1) }, null, 2));
    console.log('  Report: .expand-images-report.json');
    return;
  }

  // Write EN
  console.log('\n  Writing EN...');
  let w = 0;
  for (const m of finals) {
    try {
      await supabasePatch('questions', `id=eq.${m.id}`, { image_url: `/signs/${m.image}.png` });
      w++;
      if (w % 100 === 0) process.stdout.write(`\r  EN: ${w}/${finals.length}`);
    } catch (e) { console.log(`\n  Err ${m.id}: ${e.message}`); }
  }
  console.log(`\r  EN: ${w}/${finals.length}`);

  // Propagate to other langs by position
  console.log('\n  Propagating...');
  for (const lang of ['ru', 'es', 'zh', 'ua']) {
    const langQs = await supabaseGetAll('questions',
      `language=eq.${lang}&select=id,state,category&image_url=is.null&order=id`);
    const enImgs = await supabaseGetAll('questions',
      'language=eq.en&image_url=not.is.null&select=id,state,category,image_url&order=id');

    const enG = {}, lgG = {};
    for (const q of enImgs) { const k = `${q.state}|${q.category}`; (enG[k] = enG[k] || []).push(q); }
    for (const q of langQs) { const k = `${q.state}|${q.category}`; (lgG[k] = lgG[k] || []).push(q); }

    let lw = 0;
    for (const [k, eqs] of Object.entries(enG)) {
      const lqs = lgG[k];
      if (!lqs) continue;
      for (let j = 0; j < Math.min(eqs.length, lqs.length); j++) {
        if (eqs[j].image_url) {
          try { await supabasePatch('questions', `id=eq.${lqs[j].id}`, { image_url: eqs[j].image_url }); lw++; } catch {}
        }
      }
    }
    console.log(`  ${lang}: ${lw}`);
  }

  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
