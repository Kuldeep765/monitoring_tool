let startX, startY, box;
const selections = [];

const overlay = document.getElementById("overlay");
const iframe = document.getElementById("webframe");
const plusIcon = document.getElementById("plusIcon");

document.getElementById("loadBtn").onclick = () => {
  const url = document.getElementById("urlInput").value;
  if (!url.startsWith("http")) {
    alert("Please enter a valid URL (starting with http/https)");
    return;
  }
  iframe.src = url;
  selections.length = 0;
  overlay.innerHTML = '';
  plusIcon.style.display = 'none';
};

overlay.addEventListener("mousedown", (e) => {
  const rect = overlay.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  box = document.createElement("div");
  box.className = "selection-box";
  box.style.left = `${startX}px`;
  box.style.top = `${startY}px`;
  box.style.width = "0px";
  box.style.height = "0px";
  overlay.appendChild(box);

  // Hide plus icon while drawing
  plusIcon.style.display = 'none';
});

overlay.addEventListener("mousemove", (e) => {
  if (!box) return;

  const rect = overlay.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const left = Math.min(x, startX);
  const top = Math.min(y, startY);
  const width = Math.abs(x - startX);
  const height = Math.abs(y - startY);

  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
});

overlay.addEventListener("mouseup", () => {
  if (!box) return;

  const rect = box.getBoundingClientRect();
  const parentRect = overlay.getBoundingClientRect();

  // Position plus icon near the bottom right of selection box
  plusIcon.style.left = `${rect.right - parentRect.left - 15}px`; // center plus icon on corner
  plusIcon.style.top = `${rect.bottom - parentRect.top - 15}px`;
  plusIcon.style.display = "block";

  // Store current box in a temporary variable, will be saved when plus is clicked
  plusIcon.currentBox = box;
  box = null;
});

// When user clicks plus icon, save the selection and finalize it
plusIcon.onclick = () => {
  if (!plusIcon.currentBox) return;

  const rect = plusIcon.currentBox.getBoundingClientRect();
  const parentRect = overlay.getBoundingClientRect();

  const relativeCoords = {
    left: rect.left - parentRect.left,
    top: rect.top - parentRect.top,
    width: rect.width,
    height: rect.height
  };

  selections.push(relativeCoords);

  // Mark selection box as confirmed: solid border and remove dashed style
  plusIcon.currentBox.style.border = "2px solid #007048";
  plusIcon.currentBox.style.background = "rgba(0, 112, 72, 0.4)";
  plusIcon.currentBox = null;

  // Hide plus icon until next selection
  plusIcon.style.display = "none";
};

document.getElementById("saveBtn").onclick = async () => {
  const url = document.getElementById("urlInput").value;
  if (!url || selections.length === 0) {
    alert("Please enter a URL and select at least one region.");
    return;
  }

  const res = await fetch("http://localhost:3000/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, selections })
  });

  if (res.ok) {
    alert("Regions sent to backend successfully!");
    selections.length = 0;
    overlay.innerHTML = "";
    plusIcon.style.display = "none";
  } else {
    alert("Failed to save regions.");
  }
};
