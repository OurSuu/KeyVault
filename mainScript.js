// --- เพิ่ม global auth และ validation ตามสไตล์โปรเจกต์ ---
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// ===== ระบบถังขยะ Trash =====
let viewingTrash = false;

// ==== BUGFIX: Add viewTrashBtnHandler function for filter UI and "view trash" ====
function showTrashView() {
  viewingTrash = true;
  const mainSection = document.getElementById('main-section');
  if (mainSection) {
    mainSection.classList.add('blurred-bg');
  }
  document.body.style.overflow = 'hidden';
  renderTrash3DView();
}

function hideTrashView() {
  viewingTrash = false;
  const mainSection = document.getElementById('main-section');
  if (mainSection) {
    mainSection.classList.remove('blurred-bg');
  }
  document.body.style.overflow = '';
  const trashOverlay = document.getElementById('trash-3d-overlay');
  if (trashOverlay) trashOverlay.remove();
  renderAllCards();
}

// Render ถังขยะโฉมใหม่ (glass overlay)
// เปลี่ยนแสดงทั้งหมวดหมู่และรหัสที่อยู่ในถังขยะ
async function renderTrash3DView() {
  const prev = document.getElementById('trash-3d-overlay');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'trash-3d-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: 0,
    background: 'linear-gradient(120deg, rgba(10,15,30,0.96), rgba(20,25,50,0.92))',
    backdropFilter: 'blur(18px)',
    zIndex: 2500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
    animation: 'fadeIn 0.35s ease-out forwards'
  });

  const modal = document.createElement('div');
  modal.className = 'trash-modal-glass';
  Object.assign(modal.style, {
    width: '90%',
    maxWidth: '800px',
    background: 'linear-gradient(145deg, rgba(35,40,70,0.9), rgba(45,55,85,0.88))',
    border: '1.5px solid rgba(148,163,184,0.3)',
    borderRadius: '1.8rem',
    boxShadow: '0 15px 60px rgba(0,0,0,0.6)',
    padding: '2rem',
    color: '#fff',
    transform: 'perspective(1200px) rotateX(6deg) scale(1)',
    transition: 'transform .25s ease, box-shadow .3s ease',
    position: 'relative',
    overflow: 'hidden'
  });

  modal.addEventListener('mousemove', e => {
    const rect = modal.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y / rect.height) - 0.5) * -12;
    const rotateY = ((x / rect.width) - 0.5) * 12;
    modal.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.04)`;
    modal.style.boxShadow = '0 20px 60px rgba(14,165,233,0.35), 0 2px 18px rgba(234,179,8,0.25)';
  });
  modal.addEventListener('mouseleave', () => {
    modal.style.transform = 'perspective(1200px) rotateX(6deg) rotateY(0deg) scale(1)';
    modal.style.boxShadow = '0 15px 60px rgba(0,0,0,0.6)';
  });

  // Header & Actions
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.marginBottom = '1.3rem';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  const icon = document.createElement('span');
  icon.innerHTML = '🗑️';
  icon.style.fontSize = '1.7rem';
  icon.style.marginRight = '.6rem';
  const title = document.createElement('h2');
  title.textContent = 'ถังขยะของคุณ';
  Object.assign(title.style, {
    fontWeight: '800',
    fontSize: '1.5rem',
    color: '#facc15',
    letterSpacing: '.05em',
    textShadow: '0 2px 12px #fde04755'
  });
  titleWrap.append(icon, title);

  const btnBar = document.createElement('div');
  btnBar.style.display = 'flex';
  btnBar.style.gap = '.6rem';

  const makeBtn = (txt, color, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    Object.assign(b.style, {
      background: color,
      border: 'none',
      borderRadius: '.55rem',
      padding: '.45rem 1.1rem',
      color: '#fff',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'transform .2s, box-shadow .25s'
    });
    b.addEventListener('mouseenter', ()=> b.style.transform = 'scale(1.07)');
    b.addEventListener('mouseleave', ()=> b.style.transform = 'scale(1)');
    b.onclick = fn;
    return b;
  };

  btnBar.append(
    makeBtn('กู้คืนทั้งหมด', 'linear-gradient(90deg,#16a34a,#22c55e)', async ()=>{
      createPopup("กู้คืนรายการทั้งหมดในถังขยะ?", [], "ยืนยัน", async () => {
        try {
          await restoreAllTrash();
          await restoreAllTrashedCategories();
          await renderTrash3DView();
        } catch(e){ alert('เกิดข้อผิดพลาด: '+e?.message); }
      });
    }),
    makeBtn('ลบถาวรทั้งหมด', 'linear-gradient(90deg,#dc2626,#ef4444)', async ()=>{
      createPopup("ลบทุกอย่างในถังขยะถาวร? ยืนยัน?", [], "ยืนยัน", async () => {
        try {
          await deleteAllTrash();
          await deleteAllTrashedCategories();
          await renderTrash3DView();
        } catch(e){ alert('เกิดข้อผิดพลาด: '+e?.message); }
      });
    }),
    makeBtn('ปิด', 'linear-gradient(90deg,#0284c7,#38bdf8)', hideTrashView)
  );

  header.append(titleWrap, btnBar);
  modal.appendChild(header);

  // --- Section แสดงหมวดหมู่ในถังขยะก่อน ---
  const catTrashTitle = document.createElement('div');
  catTrashTitle.textContent = "หมวดหมู่ที่อยู่ในถังขยะ";
  catTrashTitle.style.color = "#83e68e";
  catTrashTitle.style.fontWeight = "700";
  catTrashTitle.style.fontSize = "1.1rem";
  catTrashTitle.style.marginBottom = ".6rem";
  modal.appendChild(catTrashTitle);

  const catListWrap = document.createElement('div');
  Object.assign(catListWrap.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.7rem',
    marginBottom: "1.8rem"
  });

  // แสดงหมวดหมู่ที่ถูกลบ (trashed)
  try {
    const catRes = await apiCall('/api/categories?trashed=1');
    let catData = [];
    if (catRes && catRes.ok) {
      catData = await catRes.json();
    }
    if (!catData.length) {
      const emptyCat = document.createElement('div');
      emptyCat.textContent = 'ไม่มีหมวดหมู่ในถังขยะ 🎊';
      Object.assign(emptyCat.style, {
        color: '#7dd3fc',
        fontSize: '1.04rem'
      });
      catListWrap.appendChild(emptyCat);
    } else {
      catData.forEach(cat => {
        const catCard = document.createElement('div');
        Object.assign(catCard.style, {
          background: 'linear-gradient(135deg,#064e3b,#172554)',
          border: '1px solid #0ea5e9aa',
          borderRadius: '0.75rem',
          padding: '0.8rem 1.1rem',
          color: '#bef264',
          fontWeight: 'bold',
          fontSize: '1rem',
          boxShadow: '0 3px 12px rgba(5,150,105,0.13)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        });
        catCard.innerHTML = `
          <div style="font-size:1.05em;">${cat.name}</div>
          <div style="font-size:0.91em;color:#94a3b8;font-weight:400;margin-bottom:.18em">slug: ${cat.slug || cat.name}</div>
          ${cat?.deleted_at ? `<div style="font-size:0.89em;color:#fbbf24;font-weight:400;">ลบเมื่อ: ${new Date(cat.deleted_at).toLocaleString('th-TH')}</div>` : ''}
        `;
        // btns
        const catBtnWrap = document.createElement('div');
        catBtnWrap.style.display = "flex";
        catBtnWrap.style.gap = "0.28em";
        catBtnWrap.style.marginTop = ".4em";
        const restoreBtn = makeBtn("กู้คืน", "linear-gradient(90deg,#16a34a,#22c55e)", async()=>{
          createPopup(
            `กู้คืนหมวดหมู่ <span style="color:#facc15">${cat.name}</span>?`,
            [],
            "ยืนยัน",
            async ()=>{
              try {
                await restoreCategory(cat.slug || cat.name);
                await renderTrash3DView();
              } catch(e){alert('เกิดข้อผิดพลาด: '+e?.message);}
            }
          );
        });
        const deleteBtn = makeBtn("ลบถาวร", "linear-gradient(90deg,#dc2626,#ef4444)", async()=>{
          createPopup(
            `ลบถาวรหมวดหมู่ <span style="color:#f87171">${cat.name}</span>?`,
            [],
            "ยืนยัน",
            async ()=>{
              try {
                await hardDeleteCategory(cat.slug || cat.name);
                await renderTrash3DView();
              } catch(e){alert('เกิดข้อผิดพลาด: '+e?.message);}
            }
          );
        });
        catBtnWrap.append(restoreBtn, deleteBtn);
        catCard.appendChild(catBtnWrap);
        catListWrap.appendChild(catCard);
      });
    }
  } catch(err) {
    const errCat = document.createElement('div');
    errCat.textContent = 'โหลดหมวดหมู่ถังขยะไม่สำเร็จ';
    errCat.style.color = 'red';
    catListWrap.appendChild(errCat);
  }
  modal.appendChild(catListWrap);

  // --- Divider ---
  const divider = document.createElement('hr');
  divider.style.margin = '0.9rem 0 1.1rem';
  divider.style.border = 'none';
  divider.style.borderTop = '1.8px dashed #93c5fd44';
  modal.appendChild(divider);

  // --- ต่อด้วย Section รายการ Code ที่อยู่ในถังขยะ ---
  const codeTrashTitle = document.createElement('div');
  codeTrashTitle.textContent = "รหัสที่อยู่ในถังขยะ";
  codeTrashTitle.style.color = "#fbbf24";
  codeTrashTitle.style.fontWeight = "700";
  codeTrashTitle.style.fontSize = "1.08rem";
  codeTrashTitle.style.marginBottom = ".6rem";
  modal.appendChild(codeTrashTitle);

  const listWrap = document.createElement('div');
  Object.assign(listWrap.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))',
    gap: '1.1rem',
    paddingTop: '.8rem'
  });

  try {
    const res = await apiCall('/api/codes?trashed=1');
    let data = [];
    if (res && res.ok) {
      data = await res.json();
    }
    if (!data.length) {
      const empty = document.createElement('div');
      empty.textContent = 'ไม่มีรหัสในถังขยะ 🎉';
      Object.assign(empty.style, {
        gridColumn: '1 / -1',
        textAlign: 'center',
        color: '#eab308',
        fontSize: '1.05rem',
        opacity: '0.9'
      });
      listWrap.appendChild(empty);
    } else {
      data.forEach(item => {
        const card = document.createElement('div');
        Object.assign(card.style, {
          background: 'linear-gradient(135deg,#1e293b,#334155)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: '1rem',
          padding: '1rem',
          boxShadow: '0 3px 14px rgba(0,0,0,0.4)',
          transition: 'transform .25s, box-shadow .25s',
          cursor: 'pointer'
        });
        card.addEventListener('mouseenter', ()=> card.style.transform='translateY(-5px) scale(1.03)');
        card.addEventListener('mouseleave', ()=> card.style.transform='translateY(0) scale(1)');

        const name = document.createElement('h3');
        name.textContent = item.name;
        Object.assign(name.style, {color:'#fbbf24',fontWeight:'700',marginBottom:'.3rem'});

        const info = document.createElement('div');
        info.textContent = `หมวดหมู่: ${item.category}`;
        info.style.color = '#cbd5e1';
        info.style.fontSize = '.9rem';
        info.style.marginBottom = '.3rem';

        // ปุ่มกู้คืน และ ลบถาวร ด้วย popup ยืนยัน
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '.4rem';

        const restore = makeBtn('กู้คืน','#22c55e', async(e)=>{
          e?.stopPropagation();
          createPopup("กู้คืนรหัสนี้?", [], "ยืนยัน", async () => {
            try {
              await restoreCode(item.id);
              await renderTrash3DView();
            } catch(e){ alert('เกิดข้อผิดพลาด: '+e.message);}
          });
        });
        const del = makeBtn('ลบถาวร','#ef4444', async(e)=>{
          e?.stopPropagation();
          createPopup("ลบถาวรรหัสนี้?", [], "ยืนยัน", async () => {
            try {
              await hardDeleteCode(item.id);
              await renderTrash3DView();
            } catch(e){ alert('เกิดข้อผิดพลาด: '+e.message);}
          });
        });

        btns.append(restore, del);

        // แสดงรายละเอียด: popup
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          createPopup(
            "รายละเอียดรหัสในถังขยะ",
            [
              (() => {
                const det = document.createElement('div');
                det.style.padding = "0.34rem 0";
                det.style.color = "#fde68a";
                det.innerHTML = `
                  <div style="margin-bottom: 0.19em"><b>ชื่อ:</b> ${item.name}</div>
                  <div style="margin-bottom: 0.21em"><b>หมวดหมู่:</b> ${item.category}</div>
                  ${item.description ? '<div style="margin-bottom:0.18em;"><b>รายละเอียด:</b> ' + item.description + '</div>' : ""}
                  ${item.created_at ? `<div><b>วันสร้าง:</b> ${new Date(item.created_at).toLocaleDateString('th-TH')}</div>` : ''}
                `;
                return det;
              })()
            ],
            "ปิด"
          );
        });

        card.append(name, info, btns);
        listWrap.appendChild(card);
      });
    }
  } catch {
    const err = document.createElement('div');
    err.textContent = 'โหลดข้อมูลถังขยะไม่สำเร็จ';
    err.style.color = 'red';
    err.style.textAlign = 'center';
    err.style.gridColumn = '1 / -1';
    listWrap.appendChild(err);
  }

  modal.appendChild(listWrap);
  overlay.appendChild(modal);
  overlay.addEventListener('click', e => { if (e.target === overlay) hideTrashView(); });
  document.body.appendChild(overlay);
}

// -------------------------- Category Trash/Restore/Hard Delete API Section ---------------------------
async function restoreCategory(slugOrName) {
  const res = await apiCall(`/api/categories/${encodeURIComponent(slugOrName)}/restore`, { method: 'POST' });
  if (!res || !res.ok) throw new Error('Restore category failed');
}
async function hardDeleteCategory(slugOrName) {
  const res = await apiCall(`/api/categories/${encodeURIComponent(slugOrName)}/force-delete`, { method: 'DELETE' });
  if (!res || !res.ok) throw new Error('Permanent delete category failed');
}
async function restoreAllTrashedCategories() {
  // สมมุติมี endpoint bulk restore
  const res = await apiCall(`/api/categories/restore-all`, { method: 'POST' });
  if (!res || !res.ok) throw new Error('Restore all categories failed');
}
async function deleteAllTrashedCategories() {
  // สมมุติมี endpoint bulk delete
  const res = await apiCall(`/api/categories/force-delete-all`, { method: 'DELETE' });
  if (!res || !res.ok) throw new Error('Delete all categories failed');
}
// --------------------------------------------------------------------------------------------

// ถังขยะรหัส
async function restoreCode(id) {
  const res = await apiCall(`/api/codes/${id}/restore`, { method: 'POST' });
  if (!res || !res.ok) throw new Error('Restore failed');
}
async function hardDeleteCode(id) {
  const res = await apiCall(`/api/codes/${id}/force-delete`, { method: 'DELETE' });
  if (!res || !res.ok) throw new Error('Permanent delete failed');
}
async function restoreAllTrash() {
  const res = await apiCall(`/api/codes/restore-all`, { method: 'POST' });
  if (!res || !res.ok) throw new Error('Restore all failed');
}
async function deleteAllTrash() {
  const res = await apiCall(`/api/codes/force-delete-all`, { method: 'DELETE' });
  if (!res || !res.ok) throw new Error('Delete all failed');
}
// ------ END ระบบถังขยะ ------

// ฟังก์ชันเรียก API พร้อม auth - ใส่ Bearer prefix ตาม requirement
async function apiCall(endpoint, options = {}) {
  const currentToken = localStorage.getItem('authToken');
  if (!currentToken) {
    console.error('No auth token available for API call');
    window.location.href = '/';
    return null;
  }

  try {
    // FIX: If method is PATCH/POST/PUT/DELETE and options.body exists, always send Content-Type!
    let config = {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        ...(options.headers || {}),
      },
      ...options,
    };
    if (
      config.method &&
      ['PATCH', 'POST', 'PUT', 'DELETE'].includes(config.method.toUpperCase())
    ) {
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
    // PATCH: Fix bug with fetch options  
    if (config.body && typeof config.body !== "string") {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(endpoint, config);

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
      return null;
    }

    return response;
  } catch (error) {
    console.error('Network error:', error);
    throw error;
  }
}

// ฟังก์ชันลบหมวดหมู่ให้ย้ายไปถังขยะ (Soft Delete)
async function deleteCategory(categorySlugOrName) {
  try {
    // PATCH: "Soft delete" (move to trash, not hard delete) (method PATCH assumed)
    const res = await apiCall(
      `/api/categories/${encodeURIComponent(categorySlugOrName)}/trash`,
      { method: 'PATCH' }
    );
    if (!res || !res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "ลบหมวดหมู่ไม่สำเร็จ");
    }
    const result = await res.json();
    alert(result.message || "ย้ายหมวดหมู่ไปถังขยะเรียบร้อยแล้ว");
    await loadDataAndRender();
  } catch (err) {
    alert("เกิดข้อผิดพลาดขณะลบหมวดหมู่: " + (err?.message || ''));
  }
}

// Utils: UI อัพเดท categories (เพิ่ม "ถังขยะ")
// เพิ่มปุ่มลบหมวดหมู่ในแต่ละรายการ (เหลือแค่ปุ่มเดียว ไม่ต้องมีปุ่มลบถาวร)
function updateCategoriesUI(categories) {
  const filtersContainer = document.getElementById("category-filters");
  if (!filtersContainer) return;
  filtersContainer.innerHTML = '';
  // ปุ่ม 'ทั้งหมด' อยู่แรกเสมอ
  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.dataset.category = 'all';
  allBtn.innerText = 'ทั้งหมด';
  filtersContainer.appendChild(allBtn);
  (categories || []).forEach(cat => {
    // ไม่แสดงหมวดหมู่ที่ถูกลบ (trashed) ใน list หลัก (ต้องแสดงในถังขยะเท่านั้น)
    if (cat.deleted || cat.deleted_at) return;

    const btnWrap = document.createElement('div');
    btnWrap.style.display = "flex";
    btnWrap.style.alignItems = "center";
    btnWrap.style.marginRight = "0.33em";
    btnWrap.style.position = "relative";
    btnWrap.style.gap = "0.12em";

    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat.slug || cat.name;
    btn.innerText = cat.name;
    btnWrap.appendChild(btn);

    // ปุ่มลบหมวดหมู่ (soft/ย้ายไปถังขยะ)
    const delBtn = document.createElement('button');
    delBtn.innerHTML = "×";
    delBtn.title = "ลบหมวดหมู่นี้ (ย้ายไปถังขยะ)";
    Object.assign(delBtn.style, {
      marginLeft: '0.22em',
      background: 'rgba(255,68,68,0.12)',
      border: 'none',
      borderRadius: '0.35em',
      color: '#dc2626',
      fontWeight: 'bold',
      padding: '0.17em 0.56em',
      fontSize: '1em',
      cursor: 'pointer',
      transition: 'background 0.18s'
    });
    delBtn.addEventListener('mouseenter', ()=> { delBtn.style.background = 'rgba(239,68,68,0.38)'; });
    delBtn.addEventListener('mouseleave', ()=> { delBtn.style.background = 'rgba(255,68,68,0.12)'; });

    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      createPopup(
        "ลบหมวดหมู่?",
        [
          (() => {
            const warn = document.createElement('div');
            warn.style.color = "#dc2626";
            warn.style.fontWeight = "bold";
            warn.style.marginBottom = ".5em";
            warn.innerHTML = `ยืนยันการลบหมวดหมู่ <span style="color:#ef4444">${cat.name}</span>?<br> <span style="font-size:.98em; color:#f59e42;">* หมวดหมู่นี้จะถูกย้ายไปถังขยะ (สามารถกดกู้คืนได้ในถังขยะ!)</span>`;
            return warn;
          })()
        ],
        "ยืนยันลบ",
        async () => {
          await deleteCategory(cat.slug || cat.name);
        }
      );
    });
    btnWrap.appendChild(delBtn);

    filtersContainer.appendChild(btnWrap);
  });
  // ปุ่มดูถังขยะ
  const trashBtn = document.createElement('button');
  trashBtn.id = 'trash-btn';
  trashBtn.innerText = 'ถังขยะ 🗑️';
  trashBtn.className = 'trash-btn';
  Object.assign(trashBtn.style, {
    marginLeft: "auto",
    background: "#334155",
    color: "#fbbf24",
    border: "1px solid #64748b",
    borderRadius: "0.45rem",
    padding: "0.37rem 0.9rem",
    cursor: "pointer",
    fontWeight: "bold"
  });
  trashBtn.addEventListener("click", () => showTrashView());
  filtersContainer.appendChild(trashBtn);

  // ไม่ต้องสร้าง restore-all-btn และ delete-trash-btn แยกออกมาอีก (เราทำ action ใน 3D หน้าใหม่แทน)
  if (window.updateFilterEvents) window.updateFilterEvents();
}

// อัพเดท Event สำหรับ Filter Buttons
window.updateFilterEvents = function() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      // FIX: ถ้าไม่ใช่ trash-btn ควรปิดถังขยะ
      if (this.id !== "trash-btn") {
        viewingTrash = false;
        hideTrashView();
        renderAllCards();
      } else {
        showTrashView();
      }
    });
  });
};

// Utils: อัพเดทรายการ code cards - "ซ่อนรหัส", "แสดง/คัดลอก"
function updateCodesList(codes) {
  const codeList = document.getElementById("code-list");
  codeList.innerHTML = "";
  if (!codes || codes.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.padding = "1.7rem";
    emptyMsg.style.color = "#94a3b8";
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.fontSize = "1.05rem";
    emptyMsg.style.opacity = "0.92";
    emptyMsg.textContent = "ยังไม่มีรหัสในหมวดหมู่นี้";
    codeList.appendChild(emptyMsg);
    return;
  }

  codes.forEach(item => {
    // ข้ามถ้าเป็นรหัสในถังขยะ (ควรไม่มาอยู่ในนี้)
    if (item.deleted || item.deleted_at) return;

    const card = document.createElement("div");
    card.className = "code-card";
    card.dataset.category = item.category;
    card.style.cursor = "pointer";

    // Create card content
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";

    const title = document.createElement("h3");
    title.className = "font-semibold text-lg";
    title.textContent = item.name;

    // ซ่อนรหัสไว้ก่อน ถ้ายังไม่กดดู
    const codeRow = document.createElement("div");
    codeRow.style.display = "flex";
    codeRow.style.alignItems = "center";
    codeRow.style.marginTop = "0.25rem";
    const codeLabel = document.createElement("span");
    codeLabel.className = "text-gray-300 text-sm";
    codeLabel.textContent = "Code: ";

    const codeSpan = document.createElement("span");
    codeSpan.className = "code-hide";
    codeSpan.style.letterSpacing = "2px";
    codeSpan.style.userSelect = "none";
    codeSpan.textContent = "••••••••••"; // ซ่อนเป็นจุด

    const showBtn = document.createElement("button");
    showBtn.textContent = "แสดง";
    showBtn.style.marginLeft = "0.5rem";
    showBtn.style.fontSize = "0.85em";
    showBtn.style.background = "rgba(59,130,246,0.13)";
    showBtn.style.border = "1px solid #3b82f6";
    showBtn.style.color = "#3b82f6";
    showBtn.style.borderRadius = "0.41rem";
    showBtn.style.padding = "0 0.7rem";
    showBtn.style.height = "25px";
    showBtn.style.display = "inline-flex";
    showBtn.style.alignItems = "center";
    showBtn.style.cursor = "pointer";
    showBtn.style.transition = "background .2s";

    let revealed = false;

    // ปุ่มคัดลอก (ในตอน reveal แล้ว)
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "คัดลอก";
    copyBtn.style.marginLeft = "0.4rem";
    copyBtn.style.fontSize = "0.85em";
    copyBtn.style.background = "rgba(29,185,84,0.15)";
    copyBtn.style.border = "1px solid #22c55e";
    copyBtn.style.color = "#22c55e";
    copyBtn.style.borderRadius = "0.41rem";
    copyBtn.style.padding = "0 0.7rem";
    copyBtn.style.height = "25px";
    copyBtn.style.display = "none";
    copyBtn.style.alignItems = "center";
    copyBtn.style.cursor = "pointer";
    copyBtn.style.transition = "background .2s";

    showBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!revealed) {
        codeSpan.textContent = item.code;
        codeSpan.style.userSelect = "all";
        revealed = true;
        showBtn.textContent = "ซ่อน";
        copyBtn.style.display = "inline-flex";
      } else {
        codeSpan.textContent = "••••••••••";
        codeSpan.style.userSelect = "none";
        revealed = false;
        showBtn.textContent = "แสดง";
        copyBtn.style.display = "none";
      }
    });

    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (revealed) {
        navigator.clipboard.writeText(item.code).then(() => {
          copyBtn.textContent = "คัดลอกแล้ว!";
          setTimeout(() => { copyBtn.textContent = "คัดลอก"; }, 900);
        }).catch(() => {
          alert('ไม่สามารถคัดลอกได้');
        });
      }
    });

    codeRow.appendChild(codeLabel);
    codeRow.appendChild(codeSpan);
    codeRow.appendChild(showBtn);
    codeRow.appendChild(copyBtn);

    // ส่วนรายละเอียด
    const detailDiv = document.createElement("div");
    detailDiv.className = "mt-2 text-sm text-gray-400";
    detailDiv.innerHTML = `
      <span class="block">รายละเอียด: ${item.description || ""}</span>
      ${item.created_at ? `<span class="block">วันสร้าง: ${new Date(item.created_at).toLocaleDateString('th-TH')}</span>` : ''}
    `;

    // ประกอบ card
    card.appendChild(deleteBtn);
    card.appendChild(title);
    card.appendChild(codeRow);
    card.appendChild(detailDiv);

    // BUGFIX: Button ต้องไม่ปิด popup แล้วคิว async ถูก interrupt
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      createPopup("ย้ายรหัสนี้ไปถังขยะ?", [], "ยืนยัน", async () => {
        try {
          // FIX: await, check return, update UI
          const ok = await trashCode(item.id);
          if (!ok) throw new Error("ล้มเหลว");
          // BUGFIX: หลังย้ายไปถังขยะ ควรรีเฟรชหน้าหลัก
          await renderAllCards();
        } catch (err) {
          alert("เกิดข้อผิดพลาดขณะลบ");
        }
      });
    });

    // ดูรายละเอียด
    card.addEventListener("click", () => showCardDetailPopup(item));
    codeList.appendChild(card);
  });
}

async function trashCode(codeId) {
  try {
    const response = await apiCall(`/api/codes/${codeId}/trash`, { method: 'PATCH' });
    return response && response.ok;
  } catch (err) {
    throw err;
  }
}

// Parallax Effect (คงเดิม)
function setupParallax() {
  const bg = document.getElementById("background-layer");
  document.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const offsetX = (e.clientX - cx) / cx;
    const offsetY = (e.clientY - cy) / cy;
    if (bg) {
      const moveX = -offsetX * 30;
      const moveY = -offsetY * 30;
      bg.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.05)`;
    }
    const container = document.querySelector(".main-card");
    if (container) {
      const tiltX = -offsetY * 8;
      const tiltY = offsetX * 8;
      container.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
      container.style.transition = "transform 0.15s cubic-bezier(.15,.85,.32,1.2)";
    }
  });
  document.addEventListener("mouseleave", () => {
    const container = document.querySelector(".main-card");
    if (container) {
      container.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)";
      container.style.transition = "transform 0.4s cubic-bezier(.35,.95,.55,1.45)";
    }
  });
}

