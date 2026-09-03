/* ============================= CONFIG ============================= */
// These are only the STARTING categories seeded for a brand new family —
// after that, categories live in the database and can be added/edited/
// deleted per family from Settings → Manage categories.
const DEFAULT_EXPENSE_CATEGORIES = [
  {cat_id:'food', name:'Food', icon:'🍔', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'groceries', name:'Groceries', icon:'🛒', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'transport', name:'Transport', icon:'🚗', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'home', name:'Home & Rent', icon:'🏠', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'shopping', name:'Shopping', icon:'🛍️', color:'#B4432F', tint:'#F5E1DC'},
  {cat_id:'medical', name:'Medical', icon:'💊', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'bills', name:'Utilities & Bills', icon:'💡', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'entertainment', name:'Entertainment', icon:'🎬', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'travel', name:'Travel', icon:'✈️', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'investment', name:'Investment', icon:'💰', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'recharge', name:'Recharge', icon:'📱', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'personal_care', name:'Personal Care', icon:'💇', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'education', name:'Education', icon:'📚', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'subscriptions', name:'Subscriptions', icon:'🔁', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'gifts', name:'Gifts & Giving', icon:'🎁', color:'#B4432F', tint:'#F5E1DC'},
  {cat_id:'insurance', name:'Insurance', icon:'🛡️', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'pets', name:'Pets', icon:'🐾', color:'#5B6B5F', tint:'#E7E9E6'},
  {cat_id:'debt_loans', name:'Debt & Loans', icon:'🏦', color:'#B4432F', tint:'#F5E1DC'},
  {cat_id:'taxes', name:'Taxes', icon:'🧾', color:'#5B6B5F', tint:'#E7E9E6'},
  {cat_id:'fitness', name:'Fitness & Sports', icon:'🏋️', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'childcare', name:'Childcare', icon:'🧸', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'household_supplies', name:'Household Supplies', icon:'🧴', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'bank_fees', name:'Bank & Card Fees', icon:'🏛️', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'hobbies', name:'Hobbies', icon:'🎨', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'petrol', name:'Petrol & Fuel', icon:'⛽', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'clothing', name:'Clothing', icon:'👕', color:'#B4432F', tint:'#F5E1DC'},
  {cat_id:'movies', name:'Movies', icon:'🍿', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'construction', name:'Construction & Renovation', icon:'🏗️', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'school_fees', name:'School Fees', icon:'🎓', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'rent', name:'Rent', icon:'🔑', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'other', name:'Other', icon:'📦', color:'#5B6B5F', tint:'#E7E9E6'},
];
const DEFAULT_INCOME_CATEGORIES = [
  {cat_id:'salary', name:'Salary', icon:'💼', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'business', name:'Business', icon:'🏢', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'freelance', name:'Freelance', icon:'💻', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'investment_income', name:'Investment Returns', icon:'📈', color:'#2F6F4E', tint:'var(--forest-tint)'},
  {cat_id:'rental', name:'Rental Income', icon:'🏘️', color:'#6E3B5C', tint:'var(--plum-tint)'},
  {cat_id:'gift_income', name:'Gift Received', icon:'🎁', color:'#B4432F', tint:'#F5E1DC'},
  {cat_id:'interest', name:'Interest', icon:'🏦', color:'#2C4A6E', tint:'var(--navy-tint)'},
  {cat_id:'bonus', name:'Bonus', icon:'🎯', color:'#C08A2E', tint:'var(--ochre-tint)'},
  {cat_id:'refund', name:'Refund / Reimbursement', icon:'↩️', color:'#5B6B5F', tint:'#E7E9E6'},
  {cat_id:'other_income', name:'Other Income', icon:'🔹', color:'#5B6B5F', tint:'#E7E9E6'},
];
const PAYMENT_METHODS = ['Cash','UPI','Credit Card'];
const MEMBER_COLORS = ['#2C4A6E','#6E3B5C','#C08A2E','#2F6F4E'];
