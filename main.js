import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;
let unsubscribeTyping = null;
let typingTimeout = null;
let shownMsgIds = new Set();

// ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ (window)
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

// Проверка авторизации
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const uidEl = document.getElementById("userUid");
    if (uidEl) uidEl.innerText = user.uid;
    
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            const nickEl = document.getElementById("userNick");
            if (nickEl) nickEl.innerText = data.nick || "Jarvis";
            renderFriends(data);
            renderPending(data);
        }
    });
});

async function updateTyping(isTyping) {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await setDoc(doc(db, "typing", chatId), { [auth.currentUser.uid]: isTyping }, { merge: true });
}

async function sendMsg() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim() || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
    updateTyping(false);
}

// Рендер сообщений
async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    shownMsgIds.clear();
    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";
    document.getElementById("chatTitle").innerText = nick;

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        if (!box) return;
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });

        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const d = change.doc;
                if (!shownMsgIds.has(d.id)) {
                    const isMe = d.data().senderUid === auth.currentUser.uid;
                    const div = document.createElement("div");
                    div.id = d.id;
                    div.className = `msg ${isMe ? 'my' : ''} new-msg`;
                    div.innerHTML = `<span>${d.data().text}</span>${isMe ? `<button class="del-msg-btn">✕</button>` : ''}`;
                    if (isMe) {
                        const btn = div.querySelector('.del-msg-btn');
                        btn.onclick = async () => {
                            if(confirm("Удалить?")) await deleteDoc(doc(db, "privateMessages", chatId, "messages", d.id));
                        };
                    }
                    box.appendChild(div);
                    shownMsgIds.add(d.id);
                }
            }
        });
        box.scrollTop = box.scrollHeight;
    });

    if (unsubscribeTyping) unsubscribeTyping();
    unsubscribeTyping = onSnapshot(doc(db, "typing", chatId), (snap) => {
        const data = snap.data();
        const indicator = document.getElementById("typingIndicator");
        if (indicator) indicator.innerText = (data && data[fUid]) ? `${nick} печатает...` : "";
    });
}

// ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ (с проверкой на null)
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    input?.addEventListener('input', () => {
        updateTyping(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => updateTyping(false), 2000);
    });

    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.onclick = sendMsg;

    const saveProfBtn = document.getElementById('saveProfileBtn');
    if (saveProfBtn) saveProfBtn.onclick = async () => {
        const nick = document.getElementById('editNickInput')?.value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            window.closeModal('profileModal');
        }
    };

    const confirmFriendBtn = document.getElementById('confirmSendRequest');
    if (confirmFriendBtn) confirmFriendBtn.onclick = async () => {
        const uid = document.getElementById('friendUidInput')?.value.trim();
        if (uid) {
            await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
            alert("Запрос отправлен!");
            window.closeModal('friendModal');
        }
    };

    const copyBtn = document.getElementById('copyUidBox');
    if (copyBtn) copyBtn.onclick = () => {
        navigator.clipboard.writeText(document.getElementById('userUid').innerText);
        alert("UID скопирован!");
    };

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth);
});

// Рендер списков
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    if (!list) return;
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span><button class="del-friend-btn">✕</button>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        li.querySelector('.del-friend-btn').onclick = (e) => {
            e.stopPropagation();
            updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(fUid) });
        };
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    if (!list) return;
    list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button class="mini-ok">OK</button>`;
        li.querySelector('button').onclick = async () => {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayUnion(pUid), pending: arrayRemove(pUid) });
            await updateDoc(doc(db, "users", pUid), { friends: arrayUnion(auth.currentUser.uid) });
        };
        list.appendChild(li);
    }
}
