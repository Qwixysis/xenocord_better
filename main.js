import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, collection, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();
let currentChatUid = null;
let unsubscribeChat = null;

// Функции интерфейса
window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

window.saveProfile = async () => {
    const user = auth.currentUser;
    const nick = document.getElementById('nickInput').value;
    const bio = document.getElementById('bioInput').value;
    await updateDoc(doc(db, "users", user.uid), { nick, bio });
    alert("Профиль обновлен!");
};

window.copyUID = () => {
    const uid = document.getElementById('userUid').innerText;
    navigator.clipboard.writeText(uid);
    alert("UID скопирован в буфер!");
};

// ЧАТОВАЯ ЛОГИКА
window.openChat = (fUid, nick) => {
    currentChatUid = fUid;
    document.getElementById("chatTitle").innerText = nick;
    document.getElementById("chatStatus").innerText = "в сети";
    document.getElementById("inputArea").style.display = "block";
    
    const chatId = [auth.currentUser.uid, fUid].sort().join("_");
    if (unsubscribeChat) unsubscribeChat();
    
    const q = query(collection(db, "privateMessages", chatId, "messages"), orderBy("timestamp"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        const box = document.getElementById("chatBox");
        box.innerHTML = "";
        snap.docs.forEach(d => {
            const m = d.data();
            const isMe = m.senderUid === auth.currentUser.uid;
            const msgRow = document.createElement("div");
            msgRow.style = `display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};`;
            msgRow.innerHTML = `
                <div style="max-width: 70%; padding: 12px 18px; border-radius: 15px; background: ${isMe ? '#24a1de' : 'rgba(255,255,255,0.05)'}; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    ${m.text}
                </div>`;
            box.appendChild(msgRow);
        });
        box.scrollTop = box.scrollHeight;
    });
};

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    onSnapshot(doc(db, "users", user.uid), (snap) => {
        const d = snap.data();
        if(!d) return;
        document.getElementById("userNick").innerText = d.nick || "Jarvis";
        document.getElementById("userUid").innerText = user.uid;
        document.getElementById("userAvatarMain").innerText = (d.nick || "J")[0];
        
        // Список друзей (красивые карточки)
        const flist = document.getElementById("friendsList");
        flist.innerHTML = "";
        (d.friends || []).forEach(async fuid => {
            const fdoc = await getDoc(doc(db, "users", fuid));
            const li = document.createElement("li");
            li.innerHTML = `
                <div style="width:45px; height:45px; background: #3a3c43; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:bold;">${fdoc.data().nick[0]}</div>
                <div style="flex:1">
                    <div style="font-weight:bold">${fdoc.data().nick}</div>
                    <div style="font-size:12px; color:#24a1de">Нажмите, чтобы открыть чат</div>
                </div>
            `;
            li.onclick = () => window.openChat(fuid, fdoc.data().nick);
            flist.appendChild(li);
        });
    });
});

const sendMsg = async () => {
    const inp = document.getElementById("chatInput");
    if(!inp.value.trim() || !currentChatUid) return;
    const chatId = [auth.currentUser.uid, currentChatUid].sort().join("_");
    await addDoc(collection(db, "privateMessages", chatId, "messages"), {
        senderUid: auth.currentUser.uid,
        text: inp.value,
        timestamp: serverTimestamp()
    });
    inp.value = "";
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("sendMsgBtn").onclick = sendMsg;
    document.getElementById("chatInput").onkeydown = (e) => e.key === "Enter" && sendMsg();
    document.getElementById("logoutBtn").onclick = () => signOut(auth);
});
