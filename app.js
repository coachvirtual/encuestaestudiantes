// Importamos Firebase Modular (SDK v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, writeBatch, doc, deleteDoc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.18.5/package/xlsx.mjs";

// Credenciales de Firebase para Estudiantes
const firebaseConfig = {
  apiKey: "AIzaSyD1x1CTKPw_rShy2jOoWCMWXwU6_kcXxDk",
  authDomain: "encuesta-compartir-estudiantes.firebaseapp.com",
  projectId: "encuesta-compartir-estudiantes",
  storageBucket: "encuesta-compartir-estudiantes.firebasestorage.app",
  messagingSenderId: "688700749688",
  appId: "1:688700749688:web:7db07e85611fe691d03a8d",
  measurementId: "G-CL4WBHB7GW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- VARIABLES GLOBALES ---
let schools = []; 
let selectedSchool = null;
let answers = {}; 

let allResponses = [];
let chartInstances = {}; 
let displayLimit = 10;

// Configuración de la encuesta en tiempo real
let configEncuesta = {
    activa: false,
    fechaInicio: new Date().toISOString(), 
    fechaFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
    preguntas: [
        "¿Qué tan fácil es acceder a Compartir Conocimientos y explorar los contenidos de los libros web?",
        "¿Qué tan fácil es navegar en tus clases y hacer las tareas usando un celular o tableta?",
        "¿Qué tan fácil es darte cuenta cuando tienes una tarea nueva o una notificación por parte de tus docentes?",
        "Una vez que terminas tu tarea, ¿qué tan fácil es subirla o enviarla por la plataforma?",
        "¿Qué tan fácil es ver qué tareas ya terminaste y cuáles fueron tus calificaciones?"
    ]
};

// Generador dinámico de etiquetas para gráficos basado en la cantidad de preguntas actuales
const getDynamicChartLabels = () => configEncuesta.preguntas.map((_, i) => `P${i + 1}`);

// --- CARGAR CONFIGURACIÓN DESDE FIREBASE ---
async function loadSurveyConfig() {
    try {
        const docRef = doc(db, "configuracion", "encuesta_activa");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            configEncuesta = docSnap.data();
        } else {
            await setDoc(docRef, configEncuesta);
        }
        verificarDisponibilidad();
        actualizarBotonEstadoAdmin();
        initSurvey();
    } catch (e) {
        console.error("Error cargando configuración de la encuesta", e);
        initSurvey(); 
    }
}

function verificarDisponibilidad() {
    const ahora = new Date();
    const inicio = new Date(configEncuesta.fechaInicio);
    const fin = new Date(configEncuesta.fechaFin);
    
    const estaDisponible = configEncuesta.activa && (ahora >= inicio && ahora <= fin);
    
    const searchInput = document.getElementById('school-search');
    if (!estaDisponible) {
        searchInput.disabled = true;
        searchInput.placeholder = "La encuesta se encuentra cerrada en este momento.";
    } else {
        searchInput.disabled = false;
        searchInput.placeholder = "Escribe el nombre de tu institución...";
    }
}

