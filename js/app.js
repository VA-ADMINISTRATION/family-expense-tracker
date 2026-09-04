/* ============================= STATE ============================= */
let session = null;       // Supabase auth session (null = signed out)
let authMode = 'login';   // 'login' | 'signup' | 'forgot' | 'reset'
let identities = [];      // [{familyCode, userName, familyName, color}] — families the signed-in user belongs to
let activeCode = null;    // currently active family code
let family = null;        // active family row
let members = [];         // active family's members
let categories = [];      // active family's categories (expense + income, from DB)
let expenses = [];        // active family's expenses
let incomes = [];         // active family's income entries
let currentTab = 'home';
let axState = {};
let historyFilter = { user:'all', category:'all', payment:'all', range:'all', q:'' };
let historyMode = 'expense'; // 'expense' | 'income'
let reportRange = 'this';
let reportMode = 'spending'; // 'spending' | 'balances'

function fmt(n){ return '₹' + Math.round(n).toLocaleString('en-IN'); }
function toLocalISO(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayISO(){ return toLocalISO(new Date()); }
function nowTime(){ return new Date().toTimeString().slice(0,5); }
function expenseCats(){ return categories.filter(c=>c.type!=='income'); }
function incomeCats(){ return categories.filter(c=>c.type==='income'); }
function catInfo(id, type){
  const pool = type==='income' ? incomeCats() : expenseCats();
  return pool.find(c=>c.cat_id===id) || pool[pool.length-1] || {cat_id:id, name:id, icon:'📦', color:'#5B6B5F', tint:'#E7E9E6'};
}
function memberColor(name){ const m = members.find(m=>m.name===name); return m ? m.color : '#5B6B5F'; }
function currentIdentity(){ return identities.find(i=>i.familyCode===activeCode); }
function showToast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1800); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ============================= DEVICE STORAGE (remembers last-viewed family only) ============================= */
function loadActiveCode(){ return localStorage.getItem('ledger_active') || null; }
function saveActiveCode(){ localStorage.setItem('ledger_active', activeCode || ''); }


/* ============================= BOOT & AUTH ============================= */
async function boot(){
  if(!sb){
    document.getElementById('authScreen').innerHTML = `
      <div class="ob-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg></div>
      <h1 class="ob-title" style="font-size:24px;">Not connected yet</h1>
      <p class="ob-sub">This copy of the app doesn't have Supabase credentials filled in. Paste your Project URL and anon key into the SUPABASE_URL / SUPABASE_ANON_KEY lines near the top of the file, then reopen.</p>`;
    return;
  }
  // Reliable fallback: check the URL directly for a recovery link, in case the
  // PASSWORD_RECOVERY event fires before this listener is attached (a known
  // timing race in supabase-js). This catches it regardless of event timing.
  const hash = window.location.hash || '';
  const isRecoveryLink = hash.includes('type=recovery');
  if(hash.includes('error=')){
    const params = new URLSearchParams(hash.slice(1));
    document.getElementById('authScreen').innerHTML = `
      <h1 class="ob-title" style="font-size:24px;">Link didn't work</h1>
      <p class="ob-sub">${escapeHtml(params.get('error_description') || 'This reset link is invalid or has expired.')}</p>
      <button class="btn btn-forest" onclick="renderAuth('forgot')">Request a new link</button>`;
    return;
  }
  sb.auth.onAuthStateChange((event, sess)=>{
    session = sess;
    if(event==='PASSWORD_RECOVERY'){ authMode='reset'; renderAuth(); }
    if(event==='SIGNED_OUT'){ activeCode=null; family=null; members=[]; expenses=[]; identities=[]; authMode='login'; renderAuth(); document.getElementById('bottomNav').style.display='none'; }
  });
  if(isRecoveryLink){ authMode='reset'; renderAuth(); return; }
  const { data } = await sb.auth.getSession();
  session = data.session;
  if(session){ await afterLogin(); } else { renderAuth(); }
}
boot();

async function afterLogin(){
  try{
    identities = await dbGetMyMemberships();
  }catch(e){ identities = []; }
  if(!identities.length){ renderOnboarding(); return; }
  const saved = loadActiveCode();
  activeCode = identities.find(i=>i.familyCode===saved) ? saved : identities[0].familyCode;
  saveActiveCode();
  try{
    await refreshFamilyData();
    document.getElementById('bottomNav').style.display = 'flex';
    goTab('home');
  }catch(e){ renderOnboarding(); }
}

function renderAuth(mode){
  if(mode) authMode = mode;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('authScreen').classList.add('active');
  document.getElementById('bottomNav').style.display = 'none';
  const el = document.getElementById('authScreen');

  if(authMode==='login'){
    el.innerHTML = `
      <div class="ob-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
      <h1 class="ob-title">Welcome back</h1>
      <p class="ob-sub">Log in to see your families and expenses.</p>
      <div class="ob-form">
        <div class="field"><label>Email</label><input id="authEmail" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input id="authPassword" type="password" placeholder="••••••••"></div>
        <div class="err" id="authErr"></div>
        <button class="btn btn-forest" onclick="handleLogin()">Log in</button>
        <div class="auth-link" onclick="renderAuth('forgot')">Forgot password?</div>
      </div>
      <div class="auth-switch">New here? <a onclick="renderAuth('signup')">Create an account</a></div>`;
    return;
  }
  if(authMode==='signup'){
    el.innerHTML = `
      <div class="back-link" onclick="renderAuth('login')">‹ Back</div>
      <h1 class="ob-title" style="font-size:26px;">Create your account</h1>
      <p class="ob-sub">You'll confirm this email before you can log in.</p>
      <div class="ob-form">
        <div class="field"><label>Email</label><input id="authEmail2" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input id="authPassword2" type="password" placeholder="At least 6 characters"></div>
        <div class="err" id="authErr2"></div>
        <button class="btn btn-forest" onclick="handleSignup()">Sign up</button>
      </div>`;
    return;
  }
  if(authMode==='forgot'){
    el.innerHTML = `
      <div class="back-link" onclick="renderAuth('login')">‹ Back</div>
      <h1 class="ob-title" style="font-size:26px;">Reset your password</h1>
      <p class="ob-sub">We'll email you a link to set a new one.</p>
      <div class="ob-form">
        <div class="field"><label>Email</label><input id="authEmail3" type="email" placeholder="you@example.com"></div>
        <div class="err" id="authErr3"></div>
        <button class="btn btn-forest" onclick="handleForgotPassword()">Send reset link</button>
      </div>`;
    return;
  }
  if(authMode==='reset'){
    el.innerHTML = `
      <h1 class="ob-title" style="font-size:26px;">Set a new password</h1>
      <p class="ob-sub">Choose a new password for your account.</p>
      <div class="ob-form">
        <div class="field"><label>New password</label><input id="authNewPassword" type="password" placeholder="At least 6 characters"></div>
        <div class="err" id="authErr4"></div>
        <button class="btn btn-forest" onclick="handleResetPassword()">Save new password</button>
      </div>`;
    return;
  }
}

