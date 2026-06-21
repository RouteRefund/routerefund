const RR = window.ROUTEREFUND_CONFIG || {};
const supabaseClient = window.supabase?.createClient(RR.SUPABASE_URL, RR.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const money = n => (n===null||n===undefined||n==='') ? 'Pending' : '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

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
function syncLocatorHint(){const select=$('airline'),hint=$('locatorHint');if(!select||!hint)return;hint.textContent=locatorRule(select.value).hint}
function luhnOk(value=''){let sum=0,alt=false;for(let i=value.length-1;i>=0;i--){let n=Number(value[i]);if(alt){n*=2;if(n>9)n-=9}sum+=n;alt=!alt}return value.length>=13&&value.length<=19&&sum%10===0}
function hasPaymentCardNumber(value=''){return (String(value).match(/(?:\d[ -]?){13,19}/g)||[]).some(x=>luhnOk(x.replace(/\D/g,'')))}
function tripTextSafetyMessage(value=''){
  const text=String(value||'');
  if(hasPaymentCardNumber(text))return 'Please remove payment card numbers before saving this trip note.';
  if(/\b(password|passcode|cvv|cvc|security code|2fa code|airline login|email login|account login)\b/i.test(text))return 'Please remove passwords, login details, or verification codes before saving this trip note.';
  return '';
}
function sensitiveOpsTextMessage(value=''){
  const message=tripTextSafetyMessage(value);
  return message ? message.replace('trip note','partner note') : '';
}
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
  const airline=$('airline')?.value.trim()||'';
  if(!airline)return fail('Choose the airline so RouteRefund can start the right lookup.');
  const confirmation=normalizeConfirmation($('confirmationNo').value);
  if(!validConfirmation(confirmation,airline)){const r=locatorRule(airline);return fail(`Enter ${r.min===r.max?r.min:`${r.min}-${r.max}`} letters/numbers from the booking email.`)}
  const trip={user_id:user.id,passenger_first:$('passengerFirst').value.trim(),passenger_last:$('passengerLast').value.trim(),date_of_birth:$('dateOfBirth').value,confirmation_no:confirmation,airline,route:null,travel_date:null,paid:null,notes:null,change_consent:true,status:'Intake review'};
  lock('Saving trip...');
  const {error}=await supabaseClient.from('trips').insert(trip);
  if(error)return fail(error.message);
  e.target.reset();syncLocatorHint();toast('Flight lookup started — this page will update automatically.');await renderTrips();scheduleCustomerLookupRefresh(true);unlock()
}
async function loadTrips(){const {data,error}=await supabaseClient.from('trips').select('*').or('status.is.null,status.neq.Archived').order('created_at',{ascending:false});return {rows:data||[],error}}
function tripSavings(r){return r.current_price?Number(r.paid)-Number(r.current_price):0}
function customerTripStatus(r){
  const raw=r.status||'';
  const unverified=!hasVerifiedFlightDetails(r);
  if(unverified||['Intake review','Received','Submitted'].includes(raw))return {label:'Lookup running',step:'No action needed',body:'Your confirmation is saved. RouteRefund is checking the reservation details and will move it into monitoring once the flight is verified.',tone:'intake'};
  if(['Savings found','Review needed'].includes(raw))return {label:'Opportunity review',step:'RouteRefund reviewing',body:'We are checking eligibility and customer safety before sharing any next step. You will not be asked to approve anything until the opportunity is verified.',tone:'review'};
  if(['Closed','Archived'].includes(raw))return {label:'Resolved',step:'Resolved',body:'This RouteRefund record is no longer actively monitored. Deleting it here does not contact or change the airline reservation.',tone:'closed'};
  return {label:'Monitoring active',step:'Watching quietly',body:'We are monitoring this booked flight and will only contact you if there is a verified, customer-approved next step.',tone:'monitoring'};
}
function hasVerifiedFlightDetails(r){return !!(r.route||r.travel_date||r.departure_time)}
let customerLookupPollTimer=null;
let customerLookupPollStarted=0;
function scheduleCustomerLookupRefresh(hasPending=false){
  if(!['dashboard','trip-detail'].includes(document.body.dataset.page))return;
  if(hasPending){
    if(!customerLookupPollTimer){
      customerLookupPollStarted=Date.now();
      customerLookupPollTimer=setInterval(async()=>{
        if(Date.now()-customerLookupPollStarted>1000*60*5){clearInterval(customerLookupPollTimer);customerLookupPollTimer=null;return}
        if(document.body.dataset.page==='dashboard')await renderTrips();
        if(document.body.dataset.page==='trip-detail')await renderTripDetail();
      },5000);
    }
  }else if(customerLookupPollTimer){
    clearInterval(customerLookupPollTimer);customerLookupPollTimer=null;
  }
}
function customerTripTitle(r){return `${escapeHtml(r.confirmation_no||'Trip')}${r.airline?` <span>${escapeHtml(r.airline)}</span>`:''}`}
function customerTripDeleteButton(r){
  const label=[r.airline,r.confirmation_no].filter(Boolean).join(' ')||'this trip';
  return `<button class="btn danger" data-action="delete-trip" data-id="${escapeHtml(r.id)}" data-trip-label="${escapeHtml(label)}" aria-label="Remove RouteRefund record for ${escapeHtml(label)}">Remove trip</button>`
}
function customerTripMeta(r){
  if(!hasVerifiedFlightDetails(r)){
    const airline=r.airline?` for ${escapeHtml(r.airline)}`:'';
    return `<div class="lookupSummary compactLookup" aria-label="Flight lookup status"><div><b>Looking up flight${airline}</b><span>Confirmation ${escapeHtml(r.confirmation_no||'')} is saved. No airline password, email login, payment card, or one-time code is needed.</span></div></div>`;
  }
  return `<div class="customerTripMeta" aria-label="Trip summary"><div><b>Airline</b><span>${escapeHtml(r.airline||'—')}</span></div><div><b>Route</b><span>${escapeHtml(r.route||'—')}</span></div><div><b>Departure</b><span>${escapeHtml(r.travel_date||'—')}</span></div><div><b>Time</b><span>${escapeHtml(r.departure_time||'—')}</span></div>${r.paid!=null?`<div><b>Price paid</b><span>${money(r.paid)}</span></div>`:''}</div>`
}
function customerTripProgress(r,tripStatus){
  if(!hasVerifiedFlightDetails(r))return `<div class="lookupProgress" role="list" aria-label="Trip progress"><span class="done" role="listitem">Submitted</span><span class="active" role="listitem" aria-current="step">Looking up flight</span><span role="listitem">Monitoring starts after lookup</span></div>`;
  const verified=['Monitoring','Savings found','Review needed','Closed','Archived'].includes(tripStatus),review=['Savings found','Review needed','Closed','Archived'].includes(tripStatus);
  const current=review?'Review':verified?'Monitoring':'Details verified';
  return `<div class="miniTimeline" role="list" aria-label="Trip progress"><span class="done" role="listitem">Submitted</span><span class="${verified?'done':''}" role="listitem" ${current==='Details verified'?'aria-current="step"':''}>Details verified</span><span class="${verified?'done':''}" role="listitem" ${current==='Monitoring'?'aria-current="step"':''}>Monitoring</span><span class="${review?'done':''}" role="listitem" ${current==='Review'?'aria-current="step"':''}>Review</span></div>`;
}