// ===== Popup Template =====   (เหมือนเดิม)
function createPopup(titleText, contentElements = [], confirmText = "ตกลง", onConfirm = null, showCancel = true) {
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3000,
  });
  const popup = document.createElement("div");
  Object.assign(popup.style, {
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "1rem",
    padding: "1.6rem",
    width: "360px",
    maxWidth: "95%",
    textAlign: "left",
    color: "white",
    transform: "scale(0.95)",
    opacity: "0",
    transition: "all 0.25s ease-out",
  });
  const title = document.createElement("h3");
  title.textContent = titleText;
  Object.assign(title.style, {
    fontSize: "1.2rem",
    fontWeight: "700",
    marginBottom: "1rem",
    color: "#60a5fa",
  });
  const contentWrap = document.createElement("div");
  contentWrap.style.display = "flex";
  contentWrap.style.flexDirection = "column";
  contentWrap.style.gap = "0.6rem";
  contentWrap.append(...contentElements);
  const btnContainer = document.createElement("div");
  btnContainer.style.display = "flex";
  btnContainer.style.justifyContent = "flex-end";
  btnContainer.style.gap = "0.5rem";
  btnContainer.style.marginTop = "1rem";
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "ยกเลิก";
  Object.assign(cancelBtn.style, {
    padding: "0.45rem 0.9rem",
    borderRadius: "0.45rem",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    cursor: "pointer",
  });
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = confirmText;
  Object.assign(confirmBtn.style, {
    padding: "0.45rem 0.9rem",
    borderRadius: "0.45rem",
    background: "linear-gradient(90deg, #2563eb, #3b82f6)",
    border: "none",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
  });
  if (showCancel) btnContainer.append(cancelBtn, confirmBtn);
  else btnContainer.append(confirmBtn);
  popup.append(title, contentWrap, btnContainer);
  overlay.appendChild(popup);
  setTimeout(() => {
    popup.style.transform = "scale(1)";
    popup.style.opacity = "1";
  }, 10);
  cancelBtn.addEventListener("click", () => overlay.remove());
  confirmBtn.addEventListener("click", () => {
    if (typeof onConfirm === "function") onConfirm();
    overlay.remove();
  });
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  return { overlay, popup, confirmBtn, cancelBtn, contentWrap };
}

