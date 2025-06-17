  // overlay.js
  const iframe = document.getElementById("webview");
  let selections = [];
  let isDrawing = false;
  let startX, startY;

  iframe.addEventListener("load", () => {
    console.log("🌐 Iframe loaded, injecting canvas");

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Avoid duplicate canvases
      if (!iframeDoc.getElementById("selectorCanvas")) {
        const canvas = iframeDoc.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.id = "selectorCanvas";
        canvas.style.position = "absolute";
        canvas.style.top = 0;
        canvas.style.left = 0;
        canvas.style.zIndex = 9999;
        canvas.style.pointerEvents = "auto"; // allow interaction
        iframeDoc.body.appendChild(canvas);

        window.iframeCanvas = canvas;
        window.iframeCtx = ctx;

        // Setup sizing and redrawing
        function resizeCanvas() {
          canvas.width = iframeDoc.documentElement.scrollWidth;
          canvas.height = iframeDoc.documentElement.scrollHeight;
          redrawSelections();
        }

        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(iframeDoc.body);
        iframe.contentWindow.addEventListener("scroll", () =>
          requestAnimationFrame(redrawSelections)
        );
        resizeCanvas();

        // Utility to redraw current selections
        function redrawSelections() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          selections.forEach((sel) => {
            ctx.strokeRect(sel.left, sel.top, sel.width, sel.height);
          });
        }
        window.redrawSelections = redrawSelections;

        // Coordinate helpers
        function getRelativeCoords(e) {
          const rect = canvas.getBoundingClientRect();
          return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
        }

        // Mouse events
        canvas.addEventListener("mousedown", (e) => {
          isDrawing = true;
          const c = getRelativeCoords(e);
          startX = c.x;
          startY = c.y;
        });
        canvas.addEventListener("mousemove", (e) => {
          if (!isDrawing) return;
          const c = getRelativeCoords(e);
          redrawSelections();
          ctx.strokeStyle = "blue";
          ctx.lineWidth = 2;
          ctx.strokeRect(startX, startY, c.x - startX, c.y - startY);
        });
        canvas.addEventListener("mouseup", (e) => {
          if (!isDrawing) return;
          isDrawing = false;
          const c = getRelativeCoords(e);
          const left = Math.min(startX, c.x);
          const top = Math.min(startY, c.y);
          const width = Math.abs(c.x - startX);
          const height = Math.abs(c.y - startY);
          if (width > 5 && height > 5) {
            selections.push({ left, top, width, height });
            redrawSelections();
          }
        });

        // Right-click to delete region
        canvas.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const c = getRelativeCoords(e);
          const idx = selections.findIndex(
            (sel) =>
              c.x >= sel.left &&
              c.x <= sel.left + sel.width &&
              c.y >= sel.top &&
              c.y <= sel.top + sel.height
          );
          if (idx !== -1 && confirm("Delete this selection region?")) {
            selections.splice(idx, 1);
            redrawSelections();
          }
        });
      }
    } catch (e) {
      console.warn("⚠️ Iframe injection failed:", e);
    }
  });

  // Save, clear, get, set functions exposed globally
  window.getSelections = () => selections.map((s) => ({ ...s }));
  window.clearSelections = () => {
    selections = [];
    window.iframeCtx.clearRect(
      0,
      0,
      window.iframeCanvas.width,
      window.iframeCanvas.height
    );
  };
  window.setSelections = (newSel) => {
    selections = [...newSel];
    window.redrawSelections();
  };
  window.saveSelections = async () => {
    if (!selections.length)
      return alert("Please select at least one region to monitor.");
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const scroll = {
      scrollX: iframeDoc.documentElement.scrollLeft || iframeDoc.body.scrollLeft,
      scrollY: iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop,
    };
    const currentUrl = window.url || iframe.src;
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: currentUrl,
          selections,
          iframeScroll: scroll,
        }),
      });
      if (res.ok) {
        const resJson = await res.json();
        alert(`✅ Saved!\nURL: ${currentUrl}\nRegions: ${selections.length}`);
      } else {
        const err = await res.json();
        alert(`❌ Failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    }
  };
  function initializeIframeCanvas() {
    const iframe = document.getElementById("webview");
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    if (!iframeDoc || iframeDoc.getElementById("selectorCanvas")) return;

    const canvas = iframeDoc.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.id = "selectorCanvas";
    canvas.style.position = "absolute";
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.zIndex = 9999;
    canvas.style.pointerEvents = "auto";
    iframeDoc.body.appendChild(canvas);

    window.iframeCanvas = canvas;
    window.iframeCtx = ctx;

    function resizeCanvas() {
      canvas.width = iframeDoc.documentElement.scrollWidth;
      canvas.height = iframeDoc.documentElement.scrollHeight;
      redrawSelections();
    }

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(iframeDoc.body);
    iframe.contentWindow.addEventListener("scroll", () =>
      requestAnimationFrame(redrawSelections)
    );
    resizeCanvas();

    function getRelativeCoords(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function redrawSelections() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      for (const sel of selections) {
        ctx.strokeRect(sel.left, sel.top, sel.width, sel.height);
      }
    }

    window.redrawSelections = redrawSelections;

    canvas.addEventListener("mousedown", (e) => {
      isDrawing = true;
      const c = getRelativeCoords(e);
      startX = c.x;
      startY = c.y;
    });
    canvas.addEventListener("mousemove", (e) => {
      if (!isDrawing) return;
      const c = getRelativeCoords(e);
      redrawSelections();
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, startY, c.x - startX, c.y - startY);
    });
    canvas.addEventListener("mouseup", (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      const c = getRelativeCoords(e);
      const left = Math.min(startX, c.x);
      const top = Math.min(startY, c.y);
      const width = Math.abs(c.x - startX);
      const height = Math.abs(c.y - startY);
      if (width > 5 && height > 5) {
        selections.push({ left, top, width, height });
        redrawSelections();
      }
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const c = getRelativeCoords(e);
      const idx = selections.findIndex(
        (sel) =>
          c.x >= sel.left &&
          c.x <= sel.left + sel.width &&
          c.y >= sel.top &&
          c.y <= sel.top + sel.height
      );
      if (idx !== -1 && confirm("Delete this region?")) {
        selections.splice(idx, 1);
        redrawSelections();
      }
    });

    console.log("✅ Canvas initialized inside iframe.");
  }
  document.getElementById("webview").addEventListener("load", () => {
    setTimeout(() => {
      initializeIframeCanvas();
      // Restore selections if any (already handled in preview.ejs)
    }, 300);
  });
  console.log("🎯 overlay.js — ready inside iframe!");