// --- NAVEGACIÓN ---
const showPage = (id) => {
    document.querySelectorAll('main > section, #app > section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- 1. RENDERIZADO DE LA ENCUESTA ---
function initSurvey() {
    const container = document.getElementById('questions-container');
    container.innerHTML = ''; 
    configEncuesta.preguntas.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = "glass-card p-6 rounded-2xl";
        div.innerHTML = `
            <p class="font-bold mb-4 text-[#0f172a]">${idx + 1}. ${q}</p>
            <div class="flex justify-between gap-2" id="q-${idx}">
                ${[1,2,3,4,5].map(val => `
                    <button class="likert-btn flex-1 py-3 rounded-lg font-bold focus:outline-none" data-q="${idx}" data-val="${val}">${val}</button>
                `).join('')}
            </div>
        `;
        container.appendChild(div);
    });

    document.querySelectorAll('.likert-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const qIdx = e.target.dataset.q;
            const val = e.target.dataset.val;
            answers[qIdx] = parseInt(val);
            document.querySelectorAll(`#q-${qIdx} .likert-btn`).forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

// --- 2. BUSCADOR DE COLEGIOS ---
async function loadSchoolsFromFirebase() {
    try {
        const querySnapshot = await getDocs(collection(db, "colegios"));
        schools = [];
        querySnapshot.forEach(doc => schools.push({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error cargando colegios.", e);
    }
}

const searchInput = document.getElementById('school-search');
const resultsDiv = document.getElementById('school-results');
const btnStart = document.getElementById('btn-start');

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    resultsDiv.innerHTML = '';
    btnStart.disabled = true;
    btnStart.classList.add('opacity-50', 'cursor-not-allowed');
    selectedSchool = null;

    if(val.length < 2) { resultsDiv.classList.add('hidden'); return; }
    
    const filtered = schools.filter(s => s.nombre.toLowerCase().includes(val));
    if(filtered.length > 0) {
        filtered.forEach(s => {
            const d = document.createElement('div');
            d.className = "p-4 hover:bg-fuchsia-50 cursor-pointer border-b border-slate-100 text-sm transition text-slate-700";
            d.innerText = s.nombre;
            d.onclick = () => {
                selectedSchool = s;
                searchInput.value = ''; 
                resultsDiv.classList.add('hidden');
                const nameDisplay = document.getElementById('selected-school-name');
                nameDisplay.innerText = "✓ Colegio seleccionado: " + s.nombre;
                nameDisplay.classList.remove('hidden');
                btnStart.disabled = false;
                btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
            };
            resultsDiv.appendChild(d);
        });
        resultsDiv.classList.remove('hidden');
    }
});

btnStart.addEventListener('click', () => {
    document.getElementById('display-school-name').innerText = selectedSchool.nombre;
    showPage('questions-page');
});

// --- 3. ENVIAR ENCUESTA ---
document.getElementById('btn-submit').addEventListener('click', async () => {
    if (Object.keys(answers).length < configEncuesta.preguntas.length) {
        alert("Por favor, califica todas las preguntas antes de finalizar.");
        return;
    }
    const openQuestionText = document.getElementById('open-question').value.trim();
    const submitBtn = document.getElementById('btn-submit');
    submitBtn.innerText = "Enviando..."; submitBtn.disabled = true;

    try {
        const payload = {
            colegio_id: selectedSchool.id,
            colegio_nombre: selectedSchool.nombre,
            regional: selectedSchool.regional || "Sin asignar",
            lineaNegocio: selectedSchool.lineaNegocio || "Sin asignar",
            clasificacion: selectedSchool.clasificacion || "Sin asignar",
            coach: selectedSchool.coach || "Sin asignar",
            respuestas_likert: answers,
            comentario_abierto: openQuestionText || "Sin comentarios",
            fecha: new Date().toISOString()
        };
        await addDoc(collection(db, "respuestas"), payload);
        showPage('thank-you-page');
        setTimeout(() => resetApp(), 3500);
    } catch (e) {
        console.error(e);
        alert("Hubo un error al enviar la encuesta.");
        submitBtn.innerText = "Finalizar Encuesta"; submitBtn.disabled = false;
    }
});

function resetApp() {
    selectedSchool = null; answers = {};
    document.getElementById('school-search').value = '';
    document.getElementById('selected-school-name').classList.add('hidden');
    document.getElementById('open-question').value = '';
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-start').classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('btn-submit').innerText = "Finalizar Encuesta";
    document.getElementById('btn-submit').disabled = false;
    verificarDisponibilidad(); 
    initSurvey();
    showPage('welcome-page');
}

// --- 4. IMPORTAR EXCEL ---
document.getElementById('excel-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return; 
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            if(json.length === 0) { alert("Archivo vacío."); return; }
            alert(`Leyendo ${json.length} colegios. Por favor espera...`);
            const batch = writeBatch(db);
            let registrosAgregados = 0;
            
            json.forEach(row => {
                const nombreCol = row.colegio || row.Colegio || row.NombreColegio || row.nombre;
                if(nombreCol) {
                    const docRef = doc(collection(db, "colegios"));
                    batch.set(docRef, { 
                        nombre: nombreCol,
                        regional: row.regional || row.Regional || "",
                        lineaNegocio: row.lineaNegocio || row.LineaNegocio || row["Línea de Negocio"] || "",
                        clasificacion: row.clasificacion || row.Clasificacion || row.Clasificación || "",
                        coach: row.coach || row.Coach || ""
                    });
                    registrosAgregados++;
                }
            });
            await batch.commit();
            alert(`¡Cargados ${registrosAgregados} colegios a la BD!`);
            e.target.value = ''; loadSchoolsFromFirebase(); 
        } catch (error) { 
            console.error(error);
            alert("Error leyendo el Excel."); 
        }
    };
    reader.readAsArrayBuffer(file);
});

