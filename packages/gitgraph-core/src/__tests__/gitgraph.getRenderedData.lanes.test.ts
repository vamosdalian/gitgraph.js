import { CompareBranchesOrder } from "../branches-order";
import { GitgraphCore } from "../gitgraph";
import { Orientation } from "../orientation";

describe("Gitgraph.getRenderedData branch lanes", () => {
  it("keeps a single main branch on lane 0", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();

    gitgraph.branch("master").commit("main-1").commit("main-2");

    expect(subjectXs(core)).toMatchObject({ "main-1": 0, "main-2": 0 });
  });

  it("puts one feature branch on lane 1", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    gitgraph.branch({ name: "feature", from: master }).commit("feature");

    expect(subjectXs(core)).toMatchObject({ main: 0, feature: 50 });
  });

  it("reuses lane 1 for sequential non-overlapping feature branches", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    const featureA = gitgraph
      .branch({ name: "feature-a", from: master })
      .commit("feature-a");
    master.merge(featureA);
    const featureB = gitgraph
      .branch({ name: "feature-b", from: master })
      .commit("feature-b");
    master.merge(featureB);

    expect(subjectXs(core)).toMatchObject({
      main: 0,
      "feature-a": 50,
      "feature-b": 50,
    });
  });

  it("uses separate lanes for overlapping feature branches", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    const featureA = gitgraph
      .branch({ name: "feature-a", from: master })
      .commit("feature-a");
    master.commit("main-between");
    const featureB = gitgraph
      .branch({ name: "feature-b", from: master })
      .commit("feature-b");
    master.merge(featureA);
    master.merge(featureB);

    const renderedData = core.getRenderedData();
    expect(subjectXs(core)).toMatchObject({
      main: 0,
      "feature-a": 50,
      "feature-b": 100,
    });

    const [featureACommit, featureBCommit] = ["feature-a", "feature-b"].map(
      (subject) =>
        renderedData.commits.find((commit) => commit.subject === subject)!,
    );
    expect(featureACommit.style.color).not.toBe(featureBCommit.style.color);
  });

  it("does not reuse an outer branch lane for a nested branch", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");
    const outer = gitgraph
      .branch({ name: "outer", from: master })
      .commit("outer-1");

    const inner = gitgraph
      .branch({ name: "inner", from: outer })
      .commit("inner");
    outer.commit("outer-2").merge(inner);
    master.merge(outer);

    expect(subjectXs(core)).toMatchObject({
      main: 0,
      "outer-1": 50,
      "outer-2": 50,
      inner: 100,
    });
  });

  it("reuses a lane released by a merged branch", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");
    const merged = gitgraph
      .branch({ name: "merged", from: master })
      .commit("merged");

    master.merge(merged).commit("after-merge");
    gitgraph.branch({ name: "later", from: master }).commit("later");

    expect(subjectXs(core)).toMatchObject({ merged: 50, later: 50 });
  });

  it("keeps an unmerged branch active through the current graph tip", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    gitgraph.branch({ name: "still-open", from: master }).commit("still-open");
    master.commit("main-later");
    gitgraph.branch({ name: "later", from: master }).commit("later");

    expect(subjectXs(core)).toMatchObject({
      "still-open": 50,
      later: 100,
    });
  });

  it("keeps multi-branch merge paths on distinct overlapping lanes", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");
    const develop = gitgraph
      .branch({ name: "develop", from: master })
      .commit("develop");
    const feature = gitgraph
      .branch({ name: "feature", from: develop })
      .commit("feature");

    develop.merge(feature);
    master.merge(develop);

    expect(subjectXs(core)).toMatchObject({
      main: 0,
      develop: 50,
      feature: 100,
    });
  });

  it("preserves deleted branch path coordinates", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");
    const feature = gitgraph
      .branch({ name: "feature", from: master })
      .commit("feature");

    master.merge(feature);
    feature.delete();

    const deletedBranchPath = Array.from(
      core.getRenderedData().branchesPaths,
    ).find(([branch]) => branch.isDeleted());
    expect(deletedBranchPath?.[1][0]).toEqual([
      { x: 0, y: 80 * 2 },
      { x: 50, y: 80 },
      { x: 0, y: 0 },
    ]);
  });

  it("keeps the comparator's first branch on lane 0", () => {
    const compareBranchesOrder: CompareBranchesOrder = (a, b) => {
      if (a === "master") return -1;
      if (b === "master") return 1;
      return 0;
    };
    const core = new GitgraphCore({ compareBranchesOrder });
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    gitgraph.branch({ name: "feature", from: master }).commit("feature");

    expect(subjectXs(core)).toMatchObject({ main: 0, feature: 50 });
  });

  it("keeps many sequential feature branches within two lanes", () => {
    const core = new GitgraphCore();
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    for (let i = 0; i < 20; i++) {
      const feature = gitgraph
        .branch({ name: `feature-${i}`, from: master })
        .commit(`feature-${i}`);
      master.merge(feature);
    }

    const { commits, commitMessagesX } = core.getRenderedData();
    const featureCommits = commits.filter(({ subject }) =>
      subject.startsWith("feature-"),
    );
    expect(featureCommits.map(({ x }) => x)).toEqual(new Array(20).fill(50));
    expect(Math.max(...commits.map(({ x }) => x))).toBe(50);
    expect(commitMessagesX).toBe(100);
  });

  it.each([
    Orientation.VerticalReverse,
    Orientation.Horizontal,
    Orientation.HorizontalReverse,
  ])("reuses lanes with %s orientation", (orientation) => {
    const core = new GitgraphCore({ orientation });
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit("main");

    const featureA = gitgraph
      .branch({ name: "feature-a", from: master })
      .commit("feature-a");
    master.merge(featureA);
    const featureB = gitgraph
      .branch({ name: "feature-b", from: master })
      .commit("feature-b");
    master.merge(featureB);

    const { commits, commitMessagesX } = core.getRenderedData();
    const laneCoordinates = commits
      .filter(({ subject }) => subject.startsWith("feature-"))
      .map((commit) =>
        orientation === Orientation.VerticalReverse ? commit.x : commit.y,
      );
    expect(laneCoordinates).toEqual([50, 50]);
    expect(commitMessagesX).toBe(100);
  });
});

function subjectXs(core: GitgraphCore): Record<string, number> {
  return Object.fromEntries(
    core
      .getRenderedData()
      .commits.filter(({ subject }) => !subject.startsWith("Merge branch"))
      .map(({ subject, x }) => [subject, x]),
  );
}
