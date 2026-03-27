let candidate: string | null = null;
let count = 0;

export function getStableZone(detected: string) {
  if (detected === candidate) {
    count++;
  } else {
    candidate = detected;
    count = 1;
  }

  if (count >= 3) {
    return candidate;
  }

  return null;
}