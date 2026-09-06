// Stands in for @supabase/supabase-js. Behaviour is driven by globals so each
// test can decide whether the "network" works.
export function createClient(){
  function table(name){
    const op = { table:name };
    const t = {
      insert(row){ op.kind='insert'; op.row=row; return t; },
      upsert(row,o){ op.kind='upsert'; op.row=row; op.opts=o; return t; },
      update(row){ op.kind='update'; op.row=row; return t; },
      match(m){ op.match=m; return t; },
      select(){ op.selected=true; return t; },
      single(){ op.single=true; return t; },
      then(res,rej){
        globalThis.__calls.push(JSON.parse(JSON.stringify(op)));
        return Promise.resolve(globalThis.__behaviour(op)).then(res,rej);
      }
    };
    return t;
  }
  return { from: table, auth:{}, rpc:()=>Promise.resolve({data:true,error:null}) };
}
