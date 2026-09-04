// 🔥 Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAn4YFjsLH2NsbXxZMTJtNIQIV0oxXi2cM",
  authDomain: "gestao-de-contratos-4ad66.firebaseapp.com",
  projectId: "gestao-de-contratos-4ad66",
  storageBucket: "gestao-de-contratos-4ad66.firebasestorage.app",
  messagingSenderId: "528807844859",
  appId: "1:528807844859:web:2fcfae3f1e6f1e51bec95e",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let isAdmin = false;
/* ─── DATA ─── */
let editingIndex = null;
let currentPage = 1;
const PER_PAGE = 12;
let charts = {};
let contratos = [];
let contratoSelecionado = null;
let analises = [];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "block";

    const nome = user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    document.getElementById("userName").textContent = nome;
    document.getElementById("userEmail").textContent = user.email;

    isAdmin = user.email === "marlon@gmail.com";

    const adminSection = document.getElementById("adminSection");
    if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

    const esconderParaFiscal = ["navRelatorios", "navArquivados"];
    esconderParaFiscal.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? "" : "none";
    });

    const btnNovo = document.querySelector("[onclick='abrirModalCadastro()']");
    if (btnNovo) btnNovo.style.display = isAdmin ? "" : "none";

    const userDoc = doc(db, "usuarios", user.uid);
    const userSnap = await getDoc(userDoc);
    if (!userSnap.exists()) {
      await setDoc(userDoc, { email: user.email, uid: user.uid, criadoEm: new Date() });
    }

    await initApp();
  } else {
    document.getElementById("app").style.display = "none";
    document.getElementById("loginScreen").style.display = "flex";
  }
});

async function carregarAnalisesFirebase() {
  const q = query(collection(db, "analises"), where("criadoPor", "==", currentUser.uid));
  const snapshot = await getDocs(q);

  analises = [];

  snapshot.forEach((docSnap) => {
    analises.push({ id: docSnap.id, ...docSnap.data() });
  });
}

function renderAnalises(lista) {
  const container = document.getElementById("analisesContent");

  if (!lista.length) {
    container.innerHTML = "<p>Nenhuma análise encontrada.</p>";
    return;
  }

  container.innerHTML = lista
    .map(
      (a) => `
    <div style="background:var(--surface);padding:15px;margin-bottom:10px;border-radius:8px;border:1px solid var(--border);">
      
      <div><strong>Contrato:</strong> ${a.contratoId}</div>
      <div><strong>Decisão:</strong> ${a.decisao}</div>
      <div><strong>Status:</strong> ${a.status}</div>
      <div><strong>Justificativa:</strong> ${a.justificativa}</div>

      ${a.arquivo ? `<a href="${a.arquivo}" target="_blank">📄 Ver PDF</a>` : "Sem anexo"}

    </div>
  `,
    )
    .join("");
}

function renderArquivados() {
  const arquivados = contratos.filter((c) => c.arquivado);

  const container = document.getElementById("arquivadosContent");

  if (!arquivados.length) {
    container.innerHTML = "<p>Nenhum contrato arquivado.</p>";
    return;
  }

  container.innerHTML = arquivados
    .map((c) => {

      // 🔥 VERIFICA SE TEM ANÁLISE
      const analise = analises.find(a => a.contratoId === c.id);

      return `
    <div style="background:var(--surface);padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid var(--border);">
      
      <div style="font-weight:600;">${c.contratada}</div>
      <div style="font-size:13px;color:var(--text2);margin:5px 0;">
        ${c.objeto || ""}
      </div>

      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
        Contrato: ${c.contrato}
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;">

        ${
          analise
          ? `
        <button onclick="verAnalise('${c.id}')"
          style="padding:6px 12px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;">
          <i class="bi bi-eye"></i> Ver
        </button>
        `
          : ""
        }

        <button onclick="desarquivarContrato('${c.id}')"
          style="padding:6px 12px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;">
          <i class="bi bi-arrow-counterclockwise"></i> Desarquivar
        </button>

      </div>

    </div>
  `;
    })
    .join("");
}

// Esperar DOM carregar
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnLogin").addEventListener("click", logar);

  document.getElementById("lgPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") logar();
  });

  document.querySelector(".logout-btn").addEventListener("click", logout);
});

function diasRestantes(data) {
  if (!data) return null;
  return Math.ceil((new Date(data) - new Date()) / 86400000);
}

function logout() {
  signOut(auth);
}

function toggleSenha() {
  const input = document.getElementById("lgPass");
  const icon = document.getElementById("eyeIcon");
  if (input.type === "password") {
    input.type = "text";
    icon.className = "bi bi-eye-slash";
  } else {
    input.type = "password";
    icon.className = "bi bi-eye";
  }
}

async function logar() {
  const email = document.getElementById("lgUser").value.trim();
  const senha = document.getElementById("lgPass").value;

  const btn = document.getElementById("btnLogin");
  const btnText = document.getElementById("btnLoginText");
  const progress = document.getElementById("loginProgress");
  const bar = document.querySelector(".login-progress-bar");

  if (!email || !senha) {
    document.getElementById("lgError").textContent = "Preencha email e senha.";
    document.getElementById("lgError").style.display = "block";
    return;
  }

  try {
    btn.disabled = true;
    btnText.innerHTML =
      '<i class="bi bi-arrow-repeat spin"></i> Autenticando...';
    progress.style.display = "block";
    bar.style.width = "60%";

    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, senha);

    bar.style.width = "100%";
  } catch (error) {
    btn.disabled = false;
    btnText.innerHTML = "Entrar no Sistema";
    progress.style.display = "none";
    bar.style.width = "0%";

    document.getElementById("lgError").textContent =
      "Email ou senha inválidos.";
    document.getElementById("lgError").style.display = "block";

    console.error(error);
  }
}

/* ─── INIT ─── */
async function initApp() {
  await migrarDadosParaUsuarioSilencioso();

  await carregarContratosFirebase();
  await carregarAnalisesFirebase();

  goTo("dashboard");
}

async function migrarDadosParaUsuarioSilencioso() {
  // Migração só roda para o Marlon — dono de todos os dados legados
  if (currentUser.email !== "marlon@gmail.com") return;

  const uid = currentUser.uid;
  const storageKey = `migracaoV3_${uid}`;

  if (localStorage.getItem(storageKey)) return;

  const snapC = await getDocs(collection(db, "contratos"));
  const batchC = writeBatch(db);
  snapC.forEach((d) => {
    batchC.update(doc(db, "contratos", d.id), { userId: uid });
  });
  if (!snapC.empty) await batchC.commit();

  const snapA = await getDocs(collection(db, "analises"));
  const batchA = writeBatch(db);
  snapA.forEach((d) => {
    batchA.update(doc(db, "analises", d.id), { criadoPor: uid });
  });
  if (!snapA.empty) await batchA.commit();

  localStorage.setItem(storageKey, "1");
}

/* ─── NAVIGATION ─── */
const PAGES = {
  dashboard: {
    el: "pageDashboard",
    title: "Dashboard",
    subtitle: "Visão geral do sistema",
    nav: 0,
  },
  contratos: {
    el: "pageContratos",
    title: "Contratos",
    subtitle: "Lista de todos os contratos",
    nav: 1,
  },
  alertas: {
    el: "pageAlertas",
    title: "Alertas",
    subtitle: "Contratos próximos ao vencimento",
    nav: 2,
  },
  relatorios: {
    el: "pageRelatorios",
    title: "Relatórios",
    subtitle: "Análise e estatísticas",
    nav: 3,
  },
  exportar: {
    el: "pageExportar",
    title: "Exportar",
    subtitle: "Exporte dados do sistema",
    nav: 4,
  },

  arquivados: {
    el: "pageArquivados",
    title: "Contratos Arquivados",
    subtitle: "Contratos que foram arquivados",
    nav: 4,
  },
  usuarios: {
    el: "pageUsuarios",
    title: "Usuários",
    subtitle: "Usuários com acesso ao sistema",
    nav: -1,
  },
};

