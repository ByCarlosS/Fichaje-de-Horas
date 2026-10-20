(function(){
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS=['dom','lun','mar','mié','jue','vie','sáb'];
const LSKEY='horas-extra-v1';

/* Conceptos: "normal" solo suma como extra lo que pase de la jornada del día; el resto cuenta entero como extra. */
const CONCEPTOS=[
  {id:'normal',  nombre:'Jornada normal',        extra:false, hint:'Cuenta como extra lo que pase de tu jornada de ese día, más el descanso que no hayas cogido.'},
  {id:'descanso',nombre:'Descanso no cogido',    extra:true,  hint:'Para apuntarlo como registro aparte (hora en que te tocaba y hora en que acababa). Si ya lo marcas en tu jornada con «Descanso: no cogido», no lo repitas aquí.'},
  {id:'extra',   nombre:'Hora extra',            extra:true,  hint:'Todo el tiempo cuenta como hora extra.'},
  {id:'libre',   nombre:'Día libre trabajado',   extra:true,  hint:'Todo el tiempo cuenta como hora extra.'},
  {id:'festivo', nombre:'Festivo trabajado',     extra:true,  hint:'Todo el tiempo cuenta como hora extra.'},
  {id:'otro',    nombre:'Otro concepto…',        extra:true,  hint:'Escribe el nombre del concepto. Todo el tiempo cuenta como hora extra.'}
];
const C=Object.fromEntries(CONCEPTOS.map(c=>[c.id,c]));
const conceptoDe=f=>C[f.concepto]||C.normal;
const nombreConcepto=f=>f.concepto==='otro'?(f.conceptoTexto||'Otro'):conceptoDe(f).nombre;

let fichajes=new Map();
const JORNADAS_DEF=[0,8,8,8,8,8,0]; // índice = día de la semana (0 domingo … 6 sábado); 0 = día libre
const AJ_DEF={jornadas:JORNADAS_DEF, descanso:0, lavado:0, precio:0, nombre:'', empresa:''};
const normAjustes=v=>{const a={...AJ_DEF,...(v||{})}; if(!Array.isArray(a.jornadas)||a.jornadas.length!==7) a.jornadas=[...JORNADAS_DEF]; delete a.jornada; return a};
let ajustes=normAjustes();
const LETRAS=['D','L','M','X','J','V','S'];
const jornadaMin=fecha=>(Number(ajustes.jornadas[parse(fecha+'T00:00').getDay()])||0)*60;
const conduccionMin=j=>Math.max(0,j-(Number(ajustes.descanso)||0)-(Number(ajustes.lavado)||0));
const dnc=f=>conceptoDe(f).extra?0:(Number(f.descansoNoCogido)||0);
function resumenJornada(){
  const g={}; [1,2,3,4,5,6,0].forEach(i=>{const v=Number(ajustes.jornadas[i])||0;(g[v]=g[v]||[]).push(LETRAS[i])});
  return Object.entries(g).map(([h,d])=>`${d.join(' ')}: ${String(h).replace('.',',')} h`).join(' · ');
}
let mes=(()=>{const d=new Date();return {y:d.getFullYear(),m:d.getMonth()}})();
let editId=null, confirmId=null, ultimoGuardado=null;
let store=null, downloads=null;

/* ---------- tiempo ---------- */
const localISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parse=s=>{const [a,b]=s.split('T');const [y,mo,d]=a.split('-').map(Number);const [h,mi]=b.split(':').map(Number);return new Date(y,mo-1,d,h,mi)};
const fmt=min=>{min=Math.max(0,Math.round(min));return Math.floor(min/60)+':'+pad(min%60)};
const minutos=(f,ahora)=>{const a=parse(f.entrada);const b=f.salida?parse(f.salida):(ahora||new Date());return Math.max(0,(b-a)/60000-(Number(f.pausa)||0))};
const nid=()=>'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const abierto=()=>[...fichajes.entries()].find(([,f])=>!f.salida);
function setV(sel,txt){const el=$(sel); if(el.textContent!==txt){el.textContent=txt; el.classList.remove('cambio'); void el.offsetWidth; el.classList.add('cambio');}}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const euros=n=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});