async function renderTrips(){
  const box=$('trips');if(!box)return;
  box.setAttribute('aria-busy','true');
  const {rows,error}=await loadTrips();
  if(error){box.innerHTML=`<div class="empty dashboardEmpty errorState"><h3>Trips could not be loaded</h3><p>${escapeHtml(error.message||'Please refresh and try again.')}</p><button class="btn primary" type="button" onclick="renderTrips()">Retry</button></div>`;box.setAttribute('aria-busy','false');return}
  const hasPendingLookup=rows.some(r=>!hasVerifiedFlightDetails(r));
  scheduleCustomerLookupRefresh(hasPendingLookup);
  box.innerHTML=rows.length?rows.map(r=>{
    const status=customerTripStatus(r);
    const tripStatus=r.status||'Monitoring';
    const intake=!hasVerifiedFlightDetails(r);
    const titleId=`trip-title-${escapeHtml(r.id)}`;
    const detailLabel=[r.airline,r.confirmation_no].filter(Boolean).join(' ')||'this trip';
    return `<article class="trip customerTripCard simpleTripCard ${intake?'lookupOnlyCard':''}" aria-labelledby="${titleId}"><div class="tripCardTop"><div><span class="tripKicker">${escapeHtml(r.airline||'Flight')}</span><h3 id="${titleId}">${customerTripTitle(r)}</h3><p>Passenger: ${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</p></div><span class="tag ${escapeHtml(status.tone)}" aria-label="Status: ${escapeHtml(status.label)}">${escapeHtml(status.label)}</span></div>${customerTripMeta(r)}${customerTripProgress(r,tripStatus)}<div class="customerNextStep"><b>${escapeHtml(status.step)}</b><span>${escapeHtml(status.body)}</span></div>${r.notes?`<div class="customerNotePreview"><b>Your latest update</b><span>${safeLines(r.notes).split('<br>').slice(-2).join('<br>')}</span></div>`:''}<div class="actions tripActionsSimple"><a class="btn primary" href="trip-detail.html?id=${encodeURIComponent(r.id)}" aria-label="View details for ${escapeHtml(detailLabel)}">View details</a>${intake?'':`<button class="btn ghost" data-action="note" data-id="${escapeHtml(r.id)}" aria-label="Send an update about ${escapeHtml(detailLabel)}">Send update</button>`}${customerTripDeleteButton(r)}</div></article>`
  }).join(''):`<div class="empty dashboardEmpty"><span class="eyebrow">Ready when you are</span><h3>Add your first booked flight</h3><p>Use the form above or forward the airline confirmation email. RouteRefund will never ask for airline passwords, email passwords, or payment card numbers.</p><div class="actions tripActionsSimple"><a class="btn primary" href="#tripForm">Add flight details</a><a class="btn ghost" href="forward-confirmation.html">Forward confirmation</a></div></div>`
  box.setAttribute('aria-busy','false');
}



