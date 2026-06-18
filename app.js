const RR = window.ROUTEREFUND_CONFIG || {};
const supabaseClient = window.supabase?.createClient(RR.SUPABASE_URL, RR.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function toast(message) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}
function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
async function getUser() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getUser();
  return data?.user || null;
}
async function requireLogin() {
  const user = await getUser();
  if (!user) location.href = 'login.html?next=dashboard.html';
  return user;
}
async function logout() {
  await supabaseClient.auth.signOut();
  location.href = 'index.html';
}
async function signup(e) {
  e.preventDefault();
  const name = $('name').value.trim();
  const email = $('email').value.trim().toLowerCase();
  const password = $('password').value;
  const password2 = $('password2').value;
  if (!name || !email || !password) return toast('Fill out all fields');
  if (password.length < 8) return toast('Use at least 8 characters');
  if (password !== password2) return toast('Passwords do not match');
  const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { name } } });
  if (error) return toast(error.message);
  toast('Account created');
  setTimeout(() => location.href = 'dashboard.html', 700);
}
async function login(e) {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const password = $('password').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
  location.href = next;
}
async function addTrip(e) {
  e.preventDefault();
  const user = await requireLogin();
  const trip = {
    user_id: user.id,
    flight_no: $('flightNo').value.trim(),
    confirmation_no: $('confirmationNo').value.trim().toUpperCase(),
    route: $('route').value.trim(),
    travel_date: $('travelDate').value,
    paid: Number($('paid').value),
    booking_source: $('bookingSource').value.trim(),
    notes: $('notes').value.trim(),
    status: 'Monitoring'
  };
  const { error } = await supabaseClient.from('trips').insert(trip);
  if (error) return toast(error.message);
  e.target.reset();
  toast('Flight saved');
  await renderTrips();
}
async function loadTrips() {
  const { data, error } = await supabaseClient.from('trips').select('*').order('created_at', { ascending: false });
  if (error) { toast(error.message); return []; }
  return data || [];
}
async function renderTrips() {
  const box = $('trips');
  if (!box) return;
  const rows = await loadTrips();
  box.innerHTML = rows.length ? rows.map(r => `<div class="trip"><div class="row"><div><h3>${escapeHtml(r.flight_no)} • ${escapeHtml(r.route)}</h3><p>${escapeHtml(r.travel_date || '')} • Paid ${money(r.paid)} • ${escapeHtml(r.booking_source || 'Booking source not listed')} • Conf. ${escapeHtml(r.confirmation_no || '')}</p></div><span class="tag">${escapeHtml(r.status || 'Monitoring')}</span></div>${r.current_price ? `<p><b>Potential savings:</b> ${money(Number(r.paid)-Number(r.current_price))} • New price ${money(r.current_price)}</p>` : '<p>No price drop found yet. RouteRefund is watching this trip.</p>'}${r.notes ? `<p><b>Your note:</b> ${escapeHtml(r.notes)}</p>` : ''}<div class="actions"><button class="btn ghost" data-action="note" data-id="${r.id}">Add note</button><button class="btn danger" data-action="remove" data-id="${r.id}">Remove</button></div></div>`).join('') : `<div class="empty"><h3>No trips yet</h3><p>Add your first booked flight above.</p></div>`;
}
function modal(html) {
  let m = $('modal');
  if (!m) return;
  $('modalCard').innerHTML = html;
  m.classList.add('open');
}
async function updateTrip(id, patch) {
  const { error } = await supabaseClient.from('trips').update(patch).eq('id', id);
  if (error) return toast(error.message);
  await renderTrips();
}
async function removeTrip(id) {
  const { error } = await supabaseClient.from('trips').delete().eq('id', id);
  if (error) return toast(error.message);
  toast('Removed');
  await renderTrips();
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-action]');
  if (!b) return;
  const action = b.dataset.action, id = b.dataset.id;
  if (action === 'logout') return logout();
  if (action === 'remove') return removeTrip(id);
  if (action === 'note') return modal(`<h2>Add note</h2><div class="field"><textarea id="noteText" placeholder="Example: I prefer credit if cash refund is not possible."></textarea></div><button class="btn primary" data-action="save-note" data-id="${id}">Save note</button>`);
  if (action === 'save-note') {
    await updateTrip(id, { notes: $('noteText').value.trim() });
    $('modal').classList.remove('open');
    return toast('Note saved');
  }
});
window.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) return toast('Missing Supabase config');
  if ($('modal')) $('modal').addEventListener('click', e => { if (e.target.id === 'modal') $('modal').classList.remove('open'); });
  if (document.body.dataset.page === 'signup') $('signupForm').addEventListener('submit', signup);
  if (document.body.dataset.page === 'login') $('loginForm').addEventListener('submit', login);
  if (document.body.dataset.page === 'dashboard') {
    const user = await requireLogin();
    $('welcome').textContent = `Logged in as ${user.email}`;
    $('tripForm').addEventListener('submit', addTrip);
    await renderTrips();
  }
});