function goTo(page) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const cfg = PAGES[page];
  document.getElementById(cfg.el).classList.add("active");
  const navItems = document.querySelectorAll(".nav-item");

  if (navItems[cfg.nav]) {
    navItems[cfg.nav].classList.add("active");
  }
  document.getElementById("pageTitle").textContent = cfg.title;
  document.getElementById("pageSubtitle").textContent = cfg.subtitle;

  if (page === "dashboard") renderDashboard();
  if (page === "contratos") renderTabela();
  if (page === "alertas") renderAlertas();
  if (page === "relatorios") renderRelatorios();
  if (page === "arquivados") renderArquivados();
  if (page === "usuarios") renderUsuarios();
  updateAlertBadge();
}

/* ─── DASHBOARD ─── */
function renderDashboard() {
  const data = contratos.filter((c) => !c.arquivado);
  const hoje = new Date();

  const total = data.length;
  const ativos = data.filter((c) => c.situacao === "Ativo").length;

  const criticos = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d >= 0 && d <= 20;
  }).length;
  const aviso = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d > 20 && d <= 30;
  }).length;
  const expirados = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d < 0;
  }).length;
  const valorTotal = data.reduce((s, c) => s + Number(c.valorGlobal || 0), 0);

  // alert banner
  const bannerWrap = document.getElementById("alertBannerWrapper");
  bannerWrap.innerHTML = "";
  if (criticos > 0) {
    bannerWrap.innerHTML = `
    <div class="alert-banner">
      <span class="alert-banner-icon">
        <i class="bi bi-exclamation-octagon-fill"></i>
      </span>
      <div>
        <strong>${criticos} contrato(s) vencendo em até 20 dias!</strong>
        Verifique a aba de Alertas.
      </div>
    </div>
  `;
  }

  document.getElementById("statsGrid").innerHTML = `
  <div class="stat-card s-blue" onclick="irParaContratos('','')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-file-earmark-text"></i></div>
    <div class="stat-label">Total</div>
    <div class="stat-value">${total}</div>
    <div class="stat-sub">Contratos cadastrados</div>
  </div>

  <div class="stat-card s-green" onclick="irParaContratos('Ativo','')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-check-circle"></i></div>
    <div class="stat-label">Ativos</div>
    <div class="stat-value">${ativos}</div>
    <div class="stat-sub">${total ? Math.round((ativos / total) * 100) : 0}% do total</div>
  </div>

  <div class="stat-card s-red" onclick="irParaContratos('','critico')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-exclamation-triangle"></i></div>
    <div class="stat-label">Críticos</div>
    <div class="stat-value">${criticos}</div>
    <div class="stat-sub">≤ 20 dias para vencer</div>
  </div>

  <div class="stat-card s-yellow" onclick="irParaContratos('','aviso')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-clock"></i></div>
    <div class="stat-label">Aviso</div>
    <div class="stat-value">${aviso}</div>
    <div class="stat-sub">21 a 30 dias</div>
  </div>

  <div class="stat-card s-purple" onclick="irParaContratos('','')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-cash-stack"></i></div>
    <div class="stat-label">Valor Total</div>
    <div class="stat-value" style="font-size:18px;">R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    <div class="stat-sub">Todos os contratos</div>
  </div>

  <div class="stat-card s-cyan" onclick="irParaContratos('','expirado')" style="cursor:pointer;">
    <div class="stat-icon"><i class="bi bi-x-circle"></i></div>
    <div class="stat-label">Expirados</div>
    <div class="stat-value">${expirados}</div>
    <div class="stat-sub">Vigência vencida</div>
  </div>
`;
  updateAlertBadge();
  renderChartSituacao(data);
  renderChartVencimento(data);
  renderChartValores(data);
}

function updateAlertBadge() {
  const data = contratos.filter((c) => !c.arquivado);

  const n = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const badge = document.getElementById("alertBadge");

  if (n > 0) {
    badge.style.display = "inline-block";
    badge.textContent = n;
  } else {
    badge.style.display = "none";
  }
}

function renderChartSituacao(data) {
  const ctx = document.getElementById("chartSituacao");
  if (charts.sit) charts.sit.destroy();
  const counts = {};
  data.forEach((c) => (counts[c.situacao] = (counts[c.situacao] || 0) + 1));
  charts.sit = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(counts),
      datasets: [
        {
          data: Object.values(counts),
          backgroundColor: ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"],
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#94a3b8", font: { family: "Sora" } } },
      },
      animation: { animateScale: true },
    },
  });
}

function renderChartVencimento(data) {
  const ctx = document.getElementById("chartVencimento");
  if (charts.venc) charts.venc.destroy();
  const months = {};
  data.forEach((c) => {
    if (!c.vigFinal) return;
    const m = c.vigFinal.substring(0, 7);
    months[m] = (months[m] || 0) + 1;
  });
  const sorted = Object.keys(months).sort();
  charts.venc = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map((m) => {
        const [y, mo] = m.split("-");
        return new Date(y, mo - 1).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        });
      }),
      datasets: [
        {
          label: "Contratos",
          data: sorted.map((m) => months[m]),
          backgroundColor: "rgba(59,130,246,0.6)",
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { display: false } },
        y: {
          ticks: { color: "#64748b" },
          grid: { color: "rgba(0,0,0,0.07)" },
        },
      },
    },
  });
}

function renderChartValores(data) {
  const ctx = document.getElementById("chartValores");
  if (charts.val) charts.val.destroy();
  const years = {};
  data.forEach((c) => {
    if (!c.vigInicial) return;
    const y = c.vigInicial.substring(0, 4);
    years[y] = (years[y] || 0) + Number(c.valorGlobal || 0);
  });
  const sorted = Object.keys(years).sort();
  charts.val = new Chart(ctx, {
    type: "line",
    data: {
      labels: sorted,
      datasets: [
        {
          label: "Valor (R$)",
          data: sorted.map((y) => years[y]),
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6,182,212,0.08)",
          fill: true,
          tension: 0.4,
          pointBackgroundColor: "#06b6d4",
          pointRadius: 5,
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#94a3b8" } } },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { display: false } },
        y: {
          ticks: {
            color: "#64748b",
            callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR"),
          },
          grid: { color: "rgba(0,0,0,0.07)" },
        },
      },
    },
  });
}

window.toggleFiscaisDropdown = function() {
  const lista = document.getElementById("fFiscaisLista");
  const chevron = document.getElementById("fFiscaisChevron");
  const aberto = lista.style.display === "flex";
  lista.style.display = aberto ? "none" : "flex";
  lista.style.flexDirection = "column";
  chevron.className = aberto ? "bi bi-chevron-down" : "bi bi-chevron-up";
};

function atualizarResumoFiscais() {
  const marcados = Array.from(document.querySelectorAll("#fFiscaisLista input[type=checkbox]:checked"));
  const resumo = document.getElementById("fFiscaisResumo");
  if (!resumo) return;
  resumo.textContent = marcados.length
    ? marcados.map(el => el.dataset.nome).join(", ")
    : "Selecionar fiscais...";
}

