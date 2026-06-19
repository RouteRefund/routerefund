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
const INACTIVITY_LIMIT_MS=1000*60*60*4;
const LOCATOR_RULES={
  default:{min:5,max:13,hint:'Enter the airline record locator/confirmation code from the booking email, usually 5–13 letters or numbers.'},
  'American Airlines':{min:6,max:6,hint:'American record locators are usually 6 letters/numbers.'},
  'Delta Air Lines':{min:6,max:6,hint:'Delta confirmation numbers are usually 6 letters/numbers.'},
  'United Airlines':{min:6,max:6,hint:'United confirmation numbers are usually 6 letters/numbers.'},
  'Southwest Airlines':{min:6,max:6,hint:'Southwest confirmation numbers are usually 6 letters/numbers.'},
  'JetBlue':{min:6,max:6,hint:'JetBlue confirmation codes are usually 6 letters/numbers.'},
  'Alaska Airlines':{min:6,max:6,hint:'Alaska confirmation codes are usually 6 letters/numbers.'},
  'Spirit Airlines':{min:6,max:6,hint:'Spirit confirmation codes are usually 6 letters/numbers.'},
  'Frontier Airlines':{min:6,max:6,hint:'Frontier confirmation codes are usually 6 letters/numbers.'},
  'Hawaiian Airlines':{min:6,max:6,hint:'Hawaiian confirmation codes are usually 6 letters/numbers.'},
  Other:{min:5,max:13,hint:'Use the booking confirmation/record locator exactly as shown. We accept 5–13 letters/numbers for other carriers.'}
};
function locatorRule(airline=''){return LOCATOR_RULES[airline]||LOCATOR_RULES.default}
function validConfirmation(value='',airline=''){const v=normalizeConfirmation(value),r=locatorRule(airline);return /^[A-Z0-9]+$/.test(v)&&v.length>=r.min&&v.length<=r.max}
function updateLocatorHint(){const airline=$('airlineSelect')?.value||'',hint=$('locatorHint'),input=$('confirmationNo'),r=locatorRule(airline);if(hint)hint.textContent=r.hint;if(input){input.minLength=r.min;input.maxLength=r.max;input.pattern=`[A-Za-z0-9]{${r.min},${r.max}}`}}
function touchActivity(){localStorage.setItem('rr_last_activity',String(Date.now()))}
function partnerLoginUrl(next='partner-ops-dashboard.html'){return `partner-ops-login.html?next=${encodeURIComponent(next)}`}
async function enforceInactivity(){const last=Number(localStorage.getItem('rr_last_activity')||Date.now());if(Date.now()-last>INACTIVITY_LIMIT_MS){await supabaseClient.auth.signOut();localStorage.removeItem('rr_last_activity');location.href=location.pathname.includes('partner-ops')?'partner-ops-login.html?reason=inactive':'login.html?reason=inactive';return false}touchActivity();return true}

async function getUser(){if(!supabaseClient)return null;const {data:{session}}=await supabaseClient.auth.getSession();if(!session)return null;const ok=await enforceInactivity();if(!ok)return null;const {data}=await supabaseClient.auth.getUser();return data?.user||null}
async function ensureProfile(user){if(!user)return;const m=user.user_metadata||{};if(m.name||m.date_of_birth||m.terms_accepted_at){await supabaseClient.from('profiles').upsert({user_id:user.id,full_name:m.name||'',date_of_birth:m.date_of_birth||null,terms_accepted_at:m.terms_accepted_at||null,privacy_accepted_at:m.privacy_accepted_at||null,monitoring_authorized_at:m.monitoring_authorized_at||null,fee_disclosure_accepted_at:m.fee_disclosure_accepted_at||null},{onConflict:'user_id'})}}
async function requireLogin(next='trips.html'){const user=await getUser();if(!user){location.href=`login.html?next=${encodeURIComponent(next)}`;return null}await ensureProfile(user);return user}
async function logout(){await supabaseClient.auth.signOut();location.href='index.html'}

