import { GitgraphCore, Commit } from "@vamosdalian/gitgraph-core";

import connectBranchCommits from "./connect-branch-commits";
import { GraphLine, GraphMap, GraphSymbol } from "./types";

export {
  GraphCommit,
  GraphLine,
  GraphMap,
  GraphSymbol,
  ILogGraph,
} from "./types";

export default computeGraphMap;

// Translate rendered data into CLI logic.
//
// This is necessary because rendered data are optimized for browsers.
// Rendering is a bit different in CLI since we don't have pixels.
// Thus, we should translate data to have "line-per-line" instructions.
function computeGraphMap(gitgraph: GitgraphCore): GraphMap {
  const { branchesPaths, commits, commitMessagesX } =
    gitgraph.getRenderedData();
  const branchesColors = Array.from(branchesPaths).map(
    ([branch]) => branch.computedColor!,
  );
  const branchSpacing = gitgraph.template.branch.spacing;
  const graphSize = xToIndex(commitMessagesX);
  const openedBranches = [commits[0].x];

  let graph: GraphMap = [];
  commits.forEach((commit, index) => {
    const graphLine = emptyLine();

    // Commit message should always be at the end of the graph.
    graphLine[graphLine.length - 1] = {
      value: {
        hash: commit.hashAbbrev,
        message: commit.subject,
        refs: commit.refs,
      },
      color: commit.style.color!,
    };

    graphLine[xToIndex(commit.x)] = {
      value: GraphSymbol.Commit,
      color: commit.style.color!,
    };

    const previousCommit = commits[index - 1];
    const isFirstCommitOfNewBranch = !openedBranches.includes(commit.x);
    if (isFirstCommitOfNewBranch) {
      graph = graph.concat(openBranchLines(previousCommit, commit));
      openedBranches.push(commit.x);
    }

    const isMergeCommit = commit.parents.length > 1;
    if (isMergeCommit) {
      graph = graph.concat(mergeBranchLines(previousCommit, commit));
    }

    graph.push(graphLine);
  });

  // Transpose the graph so columns become lines, connect each branch, then
  // transpose it back to the line-oriented representation used by the logger.
  const transposedGraph = transpose(graph).map((line, index) =>
    connectBranchCommits(branchColorFor(index), line),
  );
  return transpose(transposedGraph);

  function xToIndex(x: number): number {
    return (x / branchSpacing) * 2;
  }

  function emptyLine(): GraphLine {
    return Array.from({ length: graphSize }, () => ({
      value: GraphSymbol.Empty,
      color: "",
    }));
  }

  function openBranchLines(origin: Commit, target: Commit): GraphLine[] {
    const start = xToIndex(origin.x) + 1;
    const end = xToIndex(target.x);

    return numberRange(start, end).map((index) => {
      const line = emptyLine();
      line[index] = {
        value: GraphSymbol.BranchOpen,
        color: branchColorFor(end),
      };
      return line;
    });
  }

  function mergeBranchLines(origin: Commit, target: Commit): GraphLine[] {
    const start = xToIndex(origin.x) - 1;
    const end = xToIndex(target.x);

    return numberRange(start, end, -1).map((index) => {
      const line = emptyLine();
      line[index] = {
        value: GraphSymbol.BranchMerge,
        color: branchColorFor(start),
      };
      return line;
    });
  }

  function branchColorFor(branchCommitsIndex: number): string {
    const colorIndex = Math.ceil(branchCommitsIndex / 2);
    return branchesColors[colorIndex];
  }
}

function transpose<T>(rows: T[][]): T[][] {
  if (rows.length === 0) return [];

  return rows[0].map((_, columnIndex) => rows.map((row) => row[columnIndex]));
}

function numberRange(start: number, end: number, step = 1): number[] {
  const values: number[] = [];

  if (step > 0) {
    for (let value = start; value < end; value += step) values.push(value);
  } else {
    for (let value = start; value > end; value += step) values.push(value);
  }

  return values;
}