window.irParaContratos = function(situacao, alerta) {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterSituacao").value = situacao || "";
  document.getElementById("filterAlerta").value = alerta || "";
  currentPage = 1;
  goTo("contratos");
};

/* ─── TABELA ─── */
function renderTabela() {
  let data = contratos.filter((c) => !c.arquivado);
  const search = document.getElementById("searchInput").value.toLowerCase();
  const sit = document.getElementById("filterSituacao").value;
  const alerta = document.getElementById("filterAlerta").value;

  if (search) {
    data = data.filter((c) => {
      const texto = [
        c.processo,
        c.contrato,
        c.contratada,
        c.cnpj,
        c.objeto,
        c.setor,
        c.modalidade,
        c.responsavel,
        c.situacao,
      ]
        .join(" ")
        .toLowerCase();

      return texto.includes(search);
    });
  }

  if (sit) data = data.filter((c) => c.situacao === sit);
  if (alerta) {
    data = data.filter((c) => {
      const d = diasRestantes(c.vigFinal);
      if (alerta === "critico")  return d !== null && d >= 0 && d <= 20;
      if (alerta === "aviso")    return d !== null && d > 20 && d <= 30;
      if (alerta === "ok")       return d !== null && d > 30;
      if (alerta === "expirado") return d !== null && d < 0;
      return true;
    });
  }

  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (currentPage > pages) currentPage = 1;
  const slice = data.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  const tbody = document.getElementById("tabelaBody");

  if (!slice.length) {
    tbody.innerHTML = `
<tr>
  <td colspan="8">
    <div class="empty-state">
      <div class="empty-icon">
        <i class="bi bi-search"></i>
      </div>
      <p>Nenhum contrato encontrado.</p>
    </div>
  </td>
</tr>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  tbody.innerHTML = slice
    .map((c) => {
      const realIdx = c.id;
      const d = diasRestantes(c.vigFinal);
      let diasClass = "dias-ok",
        diasLabel = d !== null ? d + " dias" : "—";
      if (d === null) {
        diasClass = "dias-expirado";
        diasLabel = "—";
      } else if (d < 0) {
        diasClass = "dias-expirado";
        diasLabel = "Expirado";
      } else if (d <= 20) diasClass = "dias-critico";
      else if (d <= 30) diasClass = "dias-aviso";

      const sitBadge =
        {
          Ativo: "badge-green",
          Finalizado: "badge-gray",
          Aditivado: "badge-blue",
          Suspenso: "badge-yellow",
        }[c.situacao] || "badge-gray";

      return `<tr>

  <td>${c.processo || "—"}</td>

  <td>
    <span style="font-family:var(--mono);font-size:12px;">
      ${c.contrato || "—"}
    </span>
  </td>

  <td class="col-responsavel">
  ${c.responsavel || "—"}
</td>

  <td>${c.contratada || "—"}</td>

  <td style="font-family:var(--mono);font-size:12px;">
    ${formatarDocumento(c.cnpj)}
  </td>

  <td style="max-width:200px;">
    ${c.objeto || "—"}
  </td>

  <td>${c.setor || "—"}</td>

  <td>${c.modalidade || "—"}</td>

  <td>
    ${
      c.vigInicial
        ? new Date(c.vigInicial + "T12:00:00").toLocaleDateString("pt-BR")
        : "—"
    }
  </td>

  <td>
    ${
      c.vigFinal
        ? new Date(c.vigFinal + "T12:00:00").toLocaleDateString("pt-BR")
        : "—"
    }
  </td>

  <td>
    R$ ${Number(c.valorGlobal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
  </td>

  <td>
    <span class="badge ${sitBadge}">
      ${c.situacao}
    </span>
  </td>

  <td>
    <div style="display:flex;flex-direction:row;gap:4px;justify-content:center;">
      <button class="btn-icon btn-view" title="Ver detalhes" onclick="verDetalhe('${realIdx}')"><i class="bi bi-eye"></i></button>
      ${isAdmin ? `
      <button class="btn-icon btn-edit" title="Editar" onclick="editarContrato('${realIdx}')"><i class="bi bi-pencil"></i></button>
      <button class="btn-icon btn-danger-sm" title="Excluir" onclick="excluirContrato('${realIdx}')"><i class="bi bi-trash"></i></button>
      ` : ""}
    </div>
  </td>

</tr>`;
    })
    .join("");

  // pagination
  const pg = document.getElementById("pagination");
  pg.innerHTML = `<button class="pg-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}>‹</button>`;
  for (let i = 1; i <= pages; i++)
    pg.innerHTML += `<button class="pg-btn ${i === currentPage ? "active" : ""}" onclick="changePage(${i})">${i}</button>`;
  pg.innerHTML += `<button class="pg-btn" onclick="changePage(${currentPage + 1})" ${currentPage === pages ? "disabled" : ""}>›</button>`;
  pg.innerHTML += `<span style="font-size:12px;color:var(--text2);margin-left:8px;">${total} registro(s)</span>`;
}

function changePage(p) {
  const data = contratos;
  const pages = Math.max(1, Math.ceil(data.length / PER_PAGE));
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderTabela();
}

window.imprimirContratos = function () {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const situacao = document.getElementById("filterSituacao").value;

  let data = [...contratos];

  if (search) {
    data = data.filter((c) =>
      Object.values(c).join(" ").toLowerCase().includes(search),
    );
  }

  if (situacao) {
    data = data.filter((c) => c.situacao === situacao);
  }

  const linhas = data
    .map(
      (c) => `
    <tr>
      <td>${c.processo || "-"}</td>
      <td>${c.contrato || "-"}</td>
      <td>${c.responsavel || "-"}</td>
      <td>${c.contratada || "-"}</td>
      <td>${c.cnpj || "-"}</td>
      <td>${c.objeto || "-"}</td>
      <td>${c.setor || "-"}</td>
      <td>${c.modalidade || "-"}</td>
      <td>${c.vigInicial || "-"}</td>
      <td>${c.vigFinal || "-"}</td>
    </tr>
  `,
    )
    .join("");

  const dataAtual = new Date().toLocaleDateString("pt-BR");

  const w = window.open("", "_blank");

  w.document.write(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Contrato</title>

<style>
  body{
    font-family: Arial;
    font-size: 12px;
    margin: 20px;
  }

  .header{
    text-align: center;
    margin-bottom: 20px;
  }

  .header img{
    width: 60px;
    margin-bottom: 5px;
  }

  .titulo{
    font-weight: bold;
    text-align: center;
    margin: 15px 0;
  }

  table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
  table-layout: fixed; /* ESSENCIAL */
}

th, td {
  border:1px solid #000;
  padding:6px;
  font-size:11px;
  word-wrap: break-word;
}

th:nth-child(6), td:nth-child(6){ width: 200px; } /* Objeto maior */
th:nth-child(7), td:nth-child(7){ width: 80px; }  /* Setor menor */
th:nth-child(5), td:nth-child(5){ width: 120px; } /* CNPJ */


  .texto{
    margin: 15px 0;
    text-align: justify;
    line-height: 1.5;
  }

  table{
    width:100%;
    border-collapse: collapse;
    margin-top: 15px;
  }

  th, td{
    border:1px solid #000;
    padding:6px;
    font-size:11px;
  }

  th{
    background:#eee;
  }

  .footer{
    margin-top: 40px;
    text-align: right;
  }
</style>

</head>

<body>

<div class="header">
  <img src="img/prefeitura.png">
  <div><strong>Prefeitura Municipal de Oriximiná</strong></div>
  <div>Secretaria Municipal de Finanças e Desenvolvimento Financeiro</div>
</div>

<div class="titulo">
  RELATÓRIO DE CONTRATOS
  <div class="subtitulo">(por fiscais)</div>
</div>

<table>
  <thead>
    <tr>
      <th>Processo</th>
      <th>Contrato</th>
      <th>Fiscal</th>
      <th>Contratada</th>
      <th>CNPJ/CPF</th>
      <th>Objeto</th>
      <th>Setor</th>
      <th>Modalidade</th>
      <th>Vig. Inicial</th>
      <th>Vig. Final</th>
    </tr>
  </thead>
  <tbody>
    ${linhas}
  </tbody>
</table>

<div class="footer">
  Oriximiná - PA, ${dataAtual}
</div>

<script>
  window.onload = function(){
    window.print();
  }
</script>

</body>
</html>
  `);

  w.document.close();
};

window.gerarNotificacaoContrato = function (id) {
  const c = contratos.find((x) => x.id === id);

  if (!c) {
    alert("Contrato não encontrado");
    return;
  }

  const dataAtual = new Date().toLocaleDateString("pt-BR");

  const w = window.open("", "_blank");

  w.document.write(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Notificação</title>

<style>
 @page {
    size: A4 portrait;
    margin: 20mm;
  }

  body{
    font-family: Arial;
    font-size: 12px;
    margin: 20px;
  }

  .header{
    text-align:center;
    margin-bottom:20px;
  }

  .header img{
    width:60px;
  }

  .titulo{
    text-align:center;
    font-weight:bold;
    margin:15px 0;
    font-size:16px;
  }

  .texto{
    margin:15px 0;
    text-align:justify;
  }

  table{
    width:100%;
    border-collapse: collapse;
    margin-top:15px;
  }

  th, td{
    border:1px solid #000;
    padding:6px;
    font-size:11px;
  }

  th{
    background:#eee;
  }

  .footer{
    margin-top:40px;
    text-align:right;
  }

</style>
</head>

<body>

<div class="header">
  <img src="img/prefeitura.png">
  <div><strong>Prefeitura Municipal de Oriximiná</strong></div>
  <div>Secretaria Municipal de Finanças e Desenvolvimento Financeiro</div>
</div>

<div class="titulo">
  NOTIFICAÇÃO DE FIM DE VIGÊNCIA CONTRATUAL
</div>

<div class="texto">
  Considerando o encerramento da vigência do contrato abaixo relacionado,
  solicita-se a manifestação do fiscal responsável quanto à necessidade de aditivo.
</div>

<table>
  <thead>
    <tr>
      <th>Processo</th>
      <th>Contrato</th>
      <th>Fiscal</th>
      <th>Contratada</th>
      <th>CNPJ</th>
      <th>Objeto</th>
      <th>Setor</th>
      <th>Modalidade</th>
      <th>Vig. Inicial</th>
      <th>Vig. Final</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${c.processo || "-"}</td>
      <td>${c.contrato || "-"}</td>
      <td>${c.responsavel || "-"}</td>
      <td>${c.contratada || "-"}</td>
      <td>${c.cnpj || "-"}</td>
      <td>${c.objeto || "-"}</td>
      <td>${c.setor || "-"}</td>
      <td>${c.modalidade || "-"}</td>
      <td>${c.vigInicial || "-"}</td>
      <td>${c.vigFinal || "-"}</td>
    </tr>
  </tbody>
</table>

<div class="footer">
  Oriximiná - PA, ${dataAtual}
</div>

<script>
  window.onload = function(){
    window.print();
  }
</script>

</body>
</html>
  `);

  w.document.close();
};

window.excluirContrato = function(id) {
  const c = contratos.find(x => x.id === id);
  document.getElementById("modalExclusaoNome").textContent =
    c?.contrato ? `Contrato: ${c.contrato} — ${c.contratada}` : "Esta ação não pode ser desfeita.";
  document.getElementById("btnConfirmarExclusao").onclick = () => confirmarExclusao(id);
  abrirModal("modalConfirmarExclusao");
};

async function confirmarExclusao(id) {
  fecharModal("modalConfirmarExclusao");
  try {
    const c = contratos.find(x => x.id === id);
    await deleteDoc(doc(db, "contratos", id));
    await registrarHistorico("Excluiu contrato", c?.contrato || id);

    toast("Contrato excluído com sucesso.", "success");

    carregarContratosFirebase();
  } catch (error) {
    console.error(error);
    toast("Erro ao excluir contrato.", "error");
  }
}

function renderAlertas() {
  const container = document.getElementById("alertasContent");

  container.innerHTML = ""; // 🔥 LIMPA ANTES

  const data = contratos.filter((c) => !c.arquivado);

  const criticos = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d >= 0 && d <= 20;
  });

  const aviso = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d > 20 && d <= 30;
  });

  const expirados = data.filter((c) => {
    const d = diasRestantes(c.vigFinal);
    return d !== null && d < 0;
  });

  let html = "";

  // Estado vazio
  if (!criticos.length && !aviso.length && !expirados.length) {
    html = `
      <div class="empty-state" style="padding:60px 0;">
        <div class="empty-icon">
          <i class="bi bi-check-circle-fill"></i>
        </div>
        <p>Nenhum contrato requer atenção no momento.</p>
      </div>
    `;
  }

  // Seções
  if (criticos.length)
    html += buildAlertSection(
      `<i class="bi bi-exclamation-octagon-fill"></i> Contratos Críticos (Vencendo em ≤ 20 dias)`,
      criticos,
      "danger",
    );

  if (aviso.length)
    html += buildAlertSection(
      `<i class="bi bi-exclamation-triangle-fill"></i> Contratos em Aviso (21-30 dias)`,
      aviso,
      "warning",
    );

  if (expirados.length)
    html += buildAlertSection(
      `<i class="bi bi-x-circle-fill"></i> Contratos Expirados`,
      expirados,
      "expired",
    );

  document.getElementById("alertasContent").innerHTML = html;
}

