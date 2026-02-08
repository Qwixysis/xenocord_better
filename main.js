/**
 * Project: Xenocord Elite
 * Version: 1.0.0 (Release Candidate)
 * Lead Developer: Jarvis AI & User
 */

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

/* ============================================================
   1. ГЛОБАЛЬНЫЙ МОДУЛЬ УПРАВЛЕНИЯ ИНТЕРФЕЙСОМ
   ============================================================ */
const AppUI = {
    // Переключение боковой панели на мобилках
    toggleSidebar: () => {
        const sb = document.getElementById('mainSidebar');
        if (sb) sb.classList.toggle('mobile-active');
    },

    // Универсальный метод открытия модалок
    openModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('active');
            // Анимация появления для красоты
            modal.style.opacity = "0";
            setTimeout(() => modal.style.opacity = "1", 10);
        }
    },

    // Закрытие модалок
    closeModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
    },

    // Система вкладок в настройках
    showTab: (tabId, btnElement) => {
        const panes = document.querySelectorAll('.tab-pane');
        const items = document.querySelectorAll('.s-item');
        
        panes.forEach(p => p.classList.remove('active'));
        items.forEach(i => i.classList.remove('active'));
        
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
        if (btnElement) btnElement.classList.add('active');
    },

    // Копирование UID с уведомлением
    copyUID: () => {
        const uid = document.getElementById('userUid')?.innerText;
        if (!uid) return;
        navigator.clipboard.writeText(uid).then(() => {
            const originalText = document.querySelector('.uid-label').innerText;
            document.querySelector('.uid-label').innerText = "СКОПИРОВАНО!";
            document.querySelector('.uid-label').style.color = "var(--success)";
            setTimeout(() => {
                document.querySelector('.uid-label').innerText = originalText;
                document.querySelector('.uid-label').style.color = "";
            }, 2000);
        });
    }
};

// Прокидываем в window для HTML
Object.assign(window, AppUI);

/* ============================================================
   2. ЯДРО ПОЛЬЗОВАТЕЛЬСКИХ ДАННЫХ
   ============================================================ */
const UserCore = {
    // Сохранение изменений профиля
    saveProfile: async () => {
        const user = auth.currentUser;
        if (!user) return;

        const nick = document.getElementById('nickInput')?.value.trim();
        const bio = document.getElementById('bioInput')?.value.trim();
        const ava = document.getElementById('avaInput')?.value.trim();

        try {
            await updateDoc(doc(db, "users", user.uid), {
                nick: nick || "Jarvis User",
                bio: bio || "",
                ava: ava || ""
            });
            alert("Профиль успешно синхронизирован с облаком!");
            window.closeModal('settingsModal');
        } catch (error) {
            console.error("Critical Save Error:", error);
            alert("Ошибка сохранения. Проверьте консоль.");
        }
    },

    // Обработка запросов в друзья
    sendFriendRequest: async () => {
        const input = document.getElementById('friendUidInput');
        const targetUid = input?.value.trim();
        
        if (!targetUid || targetUid === auth.currentUser.uid) {
            alert("Некорректный UID");
            return;
        }

        try {
            const targetDoc = await getDoc(doc(db, "users", targetUid));
            if (!targetDoc.exists()) throw new Error("Юзер не найден");

            await updateDoc(doc(db, "users", targetUid), {
                pending: arrayUnion(auth.currentUser.uid)
            });
            alert("Запрос успешно отправлен!");
            input.value = "";
            window.closeModal('addFriendModal');
        } catch (e) {
            alert("Ошибка: Пользователь с таким ID не существует в базе.");
        }
    },

    // Принятие дружбы (взаимное)
    acceptFriend: async (uid) => {
        const myUid = auth.currentUser.uid;
        try {
            // Добавляем друг другу в списки и удаляем из заявок
            await updateDoc(doc(db, "users", myUid), {
                friends: arrayUnion(uid),
                pending: arrayRemove(uid)
            });
            await updateDoc(doc(db, "users", uid), {
                friends: arrayUnion(myUid)
            });
        } catch (e) {
            console.error("Accept Error:", e);
        }
    }
};

Object.assign(window, UserCore);

/* ============================================================
   3. МОДУЛЬ ЧАТА И REAL-TIME ОБМЕНА
   ============================================================ */
