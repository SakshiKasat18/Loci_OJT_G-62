type AccessPoint = { BSSID: string; level: number };
type Scan = AccessPoint[];
type ZoneMap = { [zoneName: string]: { [bssid: string]: number } };

// -------- Tunable Params --------
const MAX_SCAN_HISTORY = 3;
const IGNORE_FIRST_N_SCANS = 1;

const MIN_CONFIDENCE = 0.05;
const LIVE_SCAN_BLEND = 0.7;

// -------- State --------
let scanHistory: Scan[] = [];
let currentZone: string | null = null;
let currentScore: number = 0;
let scanCount: number = 0;

// -------- Utility --------
function normalizeScan(scan: Scan): Scan {
  return scan.map((ap) => ({
    BSSID: ap.BSSID.toLowerCase().trim(),
    level: ap.level,
  }));
}

export function resetMatcher() {
  scanHistory = [];
  currentZone = null;
  currentScore = 0;
  scanCount = 0;

  console.log("🧠 Matcher reset");
}

function weightedAverageScan(scans: Scan[]): Scan {
  const apMap: Record<string, { total: number; weightSum: number }> = {};

  scans.forEach((scan, idx) => {
    const age = scans.length - 1 - idx;
    const w = Math.pow(0.6, age);

    scan.forEach((ap) => {
      if (!apMap[ap.BSSID]) {
        apMap[ap.BSSID] = { total: 0, weightSum: 0 };
      }

      apMap[ap.BSSID].total += ap.level * w;
      apMap[ap.BSSID].weightSum += w;
    });
  });

  return Object.entries(apMap).map(([BSSID, data]) => ({
    BSSID,
    level: data.total / data.weightSum,
  }));
}

function blendScans(liveScan: Scan, historyScan: Scan): Scan {
  const apMap: Record<string, number> = {};

  for (const ap of historyScan) {
    apMap[ap.BSSID] = ap.level * (1 - LIVE_SCAN_BLEND);
  }

  for (const ap of liveScan) {
    apMap[ap.BSSID] =
      (apMap[ap.BSSID] ?? ap.level * (1 - LIVE_SCAN_BLEND)) +
      ap.level * LIVE_SCAN_BLEND;
  }

  return Object.entries(apMap).map(([BSSID, level]) => ({
    BSSID,
    level,
  }));
}

// 🔥 SIMPLE scoring (NO weights, NO penalties)
function scoreZone(scan: Scan, fingerprint: Record<string, number>): number {
  let score = 0;
  let matchCount = 0;

  for (const ap of scan) {
    if (fingerprint[ap.BSSID] !== undefined) {
      const expected = fingerprint[ap.BSSID];
      const diff = Math.abs(expected - ap.level);

      const similarity = Math.max(0, 1 - diff / 50);

      score += similarity;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  return score / matchCount;
}

function getBestZones(scan: Scan, zones: ZoneMap) {
  const scores: Record<string, number> = {};

  let bestZone: string | null = null;
  let secondZone: string | null = null;

  let bestScore = 0;
  let secondScore = 0;

  for (const zoneName in zones) {
    const s = scoreZone(scan, zones[zoneName]);
    scores[zoneName] = s;

    if (s > bestScore) {
      secondScore = bestScore;
      secondZone = bestZone;

      bestScore = s;
      bestZone = zoneName;
    } else if (s > secondScore) {
      secondScore = s;
      secondZone = zoneName;
    }
  }

  console.log("ZONE SCORES:", scores);

  return {
    bestZone,
    secondZone,
    bestScore,
    secondScore,
  };
}

// ===============================
// 🧠 MAIN FUNCTION
// ===============================
export function matchZone(scan: Scan, zones: ZoneMap) {
  scanCount++;

  const liveScan = normalizeScan(scan);

  if (scanCount <= IGNORE_FIRST_N_SCANS) {
    scanHistory.push(liveScan);
    return { zone: null, confidence: 0 };
  }

  // -------- History --------
  scanHistory.push(liveScan);
  if (scanHistory.length > MAX_SCAN_HISTORY) {
    scanHistory.shift();
  }

  const historyScan = weightedAverageScan(scanHistory);
  const stableScan = blendScans(liveScan, historyScan);

  // -------- Get best zones --------
  const {
    bestZone,
    secondZone,
    bestScore,
    secondScore,
  } = getBestZones(stableScan, zones);

  // -------- Simple selection --------
  currentZone = bestZone;
  currentScore = bestScore;

  // -------- Final cleanup --------
  if (currentScore < MIN_CONFIDENCE) {
    currentZone = null;
    currentScore = 0;
  }

  console.log({
    bestZone,
    secondZone,
    chosen: currentZone,
    confidence: +currentScore.toFixed(3),
  });

  return {
    zone: currentZone,
    confidence: +currentScore.toFixed(3),
  };
}