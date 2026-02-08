import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА ---
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
    }
};

window.showTab = function(tabId, btn) {
    const tabs = document.querySelectorAll('.settings-tab');
    const navItems = document.querySelectorAll('.nav-item');
    
    tabs.forEach(t => t.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (btn) btn.classList.add('active');
};

// --- УПРАВЛЕНИЕ ПРОФИЛЕМ ---
window.saveProfile = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const nick = document.getElementById('nickInput').value.trim();
    const bio = document.getElementById('bioInput').value.trim();
    const ava = document.getElementById('avaInput').value.trim();

    try {
        await updateDoc(doc(db, "users", user.uid), {
            nick: nick,
            bio: bio,
            ava: ava
        });
        alert("Профиль успешно обновлен!");
    } catch (error) {
        console.error("Ошибка сохранения:", error);
        alert("Произошла ошибка при сохранении.");
    }
};

// --- СИСТЕМА ДРУЗЕЙ ---
window.sendFriendRequest = async function() {
    const input = document.getElementById('friendUidInput');
    const targetUid = input.value.trim();

    if (!targetUid) {
        alert("Введите UID пользователя");
        return;
    }

    if (targetUid === auth.currentUser.uid) {
        alert("Нельзя добавить самого себя");
        return;
    }

    try {
        const targetRef = doc(db, "users", targetUid);
        const targetSnap = await getDoc(targetRef);

        if (!targetSnap.exists()) {
            alert("Пользователь с таким UID не найден");
            return;
        }

        await updateDoc(targetRef, {
            pending: arrayUnion(auth.currentUser.uid)
        });

        alert("Запрос в друзья отправлен!");
        input.value = "";
        window.closeModal('addFriendModal');
    } catch (error) {
        console.error("Ошибка запроса:", error);
        alert("Ошибка при отправке запроса.");
    }
};

window.acceptFriend = async function(uid) {
    const myUid = auth.currentUser.uid;
    try {
        // Добавляем к себе
        await updateDoc(doc(db, "users", myUid), {
            friends: arrayUnion(uid),
            pending: arrayRemove(uid)
        });
        // Добавляем к нему
        await updateDoc(doc(db, "users", uid), {
            friends: arrayUnion(myUid)
        });
    } catch (error) {
        console.error("Ошибка принятия:", error);
    }
};

// --- РАБОТА С ЧАТОМ ---
async function sendMsg() {
    const input = document.getElementById('chatInput');
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
    } catch (error) {
        console.error("Ошибка отправки:", error);
    }
}

window.openChat = function(fUid, nick) {
    currentChatUid = fUid;
    const titleEl = document.getElementById("chatTitle");
    if (titleEl) titleEl.innerText = nick;

    const box = document.getElementById("chatBox");
    if (box) box.innerHTML = "";

    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();

    const q = query(
        collection(db, "privateMessages", chatId, "messages"), 
        orderBy("timestamp")
    );

    unsubscribeChat = onSnapshot(q, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                const isMe = data.senderUid === auth.currentUser.uid;
                
                const msgDiv = document.createElement("div");
                msgDiv.className = `msg ${isMe ? 'my' : ''}`;
                
                let timeStr = "..";
                if (data.timestamp) {
                    timeStr = data.timestamp.toDate().toLocaleTimeString([], {
                        hour: '2-digit', 
                        minute: '2-digit'
                    });
                }

                msgDiv.innerHTML = `
                    <div class="msg-content">${data.text}</div>
                    <div class="msg-footer">${timeStr}</div>
                `;
                
                if (box) {
                    box.appendChild(msgDiv);
                    box.scrollTop = box.scrollHeight;
                }
            }
        });
    });
};

// --- РЕНДЕРИНГ СПИСКОВ ---
async function renderFriends(data) {
    const list = document.getElementById("friendsList");
    if (!list) return;
    list.innerHTML = "";

    const friends = data.friends || [];
    for (const fUid of friends) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        if (fSnap.exists()) {
            const fData = fSnap.data();
            const li = document.createElement("li");
            li.innerHTML = `<span>${fData.nick || 'Пользователь'}</span>`;
            li.onclick = () => window.openChat(fUid, fData.nick || 'Пользователь');
            list.appendChild(li);
        }
    }
}

async function renderPending(data) {
    const list = document.getElementById("pendingList");
    if (!list) return;
    list.innerHTML = "";

    const pending = data.pending || [];
    for (const pUid of pending) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        if (pSnap.exists()) {
            const pData = pSnap.data();
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${pData.nick || 'Запрос'}</span>
                <button onclick="event.stopPropagation(); window.acceptFriend('${pUid}')" class="btn-primary" style="padding: 2px 8px; font-size: 11px;">ПРИНЯТЬ</button>
            `;
            list.appendChild(li);
        }
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const uidEl = document.getElementById("userUid");
    if (uidEl) uidEl.innerText = user.uid;

    // Слушаем данные своего профиля
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (data) {
            const nickEl = document.getElementById("userNick");
            if (nickEl) nickEl.innerText = data.nick || "Jarvis";
            
            // Заполняем инпуты в настройках
            const nInp = document.getElementById('nickInput');
            const bInp = document.getElementById('bioInput');
            const aInp = document.getElementById('avaInput');
            if (nInp) nInp.value = data.nick || "";
            if (bInp) bInp.value = data.bio || "";
            if (aInp) aInp.value = data.ava || "";

            renderFriends(data);
            renderPending(data);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn) sendBtn.onclick = sendMsg;

    const chatInp = document.getElementById('chatInput');
    if (chatInp) {
        chatInp.onkeydown = (e) => {
            if (e.key === 'Enter') sendMsg();
        };
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth);
    }
});
