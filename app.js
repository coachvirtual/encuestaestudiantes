// Importamos Firebase Modular (SDK v10) manteniendo CDN para HTML puro
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, writeBatch, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

// Preguntas actualizadas (7 preguntas, se eliminó la de Feedback)
const questions = [
    "¿Qué tan fácil es explorar los contenidos de los libros web?",
    "El diseño visual de la plataforma (colores, distribución de elementos) te parece:",
    "¿Qué tan fácil es ubicar y acceder a las actividades y tareas asignadas por el docente?",
    "Cuando un docente califica o asigna una tarea, ¿recibes una notificación oportuna en la plataforma?",
    "Si accedes a la plataforma desde tu móvil o tableta, ¿funciona correctamente para consumir contenido?",
    "El proceso de inicio de sesión (usuario y contraseña) te parece:",
    "¿Qué tan fácil es ver tu progreso o el estado de realización de actividades digitales (vistos/no vistos, ejercicios realizados)?"
];

// Etiquetas cortas para el gráfico global (7 etiquetas)
const chartLabels = [
    "Exploración", 
    "Diseño Visual", 
    "Acceso Tareas", 
    "Notificaciones", 
    "Uso Móvil/Tablet", 
    "Inicio Sesión", 
    "Progreso"
];

// --- NAVEGACIÓN ---
const showPage = (id) => {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- 1. RENDERIZADO DE LA ENCUESTA ---
function initSurvey() {
    const container = document.getElementById('questions-container');
    container.innerHTML = ''; 
    questions.forEach((q, idx) => {
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
    if (Object.keys(answers).length < questions.length) {
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
    initSurvey();
    showPage('welcome-page');
}

// --- 4. IMPORTAR COLEGIOS ---
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

// --- 5. MOTOR DEL DASHBOARD INTERACTIVO ---

Chart.defaults.font.family = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.color = '#94a3b8'; 

// Función segura para calcular el promedio de una sola encuesta
const calcularPromedioDoc = (respuestas) => {
    let sum = 0; let count = 0;
    for(let i = 0; i < questions.length; i++) {
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

function updateDashboardView() {
    const total = allResponses.length;
    document.getElementById('stat-total').innerText = total;

    if (total === 0) {
        document.getElementById('stat-avg').innerText = "0.0";
        if(chartInstances['chartGlobal']) chartInstances['chartGlobal'].destroy();
        if(chartInstances['chartRegional']) chartInstances['chartRegional'].destroy();
        if(chartInstances['chartLinea']) chartInstances['chartLinea'].destroy();
        document.getElementById('table-surveys').innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No hay datos registrados</td></tr>';
        return;
    }

    let sumasPreguntas = new Array(questions.length).fill(0);
    allResponses.forEach(r => {
        for(let i = 0; i < questions.length; i++) { 
            sumasPreguntas[i] += r.respuestas_likert[i] || 0; 
        }
    });

    const promediosPreguntas = sumasPreguntas.map(s => s / total);
    const globalAvg = (promediosPreguntas.reduce((a,b)=>a+b,0) / questions.length).toFixed(1);
    document.getElementById('stat-avg').innerText = globalAvg;

    // --- 1. Gráfico Global ---
    const ctxGlobal = document.getElementById('chartGlobal').getContext('2d');
    if(chartInstances['chartGlobal']) chartInstances['chartGlobal'].destroy();
    
    let gradientBlue = ctxGlobal.createLinearGradient(0, 0, 0, 300);
    gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); 
    gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    chartInstances['chartGlobal'] = new Chart(ctxGlobal, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                data: promediosPreguntas.map(v=>v.toFixed(2)),
                borderColor: '#3b82f6', backgroundColor: gradientBlue, borderWidth: 4,
                tension: 0.4, fill: true,
                pointBackgroundColor: '#ffffff', pointBorderColor: '#3b82f6', pointBorderWidth: 3,
                pointRadius: 6, pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 5, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false } },
                x: { grid: { display: false, drawBorder: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // --- 2. Gráfico Regional (AHORA DINÁMICO) ---
    const regMap = {};
    allResponses.forEach(r => {
        let reg = r.regional;
        if (!reg || reg.trim() === "") reg = "Sin asignar";
        else reg = reg.trim();

        if(!regMap[reg]) regMap[reg] = { sum: 0, count: 0 };
        regMap[reg].sum += calcularPromedioDoc(r.respuestas_likert);
        regMap[reg].count++;
    });
    
    const regLabels = Object.keys(regMap);
    const regData = regLabels.map(l => (regMap[l].sum / regMap[l].count).toFixed(2));
    
    const ctxReg = document.getElementById('chartRegional').getContext('2d');
    if(chartInstances['chartRegional']) chartInstances['chartRegional'].destroy();
    
    let gradientFuchsiaBar = ctxReg.createLinearGradient(0, 0, 0, 200);
    gradientFuchsiaBar.addColorStop(0, 'rgba(236, 72, 153, 0.9)'); 
    gradientFuchsiaBar.addColorStop(1, 'rgba(217, 70, 239, 0.4)');

    chartInstances['chartRegional'] = new Chart(ctxReg, {
        type: 'bar',
        data: {
            labels: regLabels,
            datasets: [
                {
                    type: 'scatter', 
                    data: regData,
                    backgroundColor: '#ffffff', borderColor: '#db2777', borderWidth: 3, pointRadius: 5, hoverRadius: 7
                },
                {
                    type: 'bar', data: regData, backgroundColor: gradientFuchsiaBar,
                    borderRadius: {topLeft: 50, topRight: 50, bottomLeft: 5, bottomRight: 5},
                    borderSkipped: false, barThickness: 16
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 5, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false }, ticks: { stepSize: 1 } },
                x: { grid: { display: false, drawBorder: false }, ticks: { font: { weight: 'bold' }, color: '#475569', maxRotation: 45, minRotation: 45 } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // --- 3. Gráfico Línea de Negocio ---
    const linMap = {};
    allResponses.forEach(r => {
        let lin = r.lineaNegocio;
        if (!lin || lin.trim() === "") lin = "Sin asignar";
        else lin = lin.trim();

        if(!linMap[lin]) linMap[lin] = { sum: 0, count: 0 };
        linMap[lin].sum += calcularPromedioDoc(r.respuestas_likert);
        linMap[lin].count++;
    });
    
    const linLabels = Object.keys(linMap);
    const linData = linLabels.map(l => (linMap[l].sum / linMap[l].count).toFixed(2));
    
    const ctxLin = document.getElementById('chartLinea').getContext('2d');
    if(chartInstances['chartLinea']) chartInstances['chartLinea'].destroy();

    let gradientIndigoBar = ctxLin.createLinearGradient(0, 0, 0, 200);
    gradientIndigoBar.addColorStop(0, 'rgba(99, 102, 241, 0.9)'); 
    gradientIndigoBar.addColorStop(1, 'rgba(167, 139, 250, 0.4)');

    chartInstances['chartLinea'] = new Chart(ctxLin, {
        type: 'bar',
        data: {
            labels: linLabels,
            datasets: [
                {
                    type: 'scatter', 
                    data: linData,
                    backgroundColor: '#ffffff', borderColor: '#4f46e5', borderWidth: 3, pointRadius: 5, hoverRadius: 7
                },
                {
                    type: 'bar', data: linData, backgroundColor: gradientIndigoBar,
                    borderRadius: {topLeft: 50, topRight: 50, bottomLeft: 5, bottomRight: 5},
                    borderSkipped: false, barThickness: 16
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 5, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false }, ticks: { stepSize: 1 } },
                x: { grid: { display: false, drawBorder: false }, ticks: { font: { weight: 'bold' }, color: '#475569' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // Resetear paginación y pintar la tabla
    displayLimit = 10;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('table-surveys');
    tbody.innerHTML = '';
    const sorted = allResponses.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    const toShow = sorted.slice(0, displayLimit);

    toShow.forEach(c => {
        const avg = calcularPromedioDoc(c.respuestas_likert).toFixed(1);
        
        // Colores condicionales
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
    if (allResponses.length > displayLimit) {
        btnLoadMore.classList.remove('hidden');
    } else {
        btnLoadMore.classList.add('hidden');
    }
}

document.getElementById('btn-load-more').addEventListener('click', () => {
    displayLimit += 10;
    renderTable();
});

window.deleteSurvey = async (id) => {
    if(confirm("¿Estás seguro de eliminar esta encuesta?")) {
        if(confirm("Esta acción es definitiva y borrará los datos de la base. ¿Confirmar?")) {
            try {
                await deleteDoc(doc(db, "respuestas", id));
                loadDashboardData(); 
            } catch(e) {
                alert("Error eliminando la encuesta.");
                console.error(e);
            }
        }
    }
};

// --- 6. EXPORTAR A EXCEL ---
document.getElementById('btn-export').addEventListener('click', async () => {
    if (allResponses.length === 0) { alert("No hay datos."); return; }
    
    // Adaptado a las 7 preguntas actuales
    const dataToExport = allResponses.map(data => ({
        "Fecha": new Date(data.fecha).toLocaleString(),
        "Regional": data.regional,
        "Colegio": data.colegio_nombre,
        "Línea de Negocio": data.lineaNegocio,
        "Clasificación": data.clasificacion,
        "Coach": data.coach,
        "P1. Exploración": data.respuestas_likert[0] || "",
        "P2. Diseño Visual": data.respuestas_likert[1] || "",
        "P3. Acceso a Tareas": data.respuestas_likert[2] || "",
        "P4. Notificaciones": data.respuestas_likert[3] || "", 
        "P5. Uso Móvil/Tablet": data.respuestas_likert[4] || "",
        "P6. Inicio Sesión": data.respuestas_likert[5] || "",
        "P7. Progreso": data.respuestas_likert[6] || "",
        "Sugerencias": data.comentario_abierto
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados Estudiantes");
    XLSX.writeFile(wb, "Dashboard_Estudiantes.xlsx");
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
initSurvey();
loadSchoolsFromFirebase();