// โหลดข้อมูลจาก server
async function loadDataAndRender() {
  const loadingState = document.getElementById("loading-state");

  try {
    if (loadingState) {
      loadingState.classList.add('hidden');
    }

    // เฉพาะ list หมวดหมู่ไม่รวม trashed ในหน้าหลัก
    const [codesResponse, categoriesResponse] = await Promise.all([
      apiCall('/api/codes'),
      apiCall('/api/categories')
    ]);

    if (codesResponse && codesResponse.ok && categoriesResponse && categoriesResponse.ok) {
      const codes = await codesResponse.json();
      let categories = await categoriesResponse.json();
      // กรองไม่เอาที่ถูกลบเด็ดขาด (ในหมวด filter ปกติ)
      categories = categories.filter(x => !x.deleted && !x.deleted_at);
      updateCategoriesUI(categories);
      updateCodesList(codes);
    }
  } catch (error) {
    console.error('Failed to load data:', error);
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
  }
}

// Render รายการ code ตาม filter/search
async function renderAllCards() {
  if (viewingTrash) return renderTrash3DView();
  try {
    const filters = document.querySelectorAll(".filter-btn.active");
    const currentCat = filters.length ? filters[0].dataset.category : "all";
    const searchTerm = document.getElementById('search-input')?.value || '';
    const endpoint = `/api/codes?category=${encodeURIComponent(currentCat)}&search=${encodeURIComponent(searchTerm)}`;
    const response = await apiCall(endpoint);
    if (response && response.ok) {
      const codes = await response.json();
      updateCodesList(codes);
    }
  } catch (error) {
    console.error('Failed to load codes:', error);
  }
}