/* Cálculo del mes: devuelve días con filas y la parte extra de cada fila. */
function calcularMes(y,m){
  const pref=`${y}-${pad(m+1)}`, ahora=new Date();
  const dias=new Map();
  for(const [id,f] of fichajes){ if(!f.entrada.startsWith(pref)) continue; const k=f.entrada.slice(0,10); if(!dias.has(k)) dias.set(k,[]); dias.get(k).push({id,f,min:minutos(f,ahora),exceso:0,dnc:dnc(f),extra:0}); }
  const res={dias:[],total:0,extra:0,diasExtra:0,porConcepto:{}};
  const sumar=(n,v)=>{if(v>0) res.porConcepto[n]=(res.porConcepto[n]||0)+v};
  for(const k of [...dias.keys()].sort().reverse()){
    const filas=dias.get(k).sort((a,b)=>a.f.entrada<b.f.entrada?-1:1);
    const J=jornadaMin(k);
    const normales=filas.filter(r=>!conceptoDe(r.f).extra);
    const normal=normales.reduce((s,r)=>s+r.min,0);
    let exceso=Math.max(0,normal-J);
    for(let i=normales.length-1;i>=0&&exceso>0;i--){ const r=normales[i]; const p=Math.min(r.min,exceso); r.exceso=p; exceso-=p; }
    for(const r of filas){
      if(conceptoDe(r.f).extra){ r.extra=r.min; sumar(nombreConcepto(r.f),r.min); }
      else { r.extra=r.exceso+r.dnc; sumar('Exceso de jornada',r.exceso); sumar('Descanso no cogido',r.dnc); }
    }
    const tot=filas.reduce((s,r)=>s+r.min,0), ext=filas.reduce((s,r)=>s+r.extra,0);
    res.total+=tot; res.extra+=ext; if(ext>0) res.diasExtra++;
    res.dias.push({fecha:k,filas,total:tot,extra:ext,jornada:normales.length?J:0});
  }
  return res;
}

/* ---------- almacenamiento ---------- */
function localStore(){
  let raw={}; try{raw=JSON.parse(localStorage.getItem(LSKEY)||'{}')}catch(e){}
  fichajes=new Map(Object.entries(raw.fichajes||{}));
  ajustes=normAjustes(raw.ajustes);
  const persist=()=>{try{localStorage.setItem(LSKEY,JSON.stringify({fichajes:Object.fromEntries(fichajes),ajustes}))}catch(e){}};
  return {kind:'local',
    async save(id,d){ultimoGuardado=id;fichajes.set(id,d);persist();render()},
    async remove(id){fichajes.delete(id);persist();render()},
    async saveAjustes(a){ajustes=a;persist();render()}};
}
/* Nube (Firebase): usuarios/{uid}/fichajes/{id} y usuarios/{uid}/config/ajustes */
const fbListo=typeof firebase!=='undefined'&&window.FIREBASE_CONFIG&&FIREBASE_CONFIG.apiKey&&!/^PEGA/.test(FIREBASE_CONFIG.apiKey);
let usuario=null;
function refs(u){
  const base=firebase.firestore().collection('usuarios').doc(u.uid);
  return {col:base.collection('fichajes'), aj:base.collection('config').doc('ajustes')};
}
async function subirLocales(u){
  const key='horas-extra-subido-'+u.uid;
  try{ if(localStorage.getItem(key)) return; }catch(e){ return; }
  let raw={}; try{raw=JSON.parse(localStorage.getItem(LSKEY)||'{}')}catch(e){}
  const {col,aj}=refs(u), locales=Object.entries(raw.fichajes||{});
  for(let i=0;i<locales.length;i+=400){
    const batch=firebase.firestore().batch();
    locales.slice(i,i+400).forEach(([id,f])=>batch.set(col.doc(id),f,{merge:true}));
    await batch.commit();
  }
  if(raw.ajustes){ const d=await aj.get(); if(!d.exists) await aj.set(normAjustes(raw.ajustes)); }
  try{ localStorage.setItem(key,'1'); }catch(e){}
}
function nubeStore(u){
  const {col,aj}=refs(u);
  fichajes=new Map(); render();
  const err=()=>{$('#storeLabel').textContent='No se pudo conectar con la nube. Revisa las reglas de Firestore.'};
  const s1=col.onSnapshot(snap=>{const m=new Map(); snap.forEach(d=>{const v=d.data(); if(v&&v.entrada) m.set(d.id,{...v})}); fichajes=m; render();},err);
  const s2=aj.onSnapshot(d=>{
    if(d.exists){ ajustes=normAjustes(d.data()); $('#aviso').hidden=true; }
    else { ajustes=normAjustes({nombre:u.displayName||''}); $('#aviso').hidden=false; }
    render();
  },err);
  const fallo=()=>{$('#storeLabel').textContent='No se pudo guardar en la nube. Inténtalo de nuevo.'};
  return {kind:'nube', stop(){s1();s2();$('#aviso').hidden=true;},
    save(id,d){ultimoGuardado=id;fichajes.set(id,d);render();return col.doc(id).set(d).catch(fallo)},
    remove(id){fichajes.delete(id);render();return col.doc(id).delete().catch(fallo)},
    saveAjustes(a){ajustes=a;render();return aj.set(a).catch(fallo)}};
}
function storeLabel(){
  const l=$('#storeLabel');
  if(store.kind==='nube'){ l.textContent=`Sincronizado · ${usuario.email||usuario.displayName||'tu cuenta'}`; l.classList.add('sync'); }
  else { l.textContent=fbListo?'Sin sesión · solo en este dispositivo':'Guardado en este dispositivo'; l.classList.remove('sync'); }
  $('#login').hidden=!fbListo||store.kind==='nube';
  $('#logout').hidden=store.kind!=='nube';
}