async function signup(e){
  e.preventDefault();
  const name=$('name').value.trim(),date_of_birth=$('signupDob').value,email=$('email').value.trim().toLowerCase(),password=$('password').value,password2=$('password2').value;
  if(!name||!date_of_birth||!email||!password)return toast('Fill out all fields');
  if(password.length<8)return toast('Use at least 8 characters');
  if(password!==password2)return toast('Passwords do not match');
  if(!$('acceptTerms').checked||!$('acceptPrivacy').checked||!$('authorizeMonitoring').checked||!$('acceptFee').checked)return toast('Please review and accept the RouteRefund account packet.');
  const acceptedAt=new Date().toISOString();
  const submit=e.submitter||$('signupSubmit');
  if(submit){submit.disabled=true;submit.textContent='Creating account...'}
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{name,date_of_birth,terms_accepted_at:acceptedAt,privacy_accepted_at:acceptedAt,monitoring_authorized_at:acceptedAt,fee_disclosure_accepted_at:acceptedAt},emailRedirectTo:`${location.origin}/trips.html`}});
  if(submit){submit.disabled=false;submit.textContent='Create account'}
  if(error)return toast(error.message);
  if(data?.user)await ensureProfile(data.user);
  if(data?.session){toast('Account created');location.href='trips.html'}
  else{location.href=`check-email.html?email=${encodeURIComponent(email)}`}
}
const PARTNER_ADMIN_USERS={andrew_admin:'andrew.ops@routerefund.com',caleb_admin:'caleb.ops@routerefund.com',max_admin:'max.ops@routerefund.com'};
const PARTNER_EMAIL_ALLOWLIST=new Set(Object.values(PARTNER_ADMIN_USERS));
function isPartnerLoginPage(){return document.body.dataset.page==='partner-login'||!!$('ownerMode')||location.pathname.includes('partner-ops-login')}
function partnerEmailForLogin(value=''){return PARTNER_ADMIN_USERS[String(value).trim().toLowerCase()]||''}
async function partnerAal2(){const {data}=await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();return data?.currentLevel==='aal2'}
function partnerMfaCard(title,body){const form=$('loginForm');if(form)form.innerHTML=`<h2>${title}</h2>${body}<p class="mini center muted">Use Google Authenticator, 1Password, iCloud Passwords, Authy, or another authenticator app.</p>`}
async function showPartnerMfaChallenge(next='partner-ops-dashboard.html'){
  const {data,error}=await supabaseClient.auth.mfa.listFactors();if(error)return toast(error.message);
  const factor=(data?.totp||[]).find(f=>f.status==='verified')||(data?.all||[]).find(f=>f.factor_type==='totp'&&f.status==='verified');
  if(!factor)return showPartnerMfaSetup(next);
  partnerMfaCard('Enter 2FA code',`<label>Authenticator code<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button id="mfaVerifyBtn" class="btn primary full" type="button">Verify and open ops</button>`);
  $('mfaVerifyBtn').addEventListener('click',async()=>{const code=$('mfaCode').value.trim();if(!code)return toast('Enter your 6-digit code');const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:factor.id});if(challengeError)return toast(challengeError.message);const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)return toast(verifyError.message);touchActivity();location.href=next});
}
async function showPartnerMfaSetup(next='partner-ops-dashboard.html'){
  const {data,error}=await supabaseClient.auth.mfa.enroll({factorType:'totp',friendlyName:'RouteRefund partner'});if(error)return toast(error.message);
  const qr=data?.totp?.qr_code||'',secret=data?.totp?.secret||'';
  partnerMfaCard('Set up 2FA',`<p>Scan this in your authenticator app, then enter the 6-digit code.</p>${qr?`<div class="qrBox"><img alt="2FA QR code" src="${escapeHtml(qr)}"></div>`:''}${secret?`<p class="mini"><b>Manual key:</b> <code>${escapeHtml(secret)}</code></p>`:''}<label>Authenticator code<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button id="mfaVerifyBtn" class="btn primary full" type="button">Enable 2FA and open ops</button>`);
  $('mfaVerifyBtn').addEventListener('click',async()=>{const code=$('mfaCode').value.trim();if(!code)return toast('Enter your 6-digit code');const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:data.id});if(challengeError)return toast(challengeError.message);const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:data.id,challengeId:challenge.id,code});if(verifyError)return toast(verifyError.message);touchActivity();location.href=next});
}
async function requirePartnerMfa(next='partner-ops-dashboard.html'){if(await partnerAal2()){location.href=next;return}await showPartnerMfaChallenge(next)}
async function login(e){e.preventDefault();const loginId=$('email').value.trim().toLowerCase(),password=$('password').value,partnerLogin=isPartnerLoginPage();const email=partnerLogin?partnerEmailForLogin(loginId):loginId;if(partnerLogin&&!email)return toast('Use your assigned admin username, not an email address.');const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)return toast(error.message);touchActivity();if(partnerLogin){const signedInEmail=(data?.user?.email||email).trim().toLowerCase();if(!PARTNER_EMAIL_ALLOWLIST.has(signedInEmail)){await supabaseClient.auth.signOut();return toast('Partner access denied for this account.')}return requirePartnerMfa(new URLSearchParams(location.search).get('next')||'partner-ops-dashboard.html')}if(data?.user)await ensureProfile(data.user);const next=new URLSearchParams(location.search).get('next')||'trips.html';location.href=next}
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
  if(!airline)return toast('Select the airline first.');
  if(!validConfirmation(confirmation,airline)){const r=locatorRule(airline);return toast(`For ${airline}, enter ${r.min===r.max?r.min:`${r.min}-${r.max}`} letters/numbers from the booking email.`)}
  if(!travelDate)return toast('Enter the departure date so monitoring can run.');
  const rawNotes=$('notes').value.trim();
  const notes=[rawNotes].filter(Boolean).join('\n');
  const trip={user_id:user.id,passenger_first:$('passengerFirst').value.trim(),passenger_last:$('passengerLast').value.trim(),date_of_birth:$('dateOfBirth').value,confirmation_no:confirmation,airline,route:route||null,travel_date:travelDate,paid:Number($('paid').value),notes,change_consent:true,status:'Monitoring'};
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
    return `<div class="trip"><div class="row"><div><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')} • Paid ${money(r.paid)}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</p></div><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></div><div class="miniTimeline"><span class="done">Received</span><span class="${['Monitoring','Savings found','Review needed','Closed','Archived'].includes(r.status)?'done':''}">Watching</span><span class="${['Savings found','Review needed','Closed','Archived'].includes(r.status)?'done':''}">Savings</span><span class="${['Closed','Archived'].includes(r.status)?'done':''}">Closed</span></div>${['Savings found','Review needed'].includes(r.status)?'<p>RouteRefund is reviewing an update on this trip and will contact you if action is needed.</p>':'<p>RouteRefund is watching this trip. We will handle review internally and contact you if action is needed.</p>'}${r.notes?`<p><b>Your note:</b> ${safeLines(r.notes)}</p>`:''}<div class="actions"><a class="btn primary" href="trip-detail.html?id=${encodeURIComponent(r.id)}">View trip</a><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><button class="btn danger" data-action="remove" data-id="${r.id}">Remove</button></div></div>`
  }).join(''):`<div class="empty"><h3>No trips yet</h3><p>Forward your confirmation email or add your first booked flight above.</p></div>`
}


