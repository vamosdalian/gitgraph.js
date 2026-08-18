import { readFile } from "node:fs/promises";

const workspacePaths = [
  "packages/gitgraph-core",
  "packages/gitgraph-js",
  "packages/gitgraph-react",
  "packages/gitgraph-node",
];

async function readPackageJson(path) {
  return JSON.parse(await readFile(`${path}/package.json`, "utf8"));
}

const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const workspacePackages = await Promise.all(
  workspacePaths.map(readPackageJson),
);
const errors = [];

for (const workspacePackage of workspacePackages) {
  if (workspacePackage.version !== rootPackage.version) {
    errors.push(
      `${workspacePackage.name} is ${workspacePackage.version}; expected ${rootPackage.version}`,
    );
  }

  const coreVersion =
    workspacePackage.dependencies?.["@vamosdalian/gitgraph-core"];
  if (coreVersion && coreVersion !== rootPackage.version) {
    errors.push(
      `${workspacePackage.name} depends on gitgraph-core ${coreVersion}; expected ${rootPackage.version}`,
    );
  }
}

if (errors.length > 0) {
  throw new Error(
    `Workspace versions are not synchronized:\n${errors.join("\n")}`,
  );
}

console.log(
  `All public workspaces and internal dependencies use ${rootPackage.version}.`,
);