function buildAlertSection(title, items, type) {
  const colors = {
    danger: "var(--danger)",
    warning: "var(--warning)",
    expired: "var(--text3)",
  };

  const rows = items
    .map((c) => {
      const d = diasRestantes(c.vigFinal);

      // 🔥 AQUI É O PONTO CHAVE
      const analise = analises.find(a => a.contratoId === c.id);

      return `
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border);">

  <!-- ESQUERDA -->
  <div style="flex:1;min-width:0;">
    
    <div style="font-weight:600;font-size:13px;">
      ${c.contratada || "—"} 
      <span style="font-family:var(--mono);font-size:11px;color:var(--text2);">
        [${c.contrato || ""}]
      </span>
    </div>

    <div style="font-size:12px;color:var(--text2);margin-top:2px;">
      ${c.objeto || ""} ${c.setor ? " • " + c.setor : ""}
    </div>

    <!-- 🔥 BOTÕES -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">

      <button
        onclick="gerarNotificacaoContrato('${c.id}')"
        style="padding:5px 10px;font-size:11px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:600;">
        <i class="bi bi-share-fill"></i>
        Compartilhar
      </button>

      <button
        onclick="abrirAnalise('${c.id}')"
        style="padding:5px 10px;font-size:11px;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:600;">
        <i class="bi bi-folder2-open"></i>
        Análise
      </button>

      <button
        onclick="arquivarContrato('${c.id}')"
        style="padding:5px 10px;font-size:11px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:600;">
        <i class="bi bi-archive"></i>
        Arquivar
      </button>

      ${
        analise
          ? `
      <button
        onclick="verAnalise('${c.id}')"
        style="padding:5px 10px;font-size:11px;background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:600;">
        <i class="bi bi-eye"></i>
        Ver Análise
      </button>
      `
          : ""
      }

    </div>

  </div>

  <!-- DIREITA -->
  <div style="text-align:right;margin-left:10px;">
    <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${colors[type]};">
      ${d < 0 ? "Expirado há " + Math.abs(d) + " dias" : d + " dias restantes"}
    </div>

    <div style="font-size:11px;color:var(--text2);">
      ${
        c.vigFinal
          ? new Date(c.vigFinal + "T12:00:00").toLocaleDateString("pt-BR")
          : ""
      }
    </div>
  </div>

</div>`;
    })
    .join("");

  return `
<div style="margin-bottom:24px;">
  <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:${colors[type]};">
    ${title}
  </h3>

  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
    ${rows}
  </div>
</div>`;
}

