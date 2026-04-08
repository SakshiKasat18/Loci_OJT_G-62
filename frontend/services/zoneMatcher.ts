
// ===============================
// 📍 Zone Matcher - Calibrated Version (Loci)
// ===============================

// -------- Types --------
type AccessPoint = {
  BSSID: string;
  level: number;
};

type Scan = AccessPoint[];

type ZoneMap = {
  [zoneName: string]: {
    [bssid: string]: number;
  };
};

// -------- State --------
let scanHistory: Scan[] = [];
let currentZone: string | null = null;
let currentScore: number = 0;
let scanCount: number = 0;

// -------- Tunable Params --------
const MAX_SCAN_HISTORY = 5;
const IGNORE_FIRST_N_SCANS = 2;
const SWITCH_THRESHOLD = 0.12;
const DECAY_FACTOR = 0.92;
const MIN_CONFIDENCE = 0.15;

// -------- NEW: Calibration --------
const AP_WEIGHT_OVERRIDES: Record<string, number> = {
  'a8:ba:25:e1:ff:20': 0.05,
  'a8:ba:25:e1:ff:21': 0.15,
  'a8:ba:25:e1:ff:22': 0.15,
  'a8:ba:25:e1:52:60': 0.2,
};

const LOW_EXCLUSIVITY_CAP = 0.45;
const MISSING_AP_PENALTY = 0.05;

// -------- Utility --------
function normalizeScan(scan: Scan): Scan {
  return scan.map((ap) => ({
    BSSID: ap.BSSID.toLowerCase().trim(),
    level: ap.level,
  }));
}

function getAPWeight(bssid: string): number {
  return AP_WEIGHT_OVERRIDES[bssid] ?? 1;
}

// -------- NEW: Exclusivity --------
function countExclusiveAPs(scan: Scan, zones: ZoneMap, targetZone: string): number {
  let count = 0;

  for (const ap of scan) {
    let seenIn = 0;
    let owner: string | null = null;

    for (const zone in zones) {
      if (zones[zone][ap.BSSID] !== undefined) {
        seenIn++;
        owner = zone;
      }
    }

    if (seenIn === 1 && owner === targetZone) {
      count++;
    }
  }

  return count;
}

// -------- Improved Scoring --------
function scoreZone(scan: Scan, zoneFingerprint: Record<string, number>): number {
  let score = 0;
  let weightSum = 0;
  let matchCount = 0;

  for (const ap of scan) {
    if (zoneFingerprint[ap.BSSID] !== undefined) {
      const expected = zoneFingerprint[ap.BSSID];
      const diff = Math.abs(ap.level - expected);

      const baseScore = Math.max(0, 1 - diff / 50);
      const weight = getAPWeight(ap.BSSID);

      score += baseScore * weight;
      weightSum += weight;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  let finalScore = score / weightSum;

  // -------- Missing AP penalty --------
  const totalAPs = Object.keys(zoneFingerprint).length;
  const missing = totalAPs - matchCount;
  const missingFraction = missing / totalAPs;

  const penalty = Math.min(0.5, missingFraction * missingFraction * MISSING_AP_PENALTY * 20);

  finalScore = Math.max(0, finalScore - penalty);

  return finalScore;
}

// -------- Utility --------
function averageScan(scans: Scan[]): Scan {
  const apMap: Record<string, { total: number; count: number }> = {};

  scans.forEach((scan) => {
    scan.forEach((ap) => {
      if (!apMap[ap.BSSID]) {
        apMap[ap.BSSID] = { total: 0, count: 0 };
      }

      apMap[ap.BSSID].total += ap.level;
      apMap[ap.BSSID].count += 1;
    });
  });

  return Object.entries(apMap).map(([BSSID, data]) => ({
    BSSID,
    level: data.total / data.count,
  }));
}

// ===============================
// 🧠 MAIN FUNCTION
// ===============================
export function matchZone(scan: Scan, zones: ZoneMap): {
  zone: string | null;
  confidence: number;
} {
  scanCount++;

  const normalizedScan = normalizeScan(scan);

  // -------- Ignore early scans --------
  if (scanCount <= IGNORE_FIRST_N_SCANS) {
    return { zone: null, confidence: 0 };
  }

  // -------- History --------
  scanHistory.push(normalizedScan);
  if (scanHistory.length > MAX_SCAN_HISTORY) {
    scanHistory.shift();
  }

  const stableScan = averageScan(scanHistory);

  // -------- Score zones --------
  let bestZone: string | null = null;
  let bestScore = 0;

  for (const zoneName in zones) {
    const zoneScore = scoreZone(stableScan, zones[zoneName]);

    if (zoneScore > bestScore) {
      bestScore = zoneScore;
      bestZone = zoneName;
    }
  }

  // -------- Apply exclusivity --------
  if (bestZone) {
    const exclusiveCount = countExclusiveAPs(stableScan, zones, bestZone);

    if (exclusiveCount === 0) {
      bestScore *= LOW_EXCLUSIVITY_CAP;
    } else if (exclusiveCount === 1) {
      bestScore *= 0.75;
    }
  }

  // -------- Decay --------
  currentScore *= DECAY_FACTOR;

  // -------- Switching --------
  if (!currentZone) {
    currentZone = bestZone;
    currentScore = bestScore;
  } else {
    const shouldSwitch =
      bestZone !== currentZone &&
      bestScore > currentScore + SWITCH_THRESHOLD;

   if (shouldSwitch) {
  currentZone = bestZone;
  currentScore = bestScore;
} else {
  if (bestZone === currentZone) {
    // Stay in same zone → allow confidence to recover
    currentScore = Math.max(currentScore, bestScore);
  } else {
    // Different zone but not strong enough → dampen
    currentScore = Math.max(currentScore, bestScore * 0.9);
  }
}
  }

  // -------- Drop weak --------
  if (currentScore < MIN_CONFIDENCE) {
    currentZone = null;
  }

  console.log({
    bestZone,
    bestScore: Number(bestScore.toFixed(3)),
    currentZone,
    currentScore: Number(currentScore.toFixed(3)),
  });

  return {
    zone: currentZone,
    confidence: Number(currentScore.toFixed(3)),
  };
}
