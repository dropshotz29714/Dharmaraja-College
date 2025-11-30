/* global gsap, ScrollTrigger, Lenis, Fuse, dayjs */
dayjs.extend(window.dayjs_plugin_utc || {});
dayjs.extend(window.dayjs_plugin_timezone || {});

(() => {
  try { if (window.Lenis) { const lenis = new Lenis({ lerp: 0.085 }); function raf(t){lenis.raf(t); requestAnimationFrame(raf);} requestAnimationFrame(raf);} } catch(e){}
  const hasGSAP = !!(window.gsap && window.ScrollTrigger); if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const setupReveals = () => {
    const targets = document.querySelectorAll('.reveal'); if (!targets.length) return;
    if (hasGSAP) targets.forEach(el => gsap.fromTo(el,{opacity:0,y:28},{opacity:1,y:0,ease:'power3.out',duration:.8,scrollTrigger:{trigger:el,start:'top 85%'}}));
    else if ('IntersectionObserver' in window){
      const io = new IntersectionObserver((es,obs)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed'); obs.unobserve(e.target);}})},{threshold:.15});
      targets.forEach(t=>io.observe(t));
    } else targets.forEach(t=>t.classList.add('revealed'));
  };

  const inlineJSON = (id) => { const el = document.getElementById(id); if (!el) return []; try { return JSON.parse(el.textContent.trim()||'[]'); } catch(e){ return []; } };

  const getTickets = () => JSON.parse(localStorage.getItem('tickets')||'[]');
  const setTickets = (arr) => localStorage.setItem('tickets', JSON.stringify(arr));
  const getRSVPs = () => JSON.parse(localStorage.getItem('rsvps')||'[]');
  const setRSVPs = (arr) => localStorage.setItem('rsvps', JSON.stringify(arr));
  const eventsAll = () => (JSON.parse(localStorage.getItem('eventsOverride')||'[]')).concat(inlineJSON('events-data'));

  const ticketsForEvent = (id) => getTickets().filter(t=>t.eventId===id);
  const remainingFor = (ev) => {
    const base = ev.capacity || 0;
    const sold = ticketsForEvent(ev.id).reduce((sum,t)=> sum + (parseInt(t.qty||1)||1), 0);
    return Math.max(0, base - sold);
  };

  // Countdown helper
  const setupCountdowns = () => {
    document.querySelectorAll('[data-countdown]').forEach(node => {
      const end = dayjs(node.dataset.countdown);
      const tick = () => {
        const now = dayjs(); const diff = end.diff(now);
        if (diff <= 0) { node.textContent = 'Live now'; return; }
        const d = Math.floor(diff/86400000), h = Math.floor(diff/3600000)%24, m = Math.floor(diff/60000)%60;
        node.textContent = `${d}d ${h}h ${m}m`;
      };
      tick(); setInterval(tick, 30000);
    });
  };

  // Modal
  const modal = {
    el: null, open(data){ if(!this.el) this.el = document.getElementById('modal'); this.el.classList.add('open'); this.fill(data); },
    close(){ this.el?.classList.remove('open'); },
    fill({mode, event}){
      const sheet = this.el.querySelector('.sheet');
      const isTicket = mode==='ticket';
      const pricing = event.pricing || {};
      const typeOptions = Object.keys(pricing).map(k=>`<option value="${k}" data-price="${pricing[k]}">${k} — Rs.${pricing[k]}</option>`).join('');
      sheet.innerHTML = `
        <h3>${isTicket? 'Get Ticket' : 'RSVP'} — ${event.title}</h3>
        <p class="muted">${dayjs(event.date).format('DD MMM YYYY • h:mm A')} • ${event.venue}</p>
        <form id="modal-form" style="display:grid; gap:10px">
          <div class="row">
            <label>Full name*<input name="name" required></label>
            <label>Role*<select name="role" required><option>Parent</option><option>Student</option><option>Teacher</option><option>Other</option></select></label>
          </div>
          <div class="row">
            <label>Email<input name="email" type="email"></label>
            <label>Phone<input name="phone" type="tel"></label>
          </div>
          ${isTicket ? `
          <div class="row">
            <label>Type*<select name="type" required>${typeOptions||'<option>BASIC</option>'}</select></label>
            <label>Qty*<input name="qty" type="number" min="1" max="10" value="1" required></label>
          </div>
          <div><span class="badge"><i class="fa-solid fa-ticket"></i> Remaining: ${remainingFor(event)}</span></div>
          ` : ''}
          <div class="actions">
            <button type="button" class="btn" id="cancel">Cancel</button>
            <button class="pill" type="submit">${isTicket? 'Confirm Ticket' : 'Confirm RSVP'}</button>
          </div>
        </form>`;
      sheet.querySelector('#cancel').onclick = () => this.close();
      sheet.querySelector('#modal-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (isTicket){
          const qty = parseInt(fd.get('qty'))||1;
          if (qty > remainingFor(event)) { alert('Not enough tickets left.'); return; }
          const type = fd.get('type'); const unit = (event.pricing||{})[type]||0;
          const ticket = {
            id: String(Date.now())+'-'+Math.random().toString(36).slice(2,7),
            eventId: event.id, name: fd.get('name'), role: fd.get('role'),
            email: fd.get('email')||'', phone: fd.get('phone')||'',
            type, unitPrice: unit, qty, total: unit*qty, ts: new Date().toISOString()
          };
          const arr = getTickets(); arr.push(ticket); setTickets(arr);
          alert('Ticket booked! ID: '+ticket.id+' • Total Rs.'+ticket.total);
        } else {
          const rsvp = {
            id: String(Date.now())+'-'+Math.random().toString(36).slice(2,7),
            eventId: event.id, name: fd.get('name'), role: fd.get('role'),
            email: fd.get('email')||'', phone: fd.get('phone')||'',
            ts: new Date().toISOString()
          };
          const arr = getRSVPs(); arr.push(rsvp); setRSVPs(arr);
          alert('RSVP confirmed!');
        }
        this.close();
        // refresh lists if on events page
        mountEvents && mountEvents();
        renderAdmin && renderAdmin();
      };
    }
  };

  // Announcements
  const mountNews = () => {
    const mount = document.getElementById('ann-mount'); if (!mount) return;
    const list = (JSON.parse(localStorage.getItem('newsOverride')||'[]')).concat(inlineJSON('news-data'));
    const input = document.getElementById('ann-search');
    const fuse = new (window.Fuse||function(){return {search:()=>[]}})(list,{keys:['title','body'],threshold:.35});
    const render = (items) => {
      mount.innerHTML = items.map(x=>`
        <article class="card reveal" style="grid-column:span 6">
          <div class="card-head">
            <div class="emblem"><i class="fa-regular fa-newspaper"></i></div>
            <div>
              <h3 class="card-title">${x.title}</h3>
              <div class="card-meta"><span><i class="fa-regular fa-calendar"></i> ${x.date}</span></div>
            </div>
          </div>
          <div class="card-body">${x.body}</div>
        </article>`).join('');
      setupReveals();
    };
    const sorted = list.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    render(sorted);
    input?.addEventListener('input', ()=>{
      const q=input.value.trim(); render(q? fuse.search(q).map(r=>r.item):sorted);
    });
  };

  // Events (tickets vs RSVP for meetings)
  window.mountEvents = () => {
    const root = document.getElementById('events-mount'); if (!root) return;
    const list = eventsAll();
    const sel = document.getElementById('events-filter');
    const icons = { competition:'fa-trophy', sports:'fa-medal', exhibition:'fa-image', meeting:'fa-handshake', workshop:'fa-laptop-code' };
    const render = (items) => {
      const upMount = document.getElementById('upcoming'); if (upMount) {
        const upcoming = items.filter(e=>new Date(e.date)>new Date()).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,3);
        upMount.innerHTML = upcoming.map(x=>`
          <div class="card reveal" style="grid-column:span 4">
            <div class="card-head">
              <div class="emblem"><i class="fa-solid ${icons[x.type]||'fa-star'}"></i></div>
              <div>
                <h3 class="card-title">${x.title}</h3>
                <div class="card-meta"><span><i class="fa-regular fa-calendar"></i> ${dayjs(x.date).format('DD MMM YYYY')}</span></div>
              </div>
            </div>
            <div class="card-body">${x.description||''}</div>
          </div>`).join('');
      }
      root.innerHTML = items.map(x=>{
        const left = remainingFor(x);
        const isMeeting = x.type==='meeting';
        const pricing = x.pricing || {};
        const priceLabel = isMeeting? '<span class="badge"><i class="fa-regular fa-circle-check"></i> RSVP</span>' :
          ('<span class="badge"><i class="fa-solid fa-ticket"></i> ' + Object.entries(pricing).map(([k,v])=> `${k}: Rs.${v}` ).join(' • ') + '</span>');
        return `
        <div class="card reveal" style="grid-column: span 6">
          <div class="card-head">
            <div class="emblem"><i class="fa-solid ${icons[x.type]||'fa-star'}"></i></div>
            <div>
              <h3 class="card-title">${x.title}</h3>
              <div class="card-meta">
                <span><i class="fa-regular fa-clock"></i> <span data-countdown="${x.date}"></span></span>
                <span><i class="fa-regular fa-calendar"></i> ${dayjs(x.date).format('DD MMM YYYY')} ${x.time?('• '+x.time):''}</span>
                <span><i class="fa-solid fa-location-dot"></i> ${x.venue}</span>
                ${!isMeeting? `<span><i class="fa-solid fa-ticket"></i> ${left} left</span>`:''}
                ${priceLabel}
              </div>
            </div>
          </div>
          <div class="card-body">${x.description||''}</div>
          <div class="card-actions">
            <button class="btn" data-ics='${JSON.stringify(x).replace(/'/g,"&#39;")}'><i class="fa-regular fa-calendar-plus"></i> Add to Calendar</button>
            ${isMeeting
              ? `<button class="btn" data-rsvp='${x.id}'><i class="fa-regular fa-circle-check"></i> RSVP</button>`
              : left<=0 ? `<span class="badge"><i class="fa-solid fa-ban"></i> Sold out</span>`
                : `<button class="btn" data-ticket='${x.id}'><i class="fa-solid fa-ticket"></i> Get Ticket</button>`}
          </div>
        </div>`;
      }).join('');
      // Bind ICS
      root.querySelectorAll('[data-ics]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const ev = JSON.parse(btn.getAttribute('data-ics').replace(/&#39;/g,"'"));
          const startUtc = dayjs(ev.date).utc().format('YYYYMMDD[T]HHmmss[Z]');
          const endUtc = dayjs(ev.date).add(2,'hour').utc().format('YYYYMMDD[T]HHmmss[Z]');
          const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Rajans//EN","BEGIN:VEVENT",
            "UID:"+String(Date.now())+"@rajans","DTSTAMP:"+dayjs().utc().format('YYYYMMDD[T]HHmmss[Z]'),
            "DTSTART:"+startUtc,"DTEND:"+endUtc,"SUMMARY:"+ev.title,"LOCATION:"+ev.venue,"DESCRIPTION:"+(ev.description||""),
            "END:VEVENT","END:VCALENDAR"].join("\\r\\n");
          const blob = new Blob([ics], {type:'text/calendar'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (ev.title||'event')+'.ics'; a.click();
        });
      });
      // Bind Ticket/RSVP
      root.querySelectorAll('[data-ticket]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const ev = eventsAll().find(e=>e.id===btn.getAttribute('data-ticket')); if (!ev) return;
          modal.open({mode:'ticket', event: ev});
        });
      });
      root.querySelectorAll('[data-rsvp]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const ev = eventsAll().find(e=>e.id===btn.getAttribute('data-rsvp')); if (!ev) return;
          modal.open({mode:'rsvp', event: ev});
        });
      });
      setupReveals(); setupCountdowns();
    };
    const apply = () => {
      const v = sel?.value || 'all';
      const base = list.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
      const items = (v==='all'? base : base.filter(x=>x.type===v));
      render(items);
    };
    sel?.addEventListener('change', apply);
    apply();
  };

  // Calendar with Today highlight and default to current month/year
  const mountCalendar = () => {
    const cal = document.getElementById('cal-grid'); if (!cal) return;
    const monthSel = document.getElementById('cal-month'); const yearSel = document.getElementById('cal-year');
    const list = eventsAll();
    const build = () => {
      const m = parseInt(monthSel.value,10), y = parseInt(yearSel.value,10);
      cal.innerHTML = '';
      const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      dow.forEach(d => cal.insertAdjacentHTML('beforeend', `<div class="dow">${d}</div>`));
      const first = new Date(y, m, 1), startDay = first.getDay(), days = new Date(y, m+1, 0).getDate();
      const today = new Date(); const isCurrentMonth = (today.getMonth()===m && today.getFullYear()===y);
      for (let i=0;i<startDay;i++) cal.insertAdjacentHTML('beforeend', `<div></div>`);
      for (let d=1; d<=days; d++){
        const cellDate = new Date(y,m,d);
        const todays = list.filter(ev => new Date(ev.date).toDateString()===cellDate.toDateString());
        const dots = todays.length?'<span class="dot"></span>':'';
        const listHtml = todays.map(ev=>`<div><i class="fa-regular fa-circle"></i> ${ev.title}</div>`).join('');
        const todayClass = isCurrentMonth && d===today.getDate() ? ' today' : '';
        cal.insertAdjacentHTML('beforeend', `<div class="cell${todayClass}"><div class="num">${d}${todayClass?' • Today':''}</div>${dots}<div class="list">${listHtml}</div></div>`);
      }
    };
    monthSel.addEventListener('change', build);
    yearSel.addEventListener('change', build);
    const now = new Date();
    monthSel.value = String(now.getMonth());
    // Ensure the year select contains current year, else add it
    if (![...yearSel.options].some(o=>o.value==String(now.getFullYear()))) {
      const opt = document.createElement('option'); opt.value = String(now.getFullYear()); opt.textContent = String(now.getFullYear()); yearSel.appendChild(opt);
    }
    yearSel.value = String(now.getFullYear());
    build();
  };

  // Gallery
  const mountGallery = () => {
    const g = document.getElementById('gallery'); if (!g) return;
    const imgs = Array.from({length:6}, (_,i)=>`assets/gallery/ph-${i+1}.svg`);
    g.innerHTML = imgs.map(src=>`<a href="${src}" data-full="${src}"><img src="${src}" alt=""></a>`).join('');
    const lb = document.getElementById('lightbox'), lbimg = document.getElementById('lightbox-img');
    g.querySelectorAll('a').forEach(a=>{
      a.addEventListener('click', (e)=>{ e.preventDefault(); lbimg.src = a.dataset.full; lb.classList.add('open'); });
    });
    lb.addEventListener('click', ()=> lb.classList.remove('open'));
  };

  // Dashboards (same as v2)
  const mountDashboards = () => {
    const pMount = document.getElementById('dash-parents'); if (pMount){
      pMount.querySelector('button[name="lookup"]').addEventListener('click', ()=>{
        const who = pMount.querySelector('input[name="child"]').value.trim(); if (!who) return;
        const my = getTickets().filter(t=>t.name.toLowerCase()===who.toLowerCase());
        const list = my.map(t=>`<li><code>${t.id}</code> — ${t.eventId} • ${t.type} x${t.qty} (Rs.${t.total})</li>`).join('') || '<li>No tickets yet.</li>';
        pMount.querySelector('.my-tickets').innerHTML = list;
      });
    }
    const sMount = document.getElementById('dash-students'); if (sMount){
      const bookmarks = JSON.parse(localStorage.getItem('bookmarks')||'[]');
      const all = eventsAll();
      const addSel = sMount.querySelector('select[name="event"]');
      addSel.innerHTML = all.map(ev=>`<option value="${ev.id}">${ev.title}</option>`).join('');
      const render = () => {
        sMount.querySelector('.bookmarks').innerHTML = bookmarks.map(id=>{
          const ev = all.find(e=>e.id===id); return `<li>${ev?ev.title:id}</li>`;
        }).join('') || '<li>No bookmarks.</li>';
      };
      sMount.querySelector('button[name="add"]').addEventListener('click', ()=>{
        const id = addSel.value; if (!bookmarks.includes(id)) bookmarks.push(id);
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks)); render();
      });
      render();
    }
    const tMount = document.getElementById('dash-teachers'); if (tMount){
      tMount.querySelector('button[name="validate"]').addEventListener('click', ()=>{
        const code = tMount.querySelector('input[name="code"]').value.trim(); if (!code) return;
        const hit = getTickets().find(t=>t.id===code);
        tMount.querySelector('.result').textContent = hit ? `✅ Valid — ${hit.name} (${hit.role}) for ${hit.eventId} • ${hit.type} x${hit.qty}` : '❌ Not found';
      });
    }
  };

  // Admin tables
  window.renderAdmin = () => {
    const tMount = document.getElementById('admin-tickets');
    const rMount = document.getElementById('admin-rsvps');
    if (tMount){
      const rows = getTickets().map(t=>`<tr><td>${t.id}</td><td>${t.eventId}</td><td>${t.name}</td><td>${t.role}</td><td>${t.type}</td><td>${t.qty}</td><td>${t.total}</td><td>${new Date(t.ts).toLocaleString()}</td></tr>`).join('');
      tMount.querySelector('tbody').innerHTML = rows || '<tr><td colspan="8">No tickets yet.</td></tr>';
      tMount.querySelector('button[name="export"]').onclick = () => {
        const arr = getTickets();
        const csvHead = "id,eventId,name,role,type,qty,total,timestamp\n";
        const csv = csvHead + arr.map(t=>[t.id,t.eventId,t.name,t.role,t.type,t.qty,t.total,t.ts].join(',')).join('\n');
        const blob = new Blob([csv],{type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tickets.csv'; a.click();
      };
      tMount.querySelector('button[name="clear"]').onclick = () => { if(confirm('Clear all tickets?')){ localStorage.removeItem('tickets'); renderAdmin(); } };
    }
    if (rMount){
      const rows = getRSVPs().map(t=>`<tr><td>${t.id}</td><td>${t.eventId}</td><td>${t.name}</td><td>${t.role}</td><td>${new Date(t.ts).toLocaleString()}</td></tr>`).join('');
      rMount.querySelector('tbody').innerHTML = rows || '<tr><td colspan="5">No RSVPs yet.</td></tr>';
      rMount.querySelector('button[name="export"]').onclick = () => {
        const arr = getRSVPs();
        const csvHead = "id,eventId,name,role,timestamp\n";
        const csv = csvHead + arr.map(t=>[t.id,t.eventId,t.name,t.role,t.ts].join(',')).join('\n');
        const blob = new Blob([csv],{type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rsvps.csv'; a.click();
      };
      rMount.querySelector('button[name="clear"]').onclick = () => { if(confirm('Clear all RSVPs?')){ localStorage.removeItem('rsvps'); renderAdmin(); } };
    }
  };

  // Admin create forms
  const setupAdmin = () => {
    const newsForm = document.getElementById('admin-news'); const evForm = document.getElementById('admin-events');
    if (newsForm) {
      newsForm.addEventListener('submit', (e)=>{
        e.preventDefault();
        const fd = new FormData(newsForm);
        const item = { title: fd.get('title'), date: fd.get('date'), body: fd.get('body') };
        const arr = JSON.parse(localStorage.getItem('newsOverride')||'[]'); arr.unshift(item);
        localStorage.setItem('newsOverride', JSON.stringify(arr));
        alert('Announcement saved locally. Refresh Announcements page to see it.');
        newsForm.reset();
      });
    }
    if (evForm) {
      evForm.addEventListener('submit', (e)=>{
        e.preventDefault();
        const fd = new FormData(evForm);
        const pricing = {};
        const basic = parseInt(fd.get('price_basic')||'0')||0;
        const vip = parseInt(fd.get('price_vip')||'0')||0;
        if (basic>=0) pricing.BASIC = basic;
        if (vip>=0) pricing.VIP = vip;
        const item = {
          id: 'ev-'+String(Date.now()),
          title: fd.get('title'), date: fd.get('date'), venue: fd.get('venue'),
          type: fd.get('type'), time: fd.get('time'), description: fd.get('description'),
          capacity: parseInt(fd.get('capacity')||'0')||0, pricing: (fd.get('type')==='meeting'? undefined : pricing)
        };
        const arr = JSON.parse(localStorage.getItem('eventsOverride')||'[]'); arr.push(item);
        localStorage.setItem('eventsOverride', JSON.stringify(arr));
        alert('Event saved locally. Open Events/Calendar to see it.');
        evForm.reset();
      });
    }
  };

  const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();

  // Unified Admin form
  const adminCreate = document.getElementById('admin-create');
  if (adminCreate){
    const typeSel = adminCreate.querySelector('#itemType');
    const toggle = () => {
      const isEvent = typeSel.value === 'event';
      adminCreate.querySelectorAll('.only-event').forEach(n => n.style.display = isEvent ? '' : 'none');
      // Switch required attributes
      adminCreate.querySelector('[name="datetime"]')?.toggleAttribute('required', isEvent);
      adminCreate.querySelector('[name="venue"]')?.toggleAttribute('required', isEvent);
      adminCreate.querySelector('[name="type"]')?.toggleAttribute('required', isEvent);
      adminCreate.querySelector('[name="capacity"]')?.toggleAttribute('required', isEvent);
      // Date input type changes for convenience
      const dateField = adminCreate.querySelector('#dateField');
      dateField.type = isEvent ? 'date' : 'date';
    };
    typeSel.addEventListener('change', toggle);
    toggle();

    adminCreate.addEventListener('submit', (e)=>{
      e.preventDefault();
      const fd = new FormData(adminCreate);
      const itemType = fd.get('itemType');
      const title = fd.get('title'); const body = fd.get('body');
      if (itemType === 'announcement'){
        const date = fd.get('date');
        const a = JSON.parse(localStorage.getItem('newsOverride')||'[]');
        a.unshift({ title, date, body });
        localStorage.setItem('newsOverride', JSON.stringify(a));
        alert('Announcement saved. Check Announcements.');
      } else {
        const when = fd.get('datetime') || (fd.get('date')+'T09:00');
        const pricing = {};
        const basic = parseInt(fd.get('price_basic')||'0')||0;
        const vip = parseInt(fd.get('price_vip')||'0')||0;
        const type = fd.get('type');
        if (type !== 'meeting'){ pricing.BASIC = basic; pricing.VIP = vip; }
        const ev = {
          id: 'ev-'+String(Date.now()),
          title, date: when, time: '', venue: fd.get('venue'),
          type, description: body, capacity: parseInt(fd.get('capacity')||'0')||0,
          pricing: (type==='meeting'? undefined : pricing)
        };
        const a = JSON.parse(localStorage.getItem('eventsOverride')||'[]'); a.push(ev);
        localStorage.setItem('eventsOverride', JSON.stringify(a));
        alert('Event saved. Check Events/Calendar.');
      }
      adminCreate.reset(); toggle();
      renderAdmin && renderAdmin();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupReveals();
    mountNews(); mountEvents(); mountCalendar(); mountGallery(); mountDashboards();
    setupAdmin(); renderAdmin();
    // modal root close
    const modalEl = document.getElementById('modal'); modalEl?.addEventListener('click', (e)=>{ if(e.target.id==='modal') modal.close(); });
  });
})();

// Parallax glow sphere scroll toggle
window.addEventListener('scroll', ()=>{
  const y = window.scrollY;
  if (y>40) document.body.classList.add('scrolled');
  else document.body.classList.remove('scrolled');
});


// === Scroll progress line ===
const scrollLine = document.createElement('div');
scrollLine.classList.add('scroll-line');
document.body.appendChild(scrollLine);
window.addEventListener('scroll', () => {
  const scrolled = (window.scrollY / (document.body.scrollHeight - innerHeight)) * 100;
  scrollLine.style.width = scrolled + '%';
});

// === Custom glowing cursor ===
const cursor = document.createElement('div');
cursor.classList.add('cursor');
document.body.appendChild(cursor);

document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});
document.querySelectorAll('a, button, .btn, .pill').forEach(el => {
  el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
});


// v3.8: recompute scroll line on load/resize to avoid top gap artifacts
const _recalcScroll = () => {
  const scrolled = (window.scrollY / (document.body.scrollHeight - innerHeight)) * 100;
  const bar = document.querySelector('.scroll-line');
  if (bar) bar.style.width = Math.max(0, Math.min(100, scrolled)) + '%';
};
window.addEventListener('load', _recalcScroll);
window.addEventListener('resize', _recalcScroll);