// --- 5. MOTOR DEL DASHBOARD ---
Chart.defaults.font.family = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.color = '#94a3b8'; 

const calcularPromedioDoc = (respuestas) => {
    let sum = 0; let count = 0;
    const maxQ = Math.max(configEncuesta.preguntas.length, Object.keys(respuestas).length);
    for(let i = 0; i < maxQ; i++) {
        if(respuestas[i]) { sum += respuestas[i]; count++; }
    }
    return count > 0 ? (sum / count) : 0;
};

async function loadDashboardData() {
    try {
        const querySnapshot = await getDocs(collection(db, "respuestas"));
        allResponses = [];
        querySnapshot.forEach(doc => allResponses.push({ firestoreId: doc.id, ...doc.data() }));
        updateDashboardView();
    } catch (e) {
        console.error("Error cargando dashboard:", e);
    }
}

function renderEmptyCharts() {
    const labels = getDynamicChartLabels();
    const zeros = new Array(labels.length).fill(0);

    const ctxGlobal = document.getElementById('chartGlobal').getContext('2d');
    if(chartInstances['chartGlobal']) chartInstances['chartGlobal'].destroy();
    chartInstances['chartGlobal'] = new Chart(ctxGlobal, {
        type: 'line',
        data: { labels: labels, datasets: [{ data: zeros, borderColor: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)', borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    const ctxReg = document.getElementById('chartRegional').getContext('2d');
    if(chartInstances['chartRegional']) chartInstances['chartRegional'].destroy();
    chartInstances['chartRegional'] = new Chart(ctxReg, {
        type: 'bar',
        data: { labels: ['Sin datos'], datasets: [{ data: [0], backgroundColor: '#e2e8f0', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    const ctxLin = document.getElementById('chartLinea').getContext('2d');
    if(chartInstances['chartLinea']) chartInstances['chartLinea'].destroy();
    chartInstances['chartLinea'] = new Chart(ctxLin, {
        type: 'bar',
        data: { labels: ['Sin datos'], datasets: [{ data: [0], backgroundColor: '#e2e8f0', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}

function updateDashboardView() {
    const total = allResponses.length;
    document.getElementById('stat-total').innerText = total;

    if (total === 0) {
        document.getElementById('stat-avg').innerText = "0.0";
        document.getElementById('table-surveys').innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay datos registrados</td></tr>';
        renderEmptyCharts();
        return;
    }

    let sumasPreguntas = new Array(configEncuesta.preguntas.length).fill(0);
    allResponses.forEach(r => {
        for(let i = 0; i < configEncuesta.preguntas.length; i++) { 
            sumasPreguntas[i] += r.respuestas_likert[i] || 0; 
        }
    });

    const promediosPreguntas = sumasPreguntas.map(s => s / total);
    const globalAvg = (promediosPreguntas.reduce((a,b)=>a+b,0) / configEncuesta.preguntas.length).toFixed(1);
    document.getElementById('stat-avg').innerText = globalAvg;

    const ctxGlobal = document.getElementById('chartGlobal').getContext('2d');
    if(chartInstances['chartGlobal']) chartInstances['chartGlobal'].destroy();
    let gradientBlue = ctxGlobal.createLinearGradient(0, 0, 0, 300);
    gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    chartInstances['chartGlobal'] = new Chart(ctxGlobal, {
        type: 'line',
        data: {
            labels: getDynamicChartLabels(),
            datasets: [{
                data: promediosPreguntas.map(v=>v.toFixed(2)),
                borderColor: '#3b82f6', backgroundColor: gradientBlue, borderWidth: 4,
                tension: 0.4, fill: true, pointBackgroundColor: '#ffffff', pointBorderColor: '#3b82f6', pointBorderWidth: 3, pointRadius: 6, pointHoverRadius: 8
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false } }, x: { grid: { display: false, drawBorder: false } } }, plugins: { legend: { display: false } } }
    });

    const renderBarChart = (mapData, elementId, colorClass, gradientStart, gradientEnd, borderColor) => {
        const labels = Object.keys(mapData);
        const data = labels.map(l => (mapData[l].sum / mapData[l].count).toFixed(2));
        const ctx = document.getElementById(elementId).getContext('2d');
        if(chartInstances[elementId]) chartInstances[elementId].destroy();
        
        let gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, gradientStart); gradient.addColorStop(1, gradientEnd);

        chartInstances[elementId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [
                { type: 'scatter', data: data, backgroundColor: '#ffffff', borderColor: borderColor, borderWidth: 3, pointRadius: 5, hoverRadius: 7 },
                { type: 'bar', data: data, backgroundColor: gradient, borderRadius: {topLeft: 50, topRight: 50, bottomLeft: 5, bottomRight: 5}, barThickness: 16 }
            ]},
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false }, ticks: { stepSize: 1 } }, x: { grid: { display: false, drawBorder: false }, ticks: { font: { weight: 'bold' }, color: '#475569', maxRotation: 45, minRotation: 45 } } }, plugins: { legend: { display: false } } }
        });
    };

    const regMap = {}; const linMap = {};
    allResponses.forEach(r => {
        let reg = r.regional || "Sin asignar"; let lin = r.lineaNegocio || "Sin asignar";
        if(!regMap[reg]) regMap[reg] = { sum: 0, count: 0 };
        if(!linMap[lin]) linMap[lin] = { sum: 0, count: 0 };
        const val = calcularPromedioDoc(r.respuestas_likert);
        regMap[reg].sum += val; regMap[reg].count++;
        linMap[lin].sum += val; linMap[lin].count++;
    });

    renderBarChart(regMap, 'chartRegional', '', 'rgba(236, 72, 153, 0.9)', 'rgba(217, 70, 239, 0.4)', '#db2777');
    renderBarChart(linMap, 'chartLinea', '', 'rgba(99, 102, 241, 0.9)', 'rgba(167, 139, 250, 0.4)', '#4f46e5');

    displayLimit = 10; renderTable();
}

function renderTable() {
    const tbody = document.getElementById('table-surveys');
    tbody.innerHTML = '';
    const sorted = allResponses.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    const toShow = sorted.slice(0, displayLimit);

    toShow.forEach(c => {
        const avg = calcularPromedioDoc(c.respuestas_likert).toFixed(1);
        let colorClass = "bg-green-100 text-green-700 border-green-200"; 
        if (avg <= 3.9) colorClass = "bg-red-100 text-red-700 border-red-200";
        else if (avg >= 4.0 && avg <= 4.3) colorClass = "bg-orange-100 text-orange-700 border-orange-200";

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-100 last:border-0";
        tr.innerHTML = `
            <td class="p-4 font-bold text-[#0f172a]">${c.colegio_nombre}</td>
            <td class="p-4 text-xs font-bold text-slate-500">${c.lineaNegocio || '-'}</td>
            <td class="p-4 text-xs font-bold text-slate-500">${c.regional || '-'}</td>
            <td class="p-4 text-xs text-slate-500">${c.coach || '-'}</td>
            <td class="p-4 text-center font-bold"><span class="px-3 py-1 rounded-full border ${colorClass}">${avg}</span></td>
            <td class="p-4 text-slate-600 text-sm max-w-xs truncate" title="${c.comentario_abierto}">"${c.comentario_abierto}"</td>
            <td class="p-4 text-center">
                <button onclick="window.deleteSurvey('${c.firestoreId}')" class="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition" title="Eliminar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const btnLoadMore = document.getElementById('btn-load-more');
    if (allResponses.length > displayLimit) btnLoadMore.classList.remove('hidden');
    else btnLoadMore.classList.add('hidden');
}

document.getElementById('btn-load-more').addEventListener('click', () => { displayLimit += 10; renderTable(); });

window.deleteSurvey = async (id) => {
    if(confirm("¿Estás seguro de eliminar esta encuesta?")) {
        if(confirm("Esta acción es definitiva. ¿Confirmar?")) {
            try { await deleteDoc(doc(db, "respuestas", id)); loadDashboardData(); } 
            catch(e) { alert("Error eliminando."); console.error(e); }
        }
    }
};

// --- EXPORTAR ---
document.getElementById('btn-export').addEventListener('click', async () => {
    if (allResponses.length === 0) { alert("No hay datos."); return; }
    const dataToExport = allResponses.map(data => {
        let obj = {
            "Fecha": new Date(data.fecha).toLocaleString(),
            "Regional": data.regional,
            "Colegio": data.colegio_nombre,
            "Línea de Negocio": data.lineaNegocio,
            "Clasificación": data.clasificacion,
            "Coach": data.coach
        };
        for(let i=0; i<configEncuesta.preguntas.length; i++) {
            obj[`P${i+1}`] = data.respuestas_likert[i] || "";
        }
        obj["Sugerencias"] = data.comentario_abierto;
        return obj;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados Estudiantes");
    XLSX.writeFile(wb, "Dashboard_Estudiantes.xlsx");
});

// --- LÓGICA DE ADMINISTRACIÓN Y MODAL ---
function actualizarBotonEstadoAdmin() {
    const btn = document.getElementById('btn-toggle-survey');
    if (!btn) return;
    if (configEncuesta.activa) {
        btn.innerText = "Detener Encuesta";
        btn.classList.replace('bg-slate-200', 'bg-red-500');
        btn.classList.replace('text-slate-700', 'text-white');
        btn.classList.replace('hover:bg-slate-300', 'hover:bg-red-600');
    } else {
        btn.innerText = "Lanzar Encuesta";
        btn.classList.replace('bg-red-500', 'bg-slate-200');
        btn.classList.replace('text-white', 'text-slate-700');
        btn.classList.replace('hover:bg-red-600', 'hover:bg-slate-300');
    }
}

document.getElementById('btn-toggle-survey')?.addEventListener('click', async () => {
    const nuevoEstado = !configEncuesta.activa;
    try {
        await updateDoc(doc(db, "configuracion", "encuesta_activa"), { activa: nuevoEstado });
        configEncuesta.activa = nuevoEstado;
        actualizarBotonEstadoAdmin();
        verificarDisponibilidad();
        alert(nuevoEstado ? "Encuesta lanzada al público correctamente." : "Encuesta detenida.");
    } catch (error) {
        alert("Ocurrió un error al cambiar el estado.");
    }
});

// VARIABLES MODAL
const modal = document.getElementById('modal-edit-survey');
const modalContainer = document.getElementById('modal-questions-container');
let preguntasTemporales = [];

function renderModalQuestions() {
    modalContainer.innerHTML = '';
    if(preguntasTemporales.length === 0) {
        modalContainer.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">No hay preguntas. Añade una nueva.</p>';
        return;
    }
    
    preguntasTemporales.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = "flex gap-3 items-start group";
        div.innerHTML = `
            <div class="mt-2 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">${index + 1}</div>
            <textarea class="flex-grow p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none transition shadow-sm text-sm" rows="2" data-index="${index}">${q}</textarea>
            <button class="btn-delete-q text-slate-300 hover:text-red-500 p-2 transition mt-1" data-index="${index}" title="Eliminar pregunta">
                <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        `;
        modalContainer.appendChild(div);
    });

    // Guardar cambios al teclear
    modalContainer.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', (e) => {
            preguntasTemporales[e.target.dataset.index] = e.target.value;
        });
    });

    // Eliminar
    modalContainer.querySelectorAll('.btn-delete-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            preguntasTemporales.splice(idx, 1);
            renderModalQuestions();
        });
    });
}

function openModal() {
    preguntasTemporales = [...configEncuesta.preguntas]; // Clonar para editar sin afectar base
    renderModalQuestions();
    modal.classList.remove('hidden');
}
function closeModal() { modal.classList.add('hidden'); }

document.getElementById('btn-edit-survey')?.addEventListener('click', () => {
    if (configEncuesta.activa) {
        alert("Debes 'Detener la Encuesta' primero para poder editarla de forma segura.");
        return;
    }
    openModal();
});

document.getElementById('btn-add-question').addEventListener('click', () => {
    preguntasTemporales.push("");
    renderModalQuestions();
    // Scroll down
    setTimeout(() => { modalContainer.scrollTop = modalContainer.scrollHeight; }, 100);
});

document.getElementById('btn-close-modal-x').addEventListener('click', closeModal);
document.getElementById('btn-cancel-edit').addEventListener('click', closeModal);

document.getElementById('btn-save-edit').addEventListener('click', async () => {
    // Limpiar espacios vacíos
    const preguntasLimpias = preguntasTemporales.map(p => p.trim()).filter(p => p !== "");
    
    if (preguntasLimpias.length === 0) {
        alert("La encuesta debe tener al menos una pregunta.");
        return;
    }

    try {
        const btnSave = document.getElementById('btn-save-edit');
        btnSave.innerText = "Guardando..."; btnSave.disabled = true;
        
        await updateDoc(doc(db, "configuracion", "encuesta_activa"), { preguntas: preguntasLimpias });
        configEncuesta.preguntas = preguntasLimpias;
        initSurvey();
        updateDashboardView(); // Actualiza etiquetas P1, P2...
        closeModal();
        
        btnSave.innerText = "Guardar en Base de Datos"; btnSave.disabled = false;
    } catch(e) {
        console.error(e);
        alert("Error al guardar en Firebase.");
        document.getElementById('btn-save-edit').innerText = "Guardar en Base de Datos"; 
        document.getElementById('btn-save-edit').disabled = false;
    }
});


// --- ADMIN LOGIN ---
document.getElementById('btn-show-admin').onclick = () => showPage('admin-login');
document.getElementById('btn-back-home').onclick = () => showPage('welcome-page');
document.getElementById('btn-logout').onclick = () => {
    document.getElementById('admin-user').value = '';
    document.getElementById('admin-pass').value = '';
    showPage('welcome-page');
};

document.getElementById('btn-login').onclick = () => {
    if(document.getElementById('admin-user').value === 'santillana' && 
       document.getElementById('admin-pass').value === 'admin2026') {
        showPage('admin-dashboard');
        loadDashboardData(); 
    } else {
        alert("Credenciales incorrectas");
    }
};

// Iniciar app
showPage('welcome-page');
loadSchoolsFromFirebase();
loadSurveyConfig();
