const button = document.querySelector("#copy-pet-prompt");
const prompt = document.querySelector("#codex-pet-prompt");
const status = document.querySelector("#pet-prompt-status");

if (button && prompt && status && navigator.clipboard?.writeText) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(prompt.value.trim());
      status.textContent = "Copied.";
    } catch {
      prompt.focus();
      prompt.select();
      status.textContent = "Prompt selected. Use your keyboard or menu to copy it.";
    }
  });
}