async function handleLogin(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authErr');
  if(!email || !password){ errEl.textContent = 'Enter your email and password.'; return; }
  errEl.textContent = 'Logging in…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ errEl.textContent = error.message; return; }
  session = data.session;
  await afterLogin();
}
async function handleSignup(){
  const email = document.getElementById('authEmail2').value.trim();
  const password = document.getElementById('authPassword2').value;
  const errEl = document.getElementById('authErr2');
  if(!email || !password){ errEl.textContent = 'Enter an email and password.'; return; }
  if(password.length<6){ errEl.textContent = 'Password should be at least 6 characters.'; return; }
  errEl.textContent = 'Creating account…';
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error){ errEl.textContent = error.message; return; }
  if(data.session){ session = data.session; await afterLogin(); }
  else { errEl.textContent = ''; el_showConfirmMessage(); }
}
function el_showConfirmMessage(){
  const el = document.getElementById('authScreen');
  el.innerHTML = `
    <div class="ob-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 6l8 6 8-6"/></svg></div>
    <h1 class="ob-title" style="font-size:24px;">Check your email</h1>
    <p class="ob-sub">We sent a confirmation link. Tap it, then come back and log in.</p>
    <button class="btn btn-forest" onclick="renderAuth('login')">Back to login</button>`;
}
async function handleForgotPassword(){
  const email = document.getElementById('authEmail3').value.trim();
  const errEl = document.getElementById('authErr3');
  if(!email){ errEl.textContent = 'Enter your email.'; return; }
  errEl.textContent = 'Sending…';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split('#')[0] });
  if(error){ errEl.textContent = error.message; return; }
  errEl.textContent = '';
  const el = document.getElementById('authScreen');
  el.innerHTML = `
    <h1 class="ob-title" style="font-size:24px;">Check your email</h1>
    <p class="ob-sub">If an account exists for ${escapeHtml(email)}, a reset link is on its way.</p>
    <button class="btn btn-forest" onclick="renderAuth('login')">Back to login</button>`;
}
async function handleResetPassword(){
  const pw = document.getElementById('authNewPassword').value;
  const errEl = document.getElementById('authErr4');
  if(!pw || pw.length<6){ errEl.textContent = 'Use at least 6 characters.'; return; }
  errEl.textContent = 'Saving…';
  const { error } = await sb.auth.updateUser({ password: pw });
  if(error){ errEl.textContent = error.message; return; }
  showToast('Password updated ✓');
  await afterLogin();
}
async function handleSignOut(){
  await sb.auth.signOut();
}

/* ============================= ONBOARDING (choose/create a family, once logged in) ============================= */
function renderOnboarding(mode){
  const el = document.getElementById('onboarding');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('bottomNav').style.display = 'none';

  if(!mode){
    el.innerHTML = `
      <div class="ob-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
      <h1 class="ob-title">Ledger, kept together.</h1>
      <p class="ob-sub">One shared place for both of you to log spending — no spreadsheet required.</p>
      <div class="ob-choice">
        <button class="ob-btn primary" onclick="renderOnboarding('join')"><b>Join with a code</b><span>Someone already started one — enter their code</span></button>
      </div>
      <div class="auth-switch">Setting one up for the first time? <a onclick="renderOnboarding('create')">Start a new family</a></div>
      ${identities.length ? `<div class="auth-switch">Already part of a family? <a onclick="openSwitchFamily()">Switch family</a></div>` : ''}
      <div class="auth-switch" onclick="handleSignOut()"><a>Sign out</a></div>`;
    return;
  }
  if(mode==='create'){
    el.innerHTML = `
      <div class="back-link" onclick="renderOnboarding()">‹ Back</div>
      <h1 class="ob-title" style="font-size:26px;">Name your family</h1>
      <p class="ob-sub">This is what you'll see at the top of the app.</p>
      <div class="ob-form">
        <div class="field"><label>Family name</label><input id="obFamName" placeholder="e.g. The Sharmas"></div>
        <div class="field"><label>Your display name</label><input id="obYourName" placeholder="e.g. Raj"></div>
        <div class="err" id="obErr"></div>
        <button class="btn btn-forest" onclick="createFamily()">Create family</button>
      </div>`;
    return;
  }
  if(mode==='join'){
    el.innerHTML = `
      <div class="back-link" onclick="renderOnboarding()">‹ Back</div>
      <h1 class="ob-title" style="font-size:26px;">Join a family</h1>
      <p class="ob-sub">Enter the 6-digit code that was shared with you.</p>
      <div class="ob-form">
        <div class="field"><label>Family code</label><input id="obCode" class="code-input" maxlength="6" placeholder="000000" inputmode="numeric"></div>
        <div class="field"><label>Your display name</label><input id="obYourName2" placeholder="e.g. Priya"></div>
        <div class="err" id="obErr2"></div>
        <button class="btn btn-forest" onclick="joinFamily()">Join family</button>
      </div>`;
    return;
  }
}

async function createFamily(){
  const famName = document.getElementById('obFamName').value.trim();
  const yourName = document.getElementById('obYourName').value.trim();
  const errEl = document.getElementById('obErr');
  if(!famName || !yourName){ errEl.textContent = 'Please fill in both fields.'; return; }
  const sure = confirm(`Create a brand-new family called "${famName}"?\n\nOnly do this if you don't already have a code to join. If someone already set one up, go back and use "Join with a code" instead.`);
  if(!sure) return;
  errEl.textContent = 'Creating…';
  try{
    const code = String(Math.floor(100000 + Math.random()*900000));
    await dbCreateFamily({ code, name:famName, budget_monthly:0, budget_categories:{} });
    await dbAddMember({ family_code:code, name:yourName, color:MEMBER_COLORS[0] });
    await dbSeedCategories(code);
    activeCode = code; saveActiveCode();
    identities = await dbGetMyMemberships();
    await refreshFamilyData();
    document.getElementById('bottomNav').style.display = 'flex';
    goTab('home');
    showToast('Family created ✓ Code: ' + code);
  }catch(e){ errEl.textContent = 'Something went wrong. Check your Supabase setup.'; }
}

async function joinFamily(){
  const code = document.getElementById('obCode').value.trim();
  const yourName = document.getElementById('obYourName2').value.trim();
  const errEl = document.getElementById('obErr2');
  if(!/^\d{6}$/.test(code)){ errEl.textContent = 'Enter the 6-digit code.'; return; }
  if(!yourName){ errEl.textContent = 'Please enter your name.'; return; }
  errEl.textContent = 'Checking code…';
  try{
    const fam = await dbLookupFamilyByCode(code);
    if(!fam){ errEl.textContent = 'No family found with that code.'; return; }
    const randomColor = MEMBER_COLORS[Math.floor(Math.random()*MEMBER_COLORS.length)];
    try{
      await dbAddMember({ family_code:code, name:yourName, color:randomColor });
    }catch(memberErr){
      // Unique violation = already a member of this family — fine, just continue.
      if(!String(memberErr.message||'').toLowerCase().includes('duplicate')) throw memberErr;
    }
    activeCode = code; saveActiveCode();
    identities = await dbGetMyMemberships();
    await refreshFamilyData();
    document.getElementById('bottomNav').style.display = 'flex';
    goTab('home');
    showToast('Welcome, ' + yourName + ' ✓');
  }catch(e){ errEl.textContent = 'Something went wrong. Check your Supabase setup.'; }
}

/* ============================= SWITCH FAMILY ============================= */
function openSwitchFamily(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('switchFamily').classList.add('active');
  renderSwitchFamily();
}
function renderSwitchFamily(){
  const rows = identities.map(idn=>`
    <div class="fam-switch-row" onclick="switchToFamily('${idn.familyCode}')">
      <div class="fam-switch-left">
        <div class="avatar" style="background:${idn.familyCode===activeCode ? '#2F6F4E' : '#5B6B5F'}; width:34px;height:34px;font-size:12px;">${idn.userName[0].toUpperCase()}</div>
        <div><b>${idn.familyName}</b><span>as ${idn.userName} · code ${idn.familyCode}</span></div>
      </div>
      ${idn.familyCode===activeCode ? '<span class="check-mark">✓</span>' : ''}
    </div>`).join('');

  document.getElementById('switchFamily').innerHTML = `
    <div class="ax-head">
      <p class="ax-title">Switch family</p>
      <div class="close-x" onclick="family ? goTab('settings') : renderOnboarding()">✕</div>
    </div>
    <div class="set-card" style="margin-top:16px;">${rows}</div>
    <div class="ob-choice">
      <button class="ob-btn" onclick="renderOnboarding('join')"><b>Join another family</b><span>Enter a different family's code</span></button>
      <button class="ob-btn" onclick="renderOnboarding('create')"><b>Start another family</b><span>Create a brand new family group</span></button>
    </div>
  `;
}
async function switchToFamily(code){
  activeCode = code;
  saveActiveCode();
  await refreshFamilyData();
  goTab('home');
}

