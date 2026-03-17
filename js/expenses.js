// Expenses Logic & Terminal (Fixed for Compat Mode)
window.handleExpMethodChange = (val) => {
    const inputs = document.getElementById('exp_mixed_inputs');
    const amtField = document.getElementById('exp_amount');
    if (inputs) inputs.classList.toggle('hidden', val !== 'Mixed');
    if (amtField) {
        if (val === 'Mixed') {
             amtField.readOnly = true;
             amtField.classList.add('bg-slate-100', 'opacity-70');
             window.autoSumExpMixed();
        } else {
             amtField.readOnly = false;
             amtField.classList.remove('bg-slate-100', 'opacity-70');
        }
    }
};

window.autoSumExpMixed = () => {
    const cash = parseFloat(document.getElementById('exp_mixed_cash')?.value || 0);
    const upi = parseFloat(document.getElementById('exp_mixed_upi')?.value || 0);
    const amtField = document.getElementById('exp_amount');
    if (amtField) amtField.value = (cash + upi).toFixed(2);
};

(function() {
    const fmt = window.fmt;
    
    // Helper to get collection reference using our silo path
    const EXP_COL = () => window.FB.collection('expenses');

    window.renderExpenses = function () {
        if (window.erpState.expenseTab === 'history') {
            return renderExpenseHistory();
        }
        return renderExpenseTerminal();
    };

    function renderExpenseTerminal() {
        const cats = window.erpState.expenseCategories || [];
        return `
        <div class="flex flex-col h-full bg-slate-50">
            <header class="h-20 bg-white/70 backdrop-blur-md border-b border-slate-100 px-8 flex items-center justify-between z-40 sticky top-0">
                <div class="flex items-center gap-4">
                    <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">Expense Terminal</h2>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.setExpenseTab('history')" class="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">History</button>
                    <button onclick="window.addCategoryPrompt()" class="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all">+ Category</button>
                </div>
            </header>

            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    ${cats.map((c, idx) => `
                        <div class="relative group">
                            <button onclick="window.openExpenseForm('${c.name}')" class="w-full bg-white border-2 border-slate-100 hover:border-violet-600 p-8 rounded-[40px] transition-all flex flex-col items-center gap-4 shadow-sm hover:shadow-2xl hover:shadow-violet-500/10 relative overflow-hidden">
                                <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-violet-50 transition-colors shadow-inner">
                                    <i data-lucide="${c.icon || 'DollarSign'}" class="w-8 h-8 text-violet-500 group-hover:scale-110 transition-transform"></i>
                                </div>
                                <span class="text-xs font-black text-slate-700 uppercase tracking-widest text-center word-break break-words w-full">${c.name}</span>
                                ${c.requiresBill ? `<div class="absolute top-4 left-4 w-2 h-2 rounded-full bg-violet-400"></div>` : ''}
                            </button>
                            <div class="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button onclick="event.stopPropagation(); window.addCategoryPrompt('${c.name}')" class="p-2 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-600 hover:text-white shadow-sm">
                                    <i data-lucide="Settings" class="w-4 h-4"></i>
                                </button>
                                <button onclick="event.stopPropagation(); window.deleteCategory('${c.id || idx}')" class="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white shadow-sm">
                                    <i data-lucide="Trash2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>
        </div>`;
    }

    window.setExpenseTab = function(tab) {
        window.erpState.expenseTab = tab;
        window.renderApp();
    };

    function renderExpenseHistory() {
        const now = new Date();
        let start = new Date().setHours(0, 0, 0, 0);
        const filter = window.erpState.dashboardFilter || 'monthly';
        
        if (filter === 'weekly') {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            start = new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
        } else if (filter === 'monthly') {
            start = new Date(now.getFullYear(), now.getMonth(), 1).setHours(0, 0, 0, 0);
        } else if (filter === 'today') {
             start = new Date().setHours(0, 0, 0, 0);
        }

        let end = new Date().setHours(23, 59, 59, 999);
        const search = (window.erpState.expenseSearch || '').toLowerCase();
        
        const list = (window.erpState.expenses || [])
            .filter(e => {
                const matchesSearch = !search || 
                    (e.description || '').toLowerCase().includes(search) || 
                    (e.billNo || '').toLowerCase().includes(search);
                return matchesSearch;
            })
            .sort((a, b) => b.date - a.date);

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <header class="h-20 bg-white border-b border-slate-100 px-8 flex items-center justify-between z-40">
                <div class="flex items-center gap-4">
                    <button onclick="window.setExpenseTab('terminal')" class="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"><i data-lucide="ArrowLeft" class="w-5 h-5"></i></button>
                    <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">Expense History</h2>
                </div>
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <i data-lucide="Search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                        <input type="text" oninput="window.erpState.expenseSearch=this.value; window.renderApp();" value="${window.erpState.expenseSearch || ''}" placeholder="Search History..." class="pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold w-64 outline-none focus:ring-2 focus:ring-violet-400">
                    </div>
                </div>
            </header>

            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div class="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50/50">
                                <th class="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                                <th class="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Particulars</th>
                                <th class="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                                <th class="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                                <th class="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${list.map(e => `
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="px-8 py-5 text-xs font-bold text-slate-500">${window.fmtDate(e.date)}</td>
                                    <td class="px-8 py-5">
                                        <p class="font-black text-slate-800 text-sm">${e.description || 'No description'}</p>
                                        ${e.billNo ? `<p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Ref: ${e.billNo}</p>` : ''}
                                    </td>
                                    <td class="px-8 py-5 text-right font-black text-rose-500 text-base">${fmt(e.amount)}</td>
                                    <td class="px-8 py-5 text-center">
                                        <span class="px-2.5 py-1 bg-violet-50 text-violet-600 rounded-lg text-[9px] font-black uppercase tracking-widest">${e.category}</span>
                                    </td>
                                    <td class="px-8 py-5 text-center">
                                        <div class="flex justify-center gap-1">
                                            <button onclick="window.editExpense('${e.id}')" class="p-2 text-slate-300 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all"><i data-lucide="Pencil" class="w-4 h-4"></i></button>
                                            <button onclick="window.deleteExpense('${e.id}')" class="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><i data-lucide="Trash2" class="w-4 h-4"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                            ${list.length === 0 ? `<tr><td colspan="5" class="py-24 text-center text-slate-300 font-bold italic">No records found.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    window.openExpenseForm = (catName, existingExp = null) => {
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[500] p-4";
        
        const today = existingExp ? new Date(existingExp.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const catSettings = window.erpState.expenseCategories.find(c => c.name === catName) || {};
        const requiresBill = catSettings.requiresBill || false;

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl animate-pop-in border border-slate-100 relative overflow-hidden">
                <div class="mb-8">
                    <h3 class="text-2xl font-black text-slate-900 tracking-tighter">${existingExp ? 'Edit Record' : 'Record Expense'}</h3>
                    <p class="text-violet-600 text-[10px] font-black mt-2 uppercase tracking-[0.2em] inline-block bg-violet-50 px-3 py-1.5 rounded-xl underline decoration-violet-200 underline-offset-4">${catName}</p>
                </div>
                
                <div class="space-y-5">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Amount (₹) *</label>
                            <input id="exp_amount" type="number" value="${existingExp ? existingExp.amount : ''}" placeholder="0.00" class="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-black text-xl text-violet-600 outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">${requiresBill ? 'Bill / Ref No *' : 'Bill / Ref No'}</label>
                            <input id="exp_billNo" type="text" value="${existingExp ? (existingExp.billNo || '') : ''}" placeholder="${requiresBill ? 'Required #' : '#'}" class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                        </div>
                    </div>
                    
                    <div class="space-y-1">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Expenditure Details</label>
                        <input id="exp_desc" value="${existingExp ? (existingExp.description || '') : ''}" placeholder="Description of the expense..." class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Date</label>
                            <input id="exp_date" type="date" value="${today}" class="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Payment via</label>
                            <select id="exp_method" onchange="window.handleExpMethodChange(this.value)" class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-black text-[10px] uppercase tracking-widest outline-none shadow-inner">
                                <option value="Cash" ${existingExp && existingExp.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
                                <option value="UPI" ${existingExp && existingExp.paymentMethod === 'UPI' ? 'selected' : ''}>UPI / Online</option>
                                <option value="Bank" ${existingExp && existingExp.paymentMethod === 'Bank' ? 'selected' : ''}>Bank Transfer</option>
                                <option value="Mixed" ${existingExp && String(existingExp.paymentMethod).startsWith('Mixed') ? 'selected' : ''}>Mixed (Cash & UPI)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="exp_mixed_inputs" class="${existingExp && String(existingExp.paymentMethod).startsWith('Mixed') ? '' : 'hidden'} grid grid-cols-2 gap-4">
                        <div><input id="exp_mixed_cash" type="number" oninput="window.autoSumExpMixed()" placeholder="Cash ₹" class="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-400"></div>
                        <div><input id="exp_mixed_upi" type="number" oninput="window.autoSumExpMixed()" placeholder="UPI ₹" class="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-400"></div>
                    </div>

                    <div class="flex gap-4 pt-4">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button id="exp_save" class="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-violet-200 hover:bg-violet-700 transition-all">${existingExp ? 'Update Record' : 'Save Expense'}</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('exp_amount').focus();
        
        document.getElementById("exp_save").onclick = async () => {
            const amt = parseFloat(document.getElementById("exp_amount").value);
            const billNo = document.getElementById("exp_billNo").value.trim();

            if (!amt || isNaN(amt)) { alert("Enter a valid amount"); return; }
            if (requiresBill && !billNo) { alert("Bill No. is required for this category"); return; }

            const desc = document.getElementById("exp_desc").value.trim() || "Unspecified Expenditure";
            const dateStr = document.getElementById("exp_date").value;
            const method = document.getElementById("exp_method").value;
            let cash = 0, upi = 0;
            
            if (method === 'Mixed') {
                cash = parseFloat(document.getElementById('exp_mixed_cash').value) || 0;
                upi = parseFloat(document.getElementById('exp_mixed_upi').value) || 0;
            } else if (method === 'Cash') {
                cash = amt;
            } else if (method === 'UPI') {
                upi = amt;
            }

            const btn = document.getElementById("exp_save");
            btn.innerText = "SAVING..."; btn.disabled = true;

            const expenseData = {
                date: new Date(dateStr).getTime(),
                category: catName,
                amount: amt,
                billNo: billNo,
                description: desc,
                paymentMethod: method,
                paymentBreakdown: { cash, upi },
                createdAt: Date.now()
            };

            try {
                if (existingExp) {
                    await EXP_COL().doc(existingExp.id).update(expenseData);
                } else {
                    await EXP_COL().add(expenseData);
                }
                modal.remove();
                window.renderApp();
            } catch (e) {
                console.error(e);
                alert("Cloud Sync Error. Please retry.");
                btn.innerText = existingExp ? "UPDATE RECORD" : "SAVE EXPENSE";
                btn.disabled = false;
            }
        };
    };

    window.addCategoryPrompt = (existingName = null) => {
        const existing = existingName ? window.erpState.expenseCategories.find(c => c.name === existingName) : null;
        const icons = ['Home', 'Zap', 'Users', 'ShoppingBag', 'Scissors', 'Droplets', 'Target', 'Palette', 'DollarSign'];
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-pop-in relative border border-slate-100">
                <div class="flex flex-col items-center gap-6 mb-8">
                    <div id="cat_icon_preview" class="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 shadow-inner">
                        <i data-lucide="${existing ? existing.icon || 'Settings' : 'Plus'}" class="w-8 h-8"></i>
                    </div>
                    <div class="text-center">
                        <h3 class="text-2xl font-black text-slate-800 tracking-tighter">${existing ? 'Edit Category' : 'New Category'}</h3>
                        <p class="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">${existing ? 'Update collection rules' : 'Custom expense group'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-5 gap-3 mb-8">
                    ${icons.map(icon => `
                        <button onclick="window.selectCatIcon('${icon}')" class="cat-icon-btn p-3 ${existing && existing.icon === icon ? 'border-violet-600 bg-violet-50' : 'bg-slate-50'} border-2 border-transparent rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center">
                            <i data-lucide="${icon}" class="w-4 h-4 ${existing && existing.icon === icon ? 'text-violet-600' : 'text-slate-400'}"></i>
                        </button>
                    `).join('')}
                </div>

                <input id="new_cat_name" value="${existing ? existing.name : ''}" placeholder="Repairs / Marketing / etc." class="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-violet-400 shadow-inner mb-4">
                
                <label class="flex items-center gap-3 mb-10 px-1 cursor-pointer group">
                    <input type="checkbox" id="new_cat_bill" ${existing && existing.requiresBill ? 'checked' : ''} class="w-5 h-5 rounded-lg border-2 border-slate-200 text-violet-600 focus:ring-violet-400">
                    <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-800 transition-colors">Require Bill # Tracking</span>
                </label>

                <div class="flex gap-4">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                    <button id="cat_save" class="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-violet-200">${existing ? 'Update' : 'Create'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
        window.activeCatIcon = existing ? existing.icon || 'Settings' : 'DollarSign';
        
        window.selectCatIcon = (icon) => {
            window.activeCatIcon = icon;
            document.getElementById('cat_icon_preview').innerHTML = `<i data-lucide="${icon}" class="w-8 h-8 text-violet-600"></i>`;
            lucide.createIcons();
        };

        const saveBtn = document.getElementById("cat_save");
        saveBtn.onclick = async () => {
            const name = document.getElementById("new_cat_name").value.trim();
            const reqBill = document.getElementById("new_cat_bill").checked;
            
            if (!name) { alert("Name required"); return; }
            
            saveBtn.innerText = existing ? "UPDATING..." : "CREATING...";
            saveBtn.disabled = true;
            
            try {
                const data = {
                    name: name,
                    requiresBill: reqBill,
                    icon: window.activeCatIcon,
                    updatedAt: Date.now()
                };
                
                // If editing, use the ID if we have it
                if (existing && existing.id) {
                    await window.FB.collection('expense_categories').doc(existing.id).update(data);
                } else {
                    // Check if a category with this name ALREADY exists in cloud (to prevent duplicates)
                    const snap = await window.FB.collection('expense_categories').where('name', '==', name).get();
                    if (!snap.empty) {
                        // Update existing cloud category instead of adding new one
                        await window.FB.collection('expense_categories').doc(snap.docs[0].id).update(data);
                    } else {
                        // Brand new or overriding a default for the first time
                        await window.FB.collection('expense_categories').add({ ...data, createdAt: Date.now() });
                    }
                }
                modal.remove();
            } catch(e) {
                console.error(e);
                alert("Error saving category.");
                saveBtn.innerText = existing ? "Update" : "Create";
                saveBtn.disabled = false;
            }
        };
    };

    window.deleteCategory = async (idOrIdx) => {
        // If it's a Firestore ID (contains letters or is longer)
        const isFirestoreId = isNaN(idOrIdx) || idOrIdx.length > 5;
        
        if (!confirm("Are you sure you want to delete this category?")) return;
        
        if (isFirestoreId) {
            try {
                await window.FB.collection('expense_categories').doc(idOrIdx).delete();
                window.renderApp();
            } catch(e) {
                console.error(e);
                alert("Error deleting category from cloud.");
            }
        } else {
            // Fallback for hardcoded categories
            window.erpState.expenseCategories.splice(idOrIdx, 1);
            window.renderApp();
        }
    };

    window.deleteExpense = async (id) => {
        if (!confirm("Permanently wipe this record from cloud ledger?")) return;
        try {
            await EXP_COL().doc(id).delete();
            window.renderApp();
        } catch(e) {
            alert("Error deleting record");
        }
    };

    window.editExpense = (id) => {
        const exp = window.erpState.expenses.find(e => e.id === id);
        if (exp) window.openExpenseForm(exp.category, exp);
    };

})();