// add code (API)
async function addNewCode(codeData) {
  try {
    const response = await apiCall('/api/codes', {
      method: 'POST',
      body: JSON.stringify(codeData)
    });
    if (response && response.ok) {
      return await response.json();
    } else if (response) {
      let error = {};
      try { error = await response.json(); } catch {}
      throw new Error(error.error || 'เพิ่มข้อมูลไม่สำเร็จ');
    } else {
      throw new Error("Network/API error");
    }
  } catch (err) {
    throw err;
  }
}

// edit code (API)
async function updateCode(codeId, codeData) {
  try {
    const response = await apiCall(`/api/codes/${codeId}`, {
      method: 'PUT',
      body: JSON.stringify(codeData)
    });
    if (response && response.ok) {
      return await response.json();
    } else if (response) {
      let error = {};
      try { error = await response.json(); } catch {}
      throw new Error(error.error || 'แก้ไขข้อมูลไม่สำเร็จ');
    } else {
      throw new Error("Network/API error");
    }
  } catch (err) {
    throw err;
  }
}

// ฟังก์ชันติดตั้ง Event Listeners
function setupEventListeners() {
  const addCategoryBtn = document.getElementById('add-category-btn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', showAddCategoryPopup);
  }

  const addCodeBtn = document.getElementById('add-code-btn');
  if (addCodeBtn) {
    addCodeBtn.addEventListener('click', showAddCodePopup);
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
    });
  }
}

