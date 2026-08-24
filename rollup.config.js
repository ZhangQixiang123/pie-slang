import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from '@rollup/plugin-typescript';

// The legacy web/ playground bundles were removed with the web/ directory;
// the React playground in web-react/ has its own Vite build.
export default [
  // Main bundle for distribution
  {
    input: 'src/pie-interpreter/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [typescript(), nodeResolve(), terser()]
  }
];