/* ---------- render ---------- */
function tick(){
  const d=new Date();
  $('#now').textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#today').textContent=`${['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const ab=abierto(), st=$('#status'), btn=$('#punch'), sel=$('#pConcepto');
  if(ab){
    const f=ab[1]; st.classList.add('on'); $('.clock').classList.add('on');
    $('#statusText').textContent=`${nombreConcepto(f)} desde ${f.entrada.slice(11)} · ${fmt(minutos(f,d))} h`;
    btn.textContent='Fichar salida'; btn.classList.add('out'); sel.disabled=true; if(sel.value!==conceptoDe(f).id) sel.value=conceptoDe(f).id;
    $('#pDescBox').hidden=conceptoDe(f).extra; $('#pDesc').checked=(Number(f.descansoNoCogido)||0)>0;
  }else{
    st.classList.remove('on'); $('.clock').classList.remove('on'); $('#statusText').textContent='Fuera de servicio';
    btn.textContent='Fichar entrada'; btn.classList.remove('out'); sel.disabled=false; $('#pDescBox').hidden=true;
  }
}
function render(){
  tick();
  const precio=Number(ajustes.precio)||0;
  $('#monthTitle').textContent=`${MESES[mes.m]} ${mes.y}`;
  const r=calcularMes(mes.y,mes.m);
  $('#log').innerHTML=r.dias.length?r.dias.map((d,di)=>{
    const dd=parse(d.fecha+'T00:00');
    return `<article class="day" style="--d:${di}"><div class="dayhead"><span class="d">${DIAS[dd.getDay()]} ${dd.getDate()} ${MESES[dd.getMonth()].slice(0,3)}</span><span class="t">${d.jornada?`<span class="chip" title="Tiempo efectivo ${fmt(conduccionMin(d.jornada))} h">jornada ${fmt(d.jornada)}</span>`:''}<span class="chip">${fmt(d.total)} h</span>${d.extra>0?`<span class="chip extra">+${fmt(d.extra)} extra</span>`:''}</span></div>`+
    d.filas.map(({id,f,min,dnc:sinDesc})=>{
      const salida=f.salida?f.salida.slice(11):'<span class="open-tag">en curso</span>';
      const noct=f.salida&&f.salida.slice(0,10)!==f.entrada.slice(0,10)?' <span class="hint">(+1)</span>':'';
      const tag=(conceptoDe(f).id!=='normal'?`<span class="concept-tag">${esc(nombreConcepto(f))}</span>`:'')+(sinDesc>0?`<span class="concept-tag">Sin descanso +${fmt(sinDesc)}</span>`:'');
      const extras=[esc(f.nota||''), f.pausa>0?`pausa ${f.pausa} min`:''].filter(Boolean).join(' · ');
      return `<div class="row${id===ultimoGuardado?' nuevo':''}"><span class="span">${f.entrada.slice(11)} → ${salida}${noct}</span><span class="note">${tag}${extras}</span><span class="dur">${fmt(min)}</span><span class="ops"><button class="link" data-edit="${id}">Editar</button><button class="link danger" data-del="${id}">${confirmId===id?'¿Borrar?':'Borrar'}</button></span></div>`;
    }).join('')+`</article>`;
  }).join(''):`<div class="panel empty"><strong>Sin registros en ${MESES[mes.m]}</strong>Pulsa «Fichar entrada» al empezar el turno, o añade un día a mano desde el formulario.</div>`;

  setV('#sTotal',fmt(r.total));
  $('#sDays').textContent=`${r.dias.length} ${r.dias.length===1?'día':'días'}`;
  setV('#sExtra',fmt(r.extra));
  $('#sExtraDays').textContent=r.diasExtra?`en ${r.diasExtra} ${r.diasExtra===1?'día':'días'}`:'ningún día';
  $('#sAvg').textContent=fmt(r.dias.length?r.total/r.dias.length:0);
  $('#sJornada').textContent=resumenJornada();
  if(precio>0){$('#sMoney').textContent=euros(r.extra/60*precio);$('#sPrice').textContent=`a ${precio.toLocaleString('es-ES',{minimumFractionDigits:2})} €/h`;}
  else{$('#sMoney').textContent='—';$('#sPrice').textContent='Pon tu precio/hora';}
  $('#breakdown').innerHTML=Object.entries(r.porConcepto).map(([n,v])=>`<span class="chip extra">${esc(n)}: ${fmt(v)}</span>`).join('');
  for(const [sel,key] of [['#cNombre','nombre'],['#cEmpresa','empresa'],['#cDescanso','descanso'],['#cLavado','lavado']]) if(document.activeElement!==$(sel)) $(sel).value=ajustes[key]??'';
  if(!$('#cWeek').contains(document.activeElement)) ajustes.jornadas.forEach((h,i)=>{$('#cW'+i).value=h}); splitWeek();
  if(document.activeElement!==$('#cPrecio')) $('#cPrecio').value=precio||'';
}