// แสดง Popup เพิ่มหมวดหมู่
function showAddCategoryPopup() {
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'ชื่อหมวดหมู่';
  Object.assign(nameInput.style, {
    padding: '0.6rem',
    borderRadius: '0.4rem',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    width: '100%'
  });

  createPopup(
    "เพิ่มหมวดหมู่ใหม่",
    [nameInput],
    "บันทึก",
    async () => {
      const name = nameInput.value.trim();
      if (!name) {
        alert('กรุณากรอกชื่อหมวดหมู่');
        return;
      }

      try {
        const response = await apiCall('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name })
        });

        if (response && response.ok) {
          await loadDataAndRender();
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
      }
    }
  );
}

// แสดง Popup เพิ่มรหัสใหม่ (หมวดหมู่เปลี่ยนเป็น select)
async function showAddCodePopup() {
  let categories = [];
  try {
    const catRes = await apiCall('/api/categories');
    if (catRes && catRes.ok) {
      categories = await catRes.json();
    }
  } catch {}

  // Filter out trashed categories
  categories = (categories || []).filter(x => !x.deleted && !x.deleted_at);

  // สร้างฟอร์ม input ต่างๆ
  const nameInput = createFormInput('ชื่อรหัส');
  const codeInput = createFormInput('รหัส');
  const descInput = createFormInput('รายละเอียด (ไม่จำเป็น)');
  const categorySelect = document.createElement('select');
  Object.assign(categorySelect.style, {
    padding: '0.6rem',
    borderRadius: '0.4rem',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#cbd5e1',
    width: '100%',
    marginBottom: '0.5rem'
  });
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'เลือกหมวดหมู่';
  defaultOption.style.color = '#cbd5e1';
  categorySelect.appendChild(defaultOption);

  if (categories && categories.length > 0) {
    for (const cat of categories) {
      const option = document.createElement('option');
      option.value = cat.slug || cat.name;
      option.textContent = cat.name;
      option.style.color = "white";
      categorySelect.appendChild(option);
    }
  }
  function updateSelectTextColor() {
    if (categorySelect.value === '' || !categorySelect.value) {
      categorySelect.style.color = '#cbd5e1';
    } else {
      categorySelect.style.color = 'white';
    }
  }
  updateSelectTextColor();
  categorySelect.addEventListener('change', updateSelectTextColor);

  // --- เปลี่ยนฟิลด์วันหมดอายุเป็นวันสร้าง (readonly/show only) ---
  // แทนที่จะให้ใส่เอง ให้ generate เป็นวันนี้และ disabled
  const createdInput = document.createElement('input');
  createdInput.type = 'text';
  createdInput.readOnly = true;
  createdInput.disabled = true;
  const todayDate = new Date().toLocaleDateString('th-TH');
  createdInput.value = todayDate;
  Object.assign(createdInput.style, {
    padding: '0.6rem',
    borderRadius: '0.4rem',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    width: '100%',
    marginBottom: '0.5rem'
  });

  const contentElements = [
    createLabel('ชื่อรหัส'), nameInput,
    createLabel('รหัส'), codeInput,
    createLabel('รายละเอียด'), descInput,
    createLabel('หมวดหมู่'), categorySelect,
    createLabel('วันสร้าง'), createdInput
  ];

  createPopup(
    "เพิ่มรหัสใหม่",
    contentElements,
    "บันทึก",
    async () => {
      const codeData = {
        name: nameInput.value.trim(),
        code: codeInput.value.trim(),
        description: descInput.value.trim(),
        category: categorySelect.value.trim()
        // ไม่ต้องเก็บวันสร้างตรงนี้ (API handle เอง)
      };

      if (!codeData.name || !codeData.code || !codeData.category) {
        alert('กรุณากรอกข้อมูลให้ครบ');
        return;
      }

      try {
        await addNewCode(codeData);
        await renderAllCards();
      } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
      }
    }
  );
}

