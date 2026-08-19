import { Branch, createDeletedBranch } from "./branch";
import { Commit } from "./commit";
import { createGraphRows, GraphRows } from "./graph-rows";
import { Mode } from "./mode";
import { BranchesLanes } from "./branches-lanes";
import { BranchesOrder, CompareBranchesOrder } from "./branches-order";
import {
  Template,
  TemplateOptions,
  TemplateName,
  getTemplate,
} from "./template";
import { Refs } from "./refs";
import { BranchesPathsCalculator, BranchesPaths } from "./branches-paths";
import {
  getBranches,
  getPrimaryBranchFirstParentHistory,
  withBranches,
} from "./branches";
import { booleanOptionOr, numberOptionOr } from "./utils";
import { Orientation } from "./orientation";
import {
  GitgraphUserApi,
  GitgraphBranchOptions,
  GitgraphTagOptions,
} from "./user-api/gitgraph-user-api";

export { GitgraphOptions, RenderedData, GitgraphCore };

interface GitgraphOptions {
  template?: TemplateName | Template;
  orientation?: Orientation;
  reverseArrow?: boolean;
  initCommitOffsetX?: number;
  initCommitOffsetY?: number;
  mode?: Mode;
  author?: string;
  branchLabelOnEveryCommit?: boolean;
  commitMessage?: string;
  generateCommitHash?: () => Commit["hash"];
  compareBranchesOrder?: CompareBranchesOrder;
  /**
   * Branch whose first-parent ancestry should be rendered as the mainline.
   */
  primaryBranch?: string;
}

interface RenderedData<TNode> {
  commits: Array<Commit<TNode>>;
  branchesPaths: BranchesPaths<TNode>;
  commitMessagesX: number;
}

class GitgraphCore<TNode = SVGElement> {
  public orientation?: Orientation;
  public get isHorizontal(): boolean {
    return (
      this.orientation === Orientation.Horizontal ||
      this.orientation === Orientation.HorizontalReverse
    );
  }
  public get isVertical(): boolean {
    return !this.isHorizontal;
  }
  public get isReverse(): boolean {
    return (
      this.orientation === Orientation.HorizontalReverse ||
      this.orientation === Orientation.VerticalReverse
    );
  }
  public get shouldDisplayCommitMessage(): boolean {
    return !this.isHorizontal && this.mode !== Mode.Compact;
  }

  public reverseArrow: boolean;
  public initCommitOffsetX: number;
  public initCommitOffsetY: number;
  public mode?: Mode;
  public author: string;
  public commitMessage: string;
  public generateCommitHash: () => Commit["hash"] | undefined;
  public branchesOrderFunction: CompareBranchesOrder | undefined;
  public primaryBranch: Branch["name"] | undefined;
  public template: Template;
  public branchLabelOnEveryCommit: boolean;

  public refs = new Refs();
  public tags = new Refs();
  public tagStyles: { [name: string]: TemplateOptions["tag"] } = {};
  public tagRenders: {
    [name: string]: GitgraphTagOptions<TNode>["render"];
  } = {};
  public commits: Array<Commit<TNode>> = [];
  public branches: Map<Branch["name"], Branch<TNode>> = new Map();
  public currentBranch: Branch<TNode>;

