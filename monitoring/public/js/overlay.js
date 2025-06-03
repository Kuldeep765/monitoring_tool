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

canvas.addEventListener("mousedown", e => {
  isDrawing = true;
  startX = e.offsetX;
  startY = e.offsetY;
});

canvas.addEventListener("mouseup", e => {
  isDrawing = false;
  const rect = {
    left: Math.min(startX, e.offsetX),
    top: Math.min(startY, e.offsetY),
    width: Math.abs(e.offsetX - startX),
    height: Math.abs(e.offsetY - startY)
  };
  selections.push(rect);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, selections })
  });

  if (response.ok) {
    alert("Saved! You can now compare.");
  } else {
    alert("Failed to save.");
  }
});
