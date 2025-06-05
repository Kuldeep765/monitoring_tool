const canvas = document.getElementById("selectorCanvas");
const iframe = document.getElementById("webview");
const selections = [];

canvas.width = iframe.offsetWidth;
canvas.height = iframe.offsetHeight;
canvas.style.position = "absolute";
canvas.style.top = iframe.offsetTop + "px";
canvas.style.left = iframe.offsetLeft + "px";
canvas.style.zIndex = 999;

const ctx = canvas.getContext("2d");
let isDrawing = false;
let startX, startY;

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const currentX = e.pageX;
  const currentY = e.pageY;

  const width = currentX - startX;
  const height = currentY - startY;

  canvas.style.left = window.scrollX + "px";
  canvas.style.top = window.scrollY + "px";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.strokeRect(startX - window.scrollX, startY - window.scrollY, width, height);
});


canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  startX = e.pageX;
  startY = e.pageY;
});

canvas.addEventListener("mouseup", e => {
  isDrawing = false;
  const endX = e.pageX;
  const endY = e.pageY;

  const rect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };
  selections.push(rect);

  // Draw all selections so far
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  for (const sel of selections) {
    ctx.strokeRect(sel.left - window.scrollX, sel.top - window.scrollY, sel.width, sel.height);
  }
});


document.getElementById("saveBtn").addEventListener("click", async () => {
  if (selections.length === 0) {
    alert("Please select at least one region.");
    return;
  }
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, selections })
  });

  if (response.ok) {
    alert("Saved! Screenshots captured.");
  } else {
    alert("Failed to save.");
  }
});