  private listeners: Array<(data: RenderedData<TNode>) => void> = [];
  private nextTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GitgraphOptions = {}) {
    this.template = getTemplate(options.template);

    // Set a default `master` branch
    this.currentBranch = this.createBranch("master");

    // Set all options with default values
    this.orientation = options.orientation;
    this.reverseArrow = booleanOptionOr(options.reverseArrow, false);
    this.initCommitOffsetX = numberOptionOr(options.initCommitOffsetX, 0);
    this.initCommitOffsetY = numberOptionOr(options.initCommitOffsetY, 0);
    this.mode = options.mode;
    this.author = options.author || "Sergio Flores <saxo-guy@epic.com>";
    this.commitMessage =
      options.commitMessage || "He doesn't like George Michael! Boooo!";
    this.generateCommitHash =
      typeof options.generateCommitHash === "function"
        ? options.generateCommitHash
        : () => undefined;
    this.branchesOrderFunction =
      typeof options.compareBranchesOrder === "function"
        ? options.compareBranchesOrder
        : undefined;
    this.primaryBranch = options.primaryBranch;
    this.branchLabelOnEveryCommit = booleanOptionOr(
      options.branchLabelOnEveryCommit,
      false,
    );
  }

  /**
   * Return the API to manipulate Gitgraph as a user.
   * Rendering library should give that API to their consumer.
   */
  public getUserApi(): GitgraphUserApi<TNode> {
    return new GitgraphUserApi(this, () => this.next());
  }

  /**
   * Add a change listener.
   * It will be called any time the graph have changed (commit, merge…).
   *
   * @param listener A callback to be invoked on every change.
   * @returns A function to remove this change listener.
   */
  public subscribe(listener: (data: RenderedData<TNode>) => void): () => void {
    this.listeners.push(listener);

    let isSubscribed = true;

    return () => {
      if (!isSubscribed) return;
      isSubscribed = false;
      const index = this.listeners.indexOf(listener);
      this.listeners.splice(index, 1);
    };
  }

  /**
   * Return all data required for rendering.
   * Rendering libraries will use this to implement their rendering strategy.
   */
  public getRenderedData(): RenderedData<TNode> {
    const commits = this.computeRenderedCommits();
    const branchesPaths = this.computeRenderedBranchesPaths(commits);
    const commitMessagesX = this.computeCommitMessagesX(branchesPaths);

    this.computeBranchesColor(commits, branchesPaths);

    return { commits, branchesPaths, commitMessagesX };
  }

  /**
   * Create a new branch.
   *
   * @param options Options of the branch
   */
  public createBranch(options: GitgraphBranchOptions<TNode>): Branch<TNode>;
  /**
   * Create a new branch. (as `git branch`)
   *
   * @param name Name of the created branch
   */
  public createBranch(name: string): Branch<TNode>;
  public createBranch(args: any): Branch<TNode> {
    const defaultParentBranchName = "HEAD";

    let options = {
      gitgraph: this,
      name: "",
      parentCommitHash: this.refs.getCommit(defaultParentBranchName),
      style: this.template.branch,
      onGraphUpdate: () => this.next(),
    };

    if (typeof args === "string") {
      options.name = args;
      options.parentCommitHash = this.refs.getCommit(defaultParentBranchName);
    } else {
      const parentBranchName = args.from
        ? args.from.name
        : defaultParentBranchName;
      const parentCommitHash =
        this.refs.getCommit(parentBranchName) ||
        (this.refs.hasCommit(args.from) ? args.from : undefined);
      args.style = args.style || {};
      options = {
        ...options,
        ...args,
        parentCommitHash,
        style: {
          ...options.style,
          ...args.style,
          label: {
            ...options.style.label,
            ...args.style.label,
          },
        },
      };
    }

    const branch = new Branch<TNode>(options);
    this.branches.set(branch.name, branch);

    return branch;
  }

  /**
   * Return commits with data for rendering.
   */
  private computeRenderedCommits(): Array<Commit<TNode>> {
    const branches = getBranches(this.commits, this.refs);
    const primaryBranchFirstParentHistory = getPrimaryBranchFirstParentHistory(
      this.commits,
      this.refs,
      this.primaryBranch,
    );

    // Commits that are not associated to a branch in `branches`
    // were in a deleted branch. If the latter was merged beforehand
    // they are reachable and are rendered. Others are not
    const reachableUnassociatedCommits = (() => {
      const unassociatedCommits = new Set(
        this.commits.reduce(
          (commits: Commit["hash"][], { hash }: { hash: Commit["hash"] }) =>
            !branches.has(hash) ? [...commits, hash] : commits,
          [],
        ),
      );

      const tipsOfMergedBranches = this.commits.reduce(
        (tipsOfMergedBranches: Commit<TNode>[], commit: Commit<TNode>) =>
          commit.parents.length > 1
            ? [
                ...tipsOfMergedBranches,
                ...commit.parents
                  .slice(1)
                  .map((parentHash) =>
                    this.commits.find(({ hash }) => parentHash === hash)!,
                  ),
              ]
            : tipsOfMergedBranches,
        [],
      );

      const reachableCommits = new Set();

      tipsOfMergedBranches.forEach((tip) => {
        let currentCommit: Commit<TNode> | undefined = tip;

        while (currentCommit && unassociatedCommits.has(currentCommit.hash)) {
          reachableCommits.add(currentCommit.hash);

          currentCommit =
            currentCommit.parents.length > 0
              ? this.commits.find(
                  ({ hash }) => currentCommit!.parents[0] === hash,
                )
              : undefined;
        }
      });

      return reachableCommits;
    })();

    const commitsToRender = this.commits.filter(
      ({ hash }) =>
        branches.has(hash) || reachableUnassociatedCommits.has(hash),
    );

    const commitsWithBranches = commitsToRender.map((commit) =>
      withBranches(
        branches,
        commit,
        this.primaryBranch,
        primaryBranchFirstParentHistory,
      ),
    );

    const rows = createGraphRows(this.mode, commitsToRender);
    const branchesOrder = new BranchesOrder<TNode>(
      commitsWithBranches,
      this.template.colors,
      this.branchesOrderFunction,
      this.primaryBranch,
    );

    const commitsWithPreliminaryPositions = commitsWithBranches
      .map((commit) => commit.setRefs(this.refs))
      .map((commit) =>
        this.withPosition(rows, branchesOrder.get.bind(branchesOrder), commit),
      );
    const preliminaryBranchesPaths = this.computeRenderedBranchesPaths(
      commitsWithPreliminaryPositions,
    );
    const branchesLanes = new BranchesLanes<TNode>(
      preliminaryBranchesPaths,
      branchesOrder,
      this.isVertical,
      this.isReverse,
      (branchName) => this.getBranchCoordinate(branchesOrder.get(branchName)),
    );

    return (
      commitsWithPreliminaryPositions
        .map((commit) =>
          this.withPosition(
            rows,
            branchesLanes.get.bind(branchesLanes),
            commit,
          ),
        )
        // Fallback commit computed color on branch color.
        .map((commit) =>
          commit.withDefaultColor(
            this.getBranchDefaultColor(branchesOrder, commit.branchToDisplay),
          ),
        )
        // Tags need commit style to be computed (with default color).
        .map((commit) =>
          commit.setTags(
            this.tags,
            (name) =>
              Object.assign({}, this.tagStyles[name], this.template.tag),
            (name) => this.tagRenders[name],
          ),
        )
    );
  }

  /**
   * Return branches paths with all data required for rendering.
   *
   * @param commits List of commits with rendering data computed
   */
  private computeRenderedBranchesPaths(
    commits: Array<Commit<TNode>>,
  ): BranchesPaths<TNode> {
    return new BranchesPathsCalculator<TNode>(
      commits,
      this.branches,
      this.template.commit.spacing,
      this.isVertical,
      this.isReverse,
      () => createDeletedBranch(this, this.template.branch, () => this.next()),
    ).execute();
  }

  /**
   * Set branches colors based on branches paths.
   *
   * @param commits List of graph commits
   * @param branchesPaths Branches paths to be rendered
   */
  private computeBranchesColor(
    commits: Array<Commit<TNode>>,
    branchesPaths: BranchesPaths<TNode>,
  ): void {
    const branchesOrder = new BranchesOrder<TNode>(
      commits,
      this.template.colors,
      this.branchesOrderFunction,
      this.primaryBranch,
    );
    Array.from(branchesPaths).forEach(([branch]) => {
      branch.computedColor =
        branch.style.color ||
        this.getBranchDefaultColor(branchesOrder, branch.name);
    });
  }

  /**
   * Return commit messages X position for rendering.
   *
   * @param branchesPaths Branches paths to be rendered
   */
  private computeCommitMessagesX(branchesPaths: BranchesPaths<TNode>): number {
    const laneCoordinates: number[] = [];
    branchesPaths.forEach((paths) => {
      paths.forEach((path) => {
        path.forEach((point) => {
          laneCoordinates.push(this.isVertical ? point.x : point.y);
        });
      });
    });
    if (laneCoordinates.length === 0) return 0;
    if (this.template.branch.spacing === 0) return 0;

    const laneOffset = this.isVertical
      ? this.initCommitOffsetX
      : this.initCommitOffsetY;
    const maxLaneCoordinate = Math.max(...laneCoordinates);
    const maxLane = Math.round(
      (maxLaneCoordinate - laneOffset) / this.template.branch.spacing,
    );
    return (maxLane + 1) * this.template.branch.spacing;
  }

  /**
   * Add position to given commit.
   *
   * @param rows Graph rows
   * @param getBranchLane Return the computed lane of a branch
   * @param commit Commit to position
   */
  private withPosition(
    rows: GraphRows<TNode>,
    getBranchLane: (branchName: Branch["name"]) => number,
    commit: Commit<TNode>,
  ): Commit<TNode> {
    const row = rows.getRowOf(commit.hash);
    const maxRow = rows.getMaxRow();

    const lane = getBranchLane(commit.branchToDisplay);

    switch (this.orientation) {
      default:
        return commit.setPosition({
          x: this.initCommitOffsetX + this.template.branch.spacing * lane,
          y:
            this.initCommitOffsetY +
            this.template.commit.spacing * (maxRow - row),
        });

      case Orientation.VerticalReverse:
        return commit.setPosition({
          x: this.initCommitOffsetX + this.template.branch.spacing * lane,
          y: this.initCommitOffsetY + this.template.commit.spacing * row,
        });

      case Orientation.Horizontal:
        return commit.setPosition({
          x: this.initCommitOffsetX + this.template.commit.spacing * row,
          y: this.initCommitOffsetY + this.template.branch.spacing * lane,
        });

      case Orientation.HorizontalReverse:
        return commit.setPosition({
          x:
            this.initCommitOffsetX +
            this.template.commit.spacing * (maxRow - row),
          y: this.initCommitOffsetY + this.template.branch.spacing * lane,
        });
    }
  }

  private getBranchCoordinate(lane: number): number {
    const laneOffset = this.isVertical
      ? this.initCommitOffsetX
      : this.initCommitOffsetY;
    return laneOffset + this.template.branch.spacing * lane;
  }

  /**
   * Return the default color for given branch.
   *
   * @param branchesOrder Computed order of branches
   * @param branchName Name of the branch
   */
  private getBranchDefaultColor(
    branchesOrder: BranchesOrder<TNode>,
    branchName: Branch["name"],
  ): string {
    return branchesOrder.getColorOf(branchName);
  }

  /**
   * Tell each listener something new happened.
   * E.g. a rendering library will know it needs to re-render the graph.
   */
  private next() {
    if (this.nextTimeoutId) {
      globalThis.clearTimeout(this.nextTimeoutId);
    }

    // Use setTimeout() with `0` to debounce call to next tick.
    this.nextTimeoutId = globalThis.setTimeout(() => {
      this.listeners.forEach((listener) => listener(this.getRenderedData()));
    }, 0);
  }
}
