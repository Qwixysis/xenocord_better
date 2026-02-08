/**
 * XENOCORD CORE ENGINE
 * Author: Jarvis Assistant
 */

import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ==========================================
// 1. ГЛОБАЛЬНЫЙ МОДУЛЬ (Экспорт в Window)
// ==========================================
const UI = {
    openModal: (id) => {
        const modal = document.getElementById(id);
        modal.classList.add('active');
        modal.style.opacity = '0';
        setTimeout(() => modal.style.opacity = '1', 50);
    },
    closeModal: (id) => document.getElementById(id).classList.remove('active'),
    
    toggleSidebar: () => document.getElementById('mainSidebar').classList.toggle('mobile-active'),
    
    showTab: (tabId, btn) => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.m-nav-item').forEach(i => i.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        btn.classList.add('active');
    },

    copyUID: () => {
        const uid = document.getElementById('userUid').innerText;
        navigator.clipboard.writeText(uid).then(() => {
            alert("UID успешно скопирован в буфер обмена!");
        });
    }
};

Object.assign(window, UI);

// ==========================================
// 2. ЯДРО ПОЛЬЗОВАТЕЛЯ
// ==========================================
window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const nick = document.getElementById('nickInput').value.trim();
    const bio = document.getElementById('bioInput').value.trim();
    const ava = document.getElementById('avaInput').value.trim();

    try {
        await updateDoc(doc(db, "users", user.uid), {
            nick: nick || "Jarvis User",
            bio: bio || "",
            ava: ava || ""
        });
        UI.closeModal('settingsModal');
    } catch (e) {
        console.error("Ошибка сохранения:", e);
    }
};

window.sendFriendRequest = async () => {
    const input = document.getElementById('friendUidInput');
    const targetUid = input.value.trim();
    
    if (!targetUid || targetUid === auth.currentUser.uid) {
        alert("Некорректный UID");
        return;
    }

    try {
        await updateDoc(doc(db, "users", targetUid), {
            pending: arrayUnion(auth.currentUser.uid)
        });
        alert("Запрос отправлен!");
        input.value = "";
        UI.closeModal('addFriendModal');
    } catch (e) {
        alert("Пользователь не найден.");
    }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    try {
        await updateDoc(doc(db, "users", myUid), {
            friends: arrayUnion(uid),
            pending: arrayRemove(uid)
        });
        await updateDoc(doc(db, "users", uid), {
            friends: arrayUnion(myUid)
        });
    } catch (e) {
        console.error(e);
    }
};

// ==========================================
// 3. СИСТЕМА СООБЩЕНИЙ (Telegram Style)
// ==========================================
window.openChat = (fUid, nick) => {
    if (currentChatUid === fUid) return;
    currentChatUid = fUid;
    
    const chatBox = document.getElementById("chatBox");
    const title = document.getElementById("chatTitle");
    
    title.innerText = nick;
    chatBox.innerHTML = '<div class="loader">Синхронизация истории...</div>';
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        chatBox.innerHTML = "";
        if (snap.empty) {
            chatBox.innerHTML = `<div class="empty-state"><h3>Начните общение с ${nick}</h3></div>`;
        }
        
        snap.docs.forEach(docSnap => {
            const m = docSnap.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : 'their'}`;
            
            const time = m.timestamp ? m.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '..:..';
            
            div.innerHTML = `
                <div class="msg-text">${m.text}</div>
                <div class="msg-footer" style="font-size: 9px; opacity: 0.6; text-align: right; margin-top: 4px;">${time}</div>
            `;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
};

const sendMessage = async () => {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    
    if (!text || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    
    try {
        await addDoc(collection(db, "privateMessages", chatId, "messages"), {
            senderUid: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
        input.value = "";
    } catch (e) {
        console.error("Ошибка отправки:", e);
    }
};

// ==========================================
// 4. ИНИЦИАЛИЗАЦИЯ
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (!data) return;

        document.getElementById("userNick").innerText = data.nick || "Jarvis User";
        document.getElementById("userAvatarMain").innerText = (data.nick || "J")[0].toUpperCase();

        // Рендер списка друзей
        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (data.friends || []).forEach(async (uid) => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const fData = fSnap.data();
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="avatar-circle" style="width:32px; height:32px; font-size:12px;">${(fData?.nick || 'U')[0]}</div>
                <span>${fData?.nick || 'Пользователь'}</span>
            `;
            li.onclick = () => window.openChat(uid, fData?.nick);
            fList.appendChild(li);
        });

        // Рендер входящих заявок
        const pList = document.getElementById("pendingList");
        const pCount = document.getElementById("pendingCount");
        const pending = data.pending || [];
        pCount.innerText = pending.length;
        pList.innerHTML = "";
        pending.forEach(async (uid) => {
            const pSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.style = "padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 5px; display: flex; justify-content: space-between; align-items: center;";
            li.innerHTML = `
                <span style="font-size: 13px;">${pSnap.data()?.nick}</span>
                <button onclick="window.acceptFriend('${uid}')" style="background: var(--success); border:none; color:white; padding: 4px 8px; border-radius: 4px; cursor:pointer;">OK</button>
            `;
            pList.appendChild(li);
        });
    });
});

// Слушатели событий
document.getElementById("sendMsgBtn").addEventListener('click', sendMessage);
document.getElementById("chatInput").addEventListener('keydown', (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
document.getElementById("logoutBtn").onclick = () => signOut(auth);
