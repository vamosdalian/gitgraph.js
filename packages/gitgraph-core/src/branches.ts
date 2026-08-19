import { Branch, DELETED_BRANCH_NAME } from "./branch";
import { Commit } from "./commit";
import { Refs } from "./refs";

export { getBranches, getPrimaryBranchFirstParentHistory, withBranches };

/**
 * Associate every commit with the branch tips that can reach it through
 * first-parent ancestry.
 */
function getBranches<TNode>(
  commits: Array<Commit<TNode>>,
  refs: Refs,
): Map<Commit["hash"], Set<Branch["name"]>> {
  const result = new Map<Commit["hash"], Set<Branch["name"]>>();
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const branches = refs.getAllNames().filter((name) => name !== "HEAD");

  branches.forEach((branch) => {
    let currentHash = refs.getCommit(branch);
    const visited = new Set<Commit["hash"]>();

    while (currentHash && !visited.has(currentHash)) {
      visited.add(currentHash);

      const commitBranches = result.get(currentHash) || new Set();
      commitBranches.add(branch);
      result.set(currentHash, commitBranches);

      currentHash = commitsByHash.get(currentHash)?.parents[0];
    }
  });

  return result;
}

/**
 * Return the commits that form the configured primary branch's first-parent
 * history. Missing refs and truncated parents stop traversal safely.
 */
function getPrimaryBranchFirstParentHistory<TNode>(
  commits: Array<Commit<TNode>>,
  refs: Refs,
  primaryBranch: Branch["name"] | undefined,
): Set<Commit["hash"]> {
  const history = new Set<Commit["hash"]>();
  if (!primaryBranch) return history;

  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  let currentHash = refs.getCommit(primaryBranch);

  while (currentHash && !history.has(currentHash)) {
    const commit = commitsByHash.get(currentHash);
    if (!commit) break;

    history.add(currentHash);
    currentHash = commit.parents[0];
  }

  return history;
}

/** Add inferred branch ownership to a commit without changing its real refs. */
function withBranches<TNode>(
  branches: Map<Commit["hash"], Set<Branch["name"]>>,
  commit: Commit<TNode>,
  primaryBranch: Branch["name"] | undefined,
  primaryBranchFirstParentHistory: Set<Commit["hash"]>,
): Commit<TNode> {
  let commitBranches = Array.from(branches.get(commit.hash) || []);

  if (
    primaryBranch &&
    primaryBranchFirstParentHistory.has(commit.hash) &&
    commitBranches.includes(primaryBranch)
  ) {
    commitBranches = [
      primaryBranch,
      ...commitBranches.filter((branch) => branch !== primaryBranch),
    ];
  }

  if (commitBranches.length === 0) {
    // No branch => branch has been deleted.
    commitBranches = [DELETED_BRANCH_NAME];
  }

  return commit.setBranches(commitBranches);
}
