"use client";
import React, { useEffect, useMemo, useState } from "react";
// Firebase (Auth + Firestore)
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// ------------------------------------------------------------
// Supremo Kanban — App Web (Next.js page.jsx - cliente)
// ------------------------------------------------------------

// =============== Constantes & Tema ===============
const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const CONSENT_KEY = "supremo_kanban_consent_v1";
const BRAND = { purple: "#4A2A52", gold: "#EFC32F", green: "#4CAD20", white: "#FEFEFE" };

// --- Firebase setup --- (recebe do layout via window.__FIREBASE_CONFIG__)
const firebaseConfig =
  (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) || {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    appId: "",
  };
function initFirebase() {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    return { app, auth, db, ok: true };
  } catch (e) {
    console.warn("Firebase init falhou:", e?.message || e);
    return { app: null, auth: null, db: null, ok: false, error: e };
  }
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;600;700&family=Pacifico&display=swap');
      :root { --supremo-purple:${BRAND.purple}; --supremo-gold:${BRAND.gold}; --supremo-green:${BRAND.green}; --supremo-white:${BRAND.white}; }
      .font-brand-headline { font-family: 'Pacifico', system-ui, sans-serif; }
      .font-brand-body { font-family: 'Quicksand', system-ui, sans-serif; }
      @keyframes supremoPulse { 0%{box-shadow:0 0 0 0 rgba(239,195,47,.35)} 50%{box-shadow:0 0 24px 6px rgba(239,195,47,.45)} 100%{box-shadow:0 0 0 0 rgba(239,195,47,.2)} }
      .supremo-glow { animation: supremoPulse 2s ease-in-out infinite; }
      .supremo-hero {
        background:
          radial-gradient(circle at 1px 1px, rgba(255,255,255,.12) 1.2px, transparent 1.2px) 0 0 / 12px 12px,
          linear-gradient(135deg, var(--supremo-purple), #6A3D73 60%, var(--supremo-gold));
      }
    `}</style>
  );
}

const Crown = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 9l4 3 5-7 5 7 4-3v9H3V9z" />
  </svg>
);

// =============== Helpers ===============
function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}
function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function dateFromWeekAndIndex(weekStartIso, idx) {
  const d = new Date(weekStartIso + "T00:00:00");
  d.setDate(d.getDate() + Number(idx || 0));
  return d;
}
function formatShort(date) {
  try {
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}
function getTodayIndexForWeek(weekStartIso) {
  try {
    const monday = new Date(weekStartIso + "T00:00:00");
    const diff = Math.floor((Date.now() - monday.getTime()) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff < 7 ? diff : 0;
  } catch {
    return 0;
  }
}

// =============== Toasts ===============
function useToasts() {
  const [toasts, setToasts] = useState([]);
  function push(msg, type = "info", ttl = 4000) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }
  return { toasts, push };
}

// =============== Consentimento ===============
function loadConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveConsent(c) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {}
}

// =============== App principal ===============
export default function Page() {
  // Firebase
  const { app, auth, db, ok: fbOK } = useMemo(() => initFirebase(), []);
  const provider = useMemo(() => (fbOK ? new GoogleAuthProvider() : null), [fbOK]);
  const { toasts, push } = useToasts();

  const handleGoogleLogin = async () => {
    try {
      if (!fbOK || !provider) {
        push(
          "Firebase Auth indisponível. Configure as variáveis e rode no Vercel ou local.",
          "warn"
        );
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      push("Falha ao abrir o Google Login. Veja o console.", "error");
    }
  };
  const handleLogout = async () => {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.error(e);
    }
  };

  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [weekStart, setWeekStart] = useState(isoDateOnly(getMonday(new Date())));
  const [tasks, setTasks] = useState([]);
  const [demoMode, setDemoMode] = useState(true);
  const [mobile, setMobile] = useState(true);
  const [activeDay, setActiveDay] = useState(() => getTodayIndexForWeek(weekStart));
  const [editingTask, setEditingTask] = useState(null);

  // consentimento
  const [consent, setConsent] = useState(() => loadConsent());
  const [showConsent, setShowConsent] = useState(false);
  const [allowNotifTemp, setAllowNotifTemp] = useState(true);
  const [allowCalTemp, setAllowCalTemp] = useState(true);

  useEffect(() => {
    if (currentUser && !consent) setShowConsent(true);
  }, [currentUser, consent]);

  // auth state (Google)
  useEffect(() => {
    if (!fbOK) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setCurrentUser(null);
        return;
      }
      try {
        const idt = await u.getIdTokenResult(true);
        const role = idt.claims.role || "USER";
        const meUser = {
          id: u.uid,
          name: u.displayName || u.email || "Usuário",
          email: u.email || "",
          role,
        };
        setCurrentUser(meUser);
        // upsert no Firestore para ter lista de usuários
        try {
          await setDoc(doc(db, "users", u.uid), { name: meUser.name, email: meUser.email, role }, { merge: true });
        } catch (e) {
          console.warn("users upsert", e);
        }
      } catch (e) {
        console.error(e);
      }
    });
    return () => unsub();
  }, [auth, db, fbOK]);

  // subscribe usuários (lista de responsáveis)
  useEffect(() => {
    if (!fbOK) return;
    const col = collection(db, "users");
    return onSnapshot(col, (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [db, fbOK]);

  // subscribe tarefas da semana
  useEffect(() => {
    if (!fbOK) return;
    const q = query(collection(db, "tasks"), where("weekStart", "==", weekStart));
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [db, weekStart, fbOK]);

  // lembretes
  useEffect(() => {
    if (!currentUser || !(consent?.allowNotifications)) return;
    const timer = setInterval(() => {
      const now = Date.now();
      tasks.forEach((t) => {
        if (!t.dueAt) return;
        const due = new Date(t.dueAt).getTime();
        if (demoMode) {
          if (due - now <= 10000 && due - now > 9000)
            push(`⏰ Lembrete (Demo ~10s): "${t.title}" vence em breve`, "warn");
          if (now - due >= 5000 && now - due < 6000)
            push(`⚠️ Atraso (Demo ~5s): "${t.title}" passou do prazo`, "error");
        } else {
          if (due - now <= 60 * 60 * 1000 && due - now > 59 * 60 * 1000)
            push(`⏰ Lembrete: falta 1 hora para concluir "${t.title}"`, "warn");
          if (now - due >= 60 * 1000 && now - due < 70 * 1000)
            push(`⚠️ Atraso: 1 minuto após o prazo de "${t.title}"`, "error");
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [tasks, demoMode, consent, currentUser]);

  // agrupamentos
  const weekTasks = useMemo(() => tasks.filter((t) => t.weekStart === weekStart), [tasks, weekStart]);
  const grouped = useMemo(() => {
    const base = Array.from({ length: 7 }, () => ({ todo: [], doing: [], done: [] }));
    weekTasks.forEach((t) => {
      base[t.dayIndex][t.status].push(t);
    });
    return base;
  }, [weekTasks]);
  const myStats = useMemo(() => {
    if (!currentUser) return { total: 0, done: 0, pct: 0 };
    const mine = weekTasks.filter((t) => t.assignedTo === currentUser.id);
    const done = mine.filter((t) => t.status === "done").length;
    const total = mine.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [currentUser, weekTasks]);

  // ações
  function createTask({ title, description, assignedTo, dayIndex, dueAt }) {
    if (!currentUser || currentUser.role !== "ADMIN") {
      push("Somente ADM cria tarefas", "error");
      return;
    }
    const payload = {
      title,
      description: description || "",
      status: "todo",
      assignedTo: assignedTo ?? null,
      createdBy: currentUser.id,
      dueAt: dueAt || null,
      weekStart,
      dayIndex: Number(dayIndex || 0),
      progress: 0,
      createdAt: serverTimestamp(),
    };
    addDoc(collection(db, "tasks"), payload).catch((e) => {
      console.error(e);
      push("Falha ao criar tarefa", "error");
    });
  }

  function moveTask(t, status) {
    if (!currentUser) return;
    const isOwner = t.assignedTo === currentUser.id;
    if (currentUser.role !== "ADMIN") {
      if (!isOwner) return push("Você só pode mover suas próprias tarefas.", "error");
      if (status === "todo") return push("Usuários não podem retornar para A Fazer.", "error");
    }
    const newProgress = status === "done" ? 100 : t.progress || 0;
    updateDoc(doc(db, "tasks", t.id), { status, progress: newProgress })
      .then(() => {
        if (status === "done") push(`🎉 Parabéns, ${currentUser.name}! Você concluiu "${t.title}"`, "success");
      })
      .catch((e) => {
        console.error(e);
      });
  }

  function startEditTask(task) {
    if (!currentUser || currentUser.role !== "ADMIN") {
      push("Somente ADM pode editar.", "error");
      return;
    }
    const dueT = task.dueAt ? new Date(task.dueAt).toISOString().slice(11, 16) : "";
    setEditingTask({ ...task, _dueTime: dueT });
  }
  function saveEditTask() {
    if (!currentUser || currentUser.role !== "ADMIN" || !editingTask) return;
    const t = editingTask;
    let dueAtISO = t.dueAt ?? null;
    if (typeof t._dueTime === "string") {
      if (t._dueTime) {
        const base = new Date(t.weekStart + "T00:00:00");
        base.setDate(base.getDate() + Number(t.dayIndex || 0));
        const [hh, mm] = t._dueTime.split(":");
        base.setHours(Number(hh || 0), Number(mm || 0), 0, 0);
        dueAtISO = base.toISOString();
      } else {
        dueAtISO = null;
      }
    }
    updateDoc(doc(db, "tasks", t.id), {
      title: t.title,
      description: t.description || "",
      assignedTo: t.assignedTo ?? null,
      dayIndex: Number(t.dayIndex || 0),
      dueAt: dueAtISO,
    })
      .then(() => {
        setEditingTask(null);
        push("Tarefa atualizada.", "success");
      })
      .catch((e) => {
        console.error(e);
      });
  }
  function deleteTaskConfirm(task) {
    if (!currentUser || currentUser.role !== "ADMIN") {
      push("Somente ADM pode excluir.", "error");
      return;
    }
    if (confirm(`Excluir "${task.title}"?`)) {
      deleteDoc(doc(db, "tasks", task.id))
        .then(() => push("Tarefa excluída.", "success"))
        .catch((e) => console.error(e));
    }
  }

  function changeWeek(delta) {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    const iso = isoDateOnly(d);
    setWeekStart(iso);
    setActiveDay(getTodayIndexForWeek(iso));
  }
  function seedDemo() {
    const now = new Date();
    const soon = new Date(now.getTime() + (demoMode ? 12000 : 50 * 60 * 1000));
    const overdue = new Date(now.getTime() - (demoMode ? 3000 : 30 * 1000));
    const sample = [
      {
        title: "Postar Reels do sabor Trufado",
        description: "Revisar legenda #SaborQueConquista",
        status: "todo",
        assignedTo: users[1]?.id || currentUser?.id,
        createdBy: currentUser?.id || "adm",
        dueAt: soon.toISOString(),
        weekStart,
        dayIndex: 4,
        progress: 0,
      },
      {
        title: "Comprar embalagens P e M",
        description: "Verificar fornecedor A/B",
        status: "doing",
        assignedTo: users[2]?.id || currentUser?.id,
        createdBy: currentUser?.id || "adm",
        dueAt: null,
        weekStart,
        dayIndex: 2,
        progress: 30,
      },
      {
        title: "Organizar vitrine da loja",
        description: "Temática da semana",
        status: "done",
        assignedTo: users[3]?.id || currentUser?.id,
        createdBy: currentUser?.id || "adm",
        dueAt: null,
        weekStart,
        dayIndex: 1,
        progress: 100,
      },
      {
        title: "Responder directs do Insta",
        description: "Atender clientes",
        status: "todo",
        assignedTo: users[3]?.id || currentUser?.id,
        createdBy: currentUser?.id || "adm",
        dueAt: overdue.toISOString(),
        weekStart,
        dayIndex: 0,
        progress: 0,
      },
    ];
    sample.forEach((p) => addDoc(collection(db, "tasks"), { ...p, createdAt: serverTimestamp() }));
    push("Dados de demonstração adicionados à semana atual.", "info");
  }

  // UI: Login
  if (!currentUser) {
    const monday = weekStart;
    return (
      <div
        className={classNames(
          "min-h-screen p-6 font-brand-body",
          mobile
            ? "max-w-[390px] mx-auto border-8 border-black rounded-[36px] shadow-2xl overflow-hidden bg-black"
            : "bg-gray-50"
        )}
        style={{
          background: mobile
            ? undefined
            : "linear-gradient(180deg, #4A2A5211, #EFC32F11)",
        }}
      >
        <FontLoader />
        <div className="max-w-5xl mx-auto">
          <HeaderBare mobile={mobile} setMobile={setMobile} login />
          <div className="bg-white rounded-2xl shadow p-6 mt-4">
            <h2 className="text-xl font-bold">Entrar com Google</h2>
            <p className="text-gray-600 mb-3">
              Clique para autenticar com sua conta Google.
            </p>
            <button
              onClick={handleGoogleLogin}
              disabled={!fbOK}
              className="px-4 py-2 rounded-xl bg-[#4A2A52] text-white disabled:opacity-50"
            >
              Continuar com Google
            </button>
            {!fbOK && (
              <p className="text-xs text-red-600 mt-2">
                Firebase não disponível neste preview. Configure envs e rode
                local/Vercel.
              </p>
            )}
            <div className="mt-6 text-sm text-gray-500">
              Semana atual do quadro: <span className="font-mono">{monday}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const me = currentUser;

  return (
    <div
      className={classNames(
        "min-h-screen p-6 font-brand-body",
        mobile
          ? "max-w-[390px] mx-auto border-8 border-black rounded-[36px] shadow-2xl overflow-hidden bg-black"
          : "bg-gray-50"
      )}
      style={{
        background: mobile
          ? undefined
          : "linear-gradient(180deg, #4A2A5211, #EFC32F11)",
      }}
    >
      <FontLoader />
      <div className="max-w-[1400px] mx-auto">
        <HeaderFull
          me={me}
          weekStart={weekStart}
          onPrev={() => changeWeek(-1)}
          onNext={() => changeWeek(1)}
          onToday={() => setWeekStart(isoDateOnly(getMonday(new Date())))}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
          mobile={mobile}
          setMobile={setMobile}
          activeDay={activeDay}
          setActiveDay={setActiveDay}
          onOpenConsent={() => setShowConsent(true)}
          onSignOut={handleLogout}
        />

        {/* Barra de progresso pessoal */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4 border border-[#EFC32F33]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Seu progresso na semana</div>
              <div className="text-lg font-semibold">{me.name}</div>
            </div>
            <div className="text-sm text-gray-600">
              {myStats.done}/{myStats.total} tarefas —{' '}
              <span className="font-semibold">{myStats.pct}%</span>
            </div>
          </div>
          <div className="h-3 bg-[#F3E7F7] rounded-full mt-3 ring-1 ring-[#4A2A5215]">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-[#EFC32F] via-[#FFD56B] to-[#4CAD20] transition-all shadow-inner"
              style={{ width: `${myStats.pct}%` }}
            />
          </div>
        </div>

        {/* Criar tarefa (ADM) */}
        {me.role === 'ADMIN' && (
          <CreateTaskCard
            users={users}
            onCreate={createTask}
            weekStart={weekStart}
            onSeed={seedDemo}
            mobile={mobile}
          />
        )}

        {/* Quadro semanal */}
        {mobile ? (
          <div className="grid grid-cols-1 gap-3">
            {(() => {
              const i = activeDay;
              return (
                <div className="bg-white rounded-2xl shadow p-3 flex flex-col">
                  <div className="rounded-xl px-3 py-2 mb-2 bg-[#4A2A52] text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex w-2 h-2 rounded-full bg-[#EFC32F]"></span>
                      <h4 className="font-brand-headline text-lg tracking-wide">
                        {days[i]}{' '}
                        <span className="ml-2 text-xs font-normal opacity-90">
                          {formatShort(dateFromWeekAndIndex(weekStart, i))}
                        </span>
                      </h4>
                    </div>
                    <span className="text-xs bg-[#EFC32F] text-[#4A2A52] px-2 py-0.5 rounded-full">
                      {grouped[i].todo.length + grouped[i].doing.length + grouped[i].done.length || '—'}
                    </span>
                  </div>
                  <Section
                    title="A Fazer"
                    tasks={grouped[i].todo}
                    onMove={(t) => moveTask(t, 'doing')}
                    actionLabel="▶ Em andamento"
                    me={me}
                    onEdit={startEditTask}
                    onDelete={deleteTaskConfirm}
                    demoMode={demoMode}
                  />
                  <Section
                    title="Em andamento"
                    tasks={grouped[i].doing}
                    onMove={(t) => moveTask(t, 'done')}
                    actionLabel="✔ Concluir"
                    me={me}
                    onEdit={startEditTask}
                    onDelete={deleteTaskConfirm}
                    demoMode={demoMode}
                  />
                  <Section
                    title="Concluído"
                    tasks={grouped[i].done}
                    me={me}
                    onEdit={startEditTask}
                    onDelete={deleteTaskConfirm}
                    demoMode={demoMode}
                  />
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {days.map((d, i) => (
              <div key={i} className="bg-white rounded-2xl shadow p-3 flex flex-col">
                <div className="rounded-xl px-3 py-2 mb-2 bg-[#4A2A52] text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex w-2 h-2 rounded-full bg-[#EFC32F]"></span>
                    <h4 className="font-brand-headline text-lg tracking-wide">
                      {d}{' '}
                      <span className="ml-2 text-xs font-normal opacity-90">
                        {formatShort(dateFromWeekAndIndex(weekStart, i))}
                      </span>
                    </h4>
                  </div>
                  <span className="text-xs bg-[#EFC32F] text-[#4A2A52] px-2 py-0.5 rounded-full">
                    {grouped[i].todo.length + grouped[i].doing.length + grouped[i].done.length || '—'}
                  </span>
                </div>
                <Section
                  title="A Fazer"
                  tasks={grouped[i].todo}
                  onMove={(t) => moveTask(t, 'doing')}
                  actionLabel="▶ Em andamento"
                  me={me}
                  onEdit={startEditTask}
                  onDelete={deleteTaskConfirm}
                  demoMode={demoMode}
                />
                <Section
                  title="Em andamento"
                  tasks={grouped[i].doing}
                  onMove={(t) => moveTask(t, 'done')}
                  actionLabel="✔ Concluir"
                  me={me}
                  onEdit={startEditTask}
                  onDelete={deleteTaskConfirm}
                  demoMode={demoMode}
                />
                <Section
                  title="Concluído"
                  tasks={grouped[i].done}
                  me={me}
                  onEdit={startEditTask}
                  onDelete={deleteTaskConfirm}
                  demoMode={demoMode}
                />
              </div>
            ))}
          </div>
        )}

        {/* Modal editar (ADM) */}
        {editingTask && me.role === 'ADMIN' && (
          <div className="fixed inset-0 z-[120] bg-black/60 flex items-end md:items-center md:justify-center">
            <div
              className={
                mobile
                  ? 'bg-white w-full rounded-t-3xl p-4 h-[65vh] max-h-[80vh] flex flex-col'
                  : 'bg-white w-[min(720px,90vw)] max-h-[85vh] rounded-2xl p-6 flex flex-col'
              }
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Editar tarefa</div>
                <button
                  onClick={() => setEditingTask(null)}
                  className="text-sm px-3 py-1 rounded-lg bg-gray-100"
                >
                  Fechar
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <input
                  className="border rounded-xl p-2"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                />
                <textarea
                  className="border rounded-xl p-2 md:col-span-2"
                  rows={3}
                  value={editingTask.description || ''}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, description: e.target.value })
                  }
                ></textarea>
                <select
                  className="border rounded-xl p-2"
                  value={editingTask.assignedTo ?? ''}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      assignedTo: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">— Responsável —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-xl p-2"
                  value={editingTask.dayIndex}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, dayIndex: Number(e.target.value) })
                  }
                >
                  {days.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  title="Hora do prazo"
                  className="border rounded-xl p-2"
                  type="time"
                  step="60"
                  value={editingTask._dueTime || ''}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, _dueTime: e.target.value })
                  }
                />
              </div>
              <div className="mt-3 flex justify-between">
                <button
                  onClick={() => {
                    deleteTaskConfirm(editingTask);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2 rounded-xl border text-red-600"
                >
                  🗑️ Excluir
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 rounded-xl bg-gray-100"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveEditTask}
                    className="px-4 py-2 rounded-xl bg-[#4A2A52] text-white"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Consentimento */}
        {showConsent && (
          <div className="fixed inset-0 z-[140] bg-black/60 flex items-end md:items-center md:justify-center">
            <div
              className={
                mobile
                  ? 'bg-white w-full rounded-t-3xl p-5 max-h-[85vh] flex flex-col'
                  : 'bg-white w-[min(720px,90vw)] rounded-2xl p-6 flex flex-col'
              }
            >
              <div className="mb-2">
                <h3 className="text-lg font-bold">Termo de ciência e autorização</h3>
                <p className="text-sm text-gray-600">
                  Para oferecer lembretes e criar eventos de tarefas, precisamos da sua
                  permissão. Você pode alterar depois em <b>Permissões</b>.
                </p>
              </div>
              <div className="space-y-3 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={allowNotifTemp}
                    onChange={(e) => setAllowNotifTemp(e.target.checked)}
                  />
                  <span>
                    <b>Notificações por pop-up</b> (lembretes de prazo e avisos dentro do
                    app).
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={allowCalTemp}
                    onChange={(e) => setAllowCalTemp(e.target.checked)}
                  />
                  <span>
                    <b>Agendar no Google Agenda</b> (criar/atualizar eventos para tarefas
                    com prazo).
                  </span>
                </label>
                <div className="text-xs text-gray-500">
                  No simulador, o agendamento é apenas uma simulação. Na versão real
                  será solicitado o login Google e autorização (OAuth).
                </div>
              </div>
              <div className="mt-4 flex flex-col md:flex-row md:justify-between gap-2">
                <button
                  onClick={() =>
                    saveConsentAndClose({
                      allowNotifications: true,
                      allowCalendar: true,
                      acceptedAt: new Date().toISOString(),
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-[#4A2A52] text-white"
                >
                  Aceitar tudo e continuar
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      saveConsentAndClose({
                        allowNotifications: allowNotifTemp,
                        allowCalendar: allowCalTemp,
                        acceptedAt: new Date().toISOString(),
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-gray-100"
                  >
                    Salvar preferências
                  </button>
                  <button
                    onClick={() =>
                      saveConsentAndClose({
                        allowNotifications: false,
                        allowCalendar: false,
                        acceptedAt: new Date().toISOString(),
                      })
                    }
                    className="px-4 py-2 rounded-xl border border-gray-300"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toasts */}
        <div className="fixed right-4 bottom-4 space-y-2 z-50">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={classNames(
                'rounded-xl px-4 py-3 shadow-lg text-sm',
                t.type === 'success' && 'bg-[#4CAD20] text-white',
                t.type === 'warn' && 'bg-[#EFC32F] text-[#4A2A52]',
                t.type === 'error' && 'bg-[#4A2A52] text-white',
                t.type === 'info' && 'bg-[#4A2A52] text-white'
              )}
            >
              {t.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  function saveConsentAndClose(c) {
    setConsent(c);
    saveConsent(c);
    setShowConsent(false);
    push('Preferências de permissões salvas.', 'success');
  }
}

// =============== Subcomponentes ===============
function HeaderBare({ mobile, setMobile, login = false }) {
  if (login) {
    return (
      <div className="rounded-3xl p-5 mb-4 supremo-hero text-white shadow-xl ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#EFC32F] text-[#4A2A52] shadow-lg">
              <Crown />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold font-brand-headline drop-shadow">
                Supremo Kanban
              </h1>
              <p className="text-sm text-white/90">Loja Supremo Açaí e Sorvetes 🍧👑</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs bg-white/15 px-3 py-2 rounded-xl backdrop-blur-sm">
            <input
              type="checkbox"
              checked={mobile}
              onChange={(e) => setMobile(e.target.checked)}
            />
            📱 Mobile
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#EFC32F] text-[#4A2A52]">
          <Crown />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold font-brand-headline text-[#4A2A52]">
            Supremo Kanban
          </h1>
          <p className="text-sm text-gray-600">Loja Supremo Açaí e Sorvetes 🍧👑</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs bg-gray-100 px-3 py-2 rounded-xl">
        <input
          type="checkbox"
          checked={mobile}
          onChange={(e) => setMobile(e.target.checked)}
        />
        📱 Mobile
      </label>
    </div>
  );
}

function HeaderFull({
  me,
  weekStart,
  onPrev,
  onNext,
  onToday,
  demoMode,
  setDemoMode,
  mobile,
  setMobile,
  activeDay,
  setActiveDay,
  onOpenConsent,
  onSignOut,
}) {
  return (
    <div className="supremo-hero text-white rounded-2xl shadow p-4 mb-4 ring-1 ring-white/10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#EFC32F] text-[#4A2A52]">
              <Crown />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold font-brand-headline text-white drop-shadow">
                Supremo Kanban — Semana {weekStart}
              </h1>
              <div className="text-sm text-white/85">Loja Supremo Açaí e Sorvetes</div>
            </div>
          </div>
          <div className="text-xs text-white/80">
            Logado como <b>{me.name || me.email}</b> — papel: <b>{me.role}</b>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm bg-white/20 text-white px-3 py-2 rounded-xl ring-1 ring-white/15 hover:bg-white/30">
            <input
              type="checkbox"
              checked={mobile}
              onChange={(e) => setMobile(e.target.checked)}
            />
            📱 Mobile
          </label>
          {mobile && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveDay((d) => Math.max(0, d - 1))}
                className="px-2 py-1 rounded-lg bg-white/20 text-white hover:bg-white/30"
              >
                ◀ Dia
              </button>
              <span className="text-sm px-2 py-1 rounded-lg bg-white/15 text-white">
                {days[activeDay]}
              </span>
              <button
                onClick={() => setActiveDay((d) => Math.min(6, d + 1))}
                className="px-2 py-1 rounded-lg bg-white/20 text-white hover:bg-white/30"
              >
                Dia ▶
              </button>
            </div>
          )}
          <button
            onClick={onPrev}
            className="px-3 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30"
          >
            ◀ Semana anterior
          </button>
          <button
            onClick={onToday}
            className="px-3 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30"
          >
            Hoje
          </button>
          <button
            onClick={onNext}
            className="px-3 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30"
          >
            Próxima semana ▶
          </button>
          <button
            onClick={onSignOut}
            className="px-3 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30"
          >
            Sair
          </button>
          <label className="flex items-center gap-2 text-sm bg-white/20 text-white px-3 py-2 rounded-xl ring-1 ring-white/15 hover:bg-white/30">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
            />
            ⏱️ Modo Demo (lembretes em segundos)
          </label>
          <button
            onClick={onOpenConsent}
            className="px-3 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30"
          >
            🔒 Permissões
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTaskCard({ users, onCreate, weekStart, onSeed, mobile }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dayIndex, setDayIndex] = useState(0);
  const [dueTime, setDueTime] = useState('');
  const [editing, setEditing] = useState(null);
  const openEditor = (field) => setEditing({ field, text: field === 'title' ? title : description });
  const saveEditor = () => {
    if (!editing) return;
    if (editing.field === 'title') setTitle(editing.text);
    else setDescription(editing.text);
    setEditing(null);
  };
  return (
    <div className="bg-white rounded-2xl shadow p-4 mb-4 border border-[#EFC32F33]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Nova tarefa (ADM)</h3>
        <button
          onClick={onSeed}
          className="text-sm px-3 py-1 rounded-lg bg-[#EFC32F] text-[#4A2A52]"
        >
          Adicionar dados de demonstração
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <div
          onClick={() => openEditor('title')}
          className="border rounded-xl p-2 bg-white cursor-text min-h-[44px] overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {title ? title : <span className="text-gray-400">Título (clique para digitar)</span>}
        </div>
        <div
          onClick={() => openEditor('description')}
          className="border rounded-xl p-2 md:col-span-2 bg-white cursor-text min-h-[88px] max-h-[120px] overflow-hidden leading-relaxed whitespace-pre-wrap"
        >
          {description ? description : <span className="text-gray-400">Descrição (clique para digitar)</span>}
        </div>
        <select
          className="border rounded-xl p-2"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="">— Responsável —</option>
          {users.map((u) => (
            <option value={u.id} key={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded-xl p-2"
          value={dayIndex}
          onChange={(e) => setDayIndex(Number(e.target.value))}
        >
          {days.map((d, i) => (
            <option key={i} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          title="Hora do prazo"
          className="border rounded-xl p-2"
          type="time"
          step="60"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            if (!title.trim()) return;
            let dueAtISO = null;
            if (dueTime) {
              const base = new Date(weekStart + 'T00:00:00');
              base.setDate(base.getDate() + Number(dayIndex));
              const [hh, mm] = dueTime.split(':');
              base.setHours(Number(hh || 0), Number(mm || 0), 0, 0);
              dueAtISO = base.toISOString();
            }
            onCreate({
              title,
              description,
              assignedTo: assignedTo ? Number(assignedTo) : null,
              dueAt: dueAtISO,
              dayIndex,
            });
            setTitle('');
            setDescription('');
            setAssignedTo('');
            setDayIndex(0);
            setDueTime('');
          }}
          className="px-4 py-2 rounded-xl bg-[#4A2A52] text-white hover:opacity-90"
        >
          Criar
        </button>
        <div className="text-sm text-gray-500 flex items-center">
          Semana: <span className="ml-1 font-mono">{weekStart}</span>
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end md:items-center md:justify-center">
          <div
            className={
              mobile
                ? 'bg-white w-full rounded-t-3xl p-4 h-[65vh] max-h-[80vh] flex flex-col'
                : 'bg-white w-[min(720px,90vw)] max-h-[85vh] rounded-2xl p-6 flex flex-col'
            }
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">
                Editar {editing.field === 'title' ? 'título' : 'descrição'}
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-sm px-3 py-1 rounded-lg bg-gray-100"
              >
                Cancelar
              </button>
            </div>
            <textarea
              id="overlay-textarea"
              className="flex-1 min-h-0 w-full border rounded-xl p-3 leading-relaxed resize-none overflow-auto"
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              onKeyDown={(e) => {
                if (editing.field === 'title' && e.key === 'Enter' && !e.ctrlKey) {
                  e.preventDefault();
                  saveEditor();
                }
                if (editing.field === 'description' && e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  saveEditor();
                }
              }}
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                onClick={saveEditor}
                className="px-4 py-2 rounded-xl bg-[#4A2A52] text-white"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, tasks, onMove, actionLabel, me, onEdit, onDelete, demoMode }) {
  const barBase = 'w-full flex items-center justify-between gap-2 px-3 rounded-xl h-10 font-semibold shadow-sm';
  const tone =
    title === 'A Fazer'
      ? 'bg-[#F3E7F7] text-[#4A2A52]'
      : title === 'Em andamento'
      ? 'bg-[#EFC32F] text-[#4A2A52]'
      : 'bg-[#4CAD20] text-white';
  const emoji = title === 'A Fazer' ? '😞' : title === 'Em andamento' ? '😐' : '😄';
  const badgeTone = title === 'Concluído' ? 'bg-white/95 text-[#4A2A52]' : 'bg-white/90 text-[#4A2A52]';
  return (
    <div className="mb-3 flex-1">
      <div className={classNames(barBase, tone)}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            {emoji}
          </span>
          <span className="tracking-wide">{title}</span>
        </div>
        <span className={classNames('text-xs px-2 py-0.5 rounded-full', badgeTone)}>
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2 mt-1">
        {tasks.map((t) => (
          <CardTask
            key={t.id}
            t={t}
            me={me}
            onMove={onMove}
            actionLabel={actionLabel}
            onEdit={onEdit}
            onDelete={onDelete}
            demoMode={demoMode}
          />
        ))}
        {!tasks.length && <div className="text-xs text-gray-400">—</div>}
      </div>
    </div>
  );
}

function CardTask({ t, onMove, actionLabel, me, onEdit, onDelete, demoMode }) {
  const dueTxt = t.dueAt ? new Date(t.dueAt).toLocaleString() : null;
  const msLeft = t.dueAt ? new Date(t.dueAt).getTime() - Date.now() : null;
  const dueSoon = msLeft !== null && msLeft > 0 && msLeft <= 60 * 60 * 1000;
  const overdue = msLeft !== null && msLeft < 0;
  const glowPulse = msLeft !== null && msLeft > 0 && (demoMode ? msLeft <= 12000 : msLeft <= 10 * 60 * 1000);
  const isAdmin = me.role === 'ADMIN';
  const mine = t.assignedTo === me.id;
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen((o) => !o)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      className={classNames(
        'rounded-xl p-3 bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px] border',
        dueSoon
          ? 'border-[#EFC32F] ring-1 ring-[#EFC32F33]'
          : overdue
          ? 'border-red-300 ring-1 ring-red-200'
          : 'border-[#4A2A521A]',
        glowPulse && 'supremo-glow ring-2 ring-[#EFC32F99]'
      )}
    >
      <div className="flex items-center justify-between">
        <div className={classNames('font-semibold pr-2 min-w-0', open ? '' : 'truncate')}>{t.title}</div>
      </div>
      {t.description && (
        <div
          className={
            open
              ? 'text-sm text-gray-700 mt-1 whitespace-pre-wrap'
              : 'text-xs text-gray-600 mt-1 max-h-12 overflow-hidden'
          }
        >
          {t.description}
        </div>
      )}
      <div className="mt-2 h-2 bg-gray-200 rounded">
        <div className="h-2 bg-[#4CAD20] rounded" style={{ width: `${t.progress || 0}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 w-full">
        <div className="flex flex-col">
          {t.assignedTo ? <span>Resp.: #{t.assignedTo}</span> : <span>Resp.: —</span>}
          {dueTxt && <span>Prazo: {dueTxt}</span>}
        </div>
        <div className="flex items-center gap-1 flex-wrap w-full justify-start">
          {isAdmin && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(t);
                }}
                className="text-xs px-2 py-1 rounded-lg border border-gray-300"
              >
                ✏️ Editar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t);
                }}
                className="text-xs px-2 py-1 rounded-lg border border-gray-300"
              >
                🗑️ Excluir
              </button>
            </>
          )}
          {onMove && (isAdmin || mine) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(t);
              }}
              className="text-xs px-2 py-1 rounded-lg border border-gray-300"
            >
              {actionLabel || 'Mover'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}