const canvas = document.getElementById("selectorCanvas");
const iframe = document.getElementById("webview");
let selections = [];

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
  
  // Update status display
  updateSelectionStatus();
}

// Clear selections function (exposed globally)
window.clearSelections = function() {
  console.log("🗑️ Clearing selections");
  selections.length = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateSelectionStatus();
};

// Get current selections (exposed globally)
window.getSelections = function() {
  return [...selections]; // Return a copy
};

// Set selections (exposed globally) - for restoring when switching URLs
window.setSelections = function(newSelections) {
  console.log("🔄 Setting selections:", newSelections);
  selections = [...newSelections]; // Create a copy
  redrawSelections();
};

// Save selections function (exposed globally)
window.saveSelections = async function() {
  if (selections.length === 0) {
    alert("Please select at least one region to monitor.");
    return;
  }

  // Get current URL
  const currentUrl = window.url || url;
  console.log("💾 Saving selections for URL:", currentUrl);
  console.log("Selections:", selections);
  
  // Get current iframe scroll position to send to server
  const iframeScroll = getIframeScrollPosition();
  
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        url: currentUrl, 
        selections,
        iframeScroll
      }),
    });

    if (response.ok) {
      const result = await response.json();
      alert(`✅ Saved successfully!\n\nURL: ${currentUrl}\nRegions: ${selections.length}\nScreenshots captured.`);
      
      // Optionally clear selections after successful save
      // window.clearSelections();
    } else {
      const error = await response.json();
      alert(`❌ Failed to save: ${error.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error("Save error:", error);
    alert(`❌ Network error: ${error.message}`);
  }
};

// Listen for iframe scroll events to update selection display
iframe.addEventListener('load', function() {
  console.log("🌐 Iframe loaded, setting up scroll listeners");
  
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.addEventListener('scroll', redrawSelections);
    iframe.contentWindow.addEventListener('scroll', redrawSelections);
  } catch (e) {
    console.warn("Cannot listen to iframe scroll events (CORS):", e);
  }
  
  // Don't automatically clear selections on load - let the parent handle this
  // The parent will decide whether to clear or restore selections
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

  if (width > 5 && height > 5) { // Minimum size threshold
    // Convert canvas coordinates to webpage coordinates
    const webpageCoords = canvasToWebpageCoords(canvasLeft, canvasTop);
    
    console.log("➕ Adding selection:");
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
  if (selections.length > 0 && confirm("Clear all selections for this URL?")) {
    window.clearSelections();
  }
});

// Add right-click context menu to delete individual selections
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  
  const coords = getRelativeCoords(e);
  const webpageCoords = canvasToWebpageCoords(coords.x, coords.y);
  
  // Find if click is inside any selection
  const clickedSelectionIndex = selections.findIndex(sel => {
    return webpageCoords.x >= sel.left && 
           webpageCoords.x <= sel.left + sel.width &&
           webpageCoords.y >= sel.top && 
           webpageCoords.y <= sel.top + sel.height;
  });
  
  if (clickedSelectionIndex !== -1) {
    if (confirm("Delete this selection region?")) {
      console.log("🗑️ Deleting selection:", selections[clickedSelectionIndex]);
      selections.splice(clickedSelectionIndex, 1);
      redrawSelections();
    }
  }
});

// Add keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Escape key to clear current drawing
  if (e.key === "Escape" && isDrawing) {
    isDrawing = false;
    redrawSelections();
  }
  
  // Delete key to clear all selections
  if (e.key === "Delete" && !isDrawing) {
    if (selections.length > 0 && confirm("Clear all selections?")) {
      window.clearSelections();
    }
  }
  
  // Ctrl+S to save (prevent default browser save)
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    window.saveSelections();
  }
});

// Status display
function updateSelectionStatus() {
  const statusElement = document.getElementById("selectionStatus");
  if (statusElement) {
    statusElement.textContent = `${selections.length} region(s) selected`;
  }
}

// Debug function to show current coordinates and scroll position
function debugCoordinates() {
  const iframeScroll = getIframeScrollPosition();
  console.log("📊 Debug Info:");
  console.log("Current iframe scroll:", iframeScroll);
  console.log("Current selections:", selections);
  console.log("Current URL:", window.url || url);
  console.log("Canvas size:", { width: canvas.width, height: canvas.height });
}

// Add debug button if it exists
document.getElementById("debugBtn")?.addEventListener("click", debugCoordinates);

// Initial setup
document.addEventListener("DOMContentLoaded", () => {
  updateSelectionStatus();
  console.log("🎯 Enhanced overlay.js loaded - Ready for region selection!");
});

// Expose debug function globally for testing
window.debugCoordinates = debugCoordinates;

console.log("🎯 Enhanced overlay.js loaded with improved selection management!");