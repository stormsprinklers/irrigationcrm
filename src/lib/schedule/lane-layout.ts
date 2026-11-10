export type ScheduleLaneLayout<T> = {
  job: T;
  lane: number;
  laneCount: number;
};

export function assignScheduleLanes<T extends { startAt: string; endAt: string }>(
  jobs: T[]
): ScheduleLaneLayout<T>[] {
  const sorted = [...jobs].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const layouts: ScheduleLaneLayout<T>[] = [];
  let active: Array<{ lane: number; end: number }> = [];
  let clusterIndexes: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  let clusterLaneCount = 0;

  function finishCluster() {
    for (const index of clusterIndexes) layouts[index].laneCount = clusterLaneCount;
    clusterIndexes = [];
    clusterLaneCount = 0;
  }

  for (const job of sorted) {
    const start = new Date(job.startAt).getTime();
    const end = new Date(job.endAt).getTime();

    if (clusterIndexes.length && start >= clusterEnd) {
      finishCluster();
      active = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    }

    active = active.filter((entry) => entry.end > start);
    const usedLanes = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;

    const index = layouts.length;
    layouts.push({ job, lane, laneCount: 1 });
    clusterIndexes.push(index);
    active.push({ lane, end });
    clusterEnd = Math.max(clusterEnd, end);
    clusterLaneCount = Math.max(clusterLaneCount, lane + 1);
  }

  finishCluster();
  return layouts;
}
