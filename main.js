import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// --- Инициализация интерфейса ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        document.getElementById("userUid").innerText = user.uid;
        
        // Слушаем данные профиля в реальном времени
        onSnapshot(doc(db, "users", user.uid), (snap) => {
            const data = snap.data();
            if (data) {
                document.getElementById("userNick").innerText = data.nick || "Юзер";
                renderFriends(data);
            }
        });
    }
});

// --- Функции Модальных Окон ---
window.openModal = (id) => {
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    if (id === 'profileModal') {
        document.getElementById('editNickInput').value = document.getElementById('userNick').innerText;
    }
};

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

// --- Работа с Профилем ---
window.saveProfile = async () => {
    const newNick = document.getElementById('editNickInput').value.trim();
    if (!newNick) return;
    await updateDoc(doc(db, "users", auth.currentUser.uid), { nick: newNick });
    closeModal('profileModal');
};

window.copyUid = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован в буфер!");
};

window.logout = () => signOut(auth);

// --- Друзья и Рендер ---
async function renderFriends(data) {
    const fList = document.getElementById("friendsList");
    const pList = document.getElementById("pendingList");
    
    fList.innerHTML = "";
    for (const fUid of (data.friends || [])) {
        const fSnap = await getDoc(doc(db, "users", fUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${fSnap.data()?.nick}</span>`;
        li.onclick = () => openChat(fUid, fSnap.data()?.nick);
        fList.appendChild(li);
    }

    pList.innerHTML = "";
    for (const pUid of (data.pending || [])) {
        const pSnap = await getDoc(doc(db, "users", pUid));
        const li = document.createElement("li");
        li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="mini-btn">OK</button>`;
        li.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            acceptFriend(pUid);
        };
        pList.appendChild(li);
    }
}

window.sendFriendRequest = async () => {
    const fUid = document.getElementById("friendUidInput").value.trim();
    if (!fUid || fUid === auth.currentUser.uid) return alert("Ошибка UID");
    try {
        await updateDoc(doc(db, "users", fUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        closeModal('friendModal');
    } catch (e) { alert("Пользователь не найден"); }
};

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}

// --- Чат ---
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
                ${d.data().text}
            </div>
        `).join("");
        box.scrollTop = box.scrollHeight;
    });
}

window.sendMessage = async () => {
    const input = document.getElementById("chatInput");
    if (!input.value || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
};