/* ============================= NAV ============================= */
document.getElementById('bottomNav').addEventListener('click', (e)=>{
  const navItem = e.target.closest('[data-nav]');
  if(navItem){ goTab(navItem.dataset.nav); return; }
  if(e.target.closest('#navAddBtn')){ openAddExpense(); }
});

function goTab(tab){
  currentTab = tab;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navBtn = document.querySelector(`[data-nav="${tab}"]`);
  if(navBtn) navBtn.classList.add('active');
  document.getElementById(tab).classList.add('active');
  if(tab==='home') renderHome();
  if(tab==='history') renderHistory();
  if(tab==='reports') renderReports();
  if(tab==='settings') renderSettings();
}

/* ============================= HOME ============================= */
function greetingWord(){ const h = new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
function isToday(dateStr){ return dateStr === todayISO(); }
function parseLocalDate(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d);
}
function isThisMonth(dateStr){ const d=parseLocalDate(dateStr), n=new Date(); return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth(); }
function sumBy(list, pred){ return list.filter(pred).reduce((s,e)=>s+e.amount,0); }

function renderHome(){
  const me = currentIdentity();
  const todaySpend = sumBy(expenses, e=>isToday(e.date));
  const monthExpenses = expenses.filter(e=>isThisMonth(e.date));
  const monthSpend = monthExpenses.reduce((s,e)=>s+e.amount,0);
  const monthIncomeTotal = incomes.filter(i=>isThisMonth(i.date)).reduce((s,i)=>s+i.amount,0);
  const net = monthIncomeTotal - monthSpend;
  const mine = sumBy(monthExpenses, e=>e.user===me.userName);
  const others = members.filter(m=>m.name!==me.userName);

  let splitHtml = `<div class="split-card"><div class="who"><span class="dot" style="background:${memberColor(me.userName)}"></span><span>You</span></div><div class="val">${fmt(mine)}</div></div>`;
  others.forEach(m=>{
    const v = sumBy(monthExpenses, e=>e.user===m.name);
    splitHtml += `<div class="split-card"><div class="who"><span class="dot" style="background:${m.color}"></span><span>${m.name}</span></div><div class="val">${fmt(v)}</div></div>`;
  });

  const budget = family.budget_monthly || 0;
  const pct = budget>0 ? Math.min(100, Math.round(monthSpend/budget*100)) : 0;
  const barClass = pct>=100?'over':(pct>=80?'warn':'');
  const budgetBlock = budget>0 ? `
    <div class="budget-card">
      <div class="budget-top"><span>Monthly budget</span><b>${fmt(monthSpend)} / ${fmt(budget)}</b></div>
      <div class="bar-track"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div>
      <div class="budget-sub">${budget-monthSpend>=0 ? fmt(budget-monthSpend)+' left this month' : fmt(monthSpend-budget)+' over budget'}</div>
    </div>` : `
    <div class="budget-card" style="text-align:center; cursor:pointer;" onclick="goBudget()">
      <div style="font-size:14px; color:var(--ink-soft);">No monthly budget set yet</div>
      <div style="font-size:13px; color:var(--forest); font-weight:600; margin-top:6px;">Set a budget →</div>
    </div>`;

  const catTotals = {};
  monthExpenses.forEach(e=>{ catTotals[e.category] = (catTotals[e.category]||0) + e.amount; });
  const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const maxCat = catEntries.length ? catEntries[0][1] : 1;
  const catHtml = catEntries.length ? catEntries.map(([cid, val])=>{
    const c = catInfo(cid); const w = Math.round(val/maxCat*100);
    return `<div class="cat-mini"><div class="ic" style="background:${c.tint}">${c.icon}</div><div class="cm-body"><div class="cm-top"><span>${c.name}</span><b>${fmt(val)}</b></div><div class="cm-track"><div class="cm-fill" style="width:${w}%; background:${c.color}"></div></div></div></div>`;
  }).join('') : `<div class="empty-note">No expenses yet this month.</div>`;

  const recent = [...expenses].sort((a,b)=> (b.date+b.time).localeCompare(a.date+a.time)).slice(0,5);
  const recentHtml = recent.length ? recent.map(txRowHtml).join('') : `<div class="empty-note">No transactions yet. Tap + to add one.</div>`;

  document.getElementById('home').innerHTML = `
    <div class="topbar">
      <div>
        <p class="greeting" onclick="openSwitchFamily()">${greetingWord()} 👋 ${identities.length>1 ? '· switch ⌄' : ''}</p>
        <h1 class="family-name">${family.name}</h1>
      </div>
      <div class="avatar" style="background:${memberColor(me.userName)}">${me.userName[0].toUpperCase()}</div>
    </div>
    <div class="hero">
      <p class="hero-label">Today's spending</p>
      <p class="hero-amt amt">${fmt(todaySpend)}</p>
      <div class="hero-row" style="gap:16px;">
        <div class="hero-stat"><b>${fmt(monthSpend)}</b><span>Spent</span></div>
        <div class="hero-stat"><b>${fmt(monthIncomeTotal)}</b><span>Income</span></div>
        <div class="hero-stat"><b>${net>=0?'+':'−'}${fmt(Math.abs(net))}</b><span>Net</span></div>
      </div>
    </div>
    <div class="split-row">${splitHtml}</div>
    ${budgetBlock}
    <div class="section-head"><h3>Spending by category</h3><a onclick="goTab('reports')">See all</a></div>
    ${catHtml}
    <div class="section-head"><h3>Recent transactions</h3><a onclick="goTab('history')">See all</a></div>
    ${recentHtml}
  `;
}

function txRowHtml(e){
  const c = catInfo(e.category);
  const splitBadge = (e.splitType && e.splitType!=='none') ? ' · split 💸' : '';
  return `<div class="tx-row" onclick="openAddExpense('${e.id}')">
    <div class="tx-ic" style="background:${c.tint}">${c.icon}</div>
    <div class="tx-body"><p class="tx-cat">${c.name}${e.note ? ' · '+escapeHtml(e.note) : ''}</p><p class="tx-meta">${e.user} · ${e.paymentMethod}${splitBadge}</p></div>
    <div class="tx-amt">${fmt(e.amount)}</div>
  </div>`;
}

function goBudget(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('budgetScreen').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  renderBudgetScreen();
}

