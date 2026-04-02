
// POS Shared Logic & State Management
(function() {
    // Re-bind helpers for convenience
    const fmt = window.fmt;
    const db = window.FB?.db;

    const DATA_PATH = (col) => {
        if (col === 'clients') return window.FB.root(col);
        return window.FB.collection(col);
    };

    // --- POS State Extensions ---
    window.erpState.editingInvoiceId = null;
    window.erpState.editingInvoiceBillNo = null;

    // --- EDIT INVOICE LOGIC ---
    window.editInvoice = (id) => {
        let sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) {
            sale = window.erpState.orders.find(o => o.id === id);
        }
        if (!sale) return;

        // Confirmation to prevent accidental cart loss
        if (window.erpState.cart.length > 0 && !window.erpState.editingInvoiceId) {
            if (!confirm("This will clear your current cart and load the items from this bill for editing. Proceed?")) return;
        }

        // Set state for editing with normalization to prevent NaN errors
        window.erpState.cart = (sale.items || []).map(it => ({
            ...it,
            qty: parseFloat(it.qty || it.quantity || 1),
            price: parseFloat(it.price || it.sellingPrice || 0),
            cost: parseFloat(it.cost || it.costPrice || 0)
        }));
        
        window.erpState.editingInvoiceId = id;
        window.erpState.editingInvoiceBillNo = sale.billNo;
        window.erpState.customerPhone = sale.customerPhone || sale.phone || "";
        window.erpState.customerName = sale.customerName || "";
        
        // Match settings if available
        if (sale.taxIdx !== undefined) window.erpState.activeTax = sale.taxIdx;
        
        // Switch to POS tab
        window.erpState.tab = 'pos';
        
        // Remove the modal if this was called from inside the receipt
        document.getElementById('receipt-modal')?.remove();
        
        window.erpAlert(`Editing Bill: ${sale.billNo}. You can now modify items and re-checkout to update the record.`, "Edit Mode", "pencil");
        window.renderApp();
    };

    window.cancelEdit = () => {
        if (!confirm("Discard changes and exit edit mode?")) return;
        window.erpState.editingInvoiceId = null;
        window.erpState.editingInvoiceBillNo = null;
        window.erpState.cart = [];
        window.erpState.customerPhone = "";
        window.erpState.customerName = "";
        
        // Return to receipts tab automatically
        window.erpState.tab = 'receipts';
        
        window.renderApp();
    };

    // --- LOYALTY SYSTEM CONSTANTS ---
    window.LOYALTY = {
        TIERS: {
            basic:   { label: 'Basic',   min: 0,      pct: 0.02, color: 'slate' },
            silver:  { label: 'Silver',  min: 25000,  pct: 0.03, color: 'indigo' },
            gold:    { label: 'Gold',    min: 50000,  pct: 0.05, color: 'amber' },
            premium: { label: 'Premium', min: 100000, pct: 0.05, color: 'rose' }
        },
        MIN_REDEMPTION: 500,
        BONUS_THRESHOLD: 10000,
        BONUS_POINTS: 200
    };

    window.getLoyaltyTier = (spent) => {
        if (spent >= LOYALTY.TIERS.premium.min) return 'premium';
        if (spent >= LOYALTY.TIERS.gold.min) return 'gold';
        if (spent >= LOYALTY.TIERS.silver.min) return 'silver';
        return 'basic';
    };

    window.calcPoints = (amount, tierKey) => {
        const tier = LOYALTY.TIERS[tierKey] || LOYALTY.TIERS.basic;
        let points = Math.floor(amount * tier.pct);
        if (amount >= LOYALTY.BONUS_THRESHOLD) points += LOYALTY.BONUS_POINTS;
        return points;
    };

    // --- POS RENDERER ---
    window.renderPOS = function () {
        const cartSubtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
        const cartCount = window.erpState.cart.reduce((a, b) => a + b.qty, 0);
        
        // Tab switching within POS
        let content = '';
        switch(window.erpState.tab) {
            case 'pos': content = renderPOSTerminal(); break;
            case 'receipts':
            case 'history': content = renderHistory(); break;
            case 'dues': content = renderPendingDues(); break;
            case 'voided': content = renderVoided(); break;
            case 'tickets': content = renderTickets(); break;
            case 'clients': content = renderClients(); break;
            case 'settings': content = renderSettings(); break;
            case 'reports': content = renderMasterReports(); break;
            default: content = renderPOSTerminal();
        }

        return `
        <div class="flex h-full overflow-hidden bg-slate-50 relative">
            <!-- Main Content Area -->
            <div class="flex-1 flex flex-col overflow-hidden">
                ${content}
            </div>

            <!-- Global Cart Panel (Always visible in POS tab on Desktop) -->
            ${window.erpState.tab === 'pos' ? `
                <div class="hidden lg:flex w-96 relative z-20 shadow-[-10px_0_20px_rgba(0,0,0,0.03)] border-l border-slate-100 bg-white flex-col">
                    ${renderCartPanel(cartSubtotal, cartCount)}
                </div>
            ` : ''}

            <!-- Mobile Cart Pill -->
            ${window.erpState.tab === 'pos' ? renderMobileCartPill(cartSubtotal, cartCount) : ''}

            <!-- Mobile Cart Modal -->
            ${window.erpState.mobileCartOpen ? renderMobileCartModal(cartSubtotal, cartCount) : ''}
        </div>
        `;
    };

    function renderPOSGridContent() {
        const s = (window.erpState.search || '').toLowerCase();
        const cat = window.erpState.categoryFilter || '';
        return window.erpState.items
            .filter(i => {
                return (!cat || i.category === cat);
            })
            .map(it => {
                const matchQ = !s || it.name.toLowerCase().includes(s) || (it.sku && it.sku.toLowerCase().includes(s));
                return `
            <button data-item-sku="${it.sku || ''}" data-item-id="${it.id}" data-item-name="${(it.name || '').replace(/"/g, '&quot;')}" data-item-cat="${it.category || ''}" style="${matchQ ? '' : 'display: none;'}" onclick="window.addCart('${it.id}')" class="bg-white p-4 md:p-5 rounded-3xl md:rounded-[32px] border border-slate-100 shadow-sm hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10 transition-all text-left flex flex-col h-36 md:h-44 relative group">
                <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                    <i data-lucide="plus-circle" class="w-5 h-5 text-violet-500"></i>
                </div>
                <span class="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">${it.category || 'GENERAL'}</span>
                <h3 class="font-bold text-slate-800 text-xs md:text-sm mb-auto line-clamp-2 leading-tight">${it.name}</h3>
                <div class="mt-2 text-right md:text-left">
                    <p class="text-violet-600 font-black text-base md:text-lg">${fmt(it.sellingPrice)}</p>
                    ${it.stock <= 5 ? `<p class="text-[8px] md:text-[9px] font-black text-rose-500 uppercase mt-1">Low Stock: ${it.stock}</p>` : `<p class="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1">Stock: ${it.stock}</p>`}
                </div>
            </button>
            `;
            }).join('');
    }

    function renderPOSTerminal() {
        return `
        <div class="flex-1 flex flex-col p-6 overflow-hidden">
            <div class="flex flex-col md:flex-row gap-4 mb-6">
                <div class="relative flex-1">
                    <i data-lucide="search" class="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none"></i>
                    <input type="text" id="pos-search-input"
                        oninput="this.nextElementSibling?.classList.toggle('hidden', this.value.length === 0); window.erpState.search=this.value; window.filterPOSGrid(this.value);" 
                        onkeydown="if(event.key === 'Enter') { window.addCart(this.value); this.value=''; window.erpState.search=''; window.filterPOSGrid(''); }"
                        placeholder="Search products..." 
                        class="w-full pl-16 pr-14 py-5 bg-white border-2 border-slate-100 rounded-[32px] focus:outline-none focus:border-violet-500/40 shadow-xl shadow-slate-100/50 font-black text-xl md:text-base transition-all placeholder:text-slate-300 placeholder:font-bold"
                        value="${window.erpState.search || ''}">
                    <button onclick="const i=document.getElementById('pos-search-input'); i.value=''; i.oninput();" class="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors ${window.erpState.search ? '' : 'hidden'}">
                        <i data-lucide="x-circle" class="w-6 h-6"></i>
                    </button>
                </div>
                <div class="flex gap-2">
                    <select onchange="window.erpState.categoryFilter=this.value; window.renderApp()" class="flex-1 md:flex-none px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none">
                        <option value="">All Categories</option>
                        ${[...new Set(window.erpState.items.map(i => i.category).filter(Boolean))].map(c => `<option value="${c}" ${window.erpState.categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <button onclick="window.openAddItem()" class="px-6 py-3 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-violet-200 flex items-center gap-2 hover:bg-violet-700 transition-all active:scale-95 leading-none">
                        <i data-lucide="plus-circle" class="w-4 h-4"></i> Add Item
                    </button>
                </div>
            </div>

            <div id="posGrid" class="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-28 md:pb-6">
                ${renderPOSGridContent()}
            </div>
        </div>
        `;
    }

    window.updatePOSGrid = function() {
        const grid = document.getElementById('posGrid');
        if (!grid) return;
        grid.innerHTML = renderPOSGridContent();
        if (window.lucide) lucide.createIcons();
    };


    function renderCartPanel(subtotal, count) {
        return `
        <div class="flex-1 flex flex-col h-full bg-white">
            <div class="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 class="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                    <i data-lucide="shopping-bag" class="w-5 h-5 text-violet-600 hidden md:block"></i> 
                    ${window.erpState.editingInvoiceId ? `<span class="text-violet-600 flex items-center gap-1"><i data-lucide="pencil" class="w-3 h-3"></i> Editing ${window.erpState.editingInvoiceBillNo}</span>` : 'Shopping Cart'}
                </h2>
                <div class="flex items-center gap-3">
                    <span class="bg-violet-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-200">${count} Items</span>
                    <button onclick="window.erpState.mobileCartOpen=false; window.renderApp();" class="lg:hidden w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4 custom-scrollbar">
                ${window.erpState.cart.map((it, idx) => `
                    <div class="flex gap-4 p-4 bg-slate-50 border border-slate-100 md:rounded-[24px] rounded-2xl relative group hover:bg-white hover:border-violet-200 transition-all">
                            <div class="flex flex-col gap-0.5">
                                <h4 class="font-black text-slate-800 text-xs truncate max-w-[140px]">${it.name}</h4>
                                <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                    <span class="text-violet-600 font-black">
                                        ${it.qty !== 1 ? `${it.qty}${it.unit || (it.soldBy === 'weight' ? 'm' : '')} x ${fmt(it.price)} = ${fmt(it.price * it.qty)}` : fmt(it.price)}
                                    </span>
                                    <button onclick="window.openEditCartItemPrice(${idx})" class="text-violet-400 hover:text-violet-600 hover:underline">Edit</button>
                                </div>
                            </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.adjustQty(${idx}, -1)" class="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-rose-400 hover:text-rose-500 transition-all">-</button>
                            <span onclick="window.editCartItemQty(${idx})" class="w-8 text-center font-black text-sm cursor-pointer hover:text-violet-600 hover:underline" title="Click to edit quantity">${it.qty}</span>
                            <button onclick="window.adjustQty(${idx}, 1)" class="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-emerald-400 hover:text-emerald-500 transition-all">+</button>
                        </div>
                    </div>
                `).join('') || `
                <div class="h-full flex flex-col items-center justify-center text-slate-300 italic opacity-50 px-10 text-center py-20">
                    <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <i data-lucide="shopping-bag" class="w-8 h-8"></i>
                    </div>
                    <p class="font-bold uppercase tracking-widest text-[10px]">Your cart is empty</p>
                    <p class="text-[10px] mt-2 normal-case font-medium">Select items to start billing.</p>
                </div>`}
            </div>

            <div class="p-6 md:p-8 bg-slate-50 border-t border-slate-100 space-y-4 h-[auto] shrink-0">
                <div class="space-y-2">
                    <div class="flex justify-between items-center text-slate-400 font-black text-[10px] uppercase tracking-widest">
                        <span>Subtotal</span>
                        <span>${fmt(subtotal)}</span>
                    </div>
                    
                    <!-- Internal Profit Gauge (Staff Only) -->
                    ${(() => {
                        const costPrice = window.erpState.cart.reduce((s, it) => s + ((it.cost || 0) * it.qty), 0);
                        const profit = subtotal - costPrice;
                        const margin = subtotal > 0 ? (profit / subtotal) * 100 : 0;
                        const marginColor = margin > 40 ? 'text-emerald-500' : margin > 20 ? 'text-amber-500' : 'text-rose-500';
                        if (window.erpState.cart.length === 0) return '';
                        return `
                        <div class="flex justify-between items-center py-2 px-4 bg-white border border-slate-100 rounded-xl mt-2 mb-4">
                            <div class="flex flex-col">
                                <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Internal Projection</span>
                                <span class="text-[10px] font-black ${marginColor} tracking-tighter uppercase leading-none">Margin: ${margin.toFixed(1)}%</span>
                            </div>
                            <div class="text-right">
                                <span class="text-[10px] font-black text-slate-800 leading-none">Profit ₹${profit.toLocaleString()}</span>
                            </div>
                        </div>
                        `;
                    })()}

                    <div class="flex justify-between items-center text-slate-900 font-black text-xl md:text-2xl tracking-tighter">
                        <span>Total</span>
                        <span>${fmt(subtotal)}</span>
                    </div>
                </div>
                <button onclick="window.openChargeScreen()" class="w-full py-4 md:py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-violet-200 hover:bg-violet-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale" ${window.erpState.cart.length === 0 ? 'disabled' : ''}>
                    Complete Charge
                </button>
                <div class="flex gap-2">
                    <button onclick="window.saveTicket()" class="flex-1 py-3 justify-center bg-white border border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Save Ticket</button>
                    ${window.erpState.editingInvoiceId 
                        ? `<button onclick="window.cancelEdit()" class="px-5 py-3 justify-center bg-rose-50 text-rose-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">Exit Edit</button>`
                        : `<button onclick="if(confirm('Clear entire cart?')){window.erpState.cart=[]; window.erpState.mobileCartOpen=false; window.renderApp();}" class="px-5 py-3 justify-center bg-rose-50 text-rose-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">Clear</button>`
                    }
                </div>
            </div>
        </div>
        `;
    }

    function renderMobileCartPill(subtotal, count) {
        if(count === 0) return '';
        return `
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] lg:hidden w-[90%] max-w-[400px]">
            <button onclick="window.erpState.mobileCartOpen = true; window.renderApp();" class="w-full flex items-center justify-between bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-sm shadow-2xl shadow-slate-900/50 active:scale-95 transition-all outline-none border border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <i data-lucide="shopping-bag" class="w-5 h-5 text-violet-400"></i>
                        <span class="absolute -top-2 -right-2 bg-violet-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full shadow-md leading-none">${count}</span>
                    </div>
                    <span class="text-xs uppercase tracking-widest font-black text-slate-300">View Cart</span>
                </div>
                <span class="text-lg text-emerald-400">${fmt(subtotal)}</span>
            </button>
        </div>
        `;
    }

    function renderMobileCartModal(subtotal, count) {
        return `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex flex-col justify-end lg:hidden animate-fade-in transition-all">
            <div class="absolute inset-0 cursor-pointer" onclick="window.erpState.mobileCartOpen=false; window.renderApp();"></div>
            <div class="bg-white w-full h-[85vh] rounded-t-[40px] shadow-2xl relative overflow-hidden flex flex-col animate-slide-up">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2 shrink-0"></div>
                ${renderCartPanel(subtotal, count)}
            </div>
        </div>
        `;
    }

    // --- POS SEARCH (non-destructive — keeps input focus) ---
    window.filterPOSGrid = function(query) {
        const q = (query || '').toLowerCase().trim();
        const cat = window.erpState.categoryFilter || '';
        const grid = document.getElementById('posGrid');
        if (!grid) {
            // Grid not rendered yet — fall back to full render
            window.scheduleRender();
            return;
        }
        grid.querySelectorAll('[data-item-sku]').forEach(function(card) {
            const name = (card.dataset.itemName || '').toLowerCase();
            const sku  = (card.dataset.itemSku  || '').toLowerCase();
            const cardCat = card.dataset.itemCat || '';
            const matchQ   = !q   || name.includes(q) || sku.includes(q);
            const matchCat = !cat || cardCat === cat;
            card.style.display = (matchQ && matchCat) ? '' : 'none';
        });
    };

    // --- POS ACTIONS ---

    window.addCart = function (idOrSku, bypassDye = false) {
        // Priority 1: Match by Firestore ID (most reliable)
        let it = window.erpState.items.find(x => x.id === idOrSku);
        // Priority 2: Fallback to SKU for safety
        if (!it) it = window.erpState.items.find(x => String(x.sku) === String(idOrSku));
        
        if (!it) return;

        // Custom workflows for special items
        if (!bypassDye && (
            (it.category || '').toUpperCase() === 'DYING' || 
            (it.category || '').toUpperCase() === 'DYE' || 
            (it.category || '').toUpperCase() === 'DYE CHARGE' || 
            (it.name || '').toLowerCase().includes('dye-work')
        )) {
            return window.openDyeModal(it);
        }
        if (!bypassDye && (
            (it.category || '').toUpperCase() === 'STITCHING' || 
            (it.category || '').toUpperCase() === 'TAILORING' || 
            (it.category || '').toUpperCase() === 'TAILORING CHARGE' || 
            (it.name || '').toLowerCase().includes('stitch') || 
            (it.name || '').toLowerCase().includes('tailor')
        )) {
            return window.openStitchingModal(it);
        }

        // Logic for Weighted or Variable Price/Cost items
        const isWeighted = 
            it.soldBy === 'weight' || 
            it.soldBy === 'meter' || 
            it.soldBy === 'kg' || 
            String(it.unit || '').toLowerCase().includes('meter') || 
            String(it.unit || '').toLowerCase().includes('kg') || 
            (it.category || '').toLowerCase().includes('fabric') ||
            (it.category || '').toLowerCase().includes('unit');
            
        const needsPricing = (parseFloat(it.sellingPrice || 0) === 0 || parseFloat(it.costPrice || 0) === 0);

        if (isWeighted || needsPricing) {
            const modal = document.createElement("div");
            modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4";
            modal.innerHTML = `
                <div class="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100">
                    <h3 class="text-lg font-black text-slate-800 mb-1 truncate">${it.name}</h3>
                    <p class="text-[9px] text-slate-400 font-bold mb-6 uppercase tracking-widest">${isWeighted ? 'Measurement Required' : 'Manual Pricing Required'}</p>
                    
                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5 block">Quantity (${isWeighted ? 'Meters / Units' : 'Pieces'})</label>
                            <input id="q_input" type="number" step="0.01" value="${isWeighted ? '' : '1'}" placeholder="0.00" 
                                class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-violet-500 transition-all">
                        </div>
                        
                        ${needsPricing ? `
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5 block">Price / unit</label>
                                <input id="p_input" type="number" step="0.01" value="${it.sellingPrice || ''}" placeholder="0.00" 
                                    class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-lg text-center outline-none focus:border-violet-500 transition-all">
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5 block">Cost / unit</label>
                                <input id="c_input" type="number" step="0.01" value="${it.costPrice || ''}" placeholder="0.00" 
                                    class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-lg text-center outline-none focus:border-violet-500 transition-all">
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <div class="flex gap-3">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                        <button id="q_ok" class="flex-2 py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-violet-100 active:scale-95 transition-all">Add to Cart</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            
            const qInput = document.getElementById('q_input');
            const pInput = document.getElementById('p_input');
            const cInput = document.getElementById('c_input');
            
            // Auto-focus logic: focus quantity if weighted, otherwise focus price if it's missing
            setTimeout(() => {
                if (isWeighted || !needsPricing) qInput.focus();
                else pInput.focus();
            }, 150);
            
            document.getElementById('q_ok').onclick = () => {
                const q = parseFloat(qInput.value || 0);
                const p = needsPricing ? parseFloat(pInput.value || 0) : parseFloat(it.sellingPrice || 0);
                const c = needsPricing ? parseFloat(cInput.value || 0) : parseFloat(it.costPrice || 0);
                
                if (q <= 0) return alert("Please enter a valid quantity");
                if (needsPricing && p <= 0) return alert("Please enter a valid price");
                
                window.erpState.cart.push({ 
                    id: it.id,
                    sku: it.sku || '', 
                    name: it.name, 
                    price: p, 
                    cost: c, 
                    qty: q,
                    category: it.category,
                    unit: it.unit || '',
                    soldBy: isWeighted ? 'weight' : 'piece'
                });
                
                modal.remove();
                window.saveLocalState();
                window.renderApp();
            };
            return;
        }

        // Standard item addition (Piece based - existing logic)
        const existing = window.erpState.cart.find(x => x.id === it.id && x.price === parseFloat(it.sellingPrice || 0));
        if (existing) {
            existing.qty++;
        } else {
            window.erpState.cart.push({ 
                id: it.id,
                sku: it.sku || '', 
                name: it.name, 
                price: parseFloat(it.sellingPrice || 0), 
                cost: parseFloat(it.costPrice || 0), 
                qty: 1,
                category: it.category,
                unit: it.unit || '',
                soldBy: 'piece'
            });
        }
        window.saveLocalState();
        window.scheduleRender();
    };

    window.editCartItemQty = function(idx) {
        const item = window.erpState.cart[idx];
        const newQty = prompt(`Enter exact quantity for ${item.name} (e.g. 1.5, 2):`, item.qty);
        if (newQty !== null) {
            const q = parseFloat(newQty);
            if (!isNaN(q) && q > 0) {
                item.qty = q;
                window.scheduleRender();
            } else if (q === 0) {
                window.erpState.cart.splice(idx, 1);
                window.scheduleRender();
            }
        }
    };

    window.adjustQty = function (idx, delta) {
        const item = window.erpState.cart[idx];
        item.qty += delta;
        if (item.qty <= 0) window.erpState.cart.splice(idx, 1);
        window.scheduleRender();
    };

    window.openEditCartItemPrice = function(idx) {
        const item = window.erpState.cart[idx];
        const newPrice = prompt(`Edit price for ${item.name}:`, item.price);
        if (newPrice !== null) {
            const p = parseFloat(newPrice);
            if (!isNaN(p) && p >= 0) {
                item.price = p;
                window.renderApp();
            }
        }
    };

    // --- REVENUE TRACKERS ---
    function renderHistory() {
        const salesList = (window.erpState.sales || [])
            .filter(s => (s.balanceDue || 0) <= 0) // Only show settled in history
            .map(s => {
                const dt = s.createdAt?.toMillis ? s.createdAt.toMillis() : (typeof s.createdAt === 'number' ? s.createdAt : new Date(s.date || Date.now()).getTime());
                return {
                    ...s,
                    _type: 'sale',
                    _sortDate: dt,
                    _displayDate: window.fmtDate(dt),
                    _orderDate: s.date ? window.fmtDate(s.date) : window.fmtDate(dt),
                    _balance: s.balanceDue || 0
                };
            });

        const ordersList = (window.erpState.orders || [])
            .filter(o => o.status === 'Delivered' && ((o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0)) <= 0) // Only show delivered AND settled in history
            .map(o => {
                const dt = o.createdAt?.toMillis ? o.createdAt.toMillis() : (typeof o.createdAt === 'number' ? o.createdAt : (o.timestamp || Date.now()));
                const bal = Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0));
                return {
                    ...o,
                    _type: 'order',
                    _sortDate: dt,
                    _displayDate: o.deliveryDate ? window.fmtDate(o.deliveryDate) : '-',
                    _orderDate: window.fmtDate(o.orderDate || dt),
                    customerPhone: o.phone,
                    _balance: bal
                };
            });

        const sortOrder = window.erpState.historySort || 'desc';
        const sortKey = window.erpState.historySortKey || 'date';

        let list = [...salesList, ...ordersList].sort((a,b) => {
            if (sortKey === 'balance') {
                return sortOrder === 'desc' ? b._balance - a._balance : a._balance - b._balance;
            }
            if (sortKey === 'bill') {
                const numA = parseInt((a.billNo || '').replace(/\D/g, '')) || 0;
                const numB = parseInt((b.billNo || '').replace(/\D/g, '')) || 0;
                return sortOrder === 'desc' ? numB - numA : numA - numB;
            }
            return sortOrder === 'desc' ? b._sortDate - a._sortDate : a._sortDate - b._sortDate;
        });
        
        const filter = window.erpState.historyFilter || 'all';
        const startOfToday = new Date().setHours(0,0,0,0);
        
        if (filter === 'today') {
            list = list.filter(l => l._sortDate >= startOfToday);
        } else if (filter === 'week') {
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            list = list.filter(l => l._sortDate >= weekAgo);
        } else if (filter === 'month') {
            const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            list = list.filter(l => l._sortDate >= monthAgo);
        }

        if (window.erpState.historySearch) {
            const q = window.erpState.historySearch.toLowerCase();
            list = list.filter(l => 
                (l.billNo || '').toLowerCase().includes(q) || 
                (l.customerName || '').toLowerCase().includes(q) || 
                (l.customerPhone || '').toLowerCase().includes(q)
            );
        }

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <header class="h-24 bg-white border-b border-slate-100 px-8 flex items-center justify-between z-40 sticky top-0 shadow-sm">
                <div>
                    <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">Receipts Ledger <span class="text-violet-600">v2.4.0</span></h2>
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Unified Sales & Tailoring Archive</p>
                </div>
                <div class="flex items-center gap-4">
                    <div class="flex bg-slate-100 p-1 rounded-2xl shrink-0">
                        ${['all', 'today', 'week', 'month'].map(f => `
                            <button onclick="window.erpState.historyFilter='${f}'; window.renderApp();" class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-violet-600 shadow-md ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}">${f}</button>
                        `).join('')}
                    </div>
                    <div class="h-10 w-px bg-slate-200 mx-2"></div>
                    <div class="flex items-center gap-2">
                        <select onchange="window.erpState.historySortKey=this.value; window.renderApp()" class="px-4 py-2.5 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="date" ${sortKey === 'date' ? 'selected' : ''}>Sort: Date</option>
                            <option value="balance" ${sortKey === 'balance' ? 'selected' : ''}>Sort: Balance</option>
                            <option value="bill" ${sortKey === 'bill' ? 'selected' : ''}>Sort: Bill No</option>
                        </select>
                        <button onclick="window.toggleHistorySort()" class="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm">
                            <i data-lucide="${window.erpState.historySort === 'desc' ? 'sort-desc' : 'sort-asc'}" class="w-4 h-4 text-violet-600"></i>
                        </button>
                    </div>
                    <div class="relative">
                        <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                        <input type="text" oninput="window.erpState.historySearch=this.value; window.scheduleRender()" value="${window.erpState.historySearch || ''}" placeholder="Search..." class="pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold w-48 outline-none focus:ring-2 focus:ring-violet-400 transition-all">
                    </div>
                </div>
            </header>
            
            <div class="flex-1 overflow-y-auto px-4 md:px-8 pb-4 md:pb-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-visible flex flex-col max-w-[1400px] mx-auto">
                    <div class="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-100 px-8 py-5 hidden md:grid grid-cols-[140px_120px_1fr_250px_90px_90px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400 border-l-4 border-transparent">
                        <div>Bill & Group</div>
                        <div>Date</div>
                        <div>Customer Info</div>
                        <div>Items / Progress</div>
                        <div class="text-right">Total</div>
                        <div class="text-right">Balance</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic uppercase tracking-widest text-[10px]">No records match your filters</div>` :
                            list.map(s => {
                                 const isRefund = s.refunded || (s.refundLog && s.refundLog.length > 0);
                                 const itemNames = (s.items || []).map(i => i.name).join(", ");
                                 const bal = s._balance;
                                 const breakdown = s.paymentBreakdown || {};
                                 let methodLabel = s.paymentMode || s.paymentMethod || 'Cash';
                                 if (methodLabel === 'Mixed') {
                                     methodLabel = `Mixed (C: ${window.fmt(breakdown.cash || 0)} | U: ${window.fmt(breakdown.upi || 0)})`;
                                 } else if (s.advanceMethod === 'Mixed' && s._type === 'order') {
                                     const ab = s.advanceBreakdown || {};
                                     methodLabel = `Mixed (C: ${window.fmt(ab.cash || 0)} | U: ${window.fmt(ab.upi || 0)})`;
                                 }

                                 return `
                                 <div onclick="window.openReceipt('${s.id}')" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[140px_120px_1fr_250px_90px_90px] gap-4 items-center hover:bg-violet-50/30 cursor-pointer transition-all group border-l-4 border-transparent hover:border-violet-500">
                                     <div class="flex flex-col">
                                         <div class="flex items-center gap-2 mb-1">
                                             <p class="text-base font-black text-slate-800 leading-tight group-hover:text-violet-600 transition-all">${window.esc(s.billNo || 'INV-000')}</p>
                                             <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${s._type === 'sale' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-600'}">
                                                 ${s._type === 'sale' ? 'POS' : 'TLR'}
                                             </span>
                                         </div>
                                         ${isRefund ? '<span class="w-fit px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[7px] font-black uppercase tracking-tighter">Refunded Case</span>' : ''}
                                         <span class="text-[8px] font-black text-indigo-400 uppercase tracking-widest mt-1">${window.esc(methodLabel)}</span>
                                     </div>
                                     <div class="flex flex-col">
                                         <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${s._orderDate}</p>
                                     </div>
                                     <div class="min-w-0">
                                         <p class="text-sm font-black text-slate-700 capitalize truncate mb-1">${window.esc(s.customerName || 'Walk-in Client')}</p>
                                         <p class="text-[10px] font-bold text-slate-400 truncate tracking-tight">${window.esc(s.customerPhone || '-')}</p>
                                     </div>
                                     <div class="min-w-0">
                                         <p class="text-[10px] font-bold text-slate-600 line-clamp-1 leading-tight uppercase mb-1">${window.esc(itemNames || 'Service Rendered')}</p>
                                         <div class="flex items-center gap-2">
                                             <span class="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-full text-[8px] font-black uppercase tracking-widest">${(s.items || []).length} units</span>
                                             ${s.status ? `<span class="px-2 py-0.5 bg-violet-50 text-violet-400 rounded-full text-[8px] font-black uppercase tracking-widest">${s.status}</span>` : ''}
                                         </div>
                                     </div>
                                     <div class="text-right">
                                         <p class="text-sm font-black text-slate-800">${window.fmt(s.total || s.totalCost)}</p>
                                     </div>
                                     <div class="text-right flex items-center justify-end gap-3">
                                         <button onclick="event.stopPropagation(); window.editInvoice('${s.id}')" class="p-2 text-slate-300 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all" title="Edit Invoice">
                                             <i data-lucide="pencil" class="w-4 h-4"></i>
                                         </button>
                                         <div class="text-right">
                                             ${bal > 0 
                                                 ? `<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-lg text-[11px] font-black tracking-tighter shadow-sm">${window.fmt(bal)}</span>` 
                                                 : `<span class="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-black tracking-tighter shadow-sm">SETTLED</span>`
                                             }
                                         </div>
                                     </div>
                                 </div>`;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderPendingDues() {
        const dueSearch = (window.erpState.dueSearch || '').toLowerCase();
        
        const posDues = (window.erpState.sales || [])
            .filter(s => (s.balanceDue || 0) > 0)
            .map(s => ({
                ...s,
                _type: 'sale',
                _balance: s.balanceDue,
                _displayDate: s.date ? new Date(s.date).toLocaleDateString() : '-'
            }));

        // Track bill numbers already handled in POS to avoid duplicates with Tailoring orders
        const posBillNos = new Set(posDues.map(s => s.billNo));

        const tailorDues = (window.erpState.orders || [])
            .map(o => {
                const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
                return { ...o, _balance: bal };
            })
            .filter(o => o._balance > 0 && !posBillNos.has(o.billNo))
            .map(o => ({
                ...o,
                _type: 'order',
                _displayDate: window.fmtDate(o.orderDate || o.timestamp)
            }));

        let list = [...posDues, ...tailorDues]
            .filter(s => !dueSearch || (s.billNo || '').toLowerCase().includes(dueSearch) || (s.customerPhone || '').includes(dueSearch) || (s.customerName || '').toLowerCase().includes(dueSearch))
            .sort((a,b) => b._balance - a._balance);

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <div class="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-6 border-b border-slate-200">
                <div class="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-1">Accounts Receivable</h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${list.length} Outstanding Invoices</p>
                    </div>
                    <div class="flex-1 relative max-w-md">
                        <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"></i>
                        <input type="text" placeholder="Search by Bill No or Client Phone..." value="${window.erpState.dueSearch || ''}" class="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-violet-400" oninput="window.erpState.dueSearch=this.value; window.scheduleRender()">
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-6 md:px-8 pb-6 md:pb-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col max-w-4xl mx-auto">
                    <div class="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-100 px-8 py-4 hidden md:grid grid-cols-[140px_1fr_140px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400">
                        <div>Bill Details</div>
                        <div>Customer Info</div>
                        <div class="text-right">Balance Due</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic">No pending dues found.</div>` :
                            list.map(s => `
                                <div onclick="window.openReceipt('${s.id}')" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[140px_1fr_140px] gap-x-4 gap-y-2 items-center hover:bg-slate-50/50 cursor-pointer transition-colors group">
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <p class="text-base font-black text-slate-800 leading-tight group-hover:text-rose-600 transition-colors">${window.esc(s.billNo)}</p>
                                            <span class="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${s._type === 'sale' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-600'}">
                                                ${s._type === 'sale' ? 'POS' : 'TLR'}
                                            </span>
                                        </div>
                                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">${s._displayDate}</p>
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-black text-slate-700 capitalize truncate">${window.esc(s.customerName || 'Client')}</p>
                                        <p class="text-[10px] font-bold text-slate-400">${window.esc(s.customerPhone || '-')}</p>
                                    </div>
                                    <div class="flex items-center gap-4 justify-end">
                                        <div class="text-right">
                                            <p class="text-lg font-black text-rose-600 tracking-tighter leading-none">${fmt(s._balance)}</p>
                                            <button onclick="event.stopPropagation(); window.sendReminder('${s.billNo}', '${s.customerName || 'Client'}', '${s.customerPhone || ''}', ${s._balance})" class="mt-1 text-[8px] font-black text-amber-500 uppercase tracking-widest hover:text-amber-600 transition-colors flex items-center gap-1">
                                                <i data-lucide="bell" class="w-2.5 h-2.5"></i> Reminder
                                            </button>
                                        </div>
                                    </div>
                                </div>`).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderClients() {
        const search = (window.erpState.clientSearch || '').toLowerCase();
        // Strict database filtering - ensure we are only showing verified Firebase records
        const list = (window.erpState.clients || [])
            .filter(c => c.phone && (!search || (c.name || '').toLowerCase().includes(search) || c.phone.includes(search)))
            .sort((a,b) => (a.name || 'Anonymous').localeCompare(b.name || 'Anonymous'));

        return `
        <div class="flex flex-col h-full bg-slate-50/50">
            <!-- Client Directory Header -->
            <div class="sticky top-0 z-20 bg-white/70 backdrop-blur-xl p-8 border-b border-slate-200/60">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-8 max-w-[1400px] mx-auto">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                            <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase">Client Intelligence</h2>
                        </div>
                        <p class="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">${list.length} Verified Partners</p>
                    </div>

                    <div class="flex flex-1 items-center gap-4 max-w-2xl">
                        <div class="group relative flex-1">
                            <i data-lucide="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors"></i>
                            <input type="text" 
                                placeholder="Search by name, digits or history..." 
                                value="${window.erpState.clientSearch || ''}" 
                                class="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-[28px] text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                oninput="window.erpState.clientSearch=this.value; window.scheduleRender()">
                        </div>
                        <button onclick="window.openAddClient()" class="bg-indigo-600 text-white px-8 py-4 rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-slate-900 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-3">
                            <i data-lucide="user-plus" class="w-4 h-4"></i> New Record
                        </button>
                    </div>
                </div>
            </div>

            <!-- Client Grid -->
            <div class="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div class="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                    ${list.map(c => `
                        <div onclick="window.openClientProfile('${c.id}')" class="bg-white p-4 md:p-8 rounded-[24px] md:rounded-[48px] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-200 transition-all group cursor-pointer relative overflow-hidden flex flex-col items-center text-center">
                            <div class="absolute -right-6 -top-6 w-16 h-16 md:w-24 md:h-24 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors duration-500"></div>
                            
                            <div class="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[24px] bg-slate-900 text-white flex items-center justify-center font-black text-xl md:text-2xl shadow-xl group-hover:bg-indigo-600 transition-colors duration-500 mb-4 md:mb-8 mx-auto relative z-10">
                                ${c.name ? c.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            
                            <div class="min-w-0 mb-4 md:mb-6 flex-1">
                                <h4 class="font-black text-slate-800 text-xs md:text-lg truncate uppercase tracking-tight leading-none mb-1 shadow-inner px-1">${window.esc(c.name || 'Legacy Client')}</h4>
                                <p class="text-[8px] md:text-[11px] font-black font-mono tracking-wider text-indigo-500">${window.esc(c.phone)}</p>
                            </div>

                            <div class="w-full flex items-center justify-between px-3 md:px-6 py-2 md:py-4 bg-slate-50 rounded-xl md:rounded-[28px] border border-slate-100 mb-4 md:mb-6 relative z-10 group-hover:bg-white group-hover:border-indigo-100 transition-all">
                                <div class="text-left">
                                    <p class="text-[6px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pulse</p>
                                    <p class="text-[10px] md:text-sm font-black text-slate-900">${(c.loyaltyPoints || 0).toLocaleString()} <span class="text-[7px] md:text-[9px] text-indigo-500">PTS</span></p>
                                </div>
                                <div class="text-right">
                                    <p class="text-[6px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Tier</p>
                                    <p class="text-[7px] md:text-[9px] font-black text-indigo-600 uppercase tracking-tighter">${(window.erpState.loyalty?.enabled !== false) ? (c.loyaltyTier || 'Basic') : 'Std'}</p>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-2 w-full pt-4 border-t border-slate-50 relative z-10">
                                <a href="tel:${c.phone}" onclick="event.stopPropagation()" class="py-2.5 bg-indigo-50 text-indigo-600 rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-1.5">
                                    <i data-lucide="phone-call" class="w-3 h-3 md:w-4 md:h-4"></i> Call
                                </a>
                                <button onclick="event.stopPropagation(); window.shareWhatsApp('', '${window.esc(c.name)}', '${window.esc(c.phone)}', 0)" class="py-2.5 bg-emerald-50 text-emerald-600 rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1.5">
                                    <i data-lucide="message-circle" class="w-3 h-3 md:w-4 md:h-4"></i> WA
                                </button>
                            </div>
                        </div>
                    `).join('')}
                    
                    ${list.length === 0 ? `
                        <div class="col-span-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                            <i data-lucide="users" class="w-20 h-20 mb-6 text-slate-300"></i>
                            <p class="font-black text-2xl text-slate-800 tracking-tighter uppercase">No Records Found</p>
                            <p class="text-sm font-bold text-slate-400 mt-2">Try adjusting your filters or add a new boutique partner.</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }

    function renderTickets() {
        // ... Logic for saved tickets ...
        return `
        <div class="p-4 md:p-8">
            <h2 class="text-xl md:text-2xl font-black mb-6 uppercase tracking-tight">Saved Tickets / Tables</h2>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                ${(window.erpState.tickets || []).map((t, idx) => `
                    <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                        <div class="flex justify-between items-start mb-4">
                            <h3 class="font-black text-lg">${t.customer}</h3>
                            <span class="text-[10px] font-black text-slate-400">${t.time}</span>
                        </div>
                        <div class="space-y-1 mb-6">
                            ${t.items.map(it => `<div class="flex justify-between text-xs font-bold text-slate-500"><span>${it.qty}x ${it.name}</span><span>${fmt(it.price * it.qty)}</span></div>`).join('')}
                        </div>
                        <div class="flex items-center justify-between pt-4 border-t border-slate-50">
                            <span class="text-xl font-black">${fmt(t.total)}</span>
                            <div class="flex gap-2">
                                <button onclick="window.deleteTicket(${idx})" class="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                <button onclick="window.loadTicket(${idx})" class="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">Load</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${(window.erpState.tickets || []).length === 0 ? `<div class="col-span-full py-20 text-center text-slate-300 italic">No saved tickets.</div>` : ''}
            </div>
        </div>
        `;
    }

    function renderMasterReports() {
        return `
        <div class="p-8 overflow-y-auto h-full custom-scrollbar">
            <div class="max-w-4xl mx-auto">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-3xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-3">
                            <i data-lucide="file-spreadsheet" class="w-8 h-8 text-emerald-600"></i>
                            Master Analytics Center
                        </h2>
                        <p class="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Export high-fidelity business intelligence</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div class="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl shadow-slate-200/20">
                        <h3 class="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 mb-8 flex items-center gap-2">
                             <span class="w-2 h-2 bg-indigo-500 rounded-full"></span> Logic Filter
                        </h3>
                        <div class="grid grid-cols-2 gap-3 mb-8">
                            ${['today', 'weekly', 'monthly', 'all'].map(f => `
                                <button onclick="window.erpState.dashboardFilter='${f}';window.renderApp();" class="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${window.erpState.dashboardFilter === f ? 'bg-slate-900 text-white shadow-xl scale-[1.02]' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}">${f}</button>
                            `).join('')}
                        </div>
                        
                        <button onclick="window.exportAreaReport('master')" class="w-full py-6 bg-emerald-600 text-white rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                            <i data-lucide="download" class="w-5 h-5 group-hover:translate-y-0.5 transition-transform"></i>
                            Generate Master XLSX
                        </button>
                    </div>

                    <div class="space-y-4">
                        ${[
                            { id: 'sales', label: 'Sales History', sub: 'Revenue tracking', color: 'emerald', icon: 'shopping-cart' },
                            { id: 'expenses', label: 'Expense Records', sub: 'Burn rate data', color: 'rose', icon: 'wallet' },
                            { id: 'dues', label: 'Pending Dues', sub: 'Credit management', color: 'orange', icon: 'alert-circle' },
                            { id: 'inventory', label: 'Inventory Master', sub: 'Stock auditing', color: 'indigo', icon: 'package' }
                        ].map(r => `
                            <div class="bg-white p-7 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-${r.color}-200 hover:shadow-lg transition-all cursor-pointer" onclick="window.exportAreaReport('${r.id}')">
                                <div class="flex items-center gap-5">
                                    <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-${r.color}-50 group-hover:text-${r.color}-500 transition-colors">
                                        <i data-lucide="${r.icon}" class="w-5 h-5"></i>
                                    </div>
                                    <div>
                                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-${r.color}-400">${r.sub}</p>
                                        <h4 class="font-black text-slate-800 text-sm tracking-tight">${r.label}</h4>
                                    </div>
                                </div>
                                <i data-lucide="chevron-right" class="w-4 h-4 text-slate-200 group-hover:text-${r.color}-400 group-hover:translate-x-1 transition-all"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="bg-indigo-600 p-10 rounded-[48px] text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                    <div class="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div class="text-center md:text-left">
                            <h3 class="text-2xl font-black tracking-tight mb-2">Audit Synchronization</h3>
                            <p class="text-white/60 text-xs font-bold uppercase tracking-widest">Ensuring database integrity Across all boutique vectors</p>
                        </div>
                        <button onclick="window.exportAreaReport('clients')" class="px-8 py-5 bg-white text-indigo-600 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-900 hover:text-white transition-all active:scale-95 flex items-center gap-3">
                             <i data-lucide="users" class="w-4 h-4"></i> Export Client Directory
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderSettings() {
        const section = window.erpState.activeSettingsSection || 'menu';

        // DASHBOARD SETTINGS
        if (section === 'dashboard') {
            const dash = window.erpState.dashboardConfig || {};
            const allWidgets = [
                { id: 'todaySales',       label: "Total Inflow (Cash+UPI)", icon: 'trending-up',    desc: 'Combined daily inflow stats' },
                { id: 'expenseTracker',   label: 'Total Outflow (Cash+UPI)', icon: 'receipt',        desc: 'Combined daily outflow tracking' },
                { id: 'todayCashIn',      label: 'Cash Inflow',            icon: 'arrow-down-left', desc: 'Today\'s cash collection' },
                { id: 'todayCashOut',     label: 'Cash Outflow',           icon: 'arrow-up-right',  desc: 'Today\'s cash expenses' },
                { id: 'todayUpiIn',       label: 'UPI Inflow',             icon: 'smartphone',      desc: 'Today\'s digital collection' },
                { id: 'todayUpiOut',      label: 'UPI Outflow',            icon: 'credit-card',     desc: 'Today\'s digital expenses' },
                { id: 'totalSales',       label: 'Net Revenue',          icon: 'bar-chart-2',    desc: 'Combined revenue stats' },
                { id: 'tailoringPending', label: 'Tailoring Tracker',    icon: 'scissors',       desc: 'Active, Overdue, Urgent orders' },
                { id: 'pendingDues',      label: 'Balance Dues',         icon: 'clock',          desc: 'Outstanding payments' },
                { id: 'inventory',        label: 'Stock Alerts',         icon: 'package',        desc: 'Inventory health stats' },
                { id: 'revenueChart',     label: 'Revenue Graph',        icon: 'activity',       desc: 'Visual sales trends' },
                { id: 'recentFlux',       label: 'Recent Activity',      icon: 'list',           desc: 'Feed of latest sales transactions' },
                { id: 'topItems',         label: 'Top Products',         icon: 'star',           desc: 'Best selling item leaderboard' },
                { id: 'clientCount',      label: 'Client database',      icon: 'users',          desc: 'Total registered customers' },
                { id: 'loyaltyStats',     label: 'Loyalty Tiers',        icon: 'gift',           desc: 'Member distribution' },
                { id: 'crmInsights',      label: 'CRM Analysis',         icon: 'target',         desc: 'Retention & repeat rates' },
                { id: 'staffActivity',    label: 'Staff Leaderboard',    icon: 'user-check',     desc: 'Sales performance per staff' },
            ];

            return `
            <div id="settings-scroll-container" class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                                <i data-lucide="layout-dashboard" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Dashboard Widgets</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Toggle which widgets appear on your dashboard</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            ${allWidgets.map(w => `
                                <div class="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                                            <i data-lucide="${w.icon}" class="w-4 h-4 text-indigo-500"></i>
                                        </div>
                                        <div>
                                            <p class="font-black text-sm text-slate-800">${w.label}</p>
                                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">${w.desc}</p>
                                        </div>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                                        <input type="checkbox" class="sr-only peer" ${dash[w.id] !== false ? 'checked' : ''} onchange="window.toggleDashWidget('${w.id}', this.checked)">
                                        <div class="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>
                            `).join('')}
                        </div>

                        <div class="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 text-center">
                            <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Changes apply instantly · Synced with cloud</p>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // OVERVIEW MENU
        if (section === 'menu') {
            const menuItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', color: 'indigo', sub: 'Widget Visibility' },
                { id: 'printer', label: 'Printer Setup', icon: 'printer', color: 'slate', sub: 'Width & Formatting' },
                { id: 'whatsapp', label: 'WA Templates', icon: 'message-square', color: 'emerald', sub: 'Message Content' },
                { id: 'tax', label: 'Tax Rules', icon: 'hash', color: 'violet', sub: 'GST & Local Taxes' },
                { id: 'discount', label: 'Discounts', icon: 'tag', color: 'rose', sub: 'Global Offers' },
                { id: 'loyalty', label: 'Loyalty', icon: 'star', color: 'amber', sub: 'Rewards & Tiers' },
                { id: 'admin', label: 'Admin', icon: 'shield-check', color: 'indigo', sub: 'Staff & Records' }
            ];

            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${menuItems.map(item => `
                        <button onclick="window.erpState.activeSettingsSection='${item.id}'; window.renderApp();" 
                            class="bg-white p-8 rounded-[40px] border-2 border-transparent hover:border-${item.color}-600 transition-all shadow-sm hover:shadow-2xl hover:shadow-${item.color}-500/10 flex flex-col items-center text-center group">
                            <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-${item.color}-50 transition-colors">
                                <i data-lucide="${item.icon}" class="w-8 h-8 text-${item.color}-500 group-hover:scale-110 transition-transform"></i>
                            </div>
                            <h3 class="font-black text-slate-800 text-sm uppercase tracking-tighter mb-1">${item.label}</h3>
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${item.sub}</p>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }



        // WHATSAPP SECTION
        if (section === 'whatsapp') {
            const templates = window.erpState.whatsappTemplates || {
                booking: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully booked.\n\n*Bill No:* {billNo}\n*Amount:* Rs.{totalCost}\n*Advance:* Rs.{advancePaid}\n*Balance:* Rs.{balance}\n\n*Pickup Date:* {deliveryDate}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you for choosing Lavish Lavender. 🙏',
                ready: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nGood news! Your order is ready for pickup. ✅\n\n*Bill No:* {billNo}\n*Balance Payable:* Rs.{balance}\n\n📍 *Location:*\nhttps://share.google/iR4s2zrLMHoiTTZ66\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nSee you soon! 🙏',
                delivered: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully delivered. ✅\n\n*Receipt:* 📄\nhttps://www.lavishlavender.in/receipt/?bill={billNo}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you! 🙏',
                reminder: 'Hi {customerName}, 🌸 Friendly reminder from *Lavish Lavender* for bill *{billNo}*.\n\nPending: *Rs.{balance}*.\n\n✨ *Loyalty Status*\n{totalPoints} Total PT | {tier} Tier\n\nVisit again! 🙏'
            };

            return `
            <div id="settings-scroll-container" class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-3xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="space-y-8 mb-10">
                            ${Object.entries(templates).map(([key, value]) => `
                                <div class="space-y-3">
                                    <div class="flex justify-between items-center px-1">
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${key.replace('_', ' ')} Logic</label>
                                        <span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Enabled</span>
                                    </div>
                                    <textarea id="temp_${key}" class="w-full p-6 bg-slate-50 border-none rounded-[32px] font-medium text-sm text-slate-700 min-h-[150px] focus:ring-2 focus:ring-emerald-400 outline-none shadow-inner">${value}</textarea>
                                </div>
                            `).join('')}
                        </div>
                        <div class="flex gap-4">
                            <button onclick="window.saveTemplates()" class="flex-1 py-6 bg-emerald-600 text-white rounded-[32px] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-200 hover:bg-emerald-800 transition-all flex items-center justify-center gap-3 active:scale-95 leading-none">
                                <i data-lucide="save" class="w-5 h-5"></i> Save Changes
                            </button>
                            <button onclick="window.resetWATemplates()" class="px-8 py-6 bg-slate-100 text-slate-400 rounded-[32px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 hover:text-slate-600 transition-all active:scale-95 leading-none">
                                Reset Default
                            </button>
                        </div>
                    </div>
                    <div class="bg-indigo-600 p-8 rounded-[40px] text-white/90 shadow-xl shadow-indigo-100">
                        <h4 class="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-white">Injection Tokens (Placeholders)</h4>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            ${['customerName', 'billNo', 'totalCost', 'advancePaid', 'balance', 'deliveryDate', 'pointsEarned', 'totalPoints', 'tier'].map(t => `
                                <div class="bg-white/10 px-4 py-2 rounded-xl text-[10px] font-mono font-bold">{${t}}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // TAX SECTION
        if (section === 'tax') {
            return `
            <div id="settings-scroll-container" class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="flex justify-between items-center mb-6 px-1">
                            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Establishments GSTIN</h3>
                            <span class="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">Official</span>
                        </div>
                        <div class="flex gap-4">
                            <input id="pc_gstin" value="${window.erpState.gstin || ''}" placeholder="Enter GSTIN Number" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner">
                            <button onclick="window.updateGSTIN()" class="px-8 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all">Update</button>
                        </div>
                    </div>

                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">Create New Rule</h3>
                        <div class="flex gap-4">
                            <input id="new_tax_label" placeholder="e.g. VAT" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                            <input id="new_tax_val" type="number" placeholder="%" class="w-24 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-center outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                            <button onclick="window.addTaxRule()" class="px-8 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-100">Add Rule</button>
                        </div>
                    </div>

                    <div class="space-y-4">
                        ${window.erpState.taxes.map((t, idx) => `
                            <div class="bg-white p-6 rounded-[32px] border border-slate-100 flex justify-between items-center shadow-sm">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-violet-500 font-black text-xs shadow-inner">${t.val}%</div>
                                    <div>
                                        <p class="font-black text-slate-800 uppercase tracking-tight">${t.label}</p>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Rate</p>
                                    </div>
                                </div>
                                ${idx !== 0 ? `
                                    <button onclick="window.deleteTaxRule(${idx})" class="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                                    </button>
                                ` : `<span class="bg-slate-50 text-slate-300 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest">Default</span>`}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // DISCOUNT SECTION
        if (section === 'discount') {
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">New Promo Rule</h3>
                        <input id="new_disc_label" placeholder="e.g. Wedding Season Sale" class="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm mb-4 outline-none focus:ring-2 focus:ring-rose-400 shadow-inner">
                        <div class="flex gap-4">
                            <input id="new_disc_val" type="number" placeholder="Value" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-xl outline-none focus:ring-2 focus:ring-rose-400 shadow-inner">
                            <select id="new_disc_type" class="w-32 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none shadow-inner">
                                <option value="cash">₹ Cash</option>
                                <option value="pct">% Pct</option>
                            </select>
                            <button onclick="window.addDiscountRule()" class="px-10 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-xl">Save Rule</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${window.erpState.discounts.map((d, idx) => `
                            <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
                                <div class="flex items-center gap-4">
                                    <div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center font-black text-sm shadow-inner">
                                        ${d.type === 'cash' ? '₹' + d.val : d.val + '%'}
                                    </div>
                                    <div>
                                        <p class="font-black text-slate-800 text-sm tracking-tight line-clamp-1 truncate w-32 uppercase">${d.label}</p>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Deduction Rule</p>
                                    </div>
                                </div>
                                <button onclick="window.deleteDiscountRule(${idx})" class="p-3 text-slate-200 group-hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // LOYALTY SECTION
        if (section === 'loyalty') {
            const loyalty = window.erpState.loyalty || { enabled: true, pointsPer100: 5, eliteThreshold: 10000, goldThreshold: 50000 };
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center font-black">
                                <i data-lucide="star" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Loyalty Settings</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reward Points & Tiers</p>
                            </div>
                        </div>

                        <div class="space-y-6 mb-10">
                            <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h4 class="font-black text-sm uppercase text-slate-800">Enable Program</h4>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Activate loyalty points</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" id="loyalty_enabled" class="sr-only peer" ${loyalty.enabled ? 'checked' : ''}>
                                  <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                                </label>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Basic Pct (%)</label>
                                    <input id="loy_pct_basic" type="number" value="${(loyalty.tiers?.basic?.pct || 0.02) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-slate-800">
                                </div>
                                <div class="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                                    <label class="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Silver (₹25k+) Pct (%)</label>
                                    <input id="loy_pct_silver" type="number" value="${(loyalty.tiers?.silver?.pct || 0.03) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-indigo-600">
                                </div>
                                <div class="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                    <label class="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-2">Gold (₹50k+) Pct (%)</label>
                                    <input id="loy_pct_gold" type="number" value="${(loyalty.tiers?.gold?.pct || 0.05) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-amber-600">
                                </div>
                                <div class="bg-rose-50 p-6 rounded-3xl border border-rose-100">
                                    <label class="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2">Premium (₹100k+) Pct (%)</label>
                                    <input id="loy_pct_premium" type="number" value="${(loyalty.tiers?.premium?.pct || 0.05) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-rose-600">
                                </div>
                            </div>

                            <div class="p-6 bg-slate-50 rounded-3xl border border-slate-100 italic">
                               <p class="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">
                                 Note: Bonus +200 points automatically applied for orders over ₹10,000.
                                 Redemption unlocked at 500 points (1 Pt = ₹1).
                               </p>
                            </div>
                        </div>

                        <button onclick="window.saveLoyaltySettings()" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3">
                            <i data-lucide="save" class="w-4 h-4"></i>
                            Save Loyalty Config
                        </button>
                    </div>

                    <div class="bg-indigo-50 border border-indigo-100 p-8 rounded-[40px] text-center">
                        <p class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Maintenance Zone</p>
                        <h4 class="text-sm font-black text-indigo-900 mb-6 uppercase">Sync Points for all existing sales</h4>
                        <button onclick="window.syncLegacyLoyalty(event)" class="w-full py-5 bg-white border-2 border-indigo-200 text-indigo-600 rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-lg hover:bg-indigo-600 hover:text-white transition-all active:scale-95">
                            Recalculate & Migrate Data
                        </button>
                        <button onclick="window.standardizeClientNumbers(event)" class="w-full py-5 bg-white border-2 border-emerald-200 text-emerald-600 rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-lg hover:bg-emerald-600 hover:text-white transition-all active:scale-95 mt-4">
                            Standardize Client Records (Removes Duplicates)
                        </button>
                        <p class="text-[9px] text-indigo-400 font-bold mt-4 uppercase tracking-widest px-4 leading-relaxed">This will scan all previous POS & Tailoring orders to correctly set tiers and points for all customers.</p>
                    </div>
                </div>
            </div>`;
        }



        // PRINTER SECTION
        if (section === 'printer') {
            const pConf = window.erpState.printerConfig || { 
                width: '58', logo: '', header: 'Lavish Lavender', subTitle: 'Bridal Boutique', 
                address: 'MAK building, Near Uppala Bustand, Uppala, Kasargod', 
                phone: '+91 75580 08881', website: 'www.lavishlavender.in',
                showCustomer: true, showStaff: true, showTax: true,
                note: '*** IMPORTANT CARE NOTES ***\nNo Returns | No Exchange | Dry Wash Only',
                footer1: 'Thank you for Purchase', footer2: 'Visit Again!', footer3: '',
                extraFields: []
            };

            return `
            <div id="settings-scroll-container" class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-8 animate-pop-in">
                    <!-- Config Controls -->
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-emerald-100">
                                <i data-lucide="printer" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Printer Master Settings</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Branding & Layout Configuration</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 mb-10">
                            <!-- Left Column: Branding -->
                            <div class="space-y-6">
                                <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <div>
                                        <h4 class="font-black text-sm uppercase text-slate-800">Print Size</h4>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Auto-resizes receipt</p>
                                    </div>
                                    <select onchange="window.updatePrinterConfig({ width: this.value })" class="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none">
                                        <option value="58" ${pConf.width === '58' ? 'selected' : ''}>58mm</option>
                                        <option value="80" ${pConf.width === '80' ? 'selected' : ''}>80mm</option>
                                    </select>
                                </div>

                                <div class="space-y-4">
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Brand Logo</label>
                                    <div class="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                                        <input id="pc_logo" type="text" value="${pConf.logo || ''}" placeholder="Logo URL" class="flex-1 bg-transparent border-none font-black text-sm outline-none" oninput="window.updatePrinterConfig({ logo: this.value })">
                                        <div class="h-8 w-px bg-slate-200"></div>
                                        <button onclick="document.getElementById('pc_logo_file').click()" class="px-4 py-2 bg-white text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">Browse</button>
                                        <input type="file" id="pc_logo_file" class="hidden" accept="image/*" onchange="window.handleLogoUpload(this)">
                                    </div>
                                    <p class="text-[8px] font-bold text-slate-400 uppercase px-2">Colors will be auto-monochromed for thermal printing.</p>
                                </div>

                                <div class="grid grid-cols-1 gap-4">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Shop Name</label>
                                        <input id="pc_header" type="text" value="${pConf.header || ''}" oninput="window.updatePrinterConfig({ header: this.value })" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-emerald-500 shadow-inner">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Sub-Title</label>
                                        <input id="pc_subTitle" type="text" value="${pConf.subTitle || ''}" oninput="window.updatePrinterConfig({ subTitle: this.value })" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-sm outline-none focus:border-emerald-500 shadow-inner">
                                    </div>
                                    <div>
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Address</label>
                                        <textarea id="pc_address" rows="2" oninput="window.updatePrinterConfig({ address: this.value })" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-emerald-500 shadow-inner">${pConf.address || ''}</textarea>
                                    </div>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Phone No</label>
                                            <input id="pc_phone" type="text" value="${pConf.phone || ''}" oninput="window.updatePrinterConfig({ phone: this.value })" class="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-emerald-500 shadow-inner">
                                        </div>
                                        <div>
                                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Website</label>
                                            <input id="pc_website" type="text" value="${pConf.website || ''}" oninput="window.updatePrinterConfig({ website: this.value })" class="w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-emerald-500 shadow-inner">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column: Extras & Footers -->
                            <div class="space-y-6">
                                <div class="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                                    <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Display Toggles</h4>
                                    <div class="flex items-center justify-between">
                                        <span class="text-[11px] font-black text-slate-700 uppercase">Customer details</span>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                          <input type="checkbox" id="pc_show_customer" class="sr-only peer" ${pConf.showCustomer ? 'checked' : ''} onchange="window.updatePrinterConfig({ showCustomer: this.checked })">
                                          <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                        </label>
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-[11px] font-black text-slate-700 uppercase">Staff name</span>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                          <input type="checkbox" id="pc_show_staff" class="sr-only peer" ${pConf.showStaff ? 'checked' : ''} onchange="window.updatePrinterConfig({ showStaff: this.checked })">
                                          <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                        </label>
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-[11px] font-black text-slate-700 uppercase">Tax Breakdown (GSTIN)</span>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                          <input type="checkbox" id="pc_show_tax" class="sr-only peer" ${pConf.showTax ? 'checked' : ''} onchange="window.updatePrinterConfig({ showTax: this.checked })">
                                          <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                        </label>
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 gap-4">
                                    <div>
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Important Note</label>
                                        <textarea id="pc_note" rows="2" oninput="window.updatePrinterConfig({ note: this.value })" class="w-full px-6 py-4 bg-slate-100 border-none rounded-2xl font-black text-xs outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner">${pConf.note || ''}</textarea>
                                    </div>
                                    <div class="grid grid-cols-1 gap-3">
                                        <input id="pc_footer1" placeholder="Footer 1" type="text" value="${pConf.footer1 || ''}" oninput="window.updatePrinterConfig({ footer1: this.value })" class="w-full px-6 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-xs outline-none">
                                        <input id="pc_footer2" placeholder="Footer 2" type="text" value="${pConf.footer2 || ''}" oninput="window.updatePrinterConfig({ footer2: this.value })" class="w-full px-6 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-xs outline-none">
                                        <input id="pc_footer3" placeholder="Footer 3 (Empty)" type="text" value="${pConf.footer3 || ''}" oninput="window.updatePrinterConfig({ footer3: this.value })" class="w-full px-6 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-xs outline-none">
                                    </div>
                                </div>

                                <!-- Extra Fields -->
                                <div class="pt-4 space-y-3">
                                    <div class="flex items-center justify-between mb-2">
                                        <h4 class="text-[10px] font-black uppercase text-slate-400">Custom Fields</h4>
                                        <div class="relative group">
                                            <button class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-100 hover:bg-slate-900 transition-all">
                                                Add Field <i data-lucide="chevron-down" class="w-3 h-3"></i>
                                            </button>
                                            <div class="absolute right-0 mt-2 w-40 bg-white border border-slate-100 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 overflow-hidden">
                                                <button onclick="window.addExtraPrinterField('top')" class="w-full px-4 py-3 text-left text-[9px] font-black uppercase hover:bg-indigo-50 text-slate-600">At Top (Head)</button>
                                                <button onclick="window.addExtraPrinterField('bottom')" class="w-full px-4 py-3 text-left text-[9px] font-black uppercase hover:bg-rose-50 border-t border-slate-50 text-slate-600">At Bottom (Foot)</button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div id="pc_extra_container" class="space-y-2">
                                        ${(pConf.extraFields || []).map((f, idx) => `
                                            <div class="flex gap-2 items-center bg-slate-50 p-2 rounded-xl group">
                                                <input type="text" value="${f.label}" placeholder="Header" oninput="window.updateExtraPrinterField(${idx}, 'label', this.value)" class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase">
                                                <input type="text" value="${f.value}" placeholder="Value" oninput="window.updateExtraPrinterField(${idx}, 'value', this.value)" class="flex-[2] bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold">
                                                <button onclick="window.removeExtraPrinterField(${idx})" class="w-8 h-8 flex items-center justify-center text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                                </button>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button onclick="window.savePrinterFullConfig()" id="btn_save_p_config" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-3">
                            <i data-lucide="save" class="w-4 h-4"></i>
                            Save Master Configuration
                        </button>
                    </div>

                    <!-- Live Receipt Preview -->
                    <div class="flex flex-col lg:flex-row gap-10">
                        <div class="lg:w-1/3 bg-slate-900/5 p-8 rounded-[48px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                            <i data-lucide="eye" class="w-10 h-10 text-slate-300 mb-4"></i>
                            <h4 class="font-black text-slate-800 uppercase text-xs">Live Preview</h4>
                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Updates for ${pConf.width}mm paper</p>
                        </div>
                        
                        <div class="flex-1 bg-white p-10 rounded-[48px] shadow-sm border border-slate-100 flex justify-center">
                            <div id="printer_preview_area" class="bg-white shadow-2xl overflow-hidden p-[1mm] border border-slate-100" style="width: ${pConf.width == '80' ? '80mm' : '58mm'}; transition: width 0.3s ease-out">
                                ${window.getReceiptPreviewHtml()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // ADMIN SECTION (REPLACED SECURITY)
        if (section === 'admin') {
            const staff = window.erpState.staff || [];
            const creds = window.erpState.passwords || { staff: 'Lavish1234', owner: 'Swali4783' };
            
            return `
            <div id="settings-scroll-container" class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-8 animate-pop-in">
                    <!-- Staff Management -->
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center justify-between mb-8">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-indigo-100">
                                    <i data-lucide="users" class="w-6 h-6"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Staff & Operations</h3>
                                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Management & Commission Logic</p>
                                </div>
                            </div>
                            <button onclick="window.openAddStaff()" class="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all">Enroll Staff</button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            ${staff.map((s, idx) => {
                                const posSales = (window.erpState.sales || []).filter(sv => sv.recordedBy === s.name).reduce((sum, sv) => sum + (sv.total || 0), 0);
                                const tailorSales = (window.erpState.orders || []).filter(ov => ov.recordedBy === s.name || ov.staff === s.name).reduce((sum, ov) => sum + (ov.totalCost || 0), 0);
                                const salesVal = posSales + tailorSales;
                                const bonus = Math.floor(salesVal / 5000) * 100;
                                const commission = (salesVal * 0.02) + bonus;

                                return `
                                <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 group relative overflow-hidden">
                                    <div class="flex items-center gap-4 mb-6">
                                        <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center font-black text-indigo-600 shadow-sm">${s.name[0]}</div>
                                        <div class="flex-1">
                                            <p class="font-black text-slate-800 text-xs uppercase">${s.name}</p>
                                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Code: ${s.code.replace(/./g, '*')}</p>
                                        </div>
                                        <button onclick="window.deleteStaff(${idx})" class="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                                        <div>
                                            <p class="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Sales</p>
                                            <p class="font-black text-slate-800 text-sm">₹${salesVal.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Commission</p>
                                            <p class="font-black text-indigo-600 text-sm">₹${commission.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                </div>`;
                            }).join('')}
                            ${staff.length === 0 ? `<p class="col-span-full py-10 text-center text-slate-300 italic text-xs uppercase font-black tracking-widest">No staff registered</p>` : ''}
                        </div>

                        <!-- System Security (Owner/Staff Master) -->
                        <div class="pt-8 border-t border-slate-100">
                            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 mb-8 text-center">— Master Credentials —</h4>
                            <div class="grid grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Global Staff Pwd</label>
                                    <input id="pass_staff" type="text" value="${creds.staff}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Owner Pwd</label>
                                    <input id="pass_owner" type="text" value="${creds.owner}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                                </div>
                            </div>
                            <button onclick="window.updatePasswords()" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center gap-3">
                                <i data-lucide="key" class="w-4 h-4"></i> Synchronize Credentials
                            </button>
                        </div>
                    </div>

                    <!-- Performance Intelligence (Owner Logs) -->
                    <div class="bg-indigo-600 p-10 rounded-[56px] text-white shadow-2xl shadow-indigo-100 relative overflow-hidden">
                        <div class="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                        <h3 class="text-xl font-black tracking-tight mb-2">Audit Synchronization</h3>
                        <p class="text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] mb-10">Real-time trace of all terminal operations</p>
                        <button onclick="window.viewStaffLogs()" class="px-10 py-5 bg-white text-indigo-600 rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-900 hover:text-white transition-all">Open Activity Logs</button>
                    </div>
                </div>
            </div>`;
        }
    }

    // --- Activity & Logging ---
    window.logActivity = async (staffName, action, details) => {
        try {
            await window.FB.collection('audit_logs').add({
                staffName,
                action,
                details,
                timestamp: Date.now(),
                dateStr: new Date().toLocaleString('en-IN')
            });
        } catch (e) { console.error("Log error:", e); }
    };

    window.viewStaffLogs = async () => {
        const pin = prompt("Owner PIN required to view audit logs:");
        if (pin !== (window.erpState.passwords?.owner || '')) return alert("Access Denied");

        const snap = await window.FB.collection('audit_logs').orderBy('timestamp', 'desc').limit(50).get();
        const logs = snap.docs.map(d => d.data());

        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center z-[700] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div class="p-8 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-black text-xl text-slate-900 uppercase tracking-tighter">System Audit Log</h3>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50">
                    ${logs.map(l => `
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-[10px] font-black text-indigo-600 uppercase tracking-widest">${l.staffName}</span>
                                <span class="text-[9px] font-bold text-slate-400">${l.dateStr}</span>
                            </div>
                            <p class="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">${l.action}</p>
                            <p class="text-[10px] text-slate-500 font-medium">${l.details || ''}</p>
                        </div>
                    `).join('') || '<p class="text-center py-20 text-slate-400 italic font-black uppercase tracking-widest text-xs">No logs found</p>'}
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    };

    // --- Settings Logics ---
    window.updatePrinterWidth = async (w) => {
        window.erpState.printerWidth = w;
        window.erpState.printerConfig = window.erpState.printerConfig || {};
        window.erpState.printerConfig.width = w;
        window.renderApp();
        window.saveGeneralSettings();
    };

    window.updatePrinterConfig = async (updates) => {
        const pConf = window.erpState.printerConfig || { 
            width: '58', logo: '', header: 'Lavish Lavender', subTitle: 'Bridal Boutique', 
            address: 'MAK building, Near Uppala Bustand, Uppala, Kasargod', 
            phone: '+91 75580 08881', website: 'www.lavishlavender.in',
            showCustomer: true, showStaff: true, showTax: true,
            note: '*** IMPORTANT CARE NOTES ***\nNo Returns | No Exchange | Dry Wash Only',
            footer1: 'Thank you for Purchase', footer2: 'Visit Again!', footer3: '',
            extraFields: []
        };
        
        if (updates) {
            Object.assign(pConf, updates);
            window.erpState.printerConfig = pConf;
            // Update preview in real-time
            const previewArea = document.getElementById('printer_preview_area');
            if (previewArea) {
                previewArea.style.width = (pConf.width == '80' ? '80mm' : '58mm');
                previewArea.innerHTML = window.getReceiptPreviewHtml();
            }
        }
    };

    window.savePrinterFullConfig = async () => {
        const pConf = window.erpState.printerConfig;
        pConf.header = document.getElementById('pc_header').value;
        pConf.subTitle = document.getElementById('pc_subTitle').value;
        pConf.address = document.getElementById('pc_address').value;
        pConf.phone = document.getElementById('pc_phone').value;
        pConf.website = document.getElementById('pc_website').value;
        pConf.note = document.getElementById('pc_note').value;
        pConf.footer1 = document.getElementById('pc_footer1').value;
        pConf.footer2 = document.getElementById('pc_footer2').value;
        pConf.footer3 = document.getElementById('pc_footer3').value;

        window.erpState.printerConfig = pConf;
        window.erpState.printerWidth = pConf.width;
        
        const btn = document.getElementById('btn_save_p_config');
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
        lucide.createIcons();

        await window.saveGeneralSettings();
        window.renderApp();
        alert("Master Printer Configuration Saved!");
    };

    window.addExtraPrinterField = (pos) => {
        const pConf = window.erpState.printerConfig;
        const field = { label: 'HEADER', value: 'Value Detail', position: pos };
        pConf.extraFields = pConf.extraFields || [];
        pConf.extraFields.push(field);
        window.updatePrinterConfig();
        window.renderApp();
    };

    window.removeExtraPrinterField = (idx) => {
        window.erpState.printerConfig.extraFields.splice(idx, 1);
        window.updatePrinterConfig();
        window.renderApp();
    };

    window.updateExtraPrinterField = (idx, key, val) => {
        window.erpState.printerConfig.extraFields[idx][key] = val;
        // Don't re-render full app on every keystroke to avoid focus loss
        const previewArea = document.getElementById('printer_preview_area');
        if (previewArea) previewArea.innerHTML = window.getReceiptPreviewHtml();
    };

    window.getReceiptPreviewHtml = () => {
        const pConf = window.erpState.printerConfig || { 
            width: '58', logo: '', header: 'Lavish Lavender', subTitle: 'Bridal Boutique', 
            address: 'MAK building, Near Uppala Bustand, Uppala, Kasargod', 
            phone: '+91 75580 08881', website: 'www.lavishlavender.in',
            showCustomer: true, showStaff: true, showTax: true,
            note: '*** IMPORTANT CARE NOTES ***\nNo Returns | No Exchange | Dry Wash Only',
            footer1: 'Thank you for Purchase', footer2: 'Visit Again!', footer3: '',
            extraFields: []
        };

        const width = pConf.width === '80' ? '80mm' : '58mm';
        const extras = pConf.extraFields || [];
        
        let html = `<div style="font-family:monospace; font-size:10px; line-height:1.3; color:#000; padding:4px 8px;">`;

        // Logo
        if (pConf.logo) {
            html += `<div style="text-align:center; margin-bottom:8px;"><img src="${pConf.logo}" style="width:40mm; filter:grayscale(1) contrast(1.5);"></div>`;
        }

        // Header
        html += `<div style="text-align:center; font-weight:bold; font-size:16px; letter-spacing:1px;">${pConf.header}</div>`;
        html += `<div style="text-align:center; font-size:10px; margin-bottom:2px;">${pConf.subTitle}</div>`;
        
        // Address (Centered, Multi-line)
        pConf.address.split(',').forEach(line => {
            html += `<div style="text-align:center; font-size:9px;">${line.trim()}</div>`;
        });
        
        // Phone | Website
        html += `<div style="text-align:center; font-size:9px;">${pConf.phone} | ${pConf.website}</div>`;

        // Extra Fields (Top)
        extras.filter(f => f.position === 'top').forEach(f => {
            html += `<div style="text-align:center; font-size:9px; font-weight:bold; margin-top:2px;">${f.label}: ${f.value}</div>`;
        });

        html += `<hr style="border:none; border-top:1px dashed #000; margin:6px 0;">`;

        // Meta (Fixed Demo)
        html += `<div>Bill No: 4-2500</div>`;
        html += `<div>Date: 18 Mar 2026 Time: 06:28 pm</div>`;
        if (pConf.showStaff) html += `<div>Staff: Swaliha (Owner)</div>`;
        if (pConf.showCustomer) {
            html += `<div>Customer: Abdu salam</div>`;
            html += `<div>Phone: 8714283895</div>`;
        }

        html += `<hr style="border:none; border-top:1px dashed #000; margin:6px 0;">`;

        // Items (Fixed Demo)
        html += `<table style="width:100%; font-size:10px;">`;
        html += `<tr style="font-weight:bold;"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Amt</td></tr>`;
        html += `<tr><td colspan="3" style="border-top:1px dashed #000;"></td></tr>`;
        html += `<tr><td style="padding:2px 0;">LLU0017</td><td style="text-align:center">x1</td><td style="text-align:right">₹3,830</td></tr>`;
        html += `</table>`;

        html += `<hr style="border:none; border-top:1px dashed #000; margin:6px 0;">`;

        // Summary
        html += `<div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>₹3,830</span></div>`;
        if (pConf.showTax) html += `<div style="display:flex; justify-content:space-between; font-size:8px;"><span>GSTIN: ${window.erpState.gstin || 'N/A'}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between; font-weight:bold;"><span>TOTAL</span><span>₹3,830</span></div>`;
        html += `<div style="display:flex; justify-content:space-between;"><span>Paid</span><span>₹3,830</span></div>`;

        // Loyalty Summary
        html += `<div style="margin-top:8px; border:1px solid #000; padding:4px; text-align:center;">`;
        html += `<div style="font-weight:bold; font-size:8px; text-transform:uppercase;">Loyalty Summary</div>`;
        html += `<div style="font-size:9px;">76 PT Erned | 76 Total PT | BASIC Tier</div>`;
        html += `</div>`;

        html += `<hr style="border:none; border-top:1px dashed #000; margin:8px 0;">`;

        // Important Note
        if (pConf.note) {
            pConf.note.split('\n').forEach(line => {
                html += `<div style="text-align:center; font-size:9px; font-weight:bold;">${line.trim()}</div>`;
            });
            html += `<hr style="border:none; border-top:1px dashed #000; margin:8px 0;">`;
        }

        // Footers
        if (pConf.footer1) html += `<div style="text-align:center; font-size:10px;">${pConf.footer1}</div>`;
        if (pConf.footer2) html += `<div style="text-align:center; font-size:10px;">${pConf.footer2}</div>`;
        if (pConf.footer3) html += `<div style="text-align:center; font-size:10px;">${pConf.footer3}</div>`;

        // Extra Fields (Bottom)
        extras.filter(f => f.position === 'bottom').forEach(f => {
            html += `<div style="text-align:center; font-size:9px; font-weight:bold; margin-top:4px;">${f.label}: ${f.value}</div>`;
        });

        html += `<div style="text-align:center; margin-top:10px;">* * * * * * * * * * * * * *</div>`;
        html += `</div>`;
        return html;
    };

    window.toggleDashWidget = async (widgetId, enabled) => {
        window.erpState.dashboardConfig = window.erpState.dashboardConfig || {};
        window.erpState.dashboardConfig[widgetId] = enabled;
        try {
            await window.FB.collection('settings').doc('general').set({ dashboardConfig: window.erpState.dashboardConfig }, { merge: true });
            window.saveLocalState();
            window.renderApp();
        } catch (e) { console.error('Dashboard config save error:', e); }
    };

    window.updateGSTIN = async () => {
        const val = document.getElementById('pc_gstin').value.trim();
        window.erpState.gstin = val;
        try {
            await window.FB.collection('settings').doc('general').set({ gstin: val }, { merge: true });
            window.saveLocalState();
            alert("GSTIN Updated Successfully!");
        } catch (e) {
            console.error(e);
            alert("Error updating GSTIN");
        }
    };

    window.handleLogoUpload = async (input) => {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const btn = input.previousElementSibling;
        const orig = btn.innerText;
        btn.innerText = "Saving..."; btn.disabled = true;

        try {
            const storage = window.FB.storage();
            const ref = storage.ref(`settings/printer_logo_${Date.now()}`);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            document.getElementById('pc_logo').value = url;
            window.updatePrinterConfig({ logo: url });
        } catch (e) {
            console.error(e);
            alert("Logo upload failed.");
        } finally {
            btn.innerText = orig; btn.disabled = false;
        }
    };

    window.resetWATemplates = async () => {
        if (!confirm("Are you sure? This will replace your current templates with the new standard format (including loyalty tags).")) return;
        
        const newDefaults = {
            booking: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully booked.\n\n*Bill No:* {billNo}\n*Amount:* Rs.{totalCost}\n*Advance:* Rs.{advancePaid}\n*Balance:* Rs.{balance}\n\n*Pickup Date:* {deliveryDate}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you for choosing Lavish Lavender. 🙏',
            ready: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nGood news! Your order is ready for pickup. ✅\n\n*Bill No:* {billNo}\n*Balance Payable:* Rs.{balance}\n\n📍 *Location:*\nhttps://share.google/iR4s2zrLMHoiTTZ66\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nSee you soon! 🙏',
            delivered: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully delivered. ✅\n\n*Receipt:* 📄\nhttps://www.lavishlavender.in/receipt/?bill={billNo}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you! 🙏',
            reminder: 'Hi {customerName}, 🌸 Friendly reminder from *Lavish Lavender* for bill *{billNo}*.\n\nPending: *Rs.{balance}*.\n\n✨ *Loyalty Status*\n{totalPoints} Total PT | {tier} Tier\n\nVisit again! 🙏'
        };

        window.erpState.whatsappTemplates = newDefaults;
        try {
            await window.FB.collection('settings').doc('general').set({ whatsappTemplates: newDefaults }, { merge: true });
            alert("Templates Reset Successfully! You can now customize them further.");
            window.renderApp();
        } catch (e) {
            console.error(e);
            alert("Error resetting templates.");
        }
    };

    window.saveTemplates = async () => {
        const temps = {
            booking: document.getElementById('temp_booking').value,
            ready: document.getElementById('temp_ready').value,
            delivered: document.getElementById('temp_delivered').value,
            reminder: document.getElementById('temp_reminder').value
        };
        window.erpState.whatsappTemplates = temps;
        window.renderApp();
        try {
            await window.FB.collection('settings').doc('general').set({ whatsappTemplates: temps }, { merge: true });
            alert("Templates saved successfully!");
        } catch(e) { 
            console.error(e); 
            alert("Error saving templates.");
        }
    };

    window.saveGeneralSettings = async () => {
        const settings = {
            printerWidth: window.erpState.printerWidth,
            whatsappTemplates: window.erpState.whatsappTemplates,
            taxes: window.erpState.taxes,
            discounts: window.erpState.discounts,
            loyalty: window.erpState.loyalty,
            passwords: window.erpState.passwords,
            staff: window.erpState.staff || [],
            printerConfig: window.erpState.printerConfig,
            gstin: window.erpState.gstin,
            dashboardConfig: window.erpState.dashboardConfig,
            updatedAt: Date.now()
        };
        try {
            await window.FB.collection('settings').doc('general').set(settings, { merge: true });
            window.saveLocalState();
        } catch (e) {
            console.error('Settings save error:', e);
            throw e;
        }
    };

    window.addTaxRule = async () => {
        const label = document.getElementById('new_tax_label').value;
        const val = parseFloat(document.getElementById('new_tax_val').value);
        if(!label || isNaN(val)) return alert("Enter valid label and value");
        window.erpState.taxes.push({ label, val });
        await window.saveGeneralSettings();
        window.renderApp();
    };

    window.deleteTaxRule = async (idx) => {
        if(idx === 0) return alert("Cannot delete default tax");
        window.erpState.taxes.splice(idx, 1);
        await window.saveGeneralSettings();
        window.renderApp();
    };

    window.addDiscountRule = async () => {
        const label = document.getElementById('new_disc_label').value;
        const val = parseFloat(document.getElementById('new_disc_val').value);
        const type = document.getElementById('new_disc_type').value;
        if(!label || isNaN(val)) return alert("Enter valid label and value");
        window.erpState.discounts.push({ label, val, type });
        await window.saveGeneralSettings();
        window.renderApp();
    };

    window.deleteDiscountRule = async (idx) => {
        window.erpState.discounts.splice(idx, 1);
        await window.saveGeneralSettings();
        window.renderApp();
    };

    // --- POS MODALS & DIALOGS ---

    window.openChargeScreen = () => {
        const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
        let activeTaxIdx = window.erpState.activeTax || 0;

        const modal = document.createElement('div');
        modal.id = 'charge-modal-overlay';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[500] p-0 sm:p-4";
        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-[420px] sm:rounded-[40px] rounded-t-[40px] p-5 sm:p-7 shadow-2xl animate-slide-up sm:animate-pop-in border border-slate-100 relative overflow-hidden max-h-[92vh] flex flex-col">
                <div class="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden"></div>
                
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-50 shrink-0">
                    <div>
                        <p class="text-[8px] font-black text-violet-600 uppercase tracking-[0.2em] mb-0.5">Billing Terminal</p>
                        <h2 class="text-xl font-black text-slate-800 tracking-tighter uppercase">Checkout</h2>
                    </div>
                    <button onclick="document.getElementById('charge-modal-overlay').remove()" class="w-9 h-9 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center transition-all">
                         <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>

                <div class="overflow-y-auto custom-scrollbar flex-1 pr-1 -mr-1">
                    <!-- Cart items summary -->
                    <div class="mb-4 space-y-1 ${window.erpState.cart.length > 3 ? 'max-h-24 overflow-y-auto pr-1 custom-scrollbar' : ''}">
                        ${window.erpState.cart.map(c => `
                            <div class="flex justify-between items-center text-[10px] py-0.5">
                                <span class="text-slate-500 font-bold truncate flex-1">${c.name} <span class="text-violet-500 ml-1">×${c.qty}${c.unit || (c.soldBy === 'weight' ? 'm' : '')}</span></span>
                                <span class="font-black text-slate-700 ml-2">${fmt(c.price * c.qty)}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div id="cm_loyalty_preview" class="hidden mb-4 p-4 bg-slate-900 border border-slate-800 rounded-[28px] animate-pop-in shrink-0">
                        <!-- Injected by lookup -->
                    </div>

                    <div class="space-y-4 mb-6">
                        <div class="grid grid-cols-2 gap-3">
                            <input id="cm_client_phone" value="${window.erpState.customerPhone || ''}" oninput="this.value = window.sanitizePhone(this.value); window.lookupClient(this.value)" type="tel" placeholder="Phone Number" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                            <input id="cm_client_name" value="${window.erpState.customerName || ''}" type="text" placeholder="Customer Name" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                        </div>

                        <div class="bg-slate-50 p-4 rounded-[28px] border border-slate-100 space-y-4">
                            <div class="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                                <span>Subtotal</span>
                                <span class="text-slate-600">${fmt(subtotal)}</span>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Discount</label>
                                    <div class="space-y-2">
                                        <select id="cm_discount_select" onchange="window.handleDiscountChange(this.value, ${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none focus:ring-2 focus:ring-violet-500/20">
                                            <option value="">No Discount</option>
                                            ${window.erpState.discounts.map(d => `<option value="${d.label}" ${window.erpState.activeDiscountLabel === d.label ? 'selected' : ''}>${d.label} (${d.type === 'pct' ? d.val + '%' : '₹' + d.val})</option>`).join('')}
                                        </select>
                                        <input id="cm_discount_manual" type="number" oninput="window.erpState.activeDiscountAmt = parseFloat(this.value)||0; window.updateCMFinal(${subtotal})" placeholder="Enter ₹" class="hidden w-full px-3 py-2 bg-white border border-violet-100 rounded-lg font-black text-rose-500 text-[10px] outline-none focus:ring-2 focus:ring-rose-500/20 animate-pop-in">
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Taxation</label>
                                    <select id="cm_tax_select" onchange="window.erpState.activeTax=parseInt(this.value); window.updateCMFinal(${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none focus:ring-2 focus:ring-violet-500/20">
                                        ${window.erpState.taxes.map((t, i) => `<option value="${i}" ${activeTaxIdx == i ? 'selected' : ''}>${t.label} (${t.val}%)</option>`).join('')}
                                    </select>
                                </div>
                            </div>

            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <div class="flex items-center justify-between mb-1.5 px-1">
                                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</label>
                                        <label class="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" id="cm_is_advance" onchange="window.toggleAdvanceMode(${subtotal})" class="w-2.5 h-2.5 rounded border-slate-300">
                                            <span class="text-[8px] font-black text-violet-500 uppercase tracking-tighter">Advance?</span>
                                        </label>
                                    </div>
                                    <input id="cm_advance" type="number" oninput="window.updateCMFinal(${subtotal})" placeholder="0" class="w-full px-3 py-2.5 bg-white border border-slate-100 rounded-xl font-black text-emerald-600 text-base outline-none focus:ring-2 focus:ring-emerald-500/20">
                                    
                                    <label class="flex items-center gap-2 cursor-pointer mt-3 ml-1 ${window.erpState.cart.some(it => it.tailoringRef) ? 'hidden' : ''}">
                                        <input type="checkbox" id="cm_has_stitching" ${window.erpState.cart.some(it => it.tailoringRef) ? 'checked' : ''} onchange="window.toggleStitchingSection()" class="w-2.5 h-2.5 rounded border-indigo-200 text-indigo-600">
                                        <span class="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Requires Stitching</span>
                                    </label>
                                </div>
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Method</label>
                                    <select id="cm_payment_method" onchange="window.handlePaymentMethodChange(this.value, ${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none">
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI / GPay</option>
                                        <option value="Mixed">Mixed (Split)</option>
                                    </select>

                                    <div id="cm_stitching_section" class="${window.erpState.cart.some(it => it.tailoringRef) ? '' : 'hidden'} mt-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-pop-in">
                                         <label class="text-[7px] font-black text-indigo-400 uppercase tracking-widest mb-1 block leading-none">Linked Stitching No.</label>
                                         <input id="cm_stitching_no" type="text" value="${(window.erpState.cart.find(it => it.tailoringRef) || {}).tailoringRef || ''}" placeholder="B-..." class="w-full px-2.5 py-1.5 bg-white border border-indigo-100 rounded-lg font-black text-indigo-700 text-[10px] outline-none ${window.erpState.cart.some(it => it.tailoringRef) ? 'opacity-70 pointer-events-none' : ''}">
                                    </div>
                                </div>
                            </div>

                            <div id="cm_mixed_inputs" class="hidden grid grid-cols-2 gap-3 bg-slate-900/5 p-3 rounded-2xl border border-slate-900/10">
                                <div>
                                     <label class="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block pl-2">Cash Split</label>
                                     <input id="cm_mixed_cash" type="number" oninput="window.autoCalcMixed('cash', ${subtotal})" placeholder="0" class="w-full px-3 py-2 bg-white border-none rounded-lg font-bold text-[10px] outline-none shadow-sm">
                                </div>
                                <div>
                                     <label class="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block pl-2">UPI Split</label>
                                     <input id="cm_mixed_upi" type="number" oninput="window.autoCalcMixed('upi', ${subtotal})" placeholder="0" class="w-full px-3 py-2 bg-white border-none rounded-lg font-bold text-[10px] outline-none shadow-sm">
                                </div>
                            </div>
                        </div>

                        <div class="bg-slate-900 p-5 rounded-[28px] shadow-xl relative overflow-hidden">
                            <div class="absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Bill Total</span>
                                <span id="cm_bill_total" class="text-sm font-black text-slate-300">--</span>
                            </div>
                            <div class="flex justify-between items-center relative z-10">
                                <span id="cm_final_label" class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Balance</span>
                                <span id="cm_final" class="text-2xl font-black text-white">--</span>
                            </div>

                            <!-- Internal Profit Ref (Staff Only) -->
                            <div class="mt-4 pt-4 border-t border-white/10 flex justify-between items-center text-[7px] font-black uppercase tracking-[0.2em] text-slate-500 relative z-10">
                                <div class="flex flex-col">
                                    <span class="mb-1">Internal Margin</span>
                                    <span id="cm_internal_margin" class="text-emerald-400 text-[10px] font-black">0%</span>
                                </div>
                                ${window.erpState.role === 'Staff' ? '' : `
                                <div class="text-right flex flex-col items-end">
                                    <span class="mb-1">Est. Profit</span>
                                    <span id="cm_internal_profit_val" class="text-slate-200 text-[10px] font-black">₹0</span>
                                </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="pt-3 shrink-0">
                    <button onclick="window._completeCheckout()" class="w-full py-4 bg-violet-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-violet-200 hover:bg-slate-900 transition-all active:scale-95 flex items-center justify-center gap-3">
                        <i data-lucide="shield-check" class="w-4 h-4"></i> Confirm Transaction
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('cm_client_phone').focus();

        // Helpers specifically for this screen
        window.toggleStitchingSection = () => {
            const isOn = document.getElementById('cm_has_stitching').checked;
            document.getElementById('cm_stitching_section').classList.toggle('hidden', !isOn);
            if(isOn) document.getElementById('cm_stitching_no').focus();
        };

        window.toggleAdvanceMode = (sub) => {
            const isAdv = document.getElementById('cm_is_advance').checked;
            const advInput = document.getElementById('cm_advance');
            if (!isAdv) {
                advInput.readOnly = true;
                advInput.classList.add('bg-slate-50', 'text-slate-400');
                advInput.classList.remove('bg-white', 'text-emerald-600');
            } else {
                advInput.readOnly = false;
                advInput.classList.remove('bg-slate-50', 'text-slate-400');
                advInput.classList.add('bg-white', 'text-emerald-600');
                advInput.focus();
            }
            window.updateCMFinal(sub);
        };

        window.handlePaymentMethodChange = (val, sub) => {
            document.getElementById('cm_mixed_inputs').classList.toggle('hidden', val !== 'Mixed');
            window.updateCMFinal(sub);
        };

        window.handleDiscountChange = (label, sub) => {
            const d = window.erpState.discounts.find(x => x.label === label);
            const manualInput = document.getElementById('cm_discount_manual');
            
            if (!d) {
                window.erpState.activeDiscountAmt = 0;
                window.erpState.activeDiscountLabel = "";
                manualInput.classList.add('hidden');
            } else {
                window.erpState.activeDiscountLabel = label;
                if (d.type === 'cash' && d.val === 0) {
                    manualInput.classList.remove('hidden');
                    manualInput.value = window.erpState.activeDiscountAmt || "";
                    manualInput.focus();
                } else {
                    manualInput.classList.add('hidden');
                    window.erpState.activeDiscountAmt = d.type === 'pct' ? (sub * d.val / 100) : d.val;
                }
            }
            window.updateCMFinal(sub);
        };

        window.autoCalcMixed = (source, sub) => {
            const advVal = parseFloat(document.getElementById('cm_advance').value || 0);
            const subtotal = sub;
            const disc = window.erpState.activeDiscountAmt || 0;
            const redeem = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            
            const billTotal = (subtotal - disc - redeem) * (1 + taxVal / 100);
            const isAdv = document.getElementById('cm_is_advance').checked;
            const targetToPay = isAdv ? advVal : billTotal;

            const cashEl = document.getElementById('cm_mixed_cash');
            const upiEl = document.getElementById('cm_mixed_upi');

            if (source === 'cash') {
                const val = parseFloat(cashEl.value || 0);
                upiEl.value = Math.max(0, targetToPay - val).toFixed(2);
            } else {
                const val = parseFloat(upiEl.value || 0);
                cashEl.value = Math.max(0, targetToPay - val).toFixed(2);
            }
        };



        window.updateCMFinal = (sub) => {
            const disc = window.erpState.activeDiscountAmt || 0;
            const redeem = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            // LIVE PREVIEW: match the correct tax-then-redeem formula from checkout
            const taxableBase = Math.max(0, sub - disc);
            const billTotal = Math.max(0, taxableBase * (1 + taxVal / 100) - redeem);
            document.getElementById('cm_bill_total').innerText = fmt(billTotal);

            const isAdv = document.getElementById('cm_is_advance').checked;
            const advInput = document.getElementById('cm_advance');
            
            if (!isAdv) {
                advInput.value = Math.round(billTotal);
                document.getElementById('cm_final').innerText = fmt(billTotal);
                document.getElementById('cm_final_label').innerText = "Collected Total";
            } else {
                const paid = parseFloat(advInput.value || 0);
                const balance = Math.max(0, billTotal - paid);
                document.getElementById('cm_final').innerText = fmt(balance);
                document.getElementById('cm_final_label').innerText = balance > 0 ? "Remaining Balance" : "Fully Settled (Advance)";
            }

            // Internal Profit Calculation
            const costPrice = window.erpState.cart.reduce((s, it) => s + ((it.cost || 0) * it.qty), 0);
            const revenue = sub - disc - redeem;
            const profitVal = revenue - costPrice;
            const marginVal = revenue > 0 ? (profitVal / revenue) * 100 : 0;
            
            const marginEl = document.getElementById('cm_internal_margin');
            const profitElVal = document.getElementById('cm_internal_profit_val');
            if (marginEl) {
                marginEl.innerText = marginVal.toFixed(1) + '%';
                marginEl.className = marginVal > 40 ? 'text-emerald-400 font-black text-[10px]' : 
                                   marginVal > 20 ? 'text-amber-400 font-black text-[10px]' : 
                                   'text-rose-400 font-black text-[10px]';
            }
            if (profitElVal) {
                profitElVal.innerText = '₹' + Math.round(profitVal).toLocaleString();
            }

            // Sync mixed inputs if visible
            if (document.getElementById('cm_payment_method').value === 'Mixed') {
                window.autoCalcMixed('cash', sub);
            }

            // Update points preview
            if (!document.getElementById('cm_loyalty_preview').classList.contains('hidden')) {
                const phone = document.getElementById('cm_client_phone').value;
                const c = window.erpState.clients.find(x => x.phone === window.sanitizePhone(phone));
                if (c) {
                    const tier = window.getLoyaltyTier(c.totalSpent || 0);
                    const earned = window.calcPoints(billTotal, tier);
                    const earnedEl = document.getElementById('cm_earned_pts');
                    if (earnedEl) earnedEl.innerText = '+' + earned;
                }
            }
        };

        // Initialize state
        window.toggleAdvanceMode(subtotal);
    };

    window._completeCheckout = async () => {
        const phone = document.getElementById('cm_client_phone').value.trim();
        const name = document.getElementById('cm_client_name').value.trim();
        const advance = parseFloat(document.getElementById('cm_advance').value || 0);
        const method = document.getElementById('cm_payment_method') ? document.getElementById('cm_payment_method').value : document.getElementById('cm_method').value;
        const discountAmt = window.erpState.activeDiscountAmt || 0;
        const redeemAmt = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);

        const hasStitching = document.getElementById('cm_has_stitching')?.checked || false;
        const stitchingNo = document.getElementById('cm_stitching_no')?.value.trim();

        if (hasStitching && !stitchingNo) { window.erpAlert('Please enter the Stitching Order No (Booking #).', 'Missing Info', 'scissors'); return; }

        if(!phone || window.sanitizePhone(phone).length < 10) { window.erpAlert('A valid 10-digit phone number is required.', 'Validation Error', 'phone'); return; }
        if(!name) { window.erpAlert('Customer name is required to proceed.', 'Validation Error', 'user'); return; }

        // Multiples-of-500 redemption validation
        if (redeemAmt > 0 && redeemAmt % 500 !== 0) { window.erpAlert(`Redemption must be in multiples of 500. You entered ${redeemAmt} — please use ${Math.floor(redeemAmt/500)*500} or ${Math.ceil(redeemAmt/500)*500} pts.`, 'Invalid Redemption', 'alert-circle'); return; }
        if (redeemAmt > 0 && redeemAmt < 500) { window.erpAlert('Minimum redemption is 500 points (= ₹500).', 'Invalid Redemption', 'alert-circle'); return; }

        // Use a branded PIN modal instead of browser prompt
        window._showPINModal((staffCode) => {
            const staff = (window.erpState.staff || []).find(s => s.code === staffCode);
            const isOwner = staffCode === (window.erpState.passwords?.owner || '');
            if (!staff && !isOwner) { window.erpAlert('Invalid Authorization Code. Please try again.', 'Access Denied', 'lock'); return false; }
            window._runCheckout(phone, name, advance, method, discountAmt, redeemAmt, hasStitching, stitchingNo, staffCode);
            return true;
        });
    };

    // ─── Branded PIN Modal (replaces browser prompt) ────────────────────────
    window._showPINModal = (onSuccess) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[600] p-4';
        modal.setAttribute('id', 'pin-auth-modal');
        modal.innerHTML = `
            <div class="bg-white w-full max-w-xs rounded-[40px] p-10 shadow-2xl animate-pop-in relative border border-slate-100">
                <div class="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <i data-lucide="lock" class="w-7 h-7 text-violet-600"></i>
                </div>
                <div class="text-center mb-6">
                    <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase">Authorize Sale</h3>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Enter Staff or Owner PIN</p>
                </div>
                <input id="pin-auth-input" type="password" placeholder="••••••••" maxlength="20" autocomplete="off"
                    class="w-full px-6 py-4 bg-slate-50 rounded-2xl text-center font-black text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-violet-400 mb-3 shadow-inner">
                <p id="pin-auth-err" class="text-[10px] text-rose-500 font-black uppercase text-center tracking-widest mb-4 hidden">Incorrect PIN — try again</p>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('pin-auth-modal').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                    <button id="pin-auth-confirm" class="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-violet-200">Confirm</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        const inputEl = document.getElementById('pin-auth-input');
        inputEl.focus();

        const doConfirm = () => {
            const pin = inputEl.value;
            if (!pin) return;
            const ok = onSuccess(pin);
            if (ok !== false) {
                modal.remove();
            } else {
                document.getElementById('pin-auth-err').classList.remove('hidden');
                inputEl.value = '';
                inputEl.focus();
            }
        };

        document.getElementById('pin-auth-confirm').onclick = doConfirm;
        inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConfirm(); });
    };

    // ─── Actual checkout execution (called after PIN confirmed) ─────────────
    window._runCheckout = async (phone, name, advance, method, discountAmt, redeemAmt, hasStitching, stitchingNo, staffCode) => {
        const staff = (window.erpState.staff || []).find(s => s.code === staffCode);
        const isOwner = staffCode === (window.erpState.passwords?.owner || '');
        const recordedBy = isOwner ? 'Owner' : staff.name;

        const btn = document.querySelector("#charge-modal-overlay button.bg-violet-600") || document.querySelector("button[onclick='window._completeCheckout()']");
        const origText = btn?.innerHTML;
        if (btn) { btn.innerHTML = `<i class="w-5 h-5 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> PROCESSING...`; btn.disabled = true; }

        try {
            const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
            
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            // Tax on post-discount base; redemption deducted AFTER tax (payment method, not price reduction)
            const taxableBase = Math.max(0, subtotal - discountAmt);
            const taxAmount = taxableBase * (taxVal / 100);
            const total = Math.max(0, taxableBase + taxAmount - redeemAmt);

            const isEdit = !!window.erpState.editingInvoiceId;
            let counter, billNo;

            if (isEdit) {
                // Find original sale to get its billNo and counter
                const originalSale = window.erpState.sales.find(s => s.id === window.erpState.editingInvoiceId) || 
                                     window.erpState.orders.find(o => o.id === window.erpState.editingInvoiceId);
                billNo = originalSale ? originalSale.billNo : ("4-" + (window.erpState.counter || 2499));
                counter = originalSale ? originalSale.counter : (window.erpState.counter || 2499);
            } else {
                counter = (window.erpState.counter || 2499) + 1;
                billNo = "4-" + counter;
            }

            const isAdvance = document.getElementById('cm_is_advance')?.checked || false;
            const amtEntered = advance;
            
            let finalPaid = isAdvance ? amtEntered : total;

            let cash = 0, upi = 0;
            if (method === 'Mixed') {
                cash = parseFloat(document.getElementById('cm_mixed_cash').value) || 0;
                upi = parseFloat(document.getElementById('cm_mixed_upi').value) || 0;
                finalPaid = cash + upi;
            } else if (method === 'Cash') {
                cash = finalPaid;
            } else if (method === 'UPI') {
                upi = finalPaid;
            }

            const balanceDue = Math.max(0, total - finalPaid);

            const phoneClean = window.sanitizePhone(phone);
            const client = window.erpState.clients.find(c => window.sanitizePhone(c.phone) === phoneClean);
            const oldSpent = client ? (client.totalSpent || 0) : 0;
            const oldTier = window.getLoyaltyTier(oldSpent);
            // Points earned on net merchandise value (pre-tax)
            const pointsEarned = window.calcPoints(taxableBase, oldTier);
            
            const saleData = {
                billNo,
                customerName: name,
                customerPhone: phoneClean,
                date: Date.now(),
                timestamp: Date.now(),
                items: JSON.parse(JSON.stringify(window.erpState.cart)),
                subtotal, 
                discount: discountAmt,
                taxIdx,
                taxValue: taxVal,
                redeemedPoints: redeemAmt,
                total, 
                advancePaid: finalPaid,
                balanceDue: balanceDue,
                isPartial: isAdvance,
                paymentMode: method,
                paymentBreakdown: { cash, upi },
                counter: counter,
                recordedBy: recordedBy,
                hasStitching: hasStitching,
                stitchingOrderNo: stitchingNo,
                taxAmount: taxAmount,
                loyaltySnapshot: {
                    earned: pointsEarned,
                    total: Math.max(0, (client ? (client.loyaltyPoints || 0) : 0) - Math.min(redeemAmt, client?.loyaltyPoints || 0) + pointsEarned),
                    tier: window.getLoyaltyTier(oldSpent + total)
                }
            };

            let saleRef;
            
            if (isEdit) {
                // Update existing record
                await DATA_PATH('sales').doc(window.erpState.editingInvoiceId).set(saleData, { merge: true });
                saleRef = { id: window.erpState.editingInvoiceId };
            } else {
                saleRef = await DATA_PATH('sales').add(saleData);

                // FIX 17: Stock decrement logic for NEW sales
                if (!isEdit) {
                    for (const cartItem of window.erpState.cart) {
                        if (cartItem.id) {
                            const invItem = window.erpState.items.find(x => x.id === cartItem.id);
                            if (invItem && typeof invItem.stock === 'number') {
                                try {
                                    await window.FB.collection('items').doc(cartItem.id).update({
                                        stock: Math.max(0, invItem.stock - cartItem.qty)
                                    });
                                } catch (stockErr) {
                                    console.error('Stock update failed for', cartItem.name, stockErr);
                                }
                            }
                        }
                    }
                }
            }

            // Auto-create Tailoring Order if has stitching
            if (hasStitching) {
                const tailoringOrder = {
                    billNo: billNo,
                    stitchingOrderNo: stitchingNo,
                    customerName: name,
                    phone: phoneClean,
                    items: JSON.parse(JSON.stringify(window.erpState.cart)),
                    totalCost: total,
                    advancePaid: finalPaid,
                    status: 'Order Confirmed',
                    orderDate: Date.now(),
                    timestamp: Date.now(),
                    recordedBy,
                    isFromPOS: true,
                    originalSaleId: saleRef.id
                };
                await window.FB.root('orders').add(tailoringOrder);
            }
            window.logActivity(recordedBy, "Completed Sale", `Bill ${billNo} for ${name} - ${fmt(total)}`);

            // Update linked orders with customer info
            for (const item of window.erpState.cart) {
                if (item.tailoringRef) {
                    try {
                        const orderSnap = await window.FB.root('orders').where('billNo', '==', item.tailoringRef).get();
                        if (!orderSnap.empty) {
                            const orderDoc = orderSnap.docs[0];
                            const orderData = orderDoc.data();
                            if (orderData.customerName === "POS Pending") {
                                await window.FB.root('orders').doc(orderDoc.id).update({
                                    customerName: name,
                                    phone: phoneClean,
                                    recordedBy: recordedBy,
                                    staff: recordedBy,
                                    notesLog: (orderData.notesLog || []).concat([{ 
                                        text: `Customer linked & recorded by ${recordedBy} via POS Checkout`, 
                                        timestamp: new Date().toLocaleString() 
                                    }])
                                });
                            }
                        }
                    } catch (err) {
                        console.error("Failed to update linked order:", err);
                    }
                }
            }
            
            if(!client){
                const newSpent = total;
                const newTier = window.getLoyaltyTier(newSpent);
                await window.FB.root('clients').add({ 
                    name, phone: phoneClean, 
                    createdAt: Date.now(), 
                    loyaltyPoints: pointsEarned, 
                    totalSpent: newSpent,
                    loyaltyTier: newTier,
                    tier: newTier
                });
            } else {
                const newSpent = (client.totalSpent || 0) + total;
                const safeRedeem = Math.min(redeemAmt, client.loyaltyPoints || 0);
                const newPoints = Math.max(0, (client.loyaltyPoints || 0) - safeRedeem + pointsEarned);
                const newTier = window.getLoyaltyTier(newSpent);
                
                await window.FB.root('clients').doc(client.id).update({
                    loyaltyPoints: newPoints,
                    totalSpent: newSpent,
                    loyaltyTier: newTier,
                    tier: newTier,
                    lastVisit: Date.now()
                });

                if (newTier !== oldTier) {
                    setTimeout(() => window.erpAlert(`${name} upgraded to ${newTier.toUpperCase()} tier! 🎉`, "Tier Upgrade", "star"), 500);
                }
            }

            document.getElementById('charge-modal-overlay')?.remove();
            
            window.erpState.cart = [];
            window.erpState.counter = counter;
            window.erpState.activeDiscountAmt = 0;
            window.erpState.activeDiscountLabel = "";
            window.erpState.editingInvoiceId = null;
            window.erpState.editingInvoiceBillNo = null;
            
            window.showSuccessScreen(billNo, total, name, phone);
            window.scheduleRender();
        } catch (e) {
            console.error(e);
            window.erpAlert("Database write failed. The sale may have been queued offline.", "Sync Error", "wifi-off");
            document.getElementById('charge-modal-overlay')?.remove();
            window.erpState.cart = [];
            window.renderApp();
        }
    };

    window.showSuccessScreen = (billNo, total, name, phone) => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-3xl flex items-center justify-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 text-center animate-pop-in shadow-2xl relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-emerald-50 rounded-full blur-3xl"></div>
                
                <div class="w-24 h-24 bg-emerald-500 text-white rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-200 rotate-6 translate-y-2">
                    <i data-lucide="check" class="w-12 h-12 stroke-[4]"></i>
                </div>
                
                <h2 class="text-3xl font-black text-slate-900 tracking-tighter mb-2">Sale Recorded!</h2>
                <p class="text-slate-400 font-bold text-sm mb-10">Invoice ${billNo} • ${fmt(total)}</p>

                <div class="space-y-3">
                    <button onclick="window.shareWhatsApp('${billNo}', '${name}', '${phone}', ${total})" class="w-full py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg flex items-center justify-center gap-3">
                        <i data-lucide="message-circle" class="w-5 h-5"></i> WhatsApp Bill
                    </button>
                    <button onclick="window.printThermal('${billNo}')" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg flex items-center justify-center gap-3">
                        <i data-lucide="printer" class="w-5 h-5"></i> Thermal Print
                    </button>
                    <a href="https://www.lavishlavender.in/receipt/?bill=${billNo}" target="_blank" class="w-full py-4 bg-white border border-slate-200 text-slate-800 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3">
                        <i data-lucide="file-text" class="w-5 h-5"></i> View PDF Receipt
                    </a>
                </div>

                <button onclick="this.closest('.fixed').remove()" class="mt-8 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 hover:text-slate-500 transition-all">Close & Return</button>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    };

    // --- RECENT APP Logic (Tickets, Dues helpers) ---

    window.saveTicket = () => {
        if(window.erpState.cart.length === 0) return;
        
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in relative border border-slate-100">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
                <div class="mb-6">
                    <h3 class="text-xl font-black text-slate-900 mb-1 tracking-tighter uppercase">Save Ticket</h3>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Hold current cart for later</p>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 leading-none">Guest / Table Name</label>
                        <input id="ticket_name" type="text" placeholder="e.g. Table 4 or Maryam" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-violet-500 transition-all shadow-inner">
                    </div>
                    <button id="save_ticket_btn" class="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-slate-200 hover:bg-black transition-all active:scale-95 leading-none">Create Saved Ticket</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('ticket_name').focus();

        document.getElementById('save_ticket_btn').onclick = async () => {
            const name = document.getElementById('ticket_name').value.trim() || 'Guest';
            const btn = document.getElementById('save_ticket_btn');
            btn.innerText = "SAVING..."; btn.disabled = true;

            const ticket = {
                customer: name,
                items: [...window.erpState.cart],
                total: window.erpState.cart.reduce((a,b) => a + (b.price * b.qty), 0),
                time: new Date().toLocaleTimeString(),
                createdAt: Date.now()
            };
            
            try {
                await DATA_PATH('tickets').add(ticket);
                window.erpState.cart = [];
                modal.remove();
                window.renderApp();
            } catch(e) { 
                console.error(e);
                window.erpAlert("Ticket save failed. please check connections."); 
                btn.innerText = "CREATE SAVED TICKET"; btn.disabled = false; 
            }
        };
    };

    window.loadTicket = (idx) => {
        const t = window.erpState.tickets[idx];
        window.erpState.cart = [...t.items];
        if(t.id) DATA_PATH('tickets').doc(t.id).delete();
        window.erpState.tab = 'pos';
        window.renderApp();
        window.erpAlert("Ticket loaded successfully", "System", "download");
    };

    window.deleteTicket = async (idx) => {
        if(!(await window.erpConfirm("Discard this saved ticket?", "Delete Ticket"))) return;
        const t = window.erpState.tickets[idx];
        if(t.id) await DATA_PATH('tickets').doc(t.id).delete();
        window.renderApp();
    };

    window.collectDue = (id) => {
        const s = window.erpState.sales.find(x => x.id === id) || window.erpState.orders.find(x => x.id === id);
        if(!s) return;
        
        const balance = s.balanceDue !== undefined ? s.balanceDue : Math.max(0, (s.totalCost || 0) - (s.advancePaid || 0) - (s.deliveryDiscount || 0));

        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in relative border border-slate-100">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
                
                <div class="mb-8">
                    <h3 class="text-xl font-black text-slate-900 mb-1">Collect Payment</h3>
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${s.billNo} • Balance: ${fmt(balance)}</p>
                </div>

                <div class="space-y-5">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Amount to Collect (₹)</label>
                        <input id="collect_amt" type="number" value="${balance}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-slate-800 outline-none focus:border-violet-500 transition-all">
                    </div>

                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Payment Method</label>
                        <select id="collect_method" onchange="window.toggleMixedInputs_Collect()" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest outline-none focus:border-violet-500 transition-all">
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI / Digital</option>
                            <option value="Mixed">Mixed (Cash & UPI)</option>
                            <option value="Card">Card</option>
                        </select>
                    </div>

                    <div id="collect_mixed_fields" class="hidden grid grid-cols-2 gap-3 animate-pop-in">
                        <input id="collect_cash" type="number" placeholder="Cash ₹" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-xs outline-none">
                        <input id="collect_upi" type="number" placeholder="UPI ₹" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-xs outline-none">
                    </div>

                    <button id="collect_confirm_btn" class="w-full py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-violet-100 hover:bg-violet-700 transition-all active:scale-95 mt-4">Record Collection</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        window.toggleMixedInputs_Collect = () => {
            const method = document.getElementById('collect_method').value;
            document.getElementById('collect_mixed_fields').classList.toggle('hidden', method !== 'Mixed');
        };

        document.getElementById('collect_confirm_btn').onclick = async () => {
            const amt = parseFloat(document.getElementById('collect_amt').value);
            const method = document.getElementById('collect_method').value;
            
            if(isNaN(amt) || amt <= 0) return alert("Invalid amount");

            const btn = document.getElementById('collect_confirm_btn');
            const originalText = btn.innerText;
            btn.innerText = "RECORDING..."; btn.disabled = true;

            try {
                const collection = isSale ? DATA_PATH('sales') : window.FB.root('orders');
                
                const currentPaid = s.advancePaid || 0;
                const newPaid = currentPaid + amt;
                
                const updateData = {
                    advancePaid: newPaid,
                    paymentLog: (s.paymentLog || []).concat([{ 
                        date: Date.now(), 
                        amount: amt, 
                        method, 
                        cashParts: method === 'Mixed' ? parseFloat(document.getElementById('collect_cash').value || 0) : null,
                        upiParts: method === 'Mixed' ? parseFloat(document.getElementById('collect_upi').value || 0) : null,
                        note: "Due Collection" 
                    }])
                };

                if (isSale) {
                    updateData.balanceDue = Math.max(0, s.total - newPaid);
                }

                await collection.doc(id).update(updateData);
                
                modal.remove();
                document.querySelectorAll(".fixed.inset-0").forEach(m => m.remove());
                window.renderApp();
                window.erpAlert("Payment recorded successfully!", "Success", "check-circle");
            } catch (e) { 
                console.error(e);
                window.erpAlert("Collection sync failed. check connection."); 
                btn.innerText = originalText; btn.disabled = false;
            }
        };
    };

    window.openReceipt = (id) => {
        let sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) {
            sale = window.erpState.orders.find(o => o.id === id);
        }
        if (!sale) {
            sale = window.erpState.voidedSales?.find(o => o.id === id);
        }
        if (!sale) {
            sale = window.erpState.voidedOrders?.find(o => o.id === id);
        }
        if (!sale) return;

        // Unified Mapping with 0-safe checks
        const subtotal = sale.subtotal || sale.totalCost || 0;
        const discount = sale.discount || sale.deliveryDiscount || 0;
        const total = sale.total || sale.totalCost || (subtotal - discount);
        const balance = sale.balanceDue !== undefined ? sale.balanceDue : Math.max(0, (sale.totalCost || 0) - (sale.advancePaid || 0) - (sale.deliveryDiscount || 0));

        const tailoringRefs = [...new Set((sale.items || []).map(i => i.tailoringRef || i.tailoringBillNo).filter(Boolean))];
        const tailoringHtml = tailoringRefs.length > 0 ? `
            <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-4">
                <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Tailoring Reference</p>
                <p class="font-black text-indigo-600">${tailoringRefs.join(', ')}</p>
            </div>
        ` : '';

        const modal = document.createElement("div");
        modal.id = "receipt-modal";
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[500] p-0 sm:p-4";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-sm sm:rounded-[40px] rounded-t-[40px] shadow-2xl animate-slide-up sm:animate-pop-in border border-slate-100 overflow-hidden my-auto relative max-h-[90vh] flex flex-col">
                <!-- Sticky Header with Close Button -->
                <div class="px-8 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between sticky top-0 z-20">
                    <div>
                        <h3 class="font-black text-xl leading-none text-slate-800">${sale.billNo}</h3>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1.5">${new Date(sale.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <button onclick="document.getElementById('receipt-modal')?.remove()" class="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
                
                <div class="overflow-y-auto custom-scrollbar p-8">
                    <div class="mb-6">
                        <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Customer Details</h4>
                        <p class="font-black text-slate-900 text-lg leading-tight text-slate-800">${sale.customerName || 'Walk-in'}</p>
                        <p class="text-slate-400 font-bold text-sm mt-0.5">${sale.customerPhone || 'N/A'}</p>
                    </div>
                    
                    ${tailoringHtml}

                    <div class="mb-8">
                        <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Summary</h4>
                        <div class="space-y-2.5 pr-2">
                            ${(sale.items || []).map(i => `
                                <div class="flex justify-between items-center text-sm font-bold">
                                    <span class="text-slate-500">${i.name} <span class="text-[10px] text-slate-300 ml-1">x${i.qty}</span></span>
                                    <span class="text-slate-900">${fmt(i.price * i.qty)}</span>
                                </div>
                            `).join('')}
                            ${(sale.refundLog || []).map(r => `
                                <div class="flex justify-between items-center text-sm font-bold text-rose-400" style="opacity:0.8">
                                    <span>${r.item} (Returned)</span>
                                    <span>-${fmt(r.amount)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-4 pt-4 border-t border-dashed border-slate-100 flex justify-between items-center">
                            <span class="text-[10px] font-black text-slate-400 uppercase">Final Total</span>
                            <span class="text-xl font-black text-violet-600">${fmt(sale.total || total)}</span>
                        </div>
                        ${balance > 0 ? `
                            <div class="flex justify-between items-center bg-rose-50 px-3 py-2 rounded-xl mt-3">
                                <div>
                                    <span class="text-[10px] font-black text-rose-400 uppercase block leading-none mb-1">Due</span>
                                    <span class="text-sm font-black text-rose-600">${fmt(balance)}</span>
                                </div>
                                <button onclick="window.collectDue('${sale.id}')" class="bg-rose-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-200 active:scale-95">Collect</button>
                            </div>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="window.printThermal('${sale.billNo}')" class="flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                            <i data-lucide="printer" class="w-3.5 h-3.5"></i> Thermal
                        </button>
                        <a href="https://www.lavishlavender.in/receipt/?bill=${sale.billNo}" target="_blank" class="flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition-all">
                            <i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF Receipt
                        </a>
                    </div>
                    
                    <button onclick="window.shareWhatsApp('${sale.billNo}','${sale.customerName}','${sale.customerPhone}',${total},${balance})" class="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all mt-3">
                        <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp Receipt
                    </button>

                    ${balance > 0 ? `
                        <button onclick="window.sendReminder('${sale.billNo}','${sale.customerName}','${sale.customerPhone}',${balance})" class="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-amber-600 transition-all mt-2">
                            <i data-lucide="bell" class="w-4 h-4"></i> Send Reminder
                        </button>
                    ` : ''}

                    <div class="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                        <button onclick="document.getElementById('receipt-modal')?.remove(); window.editInvoice('${sale.id}')" class="text-[10px] font-black text-violet-600 uppercase tracking-widest hover:text-violet-800 flex items-center gap-1.5 transition-colors">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Edit Bill
                        </button>
                        <button onclick="window.refundItem('${sale.id}')" class="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Refund
                        </button>
                    </div>

                    <button onclick="document.getElementById('receipt-modal')?.remove()" class="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all mt-8">
                        Close Receipt
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    };

    window.refundItem = async (id) => {
        const sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) return;

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[600] p-4";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100 relative">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="text-center mb-6">
                    <h3 class="text-xl font-black text-slate-800">Process Refund</h3>
                    <p class="text-slate-400 text-sm font-bold">Select item to return from ${sale.billNo}</p>
                </div>
                
                <div class="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    ${(sale.items || []).map((item, idx) => `
                        <button onclick="window._confirmRefund('${id}', ${idx})" class="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-amber-400 hover:bg-amber-50 group transition-all text-left">
                            <div>
                                <p class="font-black text-slate-800 group-hover:text-amber-700">${item.name}</p>
                                <p class="text-[10px] font-bold text-slate-400">Qty: ${item.qty} | Price: ${fmt(item.price)}</p>
                            </div>
                            <i data-lucide="rotate-ccw" class="w-4 h-4 text-slate-300 group-hover:text-amber-500"></i>
                        </button>
                    `).join('')}
                </div>
                
                <button onclick="this.closest('.fixed').remove()" class="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm uppercase tracking-widest">Cancel</button>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
    };

    window._confirmRefund = async (saleId, itemIdx, qtyToRefund) => {
        const sale = window.erpState.sales.find(s => s.id === saleId);
        const item = sale.items[itemIdx];

        if (item.qty > 1 && qtyToRefund === undefined) {
            const modal = document.createElement('div');
            modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[700] p-4";
            modal.innerHTML = `
                <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in relative border border-slate-100">
                    <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tighter">Refund Quantity</h3>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Item: ${item.name} (Max ${item.qty})</p>
                    </div>
                    <div class="space-y-4">
                        <input id="refund_qty_input" type="number" value="${item.qty}" min="1" max="${item.qty}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl text-center outline-none focus:border-violet-500 transition-all shadow-inner">
                        <button id="refund_cnt_btn" class="w-full py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-violet-100 active:scale-95 leading-none">Confirm Quantity</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            if (window.lucide) lucide.createIcons();
            document.getElementById('refund_qty_input').focus();

            return new Promise((resolve) => {
                document.getElementById('refund_cnt_btn').onclick = () => {
                    const qty = parseFloat(document.getElementById('refund_qty_input').value);
                    modal.remove();
                    if (isNaN(qty) || qty <= 0 || qty > item.qty) {
                        window.erpAlert("Invalid quantity");
                        return;
                    }
                    window._executeRefund(saleId, itemIdx, qty);
                };
            });
        }
        
        window._executeRefund(saleId, itemIdx, item.qty);
    };

    window._executeRefund = async (saleId, itemIdx, qtyToRefund) => {
        const sale = window.erpState.sales.find(s => s.id === saleId);
        const item = sale.items[itemIdx];

        if (!(await window.erpConfirm(`Confirm refund for ${qtyToRefund}x ${item.name}? This will restock the item and deduct ${fmt(item.price * qtyToRefund)} from the bill total.`, "Process Refund"))) return;

        try {
            // 1. Update stock (local state + firebase)
            const originalItem = window.erpState.items.find(x => x.id === item.id || x.sku === item.sku);
            if (originalItem) {
                await DATA_PATH('items').doc(originalItem.id).update({
                    stock: Number(originalItem.stock || 0) + qtyToRefund
                });
            }

            // 2. Update sale record
            const refundValue = item.price * qtyToRefund;
            const newSubtotal = Math.max(0, (sale.subtotal || 0) - refundValue);
            const newTotal = Math.max(0, (sale.total || 0) - refundValue);
            const newBalanceDue = Math.max(0, (sale.balanceDue || 0) - refundValue);

            const newItems = JSON.parse(JSON.stringify(sale.items));
            if (qtyToRefund === item.qty) {
                newItems.splice(itemIdx, 1);
            } else {
                newItems[itemIdx].qty -= qtyToRefund;
            }

            await DATA_PATH('sales').doc(saleId).update({
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal,
                balanceDue: newBalanceDue,
                refundLog: [...(sale.refundLog || []), { item: item.name, amount: refundValue, date: Date.now() }]
            });

            window.erpAlert("Refund processed successfully.", "Success", "check-circle");
            document.querySelectorAll(".fixed .animate-pop-in").forEach(x => x.closest('.fixed').remove());
            window.renderApp();
        } catch (e) {
            window.erpAlert("Error processing refund. Check connection.");
            console.error(e);
        }
    };

    window.voidBill = (id) => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in relative border border-slate-100">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
                <div class="mb-8 text-center">
                    <div class="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
                        <i data-lucide="shield-alert" class="w-8 h-8"></i>
                    </div>
                    <h3 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tighter">Administrative Void</h3>
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Owner Credentials Required</p>
                </div>
                <div class="space-y-4">
                    <div>
                        <input id="void_pin" type="password" placeholder="••••" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl text-center tracking-[0.5em] outline-none focus:border-rose-500 transition-all shadow-inner">
                    </div>
                    <button id="void_confirm_btn" class="w-full py-5 bg-rose-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95 leading-none">Verify & Delete Bill</button>
                    <p class="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest">This action is permanent and recorded</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('void_pin').focus();

        document.getElementById('void_confirm_btn').onclick = async () => {
            const pin = document.getElementById('void_pin').value;
            const creds = window.erpState.passwords || { owner: 'Swali4783' };
            
            if (pin === (creds.owner || '')) {
                if (!(await window.erpConfirm("Are you 100% sure? This will VOID all linked data and REVERSE loyalty points.", "Confirm Void"))) return;
                try {
                    const sale = (window.erpState.sales || []).find(s => s.id === id);
                    const order = (window.erpState.orders || []).find(o => o.id === id);
                    const voidData = { voidedAt: Date.now(), voidedBy: 'Owner', originalId: id };
                    
                    if (sale) {
                        // 1. Move to Voided Sales
                        await DATA_PATH('voided_sales').add({ ...sale, ...voidData, _type: 'sale' });
                        await DATA_PATH('sales').doc(id).delete();
                        
                        // 2. Reverse Loyalty Points
                        if (sale.customerPhone) {
                            const client = (window.erpState.clients || []).find(c => c.phone === sale.customerPhone);
                            if (client) {
                                const earned = sale.loyaltySnapshot?.earned || 0;
                                await window.FB.root('clients').doc(client.id).update({
                                    loyaltyPoints: Math.max(0, (client.loyaltyPoints || 0) - earned),
                                    totalSpent: Math.max(0, (client.totalSpent || 0) - (sale.total || 0))
                                });
                            }
                        }

                        // 3. Clear Linked Order
                        const linkedOrder = (window.erpState.orders || []).find(o => o.billNo === sale.billNo);
                        if (linkedOrder) {
                            await DATA_PATH('voided_orders').add({ ...linkedOrder, ...voidData, _type: 'order' });
                            await window.FB.root('orders').doc(linkedOrder.id).delete();
                        }
                    } else if (order) {
                        // 1. Move to Voided Orders
                        await DATA_PATH('voided_orders').add({ ...order, ...voidData, _type: 'order' });
                        await window.FB.root('orders').doc(id).delete();

                        // 2. Reverse Loyalty Points
                        if (order.phone) {
                            const client = (window.erpState.clients || []).find(c => c.phone === order.phone);
                            if (client) {
                                const earned = order.loyaltySnapshot?.earned || 0;
                                await window.FB.root('clients').doc(client.id).update({
                                    loyaltyPoints: Math.max(0, (client.loyaltyPoints || 0) - earned),
                                    totalSpent: Math.max(0, (client.totalSpent || 0) - (order.totalCost || 0))
                                });
                            }
                        }

                        // 3. Clear Linked Sale
                        const linkedSale = (window.erpState.sales || []).find(s => s.billNo === order.billNo);
                        if (linkedSale && window.FB.collection) {
                            await DATA_PATH('voided_sales').add({ ...linkedSale, ...voidData, _type: 'sale' });
                            await DATA_PATH('sales').doc(linkedSale.id).delete();
                        }
                    }
                    
                    modal.remove();
                    document.querySelectorAll(".fixed.inset-0").forEach(m => m.remove());
                    window.renderApp();
                    window.erpAlert("Records voided and points reversed successfully.");
                } catch (e) { console.error(e); window.erpAlert("Void operation failed"); }
            } else {
                window.erpAlert("Incorrect Security PIN.", "Access Denied", "shield-off");
                document.getElementById('void_pin').value = '';
            }
        };
    };

    function renderVoided() {
        const sales = window.erpState.voidedSales || [];
        const orders = window.erpState.voidedOrders || [];
        const list = [...sales, ...orders].sort((a,b) => (b.voidedAt || 0) - (a.voidedAt || 0));

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <div class="p-8 border-b border-slate-200 bg-white">
                <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase">Voided Audit Trail</h2>
                <p class="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-1">${list.length} Invoices Nullified</p>
            </div>
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-4">
                    ${list.map(v => `
                        <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                            <div class="absolute right-0 top-0 h-full w-1 bg-rose-500"></div>
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="flex items-center gap-3 mb-2">
                                        <span class="text-lg font-black text-slate-800">${v.billNo}</span>
                                        <span class="px-2 py-0.5 bg-rose-50 text-rose-500 rounded text-[8px] font-black uppercase tracking-widest">${v._type === 'sale' ? 'POS' : 'TLR'} VOIDED</span>
                                    </div>
                                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        Client: ${v.customerName || 'N/A'} • Original Value: ${fmt(v.total || v.totalCost || 0)}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p class="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none mb-1">Voided On</p>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase">${new Date(v.voidedAt).toLocaleString()}</p>
                                    <p class="text-[8px] font-black text-rose-600 uppercase mt-2">By ${v.voidedBy}</p>
                                </div>
                            </div>
                        </div>
                    `).join('') || `
                        <div class="py-20 text-center text-slate-300 italic">
                            <i data-lucide="shield-off" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                            No voided records found.
                        </div>
                    `}
                </div>
            </div>
        </div>`;
    }

    window.printThermal = (billNo) => {
        const sale = window.erpState.sales.find(s => s.billNo === billNo);
        if (!sale) return;

        const printData = {
            billNo: sale.billNo,
            customerName: sale.customerName,
            customerPhone: sale.customerPhone,
            date: sale.date,
            recordedBy: sale.recordedBy,
            items: sale.items || [],
            subtotal: sale.subtotal || 0,
            discount: sale.discount || 0,
            redeemAmt: sale.redeemedPoints || 0,
            taxVal: sale.taxValue || 0,
            total: sale.total || 0,
            paid: sale.advancePaid || 0,
            balance: sale.balanceDue || 0,
            loyaltySnapshot: sale.loyaltySnapshot,
            tailoringRefs: [...new Set((sale.items || []).map(i => i.tailoringRef).filter(Boolean))]
        };

        window.generateThermalPrint(printData);
    };

    window.printReceipt = (billNo) => window.printThermal(billNo);

    // --- MISC UTILS ---
    // Helper for WhatsApp placeholders


    window.lookupClient = (p) => {
        const clean = p; // Already sanitized by oninput
        if(clean.length < 5) return;
        const c = window.erpState.clients.find(x => window.sanitizePhone(x.phone).includes(clean));
        if(c) {
            const nameEl = document.getElementById('cm_client_name');
            if (nameEl) {
                nameEl.value = c.name;
                nameEl.classList.add('text-violet-600');
            }

            const loyPreview = document.getElementById('cm_loyalty_preview');
            if (loyPreview) {
                const tierKey = window.getLoyaltyTier(c.totalSpent || 0);
                const tier = LOYALTY.TIERS[tierKey];
                const points = c.loyaltyPoints || 0;
                const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
                const disc = window.erpState.activeDiscountAmt || 0;
                const total = subtotal - disc;
                const potential = window.calcPoints(total, tierKey);

                loyPreview.classList.remove('hidden');
                loyPreview.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-${tier.color}-500/20 rounded-xl flex items-center justify-center text-${tier.color}-400">
                                <i data-lucide="star" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <p class="text-[10px] font-black text-white uppercase tracking-widest">${tier.label} Member</p>
                                <p class="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Current Balance: ${points} pts</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p id="cm_earned_pts" class="text-emerald-400 font-black text-lg">+${potential}</p>
                            <p class="text-[8px] font-bold text-slate-500 uppercase">Points to Earn</p>
                        </div>
                    </div>
                    
                    ${points >= LOYALTY.MIN_REDEMPTION ? `
                        <div class="pt-4 border-t border-slate-800">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex flex-col">
                                    <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Redeem Points</span>
                                    <span class="text-[7px] text-slate-500 font-bold uppercase mt-0.5">1 Pt = ₹1 &bull; Multiples of 500 only</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <input type="number" id="cm_redeem_amt" min="0" max="${Math.floor(points/500)*500}" step="500"
                                        oninput="window.snapRedeemToMultiple(${subtotal})" 
                                        placeholder="0" class="w-20 px-3 py-1.5 bg-slate-800 border-none rounded-lg text-white font-black text-xs outline-none focus:ring-1 focus:ring-violet-500">
                                    <span class="text-[10px] font-black text-slate-400 uppercase">PTS</span>
                                </div>
                            </div>
                            <!-- Quick Redemption Chips: multiples of 500 up to balance, max 4 shown -->
                            <div class="flex flex-wrap gap-2">
                                ${Array.from({length: Math.min(4, Math.floor(points/500))}, (_,i) => (i+1)*500).map(v => `
                                    <button type="button" onclick="document.getElementById('cm_redeem_amt').value=${v}; window.snapRedeemToMultiple(${subtotal});"
                                        class="px-3 py-1 bg-slate-800 hover:bg-violet-600 text-slate-300 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                                        ${v} pts
                                    </button>
                                `).join('')}
                                ${points >= 2500 ? `<button type="button" onclick="document.getElementById('cm_redeem_amt').value=${Math.floor(points/500)*500}; window.snapRedeemToMultiple(${subtotal});"
                                    class="px-3 py-1 bg-violet-700 hover:bg-violet-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">Max</button>` : ''}
                            </div>
                        </div>
                    ` : `
                        <p class="text-[7px] font-black text-slate-600 uppercase tracking-widest text-center mt-2 italic">Need ${LOYALTY.MIN_REDEMPTION - points} more pts to unlock redemption (min 500 pts)</p>
                    `}
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    };

    function fillTemplate(tpl, data) {
        if (!tpl) return "";
        return tpl.replace(/{(\w+)}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    window.shareWhatsApp = (billNo, name, phone, total, balance = 0) => {
        const sale = window.erpState.sales.find(s => s.billNo === billNo);
        const order = window.erpState.orders.find(o => o.billNo === billNo);
        const client = window.erpState.clients.find(c => c.phone === (phone || sale?.customerPhone || order?.phone));
        
        const data = {
            customerName: name || sale?.customerName || order?.customerName || 'Customer',
            billNo: billNo,
            totalCost: (total || sale?.total || order?.totalCost || 0).toLocaleString('en-IN'),
            advancePaid: (total - (balance || 0)).toLocaleString('en-IN'),
            balance: (balance || 0).toLocaleString('en-IN'),
            deliveryDate: sale ? new Date(sale.date).toLocaleDateString() : (order ? window.fmtDate(order.deliveryDate) : 'N/A'),
            pointsEarned: sale?.loyaltySnapshot?.earned || order?.loyaltySnapshot?.earned || 0,
            totalPoints: client?.loyaltyPoints || 0,
            tier: (window.LOYALTY.TIERS[window.getLoyaltyTier(client?.totalSpent || 0)]?.label || 'Basic') + ' Member'
        };
        data.tier = data.tier.toUpperCase();

        const templates = window.erpState.whatsappTemplates || {};
        let tpl = balance > 0 ? (templates.ready || templates.booking) : templates.delivered;
        
        if (!tpl) {
            tpl = `*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour bill *{billNo}* for *₹{totalCost}* is confirmed. {balance != "0" ? 'Remaining: *₹{balance}*' : ''}\n\n✨ *Loyalty Info*\n{earnedPoints} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nView details: https://www.lavishlavender.in/receipt/?bill={billNo}`;
        }

        const msg = encodeURIComponent(fillTemplate(tpl, data));
        const cleanPhone = (phone || "").toString().replace(/\D/g, '');
        const target = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        if (target) window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
    };

    window.sendReminder = (billNo, name, phone, balance) => {
        const client = window.erpState.clients.find(c => c.phone === phone);
        const data = {
            customerName: name || 'Customer',
            billNo: billNo,
            balance: (balance || 0).toLocaleString('en-IN'),
            totalPoints: client?.loyaltyPoints || 0,
            tier: ((window.LOYALTY.TIERS[window.getLoyaltyTier(client?.totalSpent || 0)]?.label || 'Basic') + ' Member').toUpperCase()
        };
        const templates = window.erpState.whatsappTemplates || {};
        const tpl = templates.reminder || `Friendly reminder from *Lavish Lavender* regarding bill *{billNo}*.\n\nPending balance: *₹{balance}*.\n\nThank you!`;
        
        const msg = encodeURIComponent(fillTemplate(tpl, data));
        const cleanPhone = (phone || "").toString().replace(/\D/g, '');
        const target = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        if (target) window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
    };





    window.updatePasswords = () => {
        const staff = document.getElementById('pass_staff').value.trim();
        const owner = document.getElementById('pass_owner').value.trim();
        if(!staff || !owner) return alert("Passwords cannot be empty");
        
        window.erpState.passwords = { staff, owner };
        window.saveGeneralSettings();
        alert("Admin Credentials Updated Successfully!");
        window.renderApp();
    };

    window.openAddStaff = () => {
        const modal = document.createElement('div');
        modal.id = 'staff-modal-overlay';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[700] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-pop-in border border-slate-100 relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                
                <div class="flex items-center gap-3 mb-8 relative">
                    <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        <i data-lucide="user-plus" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Enroll Staff</h3>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add New Terminal Operator</p>
                    </div>
                </div>

                <div class="space-y-5 mb-8 relative">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Full Name</label>
                        <input id="staff_name" type="text" placeholder="e.g. Swaliha K" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Access Code (4 Digits)</label>
                        <input id="staff_code" type="password" maxlength="4" placeholder="••••" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl tracking-[0.5em] text-center outline-none focus:border-indigo-500 shadow-inner">
                    </div>
                </div>

                <div class="flex gap-3 relative">
                    <button onclick="document.getElementById('staff-modal-overlay').remove()" class="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                    <button onclick="window.enrollStaff()" class="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95">Verify & Enroll</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('staff_name').focus();
    };

    window.enrollStaff = async () => {
        const name = document.getElementById('staff_name').value.trim();
        const code = document.getElementById('staff_code').value.trim();

        if (!name || code.length !== 4) return alert("Please enter a valid Name and 4-digit Code.");

        const staff = window.erpState.staff || [];
        if (staff.find(s => s.code === code)) return alert("This Access Code is already assigned to someone else.");

        staff.push({ name, code });
        window.erpState.staff = staff;

        const btn = document.querySelector("#staff-modal-overlay button.bg-slate-900");
        btn.innerText = "ENROLLING..."; btn.disabled = true;

        await window.saveGeneralSettings();
        document.getElementById('staff-modal-overlay').remove();
        window.renderApp();
    };

    window.deleteStaff = async (idx) => {
        if (!confirm("Are you sure you want to remove this staff member? All their historical sales remains, but they will no longer have access.")) return;
        
        window.erpState.staff.splice(idx, 1);
        await window.saveGeneralSettings();
        window.renderApp();
    };



    window.openClientProfile = (id) => {
        const c = (window.erpState.clients || []).find(x => x.id === id);
        if(!c) return;

        // Fetch latest tailoring measurements if any
        const clientOrders = (window.erpState.orders || []).filter(o => o.phone === c.phone);
        const latestOrder = clientOrders.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        const m = latestOrder?.measurements || c.measurements || {};
        
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-2xl flex justify-center items-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-lg rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-y-auto max-h-[90vh] custom-scrollbar">
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                
                <div class="flex items-center gap-6 mb-12 relative">
                    <div class="w-24 h-24 bg-slate-900 text-white rounded-[40px] flex items-center justify-center font-black text-4xl shadow-2xl">
                        ${c.name ? c.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-1">${c.name}</h2>
                        <div class="flex items-center gap-3">
                            <div class="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full group/phone cursor-pointer hover:bg-indigo-100 transition-all" onclick="window.editClientPhone('${c.id}', '${c.phone}')">
                                <p class="text-indigo-600 font-black text-xs font-mono tracking-widest">${window.sanitizePhone(c.phone)}</p>
                                <i data-lucide="pencil" class="w-3 h-3 text-indigo-400 group-hover/phone:text-indigo-600"></i>
                            </div>
                            <span class="w-1.5 h-1.5 bg-slate-200 rounded-full"></span>
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">${c.loyaltyTier || 'Standard Partner'}</span>
                        </div>
                    </div>
                </div>

                <!-- Loyalty Pulse Card -->
                <div class="bg-slate-900 rounded-[40px] p-8 text-white mb-10 relative overflow-hidden shadow-2xl shadow-slate-200">
                    <div class="absolute -right-10 -bottom-10 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    <div class="flex justify-between items-center relative z-10 mb-6">
                        <div>
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Loyalty Balance</p>
                            <h3 class="text-4xl font-black tracking-tighter">${(c.loyaltyPoints || 0).toLocaleString()} <span class="text-sm text-indigo-400 ml-1">POINTS</span></h3>
                        </div>
                        <div class="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                            <i data-lucide="crown" class="w-6 h-6 text-indigo-400"></i>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 relative z-10">
                        <span class="px-4 py-2 bg-indigo-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30">${c.loyaltyTier || 'Basic Member'} Tier</span>
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">Validated with Cloud</p>
                    </div>
                </div>

                <!-- Measurement Quick View (Top 4) -->
                <div class="mb-10 relative">
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1 flex justify-between">
                        Measurement Specs <span class="text-indigo-500">Live from Tailoring</span>
                    </h3>
                    <div class="grid grid-cols-4 gap-3">
                        ${['chest', 'waist', 'seat', 'full_length'].map(key => `
                            <div class="bg-indigo-50/50 p-4 rounded-3xl border border-indigo-100 text-center">
                                <p class="text-[8px] font-black text-indigo-400 uppercase mb-1">${key.replace('_', ' ')}</p>
                                <p class="text-lg font-black text-indigo-700">${m[key] || '-'}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mb-10 relative">
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Standard Size</p>
                        <select id="cp_size" onchange="window.updateClientField('${c.id}', 'size', this.value)" class="w-full bg-transparent font-black text-slate-800 uppercase tracking-tight text-sm outline-none">
                            <option value="">N/A</option>
                            <option value="XS" ${c.size === 'XS' ? 'selected' : ''}>XS</option>
                            <option value="S" ${c.size === 'S' ? 'selected' : ''}>Small (S)</option>
                            <option value="M" ${c.size === 'M' ? 'selected' : ''}>Medium (M)</option>
                            <option value="L" ${c.size === 'L' ? 'selected' : ''}>Large (L)</option>
                            <option value="XL" ${c.size === 'XL' ? 'selected' : ''}>Extra Large (XL)</option>
                            <option value="XXL" ${c.size === 'XXL' ? 'selected' : ''}>Double XL (XXL)</option>
                        </select>
                    </div>
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fit Preference</p>
                        <select id="cp_fit" onchange="window.updateClientField('${c.id}', 'fit', this.value)" class="w-full bg-transparent font-black text-slate-800 uppercase tracking-tight text-[10px] outline-none">
                            <option value="">Normal</option>
                            <option value="Slim" ${c.fit === 'Slim' ? 'selected' : ''}>Slim Fit</option>
                            <option value="Regular" ${c.fit === 'Regular' ? 'selected' : ''}>Regular Fit</option>
                            <option value="Modest" ${c.fit === 'Modest' ? 'selected' : ''}>Modest / Loose</option>
                        </select>
                    </div>
                </div>

                <div class="mb-10 relative">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Private Client Notes</label>
                    <textarea id="cp_notes" placeholder="Fabric preferences, style quirks, etc..." onblur="window.updateClientField('${c.id}', 'notes', this.value)" class="w-full p-6 bg-slate-50 rounded-[32px] border border-slate-100 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300 transition-all min-h-[120px]">${c.notes || ''}</textarea>
                </div>

                <!-- Recent Activity (New Suggestion) -->
                <div class="space-y-3 relative mb-12">
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex justify-between">Recent History <span class="text-slate-300">Last 3 Orders</span></h3>
                    <div class="space-y-2">
                        ${clientOrders.slice(0, 3).map(o => `
                            <div class="flex justify-between items-center p-4 bg-slate-50 rounded-3xl border border-slate-100 group/item hover:border-indigo-200 transition-all">
                                <div>
                                    <p class="text-xs font-bold text-slate-800 uppercase group-hover/item:text-indigo-600">${o.billNo}</p>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase">${window.fmtDate(o.timestamp)}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-xs font-black text-slate-800">${window.fmt(o.totalCost)}</p>
                                    <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}">${o.status}</span>
                                </div>
                            </div>
                        `).join('') || '<p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest text-center py-6 border-2 border-dashed border-slate-100 rounded-[32px]">No Transaction History</p>'}
                    </div>
                </div>

                <div class="space-y-4 relative">
                    <div class="grid grid-cols-3 gap-4">
                        <a href="tel:${c.phone}" class="flex-1 py-5 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
                             <i data-lucide="phone" class="w-4 h-4"></i> Call
                        </a>
                        <button onclick="window.shareWhatsApp('', '${c.name}', '${c.phone}', 0)" class="flex-1 py-5 bg-emerald-500 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                             <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
                        </button>
                    </div>
                    <button onclick="window.deleteCustomer('${c.id}')" class="w-full py-5 bg-rose-50 text-rose-500 rounded-[28px] font-black uppercase text-[10px] tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-3 border border-rose-100">
                        <i data-lucide="user-x" class="w-4 h-4"></i> Delete Client Record
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="w-full py-5 bg-slate-900 text-white rounded-[28px] font-black uppercase text-[10px] tracking-widest">Close Profile</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    };

    window.editClientPhone = async (id, currentPhone) => {
        const newPhone = prompt("Enter new 10-digit phone number (e.g. 8714283895):", currentPhone);
        if (newPhone === null) return;
        const cleanPhone = window.sanitizePhone(newPhone);
        if (cleanPhone.length < 10) return window.erpAlert("Invalid phone number. Must be 10 digits.", "Validation Error", "phone");

        try {
            await window.FB.root('clients').doc(id).update({ phone: cleanPhone });
            window.erpAlert("Phone number updated successfully.", "Success", "check-circle");
            document.querySelectorAll(".fixed").forEach(m => m.remove());
            window.renderApp();
            // Re-open profile to see changes
            setTimeout(() => window.openClientProfile(id), 500);
        } catch (e) {
            console.error(e);
            alert("Error updating phone number.");
        }
    };

    window.openAddItem = function () {
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[700] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-violet-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
                <div class="mb-10 text-center relative">
                    <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">Quick Add Item</h2>
                    <p class="text-[10px] font-black text-violet-500 uppercase tracking-[0.3em]">Instant Inventory Sync</p>
                </div>
                
                <div class="space-y-6 relative overflow-y-auto max-h-[70vh] custom-scrollbar px-2">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Product Name</label>
                        <input id="ai_name" placeholder="E.g. Linen Blouse" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-violet-500/10 placeholder:text-slate-300">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Category</label>
                            <input id="ai_category" list="cat-opts" placeholder="Category" class="w-full px-6 py-4 bg-slate-50 border-none rounded-[24px] font-black text-xs outline-none focus:ring-4 focus:ring-violet-500/10">
                            <datalist id="cat-opts">${[...new Set((window.erpState.items || []).map(i => i.category).filter(Boolean))].map(c => `<option value="${c}">`).join('')}</datalist>
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Stock Qty</label>
                            <input id="ai_stock" type="number" placeholder="0" class="w-full px-6 py-4 bg-slate-50 border-none rounded-[24px] font-black text-sm outline-none focus:ring-4 focus:ring-violet-500/10">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Cost Price ₹</label>
                            <input id="ai_cost" type="number" placeholder="0" class="w-full px-6 py-4 bg-slate-50 text-slate-500 border-none rounded-[24px] font-black text-sm outline-none focus:ring-4 focus:ring-violet-500/10">
                        </div>
                        <div class="space-y-1.5">
                            <label class="text-[9px] font-black text-violet-500 uppercase tracking-[0.2em] pl-2">Selling Price ₹</label>
                            <input id="ai_price" type="number" placeholder="0" class="w-full px-6 py-4 bg-violet-50 text-violet-600 border-none rounded-[24px] font-black text-sm outline-none focus:ring-4 focus:ring-violet-500/10">
                        </div>
                    </div>

                    <div class="flex gap-4 pt-6">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors">Abort</button>
                        <button id="ai_save_pos" class="flex-2 py-5 bg-violet-600 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-violet-200 active:scale-95 transition-all">Save Item</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        
        document.getElementById('ai_save_pos').onclick = async () => {
             const name = document.getElementById('ai_name').value.trim();
             const price = parseFloat(document.getElementById('ai_price').value || 0);
             if(!name || price <= 0) {
                 window.erpAlert("Please enter a valid product name and selling price.", "Incomplete Data", "alert-triangle");
                 return;
             }
             
             const btn = document.getElementById('ai_save_pos');
             btn.innerHTML = `<i class="w-4 h-4 animate-spin border-2 border-white/20 border-t-white rounded-full mx-auto"></i>`;
             btn.disabled = true;

             const sku = "LL" + (window.erpState.items.length + 1001).toString().padStart(5, "0");
             
             try {
                 await window.FB.collection('items').add({
                     name,
                     category: document.getElementById('ai_category').value || 'Uncategorized',
                     supplier: '',
                     soldBy: 'pcs',
                     stock: parseFloat(document.getElementById('ai_stock').value || 0),
                     sellingPrice: price,
                     costPrice: parseFloat(document.getElementById('ai_cost').value || 0),
                     sku, 
                     barcode: sku,
                     timestamp: Date.now()
                 });
                 modal.remove();
                 window.renderApp();
             } catch (e) {
                 console.error(e);
                 alert("Error saving item.");
                 btn.disabled = false;
                 btn.innerText = "Save Item";
             }
        };
    };

    window.updateClientField = async (id, field, val) => {
        try {
            await window.FB.root('clients').doc(id).update({ [field]: val });
        } catch (e) {
            console.error("Failed to update client field:", e);
        }
    };

    window.exportAreaReport = function (type) {
        if (typeof XLSX === 'undefined') return alert("Excel Library not loaded yet.");
        
        let data = [];
        const filter = window.erpState.dashboardFilter || 'all';
        const now = new Date();
        let start = 0;

        if (filter === 'today') start = new Date().setHours(0,0,0,0);
        else if (filter === 'weekly') start = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        else if (filter === 'monthly') start = now.getTime() - (30 * 24 * 60 * 60 * 1000);

        const wb = XLSX.utils.book_new();

        if (type === 'sales' || type === 'master') {
            const raw = (window.erpState.sales || []).filter(s => s.date >= start);
            data = raw.map(s => ({
                Date: new Date(s.date).toLocaleDateString(),
                BillNo: s.billNo,
                Customer: s.customerName,
                Phone: s.customerPhone,
                Total: s.total,
                Paid: s.advancePaid,
                Due: s.balanceDue,
                Method: s.paymentMode || s.paymentMethod
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Sales");
            }
        }

        if (type === 'expenses' || type === 'master') {
            const raw = (window.erpState.expenses || []).filter(e => e.date >= start);
            data = raw.map(e => ({
                Date: new Date(e.date).toLocaleDateString(),
                Category: e.category,
                Amount: e.amount,
                Note: e.notes || e.note,
                BillRef: e.billNo || ''
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Expenses");
            }
        }

        if (type === 'dues' || type === 'master') {
            const raw = (window.erpState.sales || []).filter(s => s.balanceDue > 0);
            data = raw.map(s => ({
                BillNo: s.billNo,
                Customer: s.customerName,
                Phone: s.customerPhone,
                Total: s.total,
                Paid: s.advancePaid,
                Due: s.balanceDue
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Pending Dues");
            }
        }

        if (type === 'inventory' || type === 'master') {
            data = (window.erpState.items || []).map(i => ({
                SKU: i.sku,
                Name: i.name,
                Category: i.category,
                Cost: i.costPrice,
                Price: i.sellingPrice,
                Stock: i.stock
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Inventory");
            }
        }

        if (type === 'clients') {
            data = (window.erpState.clients || []).map(c => ({
                Name: c.name,
                Phone: c.phone,
                Registered: new Date(c.createdAt || Date.now()).toLocaleDateString()
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Clients");
        }

        XLSX.writeFile(wb, `Lavish_Lavender_${type}_Report_${filter}.xlsx`);
    };

    window.openDyeModal = (it) => {
        var modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-sm sm:rounded-[40px] rounded-t-[40px] p-8 shadow-2xl animate-slide-up sm:animate-pop-in relative my-auto max-h-[90vh] overflow-y-auto">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                <button onclick="this.closest('.fixed').remove()" class="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex items-center gap-3 mb-1">
                    <div class="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center">
                        <i data-lucide="droplets" class="w-6 h-6"></i>
                    </div>
                    <h2 class="font-black text-lg text-slate-800">${it.name}</h2>
                </div>
                <p class="text-[10px] text-slate-400 font-black mb-6 uppercase tracking-[0.2em] ml-1">Dye Process Automation</p>
                
                <div class="space-y-4 mb-8">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Quantity</label>
                        <input id="dye_qty" type="number" value="1" step="0.01" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-slate-800 outline-none focus:border-violet-500 transition-all">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Selling (Cart)</label>
                            <input id="dye_sell" type="number" placeholder="0.00" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-violet-600 outline-none focus:border-violet-500 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Cost (Expense)</label>
                            <input id="dye_cost" type="number" placeholder="0.00" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-rose-500 outline-none focus:border-violet-500 transition-all">
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <button id="dye_manual" class="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Do Manually</button>
                    <button id="dye_ok" class="py-4 bg-violet-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-violet-100 hover:bg-violet-700 transition-all active:scale-95">OK</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        document.getElementById('dye_sell').focus();
        document.getElementById('dye_manual').onclick = () => { modal.remove(); window.addCart(it.sku, true); };
        
        document.getElementById('dye_ok').onclick = async () => {
            const qty = parseFloat(document.getElementById('dye_qty').value || 1);
            const sell = parseFloat(document.getElementById('dye_sell').value || 0);
            const cost = parseFloat(document.getElementById('dye_cost').value || 0);
            if (sell <= 0) return alert("Selling price required");
            if (qty <= 0) return alert("Valid quantity required");

            const btn = document.getElementById('dye_ok');
            btn.innerText = "SAVING..."; btn.disabled = true;

            const existing = window.erpState.cart.find(x => x.sku === it.sku && x.price === sell);
            if (existing) {
                existing.qty += qty;
            } else {
                window.erpState.cart.push({ sku: it.sku, id: it.id, name: it.name, price: sell, cost: cost, qty: qty });
            }

            if (cost > 0) {
                try {
                    await window.FB.collection('expenses').add({
                        category: "Dye Charge",
                        amount: cost * qty,
                        notes: `Dyeing automation for: ${it.name} (${qty} units)`,
                        date: Date.now(),
                        requireBill: false
                    });
                } catch(e) { console.error("Expense error:", e); }
            }
            modal.remove();
            window.renderApp();
        };
    };

    window.openStitchingModal = async (it) => {
        var modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const today = new Date();
        const delivery = new Date(today);
        delivery.setDate(today.getDate() + 10);
        const deliveryStr = delivery.toISOString().split('T')[0];

        modal.innerHTML = `
            <div class="bg-white rounded-t-[40px] sm:rounded-[40px] p-8 w-full sm:max-w-sm animate-slide-up sm:animate-pop-in shadow-2xl my-auto relative max-h-[90vh] overflow-y-auto">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                <button onclick="this.closest('.fixed').remove()" class="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex items-center gap-3 mb-1">
                    <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                        <i data-lucide="scissors" class="w-6 h-6"></i>
                    </div>
                    <h2 class="font-black text-lg text-slate-800 uppercase tracking-tight">${it.name}</h2>
                </div>
                <p class="text-[10px] text-slate-400 font-black mb-6 uppercase tracking-[0.2em] ml-1">Stitching Terminal Update</p>
                
                <div class="space-y-4 mb-6">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Tailoring Bill No</label>
                        <div class="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl overflow-hidden focus-within:border-indigo-500 transition-all">
                            <span class="px-5 py-4 font-black text-lg text-slate-400 bg-slate-100 border-r-2 border-slate-100">B-</span>
                            <input id="stitch_bill_num" type="number" placeholder="..." class="flex-1 px-4 py-4 bg-transparent font-black text-lg text-slate-800 outline-none">
                        </div>
                        <p id="stitch_status" class="text-[9px] font-bold mt-2 ml-1 text-slate-400 transition-all">&nbsp;</p>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Service Price</label>
                            <input id="stitch_price" type="number" value="${it.sellingPrice || 0}" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-indigo-600 outline-none focus:border-indigo-500 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Delivery Date</label>
                            <input id="stitch_date" type="date" value="${deliveryStr}" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-slate-800 outline-none focus:border-indigo-500 transition-all">
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <button id="stitch_manual" class="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Do Manually</button>
                    <button id="stitch_ok" class="py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Link Order</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        async function checkBillAvailability(val) {
            const statusEl = document.getElementById('stitch_status');
            if (!val) { statusEl.innerHTML = '&nbsp;'; return; }
            statusEl.innerText = "Checking..."; statusEl.className = "text-[9px] font-bold mt-2 ml-1 text-slate-400";
            try {
                const snap = await window.FB.root('orders').where('billNo', '==', "B-" + val).get();
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    statusEl.innerText = `Belongs to: ${data.customerName || 'Unknown'}`;
                    statusEl.className = "text-[9px] font-black mt-2 ml-1 text-amber-500 animate-pulse";
                } else {
                    statusEl.innerText = "Available: New Order will be created.";
                    statusEl.className = "text-[9px] font-black mt-2 ml-1 text-emerald-500";
                }
            } catch (e) { console.error(e); }
        }

        let debounceTimer;
        document.getElementById('stitch_bill_num').oninput = (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => checkBillAvailability(e.target.value), 500);
        };

        async function fetchLastB() {
            try {
                const orders = window.erpState.orders || [];
                const sortedOrders = [...orders].filter(o => o.createdAt).sort((a,b) => {
                    const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                    const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                    return timeB - timeA;
                });
                
                let lastNum = 100;
                if (sortedOrders.length > 0) {
                    const latestBillNo = sortedOrders[0].billNo || "";
                    const match = latestBillNo.match(/\d+/);
                    if (match) lastNum = parseInt(match[0]);
                }
                
                const cartNums = window.erpState.cart.map(c => parseInt((c.tailoringRef || '').replace(/\D/g, '') || 0)).filter(n => n > 0);
                const next = Math.max(lastNum, ...cartNums, 0) + 1;
                
                const el = document.getElementById('stitch_bill_num');
                if (el) { el.value = next; checkBillAvailability(next); }
            } catch (e) { console.error(e); }
        }
        fetchLastB();

        document.getElementById('stitch_manual').onclick = () => { modal.remove(); window.addCart(it.sku, true); };

        document.getElementById('stitch_ok').onclick = async () => {
            const num = document.getElementById('stitch_bill_num').value;
            if (!num || num === '...') return alert("Wait for Bill No");
            const billNo = "B-" + num;
            const dDate = document.getElementById('stitch_date').value;
            const sPrice = parseFloat(document.getElementById('stitch_price').value || 0);

            if (!dDate) return alert("Select Date.");
            if (sPrice <= 0) return alert("Enter valid Price.");

            const btn = document.getElementById('stitch_ok');
            btn.innerText = "LINKING..."; btn.disabled = true;

            try {
                const snap = await window.FB.root('orders').where('billNo', '==', billNo).get();
                if (!snap.empty) {
                    const existing = snap.docs[0].data();
                    if (!confirm(`Bill ${billNo} already exists for customer: ${existing.customerName}. Link?`)) {
                        btn.innerText = "Link Order"; btn.disabled = false; return;
                    }
                } else {
                    await window.FB.root('orders').add({
                        billNo, customerName: "POS Pending", phone: "", orderDate: new Date().toISOString().split('T')[0],
                        deliveryDate: dDate, status: "Order Confirmed", items: [{ name: it.name, price: sPrice, tailoring: true }],
                        totalCost: sPrice, advancePaid: 0, createdAt: window.FB.Timestamp.now(),
                        source: 'pos',
                        notesLog: [{ text: "Pre-linked via POS Terminal (Stub)", timestamp: new Date().toLocaleString() }]
                    });
                }

                let ex = window.erpState.cart.find(x => x.sku === it.sku && x.tailoringRef === billNo);
                if (ex) {
                    ex.qty += 1; ex.price = sPrice;
                } else {
                    window.erpState.cart.push({
                        sku: it.sku, id: it.id, name: it.name + " (" + billNo + ")", price: sPrice, cost: it.costPrice || 0, qty: 1,
                        tailoringRef: billNo, tailoringBillNo: billNo, deliveryDate: dDate
                    });
                }
                modal.remove();
                window.renderApp();
            } catch(e) {
                console.error(e);
                alert("Linking failed.");
                btn.innerText = "Link Order"; btn.disabled = false;
            }
        };
    };

    window.toggleHistorySort = function() {
        window.erpState.historySort = window.erpState.historySort === 'desc' ? 'asc' : 'desc';
        window.scheduleRender();
    };

    window.saveLoyaltySettings = async () => {
        const config = {
            enabled: document.getElementById('loyalty_enabled').checked,
            tiers: {
                basic: { pct: parseFloat(document.getElementById('loy_pct_basic').value || 2) / 100 },
                silver: { pct: parseFloat(document.getElementById('loy_pct_silver').value || 3) / 100 },
                gold: { pct: parseFloat(document.getElementById('loy_pct_gold').value || 5) / 100 },
                premium: { pct: parseFloat(document.getElementById('loy_pct_premium').value || 5) / 100 }
            }
        };
        window.erpState.loyalty = config;
        // Update live constants
        window.LOYALTY.TIERS.basic.pct = config.tiers.basic.pct;
        window.LOYALTY.TIERS.silver.pct = config.tiers.silver.pct;
        window.LOYALTY.TIERS.gold.pct = config.tiers.gold.pct;
        window.LOYALTY.TIERS.premium.pct = config.tiers.premium.pct;

        window.renderApp();
        try {
            await window.FB.collection('settings').doc('general').set({ loyalty: config }, { merge: true });
            window.erpAlert("Loyalty Configuration Synchronized.", "Saved", "check-circle");
        } catch(e) { console.error(e); }
    };

    window.syncLegacyLoyalty = async (e) => {
        if (!confirm("This will scan ALL historic sales and tailoring orders to recalculate loyalty points and tiers for every client. Proceed?")) return;
        
        const btn = e.target;
        const orig = btn.innerText;
        btn.innerText = "Processing Logic..."; btn.disabled = true;

        try {
            // 1. Collect all transactions
            const sales = (window.erpState.sales || []).map(s => ({ 
                phone: s.customerPhone, 
                amount: s.total || 0, 
                date: s.date || 0
            }));
            
            const orders = (window.erpState.orders || []).map(o => {
                const d = o.createdAt?.toMillis ? o.createdAt.toMillis() : (o.createdAt?.toDate ? o.createdAt.toDate().getTime() : (o.timestamp || 0));
                return {
                    phone: o.phone,
                    amount: o.totalCost || 0,
                    date: d
                };
            });

            // ISSUE #18 FIX: Sanitize phones and group by normalized number so sync is idempotent
            const allTx = [...sales, ...orders].filter(t => t.phone && window.sanitizePhone(t.phone).length >= 10);
            allTx.sort((a,b) => (a.date || 0) - (b.date || 0));

            // 2. Group by sanitized phone (prevents double-counting duplicates)
            const groups = {};
            allTx.forEach(t => {
                const key = window.sanitizePhone(t.phone);
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
            });

            const db = window.FB.db;
            const batch = db.batch();
            const clientCol = window.FB.root('clients');
            let count = 0;

            for (const phone in groups) {
                // ISSUE #18 FIX: Always reset to 0 before accumulating — makes sync safe to run multiple times
                let currentSpent = 0;
                let currentPoints = 0;
                
                groups[phone].forEach(tx => {
                    const tier = window.getLoyaltyTier(currentSpent);
                    currentPoints += window.calcPoints(tx.amount, tier);
                    currentSpent += tx.amount;
                });

                const finalTier = window.getLoyaltyTier(currentSpent);
                // ISSUE #6 FIX (also applies here): Match clients by sanitized phone
                const client = window.erpState.clients.find(c => window.sanitizePhone(c.phone) === phone);
                
                if (client) {
                    batch.update(clientCol.doc(client.id), {
                        loyaltyPoints: Math.max(0, currentPoints),
                        totalSpent: currentSpent,
                        tier: finalTier,
                        loyaltyTier: finalTier,
                        loyaltyMigrated: true,
                        phone: phone // normalize phone on sync
                    });
                    count++;
                }
            }

            await batch.commit();
            window.erpAlert(`Successfully migrated ${count} clients. Tiers and points are now up-to-date!`, "Migration Complete", "check-circle");
        } catch(err) {
            console.error(err);
            alert('Migration Error: ' + err.message);
        } finally {
            btn.innerText = orig; btn.disabled = false;
        }
    };

    window.deleteCustomer = async (id) => {
        const pin = prompt("Owner PIN required to delete client record:");
        if (pin !== (window.erpState.passwords?.owner || '')) return alert("Access Denied");
        
        if (!confirm("Are you absolutely sure? This will permanently delete the client record and their loyalty points. Transaction history will remain but as 'Walk-in' (by phone match).")) return;

        try {
            await window.FB.root('clients').doc(id).delete();
            window.erpAlert("Customer deleted successfully.", "Success", "check-circle");
            document.querySelectorAll(".fixed").forEach(m => m.remove());
            window.renderApp();
        } catch (e) {
            console.error(e);
            alert("Error deleting customer.");
        }
    };

    window.openAddClient = () => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                
                <div class="text-center mb-10 relative">
                    <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">Enroll Client</h2>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Add New Boutique Partner</p>
                </div>
                
                <div class="space-y-6 relative">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Client Name</label>
                        <input id="ac_name" type="text" placeholder="Full Name" class="w-full px-6 py-4 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 shadow-inner">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">10-Digit Phone</label>
                        <input id="ac_phone" type="tel" placeholder="Phone Number" 
                            oninput="this.value = window.sanitizePhone(this.value)"
                            class="w-full px-6 py-4 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 shadow-inner">
                    </div>
                    
                    <div class="flex gap-4 pt-6">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest">Abort</button>
                        <button id="ac_save_btn" class="flex-[2] py-5 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all active:scale-95 leading-none">Validate & Save</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('ac_name').focus();

        document.getElementById('ac_save_btn').onclick = async () => {
            const name = document.getElementById('ac_name').value.trim();
            const phone = window.sanitizePhone(document.getElementById('ac_phone').value.trim());

            if (!name || phone.length < 10) {
                return window.erpAlert("Please enter a valid Name and 10-digit Phone Number.", "Validation Failed", "alert-circle");
            }

            const existing = window.erpState.clients.find(c => window.sanitizePhone(c.phone) === phone);
            if (existing) {
                return window.erpAlert(`Client with phone ${phone} already exists as ${existing.name}.`, "Duplicate Record", "user-x");
            }

            const btn = document.getElementById('ac_save_btn');
            btn.innerHTML = `<i class="w-4 h-4 animate-spin border-2 border-white/20 border-t-white rounded-full mx-auto"></i>`;
            btn.disabled = true;

            try {
                await window.FB.root('clients').add({
                    name, phone,
                    createdAt: Date.now(),
                    loyaltyPoints: 0,
                    totalSpent: 0,
                    tier: 'basic',
                    loyaltyTier: 'basic'
                });
                modal.remove();
                window.renderApp();
            } catch (e) {
                console.error(e);
                alert("Error saving client.");
                btn.disabled = false;
                btn.innerText = "Validate & Save";
            }
        };
    };

    window.standardizeClientNumbers = async (e) => {
        if (!confirm("This will normalize all client phone numbers to 10 digits and merge any duplicates. Existing points will be added together. Proceed?")) return;
        
        const btn = e.target;
        const orig = btn.innerText;
        btn.innerText = "Normalizing Cleanups..."; btn.disabled = true;

        try {
            const db = window.FB.db;
            const batch = db.batch();
            const clientCol = window.FB.root('clients');
            
            // Map to store combined data for each sanitized phone
            const merged = {};
            const toDelete = [];

            // Group clients by sanitized phone
            window.erpState.clients.forEach(c => {
                const clean = window.sanitizePhone(c.phone);
                if (!clean) return;

                if (!merged[clean]) {
                    merged[clean] = {
                        id: c.id,
                        name: c.name,
                        points: c.loyaltyPoints || 0,
                        spent: c.totalSpent || 0,
                        notes: c.notes || "",
                        measurements: c.measurements || {}
                    };
                } else {
                    // Accumulate data into the first record found
                    merged[clean].points += (c.loyaltyPoints || 0);
                    merged[clean].spent += (c.totalSpent || 0);
                    if (c.notes) merged[clean].notes += "\n" + c.notes;
                    // Keep most populated measurements if any
                    if (Object.keys(c.measurements || {}).length > Object.keys(merged[clean].measurements || {}).length) {
                        merged[clean].measurements = c.measurements;
                    }
                    toDelete.push(c.id);
                }
            });

            // Update merged records
            for (const phone in merged) {
                const data = merged[phone];
                const tier = window.getLoyaltyTier(data.spent);
                batch.update(clientCol.doc(data.id), {
                    phone: phone,
                    loyaltyPoints: data.points,
                    totalSpent: data.spent,
                    tier: tier,
                    loyaltyTier: tier,
                    notes: data.notes.trim()
                });
            }

            // Delete duplicates
            toDelete.forEach(id => {
                batch.delete(clientCol.doc(id));
            });

            await batch.commit();
            window.erpAlert(`Cleanup complete! ${Object.keys(merged).length} unique clients, ${toDelete.length} duplicates removed.`, "CRM Cleansed", "trash-2");
        } catch (err) {
            console.error(err);
            alert("Standardization Error: " + err.message);
        } finally {
            btn.innerText = orig; btn.disabled = false;
        }
    };
})();
