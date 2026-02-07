import { auth } from "./firebase.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore();

window.openProfileModal = async function() {
  const user = auth.currentUser;
  if (!user) return;

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (userSnap.exists()) {
    const data = userSnap.data();
    document.getElementById("profileUid").textContent = data.uid;
    document.getElementById("profileEmail").textContent = data.email;
    document.getElementById("profileNick").textContent = data.nick;
    document.getElementById("profilePhoto").src = data.photoURL || "default.png";
  }

  document.getElementById("profileModal").style.display = "block";
};

window.closeProfileModal = function() {
  document.getElementById("profileModal").style.display = "none";
};

window.updateProfileData = async function() {
  const user = auth.currentUser;
  if (!user) return;

  const newNick = document.getElementById("newNick").value.trim();
  const newPhoto = document.getElementById("newPhoto").value.trim();

  try {
    await updateProfile(user, {
      displayName: newNick || user.displayName,
      photoURL: newPhoto || user.photoURL
    });

    await updateDoc(doc(db, "users", user.uid), {
      nick: newNick || user.displayName,
      photoURL: newPhoto || user.photoURL
    });

    alert("Профиль обновлён!");
    closeProfileModal();
  } catch (err) {
    alert(err.message);
  }
};
