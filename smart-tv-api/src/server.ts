import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { buildApp } from './app.js';
async function main() {
  const config=loadConfig(process.env);
  const database=openDatabase(config.databasePath);
  const app=buildApp({config,database});
  try { await app.listen({host:config.host,port:config.port}); }
  catch { await app.close(); throw new Error('Server startup failed'); }
  let stopping=false;
  for(const signal of ['SIGTERM','SIGINT'] as const) process.on(signal,()=>{
    if (stopping) return; stopping=true;
    void app.close().catch(()=>{process.exitCode=1;});
  });
}
void main().catch(()=>{process.stderr.write('Smart TV API startup failed; check configuration and writable database directory.\n');process.exitCode=1;});
