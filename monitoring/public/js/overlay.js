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

// Get iframe's internal scroll position
function getIframeScrollPosition() {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    return {
      scrollX: iframeDoc.documentElement.scrollLeft || iframeDoc.body.scrollLeft || 0,
      scrollY: iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop || 0
    };
  } catch (e) {
    console.warn("Cannot access iframe scroll position (CORS):", e);
    return { scrollX: 0, scrollY: 0 };
  }
}

// Get mouse coordinates relative to canvas
function getRelativeCoords(e) {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - canvasRect.left,
    y: e.clientY - canvasRect.top,
  };
}

function canvasToWebpageCoords(canvasX, canvasY) {
  const iframeScroll = getIframeScrollPosition();
  return {
    x: canvasX + iframeScroll.scrollX,
    y: canvasY + iframeScroll.scrollY
  };
}

// Convert webpage coordinates to canvas coordinates (for display)
function webpageToCanvasCoords(webpageX, webpageY) {
  const iframeScroll = getIframeScrollPosition();
  return {
    x: webpageX - iframeScroll.scrollX,
    y: webpageY - iframeScroll.scrollY
  };
}

// Redraw all selections on canvas
function redrawSelections() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  
  for (const sel of selections) {
    // Convert webpage coordinates back to canvas coordinates for display
    const canvasCoords = webpageToCanvasCoords(sel.left, sel.top);
    const canvasEndCoords = webpageToCanvasCoords(sel.left + sel.width, sel.top + sel.height);
    
    const displayWidth = canvasEndCoords.x - canvasCoords.x;
    const displayHeight = canvasEndCoords.y - canvasCoords.y;
    
    // Only draw if the selection is visible in current viewport
    if (canvasCoords.x < canvas.width && canvasCoords.y < canvas.height &&
        canvasCoords.x + displayWidth > 0 && canvasCoords.y + displayHeight > 0) {
      ctx.strokeRect(canvasCoords.x, canvasCoords.y, displayWidth, displayHeight);
    }
  }
}

// Listen for iframe scroll events to update selection display
iframe.addEventListener('load', function() {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.addEventListener('scroll', redrawSelections);
    iframe.contentWindow.addEventListener('scroll', redrawSelections);
  } catch (e) {
    console.warn("Cannot listen to iframe scroll events (CORS):", e);
  }
});

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

  // Clear and redraw existing selections
  redrawSelections();
  
  ctx.strokeStyle = "blue"; 
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, width, height);
});

canvas.addEventListener("mouseup", (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const coords = getRelativeCoords(e);
  const endX = coords.x;
  const endY = coords.y;

  const canvasLeft = Math.min(startX, endX);
  const canvasTop = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width > 0 && height > 0) {
    // Convert canvas coordinates to webpage coordinates
    const webpageCoords = canvasToWebpageCoords(canvasLeft, canvasTop);
    
    console.log("Canvas coords:", { left: canvasLeft, top: canvasTop, width, height });
    console.log("Webpage coords:", { left: webpageCoords.x, top: webpageCoords.y, width, height });
    console.log("Iframe scroll:", getIframeScrollPosition());
    
    selections.push({ 
      left: webpageCoords.x, 
      top: webpageCoords.y, 
      width, 
      height 
    });
  }

  redrawSelections();
});

// Clear selections button
document.getElementById("clearBtn")?.addEventListener("click", () => {
  selections.length = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Save button click handler
document.getElementById("saveBtn").addEventListener("click", async () => {
  if (selections.length === 0) {
    alert("Please select at least one region.");
    return;
  }

  console.log("Saving selections:", selections);
  
  // Get current iframe scroll position to send to server
  const iframeScroll = getIframeScrollPosition();
  
  const response = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      url, 
      selections,
      iframeScroll
    }),
  });

  if (response.ok) {
    alert("Saved! Screenshots captured.");
  } else {
    const error = await response.text();
    alert(`Failed to save: ${error}`);
  }
});

// Debug function to show current coordinates and scroll position
function debugCoordinates() {
  const iframeScroll = getIframeScrollPosition();
  console.log("Current iframe scroll:", iframeScroll);
  console.log("Current selections:", selections);
}

// Add debug button if it exists
document.getElementById("debugBtn")?.addEvent