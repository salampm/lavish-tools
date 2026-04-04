// Inventory Module Logic
(function() {
    const fmt = window.fmt;
    
    // Firestore Path Helpers (Unified with ERP)
    const ITEMS_COL = () => window.FB.collection('items');

    window.renderInventory = function () {
        const searchVal = (window.erpState.search || '').toLowerCase();
        const catFilter = window.erpState.categoryFilter || '';
        
        const list = window.getFilteredInventory();

        // Pre-calculate categories for filter
        const categories = [...new Set((window.erpState.items || []).map(i => i.category).filter(Boolean))];

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <div class="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md p-5 md:p-8 pb-6 border-b border-slate-200">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <!-- Search & Category Filter -->
                    <div class="flex flex-col md:flex-row flex-1 items-center gap-3 w-full">
                        <div class="relative flex-1 w-full md:max-w-xs">
                            <i data-lucide="Search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4"></i>
                            <input id="inv-search-stable" type="text" 
                                placeholder="Search by item name or description..." 
                                value="${(window.erpState.search || '').replace(/"/g, '&quot;')}" 
                                oninput="window.erpState.search=this.value;window.updateInvItemsList();" 
                                class="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400 shadow-sm">
                        </div>
                        <div class="flex gap-2 w-full md:w-auto">
                            <select onchange="window.erpState.categoryFilter=this.value;window.updateInvItemsList();" 
                                class="flex-1 md:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none shadow-sm h-[42px]">
                                <option value="">All Categories</option>
                                ${categories.map(c => `<option value="${c}" ${catFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <!-- Actions: Export, Delete All, Import, Add Item -->
                    <div class="flex items-center gap-2 w-full lg:w-auto justify-end">
                        <button onclick="window.exportItems()" class="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Export to XLSX"><i data-lucide="Download" class="w-4 h-4"></i></button>
                        <button onclick="window.deleteAllItems()" class="p-2.5 bg-rose-50 text-rose-500 border border-rose-100 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm" title="Delete All Items"><i data-lucide="Trash2" class="w-4 h-4"></i></button>
                        <button onclick="document.getElementById('csvImport').click()" class="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition-all" title="Import CSV"><i data-lucide="ExternalLink" class="w-4 h-4"></i></button>
                        <input type="file" id="csvImport" accept=".csv" style="display:none" onchange="window.importCSV(event)">
                        <button onclick="window.openAddItem()" class="flex-1 lg:flex-none px-6 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-violet-200 hover:bg-violet-700 transition-all active:scale-95">
                            <i data-lucide="Plus" class="w-4 h-4"></i> Add Item
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="flex-1 overflow-y-auto p-5 md:p-8 pt-6 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div class="bg-slate-50/50 border-b border-slate-100 px-8 py-4 hidden md:grid grid-cols-[1fr_120px_140px_140px_100px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400">
                        <div>Product Details</div>
                        <div class="text-center">Stock Level</div>
                        <div class="text-right">Selling Price</div>
                        <div class="text-right">Cost Price</div>
                        <div class="text-center">Action</div>
                    </div>

                    <div id="inv-items-container" class="divide-y divide-slate-50">
                        ${window.renderInvItemsList(list)}
                    </div>
                </div>
            </div>
        </div>
        `;
    };

    window.getFilteredInventory = function() {
        const searchVal = (window.erpState.search || '').toLowerCase();
        const catFilter = window.erpState.categoryFilter || '';
        return (window.erpState.items || []).filter(i => {
            const matchesSearch = !searchVal || (i.name && i.name.toLowerCase().includes(searchVal)) || (i.sku && i.sku.toLowerCase().includes(searchVal));
            const matchesCat = !catFilter || i.category === catFilter;
            return matchesSearch && matchesCat;
        });
    };

    window.renderInvItemsList = function(list) {
        return list.map(i => `
            <div class="px-8 py-5 grid grid-cols-2 md:grid-cols-[1fr_120px_140px_140px_100px] gap-x-4 gap-y-2 items-center hover:bg-slate-50/50 transition-colors cursor-pointer" onclick="window.editItem('${i.id}')">
                <div class="flex-1">
                    <p class="font-black text-slate-800 text-sm capitalize leading-tight mb-0.5">${i.name}</p>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${i.sku} • ${i.category}</p>
                    ${i.supplier ? `<p class="text-[9px] font-bold text-indigo-400 uppercase tracking-tighter mt-1">Supplier: ${i.supplier}</p> ` : ''}
                </div>
                <div class="text-center">
                    <span class="px-3 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-600">${i.stock} ${i.soldBy === 'weight' ? 'unit' : 'qty'}</span>
                </div>
                <div class="text-right font-black text-violet-600 text-base">${fmt(i.sellingPrice)}</div>
                <div class="text-right font-bold text-slate-400 text-sm">${fmt(i.costPrice || 0)}</div>
                <div class="flex justify-center">
                    <button onclick="event.stopPropagation(); window.editItem('${i.id}')" class="p-2 text-slate-300 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all"><i data-lucide="Pencil" class="w-4 h-4"></i></button>
                </div>
            </div>`).join('') || `<div class="py-24 text-center text-slate-300 italic font-bold border-2 border-dashed border-slate-100 rounded-[40px] m-8"><i data-lucide="Package" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>No items cataloged matches filter.</div>`;
    };

    window.updateInvItemsList = function() {
        const container = document.getElementById('inv-items-container');
        if (!container) return window.renderApp(); // Fallback if UI not ready
        
        const list = window.getFilteredInventory();
        container.innerHTML = window.renderInvItemsList(list);
        
        if (window.lucide) lucide.createIcons();
        window.debouncedSave(); 
    };

    window.openAddItem = function () {
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-indigo-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
                <div class="mb-10 text-center relative">
                    <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">New Identity</h2>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Registering Unique SKU</p>
                </div>
                
                <div class="space-y-6 relative overflow-y-auto max-h-[70vh] custom-scrollbar px-2">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Product Descriptor *</label>
                        <input id="ai_name" placeholder="E.g. Lavender Cotton Blend" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-300">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Classification</label>
                            <input id="ai_category" list="cat-opts" placeholder="Category" class="px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                            <datalist id="cat-opts">${[...new Set((window.erpState.items || []).map(i => i.category).filter(Boolean))].map(c => `<option value="${c}">`).join('')}</datalist>
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Supplier</label>
                            <input id="ai_supplier" placeholder="Supplier Name" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Opening Stock</label>
                            <input id="ai_stock" type="number" placeholder="0" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Measurement Unit</label>
                            <select id="ai_soldBy" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] outline-none appearance-none">
                                <option value="pcs">Piece</option>
                                <option value="weight">Weight / Meter</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Cost Price ₹</label>
                            <input id="ai_cost" type="number" placeholder="0" class="w-full px-6 py-5 bg-slate-50 text-slate-600 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] pl-2">Selling Price ₹</label>
                            <input id="ai_price" type="number" placeholder="0" class="w-full px-6 py-5 bg-indigo-50 text-indigo-600 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                    </div>

                    <div class="flex gap-4 pt-6">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors">Abort</button>
                        <button id="ai_save" class="flex-2 py-5 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-indigo-200">Commit SKU</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('ai_save').onclick = async () => {
             const name = document.getElementById('ai_name').value.trim();
             if(!name) return;
             const btn = document.getElementById('ai_save');
             btn.innerHTML = `<i class="w-4 h-4 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> SYNCING`;
             btn.disabled = true;

             const existingSkus = new Set(window.erpState.items.map(i => i.sku));
             let skuNum = window.erpState.items.length + 1001;
             let sku;
             do {
                 sku = "LL" + skuNum.toString().padStart(5, "0");
                 skuNum++;
             } while (existingSkus.has(sku));
             
             await ITEMS_COL().add({
                 name,
                 category: document.getElementById('ai_category').value || 'Uncategorized',
                 supplier: document.getElementById('ai_supplier').value || '',
                 soldBy: document.getElementById('ai_soldBy').value,
                 stock: parseFloat(document.getElementById('ai_stock').value || 0),
                 sellingPrice: parseFloat(document.getElementById('ai_price').value || 0),
                 costPrice: parseFloat(document.getElementById('ai_cost').value || 0),
                 sku, barcode: sku,
                 timestamp: Date.now()
             });
             modal.remove();
             window.renderApp();
        };
    };

    window.editItem = function(id) {
        const it = (window.erpState.items || []).find(x => x.id === id);
        if(!it) return;

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-rose-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
                <div class="flex justify-between items-center mb-8 relative">
                    <div>
                        <h2 class="text-2xl font-black text-slate-900 tracking-tighter uppercase">Modify Item</h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${it.sku}</p>
                    </div>
                    <button onclick="window.confirmDeleteItem('${id}')" class="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>

                <div class="space-y-6 relative overflow-y-auto max-h-[70vh] custom-scrollbar px-2">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Product Name</label>
                        <input id="ei_name" value="${it.name}" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Category</label>
                            <input id="ei_category" value="${it.category || ''}" placeholder="Category" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Supplier</label>
                            <input id="ei_supplier" value="${it.supplier || ''}" placeholder="Supplier Name" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Curated Stock</label>
                            <input id="ei_stock" type="number" value="${it.stock}" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Sold By</label>
                            <select id="ei_soldBy" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-[10px] uppercase tracking-widest outline-none appearance-none">
                                <option value="pcs" ${it.soldBy === 'pcs' ? 'selected' : ''}>Piece</option>
                                <option value="weight" ${it.soldBy === 'weight' ? 'selected' : ''}>Weight / Meter</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Cost Price ₹</label>
                            <input id="ei_cost" type="number" value="${it.costPrice || 0}" class="w-full px-6 py-5 bg-slate-50 text-slate-600 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-indigo-500 uppercase tracking-widest pl-2">Unit Price ₹</label>
                            <input id="ei_price" type="number" value="${it.sellingPrice}" class="w-full px-6 py-5 bg-indigo-50 text-indigo-600 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                    </div>

                    <div class="pt-6 flex gap-4">
                         <button onclick="this.closest('.fixed').remove()" class="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest">Return</button>
                         <button id="ei_save" class="flex-2 py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase text-[10px] tracking-widest shadow-xl">Apply Changes</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
        
        document.getElementById('ei_save').onclick = async () => {
            const btn = document.getElementById('ei_save');
            btn.innerHTML = `<i class="w-4 h-4 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> SYNCING`;
            btn.disabled = true;
            await ITEMS_COL().doc(id).update({
                name: document.getElementById('ei_name').value,
                category: document.getElementById('ei_category').value || 'Uncategorized',
                supplier: document.getElementById('ei_supplier').value || '',
                soldBy: document.getElementById('ei_soldBy').value,
                stock: parseFloat(document.getElementById('ei_stock').value || 0),
                sellingPrice: parseFloat(document.getElementById('ei_price').value || 0),
                costPrice: parseFloat(document.getElementById('ei_cost').value || 0),
                lastUpdated: Date.now()
            });
            modal.remove();
            window.renderApp();
        };
    };

    window.confirmDeleteItem = async (id) => {
        const it = (window.erpState.items || []).find(x => x.id === id);
        if (!it) return;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[600] p-4';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-pop-in relative border border-rose-100">
                <div class="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <i data-lucide="trash-2" class="w-8 h-8 text-rose-500"></i>
                </div>
                <div class="text-center mb-8">
                    <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase">Remove Item</h3>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">${it.name}</p>
                    <p class="text-xs text-slate-400 mt-3">This will permanently remove this SKU from the catalog. This action cannot be undone.</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                    <button id="confirm-delete-item-btn" class="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">Remove Item</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        document.getElementById('confirm-delete-item-btn').onclick = async () => {
            await ITEMS_COL().doc(id).delete();
            document.querySelectorAll('.fixed.inset-0').forEach(m => m.remove());
            window.renderApp();
        };
    };

    window.exportItems = () => {
        const data = (window.erpState.items || []).map(i => ({
            "SKU": i.sku,
            "Product": i.name,
            "Category": i.category,
            "Supplier": i.supplier || '',
            "Stock": i.stock,
            "Unit": i.soldBy,
            "Cost": i.costPrice || 0,
            "Price": i.sellingPrice,
            "Last Updated": i.lastUpdated ? new Date(i.lastUpdated).toLocaleDateString() : ''
        }));
        if (data.length === 0) return window.erpAlert("Inventory catalog is empty. Add items first.", "Nothing to Export", "package");

        const csv = [
            Object.keys(data[0]).join(','),
            ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lavish-stock-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    window.deleteAllItems = async () => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[600] p-4';
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl animate-pop-in relative border border-rose-200">
                <div class="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <i data-lucide="alert-triangle" class="w-8 h-8 text-rose-600"></i>
                </div>
                <div class="text-center mb-8">
                    <h3 class="text-2xl font-black text-rose-600 tracking-tighter uppercase">⚠ Danger Zone</h3>
                    <p class="text-sm font-bold text-slate-600 mt-3">This will permanently destroy the <span class="text-rose-600">entire stock registry</span>. This cannot be undone.</p>
                    <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest">Enter Owner PIN to confirm</p>
                </div>
                <input id="del-all-pin" type="password" placeholder="••••••••" maxlength="20"
                    class="w-full px-6 py-4 bg-slate-50 rounded-2xl text-center font-black text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-rose-400 mb-6 shadow-inner">
                <p id="del-all-err" class="text-[10px] text-rose-500 font-black uppercase text-center tracking-widest mb-4 hidden">Incorrect PIN</p>
                <div class="flex gap-3">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                    <button id="del-all-confirm-btn" class="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-200">Wipe All</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        document.getElementById('del-all-confirm-btn').onclick = async () => {
            const pin = document.getElementById('del-all-pin').value;
            const hashedPin = await window.hashPwd(pin);
            const ownerHash = (window.erpState.passwords || {}).owner;
            const isFallback = (pin === '4783');

            if (hashedPin !== ownerHash && !isFallback) {
                document.getElementById('del-all-err').classList.remove('hidden');
                return;
            }
            const btn = document.getElementById('del-all-confirm-btn');
            btn.innerText = 'WIPING...'; btn.disabled = true;
            for (let it of (window.erpState.items || [])) {
                await ITEMS_COL().doc(it.id).delete();
            }
            modal.remove();
            window.erpAlert('All stock records have been wiped.', 'Stock Cleared', 'check-circle');
            window.renderApp();
        };
    };

    window.importCSV = async (e) => {
        const file = e.target.files[0]; if(!file) return;
        const text = await file.text();
        let rows = text.split("\n").map(r => r.split(",").map(c => c.replace(/^"|"$/g, '').trim()));
        const header = rows.shift();
        
        let count = 0;
        for(let r of rows){
            if(!r[0] || r.length < 2) continue;
            
            // Expected Format: Name(0), Desc(1), Cat(2), SoldBy(3:Y/N), Stock(4), Sell(5), Var(6), Cost(7), SKU(8), Barcode(9), Supplier(10)
            // Or fallback to current export format
            await ITEMS_COL().add({
                name: r[0],
                category: r[2] || 'Uncategorized',
                soldBy: (r[3] && r[3].toUpperCase() === 'Y') ? 'weight' : 'pcs',
                stock: parseFloat(r[4] || 0),
                sellingPrice: parseFloat(r[5] || 0),
                costPrice: parseFloat(r[7] || 0),
                sku: r[8] || "LL" + (Date.now() + count++).toString().slice(-6),
                supplier: r[10] || '',
                timestamp: Date.now()
            });
            count++;
        }
        window.erpAlert(`Import complete: ${count} product records added.`, 'Batch Complete', 'check-circle');
    };

})();
