import { builtinModules } from "node:module";
import { nodeResolve } from "@rollup/plugin-node-resolve";

const dependencies = new Set([
  "@vamosdalian/gitgraph-core",
  "chalk",
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
]);

export default {
  input: "lib/index.js",
  external: (id) => dependencies.has(id),
  plugins: [nodeResolve()],
  output: [
    { file: "lib/index.mjs", format: "es", sourcemap: true },
    { file: "lib/index.cjs", format: "cjs", exports: "named", sourcemap: true },
  ],
};