async function renderAccount(){
  const panel=$('accountPanel');if(!panel)return;
  const user=await requireLogin('account.html');if(!user)return;
  if($('accountWelcome'))$('accountWelcome').textContent=user.email;
  const {data:profile}=await supabaseClient.from('profiles').select('*').eq('user_id',user.id).maybeSingle();
  const accepted=value=>value?`Accepted ${new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'Not recorded';
  const identityName=profile?.full_name||user.user_metadata?.name||'Not set';
  const dob=profile?.date_of_birth||user.user_metadata?.date_of_birth||'Not set';
  panel.classList.add('accountPanelV2');
  panel.innerHTML=`<div class="accountHeroCard"><div><span class="eyebrow">Private customer account</span><h2>Signed in securely</h2><p>Your account stores only the identity and authorization details RouteRefund needs to match booked flights and contact you about verified next steps.</p></div><span class="tag monitoring" aria-label="Account type: customer only">Customer only</span></div><div class="accountTrustGrid" aria-label="Account summary"><div><b>Email</b><span>${escapeHtml(user.email||'')}</span></div><div><b>Name</b><span>${escapeHtml(identityName)}</span></div><div><b>Date of birth</b><span>${escapeHtml(dob)}</span></div><div><b>Session safety</b><span>Auto sign-out after about 4 hours inactive</span></div></div><div class="accountPacketV2"><div><h3>Account acknowledgements</h3><p>These acknowledgements stay with your profile so RouteRefund can verify consent before monitoring or contacting you about savings options.</p></div><ul aria-label="Accepted account acknowledgements"><li><b>Terms</b><span>${escapeHtml(accepted(profile?.terms_accepted_at||user.user_metadata?.terms_accepted_at))}</span></li><li><b>Privacy</b><span>${escapeHtml(accepted(profile?.privacy_accepted_at||user.user_metadata?.privacy_accepted_at))}</span></li><li><b>Monitoring authorization</b><span>${escapeHtml(accepted(profile?.monitoring_authorized_at||user.user_metadata?.monitoring_authorized_at))}</span></li><li><b>Service fee disclosure</b><span>${escapeHtml(accepted(profile?.fee_disclosure_accepted_at||user.user_metadata?.fee_disclosure_accepted_at))}</span></li></ul></div><div class="accountSafetyNote"><b>Security reminder</b><span>RouteRefund trip forms should never ask for payment card numbers, airline passwords, email passwords, or one-time codes.</span></div><div class="actions tripActionsSimple"><a class="btn primary" href="trips.html">Back to My trips</a><button class="btn ghost" data-action="logout">Log out</button></div>`
  panel.setAttribute('aria-busy','false');
}

async function renderTripDetail(){
  const box=$('tripDetail');if(!box)return;
  box.setAttribute('aria-busy','true');
  const user=await requireLogin(`trip-detail.html${location.search}`);if(!user)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id||!isUuid(id)){box.innerHTML='<div class="empty"><h3>No trip selected</h3><p>Go back to My trips and choose a trip.</p><a class="btn primary" href="trips.html">My trips</a></div>';box.setAttribute('aria-busy','false');return}
  const {data:r,error}=await supabaseClient.from('trips').select('*').eq('id',id).single();
  if(error||!r){box.innerHTML=`<div class="panel"><h2>Trip not found</h2><p>${escapeHtml(error?.message||'This trip could not be loaded.')}</p><a class="btn primary" href="trips.html">Back to My trips</a></div>`;box.setAttribute('aria-busy','false');return}
  const statuses=['Submitted','Details verified','Monitoring','Opportunity review','Resolved'];const unverified=!hasVerifiedFlightDetails(r);const active=(unverified||['Intake review','Received','Submitted'].includes(r.status))?0:['Savings found','Review needed'].includes(r.status)?3:['Closed','Archived'].includes(r.status)?4:2;
  const status=customerTripStatus(r);
  scheduleCustomerLookupRefresh(unverified);
  const flightLine=hasVerifiedFlightDetails(r)?`${escapeHtml(r.airline||'Airline')} • ${escapeHtml(r.route||'Route')} • ${escapeHtml(r.travel_date||'Date')}${r.departure_time?` • ${escapeHtml(r.departure_time)}`:''}`:'Looking up flight details for this confirmation';
  box.innerHTML=`<div class="panel tripDetailCard simpleTripDetail"><div class="tripDetailHero"><div><span class="tripKicker">${escapeHtml(r.airline||'Flight')}</span><h2>Confirmation ${escapeHtml(r.confirmation_no||'')}</h2><p>${flightLine}</p></div><span class="tag ${escapeHtml(status.tone)}" aria-label="Status: ${escapeHtml(status.label)}">${escapeHtml(status.label)}</span></div><div class="tripDetailSummary"><div><b>Passenger</b><span>${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</span></div><div><b>Airline</b><span>${escapeHtml(r.airline||'—')}</span></div><div><b>Route</b><span>${escapeHtml(r.route||'Pending lookup')}</span></div><div><b>Departure</b><span>${escapeHtml(r.travel_date||'Pending lookup')}${r.departure_time?` • ${escapeHtml(r.departure_time)}`:''}</span></div>${r.paid!=null?`<div><b>Price paid</b><span>${money(r.paid)}</span></div>`:''}</div><div class="detailTimeline" role="list" aria-label="Trip progress">${statuses.map((x,i)=>`<div class="${i<=active?'done':''}" role="listitem" ${i===active?'aria-current="step"':''}><b>${i+1}</b><span>${x}</span></div>`).join('')}</div><div class="customerNextStep detailNextStep"><b>${escapeHtml(status.step)}</b><span>${escapeHtml(status.body)}</span></div>${(unverified||['Intake review','Received','Submitted'].includes(r.status))?'<div class="savingsBox lookupBox"><h3>Secure lookup running</h3><p>RouteRefund is looking up this reservation. Route, date, time, and flight details will appear here after the reservation is found.</p></div>':''}${['Savings found','Review needed'].includes(r.status)?'<div class="savingsBox"><h3>RouteRefund review in progress</h3><p>Our team is reviewing a possible fare-change signal for this booking. We will contact you only if there is a verified, customer-approved next step.</p></div>':''}${r.notes?`<div class="customerNotePreview detailNotes"><b>Your updates</b><span>${safeLines(r.notes)}</span></div>`:''}<div class="actions tripActionsSimple">${unverified?'':`<button class="btn ghost" data-action="note" data-id="${escapeHtml(r.id)}" aria-label="Send an update about confirmation ${escapeHtml(r.confirmation_no||'this trip')}">Send update</button>`}${customerTripDeleteButton(r)}<a class="btn primary" href="trips.html">Back to dashboard</a></div></div>`
  box.setAttribute('aria-busy','false');
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
async function updateTrip(id,patch,owner=false){if(!isUuid(id))return toast('Invalid trip selected');if(!owner){const allowed=Object.keys(patch||{}).every(k=>k==='notes');if(!allowed)return toast('This update is not allowed from the customer dashboard.')}const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);if(error)return toast(error.message);if(owner){await renderOwner();await renderOwnerTrip()}else await refreshCustomerTripViews()}
async function deleteTrip(id){if(!isUuid(id)){toast('Invalid trip selected');return false}const {error}=await supabaseClient.rpc('delete_my_trip',{target_trip_id:id});if(error){toast(error.message);return false}toast('Trip deleted');if(document.body.dataset.page==='trip-detail')location.href='trips.html';else await renderTrips();return true}
async function appendCustomerNote(id,note){
  const clean=String(note||'').trim();
  if(!isUuid(id)){toast('Invalid trip selected');return false}
  if(!clean){toast('Enter a note before saving.');return false}
  if(clean.length>1000){toast('Keep updates under 1,000 characters.');return false}
  const noteSafety=tripTextSafetyMessage(clean);
  if(noteSafety){toast(noteSafety);return false}
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
  const noteSafety=sensitiveOpsTextMessage(note);
  if(noteSafety){toast(noteSafety);return false}
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
async function saveOwnerNote(id,note){const clean=String(note||'').trim();if(!clean){toast('Enter an internal note before saving.');return false}const noteSafety=sensitiveOpsTextMessage(clean);if(noteSafety){toast(noteSafety);return false}const {error}=await supabaseClient.from('owner_trip_notes').upsert({trip_id:id,owner_notes:clean,updated_at:new Date().toISOString()},{onConflict:'trip_id'});if(error){toast(error.message);return false}await renderOwner();await renderOwnerTrip();toast('Owner note saved');return true}
async function saveOwnerTripDetails(id,fields={}){
  const owner=await requireOwner('partner-ops-dashboard.html');if(!owner)return false;
  const clean=v=>String(v||'').trim();
  const paid=clean(fields.paid);
  const patch={
    airline:clean(fields.airline)||null,
    route:clean(fields.route).toUpperCase()||null,
    travel_date:clean(fields.travel_date)||null,
    departure_time:clean(fields.departure_time)||null,
    paid:paid===''?null:Number(paid)
  };
  if(paid!==''&&(!Number.isFinite(patch.paid)||patch.paid<0)){toast('Enter a valid non-negative customer-paid fare.');return false}
  if(['Intake review','Received',null,undefined,''].includes(fields.current_status))patch.status='Monitoring';
  const {error}=await supabaseClient.from('trips').update(patch).eq('id',id);
  if(error){toast(error.message);return false}
  await renderOwner();await renderOwnerTrip();toast('Trip details saved');return true
}
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
  const activeActions=`<button class="btn ghost" data-action="owner-details" data-id="${escapeHtml(r.id)}">Verify trip details</button><button class="btn ghost" data-action="owner-no-savings" data-id="${escapeHtml(r.id)}">Document check</button><button class="btn ghost" data-action="owner-review" data-id="${escapeHtml(r.id)}">Send to review</button>${ownerNoteButton(r.id,r.owner_notes,'Internal follow-up note')}<button class="btn ghost" data-action="owner-status" data-id="${escapeHtml(r.id)}" data-status="Archived">Archive resolved</button>`;
  const archivedActions=`${ownerNoteButton(r.id,r.owner_notes,'Update archive note')}<a class="btn ghost" href="partner-ops-trip.html?id=${encodeURIComponent(r.id)}">Open archived record</a>`;
  const actions=statusLabel==='Archived'?archivedActions:activeActions;
  return `<article class="opsTripCard ownerTrip ${statusClass}" data-status="${escapeHtml(statusLabel)}" data-due="${due?'true':'false'}" data-priority="${ownerPriority(r)}" data-search="${escapeHtml([r.confirmation_no,r.passenger_first,r.passenger_last,r.notes,r.owner_notes,r.airline,r.route,statusLabel].join(' ').toLowerCase())}"><div class="opsTripTop"><div><span class="opsPill ${statusClass}">${due?'Due now':escapeHtml(statusLabel)}</span><h3>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h3><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><a class="btn primary" href="partner-ops-trip.html?id=${encodeURIComponent(r.id)}">Open workspace</a></div><div class="opsTripMeta"><div><b>Passenger</b><span>${escapeHtml(passenger)}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not logged'}</span></div><div><b>Ops timing</b><span>${escapeHtml(dueSummary)}</span></div></div><div class="opsNextAction"><b>${escapeHtml(actionHint)}</b><span>${escapeHtml(ownerNextStep(r))}</span></div>${savings>0?`<div class="reviewBanner"><b>${money(savings)} potential savings</b><span>Confirm eligibility and document evidence before customer follow-up.</span></div>`:''}${r.owner_notes?`<p class="opsNote"><b>Internal note:</b> ${safeLines(r.owner_notes)}</p>`:''}<div class="opsActions">${actions}</div></article>`
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

async function latestFlightEnrichment(tripId){
  if(!isUuid(tripId))return [];
  const {data,error}=await supabaseClient.from('flight_status_checks').select('source,status,observed_at,callsign,route,payload').eq('trip_id',tripId).order('observed_at',{ascending:false}).limit(6);
  if(error)return [];
  return data||[]
}
function formatObservedAt(ts){
  if(!ts)return 'Not recorded';
  try{return new Date(ts).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return ts}
}
function summarizeLivePayload(row){
  const payload=row?.payload||{};
  if(row.source==='adsb.lol'){
    const ac=payload.aircraft||{};
    const parts=[];
    if(ac.alt_baro||ac.alt_geom)parts.push(`Alt ${escapeHtml(String(ac.alt_baro||ac.alt_geom))}`);
    if(ac.gs)parts.push(`${escapeHtml(String(Math.round(ac.gs)))} kt`);
    if(ac.lat&&ac.lon)parts.push(`${Number(ac.lat).toFixed(2)}, ${Number(ac.lon).toFixed(2)}`);
    return parts.length?parts.join(' • '):escapeHtml(row.status||'No aircraft visible');
  }
  if(row.source==='aviationweather.gov'){
    const metar=Array.isArray(payload.metar)?payload.metar:[];
    return metar.length?metar.slice(0,2).map(m=>`${escapeHtml(m.icaoId||'APT')}: ${escapeHtml(m.rawOb||'Weather observed')}`).join('<br>'):escapeHtml(row.status||'Weather unavailable');
  }
  return escapeHtml(row.status||'Recorded')
}
function renderLiveFlightCards(rows=[]){
  if(!rows.length)return `<section class="panel opsLivePanel"><div><span class="eyebrow">Live APIs</span><h2>No live enrichment yet</h2><p class="muted">The free live worker runs every 5 minutes for near-date trips once a flight number or route is known.</p></div></section>`;
  const latestBySource=[];const seen=new Set();
  rows.forEach(r=>{if(!seen.has(r.source)){seen.add(r.source);latestBySource.push(r)}});
  return `<section class="panel opsLivePanel"><div class="opsLiveHead"><div><span class="eyebrow">Live APIs</span><h2>Real-time flight context</h2><p>Free ADS-B and airport weather checks. This does not change the airline reservation or run fare searches.</p></div><span class="mini muted">Updates every 5 min near travel day</span></div><div class="opsLiveGrid">${latestBySource.map(r=>`<div class="opsLiveCard"><b>${escapeHtml(r.source)}</b><strong>${escapeHtml(r.status||'Checked')}</strong><span>${escapeHtml(r.callsign||r.route||'Route context')}</span><p>${summarizeLivePayload(r)}</p><small>${escapeHtml(formatObservedAt(r.observed_at))}</small></div>`).join('')}</div></section>`
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
  const liveRows=await latestFlightEnrichment(r.id);
  r.owner_notes=privateNotes[r.id]||'';r.due_checks=dueChecks[r.id]||[];
  const savings=Math.max(tripSavings(r),0),statusLabel=ownerStatusLabel(r.status),due=r.due_checks.length;
  const isArchived=statusLabel==='Archived';
  const workspaceActions=isArchived?ownerNoteButton(r.id,r.owner_notes,'Update archive note'):`<button class="btn ghost" data-action="owner-details" data-id="${escapeHtml(r.id)}">Verify trip details</button><button class="btn primary" data-action="owner-no-savings" data-id="${escapeHtml(r.id)}">Document fare check</button><button class="btn ghost" data-action="owner-review" data-id="${escapeHtml(r.id)}">Send to review</button>`;
  const sideActions=isArchived?`${ownerNoteButton(r.id,r.owner_notes,'Update archive note')}<a class="btn ghost" href="partner-ops-dashboard.html">Back to resolved archive</a>`:`<button class="btn ghost" data-action="owner-details" data-id="${escapeHtml(r.id)}">Verify lookup details</button><button class="btn ghost" data-action="owner-no-savings" data-id="${escapeHtml(r.id)}">Document routine fare check</button><button class="btn primary" data-action="owner-review" data-id="${escapeHtml(r.id)}">Document lower fare for review</button><button class="btn ghost" data-action="owner-payment" data-id="${escapeHtml(r.id)}" data-status="Invoice sent">Record invoice sent</button><button class="btn ghost" data-action="owner-payment" data-id="${escapeHtml(r.id)}" data-status="Paid">Record fee captured</button><button class="btn ghost" data-action="owner-status" data-id="${escapeHtml(r.id)}" data-status="Archived">Archive resolved trip</button>`;
  box.innerHTML=`<section class="opsWorkspaceHero"><div><a class="mini" href="partner-ops-dashboard.html">← Back to ops dashboard</a><span class="opsPill ${ownerStatusClass(r.status,due)}">${due?'Due check':escapeHtml(statusLabel)}</span><h1>${escapeHtml(r.airline||'Airline')} ${escapeHtml(r.confirmation_no||'')}</h1><p>${escapeHtml(r.route||'Route pending')} • ${escapeHtml(r.travel_date||'Date pending')}</p></div><div class="opsHeroActions">${workspaceActions}</div></section>${due?`<div class="notice dueNotice"><b>${due} check due.</b> Compare the same airline, route, date and cabin. Do not contact customer until a lower eligible fare is verified and documented.</div>`:''}<section class="opsWorkspaceGrid"><div class="opsMainPanel"><h2>Trip details</h2><div class="opsDetailGrid"><div><b>Passenger</b><span>${escapeHtml(r.passenger_first||'')} ${escapeHtml(r.passenger_last||'')}</span></div><div><b>Date of birth</b><span>${escapeHtml(r.date_of_birth||'')}</span></div><div><b>Customer paid</b><span>${money(r.paid)}</span></div><div><b>Observed fare</b><span>${r.current_price?money(r.current_price):'Not recorded'}</span></div><div><b>Potential savings</b><span>${savings>0?money(savings):'None yet'}</span></div><div><b>Ops timing</b><span>${escapeHtml(ownerDueSummary(r))}</span></div><div><b>Fee status</b><span>${escapeHtml(r.payment_status||'Not billed')}</span></div><div><b>Ops status</b><span>${escapeHtml(statusLabel)}</span></div></div><div class="opsTimeline"><div class="done"><b>1</b><span>Booking received</span></div><div class="${statusLabel!=='Archived'?'done':''}"><b>2</b><span>Monitoring fare</span></div><div class="${statusLabel==='Review needed'?'done':''}"><b>3</b><span>Evidence review</span></div><div class="${r.payment_status==='Paid'?'done':''}"><b>4</b><span>Customer follow-up / resolved</span></div></div></div><aside class="opsSidePanel"><h3>Recommended next action</h3><p>${escapeHtml(ownerNextStep(r))}</p><div class="opsStack">${sideActions}</div></aside></section><section class="panel opsNotesPanel"><h2>Notes</h2><div class="grid two"><div>${r.notes?`<p><b>Customer note</b><br>${safeLines(r.notes)}</p>`:'<p class="muted">No customer note.</p>'}</div><div>${r.owner_notes?`<p><b>Internal note</b><br>${safeLines(r.owner_notes)}</p>`:'<p class="muted">No internal note yet.</p>'}</div></div><div class="actions">${ownerNoteButton(r.id,r.owner_notes,'Update internal note')}</div></section>${renderLiveFlightCards(liveRows)}`
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
  if(action==='mobile-menu')return modal('<h2>RouteRefund menu</h2><p class="mini muted">Flight monitoring after you book, with no airline passwords and no automatic reservation changes.</p><div class="mobileMenuList"><a href="add-trip.html" class="mobileMenuPrimary">Start tracking</a><a href="how-it-works.html">How it works</a><a href="supported-airlines.html">Supported airlines</a><a href="forward-confirmation.html">Forward a confirmation</a><a href="trust-center.html">Trust center</a><a href="faq.html">FAQ</a><a href="login.html">Log in</a><a href="signup.html">Create account</a></div><div class="mobileMenuPromise"><b>Privacy reminder</b><span>Only send trip details needed for review. Do not share airline passwords, one-time codes, or card numbers.</span></div>');
  if(action==='logout')return logout();
  if(action==='delete-trip'){
    const label=escapeHtml(b.dataset.tripLabel||'this trip');
    return modal(`<h2>Remove ${label} from RouteRefund?</h2><p>This removes the trip from your RouteRefund dashboard and clears related lookup/monitoring records. It does not change, cancel, rebook, or contact the airline.</p><div class="deleteSummary"><b>What happens next</b><ul><li>The trip disappears from My trips.</li><li>You can submit the same flight again later if this was a test or duplicate.</li><li>Your airline reservation stays untouched.</li></ul></div><div class="actions"><button class="btn danger" data-action="confirm-delete-trip" data-id="${escapeHtml(id)}">Remove from RouteRefund</button><button class="btn ghost" data-action="close-modal">Keep trip</button></div>`)
  }
  if(action==='confirm-delete-trip'){b.disabled=true;b.textContent='Removing...';const ok=await deleteTrip(id);if(!ok){b.disabled=false;b.textContent='Remove from RouteRefund';return}closeModal();return}
  if(action==='close-modal')return closeModal();
  if(action==='note')return modal(`<h2>Add a trip update</h2><p>Use this to add schedule preferences, refund constraints, or context for RouteRefund. Existing notes stay attached to the trip. Do not include payment card numbers, passwords, or verification codes.</p><label>New note<textarea id="noteText" placeholder="Example: I prefer travel credit if a cash refund is not possible."></textarea></label><button class="btn primary" data-action="save-note" data-id="${escapeHtml(id)}">Add note to trip</button>`);
  if(action==='save-note'){const saved=await appendCustomerNote(id,$('noteText').value);if(saved)closeModal();return}
  if(action==='owner-filter')return applyOwnerFilter(b.dataset.status||'All');
  if(action==='owner-status'){
    const status=b.dataset.status;
    if(status==='Archived')return modal(`<h2>Archive this resolved ops item?</h2><p>This only moves the trip out of the active partner operations queue. It does not delete customer trip records, stop account access, contact the customer, or make any airline booking changes.</p><div class="notice smallNotice"><b>Before archiving:</b> Confirm customer follow-up, payment status, and internal notes are complete enough for another partner to audit later.</div><div class="actions"><button class="btn danger" data-action="confirm-owner-status" data-id="${escapeHtml(id)}" data-status="Archived">Archive resolved item</button><button class="btn ghost" data-action="close-modal">Keep in active queue</button></div>`);
    return updateTrip(id,{status},true);
  }
  if(action==='confirm-owner-status'){closeModal();return updateTrip(id,{status:b.dataset.status},true)}
  if(action==='owner-payment')return updateTrip(id,{payment_status:b.dataset.status},true);
  if(action==='owner-note'){
    const current=b.dataset.note||'';
    return modal(`<h2>Internal note</h2><p class="mini muted">Private partner-only note. Saving replaces the current internal note for this trip; it is not shown in the customer dashboard. Do not save airline passwords, one-time codes, card numbers, or inbox credentials.</p><label>What happened / next step<textarea id="ownerNoteText" placeholder="Checked AA mobile app. Same cabin. Need customer approval before action.">${escapeHtml(current)}</textarea></label><button class="btn primary" data-action="save-owner-note" data-id="${escapeHtml(id)}">Save internal note</button>`)
  }
  if(action==='save-owner-note'){const saved=await saveOwnerNote(id,$('ownerNoteText').value);if(saved)closeModal();return}
  if(action==='owner-details'){
    const owner=await requireOwner('partner-ops-dashboard.html');if(!owner)return;
    const {data:r,error}=await supabaseClient.from('trips').select('airline,route,travel_date,departure_time,paid,status').eq('id',id).single();
    if(error)return toast(error.message);
    return modal(`<h2>Verify trip details</h2><p class="mini muted">Partner-only intake cleanup after a customer submits the simple lookup form. Do not enter airline passwords, card numbers, or verification codes.</p><label>Airline<input id="detailAirline" value="${escapeHtml(r.airline||'')}" placeholder="American Airlines"></label><div class="grid two"><label>Route<input id="detailRoute" value="${escapeHtml(r.route||'')}" placeholder="DFW → LAX"></label><label>Departure date<input id="detailTravelDate" type="date" value="${escapeHtml(r.travel_date||'')}"></label></div><div class="grid two"><label>Departure time <span class="optional">optional</span><input id="detailDepartureTime" value="${escapeHtml(r.departure_time||'')}" placeholder="8:30 AM"></label><label>Customer paid <span class="optional">optional</span><input id="detailPaid" type="number" min="0" step="0.01" inputmode="decimal" value="${r.paid==null?'':escapeHtml(r.paid)}" placeholder="325.00"></label></div><div class="notice smallNotice"><b>Status:</b> Saving details moves new intake trips into Monitoring. It does not contact the customer or perform airline changes.</div><button class="btn primary" data-action="save-owner-details" data-id="${escapeHtml(id)}" data-status="${escapeHtml(r.status||'')}">Save verified details</button>`)
  }
  if(action==='save-owner-details'){const saved=await saveOwnerTripDetails(id,{airline:$('detailAirline').value,route:$('detailRoute').value,travel_date:$('detailTravelDate').value,departure_time:$('detailDepartureTime').value,paid:$('detailPaid').value,current_status:b.dataset.status});if(saved)closeModal();return}
  if(action==='owner-review')return modal(`<h2>Flag for evidence review</h2><p>Use this only when a verified lower eligible fare appears real. The fare must be below the customer-paid amount before the trip can enter review; this does not change the booking or bill the customer.</p><div class="notice smallNotice"><b>Evidence checklist:</b> Note the source, same route/date/cabin, comparable fare rules, screenshot or saved proof location, and whether customer action is required.</div><label>Observed lower fare<input id="foundPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="299.00"></label><label>Evidence / next step<textarea id="priceNote" required placeholder="Example: United app, same date/route/cabin, main cabin rules match, screenshot saved in drive, customer must approve rebook."></textarea></label><button class="btn primary" data-action="save-owner-review" data-id="${escapeHtml(id)}">Move to review queue</button>`);
  if(action==='owner-no-savings')return modal(`<h2>Record fare check</h2><p>If nothing actionable was found, this schedules the next monitoring check automatically. Add enough detail that another partner can audit what was compared.</p><label>Observed current fare <span class="optional">optional</span><input id="noSavingsPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Leave blank if not recorded"></label><label>Check note<textarea id="noSavingsNote" placeholder="Checked same airline/route/date/cabin. No lower eligible fare found."></textarea></label><button class="btn primary" data-action="save-no-savings" data-id="${escapeHtml(id)}">Save check + schedule next</button>`);
  if(action==='save-owner-review'){const evidence=$('priceNote').value.trim();if(!$('foundPrice').value)return toast('Enter the lower price found.');if(evidence.length<20)return toast('Add evidence details before moving this trip to review.');const saved=await completeMonitoringCheck(id,$('foundPrice').value,'Review needed',evidence);if(saved!==false)closeModal();return}
  if(action==='save-no-savings'){const saved=await completeMonitoringCheck(id,$('noSavingsPrice').value,'No savings',$('noSavingsNote').value.trim());if(saved!==false)closeModal();return}
});
document.addEventListener('input',e=>{if(e.target?.id==='ownerSearch')applyOwnerFilter(ownerActiveFilter)});

function navLink(href,label,extra=''){
  const current=(location.pathname.split('/').pop()||'index.html')===href;
  return `<a class="${extra}" href="${href}"${current?' aria-current="page"':''}>${label}</a>`
}
function syncPublicNav(){
  const publicPages=new Set(['home','info']);const page=document.body.dataset.page;if(!publicPages.has(page))return;const links=document.querySelector('.nav .links');if(!links)return;
  links.innerHTML=[
    navLink('how-it-works.html','How it works','hide-sm'),
    navLink('supported-airlines.html','Airlines','hide-sm'),
    navLink('trust-center.html','Trust','hide-sm'),
    navLink('faq.html','FAQ','hide-sm'),
    navLink('login.html','Log in','btn ghost'),
    navLink('add-trip.html','Start tracking','btn primary'),
    '<button class="btn ghost mobileMenuBtn" data-action="mobile-menu" aria-label="Open RouteRefund menu">Menu</button>'
  ].join('')
}

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
  if(document.body.dataset.page==='dashboard'){const user=await requireLogin('trips.html');if(!user)return;$('welcome').textContent=user.email;syncLocatorHint();$('airline')?.addEventListener('change',syncLocatorHint);$('tripForm').addEventListener('submit',addTrip);await renderTrips()}
  if(document.body.dataset.page==='account'){await renderAccount()}
  if(document.body.dataset.page==='trip-detail'){await renderTripDetail()}
  if(document.body.dataset.page==='owner'){const user=await requireOwner('partner-ops-dashboard.html');if(!user)return;$('ownerWelcome').textContent=user.email;await renderOwner()}
  if(document.body.dataset.page==='owner-trip'){await renderOwnerTrip()}
});
