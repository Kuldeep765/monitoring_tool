const canvas = document.getElementById("selectorCanvas");
const iframe = document.getElementById("webview");
const selections = [];

const ctx = canvas.getContext("2d");
let isDrawing = false;
let startX, startY;

// Update canvas size and position relative to iframe
function updateCanvasSizeAndPosition() {
  const iframeRect = iframe.getBoundingClientRect();

  canvas.width = iframeRect.width;
  canvas.height = iframeRect.height;

  canvas.style.position = "absolute";
  canvas.style.top = iframeRect.top + window.scrollY + "px";
  canvas.style.left = iframeRect.left + window.scrollX + "px";
  canvas.style.zIndex = 9999;
}

updateCanvasSizeAndPosition();

window.addEventListener("resize", updateCanvasSizeAndPosition);
window.addEventListener("scroll", updateCanvasSizeAndPosition);

// Get mouse coordinates relative to canvas
function getRelativeCoords(e) {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - canvasRect.left,
    y: e.clientY - canvasRect.top,
  };
}

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  const coords = getRelativeCoords(e);
  startX = coords.x;
  startY = coords.y;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const coords = getRelativeCoords(e);
  const currentX = coords.x;
  const currentY = coords.y;

  const width = currentX - startX;
  const height = currentY - startY;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, width, height);
});

canvas.addEventListener("mouseup", (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const coords = getRelativeCoords(e);
  const endX = coords.x;
  const endY = coords.y;

  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width > 0 && height > 0) {
    selections.push({ left, top, width, height });
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  for (const sel of selections) {
    ctx.strokeRect(sel.left, sel.top, sel.width, sel.height);
  }
});

// Save button click handler
document.getElementById("saveBtn").addEventListener("click", async () => {
  if (selections.length === 0) {
    alert("Please select at least one region.");
    return;
  }
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, selections }),
  });

  if (response.ok) {
    alert("Saved! Screenshots captured.");
  } else {
    alert("Failed to save.");
  }
});

 