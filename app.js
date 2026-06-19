const RR = window.ROUTEREFUND_CONFIG || {};
const supabaseClient = window.supabase?.createClient(RR.SUPABASE_URL, RR.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function toast(message){
  let t=$('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}
  t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)
}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function safeLines(value=''){return escapeHtml(value||'').split('\n').join('<br>')}
function normalizeConfirmation(value=''){return String(value).trim().toUpperCase().replace(/\s+/g,'')}
function validConfirmation(value=''){return /^[A-Z0-9]{6}$/.test(normalizeConfirmation(value))}

async function getUser(){if(!supabaseClient)return null;const {data}=await supabaseClient.auth.getUser();return data?.user||null}
async function ensureProfile(user){if(!user)return;const m=user.user_metadata||{};if(m.name||m.date_of_birth){await supabaseClient.from('profiles').upsert({user_id:user.id,full_name:m.name||'',date_of_birth:m.date_of_birth||null},{onConflict:'user_id'})}}
async function requireLogin(next='trips.html'){const user=await getUser();if(!user){location.href=`login.html?next=${encodeURIComponent(next)}`;return null}await ensureProfile(user);return user}
async function logout(){await supabaseClient.auth.signOut();location.href='index.html'}

async function signup(e){
  e.preventDefault();
  const name=$('name').value.trim(),date_of_birth=$('signupDob').value,email=$('email').value.trim().toLowerCase(),password=$('password').value,password2=$('password2').value;
  if(!name||!date_of_birth||!email||!password)return toast('Fill out all fields');
  if(password.length<8)return toast('Use at least 8 characters');
  if(password!==password2)return toast('Passwords do not match');
  const submit=e.submitter||$('signupSubmit');
  if(submit){submit.disabled=true;submit.textContent='Creating account...'}
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{name,date_of_birth},emailRedirectTo:`${location.origin}/trips.html`}});
  if(submit){submit.disabled=false;submit.textContent='Create account'}
  if(error)return toast(error.message);
  if(data?.user)await ensureProfile(data.user);
  if(data?.session){toast('Account created');location.href='trips.html'}
  else{location.href=`check-email.html?email=${encodeURIComponent(email)}`}
}
async function login(e){e.preventDefault();const email=$('email').value.trim().toLowerCase(),password=$('password').value;const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)return toast(error.message);if(data?.user)await ensureProfile(data.user);const next=new URLSearchParams(location.search).get('next')||($('ownerMode')?'owner.html':'trips.html');location.href=next}
async function forgotEmail(e){e.preventDefault();const payload={full_name:$('recoveryName').value.trim(),date_of_birth:$('recoveryDob').value,status:'New'};if(!payload.full_name||!payload.date_of_birth)return toast('Fill out all required fields');const {error}=await supabaseClient.from('account_recovery_requests').insert(payload);if(error)return toast('Recovery request could not be saved. Run the latest Supabase SQL.');e.target.reset();toast('If we find a match, recovery instructions will be sent to the account email.')}
async function resetPassword(e){e.preventDefault();const email=$('email').value.trim().toLowerCase();const redirectTo=`${location.origin}/update-password.html`;const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error)return toast(error.message);toast('Reset email sent')}
async function updatePassword(e){e.preventDefault();const password=$('password').value,password2=$('password2').value;if(password.length<8)return toast('Use at least 8 characters');if(password!==password2)return toast('Passwords do not match');const {error}=await supabaseClient.auth.updateUser({password});if(error)return toast(error.message);toast('Password updated');setTimeout(()=>location.href='trips.html',600)}

