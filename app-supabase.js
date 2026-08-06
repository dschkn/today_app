(()=>{
  'use strict';

  const client=window.TodaySupabase;
  const rawSession=localStorage.getItem('today.session.v1');
  let session=null;
  try{session=JSON.parse(rawSession)}catch{}
  if(!client?.configured||!session?.userId)return;

  const tasksKey=`today.tasks.v2.${session.userId}`;
  const originalSetItem=Storage.prototype.setItem;
  const originalRemoveItem=Storage.prototype.removeItem;
  let remoteSnapshot=readTasks();
  let desiredSnapshot=null;
  let syncing=false;
  let retryTimer=null;
  let loggingOut=false;

  Storage.prototype.setItem=function(key,value){
    originalSetItem.call(this,key,value);
    if(this===localStorage&&key===tasksKey){
      try{
        const parsed=JSON.parse(value);
        if(Array.isArray(parsed))scheduleSync(parsed);
      }catch{}
    }
  };

  document.addEventListener('click',handleLogout,true);
  window.addEventListener('online',()=>{
    if(desiredSnapshot&&!syncing)flush();
  });

  async function handleLogout(event){
    const button=event.target.closest?.('#profile');
    if(!button||loggingOut)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!confirm(`выйти из аккаунта ${session.name}?`))return;
    loggingOut=true;
    try{await client.signOut()}catch(error){console.error(error)}
    originalRemoveItem.call(localStorage,'today.session.v1');
    window.top.location.replace('./index.html');
  }

  function readTasks(){
    try{
      const value=JSON.parse(localStorage.getItem(tasksKey));
      return Array.isArray(value)?value:[];
    }catch{return[]}
  }

  function scheduleSync(tasks){
    desiredSnapshot=tasks.map(task=>({...task}));
    if(retryTimer){clearTimeout(retryTimer);retryTimer=null}
    if(!syncing)flush();
  }

  async function flush(){
    if(syncing)return;
    syncing=true;

    while(desiredSnapshot){
      const target=desiredSnapshot;
      desiredSnapshot=null;
      try{
        await syncOnce(target);
        remoteSnapshot=target.map(task=>({...task}));
      }catch(error){
        console.error('today sync failed',error);
        if(!desiredSnapshot)desiredSnapshot=target;
        retryTimer=setTimeout(()=>{
          retryTimer=null;
          syncing=false;
          flush();
        },5000);
        return;
      }
    }

    syncing=false;
  }

  async function syncOnce(target){
    const before=new Map(remoteSnapshot.map(task=>[task.id,task]));
    const after=new Map(target.map(task=>[task.id,task]));
    const changed=[];

    for(const task of target){
      const previous=before.get(task.id);
      if(!previous||signature(previous)!==signature(task))changed.push(toRemoteTask(task));
    }

    const removed=[...before.keys()].filter(id=>!after.has(id));

    if(changed.length)await client.upsertTasks(changed);
    for(const id of removed)await client.deleteTask(id);
  }

  function signature(task){
    return JSON.stringify([
      task.text,
      task.date,
      task.time||'',
      task.priority,
      Boolean(task.done)
    ]);
  }

  function toRemoteTask(task){
    return{
      id:task.id,
      user_id:session.userId,
      body:String(task.text||'').trim(),
      task_date:task.date,
      task_time:task.time||null,
      priority:task.priority||'medium',
      is_done:Boolean(task.done)
    };
  }
})();