/* ─── RELATÓRIOS ─── */
function renderRelatorios() {
  const data = contratos.filter((c) => !c.arquivado);
  const aditivados = data.filter((c) => c.situacao === "Aditivado").length;
  const suspensos = data.filter((c) => c.situacao === "Suspenso").length;
  const finalizados = data.filter((c) => c.situacao === "Finalizado").length;
  const mediaValor = data.length
    ? data.reduce((s, c) => s + Number(c.valorGlobal || 0), 0) / data.length
    : 0;

  document.getElementById("relStats").innerHTML = `
  <div class="stat-card s-blue">
    <div class="stat-icon">
      <i class="bi bi-arrow-repeat"></i>
    </div>
    <div class="stat-label">Aditivados</div>
    <div class="stat-value">${aditivados}</div>
  </div>

  <div class="stat-card s-green">
    <div class="stat-icon">
      <i class="bi bi-flag-fill"></i>
    </div>
    <div class="stat-label">Finalizados</div>
    <div class="stat-value">${finalizados}</div>
  </div>

  <div class="stat-card s-yellow">
    <div class="stat-icon">
      <i class="bi bi-pause-circle-fill"></i>
    </div>
    <div class="stat-label">Suspensos</div>
    <div class="stat-value">${suspensos}</div>
  </div>

  <div class="stat-card s-purple">
    <div class="stat-icon">
      <i class="bi bi-bar-chart-fill"></i>
    </div>
    <div class="stat-label">Valor Médio</div>
    <div class="stat-value" style="font-size:16px;">
      R$ ${mediaValor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
    </div>
  </div>
`;

  // Chart setor
  const setores = {};
  data.forEach(
    (c) =>
      (setores[c.setor || "Não informado"] =
        (setores[c.setor || "Não informado"] || 0) + 1),
  );
  const ctxSt = document.getElementById("chartSetor");
  if (charts.setor) charts.setor.destroy();
  charts.setor = new Chart(ctxSt, {
    type: "bar",
    data: {
      labels: Object.keys(setores),
      datasets: [
        {
          label: "Contratos",
          data: Object.values(setores),
          backgroundColor: "rgba(139,92,246,0.6)",
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#64748b" },
          grid: { color: "rgba(0,0,0,0.07)" },
        },
        y: { ticks: { color: "#64748b" }, grid: { display: false } },
      },
    },
  });

  // Top 10
  const top10 = [...data]
    .sort((a, b) => Number(b.valorGlobal) - Number(a.valorGlobal))
    .slice(0, 10);
  const ctxTop = document.getElementById("chartTop10");
  if (charts.top10) charts.top10.destroy();
  charts.top10 = new Chart(ctxTop, {
    type: "bar",
    data: {
      labels: top10.map(
        (c) => c.contratada?.split(" ").slice(0, 2).join(" ") || "?",
      ),
      datasets: [
        {
          label: "Valor (R$)",
          data: top10.map((c) => Number(c.valorGlobal || 0)),
          backgroundColor: "rgba(6,182,212,0.6)",
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "x",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR"),
          },
          grid: { color: "rgba(0,0,0,0.07)" },
        },
        y: { ticks: { color: "#64748b" }, grid: { display: false } },
      },
    },
  });
}

function abrirAnalise(id) {
  const c = contratos.find((x) => x.id === id);

  contratoSelecionado = id;

  document.getElementById("modalAnaliseBody").innerHTML = `
    
    <div class="analise-header">
      <img src="img/prefeitura.png" class="analise-logo">
      <div class="analise-header-text">
        <strong>Prefeitura Municipal de Oriximiná</strong>
        <span>Secretaria Municipal de Finanças</span>
      </div>
    </div>

    <div class="analise-title">
      ANÁLISE DE CONTRATO
    </div>

    <!-- 🔥 BLOCO COMPLETO -->
    <div class="analise-info">
      <div><span>Processo:</span> ${c.processo || "-"}</div>
      <div><span>Contrato:</span> ${c.contrato}</div>
      <div><span>Contratada:</span> ${c.contratada}</div>
      <div><span>Setor:</span> ${c.setor || "-"}</div>
      <div><span>Vigência:</span> ${c.vigInicial || "-"} até ${c.vigFinal || "-"}</div>

      <div class="objeto">
        <span>Objeto:</span>
        <p>${c.objeto || "Não informado"}</p>
      </div>
    </div>

    <div class="analise-form">

      <label>Decisão</label>
      <select id="decisao" class="input">
        <option value="renovar">Renovar</option>
        <option value="encerrar">Encerrar</option>
      </select>

      <label>Justificativa</label>
      <textarea id="justificativa" class="input textarea"></textarea>

      <label>Anexo</label>
      <input type="file" id="anexo" class="input-file">

      <button onclick="salvarAnalise()" class="btn-primary">
        Salvar Análise
      </button>

    </div>
  `;

  abrirModal("modalAnalise");
}

async function salvarAnalise() {
  const fileInput = document.getElementById("anexo");
  const file = fileInput.files[0];
  const decisao = document.getElementById("decisao").value;
  const justificativa = document.getElementById("justificativa").value;

  let statusFinal = "";

  if (decisao === "renovar") {
    statusFinal = "em renovação";
  } else if (decisao === "encerrar") {
    statusFinal = "encerrado";
  }

  if (!contratoSelecionado) {
    alert("Contrato não definido");
    return;
  }

  let fileURL = null;

  try {
    // 🔥 SE TIVER ARQUIVO → FAZ UPLOAD
    if (file) {
      const storage = getStorage();

      const fileRef = ref(
        storage,
        `analises/${contratoSelecionado}/${Date.now()}_${file.name}`,
      );

      await uploadBytes(fileRef, file);

      fileURL = await getDownloadURL(fileRef);
    }

    // 🔥 SALVA NO FIRESTORE
    await addDoc(collection(db, "analises"), {
      contratoId: contratoSelecionado,
      decisao,
      justificativa,
      arquivo: fileURL, // agora existe
      status: statusFinal,
      criadoEm: new Date(),
      criadoPor: currentUser.uid,
    });

    toast("Análise salva com sucesso!", "success");
    fecharModal("modalAnalise");
  } catch (error) {
    console.error(error);
    toast("Erro ao salvar análise.", "error");
  }
}

async function arquivarContrato(id) {
  try {
    const contratoRef = doc(db, "contratos", id);

    await updateDoc(contratoRef, {
      arquivado: true,
    });

    const ca = contratos.find(x => x.id === id);
    await registrarHistorico("Arquivou contrato", ca?.contrato || id);
    toast("Contrato arquivado!", "success");

    await carregarContratosFirebase();
    await carregarAnalisesFirebase();

    renderAlertas();
    renderArquivados();

  } catch (error) {
    console.error(error);
    toast("Erro ao arquivar.", "error");
  }
}