async function addTrip(e){
  e.preventDefault();
  const user=await requireLogin('trips.html');if(!user)return;
  if(!$('changeConsent').checked)return toast('Please accept trip authorization to continue');
  const airline=$('airlineSelect')?.value?.trim()||'';
  const confirmation=normalizeConfirmation($('confirmationNo').value);
  const route=$('route')?.value?.trim().toUpperCase()||'';
  const travelDate=$('travelDate')?.value||'';
  if(!validConfirmation(confirmation))return toast('Enter the 6-character airline record locator from the booking email.');
  if(!airline)return toast('Select the airline.');
  if(!route||!travelDate)return toast('Enter the route and departure date so monitoring can run.');
  const rawNotes=$('notes').value.trim();
  const notes=[rawNotes].filter(Boolean).join('\n');
  const trip={user_id:user.id,passenger_first:$('passengerFirst').value.trim(),passenger_last:$('passengerLast').value.trim(),date_of_birth:$('dateOfBirth').value,confirmation_no:confirmation,airline,route,travel_date:travelDate,paid:Number($('paid').value),notes,change_consent:true,status:'Monitoring'};
  const {error}=await supabaseClient.from('trips').insert(trip);
  if(error)return toast(error.message);
  e.target.reset();toast('Flight saved');await renderTrips()
}
async function loadTrips(){const {data,error}=await supabaseClient.from('trips').select('*').order('created_at',{ascending:false});if(error){toast(error.message);return[]}return data||[]}
function tripSavings(r){return r.current_price?Number(r.paid)-Number(r.current_price):0}

async function renderTrips(){
  const box=$('trips');if(!box)return;
  const rows=await loadTrips();
  box.innerHTML=rows.length?rows.map(r=>{
    const savings=tripSavings(r);
    return `<div class="trip"><div class="row"><div><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')} • Paid ${money(r.paid)}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</p></div><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></div><div class="miniTimeline"><span class="done">Received</span><span class="${['Monitoring','Savings found','Closed'].includes(r.status)?'done':''}">Watching</span><span class="${r.status==='Savings found'||r.status==='Closed'?'done':''}">Savings</span><span class="${r.status==='Closed'?'done':''}">Closed</span></div>${r.current_price?`<p><b>Potential savings:</b> ${money(savings)} • New price ${money(r.current_price)}</p>`:'<p>No price drop found yet. RouteRefund is watching this trip.</p>'}${r.notes?`<p><b>Your note:</b> ${safeLines(r.notes)}</p>`:''}<div class="actions"><a class="btn primary" href="trip-detail.html?id=${encodeURIComponent(r.id)}">View trip</a><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><button class="btn danger" data-action="remove" data-id="${r.id}">Remove</button></div></div>`
  }).join(''):`<div class="empty"><h3>No trips yet</h3><p>Forward your confirmation email or add your first booked flight above.</p></div>`
}

async function renderTripDetail(){
  const box=$('tripDetail');if(!box)return;
  const user=await requireLogin(`trip-detail.html${location.search}`);if(!user)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){box.innerHTML='<div class="empty"><h3>No trip selected</h3><p>Go back to My trips and choose a trip.</p><a class="btn primary" href="trips.html">My trips</a></div>';return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Trip not found</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="trips.html">Back to My trips</a></div>`;return}
  const statuses=['Received','Under review','Watching fare','Savings found','Refund/credit captured'];const active=r.status==='Savings found'?3:r.status==='Closed'?4:2;
  box.innerHTML=`<div class="panel tripDetailCard"><div class="row"><div><h2>Confirmation ${escapeHtml(r.confirmation_no||'')}</h2><p>${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')} • Paid ${money(r.paid)}</p></div><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></div><div class="detailTimeline">${statuses.map((x,i)=>`<div class="${i<=active?'done':''}"><b>${i+1}</b><span>${x}</span></div>`).join('')}</div>${r.current_price?`<div class="savingsBox"><h3>Potential savings found</h3><p>New price: ${money(r.current_price)} • Estimated difference: ${money(Number(r.paid)-Number(r.current_price))}</p></div>`:''}${r.notes?`<p><b>Notes:</b><br>${safeLines(r.notes)}</p>`:''}<div class="actions"><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><a class="btn primary" href="trips.html">Back to dashboard</a></div></div>`
}

function modal(html){if(!$('modal'))return;$('modalCard').innerHTML=html;$('modal').classList.add('open')}
async function updateTrip(id,patch,owner=false){const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);if(error)return toast(error.message);if(owner){await renderOwner();await renderOwnerTrip()}else await renderTrips()}
async function removeTrip(id){const {error}=await supabaseClient.from('trips').delete().eq('id',id);if(error)return toast(error.message);toast('Removed');await renderTrips()}
async function completeMonitoringCheck(id,observedPrice){const now=new Date();const next=new Date(now.getTime()+6*60*60*1000);await supabaseClient.from('monitoring_checks').insert({trip_id:id,check_due_at:next.toISOString(),source:'Owner price check',result:'Due',notes:'Scheduled follow-up fare check'});const {error}=await supabaseClient.from('trips').update({current_price:Number(observedPrice),last_checked_at:now.toISOString(),next_check_at:next.toISOString(),status:Number(observedPrice)>0?'Savings found':'Monitoring'}).eq('id',id);if(error)return toast(error.message);await renderOwner();await renderOwnerTrip();toast('Monitoring check saved')}

