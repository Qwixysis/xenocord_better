import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ФУНКЦИИ В ГЛОБАЛЬНУЮ ОБЛАСТЬ (WINDOW)
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
};

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован!");
};

window.saveProfile = async () => {
    const user = auth.currentUser;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    const ava = document.getElementById('avaInput').value;
    try {
        await updateDoc(doc(db, "users", user.uid), { nick, bio, ava });
        window.closeModal('settingsModal');
    } catch (e) { alert("Ошибка сохранения"); }
};

window.sendFriendRequest = async () => {
    const targetUid = document.getElementById('friendUidInput').value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        window.closeModal('addFriendModal');
    } catch (e) { alert("Пользователь не найден"); }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    const box = document.getElementById("chatBox");
    box.innerHTML = "Загрузка сообщений...";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.className = `msg ${isMe ? 'my' : 'their'}`;
            div.innerText = m.text;
            box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
    });
};

const sendMsg = async () => {
    const input = document.getElementById("chatInput");
    if (!input.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: input.value,
        timestamp: serverTimestamp()
    });
    input.value = "";
};

// АВТОРИЗАЦИЯ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis User";
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0].toUpperCase();

        // Список друзей
        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (d.friends || []).forEach(async uid => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `<div class="ava" style="width:30px;height:30px">${(fSnap.data()?.nick || "U")[0]}</div> ${fSnap.data()?.nick}`;
            li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
            fList.appendChild(li);
        });

        // Заявки
        const pList = document.getElementById("pendingList");
        const pCount = document.getElementById("pendingCount");
        pCount.innerText = (d.pending || []).length;
        pList.innerHTML = "";
        (d.pending || []).forEach(async uid => {
            const pSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button class="primary" onclick="window.acceptFriend('${uid}')">OK</button>`;
            pList.appendChild(li);
        });
    });
});

document.getElementById("sendMsgBtn").onclick = sendMsg;
document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
document.getElementById("logoutBtn").onclick = () => signOut(auth);
