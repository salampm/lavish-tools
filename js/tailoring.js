// Tailoring Module Logic
(function() {
    // Re-bind helpers for convenience
    const fmt = window.fmt || ((v) => '₹' + (v || 0).toLocaleString('en-IN'));
    const db = window.FB?.db;
    
    // Firestore Path Helpers (Unified with POS & Live database)
    const ORDERS_COL = () => window.FB.root('orders');
    const CLIENTS_COL = () => window.FB.root('clients');

    // --- VIEW RENDERER ---
    window.renderTailoringView = function(tab) {
        const orders = window.erpState.orders || [];

        switch(tab) {
            case 'tracker':     return renderTracker(orders);
            case 'pending-due': return renderPendingDue(orders);
            case 'history':     return renderHistory(orders);
            default:            return renderTracker(orders);
        }
    };

    // --- DASHBOARD VIEW ---
    function renderDashboard(orders) {
        const now = new Date();
        const active = orders.filter(o => o.status !== 'Delivered');
        const overdue = active.filter(o => o.deliveryDate && new Date(o.deliveryDate) < now);
        const urgent = active.filter(o => {
            if(!o.deliveryDate) return false;
            const diff = (new Date(o.deliveryDate) - now) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 2;
        });

        return `
        <div class="p-8 h-full overflow-y-auto custom-scrollbar">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                    <p class="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Active Queue</p>
                    <h3 class="text-2xl font-black text-slate-800">${active.length}</h3>
                </div>
                <div class="bg-rose-50 p-6 rounded-[32px] border border-rose-100 shadow-sm">
                    <p class="text-rose-400 text-[9px] font-black uppercase tracking-widest mb-1">Overdue</p>
                    <h3 class="text-2xl font-black text-rose-600">${overdue.length}</h3>
                </div>
                <div class="bg-amber-50 p-6 rounded-[32px] border border-amber-100 shadow-sm">
                    <p class="text-amber-500 text-[9px] font-black uppercase tracking-widest mb-1">Urgent (48h)</p>
                    <h3 class="text-2xl font-black text-amber-600">${urgent.length}</h3>
                </div>
                <div class="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 shadow-sm">
                    <p class="text-emerald-500 text-[9px] font-black uppercase tracking-widest mb-1">Ready for Pickup</p>
                    <h3 class="text-2xl font-black text-emerald-600">${active.filter(o => o.status === 'Ready').length}</h3>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <section>
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Critical Orders</h3>
                    <div class="space-y-3">
                        ${overdue.map(o => renderOrderStrip(o, 'rose')).join('')}
                        ${urgent.map(o => renderOrderStrip(o, 'amber')).join('')}
                        ${(overdue.length + urgent.length === 0) ? `<p class="py-10 text-center text-slate-300 italic text-xs font-bold">No critical items</p>` : ''}
                    </div>
                </section>
                <section>
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Recent Activity</h3>
                    <div class="bg-white rounded-[32px] border border-slate-100 p-6">
                        <!-- Activity Feed Placeholder -->
                        <p class="text-center text-slate-300 italic text-xs py-10">Syncing recent events...</p>
                    </div>
                </section>
            </div>
        </div>
        `;
    }

    function renderOrderStrip(o, color) {
        const bal = (o.totalCost || 0) - (o.advancePaid || 0);
        return `
        <div onclick="window.openOrderDetails('${o.id}')" class="bg-white p-4 rounded-2xl border-l-4 border-${color}-500 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition-all">
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <h4 class="font-black text-slate-800 text-sm truncate uppercase">${o.customerName}</h4>
                    <span class="text-[9px] font-black text-violet-400 font-mono">${o.billNo}</span>
                </div>
                <p class="text-[10px] font-bold text-slate-400 mt-0.5">Due: ${window.fmtDate(o.deliveryDate)}</p>
            </div>
            <div class="text-right">
                <p class="text-[10px] font-black ${bal > 0 ? 'text-rose-500' : 'text-emerald-500'} uppercase">${bal > 0 ? '₹'+bal+' Due' : 'Paid'}</p>
                <p class="text-[9px] font-black text-slate-400 uppercase mt-1 tracking-widest">${o.status}</p>
            </div>
        </div>
        `;
    }

    // --- TRACKER VIEW ---
    function renderTracker(orders) {
        const active = orders.filter(o => o.status !== 'Delivered').sort((a,b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''));
        return `
        <div class="p-8 h-full flex flex-col overflow-hidden">
            <div class="mb-6 flex gap-4">
                <div class="relative flex-1">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"></i>
                    <input type="text" id="tracker-search" placeholder="Search by name or bill..." class="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold" oninput="window.filterTracker(this.value)">
                </div>
            </div>
            <div id="tracker-list" class="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                ${active.map(o => renderOrderCard(o)).join('') || `<p class="text-center text-slate-300 italic py-20">No active orders</p>`}
            </div>
        </div>
        `;
    }

    function renderOrderCard(o) {
        const bal = (o.totalCost || 0) - (o.advancePaid || 0);
        const statusColors = {
            'Pending': 'bg-slate-100 text-slate-600',
            'Order Confirmed': 'bg-violet-50 text-violet-600 border border-violet-100',
            'Stitching': 'bg-amber-50 text-amber-600 border border-amber-100',
            'Ready': 'bg-emerald-50 text-emerald-600 border border-emerald-100',
            'Delivered': 'bg-slate-900 text-white'
        };

        return `
        <div id="card-${o.id}" onclick="window.openOrderDetails('${o.id}')" class="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:shadow-slate-200/50 transition-all cursor-pointer relative group">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-1">
                        <span class="text-[10px] font-black text-violet-500 font-mono tracking-tighter uppercase">${o.billNo}</span>
                        <h3 class="font-black text-slate-800 text-base truncate">${o.customerName}</h3>
                    </div>
                    <div class="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span class="flex items-center gap-1.5"><i data-lucide="calendar" class="w-3 h-3"></i> ${window.fmtDate(o.deliveryDate)}</span>
                        <span class="flex items-center gap-1.5"><i data-lucide="phone" class="w-3 h-3"></i> ${o.phone}</span>
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Financial State</p>
                        ${bal > 0 ? `<p class="font-black text-rose-500 text-sm">₹${bal} Due</p>` : `<p class="font-black text-emerald-600 text-sm">Balanced</p>`}
                    </div>
                    <select onclick="event.stopPropagation()" onchange="window.updateOrderStatus('${o.id}', this.value)" class="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none ${statusColors[o.status] || statusColors['Pending']}">
                        <option value="Order Confirmed" ${o.status === 'Order Confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="Stitching" ${o.status === 'Stitching' ? 'selected' : ''}>Stitching</option>
                        <option value="Ready" ${o.status === 'Ready' ? 'selected' : ''}>Ready for Pickup</option>
                        <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    </select>
                </div>
            </div>
            ${o.items ? `
            <div class="mt-4 pt-4 border-t border-slate-50 flex gap-2 overflow-x-auto no-scrollbar">
                ${o.items.map(it => `<span class="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-bold text-slate-500 whitespace-nowrap capitalize">${it.name}</span>`).join('')}
            </div>` : ''}
        </div>
        `;
    }

    // --- PENDING DUE VIEW ---
    function renderPendingDue(orders) {
        const now = new Date();
        const dues = orders
            .filter(o => o.status !== 'Delivered')
            .map(o => {
                const bal = Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0));
                return { ...o, bal };
            })
            .filter(o => o.bal > 0)
            .sort((a, b) => b.bal - a.bal);

        const totalDue = dues.reduce((sum, o) => sum + o.bal, 0);

        const cards = dues.map(o => {
            const isOverdue = o.deliveryDate && new Date(o.deliveryDate) < now;
            const isUrgent = o.deliveryDate && !isOverdue && (new Date(o.deliveryDate) - now) < (48 * 60 * 60 * 1000);
            const badgeColor = o.status === 'Ready' ? 'bg-emerald-100 text-emerald-700' 
                             : o.status === 'Stitching' ? 'bg-blue-100 text-blue-700'
                             : 'bg-orange-100 text-orange-700';
            const borderColor = isOverdue ? 'border-l-rose-500' : isUrgent ? 'border-l-orange-400' : 'border-l-violet-300';

            return `
            <div onclick="window.openOrderDetails('${o.id}')" 
                 class="bg-white rounded-[24px] border border-slate-100 border-l-4 ${borderColor} shadow-sm p-6 flex items-center justify-between hover:shadow-lg transition-all cursor-pointer group">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center font-black text-rose-500 text-base flex-shrink-0 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                        ${o.customerName ? o.customerName[0].toUpperCase() : 'T'}
                    </div>
                    <div class="min-w-0">
                        <p class="font-black text-slate-800 text-sm uppercase leading-tight truncate">${o.customerName || 'Unknown'}</p>
                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                            <span class="text-[9px] font-black text-violet-400 font-mono">${o.billNo}</span>
                            <span class="text-slate-200">•</span>
                            <span class="text-[9px] font-bold text-slate-400">${window.fmtDate(o.deliveryDate)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${badgeColor}">${o.status === 'Order Confirmed' ? 'Confirmed' : o.status}</span>
                            ${isOverdue ? `<span class="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[8px] font-black uppercase">Overdue</span>` : ''}
                            ${isUrgent ? `<span class="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-[8px] font-black uppercase">Urgent</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="text-right flex-shrink-0 ml-4">
                    <p class="font-black text-rose-500 text-lg leading-none">${fmt(o.bal)}</p>
                    <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Balance</p>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <!-- Header -->
            <div class="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-6 border-b border-slate-200">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-4xl mx-auto">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase">Pending Collection</h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${dues.length} orders with outstanding balance</p>
                    </div>
                    <div class="bg-rose-600 px-8 py-4 rounded-[24px] text-white shadow-xl shadow-rose-100 text-right flex-shrink-0">
                        <p class="text-[9px] font-black uppercase tracking-widest opacity-70">Total Receivable</p>
                        <p class="text-2xl font-black leading-tight">${fmt(totalDue)}</p>
                    </div>
                </div>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-3">
                    ${cards || `<div class="py-32 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                        <p class="text-5xl mb-4">🎉</p>
                        <p>All balances cleared!</p>
                    </div>`}
                </div>
            </div>
        </div>`;
    }

    // --- HISTORY VIEW ---
    function renderHistory(orders) {
        const delivered = orders.filter(o => o.status === 'Delivered').sort((a,b) => {
            const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return db - da;
        });
        return `
        <div class="p-8 h-full flex flex-col overflow-hidden">
            <div class="mb-8 flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 class="text-xl font-black text-slate-800 tracking-tight">Archives</h2>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Completed Tailoring Orders</p>
                </div>
                <button onclick="window.exportAll()" class="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2">
                    <i data-lucide="download" class="w-4 h-4"></i> Backup CSV
                </button>
            </div>
            <div class="flex-1 bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead class="bg-slate-50 border-b text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <tr>
                                <th class="p-6">Bill #</th>
                                <th class="p-6">Client Identity</th>
                                <th class="p-6">Garment Count</th>
                                <th class="p-6 text-right">Total Yield</th>
                                <th class="p-6 text-right pr-10">Delivered On</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${delivered.map(o => `
                                <tr onclick="window.openOrderDetails('${o.id}')" class="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                                    <td class="p-6"><span class="bg-violet-50 text-violet-600 px-3 py-1 rounded-lg font-black font-mono">${o.billNo}</span></td>
                                    <td class="p-6">
                                        <p class="font-black text-slate-800 text-sm mb-0.5">${o.customerName}</p>
                                        <p class="text-[10px] text-slate-400 font-bold">${o.phone}</p>
                                    </td>
                                    <td class="p-6 text-slate-500 font-bold">${o.items?.length || 0} Items</td>
                                    <td class="p-6 text-right font-black text-slate-800 text-sm">${fmt(o.totalCost)}</td>
                                    <td class="p-6 text-right pr-10 font-black text-emerald-500">${window.fmtDate(o.actualDeliveryDate || o.deliveryDate)}</td>
                                </tr>
                            `).join('') || `<tr><td colspan="5" class="p-20 text-center text-slate-300 italic font-bold">No archives found</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    }

    // --- REPORTS VIEW ---
    function renderReports(orders) {
        const filter = window.erpState.tailorReportFilter || 'Daily';
        let list = orders.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        if (filter === 'Daily') {
            list = list.filter(o => {
                const od = o.orderDate || (o.timestamp ? new Date(o.timestamp).toISOString().split('T')[0] : '');
                return od === todayStr;
            });
        } else if (filter === 'Weekly') {
            const start = now.getTime() - (7 * 24 * 60 * 60 * 1000);
            list = list.filter(o => (o.timestamp || 0) >= start);
        } else if (filter === 'Monthly') {
            const start = now.getTime() - (30 * 24 * 60 * 60 * 1000);
            list = list.filter(o => (o.timestamp || 0) >= start);
        }

        const totalYield = list.reduce((s, o) => s + (o.totalCost || 0), 0);
        const garmentsCount = list.reduce((s, o) => s + (o.items?.length || 0), 0);

        return `
        <div class="p-8 h-full flex flex-col overflow-hidden bg-slate-50/50">
            <div class="mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div>
                    <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-1">Tailoring Insights <span class="text-violet-600">B.I.</span></h2>
                    <p class="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Boutique Intelligence v2.0</p>
                </div>

                <div class="flex items-center gap-4">
                    <div class="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
                        ${['Daily', 'Weekly', 'Monthly'].map(f => `
                            <button onclick="window.erpState.tailorReportFilter='${f}'; window.renderApp();" 
                                class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-slate-400 hover:text-slate-900'}">${f}</button>
                        `).join('')}
                    </div>
                    <button onclick="window.exportToExcel()" class="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl flex items-center gap-3 hover:-translate-y-0.5 transition-all active:scale-95">
                        <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Export to Excel
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div class="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-colors">
                    <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-violet-50 rounded-full group-hover:scale-125 transition-transform"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Total Period Yield</p>
                    <h3 class="text-3xl font-black text-slate-800 tracking-tight relative z-10">${fmt(totalYield)}</h3>
                </div>
                <div class="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-colors">
                    <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-125 transition-transform"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Garments Processed</p>
                    <h3 class="text-3xl font-black text-slate-800 tracking-tight relative z-10">${garmentsCount} Units</h3>
                </div>
                <div class="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-colors">
                    <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-50 rounded-full group-hover:scale-125 transition-transform"></div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Active Orders</p>
                    <h3 class="text-3xl font-black text-slate-800 tracking-tight relative z-10">${list.length} Records</h3>
                </div>
            </div>

            <div class="flex-1 bg-white rounded-[48px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div class="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                    <h4 class="text-[10px] font-black text-slate-900 uppercase tracking-widest">Transaction Log</h4>
                    <span class="text-[9px] font-black text-violet-500 uppercase tracking-widest">${filter} View</span>
                </div>
                <div class="overflow-x-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50">
                                <th class="p-8">Bill #</th>
                                <th class="p-8">Partner Identity</th>
                                <th class="p-8">Load</th>
                                <th class="p-8 text-right pr-12">Value Produced</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${list.map(o => `
                                <tr class="hover:bg-slate-50/50 transition-colors group" onclick="window.openOrderDetails('${o.id}')">
                                    <td class="p-8 font-black font-mono text-violet-400 text-xs">${o.billNo}</td>
                                    <td class="p-8">
                                        <p class="font-black text-slate-800 text-sm uppercase tracking-tight">${o.customerName}</p>
                                        <p class="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">${o.phone}</p>
                                    </td>
                                    <td class="p-8">
                                        <div class="flex flex-wrap gap-2">
                                            ${o.items?.map(it => `<span class="px-2.5 py-1 bg-slate-50 rounded-lg text-[8px] font-black uppercase text-slate-500">${it.name}</span>`).join('')}
                                        </div>
                                    </td>
                                    <td class="p-8 text-right pr-12 font-black text-slate-900 text-base">${fmt(o.totalCost)}</td>
                                </tr>
                            `).join('')}
                            ${list.length === 0 ? `<tr><td colspan="4" class="p-24 text-center text-slate-300 italic font-black uppercase text-[10px] tracking-widest">No matching records found</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    }

    window.exportToExcel = () => {
        const orders = window.erpState.orders || [];
        const csv = [
            ['Bill No', 'Customer', 'Phone', 'Date', 'Total Cost', 'Advance', 'Status'],
            ...orders.map(o => [
                o.billNo,
                o.customerName,
                o.phone,
                o.orderDate || '',
                o.totalCost,
                o.advancePaid || 0,
                o.status
            ])
        ].map(r => r.join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tailoring_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // --- ORDER HANDLING ---
    let draftMeasurements = null;
    let draftImages = [];

    window.openOrderModal = function() {
        // Pre-fill bill no
        const counter = (window.erpState.counter || 2499) + 1;
        document.getElementById('form-billNo').value = "B-" + counter;
        document.getElementById('form-orderDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('items-container').innerHTML = '';
        window.addItem();
        document.getElementById('order-modal').classList.remove('hidden');
    };

    window.closeOrderModal = () => document.getElementById('order-modal').classList.add('hidden');

    window.addItem = function() {
        const c = document.getElementById('items-container');
        const div = document.createElement('div');
        div.className = 'grid grid-cols-[1fr_100px] gap-3 items-center';
        div.innerHTML = `
            <input type="text" placeholder="Garment Name (e.g. Kurti)" class="tailor-input garment-name" required>
            <input type="number" placeholder="Price ₹" class="tailor-input garment-price text-right" oninput="window.calcModalBal()" required>
        `;
        c.appendChild(div);
    };

    window.calcModalBal = function() {
        const prices = Array.from(document.querySelectorAll('.garment-price')).map(i => parseFloat(i.value) || 0);
        const total = prices.reduce((a,b) => a+b, 0);
        const adv = parseFloat(document.getElementById('advance-input').value) || 0;
        document.getElementById('modal-balance').innerText = "₹" + (total - adv);
    };

    window.handleOrderSubmit = async function(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const billNo = fd.get('billNo');
        const phone = fd.get('phone');
        const name = fd.get('customerName');
        const items = [];
        let totalCost = 0;
        
        document.querySelectorAll('#items-container > div').forEach(row => {
            const n = row.querySelector('.garment-name').value;
            const p = parseFloat(row.querySelector('.garment-price').value) || 0;
            if(n) { items.push({name: n, price: p}); totalCost += p; }
        });

        const btn = document.getElementById('order-submit-btn');
        btn.disabled = true;
        btn.innerText = "Syncing Thread...";

        try {
            const orderData = {
                billNo, phone, customerName: name, 
                orderDate: fd.get('orderDate'),
                deliveryDate: fd.get('deliveryDate'),
                description: fd.get('description'),
                items, totalCost,
                advancePaid: parseFloat(fd.get('advancePaid') || 0),
                status: 'Order Confirmed',
                measurements: draftMeasurements,
                createdAt: Date.now(),
                timestamp: Date.now()
            };

            await ORDERS_COL().add(orderData);
            
            // Sync client
            if(!window.erpState.clients.find(c => c.phone === phone)) {
                await CLIENTS_COL().add({name, phone, createdAt: Date.now()});
            }

            window.closeOrderModal();
            alert("Order Locked Successfully!");
            window.erpState.counter = (window.erpState.counter || 2499) + 1;
            draftMeasurements = null;
        } catch (e) { alert("Sync failed"); }
        btn.disabled = false;
        btn.innerText = "Save Order & Notify Client";
    };

    // --- STATUS UPDATES ---
    window.updateOrderStatus = async function(id, status) {
        if(!confirm(`Move to ${status}?`)) return;
        try {
            await ORDERS_COL().doc(id).update({ status, lastUpdated: Date.now() });
            window.renderApp();
        } catch (e) { alert("Update failed"); }
    };

    // --- UTILS ---
    window.fmtDate = (d) => {
        if(!d) return '-';
        let dt;
        try {
            if (d && typeof d === 'object' && typeof d.toDate === 'function') {
                dt = d.toDate();
            } else {
                dt = new Date(d);
            }
            if (!dt || isNaN(dt.getTime())) return '-';
            return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) {
            return '-';
        }
    };

    window.filterTracker = (q) => {
        const v = q.toLowerCase();
        document.querySelectorAll('#tracker-list > div').forEach(c => {
            c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none';
        });
    };

    window.openOrderDetails = (id) => {
        const o = window.erpState.orders.find(x => x.id === id);
        if(!o) return;
        window.selectedOrderId = id;
        const bal = (o.totalCost || 0) - (o.advancePaid || 0);

        const content = `
            <div class="space-y-8 animate-pop-in">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-[10px] font-black text-violet-500 font-mono tracking-widest block mb-1">INVOICE: ${o.billNo}</span>
                        <h2 class="text-3xl font-black text-slate-800 leading-none uppercase tracking-tighter">${o.customerName}</h2>
                        <p class="text-xs font-bold text-slate-400 mt-2">${o.phone}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        <span class="px-4 py-1.5 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-200">${o.status}</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-slate-50 p-6 rounded-[32px] border border-slate-100 flex items-center gap-4">
                        <div class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-violet-500 shadow-sm"><i data-lucide="package" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Received</p>
                            <p class="font-black text-slate-800 text-sm">${window.fmtDate(o.orderDate)}</p>
                        </div>
                    </div>
                    <div class="bg-violet-50 p-6 rounded-[32px] border border-violet-100 flex items-center gap-4">
                        <div class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-violet-600 shadow-sm"><i data-lucide="truck-delivery" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-[9px] font-black text-violet-400 uppercase tracking-widest">Delivery</p>
                            <p class="font-black text-violet-700 text-sm italic underline font-bold">${window.fmtDate(o.deliveryDate)}</p>
                        </div>
                    </div>
                </div>

                <div class="space-y-3">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Inventory</p>
                    <div class="bg-white border-2 border-slate-50 rounded-[32px] overflow-hidden">
                        ${o.items?.map(it => `
                        <div class="p-5 flex justify-between items-center border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                            <span class="font-black text-slate-700 text-sm uppercase">${it.name}</span>
                            <span class="font-bold text-slate-400">${fmt(it.price)}</span>
                        </div>`).join('')}
                    </div>
                </div>

                <div class="bg-slate-900 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                    <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                    <div class="flex justify-between items-end relative z-10">
                        <div>
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Grand Total</p>
                            <h3 class="text-4xl font-black text-white tracking-widest">${fmt(o.totalCost)}</h3>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] font-black text-rose-400 uppercase mb-1">Balance Due</p>
                            <p class="text-2xl font-black text-rose-500 tracking-tighter">${fmt(bal)}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('detail-content').innerHTML = content;
        document.getElementById('detail-modal').classList.remove('hidden');
        lucide.createIcons();
    };

    window.closeDetailModal = () => document.getElementById('detail-modal').classList.add('hidden');

    // --- CLIENT HANDLING ---
    window.filterClients = (q) => {
        const v = q.toLowerCase();
        document.querySelectorAll('#customer-grid > div').forEach(c => {
            c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none';
        });
    };

    window.openAddClient = () => {
        const phone = prompt("Enter Client Phone Number:");
        if (!phone) return;
        const name = prompt("Enter Client Full Name:");
        if (!name) return;
        
        CLIENTS_COL().add({
            name, phone, 
            createdAt: Date.now(),
            source: 'tailoring'
        }).then(() => alert("Client Profile Created."));
    };

    window.openClientProfile = (id) => {
        const c = window.erpState.clients.find(x => x.id === id);
        if (!c) return;
        alert(`Client: ${c.name}\nPhone: ${c.phone}\nJoin Date: ${new Date(c.createdAt).toLocaleDateString()}`);
    };

    window.exportAll = () => {
        const data = window.erpState.orders.map(o => ({
            Bill: o.billNo,
            Client: o.customerName,
            Phone: o.phone,
            Total: o.totalCost,
            Paid: o.advancePaid,
            Status: o.status,
            Date: o.orderDate
        }));
        const csv = [
            Object.keys(data[0]).join(','),
            ...data.map(row => Object.values(row).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lavish-tailoring-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

})();