function ownerControls(){return `<div class="ownerControls"><button class="btn ghost" data-action="owner-filter" data-status="All">All</button><button class="btn ghost" data-action="owner-filter" data-status="Monitoring">Monitoring</button><button class="btn ghost" data-action="owner-filter" data-status="Savings found">Savings found</button><button class="btn ghost" data-action="owner-filter" data-status="Closed">Closed</button><input id="ownerSearch" placeholder="Search confirmation, name, note" aria-label="Search owner trips"></div>`}
async function ownerNotesByTrip(){const {data,error}=await supabaseClient.from('owner_trip_notes').select('trip_id,owner_notes');if(error)return {};return Object.fromEntries((data||[]).map(n=>[n.trip_id,n.owner_notes||'']))}
async function saveOwnerNote(id,note){const {error}=await supabaseClient.from('owner_trip_notes').upsert({trip_id:id,owner_notes:note,updated_at:new Date().toISOString()},{onConflict:'trip_id'});if(error)return toast(error.message);await renderOwner();await renderOwnerTrip();toast('Owner note saved')}
async function dueChecksByTrip(){const {data,error}=await supabaseClient.from('monitoring_checks').select('trip_id,check_due_at,result,observed_price,notes').eq('result','Due').order('check_due_at',{ascending:true});if(error)return {};return (data||[]).reduce((acc,c)=>{(acc[c.trip_id] ||= []).push(c);return acc},{})}
function ownerTripCard(r){
  const savings=tripSavings(r);
  const due=r.due_checks?.length||0;
  return `<div class="trip ownerTrip" data-status="${escapeHtml(r.status||'Monitoring')}" data-search="${escapeHtml([r.confirmation_no,r.passenger_first,r.passenger_last,r.notes,r.owner_notes,r.airline,r.route].join(' ').toLowerCase())}"><div class="row"><div><h3>Confirmation ${escapeHtml(r.confirmation_no||'')}</h3><p>Paid ${money(r.paid)}${r.current_price?` • Current ${money(r.current_price)} • Savings ${money(savings)}`:''}</p><p>${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')} • DOB: ${escapeHtml(r.date_of_birth||'')}</p><p>Payment: ${escapeHtml(r.payment_status||'Not billed')} ${due?`• <b>${due} due check${due>1?'s':''}</b>`:''}</p>${r.notes?`<p><b>Customer note:</b> ${safeLines(r.notes)}</p>`:''}${r.owner_notes?`<p><b>Owner note:</b> ${safeLines(r.owner_notes)}</p>`:''}</div><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></div><div class="actions"><a class="btn primary" href="owner-trip.html?id=${encodeURIComponent(r.id)}">Open workspace</a><button class="btn ghost" data-action="owner-price" data-id="${r.id}">Add price</button><button class="btn ghost" data-action="owner-note" data-id="${r.id}">Owner note</button><button class="btn ghost" data-action="owner-status" data-id="${r.id}" data-status="Monitoring">Monitoring</button><button class="btn primary" data-action="owner-status" data-id="${r.id}" data-status="Savings found">Savings found</button><button class="btn danger" data-action="owner-status" data-id="${r.id}" data-status="Closed">Close</button></div></div>`
}
async function renderOwner(){
  const box=$('ownerTrips');if(!box)return;
  const {data:rows,error}=await supabaseClient.from('trips').select('*').order('created_at',{ascending:false});
  if(error){box.innerHTML=`<div class="panel"><h2>Access blocked</h2><p>${escapeHtml(error.message)}</p><p>Run the Supabase security SQL and add your owner email before using this dashboard.</p></div>`;return}
  const privateNotes=await ownerNotesByTrip();
  const dueChecks=await dueChecksByTrip();
  (rows||[]).forEach(r=>{r.owner_notes=privateNotes[r.id]||'';r.due_checks=dueChecks[r.id]||[]});
  const total=rows?.length||0,monitoring=rows?.filter(r=>r.status==='Monitoring').length||0,found=rows?.filter(r=>r.status==='Savings found').length||0,openSavings=(rows||[]).reduce((sum,r)=>sum+Math.max(tripSavings(r),0),0);
  if($('kpis'))$('kpis').innerHTML=`<div><b>${total}</b><span>Total trips</span></div><div><b>${monitoring}</b><span>Monitoring</span></div><div><b>${found}</b><span>Savings found</span></div><div><b>${money(openSavings)}</b><span>Potential savings</span></div>`;
  box.innerHTML=ownerControls()+(total?rows.map(ownerTripCard).join(''):`<div class="empty"><h3>No customer trips yet</h3></div>`)
}
async function renderOwnerTrip(){
  const box=$('ownerTripDetail');if(!box)return;
  const user=await requireLogin(`owner-trip.html${location.search}`);if(!user)return;if($('ownerWelcome'))$('ownerWelcome').textContent=user.email;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){box.innerHTML='<div class="empty"><h3>No trip selected</h3><a class="btn primary" href="owner.html">Owner dashboard</a></div>';return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Access blocked or trip missing</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="owner.html">Owner dashboard</a></div>`;return}
  const privateNotes=await ownerNotesByTrip();
  r.owner_notes=privateNotes[r.id]||'';
  const savings=tripSavings(r);
  box.innerHTML=`<section class="section"><span class="eyebrow">Owner workspace</span><h1>Confirmation ${escapeHtml(r.confirmation_no||'')}</h1><p class="lead small">${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}<br>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')} • DOB: ${escapeHtml(r.date_of_birth||'')} • User ID: ${escapeHtml(r.user_id||'')}</p></section><section class="grid three section"><div class="card"><h3>Fare snapshot</h3><p>Paid: ${money(r.paid)}</p><p>Current found price: ${r.current_price?money(r.current_price):'Not added'}</p><p>Potential savings: ${money(Math.max(savings,0))}</p></div><div class="card"><h3>Status</h3><p><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></p><p>Payment: ${escapeHtml(r.payment_status||'Not billed')}</p></div><div class="card"><h3>Checklist</h3><ul class="checklist"><li>Confirm booking details</li><li>Check same itinerary/cabin</li><li>Record lower price proof</li><li>Contact customer before action if needed</li></ul></div></section><section class="panel"><h2>Notes</h2>${r.notes?`<p><b>Customer:</b><br>${safeLines(r.notes)}</p>`:'<p class="muted">No customer note.</p>'}${r.owner_notes?`<p><b>Owner:</b><br>${safeLines(r.owner_notes)}</p>`:'<p class="muted">No owner note yet.</p>'}<div class="actions"><button class="btn ghost" data-action="owner-price" data-id="${r.id}">Add/update price</button><button class="btn ghost" data-action="owner-note" data-id="${r.id}">Edit owner note</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Not billed">Not billed</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Invoice sent">Invoice sent</button><button class="btn primary" data-action="owner-payment" data-id="${r.id}" data-status="Paid">Paid</button><button class="btn primary" data-action="owner-status" data-id="${r.id}" data-status="Savings found">Savings found</button><button class="btn danger" data-action="owner-status" data-id="${r.id}" data-status="Closed">Close</button><a class="btn ghost" href="owner.html">Back</a></div></section>`
}
function applyOwnerFilter(status='All'){
  const q=($('ownerSearch')?.value||'').trim().toLowerCase();
  document.querySelectorAll('.ownerTrip').forEach(card=>{const okStatus=status==='All'||card.dataset.status===status;const okSearch=!q||card.dataset.search.includes(q);card.style.display=okStatus&&okSearch?'':'none'})
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('button,[data-action]');if(!b)return;
  const action=b.dataset.action,id=b.dataset.id;
  if(action==='mobile-menu')return modal('<h2>Menu</h2><div class="mobileMenuList"><a href="how-it-works.html">How it works</a><a href="supported-airlines.html">Airlines</a><a href="trust-center.html">Trust center</a><a href="faq.html">FAQ</a><a href="forward-confirmation.html">Forward confirmation</a><a href="login.html">Log in</a><a href="signup.html">Create account</a><a href="add-trip.html">Start tracking</a></div>');
  if(action==='logout')return logout();
  if(action==='remove')return removeTrip(id);
  if(action==='note')return modal(`<h2>Add note</h2><label>Note<textarea id="noteText" placeholder="Example: I prefer credit if cash refund is not possible."></textarea></label><button class="btn primary" data-action="save-note" data-id="${id}">Save note</button>`);
  if(action==='save-note'){await updateTrip(id,{notes:$('noteText').value.trim()});$('modal').classList.remove('open');return toast('Note saved')}
  if(action==='owner-filter')return applyOwnerFilter(b.dataset.status||'All');
  if(action==='owner-status')return updateTrip(id,{status:b.dataset.status},true);
  if(action==='owner-payment')return updateTrip(id,{payment_status:b.dataset.status},true);
  if(action==='owner-note')return modal(`<h2>Owner note</h2><label>Internal note<textarea id="ownerNoteText" placeholder="Price checked, airline portal notes, next step..."></textarea></label><button class="btn primary" data-action="save-owner-note" data-id="${id}">Save owner note</button>`);
  if(action==='save-owner-note'){await saveOwnerNote(id,$('ownerNoteText').value.trim());$('modal').classList.remove('open');return}
  if(action==='owner-price')return modal(`<h2>Add found price</h2><label>Current lower price<input id="foundPrice" type="number" step="0.01"></label><button class="btn primary" data-action="save-owner-price" data-id="${id}">Save price</button>`);
  if(action==='save-owner-price'){await completeMonitoringCheck(id,$('foundPrice').value);$('modal').classList.remove('open');return}
});
document.addEventListener('input',e=>{if(e.target?.id==='ownerSearch')applyOwnerFilter('All')});

