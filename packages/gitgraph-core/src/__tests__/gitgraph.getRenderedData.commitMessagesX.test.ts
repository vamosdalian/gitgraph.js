import { GitgraphCore } from "../gitgraph";
import { Orientation } from "../orientation";
import { Template } from "../template";

describe("Gitgraph.getRenderedData.commitMessagesX", () => {
  const template = new Template({
    branch: {
      spacing: 10,
    },
  });

  it("should set commitMessagesX to 0 when graph is initialized", () => {
    const core = new GitgraphCore({ template });

    const { commitMessagesX } = core.getRenderedData();

    expect(commitMessagesX).toBe(0);
  });

  it("should set commitMessagesX to width of graph when there is one branch", () => {
    const core = new GitgraphCore({ template });
    const gitgraph = core.getUserApi();

    gitgraph.branch("master").commit();

    const { commitMessagesX } = core.getRenderedData();

    expect(commitMessagesX).toBe(10);
  });

  it("should set commitMessagesX to width of graph when there are two branches", () => {
    const core = new GitgraphCore({ template });
    const gitgraph = core.getUserApi();

    gitgraph.branch("master").commit();
    gitgraph.branch("dev").commit();

    const { commitMessagesX } = core.getRenderedData();

    expect(commitMessagesX).toBe(20);
  });

  it("should use the maximum lane instead of the historical branch count", () => {
    const core = new GitgraphCore({ template });
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit();

    for (let i = 0; i < 5; i++) {
      const feature = gitgraph
        .branch({ name: `feature-${i}`, from: master })
        .commit();
      master.merge(feature);
    }

    const { branchesPaths, commitMessagesX } = core.getRenderedData();

    expect(branchesPaths.size).toBe(6);
    expect(commitMessagesX).toBe(20);
  });

  it("should preserve lane width with initial offsets", () => {
    const core = new GitgraphCore({
      template,
      initCommitOffsetX: 25,
      initCommitOffsetY: 35,
    });
    core.getUserApi().branch("master").commit();

    const { commits, commitMessagesX } = core.getRenderedData();

    expect(commits[0]).toMatchObject({ x: 25, y: 35 });
    expect(commitMessagesX).toBe(10);
  });

  it("should derive horizontal lane width from branch-axis coordinates", () => {
    const core = new GitgraphCore({
      template,
      orientation: Orientation.Horizontal,
      initCommitOffsetY: 25,
    });
    const gitgraph = core.getUserApi();
    const master = gitgraph.branch("master").commit();
    gitgraph.branch({ name: "feature", from: master }).commit();

    const { commitMessagesX } = core.getRenderedData();

    expect(commitMessagesX).toBe(20);
  });
});