const ChatEngine = {
    // Открытие комнаты чата
    openChat: (fUid, nick) => {
        if (currentChatUid === fUid) return; // Уже открыт
        
        currentChatUid = fUid;
        const headerTitle = document.getElementById("chatTitle");
        const chatBox = document.getElementById("chatBox");
        
        if (headerTitle) headerTitle.innerText = nick;
        if (chatBox) chatBox.innerHTML = '<div class="loading-msg">Установка зашифрованного соединения...</div>';
        
        // Закрываем меню на мобилке при выборе чата
        document.getElementById('mainSidebar')?.classList.remove('mobile-active');

        // Генерируем ID комнаты (сортировка для уникальности)
        const chatId = [auth.currentUser.uid, fUid].sort().join("_");
        
        // Отписываемся от старых данных
        if (unsubscribeChat) unsubscribeChat();
        if (unsubscribeTyping) unsubscribeTyping();

        // Подписка на сообщения
        const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp", "asc"));
        unsubscribeChat = onSnapshot(q, (snapshot) => {
            chatBox.innerHTML = "";
            if (snapshot.empty) {
                chatBox.innerHTML = `<div class="welcome-screen">Это начало вашей истории с <b>${nick}</b></div>`;
                return;
            }

            snapshot.docs.forEach(docSnap => {
                const msgData = docSnap.data();
                const isMe = msgData.senderUid === auth.currentUser.uid;
                ChatEngine.renderMessage(docSnap.id, msgData, isMe);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        });

        // Подписка на статус печатания собеседника
        unsubscribeTyping = onSnapshot(doc(db, "typing", `${fUid}_${auth.currentUser.uid}`), (doc) => {
            const statusEl = document.getElementById("typingStatus");
            if (statusEl) {
                statusEl.innerText = (doc.exists() && doc.data().isTyping) ? "печатает..." : "";
            }
        });
    },

    // Отрисовка сообщения в DOM
    renderMessage: (id, data, isMe) => {
        const box = document.getElementById("chatBox");
        const div = document.createElement("div");
        div.className = `msg ${isMe ? 'my' : ''}`;
        
        const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '..:..';
        
        div.innerHTML = `
            <div class="msg-content">${data.text}</div>
            <div class="msg-footer">${time} ${data.isEdited ? '(ред.)' : ''}</div>
        `;
        box.appendChild(div);
    },

    // Отправка сообщения
    sendMsg: async () => {
        const input = document.getElementById("chatInput");
        const text = input?.value.trim();
        
        if (!text || !currentChatUid) return;

        const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
        try {
            await addDoc(collection(db, "privateMessages", chatId, "messages"), {
                senderUid: auth.currentUser.uid,
                text: text,
                timestamp: serverTimestamp()
            });
            input.value = "";
            ChatEngine.updateTypingStatus(false);
        } catch (e) {
            console.error("Send Error:", e);
        }
    },

    // Логика статуса "печатает"
    updateTypingStatus: (isTyping) => {
        if (!currentChatUid || !auth.currentUser) return;
        const typingRef = doc(db, "typing", `${currentChatUid}_${auth.currentUser.uid}`);
        setDoc(typingRef, { isTyping, lastUpdate: serverTimestamp() }, { merge: true });
    }
};

Object.assign(window, ChatEngine);

/* ============================================================
   4. ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ СОБЫТИЙ
   ============================================================ */
onAuthStateChanged(auth, (user) => {
    // Защита роутинга
    if (!user) {
        if (window.location.pathname.includes("app.html")) window.location.href = "index.html";
        return;
    }

    // Первичная настройка профиля
    const uidDisplay = document.getElementById("userUid");
    if (uidDisplay) uidDisplay.innerText = user.uid;

    // Глобальный слушатель данных пользователя
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.data();
        if (!data) return;

        // Обновляем UI
        document.getElementById("userNick") && (document.getElementById("userNick").innerText = data.nick || "Jarvis");
        document.getElementById("accNickDisplay") && (document.getElementById("accNickDisplay").innerText = data.nick || "Jarvis");
        
        // Заполняем инпуты в настройках
        const nInp = document.getElementById("nickInput");
        const bInp = document.getElementById("bioInput");
        if (nInp) nInp.value = data.nick || "";
        if (bInp) bInp.value = data.bio || "";

        // Обработка списка друзей
        const fList = document.getElementById("friendsList");
        if (fList) {
            fList.innerHTML = "";
            (data.friends || []).forEach(async (fUid) => {
                const fSnap = await getDoc(doc(db, "users", fUid));
                const fData = fSnap.data();
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="avatar-circle" style="width:28px; height:28px; font-size:12px">
                        ${(fData?.nick || '?')[0].toUpperCase()}
                    </div>
                    <span>${fData?.nick || 'Загрузка...'}</span>
                `;
                li.onclick = () => ChatEngine.openChat(fUid, fData?.nick);
                fList.appendChild(li);
            });
        }

        // Обработка входящих заявок
        const pList = document.getElementById("pendingList");
        const pCount = document.getElementById("pendingCount");
        if (pList) {
            const pending = data.pending || [];
            if (pCount) pCount.innerText = pending.length;
            pList.innerHTML = "";
            pending.forEach(async (pUid) => {
                const pSnap = await getDoc(doc(db, "users", pUid));
                const li = document.createElement("li");
                li.className = "pending-item";
                li.innerHTML = `
                    <span>${pSnap.data()?.nick || 'Юзер'}</span>
                    <button class="btn-primary" onclick="window.acceptFriend('${pUid}')" style="padding:4px 10px; font-size:11px">Принять</button>
                `;
                pList.appendChild(li);
            });
        }
    });
});

// Слушатели DOM после загрузки
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendMsgBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (chatInput) {
        chatInput.addEventListener('input', () => {
            ChatEngine.updateTypingStatus(true);
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => ChatEngine.updateTypingStatus(false), 3000);
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ChatEngine.sendMsg();
            }
        });
    }

    if (sendBtn) sendBtn.onclick = ChatEngine.sendMsg;
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth).then(() => window.location.href = "index.html");
});

console.log("Xenocord Engine Loaded Successfully. Have a nice flight, Jarvis.");
