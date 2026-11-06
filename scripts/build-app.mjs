import {build} from 'esbuild';
await build({entryPoints:['app/main.mjs'],bundle:true,outfile:'dist/app.js',platform:'browser',target:['es2022'],define:{global:'globalThis'},sourcemap:false,minify:true});
console.log('Built dist/app.js (local dependencies, no CDN)');
