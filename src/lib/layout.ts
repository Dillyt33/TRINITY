export interface Span {
  id: string;
  start: number;
  end: number;
}

export interface Placement {
  col: number;
  cols: number;
}

/** Side-by-side columns for overlapping blocks, like a calendar day view. */
export function layoutColumns(spans: Span[]): Map<string, Placement> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, Placement>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = Math.max(1, colEnds.length);
    for (const c of cluster) result.set(c.id, { col: c.col, cols });
    cluster = [];
    colEnds = [];
  };

  for (const s of sorted) {
    if (s.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= s.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(s.end);
    } else {
      colEnds[col] = s.end;
    }
    cluster.push({ id: s.id, col });
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  flush();
  return result;
}

/** Earliest start ≥ `after` where a block of `length` minutes fits without overlapping. */
export function findFreeSlot(
  spans: Pick<Span, 'start' | 'end'>[],
  length: number,
  after: number,
  dayStart: number,
  dayEnd: number,
  step = 15,
): number | null {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let t = Math.max(dayStart, Math.ceil(after / step) * step);
  while (t + length <= dayEnd) {
    const clash = sorted.find((s) => s.start < t + length && s.end > t);
    if (!clash) return t;
    t = Math.ceil(clash.end / step) * step;
  }
  return null;
}
