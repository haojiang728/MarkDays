(() => {
  "use strict";

  const SYMBOLS = ["✓", "✕", "★", "○", "—"];
  const elements = {};
  let calendars = [];
  let selectedId = null;
  let displayedYear;
  let displayedMonth;
  let pendingImport = null;
  let pendingSymbolDate = null;
  let pendingCalendarAction = null;
  let longPressTimer = null;
  let longPressTriggered = false;

  function byId(id) {
    const element = document.getElementById(id);
    elements[id] = element;
    return element;
  }

  function selectedCalendar() {
    return calendars.find(calendar => calendar.id === selectedId);
  }

  function showError(error) {
    const message = error && error.message ? error.message : "An unexpected error occurred.";
    elements["error-message"].textContent = message;
    elements["error-message"].hidden = false;
  }

  function clearError() {
    elements["error-message"].hidden = true;
    elements["error-message"].textContent = "";
  }

  function showStatus(message) {
    elements["status-message"].textContent = message;
    elements["status-message"].hidden = false;
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => { elements["status-message"].hidden = true; }, 4000);
  }

  function symbolFor(calendar, date) {
    return window.MarkDaysCalendar.getSymbol(calendar.marks && calendar.marks[date]);
  }

  function calendarOptionLabel(calendar, duplicateNames) {
    return duplicateNames.has(calendar.name) ? `${calendar.name} · ${calendar.id.slice(0, 6)}` : calendar.name;
  }

  function renderSelector() {
    const counts = new Map();
    calendars.forEach(calendar => counts.set(calendar.name, (counts.get(calendar.name) || 0) + 1));
    const duplicates = new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
    const select = elements["calendar-select"];
    select.replaceChildren();
    calendars.forEach(calendar => {
      const option = document.createElement("option");
      option.value = calendar.id;
      option.textContent = calendarOptionLabel(calendar, duplicates);
      select.append(option);
    });
    select.value = selectedId;
  }

  function renderCalendar() {
    const now = new Date();
    elements["month-heading"].textContent = window.MarkDaysCalendar.monthTitle(displayedYear, displayedMonth);
    const grid = elements["calendar-grid"];
    grid.replaceChildren();
    const calendar = selectedCalendar();
    for (const date of window.MarkDaysCalendar.gridDates(displayedYear, displayedMonth)) {
      const dateString = window.MarkDaysCalendar.dateKey(date);
      const currentMonth = date.getMonth() === displayedMonth && date.getFullYear() === displayedYear;
      const today = window.MarkDaysCalendar.isToday(date, now);
      const future = window.MarkDaysCalendar.isFuture(date, now);
      const symbol = symbolFor(calendar, dateString);
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = future && !symbol;
      button.className = `day-cell${currentMonth ? "" : " adjacent"}${today ? " today" : ""}${symbol ? " marked" : ""}${future ? " future" : ""}`;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}${symbol ? `, marked ${symbol}` : ", unmarked"}${today ? ", today" : ""}${future ? ", future dates cannot be marked" : ""}`);
      button.dataset.date = dateString;
      const number = document.createElement("span");
      number.className = "day-number";
      number.textContent = String(date.getDate());
      const mark = document.createElement("span");
      mark.className = "day-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = symbol;
      button.append(number, mark);
      button.addEventListener("click", handleDayClick);
      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        if (future && !symbol) return;
        openSymbolPicker(dateString);
      });
      button.addEventListener("pointerdown", () => {
        if (future && !symbol) return;
        longPressTriggered = false;
        longPressTimer = window.setTimeout(() => {
          longPressTriggered = true;
          openSymbolPicker(dateString);
        }, 550);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(type => button.addEventListener(type, () => window.clearTimeout(longPressTimer)));
      grid.append(button);
    }
    renderStats();
  }

  function renderStats() {
    const marks = selectedCalendar().marks || {};
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const entries = Object.entries(marks).filter(([, mark]) => window.MarkDaysCalendar.getSymbol(mark) !== "");
    elements["stat-all"].textContent = String(entries.length);
    elements["stat-year"].textContent = String(entries.filter(([date]) => date.startsWith(`${year}-`)).length);
    elements["stat-month"].textContent = String(entries.filter(([date]) => date.startsWith(`${month}-`)).length);
  }

  function render() {
    renderSelector();
    renderCalendar();
  }

  async function handleDayClick(event) {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    const date = event.currentTarget.dataset.date;
    const parsed = window.MarkDaysCalendar.parseDateKey(date);
    const current = symbolFor(selectedCalendar(), date);
    if (window.MarkDaysCalendar.isFuture(parsed, new Date()) && !current) return;
    if (parsed.getFullYear() !== displayedYear || parsed.getMonth() !== displayedMonth) {
      displayedYear = parsed.getFullYear();
      displayedMonth = parsed.getMonth();
    }
    await persistMark(date, current ? null : "✓");
  }

  async function persistMark(date, symbol) {
    clearError();
    if (symbol !== null && window.MarkDaysCalendar.isFuture(window.MarkDaysCalendar.parseDateKey(date), new Date())) {
      showError(new Error("Future days cannot be marked."));
      return;
    }
    try {
      const updated = await window.MarkDaysStorage.setMark(selectedId, date, symbol);
      calendars = calendars.map(calendar => calendar.id === updated.id ? updated : calendar);
      render();
    } catch (error) {
      showError(error);
    }
  }

  function openSymbolPicker(date) {
    const future = window.MarkDaysCalendar.isFuture(window.MarkDaysCalendar.parseDateKey(date), new Date());
    const isMarked = Boolean(symbolFor(selectedCalendar(), date));
    if (future && !isMarked) return;
    pendingSymbolDate = date;
    const parsed = window.MarkDaysCalendar.parseDateKey(date);
    elements["symbol-date-heading"].textContent = parsed.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    elements["symbol-dialog-copy"].textContent = future
      ? "Future days cannot be marked. You can remove this existing mark."
      : "Choose one symbol for this date, or remove its mark.";
    document.querySelectorAll("#symbol-options [data-symbol]").forEach(button => { button.disabled = future; });
    elements["remove-mark"].disabled = !isMarked;
    elements["symbol-dialog"].showModal();
  }

  async function changeMonth(offset) {
    const date = new Date(displayedYear, displayedMonth + offset, 1);
    displayedYear = date.getFullYear();
    displayedMonth = date.getMonth();
    renderCalendar();
  }

  function cleanName(value, exceptId) {
    if (!value.trim()) throw new Error("Calendar names cannot be empty or whitespace-only.");
    if (calendars.some(calendar => calendar.id !== exceptId && calendar.name === value)) {
      throw new Error("A calendar with that exact name already exists. Choose a different name to keep calendars distinct in CSV backups.");
    }
    return value;
  }

  function openCalendarDialog(action) {
    pendingCalendarAction = action;
    const dialog = elements["calendar-dialog"];
    dialog.classList.toggle("delete-mode", action === "delete");
    elements["calendar-dialog-error"].hidden = true;
    elements["calendar-dialog-error"].textContent = "";
    elements["calendar-name-input"].value = action === "rename" ? selectedCalendar().name : "";
    elements["calendar-name-label"].textContent = action === "rename" ? "New calendar name" : "Calendar name";
    elements["calendar-dialog-title"].textContent = action === "add" ? "Create a calendar" : action === "rename" ? "Rename calendar" : "Delete calendar?";
    elements["calendar-dialog-copy"].textContent = action === "delete"
      ? `Delete “${selectedCalendar().name}”? Its marks and notes will also be deleted. This cannot be undone.`
      : action === "add" ? "Create an independent calendar for another activity." : "Choose a new name for this calendar.";
    elements["calendar-dialog-submit"].textContent = action === "add" ? "Create calendar" : action === "rename" ? "Save name" : "Delete calendar";
    elements["calendar-dialog-submit"].classList.toggle("delete-submit", action === "delete");
    dialog.showModal();
    if (action !== "delete") elements["calendar-name-input"].focus();
  }

  async function submitCalendarDialog() {
    const action = pendingCalendarAction;
    clearError();
    try {
      if (action === "add") {
        const calendar = await window.MarkDaysStorage.createCalendar(cleanName(elements["calendar-name-input"].value));
        calendars.push(calendar);
        selectedId = calendar.id;
        render();
        elements["calendar-dialog"].close();
        showStatus(`Created “${calendar.name}”.`);
      } else if (action === "rename") {
        const calendar = selectedCalendar();
        const updated = await window.MarkDaysStorage.renameCalendar(calendar.id, cleanName(elements["calendar-name-input"].value, calendar.id));
        calendars = calendars.map(item => item.id === updated.id ? updated : item);
        render();
        elements["calendar-dialog"].close();
        showStatus("Calendar renamed.");
      } else if (action === "delete") {
        if (calendars.length === 1) {
          throw new Error("At least one calendar must remain. Add another calendar before deleting this one.");
        }
        const calendar = selectedCalendar();
        await window.MarkDaysStorage.deleteCalendar(calendar.id);
        calendars = calendars.filter(item => item.id !== calendar.id);
        selectedId = calendars[0].id;
        render();
        elements["calendar-dialog"].close();
        showStatus("Calendar deleted.");
      }
    } catch (error) {
      if (action === "add" || action === "rename") {
        elements["calendar-dialog-error"].textContent = error.message;
        elements["calendar-dialog-error"].hidden = false;
      } else {
        showError(error);
      }
    }
  }

  function addCalendar() {
    openCalendarDialog("add");
  }

  function renameCalendar() {
    openCalendarDialog("rename");
  }

  function removeCalendar() {
    if (calendars.length === 1) {
      showError(new Error("At least one calendar must remain. Add another calendar before deleting this one."));
      return;
    }
    openCalendarDialog("delete");
  }

  async function selectCalendar(id) {
    try {
      await window.MarkDaysStorage.saveSelectedCalendar(id);
      selectedId = id;
      render();
    } catch (error) {
      showError(error);
      elements["calendar-select"].value = selectedId;
    }
  }

  async function exportCalendars() {
    clearError();
    try {
      const data = await window.MarkDaysStorage.readAll();
      window.MarkDaysCSV.exportCSV(data.calendars, window.MarkDaysCalendar.dateKey(new Date()));
      showStatus("CSV backup downloaded.");
    } catch (error) {
      showError(error);
    }
  }

  function readImportFile(file) {
    if (!file) return;
    clearError();
    const reader = new FileReader();
    reader.onerror = () => showError(new Error("Could not read the selected file."));
    reader.onload = () => {
      try {
        pendingImport = window.MarkDaysCSV.parseImport(String(reader.result));
        const marks = pendingImport.reduce((total, calendar) => total + Object.keys(calendar.marks).length, 0);
        elements["import-summary"].textContent = `${pendingImport.length} calendar${pendingImport.length === 1 ? "" : "s"} and ${marks} marked date${marks === 1 ? "" : "s"} found. No data has been changed yet.`;
        elements["import-dialog"].showModal();
      } catch (error) {
        showError(error);
      } finally {
        elements["import-file"].value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function applyImport() {
    if (!pendingImport) return;
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    if (mode === "replace" && !window.confirm("Replace all MarkDaysDone calendars and marks with the data in this file? This cannot be undone.")) return;
    clearError();
    try {
      const imported = pendingImport.map(calendar => ({ ...calendar, id: window.MarkDaysStorage.makeId() }));
      let nextCalendars;
      let nextSelectedId;
      if (mode === "replace") {
        nextCalendars = imported;
        nextSelectedId = imported[0].id;
      } else {
        const current = await window.MarkDaysStorage.readAll();
        nextCalendars = current.calendars.map(calendar => ({ ...calendar, marks: { ...(calendar.marks || {}) } }));
        const conflictMode = document.querySelector('input[name="conflict-mode"]:checked').value;
        for (const incoming of imported) {
          const sameName = nextCalendars.filter(calendar => calendar.name === incoming.name);
          let target;
          if (sameName.length === 1) {
            target = sameName[0];
          } else {
            let name = incoming.name;
            if (sameName.length > 1) {
              const base = `${incoming.name} (imported)`;
              name = base;
              let suffix = 2;
              while (nextCalendars.some(calendar => calendar.name === name)) {
                name = `${incoming.name} (imported ${suffix})`;
                suffix += 1;
              }
            }
            target = { ...incoming, id: window.MarkDaysStorage.makeId(), name, marks: {} };
            nextCalendars.push(target);
          }
          for (const [date, mark] of Object.entries(incoming.marks)) {
            if (!Object.prototype.hasOwnProperty.call(target.marks, date) || conflictMode === "imported") target.marks[date] = mark;
          }
        }
        nextSelectedId = current.selectedId && nextCalendars.some(calendar => calendar.id === current.selectedId) ? current.selectedId : nextCalendars[0].id;
      }
      await window.MarkDaysStorage.importCalendars(nextCalendars, nextSelectedId);
      calendars = nextCalendars;
      selectedId = nextSelectedId;
      pendingImport = null;
      elements["import-dialog"].close();
      render();
      showStatus(mode === "replace" ? "Import complete. Previous calendars were replaced." : "Import merged with your existing data.");
    } catch (error) {
      showError(error);
    }
  }

  function attachEvents() {
    elements["calendar-select"].addEventListener("change", event => selectCalendar(event.target.value));
    elements["add-calendar"].addEventListener("click", addCalendar);
    elements["rename-calendar"].addEventListener("click", renameCalendar);
    elements["delete-calendar"].addEventListener("click", removeCalendar);
    elements["calendar-dialog-submit"].addEventListener("click", submitCalendarDialog);
    document.querySelectorAll("[data-close-calendar-dialog]").forEach(button => {
      button.addEventListener("click", () => elements["calendar-dialog"].close());
    });
    elements["previous-month"].addEventListener("click", () => changeMonth(-1));
    elements["next-month"].addEventListener("click", () => changeMonth(1));
    elements["today-button"].addEventListener("click", () => {
      const today = new Date();
      displayedYear = today.getFullYear();
      displayedMonth = today.getMonth();
      renderCalendar();
    });
    elements["export-button"].addEventListener("click", exportCalendars);
    elements["import-button"].addEventListener("click", () => elements["import-file"].click());
    elements["import-file"].addEventListener("change", event => readImportFile(event.target.files[0]));
    elements["apply-import"].addEventListener("click", applyImport);
    document.querySelectorAll("#symbol-options [data-symbol]").forEach(button => {
      button.addEventListener("click", async () => {
        const date = pendingSymbolDate;
        elements["symbol-dialog"].close();
        await persistMark(date, SYMBOLS.includes(button.dataset.symbol) ? button.dataset.symbol : null);
      });
    });
    elements["remove-mark"].addEventListener("click", async () => {
      const date = pendingSymbolDate;
      elements["symbol-dialog"].close();
      await persistMark(date, null);
    });
    elements["import-dialog"].addEventListener("close", () => { pendingImport = null; });
  }

  async function start() {
    ["error-message", "status-message", "calendar-select", "month-heading", "calendar-grid",
      "stat-all", "stat-year", "stat-month", "symbol-date-heading", "symbol-dialog", "symbol-dialog-copy",
      "remove-mark", "calendar-dialog", "calendar-dialog-title", "calendar-dialog-copy",
      "calendar-dialog-submit", "calendar-dialog-error", "calendar-name-label", "calendar-name-input",
      "import-dialog", "import-summary", "import-file",
      "calendar-select", "add-calendar", "rename-calendar", "delete-calendar",
      "previous-month", "next-month", "today-button", "export-button", "import-button",
      "apply-import", "conflict-options"].forEach(byId);
    attachEvents();
    try {
      const state = await window.MarkDaysStorage.initialize();
      calendars = state.calendars;
      selectedId = state.selectedId;
      const today = new Date();
      displayedYear = today.getFullYear();
      displayedMonth = today.getMonth();
      render();
      if ("serviceWorker" in navigator && window.isSecureContext) {
        navigator.serviceWorker.register("./service-worker.js").catch(error => {
          console.error("MarkDaysDone offline support could not be enabled:", error);
          showStatus("Offline support could not be enabled on this visit.");
        });
      }
    } catch (error) {
      showError(error);
      elements["calendar-select"].disabled = true;
    }
  }

  document.addEventListener("DOMContentLoaded", start, { once: true });
})();
