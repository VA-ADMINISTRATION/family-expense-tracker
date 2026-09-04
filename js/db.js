/* ============================= SUPABASE DATA LAYER ============================= */
async function dbGetFamily(code){
  const { data, error } = await sb.from('families').select('*').eq('code', code).maybeSingle();
  if(error) throw error;
  return data;
}
// Used only during "Join with a code" — before the user is a member, so the
// regular families table can't be queried directly (members-only by policy).
// This RPC returns just {code, name} for one exact code, no listing/browsing.
async function dbLookupFamilyByCode(code){
  const { data, error } = await sb.rpc('lookup_family_by_code', { p_code: code });
  if(error) throw error;
  return (data && data.length) ? data[0] : null;
}
async function dbCreateFamily(row){
  const { error } = await sb.from('families').insert({ ...row, created_by: session.user.id });
  if(error) throw error;
}
async function dbUpdateFamily(code, patch){
  const { error } = await sb.from('families').update(patch).eq('code', code);
  if(error) throw error;
}
async function dbGetMembers(code){
  const { data, error } = await sb.from('members').select('*').eq('family_code', code);
  if(error) throw error;
  return data || [];
}
async function dbAddMember(row){
  const { error } = await sb.from('members').insert({ ...row, user_id: session.user.id });
  if(error) throw error;
}
async function dbGetMyMemberships(){
  const { data, error } = await sb.from('members').select('family_code, name, color, families(name)').eq('user_id', session.user.id);
  if(error) throw error;
  return (data||[]).map(m=>({ familyCode:m.family_code, userName:m.name, color:m.color, familyName: m.families ? m.families.name : m.family_code }));
}
async function dbLeaveFamily(code){
  const { error } = await sb.from('members').delete().eq('family_code', code).eq('user_id', session.user.id);
  if(error) throw error;
}
// Only succeeds if the caller is the family's creator (enforced by RLS) —
// used to remove someone who joined by mistake.
async function dbRemoveMember(code, targetUserId){
  const { error } = await sb.from('members').delete().eq('family_code', code).eq('user_id', targetUserId);
  if(error) throw error;
}
async function dbGetExpenses(code){
  const { data, error } = await sb.from('expenses').select('*').eq('family_code', code).order('date', {ascending:false});
  if(error) throw error;
  return (data||[]).map(e=>({ id:e.id, date:e.date, time:e.time, user:e.user_name, category:e.category, amount:Number(e.amount), paymentMethod:e.payment_method, note:e.note, splitType:e.split_type||'none', splitAmong:e.split_among||null, createdAt:e.created_at, updatedAt:e.updated_at }));
}
async function dbAddExpense(e){
  const { error } = await sb.from('expenses').insert({ id:e.id, family_code:activeCode, user_id:session.user.id, user_name:e.user, date:e.date, time:e.time, category:e.category, amount:e.amount, payment_method:e.paymentMethod, note:e.note, split_type:e.splitType||'none', split_among:e.splitAmong||null });
  if(error) throw error;
}
async function dbUpdateExpense(e){
  const { error } = await sb.from('expenses').update({ user_name:e.user, date:e.date, category:e.category, amount:e.amount, payment_method:e.paymentMethod, note:e.note, split_type:e.splitType||'none', split_among:e.splitAmong||null, updated_at:new Date().toISOString() }).eq('id', e.id);
  if(error) throw error;
}
async function dbDeleteExpense(id){
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if(error) throw error;
}

/* ---- Categories ---- */
async function dbGetCategories(code){
  const { data, error } = await sb.from('categories').select('*').eq('family_code', code).order('sort_order');
  if(error) throw error;
  return (data||[]).map(c=>({ dbId:c.id, cat_id:c.cat_id, name:c.name, icon:c.icon, color:c.color, tint:c.color+'22', type:c.type }));
}
async function dbSeedCategories(code){
  const rows = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c,i)=>({ family_code:code, cat_id:c.cat_id, name:c.name, icon:c.icon, color:c.color, type:'expense', sort_order:i })),
    ...DEFAULT_INCOME_CATEGORIES.map((c,i)=>({ family_code:code, cat_id:c.cat_id, name:c.name, icon:c.icon, color:c.color, type:'income', sort_order:i })),
  ];
  const { error } = await sb.from('categories').insert(rows);
  if(error) throw error;
}
async function dbAddCategory(row){
  const { error } = await sb.from('categories').insert({ family_code:activeCode, ...row });
  if(error) throw error;
}
async function dbUpdateCategory(dbId, patch){
  const { error } = await sb.from('categories').update(patch).eq('id', dbId);
  if(error) throw error;
}
async function dbDeleteCategory(dbId){
  const { error } = await sb.from('categories').delete().eq('id', dbId);
  if(error) throw error;
}

/* ---- Income ---- */
async function dbGetIncomes(code){
  const { data, error } = await sb.from('incomes').select('*').eq('family_code', code).order('date', {ascending:false});
  if(error) throw error;
  return (data||[]).map(i=>({ id:i.id, date:i.date, time:i.time, user:i.user_name, source:i.source, amount:Number(i.amount), note:i.note, createdAt:i.created_at, updatedAt:i.updated_at }));
}
async function dbAddIncome(i){
  const { error } = await sb.from('incomes').insert({ id:i.id, family_code:activeCode, user_id:session.user.id, user_name:i.user, date:i.date, time:i.time, source:i.source, amount:i.amount, note:i.note });
  if(error) throw error;
}
async function dbUpdateIncome(i){
  const { error } = await sb.from('incomes').update({ user_name:i.user, date:i.date, source:i.source, amount:i.amount, note:i.note, updated_at:new Date().toISOString() }).eq('id', i.id);
  if(error) throw error;
}
async function dbDeleteIncome(id){
  const { error } = await sb.from('incomes').delete().eq('id', id);
  if(error) throw error;
}

async function refreshFamilyData(){
  const [fam, m, cats, e, inc] = await Promise.all([dbGetFamily(activeCode), dbGetMembers(activeCode), dbGetCategories(activeCode), dbGetExpenses(activeCode), dbGetIncomes(activeCode)]);
  family = fam; members = m; categories = cats; expenses = e; incomes = inc;
}
