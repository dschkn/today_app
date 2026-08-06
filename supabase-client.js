(()=>{
  'use strict';

  const config=window.TODAY_CONFIG||{};
  const baseUrl=String(config.supabaseUrl||'').replace(/\/+$/,'');
  const publishableKey=String(config.supabasePublishableKey||'');
  const SESSION_KEY='today.supabase.session.v1';
  const configured=Boolean(baseUrl&&publishableKey);

  function readStoredSession(){
    try{
      const value=JSON.parse(localStorage.getItem(SESSION_KEY));
      return value&&value.access_token&&value.refresh_token?value:null;
    }catch{return null}
  }

  function writeStoredSession(session){
    if(!session){localStorage.removeItem(SESSION_KEY);return}
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  }

  function normalizeSession(payload){
    if(!payload?.access_token||!payload?.refresh_token)return null;
    const expiresAt=Number(payload.expires_at)||Math.floor(Date.now()/1000)+Number(payload.expires_in||3600);
    return{
      access_token:payload.access_token,
      refresh_token:payload.refresh_token,
      token_type:payload.token_type||'bearer',
      expires_in:Number(payload.expires_in||3600),
      expires_at:expiresAt,
      user:payload.user||null
    };
  }

  function errorMessage(payload,status){
    return payload?.msg||payload?.message||payload?.error_description||payload?.error||`request failed (${status})`;
  }

  async function request(path,{method='GET',body,token,headers={}}={}){
    if(!configured)throw new Error('supabase is not configured.');
    const response=await fetch(`${baseUrl}${path}`,{
      method,
      headers:{
        apikey:publishableKey,
        Authorization:`Bearer ${token||publishableKey}`,
        Accept:'application/json',
        ...(body!==undefined?{'Content-Type':'application/json'}:{}),
        ...headers
      },
      body:body===undefined?undefined:JSON.stringify(body),
      cache:'no-store'
    });
    const text=await response.text();
    let payload=null;
    if(text){try{payload=JSON.parse(text)}catch{payload=text}}
    if(!response.ok){
      const error=new Error(errorMessage(payload,response.status));
      error.status=response.status;
      error.payload=payload;
      throw error;
    }
    return payload;
  }

  async function refreshSession(){
    const current=readStoredSession();
    if(!current?.refresh_token)return null;
    try{
      const payload=await request('/auth/v1/token?grant_type=refresh_token',{
        method:'POST',
        body:{refresh_token:current.refresh_token}
      });
      const next=normalizeSession(payload);
      writeStoredSession(next);
      return next;
    }catch{
      writeStoredSession(null);
      return null;
    }
  }

  async function getSession(){
    const session=readStoredSession();
    if(!session)return null;
    const now=Math.floor(Date.now()/1000);
    if(Number(session.expires_at||0)>now+60)return session;
    return refreshSession();
  }

  async function authenticatedRequest(path,options={}){
    let session=await getSession();
    if(!session)throw new Error('session expired.');
    try{
      return await request(path,{...options,token:session.access_token});
    }catch(error){
      if(error?.status!==401)throw error;
      session=await refreshSession();
      if(!session)throw new Error('session expired.');
      return request(path,{...options,token:session.access_token});
    }
  }

  function normalizeName(value){
    return String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
  }

  async function sha256Hex(value){
    const bytes=new TextEncoder().encode(value);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function usernameEmail(name){
    const hash=await sha256Hex(normalizeName(name));
    return`${hash}@users.today.boatbehind.online`;
  }

  async function backendPassword(name,password){
    return sha256Hex(`today-v1:${normalizeName(name)}:${password}`);
  }

  async function signUp(name,password){
    const username=String(name||'').trim();
    const usernameKey=normalizeName(username);
    const [email,authPassword]=await Promise.all([
      usernameEmail(username),
      backendPassword(username,password)
    ]);
    let payload=await request('/auth/v1/signup',{
      method:'POST',
      body:{
        email,
        password:authPassword,
        data:{username,username_key:usernameKey}
      }
    });
    let session=normalizeSession(payload);
    if(!session){
      payload=await request('/auth/v1/token?grant_type=password',{
        method:'POST',
        body:{email,password:authPassword}
      });
      session=normalizeSession(payload);
    }
    if(!session)throw new Error('account created, but sign in failed.');
    writeStoredSession(session);
    return session;
  }

  async function signIn(name,password){
    const [email,authPassword]=await Promise.all([
      usernameEmail(name),
      backendPassword(name,password)
    ]);
    const payload=await request('/auth/v1/token?grant_type=password',{
      method:'POST',
      body:{email,password:authPassword}
    });
    const session=normalizeSession(payload);
    if(!session)throw new Error('sign in failed.');
    writeStoredSession(session);
    return session;
  }

  async function signOut(){
    const session=readStoredSession();
    try{
      if(session?.access_token){
        await request('/auth/v1/logout',{method:'POST',token:session.access_token});
      }
    }finally{
      writeStoredSession(null);
    }
  }

  async function getProfile(userId){
    const rows=await authenticatedRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,username,username_key&limit=1`);
    return Array.isArray(rows)?rows[0]||null:null;
  }

  async function listTasks(){
    const rows=await authenticatedRequest('/rest/v1/tasks?select=id,user_id,body,task_date,task_time,priority,is_done,created_at,updated_at&order=task_date.asc,task_time.asc.nullslast,created_at.asc');
    return Array.isArray(rows)?rows:[];
  }

  async function upsertTasks(rows){
    if(!Array.isArray(rows)||!rows.length)return[];
    const result=await authenticatedRequest('/rest/v1/tasks?on_conflict=id',{
      method:'POST',
      body:rows,
      headers:{Prefer:'resolution=merge-duplicates,return=representation'}
    });
    return Array.isArray(result)?result:[];
  }

  async function deleteTask(id){
    await authenticatedRequest(`/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`,{
      method:'DELETE',
      headers:{Prefer:'return=minimal'}
    });
  }

  window.TodaySupabase=Object.freeze({
    configured,
    normalizeName,
    signUp,
    signIn,
    signOut,
    getSession,
    refreshSession,
    getProfile,
    listTasks,
    upsertTasks,
    deleteTask
  });
})();