async function desarquivarContrato(id) {
  try {
    const contratoRef = doc(db, "contratos", id);

    await updateDoc(contratoRef, {
      arquivado: false,
    });

    const cd = contratos.find(x => x.id === id);
    await registrarHistorico("Desarquivou contrato", cd?.contrato || id);
    toast("Contrato desarquivado!", "success");

    await carregarContratosFirebase();

    renderAlertas();
    renderArquivados();
  } catch (error) {
    console.error(error);
    toast("Erro ao desarquivar.", "error");
  }
}
/* ─── CADASTRO ─── */
async function abrirModalCadastro() {
  editingIndex = null;

  document.getElementById("modalCadTitle").textContent = "Novo Contrato";
  document.getElementById("btnSalvarModal").textContent = "Salvar Contrato";

  [
    "fProcesso",
    "fContrato",
    "fContratada",
    "fCNPJ",
    "fObjeto",
    "fVigInicial",
    "fVigFinal",
    "fValor",
    "fResponsavel",
    "fObs",
  ].forEach((id) => (document.getElementById(id).value = ""));

  document.getElementById("fSituacao").value = "Ativo";
  document.getElementById("fModalidade").value = "Pregão Eletrônico";
  document.getElementById("fSetor").value = "";

  await popularDropdownFiscais();
  abrirModal("modalCad");
}

async function editarContrato(id) {
  editingIndex = id;

  const data = contratos;
  const c = data.find((x) => x.id === id);

  if (!c) {
    toast("Contrato não encontrado.", "error");
    return;
  }

  document.getElementById("modalCadTitle").textContent = "Editar Contrato";
  document.getElementById("btnSalvarModal").textContent = "Atualizar Contrato";

  document.getElementById("fProcesso").value = c.processo || "";
  document.getElementById("fContrato").value = c.contrato || "";
  document.getElementById("fContratada").value = c.contratada || "";
  document.getElementById("fCNPJ").value = formatarDocumento(c.cnpj);
  document.getElementById("fObjeto").value = c.objeto || "";
  document.getElementById("fVigInicial").value = c.vigInicial || "";
  document.getElementById("fVigFinal").value = c.vigFinal || "";
  document.getElementById("fValor").value = c.valorGlobal || "";
  document.getElementById("fSituacao").value = c.situacao || "Ativo";
  document.getElementById("fModalidade").value =
    c.modalidade || "Pregão Eletrônico";
  document.getElementById("fSetor").value = c.setor || "Secretaria de Saúde";
  document.getElementById("fResponsavel").value = c.responsavel || "";
  document.getElementById("fObs").value = c.obs || "";

  await popularDropdownFiscais(c.fiscaisIds || []);
  abrirModal("modalCad");
}

async function salvarContrato() {
  const contrato = document.getElementById("fContrato").value.trim();
  const contratada = document.getElementById("fContratada").value.trim();

  if (!contrato || !contratada) {
    toast("Preencha pelo menos Nº Contrato e Contratada.", "warning");
    return;
  }

  const obj = {
    processo: document.getElementById("fProcesso").value.trim(),
    contrato,
    contratada,
    cnpj: document.getElementById("fCNPJ").value.replace(/\D/g, ""),
    objeto: document.getElementById("fObjeto").value.trim(),
    vigInicial: document.getElementById("fVigInicial").value,
    vigFinal: document.getElementById("fVigFinal").value,
    valorGlobal:
      Number(document.getElementById("fValor").value.replace(/\D/g, "")) / 100,
    situacao: document.getElementById("fSituacao").value,
    modalidade: document.getElementById("fModalidade").value,
    setor: document.getElementById("fSetor").value,
    responsavel: document.getElementById("fResponsavel").value.trim(),
    obs: document.getElementById("fObs").value.trim(),
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: currentUser.uid,
    fiscaisIds: Array.from(document.querySelectorAll("#fFiscaisLista input[type=checkbox]:checked")).map(el => el.value),
    fiscaisNomes: Array.from(document.querySelectorAll("#fFiscaisLista input[type=checkbox]:checked")).map(el => el.dataset.nome),
  };

  try {
    if (editingIndex !== null) {
      const contratoRef = doc(db, "contratos", editingIndex);
      await updateDoc(contratoRef, {
        ...obj,
        updatedAt: new Date(),
      });

      await registrarHistorico("Editou contrato", obj.contrato || obj.contratada);
      toast("Contrato atualizado com sucesso!", "success");
    } else {
      await addDoc(collection(db, "contratos"), obj);

      await registrarHistorico("Criou contrato", obj.contrato || obj.contratada);
      toast("Contrato cadastrado com sucesso!", "success");
    }

    fecharModal("modalCad");
    carregarContratosFirebase();
  } catch (error) {
    console.error(error);
    toast("Erro ao salvar no Firebase.", "error");
  }
}

async function carregarContratosFirebase() {
  const isAdmin = currentUser.email === "marlon@gmail.com";
  const q = isAdmin
    ? query(collection(db, "contratos"), where("userId", "==", currentUser.uid))
    : query(collection(db, "contratos"), where("fiscaisIds", "array-contains", currentUser.uid));
  const querySnapshot = await getDocs(q);

  contratos = [];

  querySnapshot.forEach((docSnap) => {
    contratos.push({ id: docSnap.id, ...docSnap.data() });
  });

  // 🔥 ESSENCIAL
  await carregarAnalisesFirebase();


}

async function uploadPDF(blob, contratoId) {
  const storage = getStorage();

  const fileRef = ref(storage, `analises/${contratoId}/${Date.now()}.pdf`);

  await uploadBytes(fileRef, blob);

  const url = await getDownloadURL(fileRef);

  return url;
}

