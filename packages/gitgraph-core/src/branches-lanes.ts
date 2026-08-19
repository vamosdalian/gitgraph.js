import { Branch } from "./branch";
import { BranchesOrder } from "./branches-order";
import { BranchesPaths, Coordinate } from "./branches-paths";

export { BranchesLanes };

interface BranchInterval<TNode> {
  branch: Branch<TNode>;
  start: number;
  end: number;
  occupiesStart: boolean;
  occupiesEnd: boolean;
  priority: number;
}

/**
 * Assign reusable lanes to branch paths.
 *
 * Branch identity/order stays independent from the assigned lane. Intervals are
 * derived from the graph axis of rendered paths, never from commit timestamps.
 */
class BranchesLanes<TNode> {
  private lanes = new Map<Branch["name"], number>();

  public constructor(
    branchesPaths: BranchesPaths<TNode>,
    branchesOrder: BranchesOrder<TNode>,
    isGraphVertical: boolean,
    isGraphReverse: boolean,
    getBranchCoordinate: (branchName: Branch["name"]) => number,
  ) {
    const graphTip = this.getGraphTip(
      branchesPaths,
      isGraphVertical,
      isGraphReverse,
    );
    const intervals = Array.from(branchesPaths).map(([branch, paths]) => {
      const branchCoordinate = getBranchCoordinate(branch.name);
      const points: Coordinate[] = [];
      paths.forEach((path) => points.push(...path));
      const pointsOnLane = points.filter((point) => {
        const laneCoordinate = isGraphVertical ? point.x : point.y;
        return laneCoordinate === branchCoordinate;
      });
      const graphCoordinates = points.map((point) =>
        isGraphVertical ? point.y : point.x,
      );
      const laneGraphCoordinates = pointsOnLane.map((point) =>
        isGraphVertical ? point.y : point.x,
      );
      const start = Math.min(...graphCoordinates);
      const end = Math.max(...graphCoordinates);

      const interval = {
        branch,
        start,
        end,
        occupiesStart: laneGraphCoordinates.includes(start),
        occupiesEnd: laneGraphCoordinates.includes(end),
        priority: branchesOrder.get(branch.name),
      };

      if (
        this.isOpenPath(
          points,
          pointsOnLane,
          branchCoordinate,
          isGraphVertical,
          isGraphReverse,
        )
      ) {
        interval.start = Math.min(interval.start, graphTip);
        interval.end = Math.max(interval.end, graphTip);
        if (graphTip === interval.start) interval.occupiesStart = true;
        if (graphTip === interval.end) interval.occupiesEnd = true;
      }

      return interval;
    });

    this.assignLanes(intervals);
  }

  /** Return the reusable lane assigned to the given branch. */
  public get(branchName: Branch["name"]): number {
    return this.lanes.get(branchName) ?? 0;
  }

  private assignLanes(intervals: Array<BranchInterval<TNode>>): void {
    const sortedIntervals = intervals.sort(
      (a, b) => a.start - b.start || a.priority - b.priority || a.end - b.end,
    );
    const active: Array<{
      end: number;
      lane: number;
      occupiesEnd: boolean;
    }> = [];
    const availableLanes: number[] = [];
    const branchesByLane: Array<Array<BranchInterval<TNode>>> = [];

    sortedIntervals.forEach((interval) => {
      for (let i = active.length - 1; i >= 0; i--) {
        // Intervals are inclusive. Branches may only share a touching row when
        // both paths are on the parent lane there (a merge immediately
        // followed by the next fork), so no node or same-lane segment overlaps.
        const intervalsAreSeparate = active[i].end < interval.start;
        const shareOnlyParentConnection =
          active[i].end === interval.start &&
          !active[i].occupiesEnd &&
          !interval.occupiesStart;
        if (intervalsAreSeparate || shareOnlyParentConnection) {
          availableLanes.push(active[i].lane);
          active.splice(i, 1);
        }
      }
      availableLanes.sort((a, b) => a - b);

      const lane =
        availableLanes.length > 0
          ? (availableLanes.shift() as number)
          : branchesByLane.length;
      active.push({
        end: interval.end,
        lane,
        occupiesEnd: interval.occupiesEnd,
      });
      branchesByLane[lane] = branchesByLane[lane] || [];
      branchesByLane[lane].push(interval);
    });

    // Lane allocation above minimizes the lane count. Reorder whole lanes by
    // branch priority afterwards so compareBranchesOrder still controls which
    // side contains its highest-priority branches without breaking reuse.
    const remappedLanes = branchesByLane
      .map((branches, lane) => ({
        lane,
        priority: Math.min(...branches.map(({ priority }) => priority)),
      }))
      .sort((a, b) => a.priority - b.priority || a.lane - b.lane);
    const laneRemap = new Map(
      remappedLanes.map(({ lane }, remappedLane) => [lane, remappedLane]),
    );

    branchesByLane.forEach((branches, lane) => {
      branches.forEach(({ branch }) => {
        this.lanes.set(branch.name, laneRemap.get(lane) as number);
      });
    });
  }

  private isOpenPath(
    points: Coordinate[],
    pointsOnLane: Coordinate[],
    branchCoordinate: number,
    isGraphVertical: boolean,
    isGraphReverse: boolean,
  ): boolean {
    if (pointsOnLane.length === 0) return false;

    const offLanePoints = points.filter((point) => {
      const laneCoordinate = isGraphVertical ? point.x : point.y;
      return laneCoordinate !== branchCoordinate;
    });
    if (offLanePoints.length === 0) return true;

    const newestIsMaximum = isGraphVertical ? isGraphReverse : !isGraphReverse;
    const newest = (coordinates: number[]) =>
      newestIsMaximum ? Math.max(...coordinates) : Math.min(...coordinates);
    const laneTip = newest(
      pointsOnLane.map((point) => (isGraphVertical ? point.y : point.x)),
    );
    const connectionTip = newest(
      offLanePoints.map((point) => (isGraphVertical ? point.y : point.x)),
    );

    return newestIsMaximum ? laneTip > connectionTip : laneTip < connectionTip;
  }

  private getGraphTip(
    branchesPaths: BranchesPaths<TNode>,
    isGraphVertical: boolean,
    isGraphReverse: boolean,
  ): number {
    const coordinates: number[] = [];
    branchesPaths.forEach((paths) => {
      paths.forEach((path) => {
        path.forEach((point) => {
          coordinates.push(isGraphVertical ? point.y : point.x);
        });
      });
    });

    const newestIsMaximum = isGraphVertical ? isGraphReverse : !isGraphReverse;
    return newestIsMaximum
      ? Math.max(...coordinates)
      : Math.min(...coordinates);
  }
}
