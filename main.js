import { auth } from "./firebase.js";
import { 
    onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
    collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- УПРАВЛЕНИЕ СЕССИЕЙ ---
window.initAuth = async (email, pass, remember) => {
    const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    // Дальше вызывай signInWithEmailAndPassword в своем auth.js
};

// --- ОСНОВНОЙ ИНТЕРФЕЙС ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.href.includes("index.html")) window.location.href = "index.html";
        return;
    }
    const uidEl = document.getElementById("userUid");
    if (uidEl) uidEl.innerText = user.uid;
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            const nickEl = document.getElementById("userNick");
            if (nickEl) nickEl.innerText = data.nick || "Юзер";
            renderFriends(data);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    
    // ОТПРАВКА ПО ENTER
    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // МОБИЛЬНОЕ МЕНЮ
    const menuBtn = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    menuBtn?.addEventListener('click', () => sidebar.classList.toggle('active'));

    // МОДАЛКИ
    const toggle = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
    
    document.getElementById('addFriendBtn')?.addEventListener('click', () => toggle('friendModal', true));
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
        toggle('profileModal', true);
    });

    document.querySelectorAll('.secondary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    document.getElementById('sendMsgBtn')?.addEventListener('click', sendMessage);
    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));
});

// --- ЧАТ И ДРУЗЬЯ (БЕЗ ИЗМЕНЕНИЙ) ---
async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    if (!fList) return;
    fList.innerHTML = "";
    (data.friends || []).forEach(async (fUid) => {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.textContent = fSnap.data()?.nick || "Друг";
        li.onclick = () => {
            openChat(fUid, fSnap.data()?.nick);
            document.getElementById('sidebar').classList.remove('active');
        };
        fList.appendChild(li);
    });
}

async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = "Чат с: " + nick;
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = snap.docs.map(d => `<div class="msg ${d.data().senderUid === auth.currentUser.uid ? 'my' : ''}">${d.data().text}</div>`).join("");
        box.scrollTop = box.scrollHeight;
    });
}

async function sendMessage() {
    const input = document.getElementById("chatInput");
    if (!input.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
}
