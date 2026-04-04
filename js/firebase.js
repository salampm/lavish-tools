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
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js",
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage-compat.js"
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

        // FB-Fallback: Define window.FB early to prevent crashes during initialization
        const APP_ID = 'lavish-lavender-erp';
        window.FB = {
            db: db,
            auth: firebase.auth(),
            storage: () => firebase.storage(),
            collection: (n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n),
            root: (n) => db.collection(n),
            Timestamp: firebase.firestore.Timestamp
        };

        // FB-Fallback: Safety timer to ensure the app renders even if connection is slow/blocked
        const readyTimer = setTimeout(() => {
            if (!window._fbReadyDispatched) {
                console.warn("Firebase sync taking too long — forcing 'firebase-ready' via local cache.");
                window.dispatchEvent(new Event('firebase-ready'));
                window._fbReadyDispatched = true;
            }
        }, 5000); 

        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn("Persistence failed:", err.code);
        });

        firebase.auth().signInAnonymously().catch(err => {
            console.error("Anonymous auth failed — Check Firebase Restrictions:", err);
            const statusText = document.getElementById('auth-status-text');
            const statusDot = document.getElementById('auth-status-dot');
            if (statusText) statusText.innerText = "Access Restricted: " + err.code;
            if (statusDot) statusDot.style.background = "#f43f5e";
            
            // Dispatch ready anyway so we can at least show cached data
            if (!window._fbReadyDispatched) {
                window.dispatchEvent(new Event('firebase-ready'));
                window._fbReadyDispatched = true;
            }
        });

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                // Update UI if login modal is present
                const statusDot = document.getElementById('auth-status-dot');
                const statusText = document.getElementById('auth-status-text');
                if(statusDot) statusDot.style.background = '#10b981';
                if(statusText) statusText.innerText = 'Cloud Synchronized';

                if (!window._fbReadyDispatched) {
                    window.dispatchEvent(new Event('firebase-ready'));
                    window._fbReadyDispatched = true;
                    clearTimeout(readyTimer);
                }
                console.log("Firebase initialized successfully (Compat Mode + Auth)");
            }
        });
    }
})();