/* ---------- formulario ---------- */
$('#cWeek').innerHTML=[1,2,3,4,5,6,0].map(i=>`<label for="cW${i}">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][i]}<input type="number" id="cW${i}" min="0" max="24" step="0.25" inputmode="decimal"><span class="split" id="cS${i}"></span></label>`).join('');
function splitWeek(){
  const d=Number($('#cDescanso').value)||0, l=Number($('#cLavado').value)||0;
  for(let i=0;i<7;i++){ const j=(parseFloat($('#cW'+i).value)||0)*60; $('#cS'+i).textContent=j?`${fmt(Math.max(0,j-d-l))} efect.`:'libre'; }
}
$('#cfg').addEventListener('input',splitWeek);
const opts=CONCEPTOS.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
$('#fConcepto').innerHTML=opts;
$('#pConcepto').innerHTML=CONCEPTOS.filter(c=>c.id!=='otro').map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
function syncConcepto(){const c=C[$('#fConcepto').value]; $('#fOtroBox').hidden=c.id!=='otro'; $('#fConceptoHint').textContent=c.hint; $('#fDesc').disabled=c.extra; if(c.extra) $('#fDesc').value='0';}
$('#fConcepto').addEventListener('change',syncConcepto);
function resetForm(){
  editId=null; $('#form').reset();
  $('#fFecha').value=localISO(new Date()).slice(0,10); $('#fDesc').value='0'; $('#fConcepto').value='normal';
  $('#fSubmit').textContent='Añadir registro'; $('#fCancel').hidden=true; $('#fMsg').textContent='';
  $('#formTitle').textContent='Añadir o corregir un registro a mano'; syncConcepto();
}
$('#fCancel').addEventListener('click',resetForm);
$('#form').addEventListener('submit',e=>{
  e.preventDefault();
  const fecha=$('#fFecha').value, hin=$('#fIn').value, hout=$('#fOut').value, concepto=$('#fConcepto').value;
  if(!fecha||!hin){$('#fMsg').textContent='Indica la fecha y la hora de entrada.';return}
  if(concepto==='otro'&&!$('#fOtro').value.trim()){$('#fMsg').textContent='Escribe el nombre del concepto.';return}
  const entrada=`${fecha}T${hin}`; let salida=null;
  if(hout){ const a=parse(entrada); let b=parse(`${fecha}T${hout}`); if(b<=a) b=new Date(b.getTime()+86400000); salida=localISO(b); }
  else{ const o=abierto(); if(o&&o[0]!==editId){$('#fMsg').textContent='Ya tienes un turno abierto. Ciérralo antes de dejar otro sin salida.';return} }
  const prev=editId?fichajes.get(editId):null;
  store.save(editId||nid(),{entrada,salida,pausa:prev?.pausa||0,descansoNoCogido:C[concepto].extra?0:(parseInt($('#fDesc').value)||0),nota:$('#fNota').value.trim(),concepto,conceptoTexto:concepto==='otro'?$('#fOtro').value.trim():'',creado:prev?.creado||Date.now()});
  const d=parse(entrada); mes={y:d.getFullYear(),m:d.getMonth()}; resetForm();
});

