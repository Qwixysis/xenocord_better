import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, 
    collection, addDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// ПРИВЯЗКА К WINDOW (Чтобы HTML сразу видел функции)
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
};

window.saveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    try {
        await updateDoc(doc(db, "users", user.uid), { nick, bio });
        alert("Сохранено!");
    } catch (e) { console.error(e); }
};

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован!");
};

window.acceptFriend = async (uid) => {
    const myUid = auth.currentUser.uid;
    await updateDoc(doc(db, "users", myUid), { friends: arrayUnion(uid), pending: arrayRemove(uid) });
    await updateDoc(doc(db, "users", uid), { friends: arrayUnion(myUid) });
};

window.sendFriendRequest = async () => {
    const targetUid = document.getElementById('friendUidInput').value.trim();
    if (!targetUid || targetUid === auth.currentUser.uid) return;
    try {
        await updateDoc(doc(db, "users", targetUid), { pending: arrayUnion(auth.currentUser.uid) });
        alert("Запрос отправлен!");
        window.closeModal('addFriendModal');
    } catch (e) { alert("Ошибка!"); }
};

// ЛОГИКА ОТКРЫТИЯ ЧАТА
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    document.getElementById("inputArea").style.display = "block";
    
    const box = document.getElementById("chatBox");
    box.innerHTML = "Загрузка...";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const div = document.createElement("div");
            div.style = "margin-bottom: 15px; display: flex; gap: 10px;";
            div.innerHTML = `
                <div style="width:35px; height:35px; background:#5865f2; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">${(isMe ? 'Я' : nick)[0]}</div>
                <div>
                    <div style="font-weight:bold; font-size:14px;">${isMe ? 'Вы' : nick}</div>
                    <div style="color:#dcddde;">${m.text}</div>
                </div>
            `;
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

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if (!d) return;
        
        document.getElementById("userNick").innerText = d.nick || "Jarvis";
        document.getElementById("userUid").innerText = user.uid;
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0];

        const fList = document.getElementById("friendsList");
        fList.innerHTML = "";
        (d.friends || []).forEach(async uid => {
            const fSnap = await getDoc(doc(db, "users", uid));
            const li = document.createElement("li");
            li.style = "padding: 8px; cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px;";
            li.innerHTML = `<div style="width:24px; height:24px; background:#5865f2; border-radius:50%; text-align:center; font-size:12px;">${(fSnap.data()?.nick || 'U')[0]}</div> ${fSnap.data()?.nick}`;
            li.onclick = () => window.openChat(uid, fSnap.data()?.nick);
            fList.appendChild(li);
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("sendMsgBtn").onclick = sendMsg;
    document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
});
