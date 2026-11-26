const button = document.querySelector("#copy-pet-prompt");
const prompt = document.querySelector("#codex-pet-prompt");
const status = document.querySelector("#pet-prompt-status");

if (button && prompt && status && navigator.clipboard?.writeText) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(prompt.textContent.trim());
      status.textContent = "Copied.";
    } catch {
      status.textContent = "Could not copy automatically. Select and copy the prompt above.";
    }
  });
}
