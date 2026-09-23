'use strict';
const $ = (s, root = document) => root.querySelector(s);
const app = $('#app'), modal = $('#modal');
const paths = {
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
 calendar:'M8 3v4M16 3v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',
 plus:'M12 5v14M5 12h14', chevron:'M9 5l7 7-7 7', left:'M15 5l-7 7 7 7',
 refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6', close:'M6 6l12 12M18 6L6 18',
 logout:'M9 3H4v18h5M10 12h11M17 8l4 4-4 4', edit:'M16 3l5 5-12 12H4v-5zM14 5l5 5',
 trash:'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
 sun:'M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
 moon:'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8', monitor:'M3 4h18v12H3zM8 20h8M12 16v4',
 grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
 columns:'M3 4h7v16H3zM14 4h7v16h-7z', lock:'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z'
};
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]}"/></svg>`; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const today = new Date(new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Warsaw'}).format(new Date()) + 'T12:00:00');
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addDays(d,n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function monday(d) { return addDays(d,-((d.getDay()+6)%7)); }
const fmt = (d, options) => d.toLocaleDateString('pl-PL',options);
const store = {get(k,f){try{return localStorage.getItem(k)||f;}catch{return f;}}, set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const COLORS = [['purple','Fioletowy'],['blue','Niebieski'],['green','Zielony'],['orange','Pomarańczowy'],['pink','Różowy']];
const THEMES = [['system','monitor','Systemowy'],['light','sun','Jasny'],['dark','moon','Ciemny']];
const mobile = matchMedia('(max-width:760px)');
const state = {checked:false, auth:false, configured:true, children:[], plans:[], week:monday(today), selected:'all',
 view:store.get('view', mobile.matches?'day':'week'), page:'plan', day:Math.min((today.getDay()+6)%7,6), loading:false, error:'', loadId:0, theme:store.get('theme','system')};

function applyTheme() {
 const root=document.documentElement;
 if(state.theme==='system')delete root.dataset.theme; else root.dataset.theme=state.theme;
 const dark=state.theme==='dark'||(state.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.querySelectorAll('meta[name=theme-color]').forEach(m=>{m.content=dark?'#0f1012':'#f7f7f8';m.removeAttribute('media');});
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);

async function api(path, options = {}) {
 let response;
 try { response = await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json','X-Dzwonek':'1',...options.headers}}); }
 catch { throw new Error('Brak połączenia. Sprawdź internet i spróbuj ponownie.'); }
 const result = await response.json().catch(()=>({}));
 if (!response.ok) {
   if (response.status===401 && path!=='/login') { Object.assign(state,{auth:false,children:[],plans:[],selected:'all',page:'plan',loading:false});state.loadId++;modal.open&&modal.close();render(); }
   throw new Error(typeof result.detail==='string'?result.detail:'Sprawdź poprawność wprowadzonych danych.');
 }
 return result;
}
function initials(name) { return esc((name||'?').trim().charAt(0).toUpperCase()); }
function avatar(c, size='') { return `<span class="avatar ${size} c-${esc(c.color)}">${c.photo?`<img src="${esc(c.photo)}" alt="">`:initials(c.name)}</span>`; }
function brand() { return `<span class="brand"><span class="brand-mark">${icon('bell')}</span><span class="brand-name">Dzwonek</span></span>`; }
function themeButton() { const t=THEMES.find(t=>t[0]===state.theme)||THEMES[0]; return `<button class="icon-btn" data-action="theme-cycle" aria-label="Motyw: ${t[2]}" title="Motyw: ${t[2]}">${icon(t[1])}</button>`; }
function selectedPlans() { return state.plans.filter(p => state.selected==='all'||p.child.id===state.selected); }
function dayDate() { return addDays(state.week,state.day); }

function render() {
 if(!state.checked){app.innerHTML=`<div class="splash" role="status" aria-label="Ładowanie"><span class="spinner"></span></div>`;return;}
 if(!state.auth){renderLogin();return;}
 const settings=state.page==='settings';
 app.innerHTML=`<div class="shell"><header class="topbar"><div class="topbar-inner">${brand()}
 <nav class="tabs" aria-label="Menu główne"><button data-action="plan" class="${!settings?'active':''}" ${!settings?'aria-current="page"':''}>${icon('calendar')}<span>Plan</span></button><button data-action="settings" class="${settings?'active':''}" ${settings?'aria-current="page"':''}>${icon('users')}<span>Konta</span></button></nav>
 <div class="topbar-actions">${themeButton()}<button class="icon-btn" data-action="logout" aria-label="Wyloguj się" title="Wyloguj się">${icon('logout')}</button></div></div></header>
 <main class="content">${state.error?`<div class="banner error" role="alert">${esc(state.error)}</div>`:''}${settings?renderSettings():renderPlan()}</main></div>`;
}

function renderLogin() {
 app.innerHTML=`<main class="login"><div class="login-top">${themeButton()}</div><div class="login-card">
 <span class="brand-mark large">${icon('bell')}</span><h1>Dzwonek</h1><p class="muted">Zaloguj się kontem Librus Synergia. Na tym urządzeniu zrobisz to tylko raz.</p>
 ${!state.configured?'<div class="banner error">Ustaw zmienną ENCRYPTION_KEY na serwerze, aby włączyć logowanie.</div>':''}
 ${state.error?`<div class="banner error" role="alert">${esc(state.error)}</div>`:''}
 <form id="login-form"><label for="login-user">Login</label><input id="login-user" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false">
 <label for="login-password">Hasło</label><input id="login-password" name="password" type="password" required autocomplete="current-password">
 <div class="form-error" role="alert"></div><button class="btn primary block" type="submit">Zaloguj się</button></form>
 <p class="fine">${icon('lock')}Dane logowania są szyfrowane na serwerze i służą wyłącznie do pobierania planu lekcji.</p></div></main>`;
}

function renderPlan() {
 const children=state.children, plans=selectedPlans(), current=iso(state.week)===iso(monday(today));
 const end=addDays(state.week,6), sameMonth=state.week.getMonth()===end.getMonth();
 const title=`${fmt(state.week,sameMonth?{day:'numeric'}:{day:'numeric',month:'short'})} – ${fmt(end,{day:'numeric',month:'long'})}`;
 let html=`<div class="toolbar"><div class="week-nav"><button class="icon-btn" data-action="prev" aria-label="Poprzedni tydzień">${icon('left')}</button><h1 class="week-title">${title}<small>${current?'Bieżący tydzień':state.week.getFullYear()}</small></h1><button class="icon-btn" data-action="next" aria-label="Następny tydzień">${icon('chevron')}</button>${current?'':`<button class="btn small" data-action="today">Dziś</button>`}</div>
 <div class="toolbar-right"><div class="segmented" role="group" aria-label="Widok planu">${[['week','grid','Tydzień'],['day','list','Dzień'],['compare','columns','Kolumny']].filter(v=>v[0]!=='compare'||children.length>1).map(([v,i,t])=>`<button data-action="view" data-view="${v}" class="${state.view===v?'active':''}" aria-pressed="${state.view===v}" title="${t}">${icon(i)}<span>${t}</span></button>`).join('')}</div>
 <button class="icon-btn" data-action="refresh" aria-label="Odśwież plan" title="Odśwież plan" ${state.loading?'disabled':''}>${icon('refresh')}</button></div></div>`;
 if(children.length>1) html+=`<div class="chips" role="group" aria-label="Wybierz ucznia"><button class="chip ${state.selected==='all'?'active':''}" data-action="select" data-id="all" aria-pressed="${state.selected==='all'}">Wszyscy</button>${children.map(c=>`<button class="chip ${state.selected===c.id?'active':''}" data-action="select" data-id="${esc(c.id)}" aria-pressed="${state.selected===c.id}">${avatar(c,'xs')}${esc(c.name)}</button>`).join('')}</div>`;
 if(!children.length&&!state.loading) return html+`<div class="panel empty"><h2>Brak kont</h2><p>Dodaj konto Librus Synergia, aby zobaczyć plan lekcji.</p><button class="btn primary" data-action="add">${icon('plus')}Dodaj konto</button></div>`;
 if(state.loading&&!state.plans.length) return html+`<div class="panel loading" role="status"><span class="spinner"></span>Pobieranie planu…</div>`;
 for(const p of plans) if(p.error) html+=`<div class="banner warn">${children.length>1?`<b>${esc(p.child.name)}:</b> `:''}${esc(p.error)} ${p.updated?'Wyświetlany jest zapisany plan.':'Brak zapisanego planu na ten tydzień.'}</div>`;
 html+=state.view==='week'?weekView(plans):dayView(plans);
 const updated=plans.filter(p=>p.updated).map(p=>p.updated);
 html+=`<p class="updated">${state.loading?'Odświeżanie…':updated.length?'Zaktualizowano '+new Date(Math.min(...updated)*1000).toLocaleString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</p>`;
 return html;
}

function lessonHTML(p,l,index,withName,withTime=true) {
 const badge=l.status==='cancelled'?'<span class="badge danger">Odwołana</span>':l.status==='changed'?'<span class="badge warn">Zmiana</span>':'';
 return `<button class="lesson c-${esc(p.child.color)} ${l.status}" data-action="lesson" data-id="${esc(p.child.id)}" data-index="${index}">${withTime||withName?`<span class="lesson-meta"><span>${withTime?`${esc(l.start)}–${esc(l.end)}`:''}</span>${withName?`<span class="who">${esc(p.child.name)}</span>`:''}</span>`:''}<strong>${esc(l.subject)}</strong>${l.details?`<span class="details">${esc(l.details)}</span>`:''}${badge}</button>`;
}

function weekView(plans) {
 const weekend=plans.some(p=>p.lessons.some(l=>new Date(l.date+'T12:00:00').getDay()%6===0));
 const dates=Array.from({length:weekend?7:5},(_,n)=>addDays(state.week,n));
 const slots=[...new Set(plans.flatMap(p=>p.lessons.map(l=>l.start)))].sort();
 const many=plans.length>1;
 if(!slots.length) return `<div class="panel empty"><h2>Brak lekcji w tym tygodniu</h2><p>${plans.some(p=>p.error)?'Nie udało się pobrać planu. Spróbuj odświeżyć później.':'Librus nie zwrócił zajęć na wybrany tydzień.'}</p></div>`;
 let html=`<div class="panel grid-scroll"><div class="week-grid" style="--days:${dates.length}"><div class="grid-corner"></div>${dates.map(d=>`<div class="day-head ${iso(d)===iso(today)?'today':''}"><span>${fmt(d,{weekday:'short'}).replace('.','')}</span><b>${d.getDate()}</b></div>`).join('')}`;
 for(const start of slots){
  html+=`<div class="time-cell">${esc(start)}</div>`;
  for(const d of dates){
   let cards='';
   for(const p of plans) p.lessons.forEach((l,i)=>{if(l.date===iso(d)&&l.start===start)cards+=lessonHTML(p,l,i,many);});
   html+=`<div class="lesson-cell ${iso(d)===iso(today)?'today':''}">${cards}</div>`;
  }
 }
 return html+`</div></div>`;
}

function dayTabs() {
 const days=state.plans.some(p=>p.lessons.some(l=>new Date(l.date+'T12:00:00').getDay()%6===0))||state.day>4?7:5;
 return `<div class="day-tabs" role="group" aria-label="Dzień tygodnia">${Array.from({length:days},(_,n)=>{const d=addDays(state.week,n);return `<button data-action="day" data-day="${n}" class="${state.day===n?'active':''} ${iso(d)===iso(today)?'today':''}" aria-pressed="${state.day===n}"><span>${fmt(d,{weekday:'short'}).replace('.','')}</span><b>${d.getDate()}</b></button>`;}).join('')}</div>`;
}

function dayView(plans){
 const date=iso(dayDate()), many=plans.length>1;
 let html=dayTabs();
 if(state.view==='compare'&&many){
  return html+`<div class="comparison" style="--columns:${plans.length}">${plans.map(p=>{
   const lessons=p.lessons.map((l,i)=>({l,i})).filter(({l})=>l.date===date);
   return `<section class="panel column"><div class="column-head">${avatar(p.child,'sm')}<div><strong>${esc(p.child.name)}</strong><small>${lessons.filter(x=>x.l.status!=='cancelled').length} lekcji</small></div></div><div class="stack">${lessons.length?lessons.map(({l,i})=>lessonHTML(p,l,i,false)).join(''):'<p class="muted center">Brak lekcji</p>'}</div></section>`;
  }).join('')}</div>`;
 }
 const all=plans.flatMap(p=>p.lessons.map((l,i)=>({p,l,i})).filter(x=>x.l.date===date)).sort((a,b)=>a.l.start.localeCompare(b.l.start)||a.p.child.name.localeCompare(b.p.child.name));
 if(!all.length) return html+`<div class="panel empty"><h2>Brak lekcji</h2><p>${fmt(dayDate(),{weekday:'long',day:'numeric',month:'long'})} — w pobranym planie nie ma zajęć.</p></div>`;
 return html+`<div class="panel agenda">${all.map(({p,l,i})=>`<div class="agenda-row"><div class="agenda-time">${esc(l.start)}<small>${esc(l.end)}</small></div>${lessonHTML(p,l,i,many,false)}</div>`).join('')}</div>`;
}

function renderSettings(){
 return `<div class="settings"><section class="panel"><div class="panel-head"><div><h2>Konta Librus</h2><p class="muted">Każdy uczeń ma osobne konto Synergia. Możesz zalogować się dowolnym z nich.</p></div><button class="btn primary small" data-action="add" ${state.children.length>=8?'disabled':''}>${icon('plus')}Dodaj</button></div>
 <ul class="account-list">${state.children.map(c=>`<li>${avatar(c,'sm')}<div class="account-name"><strong>${esc(c.name)}</strong><small>Librus Synergia</small></div><button class="icon-btn" data-action="edit" data-id="${esc(c.id)}" aria-label="Edytuj ${esc(c.name)}" title="Edytuj">${icon('edit')}</button><button class="icon-btn danger" data-action="remove" data-id="${esc(c.id)}" aria-label="Usuń ${esc(c.name)}" title="Usuń">${icon('trash')}</button></li>`).join('')||'<li class="muted">Brak kont.</li>'}</ul></section>
 <section class="panel"><div class="panel-head"><div><h2>Wygląd</h2><p class="muted">Motyw aplikacji na tym urządzeniu.</p></div></div><div class="segmented wide" role="group" aria-label="Motyw">${THEMES.map(([v,i,t])=>`<button data-action="theme" data-theme="${v}" class="${state.theme===v?'active':''}" aria-pressed="${state.theme===v}">${icon(i)}<span>${t}</span></button>`).join('')}</div></section>
 <section class="panel"><div class="panel-head"><div><h2>Sesja</h2><p class="muted">Pozostajesz zalogowany na tym urządzeniu, dopóki się nie wylogujesz.</p></div><button class="btn small" data-action="logout">${icon('logout')}Wyloguj</button></div></section></div>`;
}

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3500);}
function showDialog(title,body){modal.innerHTML=`<div class="dialog-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="Zamknij">${icon('close')}</button></div>${body}`;if(!modal.open)modal.showModal();}

function profileDialog(id){
 const c=state.children.find(c=>c.id===id)||{name:'',color:COLORS[state.children.length%COLORS.length][0],photo:'',emoji:'🙂'};
 showDialog(id?'Edytuj konto':'Dodaj konto',`<form id="profile-form" data-id="${esc(id||'')}">
 <label for="child-name">Imię</label><input id="child-name" name="name" value="${esc(c.name)}" maxlength="40" ${id?'required':''} autocomplete="off" placeholder="${id?'':'Zostaw puste, aby pobrać z Librusa'}">
 <input type="hidden" name="emoji" value="${esc(c.emoji||'🙂')}">
 <label>Kolor</label><input type="hidden" name="color" value="${esc(c.color)}"><div class="swatches">${COLORS.map(([col,label])=>`<button type="button" class="swatch c-${col} ${col===c.color?'selected':''}" data-action="color" data-color="${col}" aria-label="${label}" aria-pressed="${col===c.color}"></button>`).join('')}</div>
 <label for="child-photo">Zdjęcie <span class="optional">opcjonalnie</span></label><div class="photo-row"><span class="photo-preview">${c.photo?`<img src="${esc(c.photo)}" alt="">`:''}</span><input type="file" id="child-photo" accept="image/jpeg,image/png,image/webp">${c.photo?'<button class="btn small" data-action="clear-photo" type="button">Usuń</button>':''}</div><input type="hidden" name="photo" value="${esc(c.photo)}">
 <div class="divider"></div>
 <label for="librus-user">Login Librus${id?' <span class="optional">tylko przy zmianie konta</span>':''}</label><input id="librus-user" name="username" ${id?'':'required'} autocomplete="off" autocapitalize="none" spellcheck="false">
 <label for="librus-password">Hasło Librus${id?' <span class="optional">zostaw puste bez zmian</span>':''}</label><input id="librus-password" name="password" type="password" ${id?'':'required'} autocomplete="new-password">
 <div class="form-error" role="alert"></div><div class="form-actions"><button class="btn" data-action="close" type="button">Anuluj</button><button class="btn primary" type="submit">${id?'Zapisz':'Dodaj konto'}</button></div></form>`);
}

async function load(refresh=false){
 const id=++state.loadId;
 state.loading=true;state.error='';render();
 try{
  const children=await api('/children');
  if(id!==state.loadId)return;
  state.children=children;render();
  const result=await api(`/timetable?week=${iso(state.week)}&refresh=${refresh}`);
  if(id!==state.loadId)return;
  state.plans=result.plans;
  if(!children.some(c=>c.id===state.selected))state.selected='all';
 }catch(e){if(id!==state.loadId)return;state.error=state.auth?e.message:'';}
 if(id===state.loadId){state.loading=false;render();}
}

async function changePhoto(file){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Wybierz zdjęcie JPG, PNG lub WebP.');return;}
 if(file.size>10*1024*1024){toast('Wybierz zdjęcie mniejsze niż 10 MB.');return;}
 const submit=$('#profile-form button[type=submit]');submit.disabled=true;
 try{
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const edge=Math.min(image.width,image.height);
  canvas.getContext('2d').drawImage(image,(image.width-edge)/2,(image.height-edge)/2,edge,edge,0,0,256,256);
  const photo=canvas.toDataURL('image/jpeg',.85);
  $('[name=photo]',modal).value=photo;$('.photo-preview',modal).innerHTML=`<img src="${photo}" alt="">`;
 }catch{toast('Nie udało się otworzyć zdjęcia. Wybierz inny plik.');}finally{submit.disabled=false;}
}

document.addEventListener('change',e=>{if(e.target.id==='child-photo')changePhoto(e.target.files[0]);});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const a=b.dataset.action;
 if(a==='close'){modal.close();return;}
 if(a==='add'||a==='edit'){profileDialog(a==='edit'?b.dataset.id:null);return;}
 if(a==='plan'||a==='settings'){state.page=a;render();return;}
 if(a==='select'){state.selected=b.dataset.id;render();return;}
 if(a==='view'){state.view=b.dataset.view;store.set('view',state.view);render();return;}
 if(a==='day'){state.day=Number(b.dataset.day);render();return;}
 if(a==='theme'||a==='theme-cycle'){
  state.theme=a==='theme'?b.dataset.theme:THEMES[(THEMES.findIndex(t=>t[0]===state.theme)+1)%THEMES.length][0];
  store.set('theme',state.theme);applyTheme();
  const form=$('#login-form'),saved=form&&Object.fromEntries(new FormData(form));
  render();if(saved){$('#login-user').value=saved.username;$('#login-password').value=saved.password;}
  return;
 }
 if(a==='prev'||a==='next'||a==='today'){
  const next=a==='today'?monday(today):addDays(state.week,a==='next'?7:-7);
  if(Math.abs(next-today)>365*86400000){toast('Wybierz tydzień w zakresie jednego roku.');return;}
  state.week=next;state.plans=[];
  if(a==='today')state.day=(today.getDay()+6)%7;
  await load();return;
 }
 if(a==='refresh'){await load(true);if(!state.error)toast('Plan jest aktualny');return;}
 if(a==='logout'){
  try{await api('/logout',{method:'POST'});Object.assign(state,{auth:false,children:[],plans:[],selected:'all',page:'plan',error:''});state.loadId++;modal.open&&modal.close();render();}catch(e){toast(e.message);}return;
 }
 if(a==='color'){$('[name=color]',modal).value=b.dataset.color;modal.querySelectorAll('.swatch').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',el===b);});return;}
 if(a==='clear-photo'){$('[name=photo]',modal).value='';$('#child-photo').value='';$('.photo-preview',modal).innerHTML='';b.remove();return;}
 if(a==='remove'){
  const c=state.children.find(c=>c.id===b.dataset.id);
  showDialog(`Usunąć konto ${c.name}?`,`<p class="muted">Zapisane dane logowania i pobrane plany zostaną usunięte z Dzwonka. Konto w Librusie pozostanie bez zmian.</p><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn" data-action="close">Anuluj</button><button class="btn danger" data-action="confirm-remove" data-id="${esc(c.id)}">Usuń</button></div>`);return;
 }
 if(a==='confirm-remove'){b.disabled=true;try{await api('/children/'+b.dataset.id,{method:'DELETE'});modal.close();await load();toast('Konto zostało usunięte.');}catch(e){$('.form-error',modal).textContent=e.message;b.disabled=false;}return;}
 if(a==='lesson'){
  const p=state.plans.find(p=>p.child.id===b.dataset.id),l=p.lessons[Number(b.dataset.index)];
  showDialog(l.subject,`<p class="muted">${esc(p.child.name)} · ${fmt(new Date(l.date+'T12:00:00'),{weekday:'long',day:'numeric',month:'long'})}</p><dl class="facts"><dt>Godzina</dt><dd>${esc(l.start)} – ${esc(l.end)}${l.number?` · lekcja ${esc(l.number)}`:''}</dd><dt>Sala i nauczyciel</dt><dd>${esc(l.details)||'Brak informacji'}</dd>${l.note?`<dt>Uwagi</dt><dd>${esc(l.note)}</dd>`:''}</dl><div class="form-actions"><button class="btn primary" data-action="close">Zamknij</button></div>`);return;
 }
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['login-form','profile-form'].includes(f.id))return;e.preventDefault();
 const button=$('button[type=submit]',f),error=$('.form-error',f),old=button.innerHTML;
 button.disabled=true;error.textContent='';button.textContent='Łączenie z Librusem…';
 try{
  const data=Object.fromEntries(new FormData(f));
  if(f.id==='login-form'){await api('/login',{method:'POST',body:JSON.stringify(data)});Object.assign(state,{auth:true,children:[],plans:[],selected:'all',page:'plan',error:''});await load();return;}
  await api('/children'+(f.dataset.id?'/'+f.dataset.id:''),{method:f.dataset.id?'PUT':'POST',body:JSON.stringify(data)});
  modal.close();await load();toast('Zapisano.');
 }catch(e){error.textContent=e.message;}
 finally{if(f.isConnected){button.disabled=false;button.innerHTML=old;}}
});
mobile.addEventListener('change',()=>state.auth&&render());
window.addEventListener('offline',()=>{state.error='Jesteś offline. Plan może być nieaktualny.';render();});
window.addEventListener('online',()=>state.auth&&load());
async function init(){
 applyTheme();render();
 try{const s=await api('/session');state.auth=s.authenticated;state.configured=s.configured;}
 catch(e){state.error=e.message;}
 state.checked=true;
 if(state.auth)await load();else render();
}
init();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
