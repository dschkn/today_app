(()=>{
  'use strict';

  const client=window.TodaySupabase;
  const form=document.querySelector('#auth-form');
  const title=document.querySelector('#auth-title');
  const submit=document.querySelector('#auth-submit');
  const nameInput=document.querySelector('#name');
  const passwordInput=document.querySelector('#password');
  const message=document.querySelector('#message');
  let busy=false;

  if(!client?.configured){
    setMessage('today is not connected to its server.');
    if(submit)submit.disabled=true;
    return;
  }

  client.getSession().then(session=>{
    if(session?.user)location.replace('./shell.html');
  }).catch(()=>{});

  form?.addEventListener('submit',handleSubmit,true);

  async function handleSubmit(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    if(busy)return;

    const name=nameInput.value.trim();
    const password=passwordInput.value;
    const mode=title.textContent.trim()==='register'?'register':'login';

    if(!name){setMessage('enter a name.');nameInput.focus();return}
    if(!password){setMessage('enter a password.');passwordInput.focus();return}

    busy=true;
    submit.disabled=true;
    setMessage(mode==='register'?'creating account...':'checking account...','success');

    try{
      const session=mode==='register'
        ?await client.signUp(name,password)
        :await client.signIn(name,password);

      const profile=await client.getProfile(session.user.id);
      if(!profile)throw new Error('profile was not created.');

      localStorage.removeItem('today.users.v1');
      localStorage.setItem('today.session.v1',JSON.stringify({
        userId:session.user.id,
        name:profile.username,
        startedAt:new Date().toISOString(),
        source:'supabase'
      }));

      setMessage('done. opening today...','success');
      document.body.classList.add('is-leaving');
      setTimeout(()=>location.replace('./shell.html'),210);
    }catch(error){
      setMessage(friendlyError(error,mode));
      busy=false;
      submit.disabled=false;
    }
  }

  function friendlyError(error,mode){
    const raw=String(error?.message||'').toLowerCase();
    if(raw.includes('invalid login credentials'))return'wrong name or password.';
    if(raw.includes('user already registered')||raw.includes('already been registered'))return'this name is already registered.';
    if(raw.includes('database error')&&mode==='register')return'this name may already be registered.';
    if(raw.includes('password')&&raw.includes('least'))return'use a longer password.';
    if(raw.includes('failed to fetch')||raw.includes('network'))return'could not reach the server.';
    if(raw.includes('rate limit'))return'too many attempts. wait a little.';
    return raw||'something went wrong.';
  }

  function setMessage(text,type='error'){
    if(!message)return;
    message.textContent=text;
    message.classList.toggle('success',type==='success');
  }
})();
