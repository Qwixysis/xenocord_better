import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

console.log("Xenocord: Модуль загружен");

// Функция инициализации кнопок
function initButtons() {
    console.log("Xenocord: Привязка кнопок...");
    
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

    const addBtn = document.getElementById("addFriendBtn");
    if (addBtn) addBtn.onclick = () => {
        document.getElementById("friendModal").style.display = "block";
    };

    const confirmBtn = document.getElementById("confirmSendRequest");
    if (confirmBtn) confirmBtn.onclick = sendRequest;

    const sendMsgBtn = document.getElementById("sendMsgBtn");
    if (sendMsgBtn) sendMsgBtn.onclick = sendMessage;
}

// Отправка запроса в друзья
async function sendRequest() {
    const input = document.getElementById("friendUidInput");
    const fUid = input.value.trim();
    if (!fUid || fUid === auth.currentUser.uid) return alert("Неверный UID");

    try {
        const friendRef = doc(db, "users", fUid);
        await updateDoc(friendRef, { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        document.getElementById("friendModal").style.display = "none";
        input.value = "";
    } catch (e) {
        alert("Пользователь не найден");
    }
}

// Отслеживание входа
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log("Xenocord: Пользователь не авторизован");
        if (!window.location.pathname.includes("index.html")) {
            window.location.href = "index.html";
        }
    } else {
        console.log("Xenocord: Авторизован как", user.uid);
        initButtons(); // Привязываем кнопки только когда зашли
        
        const nickEl = document.getElementById("userNick");
        if (nickEl) nickEl.innerText = user.email.split('@')[0];
        
        const uidEl = document.getElementById("userUid");
        if (uidEl) uidEl.innerText = user.uid;

        loadData(user.uid);
    }
});

// Загрузка списков
function loadData(myUid) {
    onSnapshot(doc(db, "users", myUid), async (snap) => {
        const data = snap.data();
        if (!data) return;

        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        for (const fUid of (data.friends || [])) {
            const fSnap = await getDoc(doc(db, "users", fUid));
            const li = document.createElement("li");
            li.className = "friend-item";
            li.innerHTML = `<span>${fSnap.data()?.nick || 'Юзер'}</span>`;
            li.onclick = () => openChat(fUid, fSnap.data()?.nick);
            fList.appendChild(li);
        }

        const pList = document.getElementById("pendingList");
        pList.innerHTML = "";
        for (const pUid of (data.pending || [])) {
            const pSnap = await getDoc(doc(db, "users", pUid));
            const li = document.createElement("li");
            li.innerHTML = `${pSnap.data()?.nick} <button class="accept-btn">OK</button>`;
            li.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                acceptFriend(pUid);
            };
            pList.appendChild(li);
        }
    });
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}

async function openChat(fUid, nick) {
    currentChatUid = fUid;
    document.getElementById("chatHeader").innerText = "Чат: " + nick;
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");

    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = snap.docs.map(d => `
            <div class="msg ${d.data().senderUid === auth.currentUser.uid ? 'my' : ''}">
                <div class="text">${d.data().text}</div>
            </div>
        `).join("");
        box.scrollTop = box.scrollHeight;
    });
}

async function sendMessage() {
    const input = document.getElementById("chatInput");
    if (!input.value || !currentChatUid) return;

    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
}
