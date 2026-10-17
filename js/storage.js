/* IndexedDB is the sole persistent store; all mutations resolve only after transaction completion. */
(() => {
  "use strict";

  const DATABASE_NAME = "markdays";
  const DATABASE_VERSION = 1;
  let databasePromise;

  function openDatabase() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("This browser does not support IndexedDB, so MarkDays cannot save data."));
    }
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("calendars")) db.createObjectStore("calendars", { keyPath: "id" });
          if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        request.onerror = () => reject(request.error || new Error("Could not open local storage."));
        request.onblocked = () => reject(new Error("MarkDays storage is blocked by another open tab. Close other MarkDays tabs and reload."));
      });
    }
    return databasePromise;
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("The storage operation was cancelled."));
      transaction.onerror = () => reject(transaction.error || new Error("The storage operation failed."));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not read local data."));
    });
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function isValidDateKey(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const [year, month, day] = date.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= monthLengths[month - 1];
  }

  function localDateKey(date) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function copyCalendar(calendar) {
    return { ...calendar, marks: { ...(calendar.marks || {}) } };
  }

  async function initialize() {
    const db = await openDatabase();
    const tx = db.transaction(["calendars", "settings"], "readwrite");
    const calendars = tx.objectStore("calendars");
    const settings = tx.objectStore("settings");
    const [allCalendars, selectedSetting] = await Promise.all([
      requestResult(calendars.getAll()),
      requestResult(settings.get("selectedCalendarId"))
    ]);

    let available = allCalendars;
    if (available.length === 0) {
      const first = { id: makeId(), name: "My Calendar", createdAt: new Date().toISOString(), marks: {} };
      calendars.add(first);
      available = [first];
    }
    let selectedId = selectedSetting && selectedSetting.value;
    if (!available.some(calendar => calendar.id === selectedId)) {
      selectedId = available[0].id;
      settings.put({ key: "selectedCalendarId", value: selectedId });
    }
    await transactionDone(tx);
    return { calendars: available.map(copyCalendar), selectedId };
  }

  async function saveSelectedCalendar(id) {
    const db = await openDatabase();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key: "selectedCalendarId", value: id });
    await transactionDone(tx);
  }

  async function createCalendar(name) {
    const calendar = { id: makeId(), name, createdAt: new Date().toISOString(), marks: {} };
    const db = await openDatabase();
    const tx = db.transaction(["calendars", "settings"], "readwrite");
    tx.objectStore("calendars").add(calendar);
    tx.objectStore("settings").put({ key: "selectedCalendarId", value: calendar.id });
    await transactionDone(tx);
    return copyCalendar(calendar);
  }

  async function renameCalendar(id, name) {
    const db = await openDatabase();
    const tx = db.transaction("calendars", "readwrite");
    const store = tx.objectStore("calendars");
    const calendar = await requestResult(store.get(id));
    if (!calendar) throw new Error("That calendar no longer exists. Reload and try again.");
    calendar.name = name;
    store.put(calendar);
    await transactionDone(tx);
    return copyCalendar(calendar);
  }

  async function deleteCalendar(id) {
    const db = await openDatabase();
    const tx = db.transaction(["calendars", "settings"], "readwrite");
    const store = tx.objectStore("calendars");
    const [allCalendars, currentSetting] = await Promise.all([
      requestResult(store.getAll()),
      requestResult(tx.objectStore("settings").get("selectedCalendarId"))
    ]);
    if (allCalendars.length <= 1) {
      await transactionDone(tx);
      throw new Error("At least one calendar must remain.");
    }
    store.delete(id);
    if (currentSetting && currentSetting.value === id) {
      const next = allCalendars.find(calendar => calendar.id !== id);
      tx.objectStore("settings").put({ key: "selectedCalendarId", value: next.id });
    }
    await transactionDone(tx);
  }

  async function setMark(calendarId, date, symbol) {
    if (!isValidDateKey(date)) throw new Error("Mark dates must be real dates in YYYY-MM-DD format.");
    if (symbol !== null && (typeof symbol !== "string" || !symbol.trim())) {
      throw new Error("A mark must contain a non-empty symbol.");
    }
    if (symbol !== null && date > localDateKey(new Date())) throw new Error("Future days cannot be marked.");
    const db = await openDatabase();
    const tx = db.transaction("calendars", "readwrite");
    const store = tx.objectStore("calendars");
    const calendar = await requestResult(store.get(calendarId));
    if (!calendar) throw new Error("That calendar no longer exists. Reload and try again.");
    calendar.marks = calendar.marks || {};
    if (symbol === null) delete calendar.marks[date];
    else {
      const existing = calendar.marks[date];
      calendar.marks[date] = existing && typeof existing === "object" && typeof existing.note === "string"
        ? { symbol, note: existing.note }
        : symbol;
    }
    store.put(calendar);
    await transactionDone(tx);
    return copyCalendar(calendar);
  }

  async function readAll() {
    const db = await openDatabase();
    const tx = db.transaction(["calendars", "settings"], "readonly");
    const [calendars, selected] = await Promise.all([
      requestResult(tx.objectStore("calendars").getAll()),
      requestResult(tx.objectStore("settings").get("selectedCalendarId"))
    ]);
    await transactionDone(tx);
    return { calendars: calendars.map(copyCalendar), selectedId: selected && selected.value };
  }

  async function importCalendars(calendars, selectedId) {
    const today = localDateKey(new Date());
    for (const calendar of calendars) {
      for (const date of Object.keys(calendar.marks || {})) {
        if (!isValidDateKey(date)) throw new Error("Imported marks must use real dates in YYYY-MM-DD format.");
        if (date > today) throw new Error("Imported data cannot contain marks for future days.");
      }
    }
    const db = await openDatabase();
    const tx = db.transaction(["calendars", "settings"], "readwrite");
    const store = tx.objectStore("calendars");
    store.clear();
    for (const calendar of calendars) store.put(copyCalendar(calendar));
    tx.objectStore("settings").put({ key: "selectedCalendarId", value: selectedId || calendars[0].id });
    await transactionDone(tx);
  }

  window.MarkDaysStorage = {
    initialize,
    saveSelectedCalendar,
    createCalendar,
    renameCalendar,
    deleteCalendar,
    setMark,
    readAll,
    importCalendars,
    makeId
  };
})();
