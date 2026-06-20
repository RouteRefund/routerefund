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
function ownerNoteButton(id,note='',label='Internal note'){
  const text=escapeHtml(note).replace(/\n/g,'&#10;');
  return `<button class="btn ghost" data-action="owner-note" data-id="${escapeHtml(id)}" data-note="${text}">${escapeHtml(label)}</button>`
}
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
function safeNext(value='',fallback='trips.html',partner=false){const raw=String(value||'').trim();if(!raw)return fallback;if(/^[a-z][a-z0-9+.-]*:/i.test(raw)||raw.startsWith('//')||raw.includes('\\'))return fallback;try{const url=new URL(raw,location.origin);if(url.origin!==location.origin)return fallback;const page=(url.pathname.split('/').filter(Boolean).pop()||'index.html');if(partner&&!page.startsWith('partner-ops-'))return fallback;if(!partner&&page.startsWith('partner-ops-'))return fallback;return `${page}${url.search}${url.hash}`}catch{return fallback}}
function partnerLoginUrl(next='partner-ops-dashboard.html'){return `partner-ops-login.html?next=${encodeURIComponent(safeNext(next,'partner-ops-dashboard.html',true))}`}
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
  next=safeNext(next,'partner-ops-dashboard.html',true);
  const {data,error}=await supabaseClient.auth.mfa.listFactors();if(error)return toast(error.message);
  const factor=(data?.totp||[]).find(f=>f.status==='verified')||(data?.all||[]).find(f=>f.factor_type==='totp'&&f.status==='verified');
  if(!factor)return showPartnerMfaSetup(next);
  partnerMfaCard('Enter 2FA code',`<label>Authenticator code<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button id="mfaVerifyBtn" class="btn primary full" type="button">Verify and open ops</button>`);
  $('mfaVerifyBtn').addEventListener('click',async()=>{const code=$('mfaCode').value.trim();if(!code)return toast('Enter your 6-digit code');const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:factor.id});if(challengeError)return toast(challengeError.message);const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)return toast(verifyError.message);touchActivity();location.href=next});
}
async function showPartnerMfaSetup(next='partner-ops-dashboard.html'){
  next=safeNext(next,'partner-ops-dashboard.html',true);
  const {data,error}=await supabaseClient.auth.mfa.enroll({factorType:'totp',friendlyName:'RouteRefund partner'});if(error)return toast(error.message);
  const qr=data?.totp?.qr_code||'',secret=data?.totp?.secret||'';
  partnerMfaCard('Set up 2FA',`<p>Scan this in your authenticator app, then enter the 6-digit code.</p>${qr?`<div class="qrBox"><img alt="2FA QR code" src="${escapeHtml(qr)}"></div>`:''}${secret?`<p class="mini"><b>Manual key:</b> <code>${escapeHtml(secret)}</code></p>`:''}<label>Authenticator code<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button id="mfaVerifyBtn" class="btn primary full" type="button">Enable 2FA and open ops</button>`);
  $('mfaVerifyBtn').addEventListener('click',async()=>{const code=$('mfaCode').value.trim();if(!code)return toast('Enter your 6-digit code');const {data:challenge,error:challengeError}=await supabaseClient.auth.mfa.challenge({factorId:data.id});if(challengeError)return toast(challengeError.message);const {error:verifyError}=await supabaseClient.auth.mfa.verify({factorId:data.id,challengeId:challenge.id,code});if(verifyError)return toast(verifyError.message);touchActivity();location.href=next});
}
async function requirePartnerMfa(next='partner-ops-dashboard.html'){next=safeNext(next,'partner-ops-dashboard.html',true);if(await partnerAal2()){location.href=next;return}await showPartnerMfaChallenge(next)}
async function login(e){e.preventDefault();const loginId=$('email').value.trim().toLowerCase(),password=$('password').value,partnerLogin=isPartnerLoginPage();const email=partnerLogin?partnerEmailForLogin(loginId):loginId;if(partnerLogin&&!email)return toast('Use your assigned admin username, not an email address.');const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)return toast(error.message);touchActivity();if(partnerLogin){const signedInEmail=(data?.user?.email||email).trim().toLowerCase();if(!PARTNER_EMAIL_ALLOWLIST.has(signedInEmail)){await supabaseClient.auth.signOut();return toast('Partner access denied for this account.')}return requirePartnerMfa(safeNext(new URLSearchParams(location.search).get('next'),'partner-ops-dashboard.html',true))}if(data?.user)await ensureProfile(data.user);const next=safeNext(new URLSearchParams(location.search).get('next'),'trips.html',false);location.href=next}
async function forgotEmail(e){e.preventDefault();const payload={full_name:$('recoveryName').value.trim(),date_of_birth:$('recoveryDob').value,status:'New'};if(!payload.full_name||!payload.date_of_birth)return toast('Fill out all required fields');const {error}=await supabaseClient.from('account_recovery_requests').insert(payload);if(error)return toast('Recovery request could not be saved. Run the latest Supabase SQL.');e.target.reset();toast('If we find a match, recovery instructions will be sent to the account email.')}
async function resetPassword(e){e.preventDefault();const email=$('email').value.trim().toLowerCase();const redirectTo=`${location.origin}/update-password.html`;const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error)return toast(error.message);toast('Reset email sent')}
async function updatePassword(e){e.preventDefault();const password=$('password').value,password2=$('password2').value;if(password.length<8)return toast('Use at least 8 characters');if(password!==password2)return toast('Passwords do not match');const {error}=await supabaseClient.auth.updateUser({password});if(error)return toast(error.message);toast('Password updated');setTimeout(()=>location.href='trips.html',600)}

