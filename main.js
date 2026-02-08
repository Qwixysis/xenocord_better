import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;
let editMode = { active: false, msgId: null };

// --- ГЛОБАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ (FIX FOR ONCLICK) ---
// Мы привязываем функции к window ПЕРЕД их использованием
const initGlobals = () => {
    window.openModal = (id) => document.getElementById(id)?.classList.add('active');
    window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');
    
    window.showTab = (tabId, btn) => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        btn?.classList.add('active');
    };

    window.saveProfile = async function() {
        const user = auth.currentUser;
        if (!user) return;
        const nick = document.getElementById('nickInput')?.value.trim();
        const bio = document.getElementById('bioInput')?.value.trim();
        const ava = document.getElementById('avaInput')?.value.trim();
        try {
            await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
            alert("Данные сохранены!");
        } catch (e) { console.error("Ошибка сохранения:", e); }
    };

    window.viewProfile = async (fUid) => {
        const snap = await getDoc(doc(db, "users", fUid));
        if (snap.exists()) {
            const d = snap.data();
            alert(`Ник: ${d.nick || 'Jarvis'}\nО себе: ${d.bio || '...'}`);
        }
    };

    window.removeFromFriends = async (fUid) => {
        if(!confirm("Удалить?")) return;
        const myUid = auth.currentUser.uid;
        await updateDoc(doc(db, "users", myUid), { friends: arrayRemove(fUid) });
        await updateDoc(doc(db, "users", fUid), { friends: arrayRemove(myUid) });
    };

    window.sendFriendRequest = async () => {
        const uid = document.getElementById('friendUidInput')?.value.trim();
        if (!uid || uid === auth.currentUser.uid) return;
        try {
            await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
            alert("Запрос отправлен");
            window.closeModal('addFriendModal');
        } catch (e) { alert("UID не найден"); }
    };
    
    window.acceptFriend = async (uid) => {
        const myUid = auth.currentUser.uid;
        await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
        await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
    };

    window.deleteMessage = async (msgId) => {
        if (!currentChatUid) return;
        const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
        await deleteDoc(doc(db, "privateMessages", chatId, "messages", msgId));
    };

    window.startEdit = (msgId, oldText) => {
        editMode = { active: true, msgId: msgId };
        const input = document.getElementById('chatInput');
        if (input) {
            input.value = oldText;
            input.focus();
        }
    };
};

initGlobals();

// --- СТАТУС ПЕЧАТАНИЯ ---
let typingTimeout;
const setTypingStatus = (isTyping) => {
    if (!currentChatUid || !auth.currentUser) return;
    const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
    setDoc(typingRef, { isTyping, lastUpdate: serverTimestamp() }, { merge: true });
};

// --- ОТПРАВКА ---
const handleSend = async () => {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");

    if (editMode.active) {
        await updateDoc(doc(db, "privateMessages", chatId, "messages", editMode.msgId), { text, isEdited: true });
        editMode = { active: false, msgId: null };
    } else {
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid, text, timestamp: serverTimestamp()
        });
    }
    input.value = "";
    setTypingStatus(false);
};

// --- ЧАТ ---
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    const title = document.getElementById("chatTitle");
    if (title) title.innerText = nick;
    const box = document.getElementById("chatBox");
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        if (!box) return;
        box.innerHTML = "";
        snap.docs.forEach(docSnap => {
            const d = docSnap.data();
            const isMe = d.senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : ''}`;
            const time = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "..";
            div.innerHTML = `
                ${isMe ? `<div class="msg-actions">
                    <button onclick="window.startEdit('${docSnap.id}', '${d.text.replace(/'/g, "\\'")}')">✏️</button>
                    <button onclick="window.deleteMessage('${docSnap.id}')">❌</button>
                </div>` : ''}
                <div class="msg-content">${d.text}</div>
                <div class="msg-footer">${d.isEdited ? '(ред.) ' : ''}${time}</div>
            `;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });

    onSnapshot(doc(db, "typing", `${auth.currentUser.uid}_${fUid}`), (s) => {
        const ts = document.getElementById("typingStatus");
        if (ts) ts.innerText = (s.exists() && s.data().isTyping) ? "печатает..." : "";
    });
};

// --- АВТОРИЗАЦИЯ И СПИСКИ ---
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid") && (document.getElementById("userUid").innerText = user.uid);

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        
        const nickEl = document.getElementById("userNick");
        if (nickEl) nickEl.innerText = d.nick || "Jarvis";

        // Поля в модалке
        ['nickInput', 'bioInput', 'avaInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = d[id.replace('Input', '')] || "";
        });

        // Список друзей
        const fList = document.getElementById("friendsList");
        if (fList) {
            fList.innerHTML = "";
            (d.friends || []).forEach(async uid => {
                const fSnap = await getDoc(doc(db, "users", uid));
                const li = document.createElement("li");
                li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span>
                    <div class="friend-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); window.viewProfile('${uid}')">📋</button>
                        <button class="action-btn del" onclick="event.stopPropagation(); window.removeFromFriends('${uid}')">✕</button>
                    </div>`;
                li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
                fList.appendChild(li);
            });
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    if (input) {
        input.addEventListener('input', () => {
            setTypingStatus(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => setTypingStatus(false), 2000);
        });
        input.onkeydown = (e) => e.key === 'Enter' && handleSend();
    }
    document.getElementById('sendMsgBtn') && (document.getElementById('sendMsgBtn').onclick = handleSend);
    document.getElementById('logoutBtn') && (document.getElementById('logoutBtn').onclick = () => signOut(auth));
});
