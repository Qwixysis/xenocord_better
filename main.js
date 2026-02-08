import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// Проверка входа
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        document.getElementById("userNick").innerText = user.email.split('@')[0];
        document.getElementById("userUid").innerText = user.uid;
        loadFriendsData(user.uid);
    }
});

// Кнопки интерфейса
document.getElementById("logoutBtn").onclick = () => signOut(auth);
document.getElementById("addFriendBtn").onclick = () => document.getElementById("friendModal").style.display = "block";

document.getElementById("confirmSendRequest").onclick = async () => {
    const fUid = document.getElementById("friendUidInput").value.trim();
    if (!fUid || fUid === auth.currentUser.uid) return alert("Неверный UID");
    
    try {
        await updateDoc(doc(db, "users", fUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        document.getElementById("friendModal").style.display = "none";
    } catch (e) { alert("Пользователь не найден"); }
};

document.getElementById("sendMsgBtn").onclick = sendMessage;

// Загрузка друзей и заявок
function loadFriendsData(myUid) {
    onSnapshot(doc(db, "users", myUid), async (snap) => {
        const data = snap.data();
        if (!data) return;

        // Рендер друзей
        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        for (const fUid of (data.friends || [])) {
            const fSnap = await getDoc(doc(db, "users", fUid));
            const item = document.createElement("li");
            item.innerHTML = `<span>${fSnap.data()?.nick || 'Юзер'}</span>`;
            item.onclick = () => openChat(fUid, fSnap.data()?.nick);
            fList.appendChild(item);
        }

        // Рендер заявок
        const pList = document.getElementById("pendingList");
        pList.innerHTML = "";
        for (const pUid of (data.pending || [])) {
            const pSnap = await getDoc(doc(db, "users", pUid));
            const item = document.createElement("li");
            item.innerHTML = `${pSnap.data()?.nick} <button class="mini-btn">OK</button>`;
            item.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                acceptFriend(pUid);
            };
            pList.appendChild(item);
        }
    });
}

async function acceptFriend(fUid) {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(fUid), pending: arrayRemove(fUid) });
    await updateDoc(doc(db, "users", fUid), { friends: arrayUnion(myUid) });
}

async function openChat(fUid, fNick) {
    currentChatUid = fUid;
    document.getElementById("chatHeader").innerText = "Чат с " + fNick;
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
