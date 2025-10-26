document.addEventListener("DOMContentLoaded", () => {
  // ===== BG: กำหนดเอง ใช้ธีม KeyVault KeepMemo =====

  document.querySelectorAll(".background-wave-parallax").forEach(el => el.remove());

  function showBgErrorBanner() {
    if (document.getElementById("background-load-fail-banner")) return;
    const banner = document.createElement("div");
    banner.id = "background-load-fail-banner";
    banner.textContent = "พื้นหลังโหลดไม่สำเร็จ กำลังใช้งานพื้นหลังสีเหลืองแทน";
    Object.assign(banner.style, {
      position: "fixed",
      top: "17px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#fef3c7",
      color: "#b45309",
      border: "2px solid #fde68a",
      borderRadius: "0.9rem",
      padding: "0.58rem 1.9rem",
      fontWeight: "600",
      fontSize: "1.09rem",
      boxShadow: "0 4px 20px #f59e0b33",
      zIndex: 10001,
      opacity: "0.94",
      pointerEvents: "none"
    });
    document.body.appendChild(banner);
    setTimeout(() => { banner.remove(); }, 3500);
  }

  function setBgImageWithFallback(div, url) {
    let loaded = false;
    const img = new window.Image();
    img.src = url;

    img.onload = function() {
      loaded = true;
      div.style.backgroundImage = `url('${url}')`;
      div.style.backgroundColor = "#ffe082";
    };
    img.onerror = function() {
      div.style.backgroundImage = "";
      div.style.backgroundColor = "#ffe082";
      showBgErrorBanner();
    };
    setTimeout(() => {
      if (!loaded) {
        div.style.backgroundImage = "";
        div.style.backgroundColor = "#ffe082";
      }
    }, 1200);
  }

  let BG_IMAGE_URL = "https://wallpapercave.com/wp/wp11280209.jpg";
  if (window.BG_IMAGE_URL && typeof window.BG_IMAGE_URL === "string" && window.BG_IMAGE_URL.trim()) {
    BG_IMAGE_URL = window.BG_IMAGE_URL.trim();
  }
  if (!BG_IMAGE_URL) {
    BG_IMAGE_URL = "https://images.unsplash.com/photo-1520880867055-1e30d1cb001c?auto=format&fit=crop&w=1400&q=80";
  }

  const bgParallax = document.createElement("div");
  bgParallax.className = "background-wave-parallax";
  Object.assign(bgParallax.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    zIndex: "-2",
    pointerEvents: "none",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center center",
    backgroundColor: "#ffe082"
  });
  document.body.prepend(bgParallax);
  setBgImageWithFallback(bgParallax, BG_IMAGE_URL);

  window.addEventListener("mousemove", function(e) {
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    const mx = (e.clientX - cx) / cx;
    const my = (e.clientY - cy) / cy;
    bgParallax.style.transform = `translate(${mx * 18}px, ${my * 15}px) scale(1.035)`;
  });
  window.addEventListener("mouseleave", function() {
    bgParallax.style.transform = "";
  });

  const card = document.querySelector('.glass-card');
  const loginForm = document.getElementById("loginForm");

  // ===== Logo effect/animation =====
  const logo = document.querySelector('img[alt="KeyVault Logo"]');
  if (logo) {
    logo.style.transition = "transform 0.3s cubic-bezier(.38,2.5,.58,.95), box-shadow 0.15s";
    logo.style.cursor = "pointer";
    let rotating = false;
    let lastMouseMoveEvt = null;

    const shimmer = document.createElement("div");
    shimmer.style.position = "absolute";
    shimmer.style.top = 0;
    shimmer.style.left = 0;
    shimmer.style.width = "100%";
    shimmer.style.height = "100%";
    shimmer.style.pointerEvents = "none";
    shimmer.style.background = "linear-gradient(120deg, rgba(255,255,255,0) 70%, rgba(255,255,255,0.33) 100%)";
    shimmer.style.opacity = 0;
    shimmer.style.borderRadius = "9999px";
    shimmer.style.transition = "opacity 0.3s";
    shimmer.style.mixBlendMode = "screen";
    shimmer.style.zIndex = 2;
    logo.parentElement.style.position = "relative";
    logo.parentElement.appendChild(shimmer);

    logo.addEventListener("mousemove", e => {
      const rect = logo.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const intensity = Math.max(0, Math.min(1, (localX - rect.width / 2) / (rect.width / 2)));
      shimmer.style.opacity = Math.abs(intensity) * 0.6 + 0.26;
      shimmer.style.background = `linear-gradient(${100 + intensity * 160}deg, rgba(255,255,255,0) 60%, rgba(255,255,255,0.33) 100%)`;
      lastMouseMoveEvt = e;
    });
    logo.addEventListener("mouseleave", () => {
      shimmer.style.opacity = 0;
    });

    logo.addEventListener("mouseenter", () => {
      if (!rotating) {
        logo.style.transform = "scale(1.07) rotateZ(-7deg)";
        shimmer.style.opacity = 0.55;
      }
    });
    logo.addEventListener("mouseleave", () => {
      if (!rotating) {
        logo.style.transform = "scale(1) rotateZ(0deg)";
        shimmer.style.opacity = 0;
      }
    });

    logo.addEventListener("click", () => {
      if (rotating) return;
      rotating = true;
      logo.style.transition = "transform 0.4s cubic-bezier(.22,1.3,.36,1)";
      logo.style.transform = "scale(1.17) rotateZ(0deg)";
      setTimeout(() => {
        logo.style.transform = "scale(1.09) rotateZ(360deg)";
        setTimeout(() => {
          logo.style.transform = "scale(1.06) rotateZ(0deg)";
          setTimeout(() => {
            logo.style.transform = "scale(1) rotateZ(0deg)";
            rotating = false;
            logo.style.transition = "transform 0.3s cubic-bezier(.38,2.5,.58,.95), box-shadow 0.15s";
          }, 180);
        }, 380);
      }, 100);
    });
  }

  // ===== Parallax with Card Animate =====
  document.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const offsetX = (e.clientX - cx) / cx;
    const offsetY = (e.clientY - cy) / cy;
    if (card) {
      const tiltX = -offsetY * 10;
      const tiltY = offsetX * 10;
      card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.025)`;
      card.style.transition = "transform 0.15s cubic-bezier(.15,.85,.32,1.2)";
    }
  });

  // ===== เพิ่ม Shimmer effect เวลาชี้การ์ด =====
  if (card) {
    const cardShimmer = document.createElement("div");
    cardShimmer.style.position = "absolute";
    cardShimmer.style.top = 0;
    cardShimmer.style.left = 0;
    cardShimmer.style.width = "100%";
    cardShimmer.style.height = "100%";
    cardShimmer.style.pointerEvents = "none";
    cardShimmer.style.background = "linear-gradient(120deg, rgba(255,255,255,0) 70%, rgba(96,165,250,0.18) 100%)";
    cardShimmer.style.opacity = "0";
    cardShimmer.style.borderRadius = "inherit";
    cardShimmer.style.transition = "opacity 0.45s, background 0.24s";
    cardShimmer.style.zIndex = "5";
    card.style.position = "relative";
    card.appendChild(cardShimmer);

    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, localX / rect.width));
      const angle = 100 + percent * 80;
      cardShimmer.style.background = `linear-gradient(${angle}deg, rgba(255,255,255,0) 70%, rgba(96,165,250,0.18) 100%)`;
      cardShimmer.style.opacity = "0.63";
    });
    card.addEventListener("mouseenter", (e) => {
      cardShimmer.style.opacity = "0.63";
    });
    card.addEventListener("mouseleave", (e) => {
      cardShimmer.style.opacity = "0";
    });
  }

  document.addEventListener("mouseleave", () => {
    if (card) {
      card.style.transform = "perspective(800px) rotateX(0) rotateY(0) scale(1)";
      card.style.transition = "transform 0.4s cubic-bezier(.35,.95,.55,1.45)";
      const shimmer = card.querySelector("div");
      if (shimmer) shimmer.style.opacity = "0";
    }
    const logo = document.querySelector('img[alt="KeyVault Logo"]');
    if (logo && !logo.rotating) {
      logo.style.transform = "scale(1) rotateZ(0deg)";
      const shimmer = logo.parentElement.querySelector("div");
      if (shimmer) shimmer.style.opacity = 0;
    }
    bgParallax.style.transform = "";
  });

  function cardBounce() {
    if (!card) return;
    card.animate([
      { transform: card.style.transform || "scale(1)" },
      { transform: (card.style.transform || "") + " scale(1.04)" },
      { transform: card.style.transform || "scale(1)" }
    ], {
      duration: 330,
      easing: "cubic-bezier(.22,1.2,.36,1)"
    });
  }

  function showWarningPopup(msg = "") {
    const oldPopup = document.getElementById("login-warning-popup");
    if (oldPopup) oldPopup.remove();
    const popup = document.createElement("div");
    popup.id = "login-warning-popup";
    Object.assign(popup.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%) scale(0.97)",
      zIndex: 10000,
      background: "rgba(254,240,138,0.98)",
      border: "2.5px solid #facc15",
      borderRadius: "1.07rem",
      padding: "2.2rem 2.3rem 1.7rem 2.3rem",
      boxShadow: "0 8px 36px 0 rgba(250,202,21,0.25), 0 0 0 6px rgba(250,202,21,0.09)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minWidth: "220px",
      transition: "opacity 0.18s cubic-bezier(.37,1.5,.5,.94), transform 0.20s cubic-bezier(.18,1.45,.47,.9)",
      opacity: 0
    });
    const warnSVG = `<svg width="68" height="68" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="31" stroke="#eab308" stroke-width="3" fill="#fef08a"/>
      <rect x="29" y="19" width="6" height="21" rx="3" fill="#fbbf24"/>
      <rect x="29" y="43.5" width="6" height="6" rx="3" fill="#fbbf24"/>
    </svg>`;
    const icon = document.createElement("div");
    icon.innerHTML = warnSVG;
    icon.style.display = "block";
    icon.style.marginBottom = "0.60rem";
    icon.style.transform = "scale(0.82)";
    icon.style.opacity = "0";
    icon.style.transition = "transform 0.18s, opacity 0.18s";
    popup.appendChild(icon);
    const message = document.createElement("div");
    message.textContent = msg || "กรุณากรอกข้อมูลให้ครบถ้วน";
    message.style.color = "#ca8a04";
    message.style.fontWeight = 600;
    message.style.marginTop = "0.22rem";
    message.style.fontSize = "1.14rem";
    message.style.textAlign = "center";
    popup.appendChild(message);
    const okBtn = document.createElement("button");
    okBtn.textContent = "ตกลง";
    okBtn.style.marginTop = "1.10rem";
    okBtn.style.padding = "0.42rem 1.45rem";
    okBtn.style.background = "#fde047";
    okBtn.style.color = "#854d0e";
    okBtn.style.fontWeight = "700";
    okBtn.style.border = "none";
    okBtn.style.borderRadius = "0.69rem";
    okBtn.style.fontSize = "1.02rem";
    okBtn.style.cursor = "pointer";
    okBtn.style.transition = "background 0.15s";
    okBtn.addEventListener("mouseenter", () => { okBtn.style.background = "#facc15"; });
    okBtn.addEventListener("mouseleave", () => { okBtn.style.background = "#fde047"; });
    okBtn.onclick = () => { popup.remove(); };
    popup.appendChild(okBtn);
    document.body.appendChild(popup);

    setTimeout(() => {
      popup.style.opacity = "1";
      popup.style.transform = "translate(-50%,-50%) scale(1)";
      setTimeout(() => {
        icon.style.opacity = "1";
        icon.style.transform = "scale(1.01)";
        setTimeout(() => {
          icon.style.transform = "scale(0.97)";
          setTimeout(() => {
            icon.style.transform = "scale(1.0)";
          }, 85);
        }, 90);
      }, 120);
    }, 5);
  }

  function showResultPopup(success = true, msg = "") {
    const oldPopup = document.getElementById("login-result-popup");
    if (oldPopup) oldPopup.remove();

    const checkSVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="31" stroke="#22c55e" stroke-width="3" fill="#dcfce7"/>
      <path d="M19 34L29 44L45 24" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    const failSVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="31" stroke="#ef4444" stroke-width="3" fill="#fee2e2"/>
      <path d="M22 22L42 42M42 22L22 42" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
    </svg>`;

    const popup = document.createElement("div");
    popup.id = "login-result-popup";
    Object.assign(popup.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%) scale(0.95)",
      zIndex: 9999,
      background: "rgba(255,255,255,0.95)",
      borderRadius: "1.2rem",
      padding: "2.6rem 2.3rem 2.1rem 2.3rem",
      boxShadow: "0 8px 32px 0 rgba(0,0,0,.18)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minWidth: "200px",
      transition: "opacity 0.22s cubic-bezier(.37,1.7,.49,.91), transform 0.28s cubic-bezier(.26,1.6,.55,.78)",
      opacity: 0
    });

    const icon = document.createElement("div");
    icon.innerHTML = success ? checkSVG : failSVG;
    icon.style.display = "block";
    icon.style.marginBottom = "0.8rem";
    icon.style.transform = "scale(0.7)";
    icon.style.opacity = "0";
    icon.style.transition = "transform 0.19s, opacity 0.20s";
    popup.appendChild(icon);
    const message = document.createElement("div");
    message.textContent = msg || (success ? "Login successful!" : "Incorrect email or password.");
    message.style.color = success ? "#15803d" : "#dc2626";
    message.style.fontWeight = 500;
    message.style.marginTop = "0.1rem";
    message.style.fontSize = "1.12rem";
    message.style.textAlign = "center";
    popup.appendChild(message);

    document.body.appendChild(popup);

    setTimeout(() => {
      popup.style.opacity = "1";
      popup.style.transform = "translate(-50%,-50%) scale(1)";
      setTimeout(() => {
        icon.style.opacity = "1";
        icon.style.transform = "scale(1.08)";
        setTimeout(() => {
          icon.style.transform = "scale(1)";
        }, 110);
      }, 120);
    }, 2);

    setTimeout(() => {
      popup.style.opacity = "0";
      popup.style.transform = "translate(-50%,-50%) scale(0.9)";
      setTimeout(() => {
        popup.remove();
      }, 240);
    }, success ? 1070 : 1660);
  }

  ["email", "password"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("focus", cardBounce);
    }
  });

  // ===== ส่วนฟอร์มใหม่ (custom alert popup with animation) =====
  if (loginForm) {
    loginForm.style.color = "#fff";
    const loginInputs = loginForm.querySelectorAll("input");
    loginInputs.forEach(inp => inp.style.color = "#fff");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailEl = document.getElementById("email");
      const passwordEl = document.getElementById("password");

      const email = emailEl ? emailEl.value.trim() : "";
      const password = passwordEl ? passwordEl.value.trim() : "";

      if (!email && !password) {
        cardBounce && cardBounce();
        showWarningPopup("กรุณากรอกอีเมลและรหัสผ่าน");
        return;
      }
      if (!email) {
        cardBounce && cardBounce();
        showWarningPopup("กรุณากรอกอีเมล");
        return;
      }
      if (!password) {
        cardBounce && cardBounce();
        showWarningPopup("กรุณากรอกรหัสผ่าน");
        return;
      }
      if (!email.includes("@")) {
        cardBounce && cardBounce();
        showWarningPopup("รูปแบบอีเมลไม่ถูกต้อง (ขาด '@')");
        return;
      }

      cardBounce && cardBounce();

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
          showResultPopup(true, "Login successful!");
          if (data.token) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user || {}));
            console.log('✅ Token saved to localStorage:', data.token);
            console.log('✅ User saved:', data.user);
            console.log('✅ localStorage authToken:', localStorage.getItem('authToken'));
            setTimeout(() => {
              console.log('🔄 Redirecting to /main...');
              window.location.href = "/main";
            }, 1000);
          }
        } else {
          showResultPopup(false, data.error || "Login failed");
        }
      } catch (error) {
        showResultPopup(false, "Network error. Please try again.");
      }
    });
  } else {
    showResultPopup(false, "Login form loading failed. Please refresh this page.");
  }

  async function registerUser(userData) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { error: "Network error" };
    }
  }

  // === Sign In Popup (center perfectly without overlay) ===
  const signInBtn = document.getElementById("signInBtn");
  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      const oldPopup = document.getElementById("signin-popup");
      if (oldPopup && oldPopup.parentElement) oldPopup.parentElement.remove();

      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        pointerEvents: "none"
      });

      const popup = document.createElement("div");
      popup.id = "signin-popup";
      Object.assign(popup.style, {
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: "1rem",
        padding: "2rem 2.4rem",
        color: "#fff",
        width: "320px",
        maxWidth: "90%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        opacity: 0,
        transform: "scale(0.9)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        pointerEvents: "auto"
      });

      // --- NEW DESIGN: ฟอนต์ขาวเด่นมีเงา + ปุ่มสีเด่น gradient ---
      popup.innerHTML = `
        <h2 style="
          font-size:1.5rem;
          font-weight:700;
          margin-bottom:1.6rem;
          text-align:center;
          color:#ffffff;
          text-shadow:0 0 10px rgba(255,255,255,0.6);
        ">
          Create Account
        </h2>
        <input type="text" id="regName" placeholder="Name" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="email" id="regEmail" placeholder="Email" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="password" id="regPass" placeholder="Password" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="password" id="regConfirm" placeholder="Confirm Password" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:1.3rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <div style="display:flex;justify-content:center;gap:.8rem;">
          <button id="createAccountBtn" class="btn-primary" 
            style="
              padding:.55rem 1.4rem;
              font-weight:700;
              color:#fff;
              border:none;
              border-radius:.7rem;
              background:linear-gradient(90deg,#6366f1,#8b5cf6);
              box-shadow:0 0 12px rgba(139,92,246,0.4);
              cursor:pointer;
              transition:all .2s;
            ">Sign Up</button>
          <button id="cancelSignInBtn" class="btn-secondary" 
            style="
              padding:.55rem 1.4rem;
              font-weight:600;
              color:#fff;
              border:none;
              border-radius:.7rem;
              background:rgba(255,255,255,0.2);
              box-shadow:0 0 6px rgba(255,255,255,0.15);
              cursor:pointer;
              transition:all .2s;
            ">Cancel</button>
        </div>
      `;

      popup.style.color = "#fff";

      wrapper.appendChild(popup);
      document.body.appendChild(wrapper);

      setTimeout(() => {
        popup.style.opacity = 1;
        popup.style.transform = "scale(1)";
      }, 10);

      popup.querySelector("#cancelSignInBtn").onclick = () => {
        popup.style.opacity = 0;
        popup.style.transform = "scale(0.9)";
        setTimeout(() => wrapper.remove(), 250);
      };

      // == OTP LOGIC with improved UX ==
      popup.querySelector("#createAccountBtn").onclick = async () => {
        const name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const pass = document.getElementById("regPass").value.trim();
        const confirm = document.getElementById("regConfirm").value.trim();

        if (!name || !email || !pass || !confirm) {
          showWarningPopup("กรุณากรอกข้อมูลให้ครบ");
          return;
        }
        if (pass !== confirm) {
          showWarningPopup("รหัสผ่านไม่ตรงกัน");
          return;
        }

        // === 1. ขอ OTP จากเซิร์ฟเวอร์ ===
        const send = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        const res = await send.json();
        if (!res.success) {
          showWarningPopup("ส่งรหัส OTP ไม่สำเร็จ: " + (res.error || ""));
          return;
        }

        // === 2. แสดง popup ใส่รหัส OTP และปิด sign-in popup ทันที ===
        if (popup && wrapper) {
          popup.style.opacity = 0;
          popup.style.transform = "scale(0.9)";
          setTimeout(() => {
            if (wrapper.parentElement) wrapper.remove();
          }, 250);
        }

        // << Improved OTP popup infrastructure
        const otpWrapper = document.createElement("div");
        otpWrapper.id = "otp-bg-overlay";
        Object.assign(otpWrapper.style, {
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)",
          zIndex: "9999",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        });

        const otpPopup = document.createElement("div");
        otpPopup.id = "otp-popup";
        Object.assign(otpPopup.style, {
          background: "rgba(40,40,60,0.93)",
          borderRadius: "1rem",
          padding: "2rem 2.5rem",
          boxShadow: "0 0 20px rgba(139,92,246,0.4)",
          color: "#fff",
          textAlign: "center",
          maxWidth: "320px",
          width: "90%",
          zIndex: "10000"
        });

        otpPopup.innerHTML = `
          <h2 style="margin-bottom:1rem;text-shadow:0 0 10px rgba(255,255,255,0.5);">
            กรอกรหัส OTP
          </h2>
          <input id="otpInput" maxlength="6"
            style="width:100%;padding:.7rem;border:none;border-radius:.5rem;
            background:rgba(255,255,255,0.2);color:#fff;font-size:1.3rem;
            text-align:center;letter-spacing:.3rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:center;gap:.6rem;">
            <button id="verifyOtpBtn"
              style="padding:.5rem 1.2rem;border:none;border-radius:.6rem;
              background:linear-gradient(90deg,#22c55e,#16a34a);
              color:#fff;font-weight:600;cursor:pointer;">
              ยืนยัน
            </button>
            <button id="cancelOtpBtn"
              style="padding:.5rem 1.2rem;border:none;border-radius:.6rem;
              background:rgba(239,68,68,0.9);color:#fff;font-weight:600;cursor:pointer;">
              ยกเลิก
            </button>
          </div>
        `;

        otpWrapper.appendChild(otpPopup);
        document.body.appendChild(otpWrapper);

        function closeOtpPopup() {
          otpWrapper.style.opacity = "1";
          otpWrapper.style.transition = "opacity .22s";
          otpWrapper.style.opacity = "0";
          setTimeout(() => {
            otpWrapper.remove();
          }, 220);
        }

        document.getElementById("cancelOtpBtn").onclick = () => {
          closeOtpPopup();
        };

        document.getElementById("verifyOtpBtn").onclick = async () => {
          const otp = document.getElementById("otpInput").value.trim();
          if (!otp) {
            showWarningPopup("กรอกรหัส OTP ก่อน");
            return;
          }

          // ปิด popup/disableปุ่มระหว่างโหลด
          const btn = document.getElementById("verifyOtpBtn");
          btn.disabled = true; btn.style.opacity = 0.65; btn.style.pointerEvents = "none";

          const verify = await fetch("/api/auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp })
          });
          const data = await verify.json();
          btn.disabled = false; btn.style.opacity = ""; btn.style.pointerEvents = "";
          if (!data.success) {
            showWarningPopup("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
            return;
          }

          // ปิด otp overlay background
          closeOtpPopup();

          // === 3. ถ้า OTP ถูกต้อง → สมัครบัญชีจริง ===
          const regRes = await registerUser({ name, email, password: pass, otp: otp });
          if (regRes && !regRes.error) {
            showResultPopup(true, "สมัครสำเร็จ! ยืนยันอีเมลเรียบร้อยแล้ว");
          } else {
            showResultPopup(false, regRes.error || "เกิดข้อผิดพลาดในการสมัคร");
          }
        };
      };
    });
  }

  // (Backwards compatibility: support old "Sign up" span/text if present)
  const signUpSpan = (() => {
    const mainCard = document.querySelector('.glass-card');
    if (!mainCard) return null;
    return Array.from(mainCard.querySelectorAll('span,button,a')).find(
      el => el.textContent && el.textContent.trim().toLowerCase() === 'sign up'
    );
  })();

  if (signUpSpan) {
    signUpSpan.style.cursor = "pointer";
    signUpSpan.style.color = "#fff";

    signUpSpan.addEventListener("click", () => {
      const oldPopup = document.getElementById("signin-popup");
      if (oldPopup && oldPopup.parentElement) oldPopup.parentElement.remove();

      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        pointerEvents: "none"
      });

      const popup = document.createElement("div");
      popup.id = "signin-popup";
      Object.assign(popup.style, {
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: "1rem",
        padding: "2rem 2.4rem",
        color: "#fff",
        width: "320px",
        maxWidth: "90%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        opacity: 0,
        transform: "scale(0.9)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        pointerEvents: "auto"
      });

      popup.innerHTML = `
        <h2 style="
          font-size:1.5rem;
          font-weight:700;
          margin-bottom:1.6rem;
          text-align:center;
          color:#ffffff;
          text-shadow:0 0 10px rgba(255,255,255,0.6);
        ">
          Create Account
        </h2>
        <input type="text" id="regName" placeholder="Name" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="email" id="regEmail" placeholder="Email" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="password" id="regPass" placeholder="Password" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:.9rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <input type="password" id="regConfirm" placeholder="Confirm Password" 
          style="width:100%;padding:.7rem 1rem;
          border:none;border-radius:.7rem;
          background:rgba(255,255,255,0.18);
          color:#fff;font-weight:500;
          margin-bottom:1.3rem;
          box-shadow:inset 0 0 10px rgba(255,255,255,0.1);
          " />
        <div style="display:flex;justify-content:center;gap:.8rem;">
          <button id="createAccountBtn" class="btn-primary" 
            style="
              padding:.55rem 1.4rem;
              font-weight:700;
              color:#fff;
              border:none;
              border-radius:.7rem;
              background:linear-gradient(90deg,#6366f1,#8b5cf6);
              box-shadow:0 0 12px rgba(139,92,246,0.4);
              cursor:pointer;
              transition:all .2s;
            ">Sign Up</button>
          <button id="cancelSignInBtn" class="btn-secondary" 
            style="
              padding:.55rem 1.4rem;
              font-weight:600;
              color:#fff;
              border:none;
              border-radius:.7rem;
              background:rgba(255,255,255,0.2);
              box-shadow:0 0 6px rgba(255,255,255,0.15);
              cursor:pointer;
              transition:all .2s;
            ">Cancel</button>
        </div>
      `;

      popup.style.color = "#fff";

      wrapper.appendChild(popup);
      document.body.appendChild(wrapper);

      setTimeout(() => {
        popup.style.opacity = 1;
        popup.style.transform = "scale(1)";
      }, 10);

      popup.querySelector("#cancelSignInBtn").onclick = () => {
        popup.style.opacity = 0;
        popup.style.transform = "scale(0.9)";
        setTimeout(() => wrapper.remove(), 250);
      };

      // == OTP LOGIC with improved UX ==
      popup.querySelector("#createAccountBtn").onclick = async () => {
        const name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const pass = document.getElementById("regPass").value.trim();
        const confirm = document.getElementById("regConfirm").value.trim();

        if (!name || !email || !pass || !confirm) {
          showWarningPopup("กรุณากรอกข้อมูลให้ครบ");
          return;
        }
        if (pass !== confirm) {
          showWarningPopup("รหัสผ่านไม่ตรงกัน");
          return;
        }

        // === 1. ขอ OTP จากเซิร์ฟเวอร์ ===
        const send = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        const res = await send.json();
        if (!res.success) {
          showWarningPopup("ส่งรหัส OTP ไม่สำเร็จ: " + (res.error || ""));
          return;
        }

        // === 2. แสดง popup ใส่รหัส OTP และปิด sign-in popup ทันที ===
        if (popup && wrapper) {
          popup.style.opacity = 0;
          popup.style.transform = "scale(0.9)";
          setTimeout(() => {
            if (wrapper.parentElement) wrapper.remove();
          }, 250);
        }

        // << Improved OTP popup infrastructure
        const otpWrapper = document.createElement("div");
        otpWrapper.id = "otp-bg-overlay";
        Object.assign(otpWrapper.style, {
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(6px)",
          zIndex: "9999",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        });

        const otpPopup = document.createElement("div");
        otpPopup.id = "otp-popup";
        Object.assign(otpPopup.style, {
          background: "rgba(40,40,60,0.93)",
          borderRadius: "1rem",
          padding: "2rem 2.5rem",
          boxShadow: "0 0 20px rgba(139,92,246,0.4)",
          color: "#fff",
          textAlign: "center",
          maxWidth: "320px",
          width: "90%",
          zIndex: "10000"
        });

        otpPopup.innerHTML = `
          <h2 style="margin-bottom:1rem;text-shadow:0 0 10px rgba(255,255,255,0.5);">
            กรอกรหัส OTP
          </h2>
          <input id="otpInput" maxlength="6"
            style="width:100%;padding:.7rem;border:none;border-radius:.5rem;
            background:rgba(255,255,255,0.2);color:#fff;font-size:1.3rem;
            text-align:center;letter-spacing:.3rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:center;gap:.6rem;">
            <button id="verifyOtpBtn"
              style="padding:.5rem 1.2rem;border:none;border-radius:.6rem;
              background:linear-gradient(90deg,#22c55e,#16a34a);
              color:#fff;font-weight:600;cursor:pointer;">
              ยืนยัน
            </button>
            <button id="cancelOtpBtn"
              style="padding:.5rem 1.2rem;border:none;border-radius:.6rem;
              background:rgba(239,68,68,0.9);color:#fff;font-weight:600;cursor:pointer;">
              ยกเลิก
            </button>
          </div>
        `;

        otpWrapper.appendChild(otpPopup);
        document.body.appendChild(otpWrapper);

        function closeOtpPopup() {
          otpWrapper.style.opacity = "1";
          otpWrapper.style.transition = "opacity .22s";
          otpWrapper.style.opacity = "0";
          setTimeout(() => {
            otpWrapper.remove();
          }, 220);
        }

        document.getElementById("cancelOtpBtn").onclick = () => {
          closeOtpPopup();
        };

        document.getElementById("verifyOtpBtn").onclick = async () => {
          const otp = document.getElementById("otpInput").value.trim();
          if (!otp) {
            showWarningPopup("กรอกรหัส OTP ก่อน");
            return;
          }

          // ปิด popup/disableปุ่มระหว่างโหลด
          const btn = document.getElementById("verifyOtpBtn");
          btn.disabled = true; btn.style.opacity = 0.65; btn.style.pointerEvents = "none";

          const verify = await fetch("/api/auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp })
          });
          const data = await verify.json();
          btn.disabled = false; btn.style.opacity = ""; btn.style.pointerEvents = "";
          if (!data.success) {
            showWarningPopup("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
            return;
          }

          // ปิด otp overlay background
          closeOtpPopup();

          // === 3. ถ้า OTP ถูกต้อง → สมัครบัญชีจริง ===
          const regRes = await registerUser({ name, email, password: pass, otp: otp });
          if (regRes && !regRes.error) {
            showResultPopup(true, "สมัครสำเร็จ! ยืนยันอีเมลเรียบร้อยแล้ว");
          } else {
            showResultPopup(false, regRes.error || "เกิดข้อผิดพลาดในการสมัคร");
          }
        };
      };
    });
  }
});
