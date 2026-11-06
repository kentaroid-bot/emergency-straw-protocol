// Local-only static server. Explicit public-file allowlist; never serves keys or sources.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/app/index.html':'app/index.html','/devnet':'app/index.html','/devnet/':'app/index.html','/devnet/style.css':'app/style.css',
  '/devnet/app.js':'dist/app.js','/devnet/deployment.json':'deployments/devnet.json','/':'index.html','/index.html':'index.html','/model.js':'model.js',
  '/README.md':'README.md','/DEVNET.md':'DEVNET.md','/DESIGN.md':'DESIGN.md','/llms.txt':'llms.txt','/protocol.json':'protocol.json'};
const port = Number(process.env.PORT || 8787);
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const file=files[req.url.split('?')[0]];
  if(!file){res.writeHead(404);return res.end('Not found');}
  const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'text/plain';
  fs.readFile(path.join(__dirname,file),(err,data)=>{
    if(err){res.writeHead(500);return res.end('Unable to read demo file');}
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Straw concept mock: http://127.0.0.1:${port}`));
