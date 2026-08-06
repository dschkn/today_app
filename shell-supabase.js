(()=>{
  'use strict';

  const client=window.TodaySupabase;
  const frame=document.querySelector('#today-frame');

  boot();

  async function boot(){
    if(!client?.configured){showError('today is not connected to its server.');return}

    try{
      const session=await client.getSession();
      if(!session?.user){location.replace('./index.html');return}

      const [profile,rows]=await Promise.all([
        client.getProfile(session.user.id),
        client.listTasks()
      ]);

      if(!profile)throw new Error('profile not found.');

      const localSession={
        userId:session.user.id,
        name:profile.username,
        startedAt:new Date().toISOString(),
        source:'supabase'
      };

      localStorage.setItem('today.session.v1',JSON.stringify(localSession));
      localStorage.setItem(`today.tasks.v2.${session.user.id}`,JSON.stringify(rows.map(toLocalTask)));
      frame.src='./app.html';
    }catch(error){
      console.error(error);
      showError('today could not load your tasks. refresh the page in a moment.');
    }
  }

  function toLocalTask(row){
    return{
      id:row.id,
      text:row.body,
      date:row.task_date,
      time:row.task_time?String(row.task_time).slice(0,5):'',
      priority:row.priority,
      done:Boolean(row.is_done),
      createdAt:row.created_at,
      updatedAt:row.updated_at
    };
  }

  function showError(text){
    document.body.innerHTML='';
    const message=document.createElement('p');
    message.textContent=text;
    message.style.cssText='margin:auto;padding:32px;max-width:360px;color:#777773;font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif;text-align:center';
    document.body.append(message);
  }
})();
