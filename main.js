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
let msgCount = 0;
let lastReset = Date.now();

// ОКНА
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

// ПРОФИЛЬ
window.viewProfile = async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
        const d = snap.data();
        document.getElementById("profileInfo").innerHTML = `
            <div style="padding:10px;">
                <h2 style="color:var(--accent); margin-bottom:10px;">${d.nick || 'Jarvis'}</h2>
                <div style="padding:15px; background:var(--bg-dark); border-radius:12px; font-size:13px; text-align:left;">
                    <p><b>UID:</b> ${uid}</p>
                    <p style="margin-top:5px; color:var(--text-muted)"><b>Статус:</b> В сети</p>
                </div>
            </div>
        `;
        window.openModal('viewProfileModal');
    }
};

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            document.getElementById("userNick").innerText = data.nick || "Jarvis";
            renderFriends(data);
            renderPending(data);
        }
    });
});

async function updateTyping(status) {
    if (!currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await setDoc(doc(db, "typing", chatId), { [auth.currentUser.uid]: status }, { merge: true });
}

window.editMsg = async (id, oldText) => {
    const txt = prompt("Редактировать сообщение:", oldText);
    if (txt !== null && txt.trim() !== "" && txt !== oldText) {
        const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
        await updateDoc(doc(db, "privateMessages", chatId, "messages", id), { text: txt });
    }
};

window.deleteMsg = async (id) => {
    if (confirm("Удалить?")) {
        const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
        await deleteDoc(doc(db, "privateMessages", chatId, "messages", id));
    }
};

async function sendMsg() {
    const input = document.getElementById('chatInput');
    const val = input.value.trim();
    if (!val || !currentChatUid) return;

    if (Date.now() - lastReset > 3000) { msgCount = 0; lastReset = Date.now(); }
    if (++msgCount > 5) { alert("Слишком быстро! Не спамь."); return; }

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: val,
        timestamp: serverTimestamp()
    });
    input.value = "";
    updateTyping(false);
}

async function openChat(fUid, nick) {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    const box = document.getElementById("chatBox");
    box.innerHTML = "";
    document.getElementById("chatTitle").innerText = nick;

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    
    unsubscribeChat = onSnapshot(q, (snap) => {
        const dbIds = snap.docs.map(d => d.id);
        Array.from(box.children).forEach(el => { if (!dbIds.includes(el.id)) el.remove(); });

        snap.docChanges().forEach(change => {
            const d = change.doc;
            const data = d.data();
            const isMe = data.senderUid === auth.currentUser.uid;
            let timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

            if (change.type === "added") {
                const div = document.createElement("div");
                div.id = d.id;
                div.className = `msg ${isMe ? 'my' : ''}`;
                div.innerHTML = `
                    <div class="msg-content">${data.text}</div>
                    <div class="msg-footer">${timeStr}</div>
                    <div class="msg-actions">
                        ${isMe ? `<button onclick="window.editMsg('${d.id}', '${data.text.replace(/'/g, "\\'")}')">✎</button>` : ''}
                        <button onclick="window.deleteMsg('${d.id}')">✕</button>
                    </div>
                `;
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            } 
            else if (change.type === "modified") {
                const el = document.getElementById(d.id);
                if (el) {
                    el.querySelector(".msg-content").innerText = data.text;
                }
            }
        });
    });

    if (unsubscribeTyping) unsubscribeTyping();
    unsubscribeTyping = onSnapshot(doc(db, "typing", chatId), (snap) => {
        const d = snap.data();
        document.getElementById("typingIndicator").innerText = (d && d[fUid]) ? `${nick} печатает...` : "";
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chatInput');
    input?.addEventListener('input', () => {
        updateTyping(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => updateTyping(false), 2000);
    });
    input?.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } 
    });

    document.getElementById('sendMsgBtn').onclick = sendMsg;
    document.getElementById('userNick').onclick = () => window.viewProfile(auth.currentUser.uid);
    document.getElementById('chatTitle').onclick = () => { if(currentChatUid) window.viewProfile(currentChatUid); };
    
    document.getElementById('saveProfileBtn').onclick = async () => {
        const n = document.getElementById('editNickInput').value.trim();
        if (n) { await updateDoc(doc(db, "users", auth.currentUser.uid), { nick: n }); window.closeModal('profileModal'); }
    };
    
    document.getElementById('confirmSendRequest').onclick = async () => {
        const u = document.getElementById('friendUidInput').value.trim();
        if (u) {
            try {
                await updateDoc(doc(db, "users", u), { pending: arrayUnion(auth.currentUser.uid) });
                alert("Запрос отправлен!"); window.closeModal('friendModal');
            } catch(e) { alert("UID не найден"); }
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
    list.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick || 'Друг'}</span><button class="danger" style="padding:2px 8px; font-size:10px;">✕</button>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        li.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            if(confirm("Удалить друга?")) updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayRemove(fUid) });
        };
        list.appendChild(li);
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    list.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span><button class="primary" style="padding:4px 8px; font-size:10px;">OK</button>`;
        li.querySelector('button').onclick = async () => {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { friends: arrayUnion(pUid), pending: arrayRemove(pUid) });
            await updateDoc(doc(db, "users", pUid), { friends: arrayUnion(auth.currentUser.uid) });
        };
        list.appendChild(li);
    }
}
