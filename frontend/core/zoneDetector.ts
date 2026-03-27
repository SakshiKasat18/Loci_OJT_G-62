export function getScore(current: any, stored: any) {
  let score = 0;

  for (let key in stored) {
    if (current[key] !== undefined) {
      score += Math.abs(current[key] - stored[key]);
    } else {
      score += 100;
    }
  }

  return score;
}

export function detectZone(current: any, fingerprints: any) {
  let bestZone = null;
  let bestScore = Infinity;

  const scores: any[] = [];

  for (let zone in fingerprints) {
    const score = getScore(current, fingerprints[zone]);

    scores.push({ zone, score });

    if (score < bestScore) {
      bestScore = score;
      bestZone = zone;
    }
  }

  scores.sort((a, b) => a.score - b.score);

  return { bestZone, scores };
}