/* ---------- acciones ---------- */
$('#punch').addEventListener('click',e=>{
  const b=e.currentTarget, rc=b.getBoundingClientRect(), o=document.createElement('span');
  o.className='ripple'; o.style.left=((e.clientX-rc.left)||rc.width/2)+'px'; o.style.top=((e.clientY-rc.top)||rc.height/2)+'px';
  b.appendChild(o); setTimeout(()=>o.remove(),650);
  const ab=abierto(), ahora=localISO(new Date());
  if(ab){ const [id,f]=ab; store.save(id,{...f,salida:ahora<=f.entrada?f.entrada:ahora}); }
  else{ store.save(nid(),{entrada:ahora,salida:null,pausa:0,descansoNoCogido:0,nota:'',concepto:$('#pConcepto').value,conceptoTexto:'',creado:Date.now()}); const d=new Date(); mes={y:d.getFullYear(),m:d.getMonth()}; }
});
$('#pDesc').addEventListener('change',()=>{const ab=abierto(); if(!ab) return; const [id,f]=ab; store.save(id,{...f,descansoNoCogido:$('#pDesc').checked?(Number(ajustes.descanso)||60):0});});
function animMes(){const h=$('#monthTitle'); h.classList.remove('cambia'); void h.offsetWidth; h.classList.add('cambia');}
$('#prev').addEventListener('click',()=>{mes.m--; if(mes.m<0){mes.m=11;mes.y--} ultimoGuardado=null; render(); animMes()});
$('#next').addEventListener('click',()=>{mes.m++; if(mes.m>11){mes.m=0;mes.y++} ultimoGuardado=null; render(); animMes()});
$('#log').addEventListener('click',e=>{
  const ed=e.target.closest('[data-edit]'), del=e.target.closest('[data-del]');
  if(ed){
    const id=ed.dataset.edit, f=fichajes.get(id); if(!f) return;
    editId=id; $('#formBox').open=true;
    $('#fFecha').value=f.entrada.slice(0,10); $('#fIn').value=f.entrada.slice(11);
    $('#fOut').value=f.salida?f.salida.slice(11):''; $('#fNota').value=f.nota||'';
    { const v=String(Number(f.descansoNoCogido)||0); $('#fDesc').value=[...$('#fDesc').options].some(o=>o.value===v)?v:'60'; }
    $('#fConcepto').value=conceptoDe(f).id; $('#fOtro').value=f.conceptoTexto||''; syncConcepto();
    $('#fSubmit').textContent='Guardar cambios'; $('#fCancel').hidden=false; $('#formTitle').textContent='Editando registro';
    $('#formBox').scrollIntoView({behavior:'smooth',block:'start'});
  }
  if(del){
    const id=del.dataset.del;
    if(confirmId===id){confirmId=null; store.remove(id); if(editId===id) resetForm();}
    else{confirmId=id; render(); setTimeout(()=>{if(confirmId===id){confirmId=null;render()}},4000);}
  }
});
$('#cfg').addEventListener('submit',e=>{
  e.preventDefault();
  const p=parseFloat($('#cPrecio').value), num=(v,d)=>{const n=parseFloat(v);return isFinite(n)&&n>=0?n:d};
  store.saveAjustes({jornadas:[0,1,2,3,4,5,6].map(i=>num($('#cW'+i).value,JORNADAS_DEF[i])), descanso:num($('#cDescanso').value,0), lavado:num($('#cLavado').value,0), precio:isFinite(p)&&p>=0?p:0, nombre:$('#cNombre').value.trim(), empresa:$('#cEmpresa').value.trim()});
  $('#cMsg').textContent='Ajustes guardados.';
});

