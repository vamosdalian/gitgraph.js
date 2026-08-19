import { GitgraphCore } from "../gitgraph";
import { Template } from "../template";

interface ImportCommit {
  refs: string[];
  hash: string;
  parents: string[];
  subject: string;
  author: { name: string; email: string };
}

describe("Gitgraph primary branch", () => {
  const template = new Template({
    colors: ["red", "green", "blue"],
    branch: { spacing: 50 },
  });

  it("preserves existing ref-order behavior when primaryBranch is omitted", () => {
    const core = importGraph(sharedTipHistory(["feature", "master"]));

    expect(commitsByHash(core).root.branchToDisplay).toBe("feature");
  });

  it("falls back safely when the configured primary branch does not exist", () => {
    const data = sharedTipHistory(["feature", "master"]);
    const baseline = importGraph(data);
    const core = importGraph(data, { primaryBranch: "missing" });

    expect(() => core.getRenderedData()).not.toThrow();
    expect(renderedCommitState(core)).toEqual(renderedCommitState(baseline));
  });

  it("keeps a single primary branch on lane 0 with a stable color", () => {
    const core = importGraph(
      [
        importedCommit("tip", ["parent"], ["master", "HEAD"]),
        importedCommit("parent", ["root"]),
        importedCommit("root"),
      ],
      { primaryBranch: "master", template },
    );

    expect(Object.values(commitsByHash(core))).toMatchObject([
      { branchToDisplay: "master", x: 0, style: { color: "red" } },
      { branchToDisplay: "master", x: 0, style: { color: "red" } },
      { branchToDisplay: "master", x: 0, style: { color: "red" } },
    ]);
  });

  it("keeps a merged feature beside a continuous primary mainline", () => {
    const core = importGraph(singleFeatureMerge(), {
      primaryBranch: "master",
      template,
    });
    const commits = commitsByHash(core);

    expect(commits).toMatchObject({
      root: { branchToDisplay: "master", x: 0, style: { color: "red" } },
      main: { branchToDisplay: "master", x: 0, style: { color: "red" } },
      merge: { branchToDisplay: "master", x: 0, style: { color: "red" } },
      feature: {
        x: 50,
        style: { color: "green" },
      },
    });
    expect(commits.feature.branchToDisplay).toBe("feature");
    expect(commits.root.refs).toEqual([]);

    const primaryPaths = branchPaths(core, "master");
    expect(primaryPaths).toHaveLength(1);
    expect(primaryPaths.flat().every(({ x }) => x === 0)).toBe(true);
    expect(branchPaths(core, "feature").flat()).toEqual(
      expect.arrayContaining([
        { x: 50, y: commits.feature.y },
        { x: 0, y: commits.merge.y },
      ]),
    );
  });

  it("reuses lane 1 for sequential merged features and keeps two-column width", () => {
    const core = new GitgraphCore({ primaryBranch: "master" });
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    for (let i = 0; i < 4; i++) {
      const feature = gitgraph
        .branch({ name: `feature-${i}`, from: master })
        .commit(`feature-${i}`);
      master.merge(feature);
    }

    const { commits, commitMessagesX } = core.getRenderedData();
    expect(
      commits
        .filter(({ subject }) => subject.startsWith("feature-"))
        .map(({ x }) => x),
    ).toEqual([50, 50, 50, 50]);
    expect(
      commits
        .filter(({ branchToDisplay }) => branchToDisplay === "master")
        .every(({ x }) => x === 0),
    ).toBe(true);
    expect(commitMessagesX).toBe(100);
  });

  it("uses distinct lanes for overlapping features", () => {
    const core = importGraph(overlappingFeatures(), {
      primaryBranch: "master",
      template,
    });
    const commits = commitsByHash(core);

    expect(commits.main.x).toBe(0);
    expect(commits.mergeA.x).toBe(0);
    expect(commits.mergeB.x).toBe(0);
    expect(
      [commits.featureA.x, commits.featureB.x].sort((a, b) => a - b),
    ).toEqual([50, 100]);
    expect(commits.featureA.style.color).not.toBe(commits.featureB.style.color);
  });

  it("prioritizes primary ownership on shared history regardless of ref order", () => {
    const first = importGraph(sharedTipHistory(["feature", "master", "HEAD"]), {
      primaryBranch: "master",
      template,
    });
    const second = importGraph(
      sharedTipHistory(["HEAD", "master", "feature"]),
      { primaryBranch: "master", template },
    );

    expect(renderedCommitState(first)).toEqual(renderedCommitState(second));
    expect(Object.values(commitsByHash(first))).toMatchObject([
      { branchToDisplay: "master", x: 0, style: { color: "red" } },
      { branchToDisplay: "master", x: 0, style: { color: "red" } },
    ]);
  });

  it("stops safely when primary first-parent history is truncated", () => {
    const core = importGraph(
      [importedCommit("tip", ["missing-parent"], ["master", "HEAD"])],
      { primaryBranch: "master" },
    );

    expect(() => core.getRenderedData()).not.toThrow();
    expect(commitsByHash(core).tip).toMatchObject({
      branchToDisplay: "master",
      x: 0,
    });
  });

  it("keeps primary ahead of compareBranchesOrder while ordering features", () => {
    const core = importGraph(overlappingFeatures(), {
      primaryBranch: "master",
      compareBranchesOrder: (a, b) => {
        const order = ["feature-b", "feature-a", "master"];
        return order.indexOf(a) - order.indexOf(b);
      },
    });
    const commits = commitsByHash(core);

    expect(commits.main.x).toBe(0);
    expect(commits.featureB.x).toBe(50);
    expect(commits.featureA.x).toBe(100);
  });

  it("keeps the launchdate-like first-parent mainline continuous", () => {
    const core = importGraph(launchdateRegressionHistory(), {
      primaryBranch: "master",
      template,
    });
    const commits = commitsByHash(core);
    const mainline = [
      "445b966",
      "caa3e61",
      "aee7e62",
      "e5ff3e6",
      "9e977ab",
      "1012639",
      "2c6d3ad",
      "3d1c252",
      "751e145",
      "db795e5",
      "f0d2e06",
    ];
    const features = ["ec28779", "f396dd0", "923673e", "ab70313", "7356674"];

    expect(
      mainline.map((hash) => ({
        branch: commits[hash].branchToDisplay,
        x: commits[hash].x,
        color: commits[hash].style.color,
      })),
    ).toEqual(mainline.map(() => ({ branch: "master", x: 0, color: "red" })));
    expect(features.map((hash) => commits[hash].x)).toEqual(
      features.map(() => 50),
    );
    const primaryPaths = branchPaths(core, "master");
    expect(primaryPaths).toHaveLength(1);
    expect(primaryPaths.flat().every(({ x }) => x === 0)).toBe(true);
    expect(core.getRenderedData().commitMessagesX).toBe(100);
  });
});

