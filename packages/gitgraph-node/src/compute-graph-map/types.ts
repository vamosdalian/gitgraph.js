export interface GraphCommit {
  hash: string;
  message: string;
  refs: string[];
}

export enum GraphSymbol {
  // Use string values to ease testing and debugging.
  Commit = "*",
  Empty = " ",
  Branch = "|",
  BranchOpen = "\\",
  BranchMerge = "/",
}

interface GraphCell {
  value: GraphSymbol | GraphCommit;
  color: string;
}

export type GraphLine = GraphCell[];
export type GraphMap = GraphLine[];
export type ILogGraph = (graph: GraphMap) => void;
