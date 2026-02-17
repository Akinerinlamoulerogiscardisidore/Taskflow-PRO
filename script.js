// ── CONSTANTS ────────────────────────────────────────────────────────────────
const DAYS_FR = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const MONTHS_LONG = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const STORAGE_KEY = 'taskflow_pro_v2';

// ── STATE ────────────────────────────────────────────────────────────────────
let tasks = {};
let weekOffset = 0;
let currentPeriod = 'day';
let currentView = 'config';
let realtimeTimer = null;
let isDark = true;

// ── STORAGE ──────────────────────────────────────────────────────────────────
function load() {
    try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { tasks = {}; }
}
function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
}

// ── UTILS ────────────────────────────────────────────────────────────────────
function dateKey(d) { return d.toISOString().split('T')[0]; }
function isToday(d) { return d.toDateString() === new Date().toDateString(); }
function sameMonth(d) { const n = new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear(); }
function sameYear(d) { return d.getFullYear() === new Date().getFullYear(); }
function fmtDate(d) { return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`; }
function weekStart(offset=0) {
    const t = new Date();
    const day = t.getDay();
    const diff = t.getDate() - day + (day===0?-6:1) + offset*7;
    return new Date(new Date(t).setDate(diff));
}
function dayIndex(d) { return d.getDay()===0?6:d.getDay()-1; }
function taskActiveNow(task) {
    if (!task.startTime || !task.endTime) return false;
    const n = new Date();
    const cur = n.getHours()*60+n.getMinutes();
    const [sh,sm] = task.startTime.split(':').map(Number);
    const [eh,em] = task.endTime.split(':').map(Number);
    return cur >= sh*60+sm && cur < eh*60+em;
}
function priorityBadge(p) {
    const map = {high:'badge-high',medium:'badge-medium',low:'badge-low'};
    const label = {high:'Haute',medium:'Moy',low:'Basse'};
    return `<span class="priority-badge ${map[p]}">${label[p]||p}</span>`;
}
function catColor(cat) {
    const m = {Travail:'#3a7fd5',Personnel:'#7c4dbd',Santé:'#2ebc7e',Finance:'#e87c30'};
    return m[cat] || 'var(--gold)';
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function switchView(v) {
    currentView = v;
    ['config','realtime','reports'].forEach(id => {
        document.getElementById('view-'+id).classList.toggle('active', id===v);
        document.getElementById('nav-'+id).classList.toggle('active', id===v);
    });
    document.getElementById('weekBar').style.display = v==='config' ? '' : 'none';
    document.getElementById('clockBar').style.display = v==='realtime' ? '' : 'none';

    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer=null; }

    if (v==='config') renderConfig();
    if (v==='realtime') { renderRealtime(); realtimeTimer=setInterval(tickRealtime,1000); tickRealtime(); }
    if (v==='reports') renderReports();
}

// ── VIEW : CONFIG ─────────────────────────────────────────────────────────────
function changeWeek(d) { weekOffset+=d; renderConfig(); }

function renderConfig() {
    const ws = weekStart(weekOffset);
    const we = new Date(ws); we.setDate(we.getDate()+6);
    document.getElementById('weekLabel').textContent = `${fmtDate(ws)} — ${fmtDate(we)}`;
    const grid = document.getElementById('daysGridConfig');
    grid.innerHTML = '';
    for (let i=0;i<7;i++) {
        const d = new Date(ws); d.setDate(d.getDate()+i);
        grid.innerHTML += buildDayConfig(DAYS_FR[i], d);
    }
}

function buildDayConfig(name, date) {
    const k = dateKey(date);
    const ts = tasks[k] || [];
    const todayClass = isToday(date) ? 'today' : '';
    return `<div class="day-card ${todayClass}" id="card-${k}">
        <div class="day-header">
            <div>
                <div class="day-name">${name}</div>
                <div class="day-date">${fmtDate(date)}</div>
            </div>
            ${isToday(date)?'<div class="day-badge">Aujourd\'hui</div>':''}
        </div>
        <div class="task-counter" id="counter-${k}">${ts.length} tâche(s)</div>
        <div class="tasks-list" id="list-${k}">${renderTaskListConfig(ts, k)}</div>
        <div class="add-form">
            <div class="form-row">
                <input class="task-input" type="text" placeholder="Nom de la tâche…" id="inp-${k}" onkeydown="if(event.key==='Enter')addTask('${k}')">
                <select class="task-select" id="pri-${k}">
                    <option value="low">🟢 Basse</option>
                    <option value="medium" selected>🟡 Moyenne</option>
                    <option value="high">🔴 Haute</option>
                </select>
            </div>
            <div class="time-label">⏰ Plage horaire (optionnel)</div>
            <div class="form-row">
                <input class="time-input" type="time" id="st-${k}">
                <span style="align-self:center;color:var(--text-muted);font-weight:700">→</span>
                <input class="time-input" type="time" id="et-${k}">
            </div>
            <div class="form-row">
                <button class="add-btn" onclick="addTask('${k}')">+ Ajouter</button>
            </div>
        </div>
    </div>`;
}

function renderTaskListConfig(ts, k) {
    if (!ts.length) return `<div class="empty-state"><div class="empty-icon">📝</div><p>Aucune tâche</p></div>`;
    return ts.map((t,i) => `
        <div class="task-item ${t.priority} ${t.done?'done':''}">
            <input class="task-check" type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${k}',${i})">
            <div class="task-content">
                <div class="task-text">${t.text}</div>
                ${t.startTime&&t.endTime?`<div class="task-time">${t.startTime} – ${t.endTime}</div>`:''}
            </div>
            ${priorityBadge(t.priority)}
            <button class="task-del" onclick="deleteTask('${k}',${i})">×</button>
        </div>`).join('');
}

function addTask(k) {
    const inp = document.getElementById(`inp-${k}`);
    const pri = document.getElementById(`pri-${k}`);
    const st  = document.getElementById(`st-${k}`);
    const et  = document.getElementById(`et-${k}`);
    const txt = inp.value.trim();
    if (!txt) return;
    if (!tasks[k]) tasks[k]=[];
    tasks[k].push({ text:txt, priority:pri.value, startTime:st.value||null, endTime:et.value||null, done:false, createdAt:new Date().toISOString() });
    inp.value=''; st.value=''; et.value='';
    save();
    refreshDayConfig(k);
}

function toggleTask(k, i) {
    tasks[k][i].done = !tasks[k][i].done;
    tasks[k][i].doneAt = tasks[k][i].done ? new Date().toISOString() : null;
    save();
    refreshDayConfig(k);
}

function deleteTask(k, i) {
    if (!confirm('Supprimer cette tâche ?')) return;
    tasks[k].splice(i,1);
    if (!tasks[k].length) delete tasks[k];
    save();
    refreshDayConfig(k);
}

function refreshDayConfig(k) {
    const ts = tasks[k]||[];
    const el = document.getElementById(`list-${k}`);
    const ct = document.getElementById(`counter-${k}`);
    if (el) el.innerHTML = renderTaskListConfig(ts, k);
    if (ct) ct.textContent = `${ts.length} tâche(s)`;
}

// ── VIEW : REALTIME ───────────────────────────────────────────────────────────
function renderRealtime() {
    updateClock();
    buildTimeline();
    updateProgressRings();
    updateStats();
    renderWeekRealtime();
}

function tickRealtime() {
    updateClock();
    updateCurrentTaskAlert();
    updateStats();
    updateProgressRings();
    updateTimelineMarker();
}

function updateClock() {
    const n = new Date();
    const h = String(n.getHours()).padStart(2,'0');
    const m = String(n.getMinutes()).padStart(2,'0');
    const s = String(n.getSeconds()).padStart(2,'0');
    document.getElementById('liveTime').textContent = `${h}:${m}:${s}`;
    document.getElementById('clockDay').textContent = n.getDate();
    document.getElementById('clockMonth').textContent = MONTHS_SHORT[n.getMonth()];
    document.getElementById('clockDayName').textContent = DAYS_FR[dayIndex(n)];
    document.getElementById('clockFullDate').textContent = fmtDate(n);
}

function updateCurrentTaskAlert() {
    const k = dateKey(new Date());
    const ts = tasks[k]||[];
    const active = ts.find(t=>!t.done&&taskActiveNow(t));
    const el = document.getElementById('currentTaskAlert');
    if (active) {
        el.classList.add('active');
        document.getElementById('ctaText').textContent = active.text;
        document.getElementById('ctaTime').textContent = `${active.startTime} – ${active.endTime}`;
    } else {
        el.classList.remove('active');
    }
}

function updateProgressRings() {
    const today = new Date();
    const todayK = dateKey(today);
    let wTotal=0,wDone=0;
    for(let i=0;i<7;i++){
        const d=new Date(today); d.setDate(d.getDate()-i);
        const ts=tasks[dateKey(d)]||[];
        wTotal+=ts.length; wDone+=ts.filter(t=>t.done).length;
    }
    const todayTs=tasks[todayK]||[];
    const tTotal=todayTs.length, tDone=todayTs.filter(t=>t.done).length;
    const wP = wTotal>0?Math.round(wDone/wTotal*100):0;
    const tP = tTotal>0?Math.round(tDone/tTotal*100):0;
    setRing('ringWeek',wP); document.getElementById('ringWeekPct').textContent=wP+'%';
    setRing('ringToday',tP); document.getElementById('ringTodayPct').textContent=tP+'%';
}

function setRing(id, pct) {
    const el=document.getElementById(id);
    if(!el) return;
    const circ=314.16;
    el.style.strokeDashoffset = circ - (pct/100)*circ;
}

function updateStats() {
    const k=dateKey(new Date());
    const ts=tasks[k]||[];
    const now=new Date(); const cur=now.getHours()*60+now.getMinutes();
    let done=0,active=0,upcoming=0;
    ts.forEach(t=>{
        if(t.done){done++;}
        else if(taskActiveNow(t)){active++;}
        else if(t.startTime){const[h,m]=t.startTime.split(':').map(Number);if(h*60+m>cur)upcoming++;}
    });
    document.getElementById('statTotal').textContent=ts.length;
    document.getElementById('statDone').textContent=done;
    document.getElementById('statActive').textContent=active;
    document.getElementById('statUpcoming').textContent=upcoming;
}

function buildTimeline() {
    const hoursEl=document.getElementById('tlHours');
    hoursEl.innerHTML='';
    for(let i=0;i<=24;i+=3){
        const d=document.createElement('div');
        d.className='tl-hour';
        d.textContent=String(i).padStart(2,'0')+':00';
        hoursEl.appendChild(d);
    }
    updateTimelineTasks();
    updateTimelineMarker();
}

function updateTimelineTasks() {
    const track=document.getElementById('tlTrack');
    track.querySelectorAll('.tl-task').forEach(e=>e.remove());
    const k=dateKey(new Date());
    const ts=tasks[k]||[];
    ts.forEach(t=>{
        if(!t.startTime||!t.endTime) return;
        const[sh,sm]=t.startTime.split(':').map(Number);
        const[eh,em]=t.endTime.split(':').map(Number);
        const sMin=sh*60+sm, eMin=eh*60+em;
        const el=document.createElement('div');
        el.className=`tl-task ${t.priority} ${t.done?'done':''} ${taskActiveNow(t)?'active-now':''}`;
        el.style.left=(sMin/1440*100)+'%';
        el.style.width=((eMin-sMin)/1440*100)+'%';
        el.textContent=t.text;
        el.title=`${t.text}\n${t.startTime} – ${t.endTime}`;
        track.appendChild(el);
    });
}

function updateTimelineMarker() {
    const n=new Date();
    const pct=(n.getHours()*60+n.getMinutes())/1440*100;
    const m=document.getElementById('tlMarker');
    if(m) m.style.left=pct+'%';
}

function renderWeekRealtime() {
    const grid=document.getElementById('daysGridRealtime');
    grid.innerHTML='';
    const today=new Date();
    for(let i=0;i<7;i++){
        const d=new Date(today); d.setDate(d.getDate()+i);
        grid.innerHTML+=buildDayRealtime(DAYS_FR[dayIndex(d)],d);
    }
}

function buildDayRealtime(name, date) {
    const k=dateKey(date);
    const ts=tasks[k]||[];
    const done=ts.filter(t=>t.done).length;
    const pct=ts.length?Math.round(done/ts.length*100):0;
    const todayClass=isToday(date)?'today':'';
    const taskItems=ts.length
        ? ts.map(t=>{
            const isActive=taskActiveNow(t);
            const icon=t.done?'✅':isActive?'▶️':'⏺';
            return `<div class="task-item ${t.priority} ${t.done?'done':''} ${isActive?'active-now':''}">
                <div class="task-icon">${icon}</div>
                <div class="task-content">
                    <div class="task-text">${t.text}</div>
                    ${t.startTime&&t.endTime?`<div class="task-time">${t.startTime} – ${t.endTime}</div>`:''}
                </div>
                ${priorityBadge(t.priority)}
            </div>`;
        }).join('')
        : `<div class="empty-state"><div class="empty-icon">📝</div><p>Aucune tâche</p></div>`;
    return `<div class="day-card ${todayClass}">
        <div class="day-header">
            <div>
                <div class="day-name">${name}</div>
                <div class="day-date">${fmtDate(date)}</div>
            </div>
            ${isToday(date)?'<div class="day-badge">Aujourd\'hui</div>':''}
        </div>
        <div class="day-progress">
            <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
            <div class="prog-label"><span>${done} / ${ts.length} tâches</span><span>${pct}%</span></div>
        </div>
        <div class="tasks-list">${taskItems}</div>
    </div>`;
}

// ── VIEW : REPORTS ────────────────────────────────────────────────────────────
function setPeriod(p) {
    currentPeriod=p;
    ['day','month','year'].forEach(id=>{
        document.getElementById('pt'+id.charAt(0).toUpperCase()+id.slice(1)).classList.toggle('active',id===p);
    });
    renderReports();
}

function renderReports() {
    const now=new Date();
    const priColors={high:getComputedStyle(document.documentElement).getPropertyValue('--red').trim(),
                     medium:getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
                     low:getComputedStyle(document.documentElement).getPropertyValue('--green').trim()};
    const priLabel={high:'Haute',medium:'Moy',low:'Basse'};
    const priBadge={high:'badge-high',medium:'badge-medium',low:'badge-low'};

    // Period label
    const pLabels = {
        day:['Rapport du jour', now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})],
        month:['Rapport mensuel', now.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})],
        year:['Rapport annuel', String(now.getFullYear())]
    };
    document.getElementById('rptTitle').textContent=pLabels[currentPeriod][0];
    document.getElementById('rptSubtitle').textContent=pLabels[currentPeriod][1];

    // Collect tasks for period
    let all=[], done=[], pending=[];
    Object.entries(tasks).forEach(([k, ts])=>{
        const d=new Date(k);
        let inPeriod=false;
        if(currentPeriod==='day') inPeriod=d.toDateString()===now.toDateString();
        else if(currentPeriod==='month') inPeriod=sameMonth(d);
        else inPeriod=sameYear(d);
        if(inPeriod){
            ts.forEach(t=>{ all.push({...t,dateKey:k}); if(t.done) done.push({...t,dateKey:k}); else pending.push({...t,dateKey:k}); });
        }
    });

    // KPIs
    const rate=all.length?Math.round(done.length/all.length*100):0;
    document.getElementById('kpiDone').textContent=done.length;
    document.getElementById('kpiTotal').textContent=all.length;
    document.getElementById('kpiPending').textContent=pending.length;
    document.getElementById('kpiRate').textContent=rate+'%';

    // Category chart (done tasks)
    const catMap={};
    done.forEach(t=>{ catMap[t.text?'—':'?']; /* fallback */ });
    // We'll group by day/week for month, by categories guessed from task data
    // Since tasks don't have explicit category, we'll use priority distribution
    const catData={};
    all.forEach(t=>{ if(!catData[t.priority]) catData[t.priority]=0; catData[t.priority]++; });

    // By category - build from done
    const byDate={};
    done.forEach(t=>{
        const day=new Date(t.dateKey).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
        if(!byDate[day]) byDate[day]=0; byDate[day]++;
    });

    // Priority chart
    const priMap={high:0,medium:0,low:0};
    done.forEach(t=>{ priMap[t.priority]=(priMap[t.priority]||0)+1; });
    const priMax=Math.max(...Object.values(priMap),1);

    const priChartHtml=Object.entries(priMap).map(([p,c])=>`
        <div class="bar-row">
            <div class="bar-meta"><span>${priLabel[p]}</span><span style="color:${priColors[p]||'var(--gold)'}">${c}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${(c/priMax*100)}%;background:${priColors[p]||'var(--gold)'}"></div></div>
        </div>`).join('');
    document.getElementById('priChart').innerHTML=priChartHtml||'<div class="empty-report"><div class="e-icon">📊</div>Aucune donnée</div>';

    // Cat chart — group done tasks by date for day/by week for month
    let catHtml='';
    if(currentPeriod==='day'){
        // Show priority breakdown of all tasks today
        const allPri={high:0,medium:0,low:0};
        all.forEach(t=>allPri[t.priority]=(allPri[t.priority]||0)+1);
        const aMax=Math.max(...Object.values(allPri),1);
        catHtml=Object.entries(allPri).map(([p,c])=>`
            <div class="bar-row">
                <div class="bar-meta"><span>Priorité ${priLabel[p]}</span><span>${c}</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${c/aMax*100}%;background:${priColors[p]}"></div></div>
            </div>`).join('');
    } else {
        // Group done tasks by day
        const dayMap={};
        done.forEach(t=>{ const dk=t.dateKey; dayMap[dk]=(dayMap[dk]||0)+1; });
        const dMax=Math.max(...Object.values(dayMap),1);
        const sorted=Object.entries(dayMap).sort(([a],[b])=>a.localeCompare(b));
        catHtml=sorted.slice(-8).map(([k,c])=>{
            const label=new Date(k).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
            return `<div class="bar-row">
                <div class="bar-meta"><span>${label}</span><span style="color:var(--gold)">${c}</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${c/dMax*100}%;background:linear-gradient(90deg,var(--gold),var(--gold-l))"></div></div>
            </div>`;
        }).join('');
    }
    document.getElementById('catChart').innerHTML=catHtml||'<div class="empty-report"><div class="e-icon">📊</div>Aucune donnée</div>';

    // Done list
    if(done.length){
        document.getElementById('rptDoneList').innerHTML=done.map(t=>`
            <div class="report-task-item">
                <div class="report-check">✓</div>
                <div>
                    <div class="report-task-name">${t.text}</div>
                    <div class="report-task-time">${t.doneAt?new Date(t.doneAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</div>
                </div>
                <span class="priority-badge ${priBadge[t.priority]}">${priLabel[t.priority]}</span>
            </div>`).join('');
    } else {
        document.getElementById('rptDoneList').innerHTML='<div class="empty-report"><div class="e-icon">🏆</div>Aucune tâche accomplie sur cette période.</div>';
    }

    // Pending list
    const pendCard=document.getElementById('rptPendingCard');
    if(pending.length){
        pendCard.style.display='';
        document.getElementById('rptPendingList').innerHTML=pending.map(t=>`
            <div class="pending-item">
                <div class="pending-dot"></div>
                <div class="pending-name">${t.text}</div>
                <span class="priority-badge ${priBadge[t.priority]}">${priLabel[t.priority]}</span>
            </div>`).join('');
    } else {
        pendCard.style.display='none';
    }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
load();
renderConfig();