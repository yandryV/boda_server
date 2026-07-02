// api/index.js
const express = require("express");
const admin = require("firebase-admin");
const guests = require("./guests.json"); // archivo en la raíz
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Inicializar Firebase (solo una vez) ----------
if (!admin.apps.length) {
  // Las credenciales se toman de una variable de entorno JSON
  const firebaseConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
  });
}
const firestore = admin.firestore();
const rsvpCollection = firestore.collection("rsvp");

// ---------- Ruta: Obtener invitado + RSVP ----------
app.get("/guest/:id", async (req, res) => {
  const guestId = req.params.id;
  const guest = guests.find((g) => g.id === guestId);
  if (!guest) {
    return res.status(404).json({ error: "Invitado no encontrado" });
  }

  try {
    const doc = await rsvpCollection.doc(guestId).get();
    const rsvp = doc.exists ? doc.data() : null;
    res.json({ ...guest, rsvp });
  } catch (err) {
    console.error("Error al obtener RSVP:", err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ---------- Ruta: Confirmar asistencia ----------
app.post("/rsvp/:id", async (req, res) => {
  const guestId = req.params.id;
  const guest = guests.find((g) => g.id === guestId);
  if (!guest) {
    return res.status(404).json({ error: "Invitado no encontrado" });
  }

  const { attending, guestsCount } = req.body;
  if (guestsCount > guest.maxGuests) {
    return res.status(400).json({
      error: `Máximo ${guest.maxGuests} acompañantes`,
    });
  }

  try {
    await rsvpCollection.doc(guestId).set({
      guest_id: guestId,
      attending: !!attending,
      guests_count: guestsCount || 0,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Error al guardar RSVP:", err);
    res.status(500).json({ error: "Error al guardar la confirmación" });
  }
});

// Obtener todas las confirmaciones desde Firestore
app.get("/api/admin/rsvps", checkAdmin, async (req, res) => {
  try {
    const snapshot = await rsvpCollection.orderBy("timestamp", "desc").get();
    const rsvps = [];
    snapshot.forEach((doc) => {
      rsvps.push(doc.data());
    });
    // Enriquecer con nombre del invitado
    const enriched = rsvps.map((r) => {
      const guest = guests.find((g) => g.id === r.guest_id);
      return {
        ...r,
        guest_name: guest ? guest.name : "Desconocido",
        maxGuests: guest ? guest.maxGuests : 0,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error("Error al obtener RSVPs:", err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// api/index.js (añadir al final, antes de module.exports)
app.get("/api/guests", (req, res) => {
  res.json(guests);
});

// ---------- Exportar handler para Vercel ----------
module.exports = app;