/* ============================= ADD EXPENSE ============================= */
function openAddExpense(editId){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('addExpense').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const me = currentIdentity();

  if(editId){
    const e = expenses.find(x=>x.id===editId);
    const splitOn = e.splitType && e.splitType!=='none';
    axState = { entryType:'expense', amount:String(e.amount), category:e.category, payment:e.paymentMethod, date:e.date, note:e.note||'', paidBy:e.user, editingId:editId,
      splitOn, splitType: splitOn?e.splitType:'equal',
      splitSelected: splitOn ? e.splitAmong.map(s=>s.name) : members.map(m=>m.name),
      splitValues: splitOn ? Object.fromEntries(e.splitAmong.map(s=>[s.name, s.rawInput!==undefined?s.rawInput:s.amount])) : {} };
  } else {
    const last = [...expenses].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
    axState = { entryType:'expense', amount:'', category: last?last.category:null, payment: last?last.paymentMethod:null, date: todayISO(), note:'', paidBy: me.userName, editingId:null,
      splitOn:false, splitType:'equal', splitSelected: members.map(m=>m.name), splitValues:{} };
  }
  renderAddExpense();
}
function openAddIncome(editId){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('addExpense').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const me = currentIdentity();

  if(editId){
    const i = incomes.find(x=>x.id===editId);
    axState = { entryType:'income', amount:String(i.amount), category:i.source, payment:null, date:i.date, note:i.note||'', paidBy:i.user, editingId:editId, splitOn:false };
  } else {
    axState = { entryType:'income', amount:'', category:null, payment:null, date: todayISO(), note:'', paidBy: me.userName, editingId:null, splitOn:false };
  }
  renderAddExpense();
}
function setEntryType(type){
  if(axState.entryType===type) return;
  axState.entryType = type;
  axState.category = null;
  if(type==='income'){ axState.splitOn = false; }
  renderAddExpense();
}

function renderAddExpense(){
  const me = currentIdentity();
  const isIncome = axState.entryType==='income';
  const catPool = isIncome ? incomeCats() : expenseCats();
  const catCells = catPool.map(c=>`<div class="cat-cell ${axState.category===c.cat_id?'sel':''}" onclick="axState.category='${c.cat_id}'; renderAddExpense();"><span class="cic">${c.icon}</span><span>${c.name}</span></div>`).join('');
  const payChips = PAYMENT_METHODS.map(p=>`<div class="chip ${axState.payment===p?'sel':''}" onclick="axState.payment='${p}'; renderAddExpense();">${p}</div>`).join('');
  const whoLabel = isIncome ? 'Received by' : 'Paid by';
  const whoChips = members.map(m=>`<div class="who-chip ${axState.paidBy===m.name?'sel':''}" onclick="axState.paidBy='${m.name}'; renderAddExpense();"><span style="width:9px;height:9px;border-radius:50%;background:${m.color};display:inline-block;"></span><span>${m.name}${m.name===me.userName?' (you)':''}</span></div>`).join('');

  document.getElementById('addExpense').innerHTML = `
    <div class="ax-head"><p class="ax-title">${axState.editingId? (isIncome?'Edit income':'Edit expense') : 'Add entry'}</p><div class="close-x" onclick="goTab('home')">✕</div></div>
    ${!axState.editingId ? `
    <div class="tab-row">
      <div class="tab-btn ${!isIncome?'sel':''}" onclick="setEntryType('expense')">💸 Expense</div>
      <div class="tab-btn ${isIncome?'sel':''}" onclick="setEntryType('income')">💰 Income</div>
    </div>` : ''}
    <div class="amount-wrap"><span class="cur">₹</span><input id="axAmount" inputmode="decimal" placeholder="0" value="${axState.amount}" oninput="axState.amount=this.value.replace(/[^0-9.]/g,'')"></div>
    <div class="field-label">${isIncome?'Source':'Category'}</div>
    <div class="cat-grid">${catCells}</div>
    ${!isIncome ? `<div class="field-label">Payment method</div><div class="chip-row">${payChips}</div>` : ''}
    <div class="field-label">Date</div><input type="date" class="plain-input" id="axDate" value="${axState.date}" onchange="axState.date=this.value">
    <div class="field-label">Note (optional)</div><input class="plain-input" id="axNote" placeholder="${isIncome?'e.g. Diwali bonus':'e.g. Dinner at restaurant'}" value="${escapeHtml(axState.note)}" oninput="axState.note=this.value">
    <div class="field-label">${whoLabel}</div><div class="who-row">${whoChips}</div>

    ${!isIncome ? `
    <div class="split-toggle" onclick="toggleSplit()">
      <div class="st-left"><span>💸</span><span>Split this expense</span></div>
      <div class="switch ${axState.splitOn?'on':''}"></div>
    </div>
    ${axState.splitOn ? renderSplitPanel() : ''}` : ''}

    <div class="save-bar">
      <button class="btn btn-forest" style="width:100%;" onclick="saveExpense()">${axState.editingId? 'Save changes':(isIncome?'+ Add income':'+ Add expense')}</button>
      ${axState.editingId? `<button class="btn btn-ghost" style="width:100%; margin-top:8px; color:var(--danger);" onclick="deleteEntry('${axState.editingId}')">${isIncome?'Delete income':'Delete expense'}</button>`:''}
    </div>`;
}

function toggleSplit(){ axState.splitOn = !axState.splitOn; renderAddExpense(); }
function setSplitType(t){ axState.splitType = t; renderAddExpense(); }
function toggleSplitMember(name){
  const i = axState.splitSelected.indexOf(name);
  if(i>=0) axState.splitSelected.splice(i,1); else axState.splitSelected.push(name);
  renderAddExpense();
}
function setSplitValue(name, val){ axState.splitValues[name] = val; renderAddExpense(); }

// Returns { rows: [{name, amount}], valid, message } based on current split type/values
function computeSplit(){
  const amt = parseFloat(axState.amount) || 0;
  const sel = axState.splitSelected;
  if(sel.length===0) return { rows:[], valid:false, message:'Pick at least one person.' };

  if(axState.splitType==='equal'){
    const base = Math.floor((amt/sel.length)*100)/100;
    const rows = sel.map((name,i)=>({ name, amount: i===0 ? Math.round((amt - base*(sel.length-1))*100)/100 : base }));
    return { rows, valid:true, message:`₹${base.toFixed(2)} each` };
  }
  if(axState.splitType==='unequal'){
    const rows = sel.map(name=>({ name, amount: parseFloat(axState.splitValues[name])||0, rawInput: axState.splitValues[name]||'' }));
    const sum = rows.reduce((s,r)=>s+r.amount,0);
    const diff = Math.round((amt-sum)*100)/100;
    return { rows, valid: Math.abs(diff)<0.01, message: Math.abs(diff)<0.01 ? 'Splits match the total ✓' : (diff>0 ? `₹${diff.toFixed(2)} left to assign` : `₹${Math.abs(diff).toFixed(2)} over the total`) };
  }
  if(axState.splitType==='percentage'){
    const pcts = sel.map(name=>({ name, pct: parseFloat(axState.splitValues[name])||0 }));
    const sumPct = pcts.reduce((s,p)=>s+p.pct,0);
    const rows = pcts.map(p=>({ name:p.name, amount: Math.round(amt*p.pct/100*100)/100, rawInput: axState.splitValues[p.name]||'' }));
    return { rows, valid: Math.abs(sumPct-100)<0.5, message: Math.abs(sumPct-100)<0.5 ? 'Percentages add up to 100% ✓' : `${sumPct}% assigned — needs to total 100%` };
  }
  if(axState.splitType==='shares'){
    const shares = sel.map(name=>({ name, share: parseFloat(axState.splitValues[name])||0 }));
    const totalShares = shares.reduce((s,p)=>s+p.share,0);
    if(totalShares<=0) return { rows: sel.map(name=>({name,amount:0})), valid:false, message:'Enter at least one share.' };
    const rows = shares.map(p=>({ name:p.name, amount: Math.round(amt*p.share/totalShares*100)/100, rawInput: axState.splitValues[p.name]||'' }));
    return { rows, valid:true, message:`${totalShares} total shares` };
  }
  return { rows:[], valid:false, message:'' };
}

