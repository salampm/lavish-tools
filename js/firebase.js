// Firebase Configuration & Initialization (Local File Compatible)
(function() {
    const config = {
        apiKey: "AIzaSyAvBgfCOf3-apZUTWrcwhe-ZY3XEhxOXcw",
        authDomain: "tailoring-app-d9855.firebaseapp.com",
        projectId: "tailoring-app-d9855",
        storageBucket: "tailoring-app-d9855.firebasestorage.app",
        messagingSenderId: "621310602868",
        appId: "1:621310602868:web:7f7d07614a542181d1ab21"
    };

    // Load Firebase Compat scripts dynamically for maximum compatibility
    const scripts = [
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js",
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js"
    ];

    let loadedCount = 0;
    scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedCount++;
            if (loadedCount === scripts.length) {
                initFirebase();
            }
        };
        document.head.appendChild(script);
    });

    function initFirebase() {
        firebase.initializeApp(config);
        const db = firebase.firestore();
        
        // Enable Offline Persistence
        // ISSUE #12 FIX: Show visible warning when persistence fails, not silent swallow
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn("Persistence failed:", err.code);
            if (err.code === 'failed-precondition') {
                // Multiple tabs open
                const banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#1c1917;padding:8px 16px;text-align:center;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;';
                banner.innerHTML = '⚠ Offline mode disabled — multiple tabs open. Close other tabs and reload for offline support.';
                document.body.prepend(banner);
            } else if (err.code === 'unimplemented') {
                console.warn('Browser does not support offline persistence.');
            }
        });

        const APP_ID = 'lavish-lavender-erp';
        
        window.FB = {
            db: db,
            auth: firebase.auth(),
            collection: (n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n),
            root: (n) => db.collection(n),
            Timestamp: firebase.firestore.Timestamp
        };

        window.dispatchEvent(new Event('firebase-ready'));
        console.log("Firebase initialized successfully (Compat Mode)");
    }
})();
