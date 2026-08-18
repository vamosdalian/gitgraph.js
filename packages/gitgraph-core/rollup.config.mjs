import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

const input = "lib/index.js";

export default [
  {
    input,
    plugins: [nodeResolve()],
    output: [
      { file: "lib/index.mjs", format: "es", sourcemap: true },
      {
        file: "lib/index.cjs",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
      {
        file: "lib/bundle.umd.js",
        format: "umd",
        name: "GitgraphCore",
        sourcemap: true,
      },
      {
        file: "lib/bundle.umd.min.js",
        format: "umd",
        name: "GitgraphCore",
        plugins: [terser()],
        sourcemap: true,
      },
    ],
  },
];