async function addTrip(e){
  e.preventDefault();
  const submit=e.submitter||e.target.querySelector('button[type="submit"]');
  if(submit?.disabled)return;
  const originalLabel=submit?.textContent||'';
  const lock=label=>{if(submit){submit.disabled=true;submit.textContent=label}};
  const unlock=()=>{if(submit){submit.disabled=false;submit.textContent=originalLabel||'Start tracking this flight'}};
  const fail=message=>{unlock();toast(message);return false};
  lock('Checking trip...');
  const user=await requireLogin('trips.html');if(!user){unlock();return}
  if(!$('changeConsent').checked)return fail('Please accept trip authorization to continue');
  const airline=$('airlineSelect')?.value?.trim()||'';
  const confirmation=normalizeConfirmation($('confirmationNo').value);
  const route=$('route')?.value?.trim().toUpperCase()||'';
  const travelDate=$('travelDate')?.value||'';
  if(!airline)return fail('Select the airline first.');
  if(!validConfirmation(confirmation,airline)){const r=locatorRule(airline);return fail(`For ${airline}, enter ${r.min===r.max?r.min:`${r.min}-${r.max}`} letters/numbers from the booking email.`)}
  if(!travelDate)return fail('Enter the departure date so monitoring can run.');
  const rawNotes=$('notes').value.trim();
  const notes=[rawNotes].filter(Boolean).join('\n');
  const trip={user_id:user.id,passenger_first:$('passengerFirst').value.trim(),passenger_last:$('passengerLast').value.trim(),date_of_birth:$('dateOfBirth').value,confirmation_no:confirmation,airline,route:route||null,travel_date:travelDate,paid:Number($('paid').value),notes,change_consent:true,status:'Monitoring'};
  lock('Saving trip...');
  const {error}=await supabaseClient.from('trips').insert(trip);
  if(error)return fail(error.message);
  e.target.reset();updateLocatorHint();toast('Flight saved; monitoring request received.');await renderTrips();unlock()
}
async function loadTrips(){const {data,error}=await supabaseClient.from('trips').select('*').or('status.is.null,status.neq.Archived').order('created_at',{ascending:false});if(error){toast(error.message);return[]}return data||[]}
function tripSavings(r){return r.current_price?Number(r.paid)-Number(r.current_price):0}
function customerTripStatus(r){
  const status=r.status||'Monitoring';
  if(['Savings found','Review needed'].includes(status))return {label:'Opportunity review',step:'Internal review',body:'RouteRefund is reviewing a possible fare-change signal for eligibility, comparability, and customer safety before sharing any details or next steps.',tone:'review'};
  if(['Closed'].includes(status))return {label:'Resolved',step:'Resolved',body:'This trip has been closed. Keep the record here for your reference or contact support if something looks off.',tone:'closed'};
  return {label:'Monitoring active',step:'Monitoring active',body:'We are watching for eligible changes and will only contact you if there is a customer-approved next step.',tone:'monitoring'};
}
function customerTripMeta(r){
  return `<div class="customerTripMeta" aria-label="Trip summary"><div><b>Route</b><span>${escapeHtml(r.route||'Pending')}</span></div><div><b>Departure</b><span>${escapeHtml(r.travel_date||'Pending')}</span></div><div><b>Price paid</b><span>${money(r.paid)}</span></div></div>`
}