function renderSplitPanel(){
  const methods = [['equal','Equally'],['unequal','Unequally'],['percentage','Percentage'],['shares','Shares']];
  const methodChips = methods.map(([k,l])=>`<div class="method-chip ${axState.splitType===k?'sel':''}" onclick="setSplitType('${k}')">${l}</div>`).join('');
  const result = computeSplit();

  const memberRows = members.map(m=>{
    const checked = axState.splitSelected.includes(m.name);
    const row = result.rows.find(r=>r.name===m.name);
    let inputHtml = '';
    if(checked && axState.splitType==='unequal'){
      inputHtml = `<input class="split-mem-input" inputmode="decimal" placeholder="0" value="${axState.splitValues[m.name]||''}" onchange="setSplitValue('${m.name}', this.value)">`;
    } else if(checked && axState.splitType==='percentage'){
      inputHtml = `<input class="split-mem-input" inputmode="decimal" placeholder="%" value="${axState.splitValues[m.name]||''}" onchange="setSplitValue('${m.name}', this.value)">`;
    } else if(checked && axState.splitType==='shares'){
      inputHtml = `<input class="split-mem-input" inputmode="decimal" placeholder="shares" value="${axState.splitValues[m.name]||''}" onchange="setSplitValue('${m.name}', this.value)">`;
    } else if(checked){
      inputHtml = `<span class="split-mem-amt">${row ? fmt(row.amount) : ''}</span>`;
    }
    return `<div class="split-mem-row">
      <div class="split-check ${checked?'on':''}" onclick="toggleSplitMember('${m.name}')">${checked?'✓':''}</div>
      <div class="split-mem-name">${m.name}</div>
      ${inputHtml}
    </div>`;
  }).join('');

  return `<div class="split-panel">
    <div class="method-row">${methodChips}</div>
    ${memberRows}
    <div class="split-total-check ${result.valid?'':'bad'}">${result.message}</div>
  </div>`;
}

async function saveExpense(){
  const amt = parseFloat(axState.amount);
  if(!amt || amt<=0){ showToast('Enter an amount'); return; }
  if(!axState.category){ showToast(axState.entryType==='income' ? 'Pick a source' : 'Pick a category'); return; }
  if(!axState.paidBy){ axState.paidBy = currentIdentity().userName; }

  if(axState.entryType==='income'){
    try{
      if(axState.editingId){
        await dbUpdateIncome({ id:axState.editingId, user:axState.paidBy, date:axState.date, source:axState.category, amount:amt, note:axState.note });
      } else {
        await dbAddIncome({ id:'i'+Date.now()+Math.floor(Math.random()*1000), user:axState.paidBy, date:axState.date, time:nowTime(), source:axState.category, amount:amt, note:axState.note });
      }
      await refreshFamilyData();
      goTab('home');
      showToast('Income added ✓');
    }catch(e){ showToast('Could not save — check connection'); }
    return;
  }

  if(!axState.payment){ showToast('Pick a payment method'); return; }
  let splitType = 'none', splitAmong = null;
  if(axState.splitOn){
    const result = computeSplit();
    if(!result.valid){ showToast(result.message || 'Fix the split before saving'); return; }
    splitType = axState.splitType;
    splitAmong = result.rows.map(r=>({ name:r.name, amount:r.amount, rawInput: r.rawInput }));
  }

  try{
    if(axState.editingId){
      const e = { id:axState.editingId, user:axState.paidBy, date:axState.date, category:axState.category, amount:amt, paymentMethod:axState.payment, note:axState.note, splitType, splitAmong };
      await dbUpdateExpense(e);
    } else {
      const e = { id:'x'+Date.now()+Math.floor(Math.random()*1000), user:axState.paidBy, date:axState.date, time:nowTime(), category:axState.category, amount:amt, paymentMethod:axState.payment, note:axState.note, splitType, splitAmong };
      await dbAddExpense(e);
    }
    await refreshFamilyData();
    goTab('home');
    showToast('Expense added successfully ✓');
  }catch(e){ showToast('Could not save — check connection'); }
}
async function deleteEntry(id){
  try{
    if(axState.entryType==='income'){ await dbDeleteIncome(id); showToast('Income deleted'); }
    else { await dbDeleteExpense(id); showToast('Expense deleted'); }
    await refreshFamilyData();
    goTab('history');
  }catch(e){ showToast('Could not delete'); }
}
function duplicateExpense(id){
  const e = expenses.find(x=>x.id===id); if(!e) return;
  axState = { entryType:'expense', amount:String(e.amount), category:e.category, payment:e.paymentMethod, date:todayISO(), note:e.note, paidBy:e.user, editingId:null, splitOn:false, splitType:'equal', splitSelected: members.map(m=>m.name), splitValues:{} };
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('addExpense').classList.add('active');
  renderAddExpense();
}

