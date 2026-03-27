type Scan = {
  BSSID: string;
  level: number;
};

type ZoneMap = {
  [zoneName: string]: {
    [bssid: string]: number;
  };
};

// 🧠 State
let scanHistory: Scan[][] = [];
let zoneHistory: string[] = [];
let currentZone: string | null = null;

// ⚙️ Tunable params
const MAX_SCAN_HISTORY = 5;
const MAX_ZONE_HISTORY = 5;
const SWITCH_THRESHOLD = 10;

const MISSING_PENALTY = 8;
const UNIQUE_WEIGHT = 2;
const LOW_CONFIDENCE = 5;

export function matchZone(scan: Scan[], zones: ZoneMap) {
  // -------------------------------
  // 1. Normalize scan
  // -------------------------------
  const normalizedScan = scan.map((ap) => ({
    BSSID: ap.BSSID.toLowerCase().trim(),
    level: ap.level,
  }));

  // -------------------------------
  // 2. Store scan history
  // -------------------------------
  scanHistory.push(normalizedScan);
  if (scanHistory.length > MAX_SCAN_HISTORY) {
    scanHistory.shift();
  }

  // -------------------------------
  // 3. Smooth scans (average)
  // -------------------------------
  const averagedScan: { [bssid: string]: number[] } = {};

  for (const pastScan of scanHistory) {
    for (const ap of pastScan) {
      if (!averagedScan[ap.BSSID]) {
        averagedScan[ap.BSSID] = [];
      }
      averagedScan[ap.BSSID].push(ap.level);
    }
  }

  const smoothedScan: Scan[] = Object.keys(averagedScan).map((bssid) => {
    const levels = averagedScan[bssid];
    const avg =
      levels.reduce((sum, val) => sum + val, 0) / levels.length;

    return {
      BSSID: bssid,
      level: Math.round(avg),
    };
  });

  // -------------------------------
  // 4. Score zones
  // -------------------------------
  let bestZone: string | null = null;
  let bestScore = -Infinity;
  let secondBestScore = -Infinity;
  let currentZoneScore = -Infinity;

  for (const zoneName in zones) {
    const zone = zones[zoneName];

    let score = 0;
    let matches = 0;

    // -------------------------------
    // 4A. Positive matching
    // -------------------------------
    for (const ap of smoothedScan) {
      const key = ap.BSSID;

      if (zone[key] !== undefined) {
        const expected = zone[key];
        const diff = Math.abs(expected - ap.level);

        let weight = expected > -60 ? 1.5 : 1;

        const strengthBoost =
          ap.level > -55 ? 1.5 :
          ap.level > -65 ? 1.2 : 1;

        const appearsElsewhere = Object.values(zones).some(
          (z) => z !== zone && z[key] !== undefined
        );

        if (!appearsElsewhere) {
          weight *= UNIQUE_WEIGHT;
        }

        // 🔥 Penalize unrealistic signal strength
        if (ap.level > expected + 10) {
          score -= 10;
        }

        const similarity = Math.max(0, 100 - diff);
        const cappedSimilarity = Math.min(similarity, 80);

        score += cappedSimilarity * weight * strengthBoost;
        matches++;
      }
    }

    // -------------------------------
    // 4B. Missing AP penalty
    // -------------------------------
    for (const bssid in zone) {
      const expected = zone[bssid];

      const found = smoothedScan.find((ap) => ap.BSSID === bssid);

      if (!found && expected > -65) {
        score -= MISSING_PENALTY;
      }
    }

    // -------------------------------
    // 4C. Soft penalty for low matches
    // -------------------------------
    if (matches < 3) {
      score *= 0.6;
    }

    const finalScore = score / (matches || 1);

    if (zoneName === currentZone) {
      currentZoneScore = finalScore;
    }

    if (finalScore > bestScore) {
      secondBestScore = bestScore;
      bestScore = finalScore;
      bestZone = zoneName;
    } else if (finalScore > secondBestScore) {
      secondBestScore = finalScore;
    }
  }

  // -------------------------------
  // 5. No match fallback
  // -------------------------------
  if (!bestZone) {
    return {
      zone: currentZone || "unknown",
      score: 0,
      unstable: true,
    };
  }

  // -------------------------------
  // 6. Confidence check (ANTI-STUCK)
  // -------------------------------
  const confidence = bestScore - secondBestScore;

  if (confidence < LOW_CONFIDENCE) {
    // 🔥 reset system if unsure
    zoneHistory = [];
    currentZone = null;

    return {
      zone: "unknown",
      score: Math.round(bestScore),
      unstable: true,
    };
  }

  // -------------------------------
  // 7. Hysteresis (only if stable)
  // -------------------------------
  if (
    currentZone &&
    bestZone !== currentZone &&
    bestScore < currentZoneScore + SWITCH_THRESHOLD
  ) {
    bestZone = currentZone;
  }

  // -------------------------------
  // 8. Zone voting
  // -------------------------------
  zoneHistory.push(bestZone);
  if (zoneHistory.length > MAX_ZONE_HISTORY) {
    zoneHistory.shift();
  }

  const freq: { [zone: string]: number } = {};
  for (const z of zoneHistory) {
    freq[z] = (freq[z] || 0) + 1;
  }

  let votedZone = bestZone;
  let maxVotes = 0;

  for (const z in freq) {
    if (freq[z] > maxVotes) {
      maxVotes = freq[z];
      votedZone = z;
    }
  }

  // -------------------------------
  // 9. Update state
  // -------------------------------
  currentZone = votedZone;

  return {
    zone: votedZone,
    score: Math.round(bestScore),
    confidence: Math.round(confidence),
  };
}