export function canMove(current: string, next: string, connections: any) {
  return connections[current]?.includes(next);
}