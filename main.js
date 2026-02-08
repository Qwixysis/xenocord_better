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

// Антиспам переменные
let messageCount = 0;
let lastResetTime = Date.now();

// Глобальные функции для окон
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
};

// Просмотр профиля друга
window.viewFriendProfile = async (fUid) => {
    const snap = await getDoc(doc(db, "users", fUid));
    if (snap.exists()) {
        const data = snap.data();
        document.getElementById("profileInfo").innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:40px;">👤</div>
                <h2 style="margin:10px 0;">${data.nick || "Без ника"}</h2>
                <p style="color:#949ba4; font-size:12px;">UID: ${fUid}</p>
                <p style="margin-top:10px; color:#dbdee1;">Статус: В сети (тест)</p>
            </div>
        `;
        window.openModal('viewProfileModal');
    }
};

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
    if (!currentChatUid || !auth.currentUser) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await setDoc(doc(db, "typing", chatId), { [auth.currentUser.uid]: isTyping }, { merge: true });
}

async function sendMsg() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim() || !currentChatUid) return;

    // ЗАЩИТА ОТ СПАМА (5 сообщений за 3 секунды)
    const now = Date.now();
    if (now - lastResetTime > 3000) {
        messageCount = 0;
        lastResetTime = now;
    }
    messageCount++;
    if (messageCount > 5) {
        alert("Слишком быстро! Подождите пару секунд.");
        return;
    }

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp(),
        edited: false
    });
    input.value = "";
    updateTyping(false);
}

window.editMsg = async (msgId, oldText) => {
    const newText = prompt("Редактировать сообщение:", oldText);
    if (newText && newText !== oldText) {
        const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
        await updateDoc(doc(db, "privateMessages", chatId, "messages", msgId), {
            text: newText,
            edited: true
        });
    }
};

async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    shownMsgIds.clear();
    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";
    document.getElementById("chatTitle").innerText = nick;
    document.getElementById("chatTitle").onclick = () => window.viewFriendProfile(fUid);

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        if (!box) return;
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });

        snap.docChanges().forEach(change => {
            const d = change.doc;
            const data = d.data();
            const isMe = data.senderUid === auth.currentUser.uid;
            
            // Форматирование времени
            const date = data.timestamp ? data.timestamp.toDate() : new Date();
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (change.type === "added") {
                const div = document.createElement("div");
                div.id = d.id;
                div.className = `msg ${isMe ? 'my' : ''} new-msg`;
                div.innerHTML = `
                    <div class="msg-content">${data.text}</div>
                    <div class="msg-footer">
                        ${timeStr} ${data.edited ? '(изм.)' : ''}
                    </div>
                    <div class="msg-actions">
                        ${isMe ? `<button onclick="window.editMsg('${d.id}', '${data.text.replace(/'/g, "\\'")}')">✎</button>` : ''}
                        <button class="del-btn">✕</button>
                    </div>
                `;
                div.querySelector('.del-btn').onclick = async () => {
                    if(confirm("Удалить?")) await deleteDoc(doc(db, "privateMessages", chatId, "messages", d.id));
                };
                box.appendChild(div);
                shownMsgIds.add(d.id);
            } else if (change.type === "modified") {
                const el = document.getElementById(d.id);
                if (el) {
                    el.querySelector(".msg-content").innerText = data.text;
                    el.querySelector(".msg-footer").innerHTML = `${timeStr} (изм.)`;
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

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    input?.addEventListener('input', () => {
        updateTyping(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => updateTyping(false), 2000);
    });
    // ОТПРАВКА ПО ENTER
    input?.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendMsg(); 
        } 
    });

    document.getElementById('sendMsgBtn').onclick = sendMsg;
    document.getElementById('saveProfileBtn').onclick = async () => {
        const nick = document.getElementById('editNickInput')?.value.trim();
        if (nick) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { nick });
            window.closeModal('profileModal');
        }
    };
    document.getElementById('confirmSendRequest').onclick = async () => {
        const uid = document.getElementById('friendUidInput')?.value.trim();
        if (uid) {
            await updateDoc(doc(db, "users", uid), { pending: arrayUnion(auth.currentUser.uid) });
            alert("Запрос отправлен!");
            window.closeModal('friendModal');
        }
    };
    document.getElementById('copyUidBox').onclick = () => {
        navigator.clipboard.writeText(document.getElementById('userUid').innerText);
        alert("UID скопирован!");
    };
    document.getElementById('logoutBtn').onclick = () => signOut(auth);
});

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
            if(confirm("Удалить друга?")) updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(fUid) });
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