async function renderTrips(){
  const box=$('trips');if(!box)return;
  const rows=await loadTrips();
  box.innerHTML=rows.length?rows.map(r=>{
    const status=customerTripStatus(r);
    return `<div class="trip customerTripCard"><div class="row"><div><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</p></div><span class="tag ${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span></div>${customerTripMeta(r)}<div class="miniTimeline"><span class="done">Received</span><span class="${['Monitoring','Savings found','Review needed','Closed','Archived'].includes(r.status)?'done':''}">Watching</span><span class="${['Savings found','Review needed','Closed','Archived'].includes(r.status)?'done':''}">Review</span><span class="${['Closed','Archived'].includes(r.status)?'done':''}">Closed</span></div><div class="customerNextStep"><b>${escapeHtml(status.step)}</b><span>${escapeHtml(status.body)}</span></div>${r.notes?`<p><b>Your note:</b> ${safeLines(r.notes)}</p>`:''}<div class="actions"><a class="btn primary" href="trip-detail.html?id=${encodeURIComponent(r.id)}">View trip</a><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><button class="btn danger" data-action="remove" data-id="${r.id}">Stop monitoring</button></div></div>`
  }).join(''):`<div class="empty"><h3>No trips yet</h3><p>Forward your confirmation email or add your first booked flight above. We will never ask for airline passwords or payment card numbers in the trip form.</p></div>`
}


async function renderAccount(){
  const panel=$('accountPanel');if(!panel)return;
  const user=await requireLogin('account.html');if(!user)return;
  if($('accountWelcome'))$('accountWelcome').textContent=user.email;
  const {data:profile}=await supabaseClient.from('profiles').select('*').eq('user_id',user.id).maybeSingle();
  const accepted=value=>value?`Accepted ${new Date(value).toLocaleDateString()}`:'Not recorded';
  panel.innerHTML=`<div class="accountHeader"><div><span class="eyebrow">Private customer account</span><h2>Signed in securely</h2><p class="muted">This page shows the identity and authorization details RouteRefund uses to match your booked trips.</p></div><span class="tag">Customer only</span></div><div class="accountTrustGrid"><div><b>Email</b><span>${escapeHtml(user.email||'')}</span></div><div><b>Name</b><span>${escapeHtml(profile?.full_name||user.user_metadata?.name||'Not set')}</span></div><div><b>Date of birth</b><span>${escapeHtml(profile?.date_of_birth||user.user_metadata?.date_of_birth||'Not set')}</span></div><div><b>Session safety</b><span>Auto sign-out after about 4 hours inactive</span></div></div><div class="accountPacket"><h3>Account acknowledgements</h3><p class="mini muted">These are kept with your profile so RouteRefund can verify consent before monitoring or contacting you about savings options.</p><ul class="checklist compactList"><li>Terms: ${escapeHtml(accepted(profile?.terms_accepted_at||user.user_metadata?.terms_accepted_at))}</li><li>Privacy: ${escapeHtml(accepted(profile?.privacy_accepted_at||user.user_metadata?.privacy_accepted_at))}</li><li>Trip monitoring authorization: ${escapeHtml(accepted(profile?.monitoring_authorized_at||user.user_metadata?.monitoring_authorized_at))}</li><li>Service fee disclosure: ${escapeHtml(accepted(profile?.fee_disclosure_accepted_at||user.user_metadata?.fee_disclosure_accepted_at))}</li></ul></div><div class="notice smallNotice"><b>Security reminder:</b> RouteRefund trip forms should never ask for payment card numbers, airline passwords, or email passwords. Log out on shared devices.</div><div class="actions"><a class="btn primary" href="trips.html">Back to My trips</a><button class="btn ghost" data-action="logout">Log out</button></div>`
}

