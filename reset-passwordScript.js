// ResetPasswordScript.js
document.addEventListener("DOMContentLoaded", () => {
    // ===== BG: ใช้ background image เดียวกับหน้า login =====
    
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
  
    // ใช้ BG_IMAGE_URL เดียวกับหน้า login
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
  
    // Parallax effect
    window.addEventListener("mousemove", function(e) {
      const cx = window.innerWidth/2, cy = window.innerHeight/2;
      const mx = (e.clientX - cx) / cx;
      const my = (e.clientY - cy) / cy;
      bgParallax.style.transform = `translate(${mx * 18}px, ${my * 15}px) scale(1.035)`;
    });
    
    window.addEventListener("mouseleave", function() {
      bgParallax.style.transform = "";
    });
  
    // ===== Card Effects =====
    const card = document.querySelector('.glass-card');
  
    // Parallax card effect
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
  
    // Add shimmer effect to card
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
      
      card.addEventListener("mouseenter", () => {
        cardShimmer.style.opacity = "0.63";
      });
      
      card.addEventListener("mouseleave", () => {
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
      bgParallax.style.transform = "";
    });
  
    // ===== Password Validation & UI Effects =====
    function initPasswordValidation() {
      const newPass = document.getElementById("newPass");
      const confirmPass = document.getElementById("confirmPass");
      const resetBtn = document.getElementById("resetBtn");
  
      function validatePasswords() {
        const password = newPass.value.trim();
        const confirm = confirmPass.value.trim();
        
        if (password && confirm && password !== confirm) {
          showStatus("❌ รหัสผ่านไม่ตรงกัน", "error");
          return false;
        }
        
        if (password && password.length < 6) {
          showStatus("❌ รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร", "error");
          return false;
        }
        
        if (password && confirm && password === confirm && password.length >= 6) {
          showStatus("✅ รหัสผ่านพร้อมใช้งาน", "success");
          return true;
        }
        
        clearStatus();
        return false;
      }
  
      newPass.addEventListener('input', validatePasswords);
      confirmPass.addEventListener('input', validatePasswords);
  
      // Add focus effects
      [newPass, confirmPass].forEach(input => {
        input.addEventListener('focus', () => {
          input.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50');
        });
        
        input.addEventListener('blur', () => {
          input.classList.remove('ring-2', 'ring-blue-500', 'ring-opacity-50');
        });
      });
    }
  
    // ===== Reset Password Logic =====
    function initResetLogic() {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const statusEl = document.getElementById("status");
      const tokenInfo = document.getElementById("tokenInfo");
      const resetBtn = document.getElementById("resetBtn");
  
      console.log('🔑 Token from URL:', token);
  
      // Check token
      if (!token) {
        showStatus("❌ ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ", "error");
        resetBtn.disabled = true;
        resetBtn.classList.add('opacity-50', 'cursor-not-allowed');
        resetBtn.textContent = "Invalid Link";
      } else {
        tokenInfo.classList.remove("hidden");
        // Add pulsing animation to token info
        tokenInfo.style.animation = "pulse 2s infinite";
      }
  
      // Reset button click handler
      resetBtn.addEventListener("click", async () => {
        const newPassword = document.getElementById("newPass").value.trim();
        const confirmPassword = document.getElementById("confirmPass").value.trim();
  
        if (!newPassword) {
          showStatus("❌ กรุณากรอกรหัสผ่านใหม่", "error");
          addShakeAnimation(document.getElementById("newPass"));
          return;
        }
  
        if (!confirmPassword) {
          showStatus("❌ กรุณายืนยันรหัสผ่าน", "error");
          addShakeAnimation(document.getElementById("confirmPass"));
          return;
        }
  
        if (newPassword !== confirmPassword) {
          showStatus("❌ รหัสผ่านไม่ตรงกัน", "error");
          addShakeAnimation(document.getElementById("confirmPass"));
          return;
        }
  
        if (newPassword.length < 6) {
          showStatus("❌ รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร", "error");
          addShakeAnimation(document.getElementById("newPass"));
          return;
        }
  
        if (!token) {
          showStatus("❌ ลิงก์รีเซ็ตไม่ถูกต้อง", "error");
          return;
        }
  
        // Show loading state
        resetBtn.disabled = true;
        resetBtn.innerHTML = `
          <div class="flex items-center justify-center space-x-2">
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>กำลังรีเซ็ต...</span>
          </div>
        `;
  
        try {
          showStatus("⏳ กำลังรีเซ็ตรหัสผ่าน...", "loading");
  
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword })
          });
  
          const data = await res.json();
  
          if (res.ok) {
            showStatus("✅ รีเซ็ตรหัสผ่านสำเร็จ! กำลังนำคุณไปหน้า Login...", "success");
            resetBtn.innerHTML = "✅ สำเร็จ!";
            resetBtn.classList.add('bg-green-500', 'hover:bg-green-600');
            
            // Redirect after 2 seconds
            setTimeout(() => {
              window.location.href = "/";
            }, 2000);
          } else {
            showStatus("❌ " + (data.error || "รีเซ็ตรหัสผ่านไม่สำเร็จ"), "error");
            resetBtn.disabled = false;
            resetBtn.innerHTML = "Reset Password";
            addShakeAnimation(resetBtn);
          }
        } catch (error) {
          console.error("Reset error:", error);
          showStatus("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองอีกครั้ง", "error");
          resetBtn.disabled = false;
          resetBtn.innerHTML = "Reset Password";
          addShakeAnimation(resetBtn);
        }
      });
    }
  
    // ===== Helper Functions =====
    function showStatus(message, type) {
      const statusEl = document.getElementById("status");
      statusEl.textContent = message;
      statusEl.classList.remove("hidden", "bg-red-500", "bg-green-500", "bg-blue-500", "bg-opacity-20", "text-red-300", "text-green-300", "text-blue-300");
      
      switch(type) {
        case "error":
          statusEl.classList.add("bg-red-500", "bg-opacity-20", "text-red-300", "border", "border-red-400", "border-opacity-30");
          break;
        case "success":
          statusEl.classList.add("bg-green-500", "bg-opacity-20", "text-green-300", "border", "border-green-400", "border-opacity-30");
          break;
        case "loading":
          statusEl.classList.add("bg-blue-500", "bg-opacity-20", "text-blue-300", "border", "border-blue-400", "border-opacity-30");
          break;
      }
    }
  
    function clearStatus() {
      const statusEl = document.getElementById("status");
      statusEl.classList.add("hidden");
    }
  
    function addShakeAnimation(element) {
      element.classList.add('animate-shake');
      setTimeout(() => {
        element.classList.remove('animate-shake');
      }, 500);
    }
  
    // Add custom animations to CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
      .animate-shake {
        animation: shake 0.3s ease-in-out;
      }
    `;
    document.head.appendChild(style);
  
    // Initialize everything
    initPasswordValidation();
    initResetLogic();
  
    // Add enter key support
    document.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById("resetBtn").click();
      }
    });
  });