function importGraph(
  data: ImportCommit[],
  options: ConstructorParameters<typeof GitgraphCore>[0] = {},
): GitgraphCore {
  const core = new GitgraphCore(options);
  core.getUserApi().import(data);
  return core;
}

function importedCommit(
  hash: string,
  parents: string[] = [],
  refs: string[] = [],
): ImportCommit {
  return {
    refs,
    hash,
    parents,
    subject: hash,
    author: { name: "Test", email: "test@example.com" },
  };
}

function commitsByHash(core: GitgraphCore) {
  return Object.fromEntries(
    core.getRenderedData().commits.map((commit) => [commit.hash, commit]),
  );
}

function renderedCommitState(core: GitgraphCore) {
  return core.getRenderedData().commits.map((commit) => ({
    hash: commit.hash,
    branchToDisplay: commit.branchToDisplay,
    branches: commit.branches,
    x: commit.x,
    color: commit.style.color,
  }));
}

function branchPaths(core: GitgraphCore, branchName: string) {
  const entry = Array.from(core.getRenderedData().branchesPaths).find(
    ([branch]) => branch.name === branchName,
  );
  if (!entry) throw new Error(`Missing branch path: ${branchName}`);
  return entry[1];
}

function sharedTipHistory(refs: string[]): ImportCommit[] {
  return [importedCommit("tip", ["root"], refs), importedCommit("root")];
}

function singleFeatureMerge(): ImportCommit[] {
  return [
    importedCommit("merge", ["main", "feature"], ["master", "HEAD"]),
    importedCommit("feature", ["root"], ["feature"]),
    importedCommit("main", ["root"]),
    importedCommit("root"),
  ];
}

function overlappingFeatures(): ImportCommit[] {
  return [
    importedCommit("mergeB", ["mergeA", "featureB"], ["master", "HEAD"]),
    importedCommit("mergeA", ["main", "featureA"]),
    importedCommit("featureB", ["main"], ["feature-b"]),
    importedCommit("featureA", ["root"], ["feature-a"]),
    importedCommit("main", ["root"]),
    importedCommit("root"),
  ];
}

function launchdateRegressionHistory(): ImportCommit[] {
  return [
    importedCommit("445b966", ["caa3e61", "ec28779"], ["master", "HEAD"]),
    importedCommit("ec28779", ["caa3e61"], ["codex/subscribe"]),
    importedCommit("caa3e61", ["aee7e62", "f396dd0"]),
    importedCommit("f396dd0", ["aee7e62"], ["no-wrangler"]),
    importedCommit("aee7e62", ["e5ff3e6", "923673e"]),
    importedCommit("923673e", ["e5ff3e6"], ["codex/public-cache"]),
    importedCommit("e5ff3e6", ["9e977ab", "ab70313"]),
    importedCommit("ab70313", ["9e977ab"], ["admin/loading"]),
    importedCommit("9e977ab", ["1012639", "95e6e01"]),
    importedCommit("95e6e01", ["1012639"]),
    importedCommit("1012639", ["2c6d3ad", "e47e696"]),
    importedCommit("e47e696", ["2c6d3ad"]),
    importedCommit("2c6d3ad", ["3d1c252", "7356674"]),
    importedCommit("7356674", ["1e88481"], ["action"]),
    importedCommit("1e88481", ["3d1c252"]),
    importedCommit("3d1c252", ["751e145"]),
    importedCommit("751e145", ["db795e5"]),
    importedCommit("db795e5", ["f0d2e06"]),
    importedCommit("f0d2e06"),
  ];
}
