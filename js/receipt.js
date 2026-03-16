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
            
            // Search Tailoring orders (root)
            if (snap.empty) {
                snap = await window.FB.root('orders').where('billNo', 'in', queryValues).get();
            }

            if (snap.empty) {
                container.innerHTML = `<div class="error" style="text-align:center; padding:40px; color:#ef4444;">Receipt not found for bill: ${billNo}</div>`;
                return;
            }

            const o = { id: snap.docs[0].id, ...snap.docs[0].data() };
            const total = o.total || o.subtotal || o.totalCost || 0;

            container.innerHTML = `
                <div class="body" style="padding: 24px;">
                    <div class="meta" style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px dashed #eee; padding-bottom:10px;">
                        <div><p style="font-size:10px; color:#999; text-transform:uppercase;">Bill No</p><p style="font-weight:bold;">${o.billNo}</p></div>
                        <div style="text-align:right;"><p style="font-size:10px; color:#999; text-transform:uppercase;">Date</p><p style="font-weight:bold;">${fmtDate(o.date || o.createdAt)}</p></div>
                    </div>
                    <div class="customer" style="background:#f9f9f9; padding:15px; border-radius:15px; margin-bottom:20px;">
                        <p style="font-size:18px; font-weight:bold;">${o.customerName || 'Guest'}</p>
                    </div>
                    <div class="total-box" style="background:#f0ecf5; padding:20px; border-radius:20px; border:1px solid #e0d8eb;">
                        <div style="display:flex; justify-content:space-between;">
                            <span>Total</span>
                            <span style="font-size:20px; font-weight:bold; color:#6E4A8A;">${formatMoney(total)}</span>
                        </div>
                    </div>
                    <div style="text-align:center; margin-top:30px;">
                        <button onclick="window.print()" style="background:#6E4A8A; color:white; border:none; padding:12px 30px; border-radius:10px; cursor:pointer;">Print Receipt</button>
                    </div>
                </div>
            `;
        } catch (err) {
            container.innerHTML = '<div class="error">Error loading receipt.</div>';
            console.error(err);
        }
    };
})();
