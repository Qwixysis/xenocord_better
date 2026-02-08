import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ПРИНУДИТЕЛЬНАЯ ПРИВЯЗКА К WINDOW (Чтобы не было TypeErrors)
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.showTab = (tabId, btn) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.m-nav').forEach(n => n.classList.remove('active'));
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
    try {
        await updateDoc(doc(db, "users", user.uid), { nick, bio });
        alert("Успешно сохранено!");
    } catch (e) { console.error(e); }
};

window.sendFriendRequest = async () => {
    const targetUid = document.getElementById('friendUidInput').value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        window.closeModal('addFriendModal');
    } catch (e) { alert("Пользователь не найден!"); }
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

// ОТКРЫТИЕ ЧАТА НА ПОЛНЫЙ ЭКРАН
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    document.getElementById("inputArea").style.display = "block";
    const box = document.getElementById("chatBox");
    box.innerHTML = "";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const row = document.createElement("div");
            row.className = "msg-row";
            row.innerHTML = `
                <div class="mini-ava">${(isMe ? 'Я' : nick)[0]}</div>
                <div class="msg-content">
                    <div class="msg-head">${isMe ? 'Вы' : nick} <span style="font-size:10px; color:#949ba4; font-weight:normal;">${m.timestamp?.toDate().toLocaleTimeString() || ''}</span></div>
                    <div class="msg-text">${m.text}</div>
                </div>
            `;
            box.appendChild(row);
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

// СЛУШАТЕЛЬ СОСТОЯНИЯ
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    document.getElementById("userUid").innerText = user.uid;

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis User";
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0].toUpperCase();

        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (d.friends || []).forEach(async uid => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.innerHTML = `<div class="mini-ava" style="width:24px;height:24px;font-size:10px">${(fSnap.data()?.nick || 'U')[0]}</div> ${fSnap.data()?.nick}`;
            li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
            fList.appendChild(li);
        });

        const pList = document.getElementById("pendingList");
        document.getElementById("pendingCount").innerText = (d.pending || []).length;
        pList.innerHTML = "";
        (d.pending || []).forEach(async uid => {
            const pSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.style = "justify-content:space-between;";
            li.innerHTML = `<span>${pSnap.data()?.nick}</span> <button onclick="window.acceptFriend('${uid}')" style="background:#23a559;border:none;color:white;padding:2px 5px;border-radius:3px;cursor:pointer;">✓</button>`;
            pList.appendChild(li);
        });
    });
});

document.getElementById("sendMsgBtn").onclick = sendMsg;
document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
document.getElementById("logoutBtn").onclick = () => signOut(auth);