function syncPublicNav(){const publicPages=new Set(['home','info']);const page=document.body.dataset.page;if(!publicPages.has(page))return;const links=document.querySelector('.nav .links');if(!links)return;links.innerHTML='<a class="hide-sm" href="how-it-works.html">How it works</a><a class="hide-sm" href="supported-airlines.html">Airlines</a><a class="hide-sm" href="trust-center.html">Trust</a><a class="hide-sm" href="faq.html">FAQ</a><a class="btn ghost" href="login.html">Log in</a><a class="btn primary" href="add-trip.html">Start tracking</a><button class="btn ghost mobileMenuBtn" data-action="mobile-menu" aria-label="Open menu">Menu</button>'}

window.addEventListener('DOMContentLoaded',async()=>{
  syncPublicNav();
  if(!supabaseClient)return toast('Missing Supabase config');
  if($('modal'))$('modal').addEventListener('click',e=>{if(e.target.id==='modal')$('modal').classList.remove('open')});
  if(document.body.dataset.page==='signup')$('signupForm').addEventListener('submit',signup);
  if(document.body.dataset.page==='login')$('loginForm').addEventListener('submit',login);
  if(document.body.dataset.page==='reset')$('resetForm').addEventListener('submit',resetPassword);
  if(document.body.dataset.page==='forgot-email')$('forgotEmailForm').addEventListener('submit',forgotEmail);
  if(document.body.dataset.page==='update-password')$('updatePasswordForm').addEventListener('submit',updatePassword);
  if(document.body.dataset.page==='dashboard'){const user=await requireLogin('trips.html');if(!user)return;$('welcome').textContent=user.email;$('tripForm').addEventListener('submit',addTrip);await renderTrips()}
  if(document.body.dataset.page==='trip-detail'){await renderTripDetail()}
  if(document.body.dataset.page==='owner'){const user=await requireLogin('owner.html');if(!user)return;$('ownerWelcome').textContent=user.email;await renderOwner()}
  if(document.body.dataset.page==='owner-trip'){await renderOwnerTrip()}
});
