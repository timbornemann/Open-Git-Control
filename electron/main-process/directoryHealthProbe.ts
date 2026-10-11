/** Shared child-process code: a disconnected volume or dangling junction is never confirmed missing. */
export const DIRECTORY_HEALTH_PROBE = `function directoryHealth(target) {
 try {
  fs.readdirSync(p.parse(target).root);
  let ancestor=p.parse(target).root;
  for(const segment of p.relative(ancestor,target).split(p.sep).filter(Boolean)) {
   ancestor=p.join(ancestor,segment);
   let entry;
   try { entry=fs.lstatSync(ancestor); } catch(error) { if(error.code==='ENOENT') break; if(error.code==='ENOTDIR') return 'invalid'; throw error; }
   if(entry.isSymbolicLink()) fs.statSync(fs.realpathSync(ancestor));
  }
  try { if(!fs.statSync(target).isDirectory())return 'invalid'; fs.readdirSync(target); return 'available'; }
  catch(error) {
   if(error.code==='ENOTDIR')return 'invalid';
   if(error.code!=='ENOENT')return 'unreachable';
   let parent=p.dirname(target);
   while(parent!==p.dirname(parent)) { try { fs.readdirSync(parent); return 'missing'; } catch(e) { if(e.code!=='ENOENT')throw e; parent=p.dirname(parent); } }
   fs.readdirSync(parent);return 'missing';
  }
 } catch {return 'unreachable';}
}`;
