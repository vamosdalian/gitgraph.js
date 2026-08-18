import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

const input = "lib/index.js";
const external = ["@vamosdalian/gitgraph-core", "react"];
const globals = {
  "@vamosdalian/gitgraph-core": "GitgraphCore",
  react: "React",
};

export default [
  {
    input,
    external,
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
        name: "GitgraphReact",
        exports: "named",
        globals,
        sourcemap: true,
      },
      {
        file: "lib/bundle.umd.min.js",
        format: "umd",
        name: "GitgraphReact",
        exports: "named",
        globals,
        plugins: [terser()],
        sourcemap: true,
      },
    ],
  },
];