async function renderAccount(){
  const panel=$('accountPanel');if(!panel)return;
  const user=await requireLogin('account.html');if(!user)return;
  if($('accountWelcome'))$('accountWelcome').textContent=user.email;
  const {data:profile}=await supabaseClient.from('profiles').select('*').eq('user_id',user.id).maybeSingle();
  panel.innerHTML=`<h2>Signed in</h2><p><b>Email:</b> ${escapeHtml(user.email||'')}</p><p><b>Name:</b> ${escapeHtml(profile?.full_name||user.user_metadata?.name||'Not set')}</p><p><b>Date of birth:</b> ${escapeHtml(profile?.date_of_birth||user.user_metadata?.date_of_birth||'Not set')}</p><p class="muted">For security, RouteRefund keeps you logged in on this device unless you log out or are inactive for about 4 hours.</p><div class="actions"><a class="btn primary" href="trips.html">Back to My trips</a><button class="btn ghost" data-action="logout">Log out</button></div>`
}

async function renderTripDetail(){
  const box=$('tripDetail');if(!box)return;
  const user=await requireLogin(`trip-detail.html${location.search}`);if(!user)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){box.innerHTML='<div class="empty"><h3>No trip selected</h3><p>Go back to My trips and choose a trip.</p><a class="btn primary" href="trips.html">My trips</a></div>';return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Trip not found</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="trips.html">Back to My trips</a></div>`;return}
  const statuses=['Received','Under review','Watching fare','Savings found','Refund/credit captured'];const active=['Savings found','Review needed'].includes(r.status)?3:['Closed','Archived'].includes(r.status)?4:2;
  box.innerHTML=`<div class="panel tripDetailCard"><div class="row"><div><h2>Confirmation ${escapeHtml(r.confirmation_no||'')}</h2><p>${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')} • Paid ${money(r.paid)}</p></div><span class="tag">${escapeHtml(r.status||'Monitoring')}</span></div><div class="detailTimeline">${statuses.map((x,i)=>`<div class="${i<=active?'done':''}"><b>${i+1}</b><span>${x}</span></div>`).join('')}</div>${['Savings found','Review needed'].includes(r.status)?'<div class="savingsBox"><h3>RouteRefund review in progress</h3><p>Our team is reviewing an update for this booking. We will contact you if action is needed.</p></div>':''}${r.notes?`<p><b>Notes:</b><br>${safeLines(r.notes)}</p>`:''}<div class="actions"><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><a class="btn primary" href="trips.html">Back to dashboard</a></div></div>`
}

function modal(html){if(!$('modal'))return;$('modalCard').innerHTML=html;$('modal').classList.add('open')}
async function updateTrip(id,patch,owner=false){const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);if(error)return toast(error.message);if(owner){await renderOwner();await renderOwnerTrip()}else await renderTrips()}
async function removeTrip(id){const {error}=await supabaseClient.from('trips').delete().eq('id',id);if(error)return toast(error.message);toast('Removed');await renderTrips()}
async function completeMonitoringCheck(id,observedPrice,kind='No savings',note=''){
  const now=new Date();
  const next=new Date(now.getTime()+6*60*60*1000);
  const price=observedPrice===''||observedPrice==null?null:Number(observedPrice);
  const {data:trip}=await supabaseClient.from('trips').select('paid').eq('id',id).single();
  const savingsFound=kind==='Review needed'||(price&&trip?.paid&&price<Number(trip.paid));
  await supabaseClient.from('monitoring_checks').update({checked_at:now.toISOString(),observed_price:price,result:savingsFound?'Savings found':'No savings',notes:note||'Partner completed fare check'}).eq('trip_id',id).eq('result','Due');
  const patch={last_checked_at:now.toISOString(),next_check_at:next.toISOString(),status:savingsFound?'Review needed':'Monitoring'};
  if(!savingsFound)await supabaseClient.from('monitoring_checks').insert({trip_id:id,check_due_at:next.toISOString(),source:'Scheduled follow-up',result:'Due',notes:'Next monitoring reminder'});
  if(price)patch.current_price=price;
  const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);
  if(error)return toast(error.message);
  await renderOwner();await renderOwnerTrip();toast(savingsFound?'Moved to review needed':'No savings recorded; next check scheduled')
}
function ownerStatusLabel(status){return ({'Monitoring':'Watching','Savings found':'Review needed','Review needed':'Review needed','Closed':'Archived','Archived':'Archived'}[status]||status||'Watching')}
function ownerStatusClass(status,due){if(due)return 'due';const x=ownerStatusLabel(status).toLowerCase().replace(/\s+/g,'-');return x}
function ownerNextStep(r){const label=ownerStatusLabel(r.status);if(r.due_checks?.length)return 'Complete fare check and document result';if(label==='Review needed')return 'Verify eligibility, then customer follow-up';if(label==='Archived')return 'Resolved — retained for reference';return 'Monitor until the next scheduled check'}
function ownerPriority(r){if(r.due_checks?.length)return 0;const label=ownerStatusLabel(r.status);if(label==='Review needed')return 1;if(label==='Watching')return 2;return 3}
function ownerControls(){return `<div class="ownerToolbar" aria-label="Operations filters"><div class="ownerFilters"><button class="btn ghost" data-action="owner-filter" data-status="All">Active queue</button><button class="btn ghost" data-action="owner-filter" data-status="Due">Due checks</button><button class="btn ghost" data-action="owner-filter" data-status="Review needed">Review</button><button class="btn ghost" data-action="owner-filter" data-status="Watching">Monitoring</button><button class="btn ghost" data-action="owner-filter" data-status="Archived">Archive</button></div><input id="ownerSearch" placeholder="Search passenger, confirmation, airline, route, note" aria-label="Search operations queue"></div>`}
async function ownerNotesByTrip(){const {data,error}=await supabaseClient.from('owner_trip_notes').select('trip_id,owner_notes');if(error)return {};return Object.fromEntries((data||[]).map(n=>[n.trip_id,n.owner_notes||'']))}
async function saveOwnerNote(id,note){const {error}=await supabaseClient.from('owner_trip_notes').upsert({trip_id:id,owner_notes:note,updated_at:new Date().toISOString()},{onConflict:'trip_id'});if(error)return toast(error.message);await renderOwner();await renderOwnerTrip();toast('Owner note saved')}
async function dueChecksByTrip(){const {data,error}=await supabaseClient.from('monitoring_checks').select('trip_id,check_due_at,result,observed_price,notes').eq('result','Due').order('check_due_at',{ascending:true});if(error)return {};return (data||[]).reduce((acc,c)=>{(acc[c.trip_id] ||= []).push(c);return acc},{})}
async function requireOwner(next='partner-ops-dashboard.html'){
  const user=await getUser();if(!user){location.href=partnerLoginUrl(next);return null;}
  const email=(user.email||'').trim().toLowerCase();
  if(!PARTNER_EMAIL_ALLOWLIST.has(email)){await supabaseClient.auth.signOut();location.href='partner-ops-login.html';return null;}
  if(!(await partnerAal2())){location.href=`partner-ops-login.html?next=${encodeURIComponent(next)}&mfa=required`;return null;}
  const {data,error}=await supabaseClient.rpc('current_user_is_owner');
  if(error||data!==true){
    await supabaseClient.auth.signOut();
    document.body.innerHTML='<main class="wrap pageMain"><section class="panel"><h1>Partner access only</h1><p>This private operations portal is restricted to approved RouteRefund partner accounts with 2FA.</p><a class="btn primary" href="partner-ops-login.html">Log in</a><a class="btn ghost" href="trips.html">Customer dashboard</a></section></main>';
    return null;
  }
  return user;
}
function ownerTripCard(r){
  const savings=Math.max(tripSavings(r),0);
  const due=r.due_checks?.length||0;
  const next=r.next_check_at?new Date(r.next_check_at).toLocaleString():'Not scheduled';
  const statusLabel=ownerStatusLabel(r.status);
  const statusClass=ownerStatusClass(r.status,due);
  return `<article class="opsTripCard ownerTrip ${statusClass}" data-status="${escapeHtml(statusLabel)}" data-due="${due?'true':'false'}" data-priority="${ownerPriority(r)}" data-search="${escapeHtml([r.confirmation_no,r.passenger_first,r.passenger_last,r.notes,r.owner_notes,r.airline,r.route,statusLabel].join(' ').toLowerCase())}"><div class="opsTripTop"><div><span class="opsPill ${statusClass}">${due?'Due check':escapeHtml(statusLabel)}</span><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><a class="btn primary" href="partner-ops-trip.html?id=${encodeURIComponent(r.id)}">Open workspace</a></div><div class="opsTripMeta"><div><b>Passenger</b><span>${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not logged'}</span></div><div><b>Operational next step</b><span>${escapeHtml(ownerNextStep(r))}</span></div></div>${savings>0?`<div class="reviewBanner"><b>${money(savings)} potential savings</b><span>Confirm eligibility and document evidence before customer follow-up.</span></div>`:''}${r.owner_notes?`<p class="opsNote"><b>Internal:</b> ${safeLines(r.owner_notes)}</p>`:''}<div class="opsActions"><button class="btn ghost" data-action="owner-no-savings" data-id="${r.id}">Record check</button><button class="btn ghost" data-action="owner-review" data-id="${r.id}">Send to review</button><button class="btn ghost" data-action="owner-note" data-id="${r.id}">Internal note</button><button class="btn ghost" data-action="owner-status" data-id="${r.id}" data-status="Archived">Archive resolved</button></div></article>`
}
async function renderOwner(){
  const box=$('ownerTrips');if(!box)return;
  const {data:rows,error}=await supabaseClient.from('trips').select('*').order('created_at',{ascending:false});
  if(error){box.innerHTML=`<div class="panel"><h2>Access blocked</h2><p>${escapeHtml(error.message)}</p><p>Run the Supabase security SQL and add your owner email before using this dashboard.</p></div>`;return}
  const privateNotes=await ownerNotesByTrip();
  const dueChecks=await dueChecksByTrip();
  (rows||[]).forEach(r=>{r.owner_notes=privateNotes[r.id]||'';r.due_checks=dueChecks[r.id]||[]});
  const activeRows=(rows||[]).filter(r=>ownerStatusLabel(r.status)!=='Archived'),total=activeRows.length,monitoring=activeRows.filter(r=>ownerStatusLabel(r.status)==='Watching').length,found=activeRows.filter(r=>ownerStatusLabel(r.status)==='Review needed').length,dueTotal=activeRows.reduce((sum,r)=>sum+(r.due_checks?.length||0),0),openSavings=activeRows.reduce((sum,r)=>sum+Math.max(tripSavings(r),0),0);
  const sortedRows=[...(rows||[])].sort((a,b)=>ownerPriority(a)-ownerPriority(b)||String(a.travel_date||'').localeCompare(String(b.travel_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  if($('kpis'))$('kpis').innerHTML=`<div class="hot"><b>${dueTotal}</b><span>Due checks</span></div><div><b>${found}</b><span>Review queue</span></div><div><b>${monitoring}</b><span>Monitoring</span></div><div><b>${total}</b><span>Active trips</span></div><div><b>${money(openSavings)}</b><span>Potential savings</span></div>`;
  const queueIntro=`<div class="opsQueueIntro"><div><h2>Operations queue</h2><p>Prioritized by due checks, verified review opportunities, active monitoring, then archive.</p></div><span>${dueTotal?`${dueTotal} check${dueTotal===1?'':'s'} due`:'No checks due'}</span></div>`;
  box.innerHTML=ownerControls()+queueIntro+(sortedRows.length?sortedRows.map(ownerTripCard).join(''):`<div class="empty"><h3>No customer trips yet</h3><p>New customer bookings will appear here when monitoring starts.</p></div>`);
  applyOwnerFilter('All')
}
async function renderOwnerTrip(){
  const box=$('ownerTripDetail');if(!box)return;
  const user=await requireOwner(`partner-ops-trip.html${location.search}`);if(!user)return;if($('ownerWelcome'))$('ownerWelcome').textContent=user.email;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){box.innerHTML='<div class="empty"><h3>No trip selected</h3><a class="btn primary" href="partner-ops-dashboard.html">Ops dashboard</a></div>';return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Access blocked or trip missing</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="partner-ops-dashboard.html">Ops dashboard</a></div>`;return}
  const privateNotes=await ownerNotesByTrip();
  const dueChecks=await dueChecksByTrip();
  r.owner_notes=privateNotes[r.id]||'';r.due_checks=dueChecks[r.id]||[];
  const savings=Math.max(tripSavings(r),0),statusLabel=ownerStatusLabel(r.status),due=r.due_checks.length;
  const next=r.next_check_at?new Date(r.next_check_at).toLocaleString():'Not scheduled';
  box.innerHTML=`<section class="opsWorkspaceHero"><div><a class="mini" href="partner-ops-dashboard.html">← Back to ops dashboard</a><span class="opsPill ${ownerStatusClass(r.status,due)}">${due?'Due check':escapeHtml(statusLabel)}</span><h1>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h1><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><div class="opsHeroActions"><button class="btn primary" data-action="owner-no-savings" data-id="${r.id}">Record fare check</button><button class="btn ghost" data-action="owner-review" data-id="${r.id}">Send to review</button></div></section>${due?`<div class="notice dueNotice"><b>${due} check due.</b> Compare the same airline, route, date and cabin. Do not contact customer until a lower eligible fare is verified and documented.</div>`:''}<section class="opsWorkspaceGrid"><div class="opsMainPanel"><h2>Trip details</h2><div class="opsDetailGrid"><div><b>Passenger</b><span>${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</span></div><div><b>Date of birth</b><span>${escapeHtml(r.date_of_birth||'')}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not recorded'}</span></div><div><b>Potential savings</b><span>${savings>0?money(savings):'None yet'}</span></div><div><b>Next scheduled check</b><span>${escapeHtml(next)}</span></div><div><b>Fee status</b><span>${escapeHtml(r.payment_status||'Not billed')}</span></div><div><b>Ops status</b><span>${escapeHtml(statusLabel)}</span></div></div><div class="opsTimeline"><div class="done"><b>1</b><span>Booking received</span></div><div class="${statusLabel!=='Archived'?'done':''}"><b>2</b><span>Monitoring fare</span></div><div class="${statusLabel==='Review needed'?'done':''}"><b>3</b><span>Evidence review</span></div><div class="${r.payment_status==='Paid'?'done':''}"><b>4</b><span>Customer follow-up / resolved</span></div></div></div><aside class="opsSidePanel"><h3>Recommended next action</h3><p>${escapeHtml(ownerNextStep(r))}</p><div class="opsStack"><button class="btn ghost" data-action="owner-no-savings" data-id="${r.id}">Record no lower fare + schedule next</button><button class="btn primary" data-action="owner-review" data-id="${r.id}">Document lower fare for review</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Invoice sent">Record invoice sent</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Paid">Record fee captured</button><button class="btn ghost" data-action="owner-status" data-id="${r.id}" data-status="Archived">Archive resolved trip</button></div></aside></section><section class="panel opsNotesPanel"><h2>Notes</h2><div class="grid two"><div>${r.notes?`<p><b>Customer note</b><br>${safeLines(r.notes)}</p>`:'<p class="muted">No customer note.</p>'}</div><div>${r.owner_notes?`<p><b>Internal note</b><br>${safeLines(r.owner_notes)}</p>`:'<p class="muted">No internal note yet.</p>'}</div></div><div class="actions"><button class="btn primary" data-action="owner-note" data-id="${r.id}">Update internal note</button></div></section>`
}
function applyOwnerFilter(status='All'){
  const q=($('ownerSearch')?.value||'').trim().toLowerCase();
  document.querySelectorAll('.ownerTrip').forEach(card=>{const active=card.dataset.status!=='Archived';const okStatus=status==='All'?(active):(status==='Due'?card.dataset.due==='true':card.dataset.status===status);const okSearch=!q||card.dataset.search.includes(q);card.style.display=okStatus&&okSearch?'':'none'})
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
  if(action==='owner-note')return modal(`<h2>Internal note</h2><label>What happened / next step<textarea id="ownerNoteText" placeholder="Checked AA mobile app. Same cabin. Need customer approval before action."></textarea></label><button class="btn primary" data-action="save-owner-note" data-id="${id}">Save note</button>`);
  if(action==='save-owner-note'){await saveOwnerNote(id,$('ownerNoteText').value.trim());$('modal').classList.remove('open');return}
  if(action==='owner-review')return modal(`<h2>Review opportunity</h2><p>Use this only when a lower eligible fare looks real. It moves the trip to the review queue; it does not change the booking or bill the customer.</p><label>Observed lower fare<input id="foundPrice" type="number" min="0" step="0.01" placeholder="299.00"></label><label>Evidence / next step<textarea id="priceNote" placeholder="Source, same route/date/cabin, screenshot saved, customer action needed..."></textarea></label><button class="btn primary" data-action="save-owner-review" data-id="${id}">Move to review</button>`);
  if(action==='owner-no-savings')return modal(`<h2>Record fare check</h2><p>If nothing actionable was found, this schedules the next monitoring check automatically.</p><label>Observed current fare <span class="optional">optional</span><input id="noSavingsPrice" type="number" min="0" step="0.01" placeholder="Leave blank if not recorded"></label><label>Check note<textarea id="noSavingsNote" placeholder="Checked same airline/route/date/cabin. No lower eligible fare found."></textarea></label><button class="btn primary" data-action="save-no-savings" data-id="${id}">Save check + schedule next</button>`);
  if(action==='save-owner-review'){if(!$('foundPrice').value)return toast('Enter the lower price found.');await completeMonitoringCheck(id,$('foundPrice').value,'Review needed',$('priceNote').value.trim());$('modal').classList.remove('open');return}
  if(action==='save-no-savings'){await completeMonitoringCheck(id,$('noSavingsPrice').value,'No savings',$('noSavingsNote').value.trim());$('modal').classList.remove('open');return}
});
document.addEventListener('input',e=>{if(e.target?.id==='ownerSearch')applyOwnerFilter('All')});

function syncPublicNav(){const publicPages=new Set(['home','info']);const page=document.body.dataset.page;if(!publicPages.has(page))return;const links=document.querySelector('.nav .links');if(!links)return;links.innerHTML='<a class="hide-sm" href="how-it-works.html">How it works</a><a class="hide-sm" href="supported-airlines.html">Airlines</a><a class="hide-sm" href="trust-center.html">Trust</a><a class="hide-sm" href="faq.html">FAQ</a><a class="btn ghost" href="login.html">Log in</a><a class="btn primary" href="add-trip.html">Start tracking</a><button class="btn ghost mobileMenuBtn" data-action="mobile-menu" aria-label="Open menu">Menu</button>'}

window.addEventListener('DOMContentLoaded',async()=>{
  syncPublicNav();
  if(!supabaseClient)return toast('Missing Supabase config');
  ['click','keydown','touchstart','scroll'].forEach(ev=>document.addEventListener(ev,touchActivity,{passive:true}));
  if($('modal'))$('modal').addEventListener('click',e=>{if(e.target.id==='modal')$('modal').classList.remove('open')});
  if(document.body.dataset.page==='signup')$('signupForm').addEventListener('submit',signup);
  if(document.body.dataset.page==='login'||document.body.dataset.page==='partner-login')$('loginForm').addEventListener('submit',login);
  if(document.body.dataset.page==='partner-login'){const user=await getUser();if(user&&PARTNER_EMAIL_ALLOWLIST.has((user.email||'').toLowerCase()))await requirePartnerMfa(new URLSearchParams(location.search).get('next')||'partner-ops-dashboard.html')}
  if(document.body.dataset.page==='reset')$('resetForm').addEventListener('submit',resetPassword);
  if(document.body.dataset.page==='forgot-email')$('forgotEmailForm').addEventListener('submit',forgotEmail);
  if(document.body.dataset.page==='update-password')$('updatePasswordForm').addEventListener('submit',updatePassword);
  if(document.body.dataset.page==='dashboard'){const user=await requireLogin('trips.html');if(!user)return;$('welcome').textContent=user.email;$('tripForm').addEventListener('submit',addTrip);$('airlineSelect')?.addEventListener('change',updateLocatorHint);updateLocatorHint();await renderTrips()}
  if(document.body.dataset.page==='account'){await renderAccount()}
  if(document.body.dataset.page==='trip-detail'){await renderTripDetail()}
  if(document.body.dataset.page==='owner'){const user=await requireOwner('partner-ops-dashboard.html');if(!user)return;$('ownerWelcome').textContent=user.email;await renderOwner()}
  if(document.body.dataset.page==='owner-trip'){await renderOwnerTrip()}
});