/* ============================= HISTORY ============================= */
function renderHistory(){
  const isIncome = historyMode==='income';
  let list = [...(isIncome ? incomes : expenses)];
  if(historyFilter.user!=='all') list = list.filter(e=>e.user===historyFilter.user);
  if(!isIncome && historyFilter.category!=='all') list = list.filter(e=>e.category===historyFilter.category);
  if(isIncome && historyFilter.category!=='all') list = list.filter(e=>e.source===historyFilter.category);
  if(!isIncome && historyFilter.payment!=='all') list = list.filter(e=>e.paymentMethod===historyFilter.payment);
  if(historyFilter.q) list = list.filter(e=> (e.note||'').toLowerCase().includes(historyFilter.q.toLowerCase()) || catInfo(isIncome?e.source:e.category, isIncome?'income':'expense').name.toLowerCase().includes(historyFilter.q.toLowerCase()));
  if(historyFilter.range==='today') list = list.filter(e=>isToday(e.date));
  if(historyFilter.range==='month') list = list.filter(e=>isThisMonth(e.date));
  list.sort((a,b)=> (b.date+b.time).localeCompare(a.date+a.time));

  const periodTotal = list.reduce((s,e)=>s+e.amount,0);

  const groups = {};
  list.forEach(e=>{ (groups[e.date] = groups[e.date]||[]).push(e); });
  const dateKeys = Object.keys(groups).sort().reverse();
  const groupsHtml = dateKeys.length ? dateKeys.map(date=>{
    const items = groups[date]; const total = items.reduce((s,e)=>s+e.amount,0);
    const d = parseLocalDate(date);
    const label = isToday(date) ? 'Today' : d.toLocaleDateString('en-IN',{weekday:'short', day:'2-digit', month:'short'});
    const rows = items.map(e=>{
      const c = isIncome ? catInfo(e.source,'income') : catInfo(e.category);
      const openFn = isIncome ? `openAddIncome('${e.id}')` : `openAddExpense('${e.id}')`;
      const metaLine = isIncome ? `${e.user}` : `${e.user} · ${e.paymentMethod}`;
      return `<div class="tx-row">
        <div class="tx-ic" style="background:${c.tint}">${c.icon}</div>
        <div class="tx-body" onclick="${openFn}">
          <p class="tx-cat">${c.name}${e.note?' · '+escapeHtml(e.note):''}</p>
          <p class="tx-meta"><span class="user-dot" style="background:${memberColor(e.user)}"></span>${metaLine}</p>
        </div>
        <div style="text-align:right;">
          <div class="tx-amt" style="${isIncome?'color:var(--forest);':''}">${isIncome?'+':''}${fmt(e.amount)}</div>
          <div class="tx-actions">${!isIncome?`<button onclick="duplicateExpense('${e.id}')">Copy</button>`:''}<button onclick="${openFn}">Edit</button></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="day-group"><div class="day-head"><span>${label}</span><span class="dh-total">${fmt(total)}</span></div><div class="day-card">${rows}</div></div>`;
  }).join('') : `<div class="empty-note">No ${isIncome?'income':'expenses'} match your filters.<br>Try widening your search or filters.</div>`;

  const catPool = isIncome ? incomeCats() : expenseCats();
  const catChips = ['all', ...catPool.map(c=>c.cat_id)].map(cid=>{
    const label = cid==='all' ? (isIncome?'All sources':'All categories') : catInfo(cid, isIncome?'income':'expense').icon+' '+catInfo(cid, isIncome?'income':'expense').name;
    return `<div class="fchip ${historyFilter.category===cid?'sel':''}" onclick="historyFilter.category='${cid}'; renderHistory();">${label}</div>`;
  }).join('');
  const userChips = ['all', ...members.map(m=>m.name)].map(u=>`<div class="fchip ${historyFilter.user===u?'sel':''}" onclick="historyFilter.user='${u}'; renderHistory();">${u==='all'?'Everyone':u}</div>`).join('');
  const rangeChips = [['all','All time'],['today','Today'],['month','This month']].map(([k,l])=>`<div class="fchip ${historyFilter.range===k?'sel':''}" onclick="historyFilter.range='${k}'; renderHistory();">${l}</div>`).join('');

  document.getElementById('history').innerHTML = `
    <h1 class="family-name" style="margin-bottom:14px;">Transactions</h1>
    <div class="tab-row">
      <div class="tab-btn ${!isIncome?'sel':''}" onclick="setHistoryMode('expense')">💸 Expenses</div>
      <div class="tab-btn ${isIncome?'sel':''}" onclick="setHistoryMode('income')">💰 Income</div>
    </div>
    <div class="period-summary" style="${isIncome?'background:var(--navy);':''}">
      <div class="ps-left"><p class="ps-label">Showing</p><p class="ps-amt">${fmt(periodTotal)}</p></div>
      <div class="ps-count"><b>${list.length}</b>${list.length===1?(isIncome?'entry':'expense'):(isIncome?'entries':'expenses')}</div>
    </div>
    <div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input placeholder="${isIncome?'Search notes or sources':'Search notes or categories'}" value="${escapeHtml(historyFilter.q)}" oninput="historyFilter.q=this.value; renderHistory();"></div>
    <div class="filter-scroll">${rangeChips}</div>
    <div class="filter-scroll">${userChips}</div>
    <div class="filter-scroll">${catChips}</div>
    <div style="margin-top:10px;">${groupsHtml}</div>`;
}
function setHistoryMode(mode){ historyMode = mode; historyFilter = { user:'all', category:'all', payment:'all', range:'all', q:'' }; renderHistory(); }

/* ============================= REPORTS ============================= */
let reportPeriodType = 'month'; // 'day' | 'week' | 'month' | 'year'
let reportOffset = 0;           // 0 = current period, -1 = previous, +1 = next

function getPeriodRange(type, offset){
  const now = new Date();
  let start, end, label;
  if(type==='day'){
    const d = new Date(now); d.setDate(d.getDate()+offset);
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end = start;
    label = offset===0 ? 'Today' : d.toLocaleDateString('en-IN',{weekday:'short', day:'2-digit', month:'short', year:'numeric'});
  } else if(type==='week'){
    const d = new Date(now); d.setDate(d.getDate() - d.getDay() + offset*7);
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end = new Date(start); end.setDate(end.getDate()+6);
    label = offset===0 ? 'This week' : `${start.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} – ${end.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}`;
  } else if(type==='year'){
    const y = now.getFullYear()+offset;
    start = new Date(y,0,1); end = new Date(y,11,31);
    label = String(y);
  } else { // month
    const d = new Date(now.getFullYear(), now.getMonth()+offset, 1);
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth()+1, 0);
    label = offset===0 ? 'This month' : d.toLocaleDateString('en-IN',{month:'long', year:'numeric'});
  }
  const toISO = toLocalISO;
  return { startISO: toISO(start), endISO: toISO(end), label };
}
function setReportPeriodType(type){ reportPeriodType = type; reportOffset = 0; renderReports(); }
function shiftReportPeriod(delta){ reportOffset += delta; renderReports(); }
function filterByRange(list, _unused){
  const { startISO, endISO } = getPeriodRange(reportPeriodType, reportOffset);
  return list.filter(e=> e.date>=startISO && e.date<=endISO);
}
function renderReports(){
  const { label } = getPeriodRange(reportPeriodType, reportOffset);
  const periodTabs = [['day','Daily'],['week','Weekly'],['month','Monthly'],['year','Yearly']].map(([k,l])=>
    `<div class="tab-btn ${reportPeriodType===k?'sel':''}" onclick="setReportPeriodType('${k}')">${l}</div>`).join('');

  const rangeChips = `
    <div class="tab-row">${periodTabs}</div>
    <div class="settle-row" style="justify-content:space-between; padding:10px 14px;">
      <button class="btn btn-ghost" style="padding:6px 10px;" onclick="shiftReportPeriod(-1)">‹</button>
      <b style="font-size:14px;">${label}</b>
      <button class="btn btn-ghost" style="padding:6px 10px;" onclick="shiftReportPeriod(1)">›</button>
    </div>
    <div class="tab-row">
      <div class="tab-btn ${reportMode==='spending'?'sel':''}" onclick="reportMode='spending'; renderReports();">📊 Spending</div>
      <div class="tab-btn ${reportMode==='balances'?'sel':''}" onclick="reportMode='balances'; renderReports();">💸 Balances</div>
    </div>`;

  document.getElementById('reports').innerHTML = `<h1 class="family-name" style="margin-bottom:14px;">Reports</h1>${rangeChips}<div id="reportBody"></div>`;
  document.getElementById('reportBody').innerHTML = reportMode==='spending' ? renderSpendingReport() : renderBalancesReport();
}

function renderSpendingReport(){
  const list = filterByRange(expenses);
  const incomeList = filterByRange(incomes);
  const total = list.reduce((s,e)=>s+e.amount,0);
  const incomeTotal = incomeList.reduce((s,e)=>s+e.amount,0);
  const net = incomeTotal - total;
  let memberHtml = members.map(m=>{ const v = sumBy(list, e=>e.user===m.name); return `<div class="split-card"><div class="who"><span class="dot" style="background:${m.color}"></span><span>${m.name}</span></div><div class="val">${fmt(v)}</div></div>`; }).join('');

  const catTotals = {}; list.forEach(e=>{ catTotals[e.category]=(catTotals[e.category]||0)+e.amount; });
  const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
  let acc = 0;
  const gradParts = catEntries.map(([cid,val])=>{ const c=catInfo(cid); const pct=total>0?val/total*100:0; const part=`${c.color} ${acc}% ${acc+pct}%`; acc+=pct; return part; });
  const donutBg = catEntries.length ? `conic-gradient(${gradParts.join(',')})` : 'var(--line)';
  const legendHtml = catEntries.length ? catEntries.map(([cid,val])=>{ const c=catInfo(cid); const pct=total>0?Math.round(val/total*100):0; return `<div class="legend-row"><div class="l-left"><span class="dot" style="background:${c.color}"></span><span>${c.name}</span></div><span>${fmt(val)} · ${pct}%</span></div>`; }).join('') : `<div class="empty-note">No data for this period.</div>`;

  return `
    <div class="hero" style="background:var(--paper); color:var(--ink); border:1px solid var(--line);">
      <p class="hero-label" style="color:var(--ink-soft);">Total spending</p><p class="hero-amt amt" style="color:var(--ink);">${fmt(total)}</p>
      <div class="hero-row" style="gap:16px; margin-top:14px;">
        <div class="hero-stat"><b style="color:var(--ink);">${fmt(incomeTotal)}</b><span style="color:var(--ink-soft);">Income</span></div>
        <div class="hero-stat"><b style="color:${net>=0?'var(--forest)':'var(--danger)'};">${net>=0?'+':'−'}${fmt(Math.abs(net))}</b><span style="color:var(--ink-soft);">Net</span></div>
      </div>
    </div>
    <div class="split-row">${memberHtml}</div>
    <div class="section-head"><h3>Category breakdown</h3></div>
    <div class="donut-wrap">
      <div style="width:110px;height:110px;border-radius:50%; background:${donutBg}; flex-shrink:0; position:relative;"><div style="position:absolute; inset:16px; border-radius:50%; background:var(--paper);"></div></div>
      <div class="legend">${legendHtml}</div>
    </div>`;
}

// Computes net balance per person from split expenses, then simplifies to the
// minimum number of settle-up payments (largest-debtor-meets-largest-creditor).
function computeBalances(list){
  const splitExpenses = list.filter(e=>e.splitType && e.splitType!=='none' && e.splitAmong && e.splitAmong.length);
  const balances = {};
  members.forEach(m=>{ balances[m.name] = 0; });
  splitExpenses.forEach(e=>{
    balances[e.user] = (balances[e.user]||0) + e.amount; // payer fronted the full amount
    e.splitAmong.forEach(s=>{ balances[s.name] = (balances[s.name]||0) - s.amount; }); // each participant owes their share
  });
  Object.keys(balances).forEach(k=> balances[k] = Math.round(balances[k]*100)/100);

  // simplify: match largest creditor with largest debtor repeatedly
  let creditors = Object.entries(balances).filter(([,v])=>v>0.5).map(([name,v])=>({name, amt:v}));
  let debtors = Object.entries(balances).filter(([,v])=>v<-0.5).map(([name,v])=>({name, amt:-v}));
  const settlements = [];
  creditors.sort((a,b)=>b.amt-a.amt); debtors.sort((a,b)=>b.amt-a.amt);
  let ci=0, di=0;
  while(ci<creditors.length && di<debtors.length){
    const c = creditors[ci], d = debtors[di];
    const pay = Math.min(c.amt, d.amt);
    settlements.push({ from:d.name, to:c.name, amount:Math.round(pay*100)/100 });
    c.amt -= pay; d.amt -= pay;
    if(c.amt<0.5) ci++;
    if(d.amt<0.5) di++;
  }
  return { balances, settlements, splitCount: splitExpenses.length };
}

function renderBalancesReport(){
  const list = filterByRange(expenses);
  const { balances, settlements, splitCount } = computeBalances(list);

  if(splitCount===0){
    return `<div class="empty-note">No split expenses in this period yet.<br>Turn on "Split this expense" when adding one.</div>`;
  }

  const balanceCards = members.map(m=>{
    const v = balances[m.name] || 0;
    const cls = v>0.5 ? 'pos' : (v<-0.5 ? 'neg' : 'zero');
    const label = v>0.5 ? 'gets back' : (v<-0.5 ? 'owes' : 'settled up');
    return `<div class="balance-card">
      <div class="b-left"><span class="dot" style="background:${m.color}"></span><div><b>${m.name}</b><span style="font-size:12px; color:var(--ink-soft);">${label}</span></div></div>
      <div class="b-amt ${cls}">${v===0?'₹0':fmt(Math.abs(v))}</div>
    </div>`;
  }).join('');

  const settleHtml = settlements.length ? settlements.map(s=>`
    <div class="settle-row"><b>${s.from}</b><span class="arrow">→</span><b>${s.to}</b><span class="amt">${fmt(s.amount)}</span></div>`).join('')
    : `<div class="empty-note">Everyone's settled up 🎉</div>`;

  return `
    <div class="section-head" style="margin-top:0;"><h3>Who owes what</h3></div>
    ${balanceCards}
    <div class="section-head"><h3>Simplified settle-up</h3></div>
    ${settleHtml}
  `;
}

/* ============================= BUDGET ============================= */
function renderBudgetScreen(){
  const budget = { monthly: family.budget_monthly||0, categories: family.budget_categories||{} };
  const monthSpend = sumBy(expenses, e=>isThisMonth(e.date));
  const pct = budget.monthly>0 ? Math.min(100, Math.round(monthSpend/budget.monthly*100)) : 0;
  const barClass = pct>=100?'over':(pct>=80?'warn':'');
  const catRows = expenseCats().map(c=>{
    const val = budget.categories?.[c.cat_id] || '';
    return `<div class="cat-budget-row"><div class="ic" style="background:${c.tint}">${c.icon}</div><div class="name">${c.name}</div><input type="number" inputmode="decimal" placeholder="0" value="${val}" onchange="setCatBudget('${c.cat_id}', this.value)"></div>`;
  }).join('');

  document.getElementById('budgetScreen').innerHTML = `
    <div class="ax-head"><p class="ax-title">Budget</p><div class="close-x" onclick="goTab('home')">✕</div></div>
    <div class="field-label">Monthly budget</div>
    <div class="bud-input-row"><span class="cur">₹</span><input type="number" inputmode="decimal" value="${budget.monthly||''}" placeholder="0" onchange="setMonthlyBudget(this.value)"></div>
    ${budget.monthly>0 ? `<div class="budget-card" style="margin-top:14px;"><div class="budget-top"><span>Spent so far</span><b>${fmt(monthSpend)} / ${fmt(budget.monthly)}</b></div><div class="bar-track"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div><div class="budget-sub">${pct>=100?'You are over budget this month.': pct>=80?'Approaching your monthly budget.' : fmt(budget.monthly-monthSpend)+' remaining left to spend.'}</div></div>`:''}
    <div class="field-label">Budget by category (optional)</div>${catRows}`;
}
async function setMonthlyBudget(val){
  try{ await dbUpdateFamily(activeCode, { budget_monthly: parseFloat(val)||0 }); await refreshFamilyData(); renderBudgetScreen(); }
  catch(e){ showToast('Could not save budget'); }
}
async function setCatBudget(catId, val){
  const cats = { ...(family.budget_categories||{}) };
  cats[catId] = parseFloat(val)||0;
  try{ await dbUpdateFamily(activeCode, { budget_categories: cats }); await refreshFamilyData(); }
  catch(e){ showToast('Could not save'); }
}

/* ============================= MANAGE CATEGORIES ============================= */
function openCategories(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('categoriesScreen').classList.add('active');
  renderCategoriesScreen();
}
function renderCategoriesScreen(){
  const expRows = expenseCats().map(c=>`
    <div class="cat-manage-row">
      <div class="ic" style="background:${c.tint}">${c.icon}</div>
      <div class="nm" onclick="renameCategoryPrompt(${c.dbId}, '${escapeHtml(c.name).replace(/'/g,"\\'")}')">${c.name}</div>
      <button onclick="deleteCategoryConfirm(${c.dbId})">Delete</button>
    </div>`).join('');
  const incRows = incomeCats().map(c=>`
    <div class="cat-manage-row">
      <div class="ic" style="background:${c.tint}">${c.icon}</div>
      <div class="nm" onclick="renameCategoryPrompt(${c.dbId}, '${escapeHtml(c.name).replace(/'/g,"\\'")}')">${c.name}</div>
      <button onclick="deleteCategoryConfirm(${c.dbId})">Delete</button>
    </div>`).join('');

  document.getElementById('categoriesScreen').innerHTML = `
    <div class="ax-head"><p class="ax-title">Categories</p><div class="close-x" onclick="goTab('settings')">✕</div></div>
    <p class="ob-sub" style="margin:6px 0 18px;">Tap a name to rename it. These are shared across the family.</p>
    <button class="btn btn-ghost" style="width:100%; margin-bottom:10px;" onclick="addMissingDefaultCategories()">↻ Add any new default categories</button>
    <div class="section-head" style="margin-top:0;"><h3>Expense categories</h3></div>
    <div class="set-card">${expRows}<button class="add-cat-btn" onclick="addCategoryPrompt('expense')">+ Add expense category</button></div>
    <div class="section-head"><h3>Income sources</h3></div>
    <div class="set-card">${incRows}<button class="add-cat-btn" onclick="addCategoryPrompt('income')">+ Add income source</button></div>
  `;
}
async function addCategoryPrompt(type){
  const name = (prompt(type==='income' ? 'New income source name:' : 'New category name:') || '').trim();
  if(!name) return;
  const icon = (prompt('Pick an emoji for it (e.g. 🎯):', '📦') || '📦').trim() || '📦';
  const palette = ['#2F6F4E','#2C4A6E','#6E3B5C','#C08A2E','#B4432F','#5B6B5F'];
  const color = palette[Math.floor(Math.random()*palette.length)];
  const cat_id = (name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || ('cat'+Date.now())) + '_' + Date.now().toString(36).slice(-4);
  try{
    await dbAddCategory({ cat_id, name, icon, color, type, sort_order: categories.filter(c=>c.type===type).length });
    await refreshFamilyData();
    renderCategoriesScreen();
    showToast('Added ✓');
  }catch(e){ showToast('Could not add category'); }
}
async function renameCategoryPrompt(dbId, oldName){
  const name = (prompt('Rename to:', oldName) || '').trim();
  if(!name || name===oldName) return;
  try{ await dbUpdateCategory(dbId, { name }); await refreshFamilyData(); renderCategoriesScreen(); }
  catch(e){ showToast('Could not rename'); }
}
async function deleteCategoryConfirm(dbId){
  try{ await dbDeleteCategory(dbId); await refreshFamilyData(); renderCategoriesScreen(); showToast('Deleted'); }
  catch(e){ showToast('Could not delete'); }
}

async function addMissingDefaultCategories(){
  const haveExpense = new Set(expenseCats().map(c=>c.cat_id));
  const haveIncome = new Set(incomeCats().map(c=>c.cat_id));
  const missing = [
    ...DEFAULT_EXPENSE_CATEGORIES.filter(c=>!haveExpense.has(c.cat_id)).map((c,i)=>({ family_code:activeCode, cat_id:c.cat_id, name:c.name, icon:c.icon, color:c.color, type:'expense', sort_order:1000+i })),
    ...DEFAULT_INCOME_CATEGORIES.filter(c=>!haveIncome.has(c.cat_id)).map((c,i)=>({ family_code:activeCode, cat_id:c.cat_id, name:c.name, icon:c.icon, color:c.color, type:'income', sort_order:1000+i })),
  ];
  if(!missing.length){ showToast('You already have all the default categories'); return; }
  try{
    const { error } = await sb.from('categories').insert(missing);
    if(error) throw error;
    await refreshFamilyData();
    renderCategoriesScreen();
    showToast(`Added ${missing.length} new categories ✓`);
  }catch(e){ showToast('Could not add — try again'); }
}

/* ============================= SETTINGS ============================= */
function renderSettings(){
  const me = currentIdentity();
  const isCreator = family.created_by === session.user.id;
  const memberRows = members.map(m=>{
    const isMe = m.name===me.userName;
    const canRemove = isCreator && !isMe;
    return `<div class="member-pill" style="justify-content:space-between; width:100%;">
      <span style="display:flex; align-items:center; gap:8px;"><span class="dot" style="background:${m.color}; width:10px;height:10px;border-radius:50%; display:inline-block;"></span><span>${m.name}${isMe?' (you)':''}</span></span>
      ${canRemove ? `<button style="border:none; background:var(--bg); color:var(--danger); font-size:11px; font-weight:600; cursor:pointer; padding:5px 10px; border-radius:8px;" onclick="removeMemberConfirm('${m.user_id}','${escapeHtml(m.name).replace(/'/g,"\\'")}')">Remove</button>` : ''}
    </div>`;
  }).join('');
  const isDark = document.body.classList.contains('dark');

  document.getElementById('settings').innerHTML = `
    <h1 class="family-name" style="margin-bottom:16px;">Settings</h1>
    <div class="set-card">
      <div class="set-row"><span class="lab">Signed in as</span><span class="val">${escapeHtml(session.user.email)}</span></div>
    </div>
    <div class="set-card">
      <div class="set-row"><span class="lab">Family</span><span class="val">${family.name}</span></div>
      <div class="code-display">${family.code}</div>
      <div style="text-align:center; color:var(--ink-soft); font-size:12.5px; margin-top:-6px;">Share this code so someone else can join</div>
    </div>
    ${identities.length>1 ? `<div class="set-card"><div class="set-row" style="cursor:pointer;" onclick="openSwitchFamily()"><span class="lab">You're in ${identities.length} families</span><span class="val">Switch →</span></div></div>` : `<div class="set-card"><div class="set-row" style="cursor:pointer;" onclick="openSwitchFamily()"><span class="lab">Belong to another family too?</span><span class="val">Add →</span></div></div>`}
    <div class="set-card"><div class="set-row" style="border:none; padding-bottom:6px;"><span class="lab">Members${isCreator?' — you can remove someone who joined by mistake':''}</span></div>${memberRows}</div>
    <div class="set-card"><div class="set-row" style="cursor:pointer;" onclick="goBudget()"><span class="lab">Monthly budget</span><span class="val">${family.budget_monthly ? fmt(family.budget_monthly) : 'Set up →'}</span></div></div>
    <div class="set-card"><div class="set-row" style="cursor:pointer;" onclick="openCategories()"><span class="lab">Categories & income sources</span><span class="val">Manage →</span></div></div>
    <div class="set-card">
      <div class="set-row" style="border:none; padding-bottom:8px;"><span class="lab">Appearance</span></div>
      <div class="theme-row"><div class="theme-btn ${!isDark?'sel':''}" onclick="setTheme(false)">Light</div><div class="theme-btn ${isDark?'sel':''}" onclick="setTheme(true)">Dark</div></div>
    </div>
    <button class="btn btn-ghost" style="width:100%; color:var(--danger); margin-top:6px;" onclick="leaveFamily()">Leave this family</button>
    <button class="btn btn-ghost" style="width:100%; margin-top:8px;" onclick="handleSignOut()">Sign out</button>
  `;
}
async function removeMemberConfirm(userId, name){
  if(!confirm(`Remove ${name} from ${family.name}? They'll lose access immediately, but their past expenses stay in the records.`)) return;
  try{
    await dbRemoveMember(activeCode, userId);
    await refreshFamilyData();
    renderSettings();
    showToast(`${name} removed`);
  }catch(e){ showToast('Could not remove — try again'); }
}
function setTheme(dark){ document.body.classList.toggle('dark', dark); localStorage.setItem('ledger_theme', dark?'dark':'light'); renderSettings(); }
async function leaveFamily(){
  try{
    await dbLeaveFamily(activeCode);
    identities = identities.filter(i=>i.familyCode!==activeCode);
    if(identities.length){
      activeCode = identities[0].familyCode; saveActiveCode();
      await refreshFamilyData(); goTab('home');
    } else {
      activeCode = null; saveActiveCode(); family=null; members=[]; expenses=[];
      document.getElementById('bottomNav').style.display = 'none';
      renderOnboarding();
    }
  }catch(e){ showToast('Could not leave — try again'); }
}
// restore theme preference on load
if(localStorage.getItem('ledger_theme')==='dark') document.body.classList.add('dark');