/* ---------- descargas ---------- */
async function guardar(filename,data){
  $('#dlMsg').textContent='';
  if(!downloads){
    const blob=data instanceof Blob?data:new Blob([data],{type:filename.endsWith('.csv')?'text/csv;charset=utf-8':'application/octet-stream'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000); return;
  }
  try{await downloads.save({filename,data})}
  catch(e){ if(e&&e.code&&e.code!=='cancelled'&&e.code!=='declined') $('#dlMsg').textContent='No se pudo descargar el archivo. Inténtalo otra vez.'; }
}
$('#csv').addEventListener('click',()=>{
  const r=calcularMes(mes.y,mes.m), rows=[['Fecha','Concepto','Entrada','Salida','Jornada','Descanso no cogido','Horas','Extra','Servicio / nota']];
  [...r.dias].reverse().forEach(d=>d.filas.forEach(({f,min,extra,dnc:sd},i)=>rows.push([f.entrada.slice(0,10),nombreConcepto(f),f.entrada.slice(11),f.salida?f.salida.replace('T',' '):'',i===0&&d.jornada?fmt(d.jornada):'',sd?fmt(sd):'',fmt(min),fmt(extra),f.nota||''])));
  guardar(`horas-${mes.y}-${pad(mes.m+1)}.csv`,'﻿'+rows.map(x=>x.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n'));
});
$('#pdf').addEventListener('click',()=>{
  const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4'});
  const r=calcularMes(mes.y,mes.m), precio=Number(ajustes.precio)||0;
  const W=doc.internal.pageSize.getWidth(), titulo=`${MESES[mes.m][0].toUpperCase()+MESES[mes.m].slice(1)} ${mes.y}`;
  doc.setFillColor(22,32,42); doc.rect(0,0,W,26,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17);
  doc.text('Registro de horas extra',14,12); doc.setFontSize(11); doc.setFont('helvetica','normal'); doc.text(titulo,14,19);
  doc.setFillColor(217,138,11); doc.rect(0,26,W,1.2,'F');
  doc.setTextColor(22,32,42); doc.setFontSize(10);
  let y=35;
  if(ajustes.nombre){doc.text(`Trabajador: ${ajustes.nombre}`,14,y); y+=5;}
  if(ajustes.empresa){doc.text(`Empresa: ${ajustes.empresa}`,14,y); y+=5;}
  y-=1;

  const resumen=[['Horas trabajadas',fmt(r.total)+' h'],['Días trabajados',String(r.dias.length)],['Horas extra',fmt(r.extra)+' h'],
    ...Object.entries(r.porConcepto).map(([n,v])=>['   · '+n,fmt(v)+' h'])];
  if(precio>0) resumen.push(['Importe estimado extra',`${(r.extra/60*precio).toFixed(2).replace('.',',')} EUR (${precio.toFixed(2).replace('.',',')} EUR/h)`]);
  doc.autoTable({startY:y+2,body:resumen,theme:'plain',styles:{fontSize:10,cellPadding:1.4},columnStyles:{0:{fontStyle:'bold',cellWidth:60}},margin:{left:14}});

  const body=[];
  [...r.dias].reverse().forEach(d=>{
    const dd=parse(d.fecha+'T00:00');
    d.filas.forEach(({f,min,extra,dnc:sd},i)=>{
      const sal=f.salida?f.salida.slice(11)+(f.salida.slice(0,10)!==f.entrada.slice(0,10)?' (+1)':''):'en curso';
      body.push([i===0?`${DIAS[dd.getDay()]} ${pad(dd.getDate())}/${pad(dd.getMonth()+1)}`:'',nombreConcepto(f),f.entrada.slice(11),sal,i===0&&d.jornada?fmt(d.jornada):'',sd?fmt(sd):'',fmt(min),extra>0?fmt(extra):'',f.nota||'']);
    });
  });
  if(!body.length) body.push([{content:'Sin registros este mes',colSpan:9,styles:{halign:'center',textColor:[110,120,130]}}]);
  doc.autoTable({startY:doc.lastAutoTable.finalY+6,head:[['Fecha','Concepto','Entrada','Salida','Jornada','Sin desc.','Horas','Extra','Servicio / nota']],body,
    foot:[['Total','','','','','',fmt(r.total),fmt(r.extra),'']],
    styles:{fontSize:8.5,cellPadding:1.8,lineColor:[213,220,227],lineWidth:0.1},
    headStyles:{fillColor:[22,32,42],textColor:255},footStyles:{fillColor:[252,239,216],textColor:[22,32,42],fontStyle:'bold'},
    columnStyles:{0:{cellWidth:18},1:{cellWidth:30},2:{cellWidth:13},3:{cellWidth:16},4:{cellWidth:14,halign:'right'},5:{cellWidth:14,halign:'right'},6:{cellWidth:13,halign:'right'},7:{cellWidth:13,halign:'right',textColor:[180,100,0],fontStyle:'bold'}},
    margin:{left:14,right:14},
    didDrawPage:()=>{const H=doc.internal.pageSize.getHeight();doc.setFontSize(8);doc.setTextColor(110,120,130);doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`,14,H-8);doc.text(`Página ${doc.internal.getNumberOfPages()}`,W-14,H-8,{align:'right'});}});
  guardar(`horas-extra-${mes.y}-${pad(mes.m+1)}.pdf`,doc.output('blob'));
});

/* ---------- arranque ---------- */
$('#year').textContent=new Date().getFullYear();
store=localStore(); storeLabel(); resetForm(); render();
$('#csv').hidden=false; if(window.jspdf) $('#pdf').hidden=false;
setInterval(tick,1000);
if(fbListo){
  firebase.initializeApp(FIREBASE_CONFIG);
  firebase.firestore().enablePersistence({synchronizeTabs:true}).catch(()=>{}); // funciona sin cobertura y sincroniza después
  const auth=firebase.auth();
  auth.getRedirectResult().catch(e=>{$('#loginMsg').textContent=mensajeLogin(e)});
  auth.onAuthStateChanged(async u=>{
    if(store&&store.stop) store.stop();
    usuario=u;
    if(u){ $('#storeLabel').textContent='Sincronizando…'; try{await subirLocales(u)}catch(e){} store=nubeStore(u); }
    else { store=localStore(); render(); }
    storeLabel();
  });
  $('#login').addEventListener('click',async()=>{
    $('#loginMsg').textContent='';
    const p=new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'});
    try{ await auth.signInWithPopup(p); }
    catch(e){
      if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){ try{await auth.signInWithRedirect(p)}catch(e2){$('#loginMsg').textContent=mensajeLogin(e2)} }
      else $('#loginMsg').textContent=mensajeLogin(e);
    }
  });
  $('#logout').addEventListener('click',()=>auth.signOut());
  $('#avisoBtn').addEventListener('click',()=>{ const b=$('#ajustesBox'); b.open=true; b.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>$('#cW1').focus(),400); });
}
function mensajeLogin(e){
  const c=e&&e.code||'';
  if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request') return '';
  if(c==='auth/unauthorized-domain') return 'Este dominio no está autorizado en Firebase. Añádelo en Authentication → Configuración → Dominios autorizados.';
  if(c==='auth/network-request-failed') return 'Sin conexión. Inténtalo cuando tengas internet.';
  return 'No se pudo iniciar sesión ('+c+').';
}
})();