async function renderTripDetail(){
  const box=$('tripDetail');if(!box)return;
  const user=await requireLogin(`trip-detail.html${location.search}`);if(!user)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id){box.innerHTML='<div class="empty"><h3>No trip selected</h3><p>Go back to My trips and choose a trip.</p><a class="btn primary" href="trips.html">My trips</a></div>';return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Trip not found</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="trips.html">Back to My trips</a></div>`;return}
  const statuses=['Received','Under review','Watching fare','Opportunity review','Refund/credit captured'];const active=['Savings found','Review needed'].includes(r.status)?3:['Closed','Archived'].includes(r.status)?4:2;
  const status=customerTripStatus(r);
  box.innerHTML=`<div class="panel tripDetailCard"><div class="row"><div><h2>Confirmation ${escapeHtml(r.confirmation_no||'')}</h2><p>${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')} • Paid ${money(r.paid)}</p></div><span class="tag ${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span></div><div class="detailTimeline">${statuses.map((x,i)=>`<div class="${i<=active?'done':''}"><b>${i+1}</b><span>${x}</span></div>`).join('')}</div>${['Savings found','Review needed'].includes(r.status)?'<div class="savingsBox"><h3>RouteRefund review in progress</h3><p>Our team is reviewing a possible fare-change signal for this booking. We will contact you only if there is a verified, customer-approved next step.</p></div>':''}${r.notes?`<p><b>Notes:</b><br>${safeLines(r.notes)}</p>`:''}<div class="actions"><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><a class="btn primary" href="trips.html">Back to dashboard</a></div></div>`
}

let lastModalTrigger=null;
function closeModal(){
  const m=$('modal');
  if(!m)return;
  m.classList.remove('open');
  $('modalCard')?.removeAttribute('tabindex');
  if(lastModalTrigger&&document.contains(lastModalTrigger))lastModalTrigger.focus();
  lastModalTrigger=null;
}
function modal(html){
  const m=$('modal'),card=$('modalCard');
  if(!m||!card)return;
  lastModalTrigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
  m.setAttribute('role','dialog');
  m.setAttribute('aria-modal','true');
  card.innerHTML=html;
  const title=card.querySelector('h1,h2,h3');
  if(title){
    if(!title.id)title.id='modalTitle';
    m.setAttribute('aria-labelledby',title.id);
  }else m.removeAttribute('aria-labelledby');
  m.classList.add('open');
  const focusable=card.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if(!focusable)card.setAttribute('tabindex','-1');
  (focusable||card).focus();
}
async function refreshCustomerTripViews(){await renderTrips();await renderTripDetail()}
async function updateTrip(id,patch,owner=false){const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);if(error)return toast(error.message);if(owner){await renderOwner();await renderOwnerTrip()}else await refreshCustomerTripViews()}
async function archiveTrip(id){const {error}=await supabaseClient.from('trips').update({status:'Archived'}).eq('id',id);if(error)return toast(error.message);toast('Monitoring stopped; trip removed from your dashboard');if(document.body.dataset.page==='trip-detail')location.href='trips.html';else await renderTrips()}
async function appendCustomerNote(id,note){
  const clean=String(note||'').trim();
  if(!clean){toast('Enter a note before saving.');return false}
  const {data,error:loadError}=await supabaseClient.from('trips').select('notes').eq('id',id).single();
  if(loadError){toast(loadError.message);return false}
  const stamp=new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const existing=String(data?.notes||'').trim();
  const next=[existing,`Customer update ${stamp}: ${clean}`].filter(Boolean).join('\n\n');
  await updateTrip(id,{notes:next});
  toast('Trip note added');
  return true;
}
async function completeMonitoringCheck(id,observedPrice,kind='No savings',note=''){
  const now=new Date();
  const next=new Date(now.getTime()+6*60*60*1000);
  const price=observedPrice===''||observedPrice==null?null:Number(observedPrice);
  const {data:trip}=await supabaseClient.from('trips').select('paid').eq('id',id).single();
  const paid=Number(trip?.paid||0);
  const lowerFare=price!=null&&Number.isFinite(price)&&paid>0&&price<paid;
  if(kind==='Review needed'&&!lowerFare){toast('Review queue requires a verified fare lower than the customer paid.');return false}
  if(kind==='No savings'&&lowerFare){toast('Lower fare entered. Use “Send to review” so evidence is captured intentionally.');return false}
  const savingsFound=lowerFare;
  await supabaseClient.from('monitoring_checks').update({checked_at:now.toISOString(),observed_price:price,result:savingsFound?'Savings found':'No savings',notes:note||'Partner completed fare check'}).eq('trip_id',id).eq('result','Due');
  const patch={last_checked_at:now.toISOString(),next_check_at:next.toISOString(),status:savingsFound?'Review needed':'Monitoring'};
  if(!savingsFound)await supabaseClient.from('monitoring_checks').insert({trip_id:id,check_due_at:next.toISOString(),source:'Scheduled follow-up',result:'Due',notes:'Next monitoring reminder'});
  if(price)patch.current_price=price;
  const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);
  if(error)return toast(error.message);
  await renderOwner();await renderOwnerTrip();toast(savingsFound?'Moved to review needed':'No savings recorded; next check scheduled');return true
}
let ownerActiveFilter='All';
function ownerStatusLabel(status){return ({'Monitoring':'Watching','Savings found':'Review needed','Review needed':'Review needed','Closed':'Archived','Archived':'Archived'}[status]||status||'Watching')}
function ownerStatusClass(status,due){if(due)return 'due';const x=ownerStatusLabel(status).toLowerCase().replace(/\s+/g,'-');return x}
function ownerDueSummary(r){const first=r.due_checks?.[0];if(!first)return r.next_check_at?`Next check ${new Date(r.next_check_at).toLocaleString()}`:'No scheduled check';return `Due ${new Date(first.check_due_at).toLocaleString()}`}
function ownerNextStep(r){const label=ownerStatusLabel(r.status);if(r.due_checks?.length)return 'Compare the same itinerary, record the observed fare, then schedule the next check or send to review.';if(label==='Review needed')return 'Verify evidence and customer eligibility before any customer follow-up.';if(label==='Archived')return 'Resolved and retained for reference; no active customer action.';return 'Continue monitoring until the next scheduled fare check.'}
function ownerPriority(r){if(r.due_checks?.length)return 0;const label=ownerStatusLabel(r.status);if(label==='Review needed')return 1;if(label==='Watching')return 2;return 3}
function ownerControls(){return `<div class="ownerToolbar" aria-label="Operations queue controls"><div class="ownerFilters"><button class="btn ghost" data-action="owner-filter" data-status="All">Active queue</button><button class="btn ghost" data-action="owner-filter" data-status="Due">Due now</button><button class="btn ghost" data-action="owner-filter" data-status="Review needed">Review queue</button><button class="btn ghost" data-action="owner-filter" data-status="Watching">Monitoring</button><button class="btn ghost" data-action="owner-filter" data-status="Archived">Resolved archive</button></div><input id="ownerSearch" placeholder="Search passenger, locator, airline, route, or internal note" aria-label="Search operations queue"></div><div id="ownerQueueState" class="opsQueueState" aria-live="polite"></div>`}
async function ownerNotesByTrip(){const {data,error}=await supabaseClient.from('owner_trip_notes').select('trip_id,owner_notes');if(error)return {};return Object.fromEntries((data||[]).map(n=>[n.trip_id,n.owner_notes||'']))}
async function saveOwnerNote(id,note){const clean=String(note||'').trim();if(!clean){toast('Enter an internal note before saving.');return false}const {error}=await supabaseClient.from('owner_trip_notes').upsert({trip_id:id,owner_notes:clean,updated_at:new Date().toISOString()},{onConflict:'trip_id'});if(error){toast(error.message);return false}await renderOwner();await renderOwnerTrip();toast('Owner note saved');return true}
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
  const statusLabel=ownerStatusLabel(r.status);
  const statusClass=ownerStatusClass(r.status,due);
  const passenger=[r.passenger_first,r.passenger_last].filter(Boolean).join(' ')||'Passenger pending';
  const actionHint=due?'Fare check due':statusLabel==='Review needed'?'Evidence review':statusLabel==='Archived'?'Resolved archive':'Scheduled monitoring';
  const dueSummary=ownerDueSummary(r);
  return `<article class="opsTripCard ownerTrip ${statusClass}" data-status="${escapeHtml(statusLabel)}" data-due="${due?'true':'false'}" data-priority="${ownerPriority(r)}" data-search="${escapeHtml([r.confirmation_no,r.passenger_first,r.passenger_last,r.notes,r.owner_notes,r.airline,r.route,statusLabel].join(' ').toLowerCase())}"><div class="opsTripTop"><div><span class="opsPill ${statusClass}">${due?'Due now':escapeHtml(statusLabel)}</span><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><a class="btn primary" href="partner-ops-trip.html?id=${encodeURIComponent(r.id)}">Open workspace</a></div><div class="opsTripMeta"><div><b>Passenger</b><span>${escapeHtml(passenger)}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not logged'}</span></div><div><b>Ops timing</b><span>${escapeHtml(dueSummary)}</span></div></div><div class="opsNextAction"><b>${escapeHtml(actionHint)}</b><span>${escapeHtml(ownerNextStep(r))}</span></div>${savings>0?`<div class="reviewBanner"><b>${money(savings)} potential savings</b><span>Confirm eligibility and document evidence before customer follow-up.</span></div>`:''}${r.owner_notes?`<p class="opsNote"><b>Internal note:</b> ${safeLines(r.owner_notes)}</p>`:''}<div class="opsActions"><button class="btn ghost" data-action="owner-no-savings" data-id="${r.id}">Document check</button><button class="btn ghost" data-action="owner-review" data-id="${r.id}">Send to review</button>${ownerNoteButton(r.id,r.owner_notes,'Internal follow-up note')}<button class="btn ghost" data-action="owner-status" data-id="${r.id}" data-status="Archived">Archive resolved</button></div></article>`
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
  const queueIntro=`<div class="opsQueueIntro"><div><h2>Operations queue</h2><p>Work due checks first, then evidence review, then scheduled monitoring. Archiving only removes a resolved trip from the active ops queue.</p></div><span>${dueTotal?`${dueTotal} check${dueTotal===1?'':'s'} due now`:'No checks due'}</span></div><div class="opsWorkflow" aria-label="RouteRefund operations workflow"><div><b>1. Check</b><span>Compare same airline, route, date, cabin, and terms.</span></div><div><b>2. Review</b><span>Confirm evidence and eligibility before customer outreach.</span></div><div><b>3. Follow up</b><span>Record the customer action, invoice status, and final note.</span></div><div><b>4. Archive</b><span>Move resolved work out of the active queue without deleting trips.</span></div></div>`;
  box.innerHTML=ownerControls()+queueIntro+(sortedRows.length?sortedRows.map(ownerTripCard).join(''):`<div class="empty"><h3>No customer trips yet</h3><p>New customer bookings will appear here when monitoring starts.</p></div>`)+`<div id="ownerNoMatches" class="empty opsNoMatches" hidden><h3>No trips match this view</h3><p>Try another queue tab or search term.</p></div>`;
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
  box.innerHTML=`<section class="opsWorkspaceHero"><div><a class="mini" href="partner-ops-dashboard.html">← Back to ops dashboard</a><span class="opsPill ${ownerStatusClass(r.status,due)}">${due?'Due check':escapeHtml(statusLabel)}</span><h1>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h1><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><div class="opsHeroActions"><button class="btn primary" data-action="owner-no-savings" data-id="${r.id}">Document fare check</button><button class="btn ghost" data-action="owner-review" data-id="${r.id}">Send to review</button></div></section>${due?`<div class="notice dueNotice"><b>${due} check due.</b> Compare the same airline, route, date and cabin. Do not contact customer until a lower eligible fare is verified and documented.</div>`:''}<section class="opsWorkspaceGrid"><div class="opsMainPanel"><h2>Trip details</h2><div class="opsDetailGrid"><div><b>Passenger</b><span>${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</span></div><div><b>Date of birth</b><span>${escapeHtml(r.date_of_birth||'')}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not recorded'}</span></div><div><b>Potential savings</b><span>${savings>0?money(savings):'None yet'}</span></div><div><b>Ops timing</b><span>${escapeHtml(ownerDueSummary(r))}</span></div><div><b>Fee status</b><span>${escapeHtml(r.payment_status||'Not billed')}</span></div><div><b>Ops status</b><span>${escapeHtml(statusLabel)}</span></div></div><div class="opsTimeline"><div class="done"><b>1</b><span>Booking received</span></div><div class="${statusLabel!=='Archived'?'done':''}"><b>2</b><span>Monitoring fare</span></div><div class="${statusLabel==='Review needed'?'done':''}"><b>3</b><span>Evidence review</span></div><div class="${r.payment_status==='Paid'?'done':''}"><b>4</b><span>Customer follow-up / resolved</span></div></div></div><aside class="opsSidePanel"><h3>Recommended next action</h3><p>${escapeHtml(ownerNextStep(r))}</p><div class="opsStack"><button class="btn ghost" data-action="owner-no-savings" data-id="${r.id}">Document routine fare check</button><button class="btn primary" data-action="owner-review" data-id="${r.id}">Document lower fare for review</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Invoice sent">Record invoice sent</button><button class="btn ghost" data-action="owner-payment" data-id="${r.id}" data-status="Paid">Record fee captured</button><button class="btn ghost" data-action="owner-status" data-id="${r.id}" data-status="Archived">Archive resolved trip</button></div></aside></section><section class="panel opsNotesPanel"><h2>Notes</h2><div class="grid two"><div>${r.notes?`<p><b>Customer note</b><br>${safeLines(r.notes)}</p>`:'<p class="muted">No customer note.</p>'}</div><div>${r.owner_notes?`<p><b>Internal note</b><br>${safeLines(r.owner_notes)}</p>`:'<p class="muted">No internal note yet.</p>'}</div></div><div class="actions">${ownerNoteButton(r.id,r.owner_notes,'Update internal note')}</div></section>`
}
function applyOwnerFilter(status=ownerActiveFilter){
  ownerActiveFilter=status||'All';
  const q=($('ownerSearch')?.value||'').trim().toLowerCase();
  let visible=0,totalInView=0;
  document.querySelectorAll('[data-action="owner-filter"]').forEach(btn=>{const on=(btn.dataset.status||'All')===ownerActiveFilter;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false')});
  document.querySelectorAll('.ownerTrip').forEach(card=>{const active=card.dataset.status!=='Archived';const okStatus=ownerActiveFilter==='All'?(active):(ownerActiveFilter==='Due'?card.dataset.due==='true':card.dataset.status===ownerActiveFilter);if(okStatus)totalInView++;const okSearch=!q||card.dataset.search.includes(q);const show=okStatus&&okSearch;card.style.display=show?'':'none';if(show)visible++});
  if($('ownerQueueState'))$('ownerQueueState').textContent=`Showing ${visible} of ${totalInView} ${ownerActiveFilter==='All'?'active queue':ownerActiveFilter.toLowerCase()} trip${totalInView===1?'':'s'}${q?` matching “${q}”`:''}.`;
  if($('ownerNoMatches'))$('ownerNoMatches').hidden=visible!==0;
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('button,[data-action]');if(!b)return;
  const action=b.dataset.action,id=b.dataset.id;
  if(action==='mobile-menu')return modal('<h2>Menu</h2><div class="mobileMenuList"><a href="how-it-works.html">How it works</a><a href="supported-airlines.html">Airlines</a><a href="trust-center.html">Trust center</a><a href="faq.html">FAQ</a><a href="forward-confirmation.html">Forward confirmation</a><a href="login.html">Log in</a><a href="signup.html">Create account</a><a href="add-trip.html">Start tracking</a></div>');
  if(action==='logout')return logout();
  if(action==='remove')return modal(`<h2>Stop monitoring this trip?</h2><p>This archives the booking in RouteRefund, removes it from your customer dashboard, and stops active monitoring. It will not delete operational records or change, cancel, or rebook anything with the airline.</p><div class="actions"><button class="btn danger" data-action="confirm-remove" data-id="${escapeHtml(id)}">Stop monitoring</button><button class="btn ghost" data-action="close-modal">Keep monitoring</button></div>`);
  if(action==='confirm-remove'){closeModal();return archiveTrip(id)}
  if(action==='close-modal')return closeModal();
  if(action==='note')return modal(`<h2>Add a trip update</h2><p>Use this to add schedule preferences, refund constraints, or context for RouteRefund. Existing notes stay attached to the trip.</p><label>New note<textarea id="noteText" placeholder="Example: I prefer travel credit if a cash refund is not possible."></textarea></label><button class="btn primary" data-action="save-note" data-id="${escapeHtml(id)}">Add note to trip</button>`);
  if(action==='save-note'){const saved=await appendCustomerNote(id,$('noteText').value);if(saved)closeModal();return}
  if(action==='owner-filter')return applyOwnerFilter(b.dataset.status||'All');
  if(action==='owner-status')return updateTrip(id,{status:b.dataset.status},true);
  if(action==='owner-payment')return updateTrip(id,{payment_status:b.dataset.status},true);
  if(action==='owner-note'){
    const current=b.dataset.note||'';
    return modal(`<h2>Internal note</h2><p class="mini muted">Private partner-only note. Saving replaces the current internal note for this trip; it is not shown in the customer dashboard.</p><label>What happened / next step<textarea id="ownerNoteText" placeholder="Checked AA mobile app. Same cabin. Need customer approval before action.">${escapeHtml(current)}</textarea></label><button class="btn primary" data-action="save-owner-note" data-id="${escapeHtml(id)}">Save internal note</button>`)
  }
  if(action==='save-owner-note'){const saved=await saveOwnerNote(id,$('ownerNoteText').value);if(saved)closeModal();return}
  if(action==='owner-review')return modal(`<h2>Flag for evidence review</h2><p>Use this only when a verified lower eligible fare appears real. The fare must be below the customer-paid amount before the trip can enter review; this does not change the booking or bill the customer.</p><div class="notice smallNotice"><b>Evidence checklist:</b> Note the source, same route/date/cabin, comparable fare rules, screenshot or saved proof location, and whether customer action is required.</div><label>Observed lower fare<input id="foundPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="299.00"></label><label>Evidence / next step<textarea id="priceNote" required placeholder="Example: United app, same date/route/cabin, main cabin rules match, screenshot saved in drive, customer must approve rebook."></textarea></label><button class="btn primary" data-action="save-owner-review" data-id="${id}">Move to review queue</button>`);
  if(action==='owner-no-savings')return modal(`<h2>Record fare check</h2><p>If nothing actionable was found, this schedules the next monitoring check automatically. Add enough detail that another partner can audit what was compared.</p><label>Observed current fare <span class="optional">optional</span><input id="noSavingsPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Leave blank if not recorded"></label><label>Check note<textarea id="noSavingsNote" placeholder="Checked same airline/route/date/cabin. No lower eligible fare found."></textarea></label><button class="btn primary" data-action="save-no-savings" data-id="${id}">Save check + schedule next</button>`);
  if(action==='save-owner-review'){const evidence=$('priceNote').value.trim();if(!$('foundPrice').value)return toast('Enter the lower price found.');if(evidence.length<20)return toast('Add evidence details before moving this trip to review.');const saved=await completeMonitoringCheck(id,$('foundPrice').value,'Review needed',evidence);if(saved!==false)closeModal();return}
  if(action==='save-no-savings'){const saved=await completeMonitoringCheck(id,$('noSavingsPrice').value,'No savings',$('noSavingsNote').value.trim());if(saved!==false)closeModal();return}
});
document.addEventListener('input',e=>{if(e.target?.id==='ownerSearch')applyOwnerFilter(ownerActiveFilter)});

function syncPublicNav(){const publicPages=new Set(['home','info']);const page=document.body.dataset.page;if(!publicPages.has(page))return;const links=document.querySelector('.nav .links');if(!links)return;links.innerHTML='<a class="hide-sm" href="how-it-works.html">How it works</a><a class="hide-sm" href="supported-airlines.html">Airlines</a><a class="hide-sm" href="trust-center.html">Trust</a><a class="hide-sm" href="faq.html">FAQ</a><a class="btn ghost" href="login.html">Log in</a><a class="btn primary" href="add-trip.html">Start tracking</a><button class="btn ghost mobileMenuBtn" data-action="mobile-menu" aria-label="Open menu">Menu</button>'}

window.addEventListener('DOMContentLoaded',async()=>{
  syncPublicNav();
  if(!supabaseClient)return toast('Missing Supabase config');
  ['click','keydown','touchstart','scroll'].forEach(ev=>document.addEventListener(ev,touchActivity,{passive:true}));
  if($('modal'))$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('modal')?.classList.contains('open'))closeModal()});
  if(document.body.dataset.page==='signup')$('signupForm').addEventListener('submit',signup);
  if(document.body.dataset.page==='login'||document.body.dataset.page==='partner-login')$('loginForm').addEventListener('submit',login);
  if(document.body.dataset.page==='partner-login'){const user=await getUser();if(user&&PARTNER_EMAIL_ALLOWLIST.has((user.email||'').toLowerCase()))await requirePartnerMfa(safeNext(new URLSearchParams(location.search).get('next'),'partner-ops-dashboard.html',true))}
  if(document.body.dataset.page==='reset')$('resetForm').addEventListener('submit',resetPassword);
  if(document.body.dataset.page==='forgot-email')$('forgotEmailForm').addEventListener('submit',forgotEmail);
  if(document.body.dataset.page==='update-password')$('updatePasswordForm').addEventListener('submit',updatePassword);
  if(document.body.dataset.page==='dashboard'){const user=await requireLogin('trips.html');if(!user)return;$('welcome').textContent=user.email;$('tripForm').addEventListener('submit',addTrip);$('airlineSelect')?.addEventListener('change',updateLocatorHint);updateLocatorHint();await renderTrips()}
  if(document.body.dataset.page==='account'){await renderAccount()}
  if(document.body.dataset.page==='trip-detail'){await renderTripDetail()}
  if(document.body.dataset.page==='owner'){const user=await requireOwner('partner-ops-dashboard.html');if(!user)return;$('ownerWelcome').textContent=user.email;await renderOwner()}
  if(document.body.dataset.page==='owner-trip'){await renderOwnerTrip()}
});