/* ─── DETALHE ─── */
function verDetalhe(id) {
  const data = contratos;
  const c = data.find((x) => x.id === id);

  if (!c) {
    toast("Contrato não encontrado.", "error");
    return;
  }

  const d = diasRestantes(c.vigFinal);
  let diasHtml = "—";

  if (d !== null)
    diasHtml =
      d < 0
        ? `<span style="color:var(--text3)">Expirado há ${Math.abs(d)} dias</span>`
        : `<span style="color:${d <= 20 ? "#dc2626" : d <= 30 ? "#d97706" : "#16a34a"}">${d} dias restantes</span>`;

  document.getElementById("modalDetalheBody").innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Nº Processo</span>
      <span class="detail-value">${c.processo || "—"}</span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Nº Contrato</span>
      <span class="detail-value">${c.contrato || "—"}</span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Contratada</span>
      <span class="detail-value"><strong>${c.contratada || "—"}</strong></span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Valor Global</span>
      <span class="detail-value">
        R$ ${Number(c.valorGlobal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
      </span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Prazo</span>
      <span class="detail-value">${diasHtml}</span>
    </div>
  `;

  const btnEdit = document.getElementById("btnEditDetalhe");
  if (btnEdit) {
    btnEdit.style.display = isAdmin ? "" : "none";
    btnEdit.onclick = () => { fecharModal("modalDetalhe"); editarContrato(id); };
  }

  abrirModal("modalDetalhe");
}

/* ─── EXPORT ─── */
function getFilteredExport() {
  let data = contratos;

  const sit = document.getElementById("expSituacao").value;
  const prazo = document.getElementById("expPrazo").value;
  const mes = document.getElementById("expMes").value;

  if (sit) {
    data = data.filter((c) => c.situacao === sit);
  }

  if (prazo) {
    data = data.filter((c) => {
      const d = diasRestantes(c.vigFinal);

      if (prazo === "critico") return d !== null && d >= 0 && d <= 20;
      if (prazo === "aviso") return d !== null && d > 20 && d <= 30;
      if (prazo === "expirado") return d !== null && d < 0;

      return true;
    });
  }

  // 🔥 NOVO FILTRO POR MÊS
  if (mes) {
    data = data.filter((c) => {
      if (!c.vigFinal) return false;
      return c.vigFinal.substring(5, 7) === mes;
    });
  }

  return data;
}

function exportarCSV() {
  const data = getFilteredExport();
  if (!data.length) {
    toast("Nenhum dado para exportar.", "warning");
    return;
  }
  const headers = [
    "Processo",
    "Contrato",
    "Contratada",
    "CNPJ",
    "Objeto",
    "Setor",
    "Modalidade",
    "Vigência Inicial",
    "Vigência Final",
    "Valor Global",
    "Situação",
    "Responsável",
  ];
  const rows = data.map((c) =>
    [
      c.processo,
      c.contrato,
      c.contratada,
      c.cnpj,
      c.objeto,
      c.setor,
      c.modalidade,
      c.vigInicial,
      c.vigFinal,
      c.valorGlobal,
      c.situacao,
      c.responsavel,
    ]
      .map((v) => `"${(v || "").toString().replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `contratos_oriximina_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast(`CSV exportado com ${data.length} registro(s).`, "success");
}

function exportarHTML() {
  const data = getFilteredExport();
  if (!data.length) {
    toast("Nenhum dado para exportar.", "warning");
    return;
  }
  const rows = data
    .map(
      (c) => `<tr>
    <td>${c.contrato || ""}</td>
    <td>${c.contratada || ""}</td>
    <td>${c.objeto || ""}</td>
    <td>${c.setor || ""}</td>
    <td>${c.vigFinal ? new Date(c.vigFinal + "T12:00:00").toLocaleDateString("pt-BR") : ""}</td>
    <td>R$ ${Number(c.valorGlobal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
    <td>${c.situacao || ""}</td>
  </tr>`,
    )
    .join("");
  const w = window.open("", "_blank");
  w.document.write(
    `<html><head><title>Contratos - Oriximiná</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;font-size:12px;}th{background:#1e3a8a;color:white;}tr:nth-child(even){background:#f5f5f5;}h2{color:#1e3a8a;}</style></head><body><h2>Prefeitura de Oriximiná - Gestão de Contratos</h2><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p><table><thead><tr><th>Contrato</th><th>Contratada</th><th>Objeto</th><th>Setor</th><th>Venc.</th><th>Valor</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></body></html>`,
  );
  w.print();
}

function verAnalise(contratoId) {
  const analise = analises.find(a => a.contratoId === contratoId);

  if (!analise) {
    alert("Nenhuma análise encontrada");
    return;
  }

  document.getElementById("modalAnaliseBody").innerHTML = `
    
    <div class="analise-header">
      <img src="img/prefeitura.png" class="analise-logo">
      <div class="analise-title">
        Prefeitura Municipal de Oriximiná
        <span>Análise de Contrato</span>
      </div>
    </div>

    <div class="analise-card">
      
      <div class="analise-row">
        <span>Status</span>
        <strong class="status">${analise.status}</strong>
      </div>

      <div class="analise-row">
        <span>Decisão</span>
        <strong>${analise.decisao}</strong>
      </div>

      <div class="analise-row column">
        <span>Justificativa</span>
        <div class="justificativa">
          ${analise.justificativa || "Não informada"}
        </div>
      </div>

      ${
        analise.arquivo 
        ? `
        <a href="${analise.arquivo}" target="_blank" class="btn-anexo">
          <i class="bi bi-file-earmark-pdf"></i>
          Abrir Anexo
        </a>
        `
        : `<div class="sem-anexo">Nenhum anexo enviado</div>`
      }

    </div>
  `;

  abrirModal("modalAnalise");
}

/* ─── MODAIS ─── */
function abrirModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}
function fecharModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) fecharModal(e.target.id);
});

/* ─── TOAST ─── */
function toast(msg, type = "info") {
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const div = document.createElement("div");
  div.className = `toast-item ${type}`;
  div.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ️"}</span><div class="toast-text"><strong>${msg}</strong></div><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  document.getElementById("toast").appendChild(div);
  setTimeout(
    () => (div.style.animation = "toastIn .3s reverse forwards"),
    3700,
  );
  setTimeout(() => div.remove(), 4000);
}

function getFutureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatarDocumento(doc) {
  if (!doc) return "-";

  doc = doc.replace(/\D/g, "");

  if (doc.length === 11) {
    return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (doc.length === 14) {
    return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return doc;
}

const campoDoc = document.getElementById("fCNPJ");

campoDoc.addEventListener("input", function (e) {
  let v = e.target.value.replace(/\D/g, "");

  if (v.length <= 11) {
    // CPF
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // CNPJ
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
  }

  e.target.value = v;
});

document.getElementById("fValor").addEventListener("input", function (e) {
  let v = e.target.value.replace(/\D/g, "");

  v = (Number(v) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  e.target.value = v;
});

// 🔓 Expor funções globais (necessário porque o script é module)
window.logar = logar;
window.logout = logout;
window.toggleSenha = toggleSenha;

window.goTo = goTo;
window.changePage = changePage;

window.renderTabela = renderTabela;

window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.abrirModalCadastro = abrirModalCadastro;

window.editarContrato = editarContrato;
window.excluirContrato = excluirContrato;
window.verDetalhe = verDetalhe;
window.salvarContrato = salvarContrato;

window.exportarCSV = exportarCSV;
async function popularDropdownFiscais(selecionados = []) {
  const isAdmin = currentUser.email === "marlon@gmail.com";
  const campo = document.getElementById("campoFiscalVinculado");
  const lista = document.getElementById("fFiscaisLista");
  if (!campo || !lista) return;

  if (!isAdmin) { campo.style.display = "none"; return; }
  campo.style.display = "block";

  const snap = await getDocs(collection(db, "usuarios"));
  const fiscais = [];
  snap.forEach(d => {
    const u = d.data();
    if (u.email !== currentUser.email) fiscais.push(u);
  });

  if (!fiscais.length) {
    lista.innerHTML = `<span style="font-size:12px;color:var(--text2);padding:4px;">Nenhum fiscal cadastrado.</span>`;
    return;
  }

  const ids = Array.isArray(selecionados) ? selecionados : [selecionados].filter(Boolean);
  lista.innerHTML = fiscais.map(u => `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:4px 6px;border-radius:6px;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${u.uid}" data-nome="${u.nome || u.email}"
        ${ids.includes(u.uid) ? "checked" : ""}
        onchange="atualizarResumoFiscais()"
        style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;">
      ${u.nome || u.email}
    </label>
  `).join("");

  atualizarResumoFiscais();
}

async function registrarHistorico(acao, detalhe) {
  try {
    await addDoc(collection(db, "historico"), {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      acao,
      detalhe: detalhe || "",
      timestamp: new Date(),
    });
  } catch (e) { /* silencioso */ }
}

async function renderUsuarios() {
  const container = document.getElementById("pageUsuarios");
  if (!container) return;

  container.innerHTML = `<p style="color:var(--text2)">Carregando...</p>`;

  const snap = await getDocs(collection(db, "usuarios"));
  const lista = [];
  snap.forEach(d => lista.push({ id: d.id, ...d.data() }));

  const header = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div>
        <div style="font-size:15px;font-weight:700;">${lista.length} usuário(s) cadastrado(s)</div>
        <div style="font-size:12px;color:var(--text2);">Gerencie os acessos ao sistema</div>
      </div>
      <button class="btn-sm btn-accent" onclick="abrirModal('modalCriarUsuario')">
        <i class="bi bi-person-plus" style="margin-right:6px;"></i>Criar Usuário
      </button>
    </div>`;

  if (!lista.length) {
    container.innerHTML = header + `
      <div style="text-align:center;padding:60px 0;color:var(--text2);background:var(--surface);border:1px solid var(--border);border-radius:12px;">
        <i class="bi bi-people" style="font-size:48px;display:block;margin-bottom:12px;"></i>
        <p>Nenhum usuário criado ainda.</p>
      </div>`;
    return;
  }

  container.innerHTML = header + `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
      ${lista.map(u => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;">
          <div style="width:60px;height:60px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;">
            <i class="bi bi-person-fill" style="color:#fff;font-size:26px;"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:15px;">${u.nome || u.email.split("@")[0]}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px;">${u.email}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px;">Criado em ${u.criadoEm?.toDate ? u.criadoEm.toDate().toLocaleDateString("pt-BR") : "—"}</div>
          </div>
          <span style="font-size:11px;background:#e8f5e9;color:#2e7d32;border-radius:20px;padding:3px 12px;font-weight:600;">Ativo</span>
          <div style="display:flex;gap:8px;width:100%;margin-top:4px;">
            <button onclick="abrirEditarUsuario('${u.uid}','${u.nome || ""}','${u.email}')"
              style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px;cursor:pointer;color:var(--text);">
              <i class="bi bi-pencil"></i> Editar
            </button>
            <button onclick="abrirHistoricoUsuario('${u.uid}','${u.nome || u.email}')"
              style="flex:1;background:var(--accent);border:none;border-radius:8px;padding:8px;font-size:12px;cursor:pointer;color:#fff;">
              <i class="bi bi-clock-history"></i> Histórico
            </button>
          </div>
        </div>
      `).join("")}
    </div>`;
}

window.abrirEditarUsuario = function(uid, nome, email) {
  document.getElementById("editUserUid").value = uid;
  document.getElementById("editUserNome").value = nome;
  document.getElementById("editUserEmailLabel").textContent = email;
  abrirModal("modalEditarUsuario");
};

window.salvarEdicaoUsuario = async function() {
  const uid = document.getElementById("editUserUid").value;
  const nome = document.getElementById("editUserNome").value.trim();
  if (!nome) { toast("Informe o nome.", "warning"); return; }
  try {
    await setDoc(doc(db, "usuarios", uid), { nome }, { merge: true });
    toast("Usuário atualizado!", "success");
    fecharModal("modalEditarUsuario");
    renderUsuarios();
  } catch(e) {
    toast("Erro ao salvar.", "error");
  }
};

window.abrirHistoricoUsuario = async function(uid, nomeUsuario) {
  document.getElementById("historicoUsuarioNome").textContent = nomeUsuario;
  document.getElementById("historicoLista").innerHTML = `<p style="color:var(--text2)">Carregando...</p>`;
  abrirModal("modalHistorico");

  const q = query(
    collection(db, "historico"),
    where("userId", "==", uid)
  );
  const snap = await getDocs(q);
  const eventos = [];
  snap.forEach(d => eventos.push(d.data()));
  eventos.sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate());

  if (!eventos.length) {
    document.getElementById("historicoLista").innerHTML =
      `<p style="color:var(--text2);text-align:center;padding:30px 0;">Nenhuma atividade registrada.</p>`;
    return;
  }

  const icones = {
    "Criou contrato":      { icon: "bi-plus-circle-fill",   cor: "#2e7d32" },
    "Editou contrato":     { icon: "bi-pencil-fill",        cor: "#1565c0" },
    "Excluiu contrato":    { icon: "bi-trash-fill",         cor: "#c62828" },
    "Arquivou contrato":   { icon: "bi-archive-fill",       cor: "#e65100" },
    "Desarquivou contrato":{ icon: "bi-arrow-up-circle-fill", cor: "#6a1b9a" },
  };

  document.getElementById("historicoLista").innerHTML = eventos.map(e => {
    const cfg = icones[e.acao] || { icon: "bi-dot", cor: "#666" };
    const data = e.timestamp?.toDate ? e.timestamp.toDate().toLocaleString("pt-BR") : "—";
    return `
      <div style="display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="width:32px;height:32px;border-radius:50%;background:${cfg.cor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
          <i class="bi ${cfg.icon}" style="color:${cfg.cor};font-size:14px;"></i>
        </div>
        <div>
          <div style="font-weight:600;font-size:13px;">${e.acao}</div>
          <div style="font-size:12px;color:var(--text2);">${e.detalhe}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px;">${data}</div>
        </div>
      </div>`;
  }).join("");
};

window.exportarHTML = exportarHTML;
window.abrirAnalise = abrirAnalise;
window.salvarAnalise = salvarAnalise;
window.arquivarContrato = arquivarContrato;
window.desarquivarContrato = desarquivarContrato;
window.verAnalise = verAnalise;

window.criarNovoUsuario = async function () {
  const email = document.getElementById("newUserEmail").value.trim();
  const senha = document.getElementById("newUserSenha").value;

  if (!email || !senha) {
    toast("Preencha e-mail e senha.", "warning");
    return;
  }
  if (senha.length < 6) {
    toast("Senha precisa ter pelo menos 6 caracteres.", "warning");
    return;
  }

  try {
    const { initializeApp: initApp2 } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getAuth: getAuth2, createUserWithEmailAndPassword: createUser2, signOut: signOut2 } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

    const appSecundario = initApp2(firebaseConfig, "criacaoUsuario_" + Date.now());
    const authSecundario = getAuth2(appSecundario);

    const cred = await createUser2(authSecundario, email, senha);
    await signOut2(authSecundario);

    await setDoc(doc(db, "usuarios", cred.user.uid), {
      email,
      uid: cred.user.uid,
      criadoPor: currentUser.uid,
      criadoEm: new Date(),
    });

    toast(`Usuário ${email} criado com sucesso!`, "success");
    fecharModal("modalCriarUsuario");
    document.getElementById("newUserEmail").value = "";
    document.getElementById("newUserSenha").value = "";
    renderUsuarios();
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      toast("Este e-mail já está cadastrado.", "error");
    } else {
      toast("Erro ao criar usuário: " + err.message, "error");
    }
  }
};

// Migração única — rode no console: migrarDadosParaUsuario()
window.migrarDadosParaUsuario = async function () {
  if (!currentUser) { console.error("Faça login primeiro."); return; }

  const uid = currentUser.uid;
  let total = 0;

  // Contratos
  const snapC = await getDocs(collection(db, "contratos"));
  const batchC = writeBatch(db);
  snapC.forEach((d) => {
    if (!d.data().userId) { batchC.update(doc(db, "contratos", d.id), { userId: uid }); total++; }
  });
  await batchC.commit();

  // Análises
  const snapA = await getDocs(collection(db, "analises"));
  const batchA = writeBatch(db);
  snapA.forEach((d) => {
    if (!d.data().criadoPor) { batchA.update(doc(db, "analises", d.id), { criadoPor: uid }); total++; }
  });
  await batchA.commit();

  console.log(`✅ ${total} documentos migrados para ${currentUser.email}`);
  toast(`${total} registros vinculados à sua conta.`, "success");
  await carregarContratosFirebase();
  goTo("dashboard");
};