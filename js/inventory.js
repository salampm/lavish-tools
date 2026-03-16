// Inventory Module Logic
(function() {
    const fmt = window.fmt;
    
    // Firestore Path Helpers (Unified with ERP)
    const ITEMS_COL = () => window.FB.collection('items');

    window.renderInventory = function () {
        const search = (window.erpState.search || '').toLowerCase();
        const catFilter = window.erpState.categoryFilter || '';
        
        const filtered = (window.erpState.items || []).filter(i => {
            const matchesSearch = !search || (i.name.toLowerCase().includes(search) || (i.sku && i.sku.toLowerCase().includes(search)));
            const matchesCat = !catFilter || i.category === catFilter;
            return matchesSearch && matchesCat;
        });

        // Pre-calculate categories for filter
        const categories = [...new Set((window.erpState.items || []).map(i => i.category).filter(Boolean))];

        return `
        <div class="flex flex-col h-full bg-slate-50/50">
            <!-- Global Inventory Header -->
            <div class="sticky top-0 z-20 bg-white/70 backdrop-blur-xl p-8 border-b border-slate-200/60">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-8 max-w-[1600px] mx-auto">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                            <h2 class="text-3xl font-black text-slate-900 tracking-tighter">Stock Master</h2>
                        </div>
                        <p class="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">${(window.erpState.items || []).length} SKUs Monitored</p>
                    </div>

                    <div class="flex flex-1 items-center gap-4 max-w-3xl">
                        <div class="group relative flex-1">
                            <i data-lucide="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors"></i>
                            <input type="text" 
                                placeholder="Search by name, SKU or barcode..." 
                                value="${window.erpState.search || ''}" 
                                class="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-[28px] text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" 
                                oninput="window.erpState.search=this.value; window.scheduleRender()">
                        </div>
                        
                        <div class="flex gap-2">
                            <select onchange="window.erpState.categoryFilter=this.value; window.renderApp()" class="px-6 py-4 bg-white border border-slate-200 rounded-[28px] font-black text-[10px] uppercase tracking-widest outline-none focus:border-indigo-500 transition-all shadow-sm">
                                <option value="">Global Catalog</option>
                                ${categories.map(c => `<option value="${c}" ${catFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                            
                            <button onclick="window.openAddItem()" class="bg-indigo-600 text-white px-8 py-4 rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-3">
                                <i data-lucide="plus" class="w-4 h-4"></i> New Entry
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Enhanced Item Grid -->
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div class="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                    ${filtered.map(i => `
                    <div class="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-200 transition-all group cursor-pointer relative overflow-hidden" onclick="window.editItem('${i.id}')">
                        <div class="absolute -right-6 -top-6 w-24 h-24 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors duration-500"></div>
                        
                        <div class="relative z-10 mb-8">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">${i.sku || 'SKU'}</span>
                                <span class="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.2em]">${i.category || 'General'}</span>
                            </div>
                            <h3 class="font-black text-slate-800 text-lg leading-tight line-clamp-2 uppercase tracking-tight">${i.name}</h3>
                        </div>

                        <div class="grid grid-cols-2 gap-6 pt-6 border-t border-slate-50 relative z-10">
                            <div>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Availability</p>
                                <p class="text-2xl font-black ${i.stock <= 5 ? 'text-rose-500' : 'text-slate-900'} tracking-tighter">
                                    ${i.stock} <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">${i.soldBy || 'pcs'}</span>
                                </p>
                            </div>
                            <div class="text-right">
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Price Point</p>
                                <p class="text-2xl font-black text-indigo-600 tracking-tighter">${fmt(i.sellingPrice)}</p>
                            </div>
                        </div>
                        
                        <div class="mt-6 flex items-center justify-between relative z-10 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                             <div class="flex items-center gap-1.5">
                                 <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                 <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active SKU</p>
                             </div>
                             <i data-lucide="arrow-right" class="w-4 h-4 text-indigo-500"></i>
                        </div>
                    </div>
                    `).join('')}
                    
                    ${filtered.length === 0 ? `
                    <div class="col-span-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                        <i data-lucide="package-search" class="w-20 h-20 mb-6 text-slate-300"></i>
                        <p class="font-black text-2xl text-slate-800 tracking-tighter uppercase">No Match Found</p>
                        <p class="text-sm font-bold text-slate-400 mt-2">Adjust your filters or register a new SKU.</p>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- Administrative Dashboard Footer -->
            <div class="p-8 bg-white border-t border-slate-200/60 flex flex-col md:flex-row items-center justify-between gap-6 backdrop-blur-xl">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                        <i data-lucide="database" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registry Controls</p>
                        <p class="text-xs font-black text-slate-900 uppercase">System Administration Mode</p>
                    </div>
                </div>
                
                <div class="flex gap-4">
                    <button onclick="window.exportItems()" class="px-8 py-4 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all active:scale-95 flex items-center gap-3">
                        <i data-lucide="download" class="w-4 h-4"></i> Export Ledger
                    </button>
                    <label class="px-8 py-4 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all cursor-pointer flex items-center gap-3 active:scale-95">
                        <i data-lucide="upload" class="w-4 h-4"></i> Sync Bulk <input type="file" onchange="window.importCSV(event)" class="hidden">
                    </label>
                    <button onclick="window.deleteAllItems()" class="px-8 py-4 bg-rose-50 text-rose-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-rose-500 hover:text-white transition-all active:scale-95 flex items-center gap-3">
                        <i data-lucide="trash-2" class="w-4 h-4"></i> Reset Master
                    </button>
                </div>
            </div>
        </div>
        `;
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
                
                <div class="space-y-6 relative">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Product Descriptor</label>
                        <input id="ai_name" placeholder="E.g. Lavender Cotton Blend" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-300">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Classification</label>
                            <input id="ai_category" list="cat-opts" placeholder="Select Group" class="px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                            <datalist id="cat-opts">${[...new Set((window.erpState.items || []).map(i => i.category).filter(Boolean))].map(c => `<option value="${c}">`).join('')}</datalist>
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Measurement Unit</label>
                            <select id="ai_soldBy" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] outline-none appearance-none">
                                <option value="pcs">Pieces</option>
                                <option value="mtr">Meters</option>
                                <option value="kg">Kilograms</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Opening Stock</label>
                            <input id="ai_stock" type="number" placeholder="0" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] pl-2">Market Price ₹</label>
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

             const sku = "LL" + (window.erpState.items.length + 1001).toString().padStart(5, "0");
             
             await ITEMS_COL().add({
                 name,
                 category: document.getElementById('ai_category').value || 'Uncategorized',
                 soldBy: document.getElementById('ai_soldBy').value,
                 stock: parseFloat(document.getElementById('ai_stock').value || 0),
                 sellingPrice: parseFloat(document.getElementById('ai_price').value || 0),
                 costPrice: 0,
                 sku, barcode: sku,
                 timestamp: Date.now()
             });
             modal.remove();
             window.renderApp();
        };
    };    window.editItem = function(id) {
        const it = (window.erpState.items || []).find(x => x.id === id);
        if(!it) return;

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-rose-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
                <div class="flex justify-between items-center mb-8 relative">
                    <div>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">${it.sku}</p>
                        <h2 class="text-2xl font-black text-slate-900 tracking-tighter uppercase">Modify SKU</h2>
                    </div>
                    <button onclick="window.confirmDeleteItem('${id}')" class="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>

                <div class="space-y-6 relative">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Product Name</label>
                        <input id="ei_name" value="${it.name}" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-6">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Curated Stock</label>
                            <input id="ei_stock" type="number" value="${it.stock}" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-2xl outline-none focus:ring-4 focus:ring-indigo-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-indigo-500 uppercase tracking-widest pl-2">Unit Price</label>
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
                stock: parseFloat(document.getElementById('ei_stock').value || 0),
                sellingPrice: parseFloat(document.getElementById('ei_price').value || 0),
                lastUpdated: Date.now()
            });
            modal.remove();
            window.renderApp();
        };
    };

    window.confirmDeleteItem = async (id) => {
        if(!confirm("DANGER: Permanently excise this SKU from the registry?")) return;
        await ITEMS_COL().doc(id).delete();
        document.querySelectorAll(".fixed.inset-0").forEach(m => m.remove());
        window.renderApp();
    };

    window.exportItems = () => {
        const data = (window.erpState.items || []).map(i => ({
            "SKU": i.sku,
            "Product": i.name,
            "Category": i.category,
            "Stock": i.stock,
            "Price": i.sellingPrice
        }));
        const csv = [
            Object.keys(data[0] || {}).join(','),
            ...data.map(row => Object.values(row).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lavish-stock-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    window.deleteAllItems = async () => {
        if(!confirm("CRITICAL: This will destroy the ENTIRE stock registry. Proceed?")) return;
        const pin = prompt("Administrative Credentials required:");
        if(pin !== '1234') return;
        
        for(let it of (window.erpState.items || [])) {
            await ITEMS_COL().doc(it.id).delete();
        }
        alert("Stock Master Formalized.");
        window.renderApp();
    };

    window.importCSV = async (e) => {
        const file = e.target.files[0]; if(!file) return;
        const text = await file.text();
        let rows = text.split("\n").map(r => r.split(",").map(c => c.trim()));
        rows.shift();
        
        for(let r of rows){
            if(!r[0]) continue;
            await ITEMS_COL().add({
                name: r[1], sku: r[0], category: r[2] || 'Legacy', stock: parseFloat(r[3]||0),
                sellingPrice: parseFloat(r[4]||0), timestamp: Date.now()
            });
        }
        alert("Batch synchronization complete.");
    };

})();
