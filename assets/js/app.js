
(() => {
  "use strict";

  const STORE = "cuidados-turnos-v1";
  const baseMonday = new Date("2026-05-25T12:00:00");

  const defaultPeople = [
    {id:"mari-jose", name:"Mari José", color:"#7c3aed", blocked:false},
    {id:"bea", name:"Bea", color:"#0f766e", blocked:false},
    {id:"marta", name:"Marta", color:"#2563eb", blocked:false},
    {id:"patri", name:"Patri", color:"#c2410c", blocked:false}
  ];

  const defaultConfig = {
    tueThuAfternoon:"mari-jose",
    wedAfternoon:"bea",
    wedNight:"bea",
    monFriAlternation:["marta","patri"],
    weekendRotation:["marta","patri","mari-jose","bea"],
    remainingNightRotation:["marta","patri","bea","mari-jose"],
    everyNightCovered:true,
    monFriNightFollowsAfternoon:true,
    customVariables:[
      {id:"cv1", name:"Separación de turnos", value:"Tardes y noches se tratan como bloques distintos.", notes:"Variable base."},
      {id:"cv2", name:"Pendientes fijos", value:"Domingo noche, martes noche y jueves noche", notes:"Se cubren con rotación editable."}
    ]
  };

  
  const COLOR_VERSION = "palette-v3-visible";
  const defaultColorById = {
    "mari-jose":"#7c3aed",
    "bea":"#059669",
    "marta":"#2563eb",
    "patri":"#d97706"
  };

  let state = load();
  migratePalette();
  let selectedDate = new Date();
  selectedDate.setHours(12,0,0,0);
  let currentView = "week";
  let filterPerson = "all";
  let filterShift = "all";
  let selectedMonthDate = new Date(selectedDate);

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function uid(prefix="id"){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }


  function migratePalette(){
    if(localStorage.getItem("agenda-color-version") === COLOR_VERSION) return;
    let changed = false;
    state.people.forEach(p=>{
      if(defaultColorById[p.id]){
        p.color = defaultColorById[p.id];
        changed = true;
      }
    });
    localStorage.setItem("agenda-color-version", COLOR_VERSION);
    if(changed) save();
  }


  function load(){
    try{
      const raw = JSON.parse(localStorage.getItem(STORE) || "{}");
      return {
        people: Array.isArray(raw.people) ? raw.people : clone(defaultPeople),
        config: raw.config ? {...clone(defaultConfig), ...raw.config} : clone(defaultConfig),
        manual: raw.manual || {},
        proposal: raw.proposal || null,
        rulesEnabled: raw.rulesEnabled !== false
      };
    }catch(e){
      return {people:clone(defaultPeople), config:clone(defaultConfig), manual:{}, proposal:null, rulesEnabled:true};
    }
  }
  function save(){ localStorage.setItem(STORE, JSON.stringify(state)); }
  function toast(msg){
    const old = $(".toast"); if(old) old.remove();
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),2100);
  }

  function iso(d){ return new Date(d).toISOString().slice(0,10); }
  function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function startWeek(d){ const x = new Date(d); x.setDate(x.getDate()-((x.getDay()+6)%7)); x.setHours(12,0,0,0); return x; }
  function weekIndex(d){ return Math.floor((startWeek(d)-startWeek(baseMonday))/(7*24*3600*1000)); }
  function dayName(d){ return d.toLocaleDateString("es-ES",{weekday:"long"}); }
  function monthName(d){ return d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}); }
  function fmt(d){ return d.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short"}); }

  function activePeople(){ return state.people.filter(p=>!p.blocked); }
  function person(id){ return state.people.find(p=>p.id===id) || null; }
  function safePerson(id, fallbackIndex=0){
    const p = person(id);
    if(p && !p.blocked) return p;
    const arr = activePeople();
    return arr.length ? arr[Math.abs(fallbackIndex)%arr.length] : null;
  }
  function initials(name){ return String(name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(); }

  function assign(date, shift){
    if(state.rulesEnabled === false){
      return {person:null, rule:"Variables no aplicadas", conflict:null};
    }
    const d = new Date(date);
    const day = d.getDay(); // 0 domingo
    const wi = weekIndex(d);
    const key = `${iso(d)}:${shift}`;
    if(state.manual[key]){
      const p = safePerson(state.manual[key], wi);
      return {person:p, rule:"Manual", conflict:null};
    }

    let id = null, rule = "", conflict = null;
    const cfg = state.config;

    if(shift === "tarde"){
      if(day === 2 || day === 4){ id = cfg.tueThuAfternoon; rule = "Martes y jueves tarde: Mari José"; }
      else if(day === 3){ id = cfg.wedAfternoon; rule = "Miércoles tarde: Bea"; }
      else if(day === 1 || day === 5){
        const arr = cfg.monFriAlternation || [];
        id = arr[Math.abs(wi + (day===5 ? 1 : 0)) % Math.max(1,arr.length)];
        rule = "Lunes y viernes tarde alternan Marta y Patri";
      }
    }

    if(shift === "dia" && (day === 6 || day === 0)){
      const arr = cfg.weekendRotation || [];
      id = arr[Math.abs(wi) % Math.max(1,arr.length)];
      rule = "Sábado día, sábado noche y domingo día del tirón";
    }

    if(shift === "noche"){
      if((day === 1 || day === 5) && cfg.monFriNightFollowsAfternoon){
        const a = assign(d,"tarde");
        id = a.person ? a.person.id : null;
        rule = "Lunes y viernes duerme quien está de tarde";
      }else if(day === 6){
        const arr = cfg.weekendRotation || [];
        id = arr[Math.abs(wi) % Math.max(1,arr.length)];
        rule = "Sábado noche incluida en el finde del tirón";
      }else if(day === 3){
        id = cfg.wedNight;
        rule = "Miércoles noche editable";
      }else if(day === 0 || day === 2 || day === 4){
        const arr = cfg.remainingNightRotation || [];
        const offset = day === 0 ? 2 : day === 2 ? 0 : 1;
        id = arr[Math.abs(wi*3 + offset) % Math.max(1,arr.length)];
        rule = "Domingo, martes y jueves noche por rotación";
      }
    }

    if(!id && shift === "noche" && cfg.everyNightCovered){
      const arr = cfg.remainingNightRotation || activePeople().map(p=>p.id);
      id = arr[Math.abs(wi + day) % Math.max(1,arr.length)];
      rule = "Cobertura automática: todas las noches alguien";
    }

    if(!id){
      return {person:null, rule:"Sin regla asignada", conflict:"Pendiente de cubrir"};
    }

    const original = person(id);
    const p = safePerson(id, wi + day);
    if(original && original.blocked && p){
      conflict = `${original.name} está bloqueada. Se asigna sustitución.`;
    }
    if(!p) conflict = "No hay personas disponibles.";
    return {person:p, rule, conflict};
  }

  function shiftsFor(d){
    if(state.rulesEnabled === false) return [];
    const day = d.getDay();
    const shifts = [];
    if(day === 6 || day === 0) shifts.push("dia");
    shifts.push("tarde","noche");
    return shifts;
  }

  function scheduleRange(start, days){
    return Array.from({length:days},(_,i)=>{
      const date = addDays(start,i);
      return {date, shifts:shiftsFor(date).map(s=>({shift:s, ...assign(date,s)}))};
    });
  }

  function shiftCard(item, date){
    const p = item.person;
    if(filterShift !== "all" && item.shift !== filterShift) return "";
    if(filterPerson !== "all" && (!p || p.id !== filterPerson)) return "";
    const cls = item.shift === "noche" ? "noche" : item.shift === "dia" ? "dia" : "tarde";
    const label = item.shift === "dia" ? "Día" : item.shift === "tarde" ? "Tarde" : "Noche";
    return `<div class="shift-card ${cls}">
      <div class="shift-top">
        <span class="shift-label">${label}</span>
        ${p ? `<span class="person-pill"><i class="avatar-dot" style="background:${p.color}"></i>${p.name}</span>` : `<span class="badge blocked">Sin cubrir</span>`}
      </div>
      <div class="shift-note">${item.rule}</div>
      ${item.conflict ? `<div class="conflict">${item.conflict}</div>` : ""}
      <button class="btn small ghost" data-override="${iso(date)}:${item.shift}">Cambiar</button>
    </div>`;
  }

  function renderKpis(){
    const el = $("#kpis"); if(!el) return;
    const week = scheduleRange(startWeek(selectedDate),7);
    const shifts = week.flatMap(d=>d.shifts);
    const covered = shifts.filter(s=>s.person).length;
    const nights = shifts.filter(s=>s.shift==="noche");
    const conflicts = shifts.filter(s=>s.conflict).length;
    const people = activePeople().length;
    el.innerHTML = `
      <div class="kpi"><span>Turnos semana</span><strong>${covered}/${shifts.length}</strong><small>cobertura</small></div>
      <div class="kpi"><span>Noches</span><strong>${nights.filter(s=>s.person).length}/${nights.length}</strong><small>todas cubiertas</small></div>
      <div class="kpi"><span>Personas activas</span><strong>${people}</strong><small>sin bloqueo</small></div>
      <div class="kpi"><span>Alertas</span><strong>${conflicts}</strong><small>revisar</small></div>`;
  }

  function syncPersonFilter(){
    const select = $("#personFilter");
    if(!select) return;
    const current = select.value || filterPerson || "all";
    select.innerHTML = `<option value="all">Todas</option>` + state.people.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
    if([...select.options].some(o=>o.value===current)){
      select.value = current;
      filterPerson = current;
    }else{
      select.value = "all";
      filterPerson = "all";
    }
  }


  function navLabels(){
    const map = {
      week:  ["Semana anterior", "Semana actual", "Semana siguiente"],
      day:   ["Día anterior", "Hoy", "Día siguiente"],
      list:  ["Periodo anterior", "Hoy", "Periodo siguiente"],
      month: ["Mes anterior", "Mes actual", "Mes siguiente"],
      year:  ["Año anterior", "Año actual", "Año siguiente"]
    };
    return map[currentView] || map.month;
  }

  function updateNavLabels(){
    const prev = $("#prevPeriod");
    const today = $("#todayBtn");
    const next = $("#nextPeriod");
    if(!prev || !today || !next) return;

    const labels = navLabels();
    prev.textContent = labels[0];
    today.textContent = labels[1];
    next.textContent = labels[2];

    prev.setAttribute("aria-label", labels[0]);
    today.setAttribute("aria-label", labels[1]);
    next.setAttribute("aria-label", labels[2]);

    prev.title = labels[0];
    today.title = labels[1];
    next.title = labels[2];
  }

  function renderAgenda(){
    if(!$("#calendar")) return;
    updateNavLabels();
    syncPersonFilter();
    setFairDateDefaults();
    renderKpis();
    const title = $("#periodTitle");
    if(title){
      if(currentView === "week"){
        const s = startWeek(selectedDate), e = addDays(s,6);
        title.textContent = `${fmt(s)} — ${fmt(e)}`;
      }else if(currentView === "day"){
        title.textContent = selectedDate.toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
      }else if(currentView === "month"){
        title.textContent = selectedDate.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
      }else if(currentView === "year"){
        title.textContent = selectedDate.getFullYear();
      }else{
        title.textContent = "Lista de próximos turnos";
      }
    }
    $$(".view-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===currentView));
    const cal = $("#calendar");
    if(currentView === "week") renderWeek(cal);
    if(currentView === "day") renderDay(cal);
    if(currentView === "list") renderList(cal);
    if(currentView === "month") renderMonth(cal);
    if(currentView === "year") renderYear(cal);
  }

  function renderWeek(cal){
    const days = scheduleRange(startWeek(selectedDate),7);
    cal.innerHTML = `<div class="week-grid">${days.map(day => `
      <section class="day-col">
        <div class="day-head"><b>${dayName(day.date)}</b><span>${day.date.getDate()}</span></div>
        ${day.shifts.map(s=>shiftCard(s,day.date)).join("") || `<div class="notice">Sin turnos con estos filtros.</div>`}
      </section>`).join("")}</div>`;
  }

  function renderDay(cal){
    const date = selectedDate;
    const day = {date, shifts:shiftsFor(date).map(s=>({shift:s, ...assign(date,s)}))};
    cal.innerHTML = `<div class="day-view">
      <div class="big-date"><div><span>${monthName(date)}</span><strong>${date.getDate()}</strong></div><span>${dayName(date)}</span></div>
      <div class="stack">${day.shifts.map(s=>shiftCard(s,date)).join("") || `<div class="notice">Sin turnos con estos filtros.</div>`}</div>
    </div>`;
  }

  function renderList(cal){
    const days = scheduleRange(selectedDate,35);
    let rows = days.flatMap(day => day.shifts.map(s => ({date:day.date, ...s})));
    rows = rows.filter(r => (filterShift === "all" || r.shift === filterShift) && (filterPerson === "all" || (r.person && r.person.id === filterPerson)));
    cal.innerHTML = `<table class="list-table"><thead><tr><th>Fecha</th><th>Turno</th><th>Persona</th><th>Regla</th><th>Acción</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${fmt(r.date)}</td><td>${r.shift}</td><td>${r.person ? r.person.name : "Sin cubrir"}</td><td>${r.rule}</td><td><button class="btn small" data-override="${iso(r.date)}:${r.shift}">Cambiar</button></td></tr>`).join("")}
    </tbody></table>`;
  }



  function isSameDay(a,b){
    return iso(a) === iso(b);
  }

  function shiftInitial(shift){
    return shift === "dia" ? "D" : shift === "tarde" ? "T" : "N";
  }

  function shiftName(shift){
    return shift === "dia" ? "Día" : shift === "tarde" ? "Tarde" : "Noche";
  }

  function shiftTypeColor(shift){
    return shift === "dia" ? "#059669" : shift === "tarde" ? "#d97706" : "#2563eb";
  }

  function shiftAccent(shift, p){
    return p && p.color ? p.color : shiftTypeColor(shift);
  }

  function monthItemsFor(date){
    return shiftsFor(date).map(shift => ({shift, ...assign(date,shift)}))
      .filter(item => (filterShift === "all" || item.shift === filterShift) && (filterPerson === "all" || (item.person && item.person.id === filterPerson)));
  }


  function renderMonth(cal){
    const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
    const gridStart = startWeek(first);
    const days = Array.from({length:42},(_,i)=>addDays(gridStart,i));
    if(selectedMonthDate.getMonth() !== selectedDate.getMonth() || selectedMonthDate.getFullYear() !== selectedDate.getFullYear()){
      selectedMonthDate = first;
    }

    const monthDays = days.filter(d => d.getMonth() === selectedDate.getMonth());
    const selectedItems = monthItemsFor(selectedMonthDate);
    const feedDays = monthDays
      .map(date => ({date, items:monthItemsFor(date)}))
      .filter(day => day.items.length || isSameDay(day.date, selectedMonthDate));

    cal.innerHTML = `<div class="month-layout">
      <section class="month-board">
        <div class="legend-row">
          ${activePeople().map(p=>`<span class="legend-chip"><i class="avatar-dot" style="background:${p.color}"></i>${p.name}</span>`).join("")}
        </div>
        <div class="month-weekdays">
          ${["L","M","X","J","V","S","D"].map(d=>`<span>${d}</span>`).join("")}
        </div>
        <div class="month-grid">
          ${days.map(date=>{
            const out = date.getMonth() !== selectedDate.getMonth();
            const today = isSameDay(date,new Date());
            const selected = isSameDay(date,selectedMonthDate);
            const items = monthItemsFor(date);
            const accent = items[0] ? shiftAccent(items[0].shift,items[0].person) : "#e4e7ec";
            return `<button class="month-day ${items.length ? "has-items" : ""} ${out ? "out" : ""} ${today ? "today" : ""} ${selected ? "selected" : ""}" style="--accent:${accent}" data-select-date="${iso(date)}" type="button">
              <div class="month-day-head">
                <span class="month-day-num">${date.getDate()}</span>
                <span class="month-day-week">${date.toLocaleDateString("es-ES",{weekday:"short"})}</span>
              </div>
              <div class="month-dots">
                ${items.slice(0,5).map(item=>`<i class="month-dot" style="background:${shiftAccent(item.shift,item.person)}"></i>`).join("")}
              </div>
              <div class="month-shifts-mini">
                ${items.slice(0,3).map(item=>`
                  <div class="month-mini-shift ${item.shift}">
                    <i class="avatar-dot" style="background:${shiftAccent(item.shift,item.person)}"></i>
                    <b>${shiftInitial(item.shift)} · ${item.person ? item.person.name : "Sin cubrir"}</b>
                  </div>`).join("")}
              </div>
            </button>`;
          }).join("")}
        </div>
      </section>

      <aside class="month-feed">
        <div class="month-feed-head">
          <div>
            <h3>${selectedMonthDate.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</h3>
            <p>${selectedItems.length ? selectedItems.length + " turnos" : "Sin turnos"}</p>
          </div>
        </div>
        <div class="month-feed-list">
          ${feedDays.map(day=>`
            <section class="feed-day">
              <div class="feed-date">
                <span>${day.date.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</span>
              </div>
              ${day.items.length ? day.items.map(item=>{
                const p = item.person;
                const personColor = shiftAccent(item.shift,p);
                return `<article class="feed-card ${item.shift}">
                  <div class="feed-card-line ${item.shift}"></div>
                  <div class="feed-card-body">
                    <div class="feed-shift ${item.shift}">${shiftInitial(item.shift)}</div>
                    <div class="feed-person">
                      <strong>${p ? `<i class="avatar-dot" style="background:${personColor}"></i> ` : ""}${p ? p.name : "Sin cubrir"}</strong>
                      <span>${shiftName(item.shift)} · ${item.rule}</span>
                    </div>
                    <button class="btn feed-edit" data-override="${iso(day.date)}:${item.shift}" type="button">+</button>
                  </div>
                </article>`;
              }).join("") : `<div class="notice">Sin turnos con estos filtros.</div>`}
            </section>`).join("")}
        </div>
      </aside>
    </div>`;
  }


  function renderYear(cal){
    const year = selectedDate.getFullYear();
    cal.innerHTML = `<div class="year-grid">${
      Array.from({length:12},(_,m)=>{
        const first = new Date(year,m,1,12);
        const last = new Date(year,m+1,0,12);
        const days = Array.from({length:last.getDate()},(_,i)=>new Date(year,m,i+1,12));
        return `<section class="month-card"><h3>${first.toLocaleDateString("es-ES",{month:"long"})}</h3><div class="mini-days">${
          days.map(d=>{
            const covered = shiftsFor(d).every(s=>assign(d,s).person);
            return `<span class="mini-day ${covered?"covered":""}" title="${fmt(d)}"></span>`;
          }).join("")
        }</div></section>`;
      }).join("")
    }</div>`;
  }

  function openOverride(key){
    const people = activePeople();
    if(!people.length){ toast("No hay personas activas"); return; }
    const name = prompt("Escribe el nombre exacto de la persona para este turno:\n\n" + people.map(p=>p.name).join(", "));
    if(!name) return;
    const p = people.find(x=>x.name.toLowerCase().trim() === name.toLowerCase().trim());
    if(!p){ toast("Persona no encontrada o bloqueada"); return; }
    state.manual[key] = p.id;
    save(); renderAgenda(); toast("Turno cambiado");
  }

  function renderVariables(){
    if(!$("#variablesForm")) return;
    const form = $("#variablesForm");
    const opts = state.people.map(p=>`<option value="${p.id}">${p.name}${p.blocked?" · bloqueada":""}</option>`).join("");
    form.innerHTML = `
      <div class="form-grid">
        <label>Martes y jueves tarde<select name="tueThuAfternoon">${opts}</select></label>
        <label>Miércoles tarde<select name="wedAfternoon">${opts}</select></label>
        <label>Miércoles noche<select name="wedNight">${opts}</select></label>
        <label>Todas las noches alguien<select name="everyNightCovered"><option value="true">Sí</option><option value="false">No</option></select></label>
        <label>Lunes y viernes tarde alterna 1<select name="monFriA">${opts}</select></label>
        <label>Lunes y viernes tarde alterna 2<select name="monFriB">${opts}</select></label>
        <label class="full">Rotación finde del tirón <input name="weekendRotation" placeholder="marta,patri,mari-jose,bea"></label>
        <label class="full">Rotación noches pendientes <input name="remainingNightRotation" placeholder="marta,patri,bea,mari-jose"></label>
      </div>
      <div class="hero-actions" style="margin-top:14px"><button class="btn primary" type="submit">Guardar variables</button><button class="btn" type="button" id="resetRules">Restaurar reglas iniciales</button></div>`;
    form.elements.tueThuAfternoon.value = state.config.tueThuAfternoon;
    form.elements.wedAfternoon.value = state.config.wedAfternoon;
    form.elements.wedNight.value = state.config.wedNight;
    form.elements.everyNightCovered.value = String(!!state.config.everyNightCovered);
    form.elements.monFriA.value = state.config.monFriAlternation[0] || "";
    form.elements.monFriB.value = state.config.monFriAlternation[1] || "";
    form.elements.weekendRotation.value = (state.config.weekendRotation || []).join(",");
    form.elements.remainingNightRotation.value = (state.config.remainingNightRotation || []).join(",");

    const list = $("#customVariables");
    if(list){
      list.innerHTML = state.config.customVariables.map(v=>`
        <div class="card">
          <div class="person-card">
            <div><h3>${v.name}</h3><p class="shift-note">${v.value}</p><p class="shift-note">${v.notes || ""}</p></div>
            <button class="btn small danger" data-delete-var="${v.id}">Eliminar</button>
          </div>
        </div>`).join("") || `<div class="notice">No hay variables personalizadas.</div>`;
    }
  }

  function saveVariables(e){
    e.preventDefault();
    const f = e.currentTarget;
    state.config.tueThuAfternoon = f.elements.tueThuAfternoon.value;
    state.config.wedAfternoon = f.elements.wedAfternoon.value;
    state.config.wedNight = f.elements.wedNight.value;
    state.config.everyNightCovered = f.elements.everyNightCovered.value === "true";
    state.config.monFriAlternation = [f.elements.monFriA.value, f.elements.monFriB.value].filter(Boolean);
    state.config.weekendRotation = f.elements.weekendRotation.value.split(",").map(x=>x.trim()).filter(Boolean);
    state.config.remainingNightRotation = f.elements.remainingNightRotation.value.split(",").map(x=>x.trim()).filter(Boolean);
    state.rulesEnabled = true;
    save(); renderAll(); toast("Variables guardadas y aplicadas");
  }

  function renderPeople(){
    if(!$("#peopleList")) return;
    $("#peopleList").innerHTML = state.people.map(p=>`
      <article class="card person-card">
        <div class="person-info">
          <div class="person-avatar" style="background:${p.color}">${initials(p.name)}</div>
          <div>
            <h3>${p.name}</h3>
            <span class="badge ${p.blocked?"blocked":""}">${p.blocked?"Bloqueada":"Activa"}</span>
          </div>
        </div>
        <div class="toolbar">
          <label class="person-color-row">Color <input type="color" value="${p.color || "#3657ff"}" data-person-color="${p.id}"></label>
          <button class="btn small" data-toggle-person="${p.id}">${p.blocked?"Desbloquear":"Bloquear"}</button>
          <button class="btn small danger" data-delete-person="${p.id}">Eliminar</button>
        </div>
      </article>`).join("");
  }

  function addPerson(e){
    e.preventDefault();
    const f = e.currentTarget;
    const name = f.elements.name.value.trim();
    if(!name){ toast("Falta nombre"); return; }
    const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || uid("p");
    if(state.people.some(p=>p.id===id)){ toast("Esa persona ya existe"); return; }
    state.people.push({id,name,color:f.elements.color.value || "#3657ff",blocked:false});
    save(); f.reset(); renderPeople(); toast("Persona añadida");
  }

  function resetAll(){
    if(!confirm("Restaurar datos iniciales. Se perderán cambios locales.")) return;
    state = {people:clone(defaultPeople), config:clone(defaultConfig), manual:{}};
    save(); renderAll(); toast("Datos restaurados");
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    download(blob, "agenda-cuidados-backup.json");
  }
  function exportCsv(){
    const days = scheduleRange(startWeek(selectedDate),35);
    const rows = [["fecha","turno","persona","regla","alerta"]];
    days.forEach(d=>d.shifts.forEach(s=>rows.push([iso(d.date),s.shift,s.person?s.person.name:"",s.rule,s.conflict||""])));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    download(new Blob([csv],{type:"text/csv;charset=utf-8"}), "agenda-cuidados-turnos.csv");
  }
  function download(blob,name){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }


  function chooseLeast(candidates, load, avoidIds=[]){
    const valid = candidates
      .map(id => person(id))
      .filter(p => p && !p.blocked && !avoidIds.includes(p.id));
    const pool = valid.length ? valid : activePeople().filter(p => !avoidIds.includes(p.id));
    const finalPool = pool.length ? pool : activePeople();
    if(!finalPool.length) return null;
    return finalPool.slice().sort((a,b)=>(load[a.id]||0)-(load[b.id]||0) || a.name.localeCompare(b.name))[0];
  }

  function addProposalItem(items, load, date, shift, p, rule, weight=1){
    if(!p) return;
    items.push({date:iso(date), shift, personId:p.id, rule});
    load[p.id] = (load[p.id] || 0) + weight;
  }


  function defaultFairFrom(){
    const d = new Date(selectedDate);
    d.setHours(12,0,0,0);
    return d;
  }

  function getFairFrom(){
    const input = $("#fairFrom");
    if(input && !input.value) input.value = iso(defaultFairFrom());
    const value = input?.value || iso(defaultFairFrom());
    const d = new Date(value + "T12:00:00");
    return isNaN(d.getTime()) ? defaultFairFrom() : d;
  }

  function setFairDateDefaults(){
    const from = $("#fairFrom");
    const until = $("#fairUntil");
    if(from && !from.value) from.value = iso(defaultFairFrom());
    if(until && !until.value) until.value = iso(defaultFairUntil());
  }

  function defaultFairUntil(){
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0, 12);
  }

  function getFairUntil(){
    const input = $("#fairUntil");
    if(input && !input.value) input.value = iso(defaultFairUntil());
    const value = input?.value || iso(defaultFairUntil());
    const d = new Date(value + "T12:00:00");
    return isNaN(d.getTime()) ? defaultFairUntil() : d;
  }


  function buildFairProposal(){
    state.rulesEnabled = true;
    const people = activePeople();
    if(!people.length){
      toast("No hay personas activas");
      return;
    }

    const start = getFairFrom();
    const end = getFairUntil();

    if(end < start){
      toast("La fecha final no puede ser anterior al inicio");
      return;
    }

    const load = Object.fromEntries(people.map(p=>[p.id,0]));
    const items = [];
    const cfg = state.config;
    const weekendAssigned = new Set();

    for(let cursor = new Date(start); cursor <= end; cursor = addDays(cursor,1)){
      const d = new Date(cursor);
      const day = d.getDay();
      const wi = weekIndex(d);

      if(day === 6){
        const weekendKey = iso(d);
        if(!weekendAssigned.has(weekendKey)){
          weekendAssigned.add(weekendKey);
          const weekendPerson = chooseLeast(cfg.weekendRotation || people.map(p=>p.id), load);
          const sunday = addDays(d,1);

          if(d >= start && d <= end){
            addProposalItem(items, load, d, "dia", weekendPerson, "Fin de semana del tirón · reparto justo", 1);
            addProposalItem(items, load, d, "noche", weekendPerson, "Fin de semana del tirón · reparto justo", 1.25);
          }
          if(sunday >= start && sunday <= end){
            addProposalItem(items, load, sunday, "dia", weekendPerson, "Fin de semana del tirón · reparto justo", 1);
          }
        }
      }

      if(day === 2 || day === 4){
        const p = safePerson(cfg.tueThuAfternoon, wi+day);
        addProposalItem(items, load, d, "tarde", p, "Martes y jueves tarde: Mari José", 1);
      }else if(day === 3){
        const p = safePerson(cfg.wedAfternoon, wi+day);
        addProposalItem(items, load, d, "tarde", p, "Miércoles tarde: Bea", 1);
      }else if(day === 1 || day === 5){
        const p = chooseLeast(cfg.monFriAlternation || people.map(x=>x.id), load);
        addProposalItem(items, load, d, "tarde", p, "Lunes y viernes tarde · equilibrio Marta/Patri", 1);
        addProposalItem(items, load, d, "noche", p, "Lunes y viernes duerme quien está de tarde", 1.25);
        continue;
      }

      if(day === 6){
        continue;
      }

      if(day === 0 || day === 2 || day === 4){
        const p = chooseLeast(cfg.remainingNightRotation || people.map(x=>x.id), load);
        addProposalItem(items, load, d, "noche", p, "Domingo, martes y jueves noche · reparto justo", 1.25);
      }else if(day === 3){
        const p = chooseLeast(people.map(x=>x.id), load);
        addProposalItem(items, load, d, "noche", p, "Miércoles noche · reparto justo", 1.25);
      }
    }

    state.proposal = {
      id: uid("proposal"),
      createdAt: new Date().toISOString(),
      startDate: iso(start),
      endDate: iso(end),
      status: "pending",
      approvals: {},
      items
    };
    save();
    renderAgenda();
    renderApprovalPanel();
    toast("Reparto generado");
  }

  function proposalCounts(){
    const p = state.proposal;
    const counts = {};
    activePeople().forEach(x=>counts[x.id]=0);
    if(!p) return counts;
    p.items.forEach(item=>{
      counts[item.personId] = (counts[item.personId] || 0) + 1;
    });
    return counts;
  }

  function renderApprovalPanel(){
    const el = $("#approvalPanel");
    if(!el) return;

    const proposal = state.proposal;
    if(!proposal){
      el.hidden = true;
      el.innerHTML = "";
      return;
    }

    el.hidden = false;

    const counts = proposalCounts();
    const people = activePeople();

    el.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>Reparto generado</h2>
          <p>Periodo: ${proposal.startDate} — ${proposal.endDate || ""} · ${proposal.items.length} turnos. Revisa el reparto y apruébalo para aplicarlo al calendario.</p>
        </div>
        <div class="approval-single-actions">
          <button class="btn primary" data-commit-proposal type="button">Aprobar reparto</button>
          <button class="btn dark" data-fair-distribute type="button">Recalcular</button>
          <button class="btn danger" data-clear-proposal type="button">Eliminar</button>
        </div>
      </div>

      <div class="approval-summary">
        ${people.map(p=>{
          return `<div class="approval-person">
            <b><i class="avatar-dot" style="background:${p.color}"></i> ${p.name}</b>
            <small>${counts[p.id] || 0} turnos asignados</small>
          </div>`;
        }).join("")}
      </div>

      <div class="approval-list">
        ${proposal.items.slice(0,80).map(item=>{
          const p = person(item.personId);
          return `<div class="approval-row">
            <b>${item.date}</b>
            <span>${item.shift}</span>
            <div class="person-pill"><i class="avatar-dot" style="background:${p ? p.color : "#999"}"></i>${p ? p.name : "Sin cubrir"}</div>
            <span>${item.rule}</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  function approveProposal(personId, status){
    if(!state.proposal) return;
    state.proposal.approvals[personId] = status;
    save();
    renderApprovalPanel();
    toast(status === "approved" ? "Aprobación registrada" : "Rechazo registrado");
  }

  function commitProposal(){
    const p = state.proposal;
    if(!p) return;
    p.items.forEach(item=>{
      state.manual[`${item.date}:${item.shift}`] = item.personId;
    });
    p.status = "definitive";
    state.proposal = null;
    save();
    renderAgenda();
    renderApprovalPanel();
    toast("Reparto aprobado y aplicado");
  }

  function clearProposal(){
    if(!state.proposal) return;
    if(!confirm("Eliminar la propuesta de reparto?")) return;
    state.proposal = null;
    save();
    renderApprovalPanel();
    toast("Propuesta eliminada");
  }



  function clearCalendar(){
    if(!confirm("Borrar todo? Se vaciará el calendario, se eliminarán cambios manuales, propuestas y variables personalizadas. Las personas se mantienen.")) return;
    state.manual = {};
    state.proposal = null;
    state.config = clone(defaultConfig);
    state.config.customVariables = [];
    state.rulesEnabled = false;
    save();
    renderAll();
    toast("Calendario y variables borrados");
  }

  function applyVariables(){
    state.rulesEnabled = true;
    state.manual = {};
    state.proposal = null;
    state.config = {...clone(defaultConfig), ...state.config};
    save();
    renderAll();
    toast("Variables aplicadas");
  }



  function setupMobileTools(){
    const filters = document.querySelector(".agenda-tools");
    const reparto = document.querySelector(".agenda-reparto");
    const mobile = window.matchMedia("(max-width: 980px)").matches;

    if(filters){
      if(mobile){ filters.removeAttribute("open"); }
      else{ filters.setAttribute("open",""); }
    }

    if(reparto){
      if(mobile){ reparto.removeAttribute("open"); }
      else{ reparto.setAttribute("open",""); }
    }
  }


  function bind(){
    setupMobileTools();
    window.addEventListener('resize', setupMobileTools);
    const menu = $("#menuBtn"), links = $("#navLinks");
    if(menu && links) menu.addEventListener("click",()=>links.classList.toggle("open"));
    $$(".view-btn").forEach(b=>b.addEventListener("click",()=>{ currentView=b.dataset.view; renderAgenda(); }));
    $("#personFilter")?.addEventListener("change",e=>{ filterPerson = e.target.value; renderAgenda(); });
    $("#shiftFilter")?.addEventListener("change",e=>{ filterShift = e.target.value; renderAgenda(); });
    $("#prevPeriod")?.addEventListener("click",()=>{
      if(currentView === "year") selectedDate = new Date(selectedDate.getFullYear()-1, selectedDate.getMonth(), 1, 12);
      else if(currentView === "month") selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth()-1, 1, 12);
      else if(currentView === "week") selectedDate = addDays(selectedDate, -7);
      else if(currentView === "list") selectedDate = addDays(selectedDate, -35);
      else selectedDate = addDays(selectedDate, -1);
      selectedMonthDate = new Date(selectedDate);
      renderAgenda();
    });
    $("#nextPeriod")?.addEventListener("click",()=>{
      if(currentView === "year") selectedDate = new Date(selectedDate.getFullYear()+1, selectedDate.getMonth(), 1, 12);
      else if(currentView === "month") selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 1, 12);
      else if(currentView === "week") selectedDate = addDays(selectedDate, 7);
      else if(currentView === "list") selectedDate = addDays(selectedDate, 35);
      else selectedDate = addDays(selectedDate, 1);
      selectedMonthDate = new Date(selectedDate);
      renderAgenda();
    });
    $("#todayBtn")?.addEventListener("click",()=>{
      selectedDate = new Date();
      selectedDate.setHours(12,0,0,0);
      if(currentView === "month") selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
      if(currentView === "year") selectedDate = new Date(selectedDate.getFullYear(), 0, 1, 12);
      selectedMonthDate = new Date(selectedDate);
      renderAgenda();
    });
    document.addEventListener("click",e=>{
      const selectDate = e.target.closest("[data-select-date]");
      if(selectDate){ selectedMonthDate = new Date(selectDate.dataset.selectDate + "T12:00:00"); renderAgenda(); return; }

      const applyVars = e.target.closest("[data-apply-variables]");
      if(applyVars){ applyVariables(); return; }

      const clearCal = e.target.closest("[data-clear-calendar]");
      if(clearCal){ clearCalendar(); return; }

      const fair = e.target.closest("[data-fair-distribute]");
      if(fair){ buildFairProposal(); return; }

      const commit = e.target.closest("[data-commit-proposal]");
      if(commit){ commitProposal(); return; }

      const clear = e.target.closest("[data-clear-proposal]");
      if(clear){ clearProposal(); return; }

      const ov = e.target.closest("[data-override]");
      if(ov){ openOverride(ov.dataset.override); return; }
      const tv = e.target.closest("[data-toggle-person]");
      if(tv){
        const p = person(tv.dataset.togglePerson);
        if(p){ p.blocked = !p.blocked; save(); renderPeople(); renderAgenda(); toast(p.blocked?"Persona bloqueada":"Persona desbloqueada"); }
        return;
      }
      const dp = e.target.closest("[data-delete-person]");
      if(dp){
        const p = person(dp.dataset.deletePerson);
        if(p && confirm(`Eliminar a ${p.name}?`)){
          state.people = state.people.filter(x=>x.id!==p.id);
          save(); renderPeople(); renderAgenda(); toast("Persona eliminada");
        }
        return;
      }
      const dv = e.target.closest("[data-delete-var]");
      if(dv){
        state.config.customVariables = state.config.customVariables.filter(v=>v.id!==dv.dataset.deleteVar);
        save(); renderVariables(); toast("Variable eliminada");
        return;
      }
    });
    $("#variablesForm")?.addEventListener("submit",saveVariables);
    $("#resetRules")?.addEventListener("click",()=>{ state.config = clone(defaultConfig); state.rulesEnabled = true; save(); renderAll(); toast("Reglas iniciales restauradas"); });
    $("#customVarForm")?.addEventListener("submit",e=>{
      e.preventDefault();
      const f=e.currentTarget;
      state.config.customVariables.push({id:uid("cv"), name:f.elements.name.value, value:f.elements.value.value, notes:f.elements.notes.value});
      state.rulesEnabled = true;
      save(); f.reset(); renderAll(); toast("Variable añadida");
    });
    
    document.addEventListener("input",e=>{
      const color = e.target.closest("[data-person-color]");
      if(color){
        const p = state.people.find(x=>x.id===color.dataset.personColor);
        if(p){
          p.color = color.value;
          save();
          renderAll();
        }
      }
    });

    $("#personForm")?.addEventListener("submit",addPerson);
    $("#resetAll")?.addEventListener("click",resetAll);
    $("#exportJson")?.addEventListener("click",exportJson);
    $("#exportCsv")?.addEventListener("click",exportCsv);
    $("#importJson")?.addEventListener("change",e=>{
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const data = JSON.parse(reader.result);
          if(!Array.isArray(data.people) || !data.config) throw new Error("backup no válido");
          state = data; save(); renderAll(); toast("Backup importado");
        }catch(err){ toast("JSON no válido"); }
      };
      reader.readAsText(file);
    });
  }

  function renderAll(){
    renderAgenda();
    renderVariables();
    renderPeople();
    renderApprovalPanel();
  }

  bind();
  renderAll();
})();



/* Mobile menu close safety */
document.addEventListener("click", function(e){
  var a = e.target.closest && e.target.closest(".nav-links a, .bottom-nav a");
  if(a){
    var nav = document.getElementById("navLinks");
    if(nav) nav.classList.remove("open");
  }
});
