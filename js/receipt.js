// Receipt Logic
(function() {
    const fmtDate = (d) => {
        if (!d) return '-';
        const dt = new Date(d);
        return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatMoney = (n) => '₹' + (n || 0).toLocaleString('en-IN');

    window.loadReceipt = async function () {
        const params = new URLSearchParams(window.location.search);
        let billNo = params.get('bill');
        if (billNo) billNo = billNo.trim();

        const container = document.getElementById('receipt-body');
        if (!billNo) {
            container.innerHTML = '<div class="error" style="text-align:center; padding:40px; color:#ef4444;">No bill number provided.</div>';
            return;
        }

        // Wait for Firebase
        if (!window.FB) {
            window.addEventListener('firebase-ready', () => window.loadReceipt());
            return;
        }

        try {
            const queryValues = [billNo, '#' + billNo];
            const parsedBillNo = parseInt(billNo, 10);
            if (!isNaN(parsedBillNo) && String(parsedBillNo) === billNo) {
                queryValues.push(parsedBillNo);
            }

            // Search POS sales
            let snap = await window.FB.collection('sales').where('billNo', 'in', queryValues).get();
            let isTailoring = false;
            
            // Search Tailoring orders (root)
            if (snap.empty) {
                snap = await window.FB.root('orders').where('billNo', 'in', queryValues).get();
                if (!snap.empty) isTailoring = true;
            }

            if (snap.empty) {
                container.innerHTML = `<div class="error" style="text-align:center; padding:40px; color:#ef4444;">Receipt not found for bill: ${billNo}</div>`;
                return;
            }

            const o = { id: snap.docs[0].id, ...snap.docs[0].data() };
            window.currentOrder = o;
            const total = o.total || o.subtotal || o.totalCost || 0;
            const finalTotal = isTailoring ? (o.totalCost - (o.deliveryDiscount || 0)) : total;
            const date = fmtDate(o.date || o.createdAt || o.orderDate);
            const bal = isTailoring ? (o.totalCost - (o.deliveryDiscount || 0) - (o.advancePaid || 0)) : 0;

            if (isTailoring) {
                // TAILORING RECEIPT (MATCHES tracker modal)
                let measurementHtml = '';
                if (o.measurements && Object.keys(o.measurements).length > 0) {
                    const m = o.measurements;
                    const mlist = [];
                    if (m.style) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Style</span><span class="text-xs font-black text-slate-700">${m.style}</span></div>`);
                    if (m.body_length) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Body Len</span><span class="text-xs font-black text-slate-700">${m.body_length}</span></div>`);
                    if (m.full_length) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Full Len</span><span class="text-xs font-black text-slate-700">${m.full_length}</span></div>`);
                    if (m.chest) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Chest</span><span class="text-xs font-black text-slate-700">${m.chest}</span></div>`);
                    if (m.waist) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Waist</span><span class="text-xs font-black text-slate-700">${m.waist}</span></div>`);
                    if (m.seat) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Seat</span><span class="text-xs font-black text-slate-700">${m.seat}</span></div>`);
                    if (m.shoulder) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Shoulder</span><span class="text-xs font-black text-slate-700">${m.shoulder}</span></div>`);
                    if (m.sleeve_length) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Sleeve</span><span class="text-xs font-black text-slate-700">${m.sleeve_length}</span></div>`);
                    if (m.armhole) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">Armhole</span><span class="text-xs font-black text-slate-700">${m.armhole}</span></div>`);
                    if (m.front_neck) mlist.push(`<div class="flex flex-col"><span class="text-[8px] text-slate-400 font-black uppercase tracking-widest">F. Neck</span><span class="text-xs font-black text-slate-700">${m.front_neck}</span></div>`);
                    
                    measurementHtml = `
                    <div id="measurement-display" class="hidden mt-4 bg-purple-50 p-6 rounded-[32px] border border-purple-100/50 animate-pop-in">
                        <h4 class="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-4">Specs</h4>
                        <div class="grid grid-cols-3 gap-y-4 gap-x-2">${mlist.join('')}</div>
                    </div>`;
                }

                let imageHtml = '';
                if (o.designImages && o.designImages.length > 0) {
                    imageHtml = `
                    <div class="mt-4 flex gap-2 overflow-x-auto pb-2 scroll-none">
                        ${o.designImages.map(url => `<a href="${url}" target="_blank" class="w-16 h-16 border-2 border-slate-100 rounded-2xl shrink-0 overflow-hidden"><img src="${url}" class="w-full h-full object-cover"></a>`).join('')}
                    </div>`;
                }

                container.innerHTML = `
                <div class="p-10 pb-16 relative">
                    <button onclick="window.closeReceipt()" class="absolute top-8 right-8 bg-slate-50 p-3 rounded-full text-slate-300 hover:text-slate-900 transition-all"><i data-lucide="x" class="w-5 h-5"></i></button>
                    
                    <p class="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 leading-none">${o.billNo}</p>
                    <h2 class="text-3xl font-bold text-slate-900 leading-tight mb-8" style="font-family: 'Cormorant Garamond', serif;">${o.customerName}</h2>

                    <div class="flex gap-2 mb-6">
                        <a href="tel:${o.phone}" class="flex-1 bg-slate-50 py-4.5 rounded-2xl text-[10px] font-black uppercase text-slate-500 border border-slate-100 flex items-center justify-center gap-2 transition-all hover:bg-slate-100"><i data-lucide="phone" class="w-4 h-4"></i> Call</a>
                        <a href="https://wa.me/${o.phone ? (o.phone.replace(/\D/g, '').length === 10 ? '91' + o.phone.replace(/\D/g, '') : o.phone.replace(/\D/g, '')) : ''}?text=${encodeURIComponent('Hi ' + o.customerName + ', this is Lavish Lavender regarding order ' + o.billNo)}" target="_blank" class="flex-1 bg-green-50 py-4.5 rounded-2xl text-[10px] font-black uppercase text-green-600 border border-green-100 flex items-center justify-center gap-2 transition-all hover:bg-green-100"><i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp</a>
                    </div>

                    <div class="mb-6">
                        <select onchange="window.updateStatus('${o.id}', this.value)" class="w-full text-[11px] font-black rounded-2xl px-5 py-4.5 outline-none tracking-widest appearance-none border-none ${o.status === 'Ready' ? 'bg-green-100 text-green-700' : o.status === 'Stitching' ? 'bg-blue-100 text-blue-700' : o.status === 'Delivered' ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'}">
                            <option value="Order Confirmed" ${o.status === 'Pending' || o.status === 'Order Confirmed' ? 'selected' : ''}>Order Confirmed</option>
                            <option value="Stitching" ${o.status === 'Stitching' ? 'selected' : ''}>Stitching</option>
                            <option value="Ready" ${o.status === 'Ready' ? 'selected' : ''}>Ready for Pick-up</option>
                            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        </select>
                    </div>

                    <button onclick="window.toggleMeasurements()" class="w-full bg-[#0f172a] text-white py-4.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95 mb-4">
                        <i data-lucide="ruler" class="w-4 h-4"></i> Edit / View Measurements
                    </button>

                    ${measurementHtml}
                    ${imageHtml}

                    <div class="grid grid-cols-2 gap-4 my-10">
                        <div class="bg-slate-50 p-6 rounded-[36px] border border-slate-100">
                            <span class="text-[9px] font-black text-slate-400 block mb-1.5 uppercase tracking-widest">Final Sale</span>
                            <span class="text-xl font-black text-slate-800">${formatMoney(finalTotal)}</span>
                        </div>
                        <div class="bg-slate-50 p-6 rounded-[36px] border border-slate-100">
                            <span class="text-[9px] font-black text-red-400 block mb-1.5 uppercase tracking-widest">Balance</span>
                            <span class="text-xl font-black text-red-500">${formatMoney(bal)}</span>
                        </div>
                    </div>

                    ${o.items ? `
                    <div class="mb-10 bg-slate-50 p-6 rounded-[36px] border border-slate-100">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Tailoring Items</p>
                        ${o.items.map(i => `<div class="flex justify-between py-2 border-b border-slate-200 last:border-0"><span class="text-sm font-bold text-slate-700">${i.name}</span><span class="text-sm font-black text-slate-800">${formatMoney(i.price)}</span></div>`).join('')}
                    </div>` : ''}

                    ${o.loyaltySnapshot ? `
                    <div class="mb-10 bg-violet-50 p-6 rounded-[36px] border border-violet-100 text-center">
                         <p class="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1.5 leading-none">Loyalty Program</p>
                         <p class="text-sm font-black text-violet-700">earned ${o.loyaltySnapshot.earned} | total:${o.loyaltySnapshot.total} | ${o.loyaltySnapshot.tier.toUpperCase()}</p>
                    </div>` : ''}

                    <div class="mt-8">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Archive Actions</p>
                        <button onclick="window.returnToQueue()" class="w-full bg-orange-50 text-orange-600 py-4.5 rounded-[24px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 mb-4 border border-orange-100 transition-all hover:bg-orange-100">
                            <i data-lucide="rotate-ccw" class="w-4 h-4"></i> Return to Queue for Alteration
                        </button>
                    </div>

                    <div class="mt-12">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">Log</p>
                        <div id="notes-log" class="space-y-3">
                            ${(o.notesLog || []).map(n => `<div class="bg-slate-50 p-5 rounded-3xl border border-slate-100 text-[11px] font-medium leading-relaxed mb-3"><p class="text-slate-700">${n.text}</p><p class="text-[8px] text-slate-300 font-bold uppercase mt-2">${n.timestamp}</p></div>`).join('')}
                        </div>
                    </div>
                </div>`;
            } else {
                // POS RECEIPT (RE-ADD HEADER FOR POS)
                container.innerHTML = `
                <div class="header" style="background: linear-gradient(135deg, #6E4A8A 0%, #9B6BC3 100%); padding: 32px 20px 24px; text-align: center; color: white;">
                    <div class="boutique-name" style="font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: bold;">Lavish Lavender</div>
                    <div class="boutique-tagline" style="font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; margin-top: 4px; opacity: 0.8;">Bridal Boutique</div>
                    <div class="receipt-badge" style="display: inline-block; background: rgba(255, 255, 255, 0.15); font-size: 9px; padding: 6px 18px; border-radius: 100px; margin-top: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Official Retail Bill</div>
                </div>
                <div class="p-8 pb-12">
                    <div class="flex justify-between items-start mb-8">
                        <div>
                            <p class="text-[9px] font-black text-violet-400 uppercase tracking-widest leading-none mb-1.5">${o.billNo}</p>
                            <h2 class="text-2xl font-black text-slate-900 leading-tight">${o.customerName || 'Guest Customer'}</h2>
                        </div>
                        <div class="text-right">
                             <p class="text-[10px] font-bold text-slate-400">${date}</p>
                        </div>
                    </div>

                    <div class="mb-10 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 border-b border-slate-100 pb-3">Itemized Sale</p>
                        ${(o.items || o.posItems || []).map(i => `
                            <div class="flex justify-between items-center py-3.5 border-b border-slate-50 last:border-0">
                                <div class="flex flex-col">
                                    <span class="text-[15px] font-bold text-slate-800">${i.name}</span>
                                    <span class="text-[11px] text-slate-400 font-bold italic">${i.qty || 1} x ${formatMoney(i.price)}</span>
                                </div>
                                <span class="text-[15px] font-black text-slate-900">${formatMoney((i.qty || 1) * i.price)}</span>
                            </div>
                        `).join('')}
                        <div class="mt-8 pt-6 border-t-2 border-dashed border-purple-100 flex justify-between items-center">
                             <span class="text-[10px] font-black text-purple-400 uppercase tracking-widest">Grand Total Paid</span>
                             <span class="text-4xl font-black text-purple-700">${formatMoney(finalTotal)}</span>
                        </div>
                    </div>

                    ${o.loyaltySnapshot ? `
                    <div class="mb-8 bg-violet-50 p-6 rounded-[32px] border border-violet-100 text-center">
                         <p class="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1.5 leading-none">Loyalty Program</p>
                         <p class="text-sm font-black text-violet-700">earned ${o.loyaltySnapshot.earned} | total:${o.loyaltySnapshot.total} | ${o.loyaltySnapshot.tier.toUpperCase()}</p>
                    </div>` : ''}

                    <button onclick="window.print()" class="w-full bg-[#0f172a] text-white py-5 rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                        <i data-lucide="printer" class="w-5 h-5"></i> Print Thermal Receipt
                    </button>
                    <p class="text-center text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-12 mb-4">Lavish Lavender — Thank You</p>
                </div>`;
            }

            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            container.innerHTML = '<div class="error" style="text-align:center; padding:40px; color:#ef4444;">Error loading receipt. Check connection.</div>';
            console.error(err);
        }
    };

    window.closeReceipt = () => window.location.href = 'index.html';
    
    window.toggleMeasurements = () => {
        const el = document.getElementById('measurement-display');
        if (el) el.classList.toggle('hidden');
    };

    window.updateStatus = async (id, status) => {
        try {
            await window.FB.root('orders').doc(id).update({ status });
            alert("Status updated locally to: " + status);
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert("Failed to update status.");
        }
    };

    window.returnToQueue = async () => {
        if (!window.currentOrder) return;
        const reason = prompt("Enter alteration reason:");
        if (!reason) return;
        const log = window.currentOrder.notesLog || [];
        log.push({ text: `[ALTERATION] ${reason}`, timestamp: new Date().toLocaleString() });
        try {
            await window.FB.root('orders').doc(window.currentOrder.id).update({ 
                status: 'Stitching', 
                notesLog: log 
            });
            alert("Moved back to tracker for alteration.");
            window.location.reload(); 
        } catch (err) {
            console.error(err);
            alert("Failed to update status.");
        }
    };
})();
