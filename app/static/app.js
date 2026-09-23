'use strict';
const $ = (s, root = document) => root.querySelector(s);
const app = $('#app'), modal = $('#modal');
const paths = {
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1',
 calendar:'M5 3v4M19 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2M7 14h2M13 14h2M7 17h2',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',
 plus:'M12 5v14M5 12h14', chevron:'M9 5l7 7-7 7', left:'M15 5l-7 7 7 7',
 phone:'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2M10 18h4',
 heart:'M20 4c-3-3-7-1-8 2-1-3-5-5-8-2-4 4 0 9 8 16 8-7 12-12 8-16',
 refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6', lock:'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2',
 grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 columns:'M3 4h7v16H3zM14 4h7v16h-7z', close:'M6 6l12 12M18 6L6 18',
 logout:'M9 3H3v18h6M10 12h11M17 8l4 4-4 4', check:'M5 12l4 4L19 6', clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', edit:'M16 3l5 5-12 12H4v-5zM14 5l5 5', download:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4'
};
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.calendar}"/></svg>`; }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const today = new Date(new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Warsaw'}).format(new Date()) + 'T12:00:00');
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function addDays(d,n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function monday(d) { return addDays(d,-((d.getDay()+6)%7)); }
const fmt = (d, options) => d.toLocaleDateString('pl-PL',options);
const state = {auth:false, configured:true, demo:true, children:[], plans:[], week:monday(today), selected:'all', view:matchMedia('(max-width:760px)').matches?'day':'week', page:'plan', day:(today.getDay()+6)%7, loading:true, error:'', loadId:0};
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt=e; });
const demoChildren = [{id:'demo-1', name:'Zosia', emoji:'🌸', color:'purple', photo:''}, {id:'demo-2',name:'Antek',emoji:'🦊',color:'green',photo:''}, {id:'demo-3',name:'Maja',emoji:'🌻',color:'orange',photo:''}];
function demoPlans() {
 const subjects = [['Język polski','Matematyka','Język angielski','Przyroda','Historia','Wychowanie fizyczne'],['Matematyka','Język polski','Informatyka','Język angielski','Muzyka'],['Edukacja polonistyczna','Edukacja matematyczna','Język angielski','Plastyka']];
 const times = [['08:00','08:45'],['08:55','09:40'],['09:50','10:35'],['10:55','11:40'],['11:50','12:35'],['12:45','13:30'],['13:40','14:25']];
 return demoChildren.map((child,c) => ({child, updated:null, error:null, lessons:Array.from({length:5},(_,d) => subjects[c].map((_,n) => ({date:iso(addDays(state.week,d)),start:times[n][0],end:times[n][1],number:n+1,subject:subjects[c][(n+d)%subjects[c].length],details:`Sala ${[24,12,8,31,16,5][(n+c)%6]}`,status:c===0&&d===2&&n===3?'changed':c===1&&d===3&&n===4?'cancelled':'regular',note:c===0&&d===2&&n===3?'Zastępstwo — zmiana sali':c===1&&d===3&&n===4?'Lekcja odwołana':''}))).flat()}));
}
async function api(path, options = {}) {
 let response;
 try { response = await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json','X-Dzwonek':'1',...options.headers}}); }
 catch { throw new Error('Brak połączenia. Sprawdź internet i spróbuj ponownie.'); }
 const result = await response.json();
 if (!response.ok) {
   if (response.status===401 && path!='/login') { state.auth=false; state.demo=true; state.children=[]; state.plans=[]; state.selected='all'; state.loadId++; state.loading=false; render(); }
   throw new Error(typeof result.detail==='string'?result.detail:'Sprawdź poprawność wprowadzonych danych.');
 }
 return result;
}
function avatar(c, large=false) { return `<span class="avatar ${large?'large ':''}${c.color}">${c.photo?`<img src="${esc(c.photo)}" alt="Zdjęcie: ${esc(c.name)}">`:esc(c.emoji)}</span>`; }
function brand() { return `<a class="brand" href="/" aria-label="Dzwonek — strona główna"><span class="brand-icon">${icon('bell')}</span><span>dzwonek<small>MAŁE PLANY. WIELKI SPOKÓJ.</small></span></a>`; }
function selectedPlans() { return state.plans.filter(p => state.selected==='all'||p.child.id===state.selected); }
function currentLessons(p) { return p.lessons.filter(l => l.date===iso(addDays(state.week,state.day)) && l.status!=='cancelled'); }
function profileCards() {
 return `<button class="profile-card all-card ${state.selected==='all'?'selected':''}" data-action="select" data-id="all" aria-pressed="${state.selected==='all'}"><span class="avatar">🏡</span><span><strong>Razem</strong><small>Wszystkie dzieci</small></span></button>` + state.children.map(c => {
   const p=state.plans.find(p=>p.child.id===c.id), lessons=p?currentLessons(p):[];
   const end=lessons.length?lessons.map(l=>l.end).sort().at(-1):'';
   return `<button class="profile-card ${c.color} ${state.selected===c.id?'selected':''}" data-action="select" data-id="${c.id}" aria-pressed="${state.selected===c.id}">${avatar(c,true)}<span><strong>${esc(c.name)}</strong><small>${state.loading?'Pobieranie planu…':lessons.length?`${lessons.length} lekcji · do ${end}`:'Dzień bez lekcji'}</small></span><span class="tag">${state.demo?'Przykład':'Librus'}</span></button>`;
 }).join('') + `<button class="profile-add" data-action="add" aria-label="Dodaj dziecko">${icon('plus')}</button>`;
}
function render() {
 const isSettings=state.page==='children';
 app.innerHTML = `<div class="shell"><aside class="sidebar">${brand()}<div class="nav-label">Nasza przestrzeń</div><nav><button class="nav-item ${!isSettings?'active':''}" data-action="plan">${icon('calendar')} Plan lekcji</button><button class="nav-item ${isSettings?'active':''}" data-action="children">${icon('users')} Moja rodzina <span class="count">${state.children.length}</span></button></nav><div class="nav-label">Dzieci</div><div class="side-children"><button class="child-nav ${state.selected==='all'?'active':''}" data-action="select" data-id="all"><span class="avatar">👨‍👩‍👧‍👦</span>Wszystkie dzieci</button>${state.children.map(c=>`<button class="child-nav ${c.color} ${state.selected===c.id?'active':''}" data-action="select" data-id="${c.id}">${avatar(c)}${esc(c.name)}<i class="dot"></i></button>`).join('')}<button class="nav-item" data-action="add">${icon('plus')} Dodaj dziecko</button></div><div class="side-bottom"><div class="install-card">${icon('phone')}<strong>Plan zawsze pod ręką</strong>Dodaj Dzwonek do ekranu głównego telefonu.<br><button data-action="install">Zobacz, jak to zrobić ↗</button></div><div class="side-foot">${icon('heart')} Z myślą o Twojej rodzinie</div></div></aside>
 <main class="main"><header class="topbar"><div class="mobile-brand">${brand()}</div><div class="breadcrumb">Nasza przestrzeń <span aria-hidden="true"> / </span> <b>${isSettings?'Moja rodzina':'Plan lekcji'}</b></div><div class="topbar-right"><div class="status"><i></i>${state.demo?'Wersja demonstracyjna':'Twoja prywatna przestrzeń'}</div><span>Nasza rodzina</span><div class="family-icon">🏡</div><button class="icon-btn" data-action="${state.auth?'logout':'login'}" aria-label="${state.auth?'Wyloguj się':'Zaloguj się'}" title="${state.auth?'Wyloguj się':'Zaloguj się'}">${icon(state.auth?'logout':'lock')}</button></div></header>
 ${state.demo?`<div class="demo-bar"><span>Oglądasz przykładową rodzinę i fikcyjne plany.</span><button data-action="login">Połącz swoją rodzinę →</button></div>`:''}
 <div class="page-heading"><div><div class="eyebrow">${fmt(today,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div><h1>${isSettings?'Każdy ma swój kolor.':'Dobry plan na każdy dzień.'}</h1><p class="subtitle">${isSettings?'Twoje dzieci. Ich małe światy. Wszystko w jednym miejscu.':'Mniej szukania, więcej spokoju. Plany całej rodziny w jednym miejscu.'}</p></div><button class="btn ${isSettings?'primary':''}" data-action="${isSettings?'add':'refresh'}" ${state.loading?'disabled':''}>${icon(isSettings?'plus':'refresh')}${isSettings?'Dodaj dziecko':'Odśwież plan'}</button></div>
 ${state.error?`<div class="error-banner" role="alert">${esc(state.error)}</div>`:''}
 ${isSettings?renderSettings():renderPlan()}
 <div class="bottom-note">${icon('lock')} ${state.demo?'Wypróbuj widoki — dane demonstracyjne są fikcyjne.':'Dane logowania i plany są szyfrowane na serwerze.'}</div></main>
 <nav class="mobile-nav" aria-label="Menu główne"><button data-action="plan" class="${!isSettings?'active':''}">${icon('calendar')}Plan lekcji</button><button data-action="children" class="${isSettings?'active':''}">${icon('users')}Rodzina</button><button data-action="install">${icon('phone')}Na telefonie</button></nav></div>`;
}
function renderPlan() {
 const children=state.children, plans=selectedPlans();
 const summary=state.selected==='all'?'Wszyscy razem. Każdy po swojemu.':`Plan dla ${esc(children.find(c=>c.id===state.selected)?.name||'dziecka')}`;
 let html=`<section class="welcome"><div><h2>${summary}</h2><p>Sprawdź, kto zaczyna pierwszy, kto kończy wcześniej<br>i co dobrego przyniesie ten tydzień.</p><span class="mini-pill">${icon('heart').replace('<svg','<svg style="width:11px;height:11px"')} Rodzinny rytm, pod kontrolą</span></div><div class="hero-art" aria-hidden="true"><div class="paper"><span></span><span></span><span></span></div><div class="pencil"></div><span class="spark">✧</span><span class="spark two">✦</span></div></section>`;
 if (!children.length&&!state.loading) return html+`<div class="plan-panel empty"><div class="empty-icon">🌱</div><h2>Zacznijmy od pierwszego dziecka</h2><p>Dodaj imię, ulubioną emotkę i konto Librus Synergia. Plan pojawi się tutaj automatycznie.</p><button class="btn primary" data-action="add">${icon('plus')}Dodaj dziecko</button></div>`;
 html+=`<div class="profile-strip">${profileCards()}</div><div class="toolbar"><div class="week-nav"><div class="nav-arrows"><button class="icon-btn" data-action="prev" aria-label="Poprzedni tydzień">${icon('left')}</button><button class="icon-btn" data-action="next" aria-label="Następny tydzień">${icon('chevron')}</button></div><div class="week-title">${fmt(state.week,{day:'numeric'})}${state.week.getMonth()!==addDays(state.week,6).getMonth()?' '+fmt(state.week,{month:'short'}):''} – ${fmt(addDays(state.week,6),{day:'numeric',month:'long'})}<small>${state.week.getFullYear()} · ${iso(state.week)===iso(monday(today))?'bieżący tydzień':'plan tygodnia'}</small></div><button class="today-btn" data-action="today">Dzisiaj</button></div><div class="segmented" aria-label="Widok planu">${[['week','grid','Tydzień'],['day','calendar','Dzień'],['compare','columns','Obok siebie']].map(([v,i,t])=>`<button data-action="view" data-view="${v}" class="${state.view===v?'active':''}" aria-pressed="${state.view===v}">${icon(i)}${t}</button>`).join('')}</div></div>`;
 if (state.loading) return html+`<div class="plan-panel loading" role="status"><span class="spinner"></span><div>Pobieramy plany Twojej rodziny…</div></div>`;
 if (!plans.length) return html;
 for (const p of plans) if(p.error) html+=`<div class="error-banner">${esc(p.child.name)}: ${esc(p.error)} ${p.updated?'Wyświetlamy zapisany plan.':'Brak zapisanego planu na ten tydzień.'}</div>`;
 html+=state.view==='week'?weekView(plans):dayView(plans);
 return html;
}
function lessonHTML(p,l,index) {
 return `<button class="lesson ${p.child.color} ${l.status==='cancelled'?'cancelled':''}" data-action="lesson" data-id="${p.child.id}" data-index="${index}"><span class="lesson-top"><span>${esc(p.child.emoji)}</span>${esc(p.child.name)}<span class="lesson-time">${esc(l.start)}–${esc(l.end)}</span></span><strong>${esc(l.subject)}</strong><span class="details">${esc(l.details)||'Szczegóły w Librusie'}</span>${l.status!=='regular'?`<span class="change">${l.status==='cancelled'?'Odwołana':'Zmiana w planie'}</span>`:''}</button>`;
}
function weekView(plans) {
 const weekend=plans.some(p=>p.lessons.some(l=>new Date(l.date+'T12:00:00').getDay()%6===0));
 const days=weekend?7:5;
 const slots=[...new Set(plans.flatMap(p=>p.lessons.map(l=>l.start)))].sort();
 const dates=Array.from({length:days},(_,n)=>addDays(state.week,n));
 const legend=plans.map(p=>`<span class="${p.child.color}"><i class="dot"></i>${esc(p.child.name)}</span>`).join('');
 const updated=plans.filter(p=>p.updated).map(p=>p.updated);
 let html=`<section class="plan-panel"><div class="plan-top"><div class="legend">${legend}</div><span class="label">${icon('calendar')} ${state.selected==='all'?'Wspólny plan rodziny':'Plan dziecka'}</span></div>`;
 if (!slots.length) return html+`<div class="empty"><div class="empty-icon">☀️</div><h2>W tym tygodniu bez lekcji</h2><p>${plans.some(p=>p.error)?'Nie udało się pobrać planu. Spróbuj odświeżyć później.':'Librus nie zwrócił zajęć na wybrany tydzień.'}</p></div></section>`;
 html+=`<div class="grid-scroll"><div class="week-grid ${weekend?'seven':''}"><div class="day-head">${icon('clock')}</div>${dates.map(d=>`<div class="day-head ${iso(d)===iso(today)?'is-today':''}"><span>${fmt(d,{weekday:'short'}).replace('.','')}</span><b>${d.getDate()}</b></div>`).join('')}`;
 for(const start of slots){
   html+=`<div class="time-cell"><strong>${esc(start)}</strong></div>`;
   for(const d of dates){
     let cards='';
     for(const p of plans) p.lessons.forEach((l,i)=>{if(l.date===iso(d)&&l.start===start)cards+=lessonHTML(p,l,i);});
     html+=`<div class="lesson-cell ${iso(d)===iso(today)?'today':''}">${cards||'<div class="free-cell">·</div>'}</div>`;
   }
 }
 html+=`</div></div><div class="plan-footer"><span>${state.demo?'Dane przykładowe':updated.length?'Ostatnie pobranie: '+new Date(Math.min(...updated)*1000).toLocaleString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Brak pobranego planu'}</span><span>Kliknij lekcję, aby zobaczyć szczegóły</span></div></section>`;
 return html;
}
function dayView(plans){
 let html=`<div class="days-tabs" aria-label="Dzień tygodnia">${Array.from({length:7},(_,n)=>`<button data-action="day" data-day="${n}" class="${state.day===n?'active':''}" aria-pressed="${state.day===n}">${fmt(addDays(state.week,n),{weekday:'short'}).replace('.','')} ${addDays(state.week,n).getDate()}</button>`).join('')}</div>`;
 if(state.view==='compare'){
  return html+`<div class="comparison ${plans.length===1?'single':''}" style="--columns:${plans.length}">${plans.map(p=>{
    const lessons=p.lessons.map((l,i)=>({l,i})).filter(({l})=>l.date===iso(addDays(state.week,state.day)));
    return `<section class="child-column"><div class="column-head ${p.child.color}">${avatar(p.child,true)}<div><strong>${esc(p.child.name)}</strong><small>${lessons.filter(x=>x.l.status!=='cancelled').length} lekcji · ${fmt(addDays(state.week,state.day),{day:'numeric',month:'long'})}</small></div></div><div class="column-lessons">${lessons.length?lessons.map(({l,i})=>lessonHTML(p,l,i)).join(''):'<div class="empty">☀️<p>Dzień bez lekcji</p></div>'}</div></section>`;
  }).join('')}</div>`;
 }
 const all=plans.flatMap(p=>p.lessons.map((l,i)=>({p,l,i})).filter(x=>x.l.date===iso(addDays(state.week,state.day)))).sort((a,b)=>a.l.start.localeCompare(b.l.start)||a.p.child.name.localeCompare(b.p.child.name));
 return html+`<section class="plan-panel"><div class="plan-top"><strong>${fmt(addDays(state.week,state.day),{weekday:'long',day:'numeric',month:'long'})}</strong><span class="label">${all.filter(x=>x.l.status!=='cancelled').length} lekcji</span></div><div class="column-lessons">${all.length?all.map(({p,l,i})=>lessonHTML(p,l,i)).join(''):'<div class="empty"><div class="empty-icon">☀️</div><h2>Dzień bez lekcji</h2><p>Na ten dzień nie ma zajęć w pobranym planie.</p></div>'}</div></section>`;
}
function renderSettings(){
 return `<div class="settings-grid">${state.children.map(c=>`<section class="settings-card ${c.color}">${avatar(c)}<h2>${esc(c.name)}</h2><p>${state.demo?'Profil demonstracyjny':'Połączono z Librus Synergia'}</p><div class="actions"><button class="btn small" data-action="edit" data-id="${c.id}">${icon('edit')}Edytuj profil</button><button class="btn small danger" data-action="remove" data-id="${c.id}">Usuń</button></div></section>`).join('')}<section class="settings-card"><span class="avatar">✨</span><h2>Kolejny mały świat</h2><p>Dodaj konto dziecka i wybierz jego kolor oraz ulubioną emotkę lub zdjęcie.</p><div class="actions"><button class="btn primary small" data-action="add">${icon('plus')}Dodaj dziecko</button></div></section></div>`;
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4000);}
function showDialog(title,body){modal.innerHTML=`<div class="dialog-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="Zamknij">${icon('close')}</button></div>${body}`;if(!modal.open)modal.showModal();}
function loginDialog(){
 showDialog('Witaj w swojej rodzinie',`<p class="dialog-sub">Jedno hasło. Wszystkie plany. Tylko dla Was.</p>${!state.configured?'<div class="error-banner">Ustaw APP_PASSWORD i ENCRYPTION_KEY w Railway, aby uruchomić logowanie.</div>':''}<form id="login-form"><label for="family-password">Hasło rodzinne</label><input id="family-password" name="password" type="password" required autocomplete="current-password" placeholder="Twoje prywatne hasło"><p class="form-note">To hasło do Dzwonka. Dane Librusa dodasz osobno przy profilu każdego dziecka.</p><div class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="btn" data-action="close">Wróć do podglądu</button><button class="btn primary" type="submit">Zaloguj się ${icon('chevron')}</button></div></form>`);
}
function profileDialog(id){
 if(!state.auth)return loginDialog();
 const c=state.children.find(c=>c.id===id)||{name:'',emoji:'🌻',color:'purple',photo:''};
 showDialog(id?'Edytuj mały świat':'Dodaj mały świat',`<p class="dialog-sub">${id?'Zmień wygląd profilu lub dane konta Librus.':'Połącz konto Librus Synergia swojego dziecka.'}</p><form id="profile-form" data-id="${id||''}"><label for="child-name">Imię dziecka</label><input id="child-name" name="name" value="${esc(c.name)}" maxlength="40" placeholder="np. Zosia" required autocomplete="off"><div class="form-row"><div><label for="child-emoji">Ulubiona emotka</label><input id="child-emoji" name="emoji" value="${esc(c.emoji)}" maxlength="12" required></div><div><label>Kolor profilu</label><input type="hidden" name="color" value="${c.color}"><div class="color-choices">${['purple','green','orange','blue','pink'].map((col,i)=>`<button type="button" class="color-choice ${col} ${col===c.color?'selected':''}" data-action="color" data-color="${col}" aria-label="${['Fioletowy','Zielony','Pomarańczowy','Niebieski','Różowy'][i]}" aria-pressed="${col===c.color}"></button>`).join('')}</div></div></div><div class="emoji-choices">${['🌸','🦊','🌻','🐼','🚀','🦋','🐨','⚽'].map(e=>`<button type="button" data-action="emoji" data-emoji="${e}" aria-label="Wybierz ${e}">${e}</button>`).join('')}</div><label for="child-photo">Zdjęcie zamiast emotki <span style="font-weight:400;color:#9c90a4">(opcjonalnie)</span></label><input type="file" id="child-photo" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="photo" value="${esc(c.photo)}"><div class="photo-preview">${c.photo?`<img src="${esc(c.photo)}" alt="Podgląd zdjęcia"><button class="btn small" data-action="clear-photo" type="button">Usuń zdjęcie</button>`:''}</div><label for="librus-user">Login Librus Synergia${id?' — przy zmianie konta':''}</label><input id="librus-user" name="username" ${id?'':'required'} autocomplete="off" placeholder="Login dziecka lub rodzica"><label for="librus-password">Hasło Librus${id?' — pozostaw puste bez zmian':''}</label><input id="librus-password" name="password" type="password" ${id?'':'required'} autocomplete="new-password" placeholder="Hasło do konta Synergia"><p class="form-note">${icon('lock').replace('<svg','<svg style="width:11px;height:11px;vertical-align:middle"')} Dane logowania zapisujemy wyłącznie na serwerze, w postaci zaszyfrowanej. Wybierz osobne konto Synergia dla każdego dziecka.</p><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn" data-action="close" type="button">Anuluj</button><button class="btn primary" type="submit">${id?'Zapisz zmiany':'Połącz z Librusem'}</button></div></form>`);
}
async function load(refresh=false){
 const id=++state.loadId;
 state.loading=true;state.error='';render();
 if(state.demo){state.children=demoChildren;state.plans=demoPlans();state.loading=false;render();return;}
 try{
   const children=await api('/children');
   const result=await api(`/timetable?week=${iso(state.week)}&refresh=${refresh}`);
   if(id!==state.loadId)return;
   state.children=children;state.plans=result.plans;
   if(!children.some(c=>c.id===state.selected))state.selected='all';
 }catch(e){if(id!==state.loadId)return;state.error=e.message;}
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
  $('[name=photo]',modal).value=photo;$('.photo-preview',modal).innerHTML=`<img src="${photo}" alt="Podgląd zdjęcia"><button class="btn small" type="button" data-action="clear-photo">Usuń zdjęcie</button>`;
 }catch{toast('Nie udało się otworzyć zdjęcia. Wybierz inny plik.');}finally{submit.disabled=false;}
}
document.addEventListener('change',e=>{if(e.target.id==='child-photo')changePhoto(e.target.files[0]);});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const a=b.dataset.action;
 if(a==='close'){modal.close();return;}
 if(a==='login'){loginDialog();return;}
 if(a==='add'||a==='edit'){profileDialog(a==='edit'?b.dataset.id:null);return;}
 if(a==='plan'){state.page='plan';render();return;}
 if(a==='children'){state.page='children';render();return;}
 if(a==='select'){state.selected=b.dataset.id;state.page='plan';render();return;}
 if(a==='view'){state.view=b.dataset.view;render();return;}
 if(a==='day'){state.day=Number(b.dataset.day);render();return;}
 if(a==='prev'||a==='next'||a==='today'){
  const next=a==='today'?monday(today):addDays(state.week,a==='next'?7:-7);
  if(Math.abs(next-today)>365*86400000){toast('Wybierz tydzień w zakresie jednego roku.');return;}
  state.week=next;state.plans=[];
  if(a==='today')state.day=(today.getDay()+6)%7;
  await load();return;
 }
 if(a==='refresh'){await load(true);if(!state.error)toast(state.demo?'Odświeżono plan przykładowy':'Sprawdzono dostępne plany');return;}
 if(a==='logout'){
  try{await api('/logout',{method:'POST'});state.auth=false;state.demo=true;state.selected='all';state.page='plan';modal.close();await load();toast('Wylogowano bezpiecznie.');}catch(e){toast(e.message);}return;
 }
 if(a==='color'){const col=b.dataset.color;$('[name=color]',modal).value=col;modal.querySelectorAll('.color-choice').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',el===b);});return;}
 if(a==='emoji'){$('[name=emoji]',modal).value=b.dataset.emoji;return;}
 if(a==='clear-photo'){$('[name=photo]',modal).value='';$('#child-photo').value='';$('.photo-preview',modal).innerHTML='';return;}
 if(a==='remove'){
  if(!state.auth)return loginDialog();
  const c=state.children.find(c=>c.id===b.dataset.id);
  showDialog(`Usunąć profil ${c.name}?`,`<p class="dialog-sub">Profil, zapisane dane logowania i pobrane plany tego dziecka zostaną usunięte z Dzwonka. Konto w Librusie pozostanie bez zmian.</p><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn" data-action="close">Anuluj</button><button class="btn danger" data-action="confirm-remove" data-id="${c.id}">Usuń profil</button></div>`);return;
 }
 if(a==='confirm-remove'){b.disabled=true;try{await api('/children/'+b.dataset.id,{method:'DELETE'});modal.close();await load();toast('Profil został usunięty.');}catch(e){$('.form-error',modal).textContent=e.message;b.disabled=false;}return;}
 if(a==='lesson'){
  const p=state.plans.find(p=>p.child.id===b.dataset.id),l=p.lessons[Number(b.dataset.index)];
  showDialog(l.subject,`<p class="dialog-sub">${esc(p.child.emoji)} ${esc(p.child.name)} · ${fmt(new Date(l.date+'T12:00:00'),{weekday:'long',day:'numeric',month:'long'})}</p><div class="detail-time">${esc(l.start)} – ${esc(l.end)}</div><p>${esc(l.details)||'Brak dodatkowych informacji o sali i nauczycielu.'}</p>${l.note?`<div class="error-banner">${esc(l.note)}</div>`:''}<p class="form-note">${state.demo?'Przykładowa lekcja w trybie demonstracyjnym.':'Plan pobrany z Librus Synergia.'}</p><div class="form-actions"><button class="btn primary" data-action="close">Wszystko jasne</button></div>`);return;
 }
 if(a==='install'){
  if(installPrompt){await installPrompt.prompt();installPrompt=null;return;}
  showDialog('Dzwonek na Twoim iPhonie',`<p class="dialog-sub">Twój rodzinny plan, jeden dotyk od ekranu głównego.</p><ol class="install-steps"><li>Otwórz tę stronę w <strong>Safari</strong>.</li><li>Dotknij <strong>Udostępnij</strong> (kwadrat ze strzałką).</li><li>Wybierz <strong>Dodaj do ekranu początkowego</strong>.</li><li>Potwierdź przyciskiem <strong>Dodaj</strong>.</li></ol><p class="form-note">Na Androidzie użyj „Zainstaluj aplikację” w menu Chrome. Pierwsze uruchomienie z nowej ikony może wymagać zalogowania. Aktualizowanie planów wymaga internetu. Bez połączenia otwiera się aplikacja, ale prywatne plany nie są przechowywane w przeglądarce.</p><div class="form-actions"><button class="btn primary" data-action="close">Rozumiem</button></div>`);
 }
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['login-form','profile-form'].includes(f.id))return;e.preventDefault();
 const button=$('button[type=submit]',f),error=$('.form-error',f),old=button.innerHTML;
 button.disabled=true;error.textContent='';button.textContent=f.id==='login-form'?'Logowanie…':'Łączymy z Librusem…';
 try{
  const data=Object.fromEntries(new FormData(f));
  if(f.id==='login-form'){await api('/login',{method:'POST',body:JSON.stringify(data)});state.auth=true;state.demo=false;state.children=[];state.plans=[];state.selected='all';state.page='plan';}
  else{await api('/children'+(f.dataset.id?'/'+f.dataset.id:''),{method:f.dataset.id?'PUT':'POST',body:JSON.stringify(data)});}
  modal.close();await load();toast(f.id==='login-form'?'Witaj w swojej rodzinie!':'Profil zapisany.');
 }catch(e){error.textContent=e.message;}
 finally{button.disabled=false;button.innerHTML=old;}
});
window.addEventListener('offline',()=>{state.error='Jesteś offline. Widoczny plan może być nieaktualny. Połącz się z internetem, aby go odświeżyć.';render();});
window.addEventListener('online',()=>load());
async function init(){render();try{const s=await api('/session');state.auth=s.authenticated;state.configured=s.configured;state.demo=!s.authenticated;}catch(e){state.error=e.message;state.loading=false;render();return;}await load();}
init();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
