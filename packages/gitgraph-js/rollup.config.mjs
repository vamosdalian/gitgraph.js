import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

const input = "lib/index.js";
const corePackage = "@vamosdalian/gitgraph-core";

export default [
  {
    input,
    external: [corePackage],
    output: [
      { file: "lib/index.mjs", format: "es", sourcemap: true },
      {
        file: "lib/index.cjs",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
    ],
  },
  {
    input,
    plugins: [nodeResolve(), commonjs()],
    output: [
      {
        file: "lib/gitgraph.umd.js",
        format: "umd",
        name: "GitgraphJS",
        sourcemap: true,
      },
      {
        file: "lib/gitgraph.umd.min.js",
        format: "umd",
        name: "GitgraphJS",
        plugins: [terser()],
        sourcemap: true,
      },
    ],
  },
];
