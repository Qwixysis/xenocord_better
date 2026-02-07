import { auth } from "./firebase.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } 
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const db = getFirestore();
const storage = getStorage();

// --- Открыть модалку профиля ---
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

// --- Закрыть модалку профиля ---
window.closeProfileModal = function() {
  document.getElementById("profileModal").style.display = "none";
};

// --- Обновить данные профиля ---
window.updateProfileData = async function() {
  const user = auth.currentUser;
  if (!user) return;

  const newNick = document.getElementById("newNick").value.trim();
  const newPhotoUrl = document.getElementById("newPhoto").value.trim();
  const fileInput = document.getElementById("newPhotoFile");

  let photoURL = user.photoURL;

  try {
    // Если загружен файл
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      photoURL = await getDownloadURL(storageRef);
    } else if (newPhotoUrl) {
      // Если указан URL
      photoURL = newPhotoUrl;
    }

    // Обновляем профиль в Firebase Auth
    await updateProfile(user, {
      displayName: newNick || user.displayName,
      photoURL: photoURL
    });

    // Обновляем документ в Firestore
    await updateDoc(doc(db, "users", user.uid), {
      nick: newNick || user.displayName,
      photoURL: photoURL
    });

    alert("Профиль обновлён!");
    closeProfileModal();
  } catch (err) {
    alert(err.message);
  }
};