// แสดง Popup รายละเอียดการ์ด
function showCardDetailPopup(item) {
  const content = document.createElement('div');

  // สำหรับแสดง + คัดลอกรหัส
  const codeRow = document.createElement("div");
  codeRow.style.display = "flex";
  codeRow.style.alignItems = "center";
  codeRow.style.marginBottom = "0.5rem";

  const codeLabel = document.createElement("span");
  codeLabel.textContent = "รหัส: ";
  codeLabel.style.marginRight = "0.33em";
  codeLabel.style.fontWeight = "600";
  codeLabel.style.color = "#bfdbfe";

  const codeSpan = document.createElement("span");
  codeSpan.textContent = item.code;
  codeSpan.style.fontFamily = "monospace";
  codeSpan.style.letterSpacing = "1.5px";
  codeSpan.style.userSelect = "all";
  codeSpan.style.fontWeight = "bold";
  codeSpan.style.color = "#fff";
  codeSpan.style.background = "rgba(96,165,250,0.07)";
  codeSpan.style.padding = "2px 7px";
  codeSpan.style.borderRadius = "0.4em";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "คัดลอก";
  copyBtn.style.marginLeft = "0.5em";
  copyBtn.style.fontSize = "0.87em";
  copyBtn.style.padding = "0 0.7em";
  copyBtn.style.background = "rgba(29,185,84,0.12)";
  copyBtn.style.border = "1px solid #22c55e";
  copyBtn.style.color = "#22c55e";
  copyBtn.style.borderRadius = "0.41rem";
  copyBtn.style.height = "27px";
  copyBtn.style.display = "inline-flex";
  copyBtn.style.alignItems = "center";
  copyBtn.style.cursor = "pointer";
  copyBtn.style.transition = "background .2s";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.code).then(() => {
      copyBtn.textContent = "คัดลอกแล้ว!";
      setTimeout(() => { copyBtn.textContent = "คัดลอก"; }, 900);
    }).catch(() => {
      alert('ไม่สามารถคัดลอกได้');
    });
  });

  codeRow.appendChild(codeLabel);
  codeRow.appendChild(codeSpan);
  codeRow.appendChild(copyBtn);

  // Content Detail
  const detailBlock = document.createElement('div');
  detailBlock.innerHTML = `
    <div style="margin-bottom: 0.5rem;"><strong>ชื่อ:</strong> ${item.name}</div>
    <div style="margin-bottom: 0.5rem;"><strong>หมวดหมู่:</strong> ${item.category}</div>
    ${item.description ? `<div style="margin-bottom: 0.5rem;"><strong>รายละเอียด:</strong> ${item.description}</div>` : ''}
    ${item.created_at ? `<div style="margin-bottom: 0.5rem;"><strong>วันสร้าง:</strong> ${new Date(item.created_at).toLocaleDateString('th-TH')}</div>` : ''}
  `;
  content.appendChild(codeRow);
  content.appendChild(detailBlock);

  createPopup(
    "รายละเอียดรหัส",
    [content],
    "ปิด"
  );
}

