import { GraphLine, GraphSymbol } from "./types";

export default connectBranchCommits;

function connectBranchCommits(branchColor: string, line: GraphLine): GraphLine {
  const commitPoints = line.reduce<number[]>((points, { value }, index) => {
    if (value === GraphSymbol.Commit) points.push(index);
    return points;
  }, []);

  const branchPaths = commitPoints
    .slice(1)
    .map((end, index) => [commitPoints[index], end]);

  return line.map((cell, index) =>
    branchPaths.some(isInBranchPath(index))
      ? { value: GraphSymbol.Branch, color: branchColor }
      : cell,
  );
}

function isInBranchPath(index: number): (path: number[]) => boolean {
  return ([start, end]) => index >= start + 1 && index < end;
}