function createFormInput(placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  Object.assign(input.style, {
    padding: '0.6rem',
    borderRadius: '0.4rem',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    width: '100%',
    marginBottom: '0.5rem'
  });
  return input;
}

function createLabel(text) {
  const label = document.createElement('div');
  label.textContent = text;
  Object.assign(label.style, {
    color: '#cbd5e1',
    fontSize: '0.9rem',
    marginBottom: '0.2rem',
    marginTop: '0.5rem'
  });
  return label;
}

// ========== DOMContentLoaded: ตรวจสอบ token กับ API, ติดตั้ง EventListeners, parallax, และโหลดข้อมูล ==========
document.addEventListener("DOMContentLoaded", async () => {
  // 🔍 DEBUG: ตรวจสอบ Token
  const currentToken = localStorage.getItem('authToken');
  console.log('🔍 DEBUG - Current Token:', currentToken);
  console.log('🔍 DEBUG - Full localStorage:', localStorage);

  if (!currentToken) {
    console.error('❌ NO TOKEN FOUND - Redirecting to login');
    window.location.href = '/';
    return;
  }

  try {
    // ทดสอบ Token กับ Server
    const testResponse = await fetch('/api/debug/token-check', {
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    });

    const debugData = await testResponse.json();
    if (testResponse.ok) {
      setupEventListeners();
      await loadDataAndRender();
      setupParallax();
    } else {
      throw new Error('Token validation failed');
    }
  } catch (error) {
    console.error('❌ Token test failed:', error);
    window.location.href = '/';
  }
});
